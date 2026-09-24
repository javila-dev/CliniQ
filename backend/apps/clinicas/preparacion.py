"""Estado de "Preparar mi clínica".

El progreso no se guarda: se calcula desde los datos reales, así que no se pierde al cerrar
sesión y nunca afirma algo que no es cierto. Lo único que se guarda es qué vende la clínica y
qué pasos opcionales se omitieron (``Clinica.preparacion``).
"""
from rest_framework.exceptions import ValidationError

from apps.clinicas.models import Sede, Servicio, TratamientoCatalogo

MODELOS_DE_VENTA = ("procedimientos", "tratamientos", "ambos")
PASOS_OPCIONALES = ("consentimientos", "recepcion", "tratamientos", "migrar")

# Solo dos niveles: quien atiende lo decide el indicador "atiende pacientes" (es_profesional), que
# es lo mismo que habilita agendar, así que "lista para atender" no distinguiría nada más.
NIVELES = (
    ("datos_basicos", "Datos básicos"),
    ("lista_para_agendar", "Lista para agendar y atender"),
)


def sede_tiene_horario(sede) -> bool:
    """El horario de una sede es {día: [inicio, fin]}; basta un día definido."""
    return any(isinstance(rango, (list, tuple)) and len(rango) == 2 for rango in (sede.horario or {}).values())


def _dias_con_horario(sede) -> int:
    return sum(1 for rango in (sede.horario or {}).values() if isinstance(rango, (list, tuple)) and len(rango) == 2)


def profesionales_activos(clinica):
    """Colaboradores que se pueden elegir al agendar: activos y marcados como profesionales."""
    from apps.colaboradores.models import Colaborador

    return Colaborador.objects.filter(
        user__clinica=clinica, activo=True, user__is_active=True, user__es_profesional=True
    )


def procedimientos_sin_profesional(clinica):
    """Procedimientos activos que ningún profesional activo tiene asociado."""
    return list(
        Servicio.objects.filter(clinica=clinica, activo=True)
        .exclude(colaboradores__in=profesionales_activos(clinica))
        .distinct()
        .order_by("nombre")
    )


def _plural(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


def _nombres(colaboradores, maximo=2) -> str:
    """'Ana', 'Ana y Luis' o 'Ana, Luis y 3 más'."""
    nombres = [c.user.nombre_completo for c in colaboradores[:maximo]]
    resto = len(colaboradores) - len(nombres)
    if len(nombres) == 2 and resto == 0:
        return f"{nombres[0]} y {nombres[1]}"
    texto = ", ".join(nombres)
    return f"{texto} y {resto} más" if resto else texto


def es_admin_de(user, clinica) -> bool:
    """Administrador de esa clínica (no un superadmin que la está mirando)."""
    return bool(user and user.rol == "admin" and user.clinica_id == clinica.id)


def _flujo_de_recepcion(clinica) -> list:
    from apps.clinicas.serializers import MiClinicaSerializer

    wizard = MiClinicaSerializer().get_wizard(clinica)
    etiquetas = (
        ("paso_checkin", "Verificación de llegada"),
        ("paso_verificacion_facial", "Verificación facial"),
        ("paso_pago", "Pago"),
        ("paso_firma_asistencia", "Firma de asistencia"),
    )
    return [etiqueta for clave, etiqueta in etiquetas if wizard.get(clave)]


def _paso(clave, titulo, por_que, resumen, completado, href, accion, *, requerido=True, omitido=False, extra=None):
    paso = {
        "key": clave,
        "label": titulo,
        "por_que": por_que,
        "resumen": resumen,
        "completado": bool(completado),
        "requerido": requerido,
        "omitido": omitido,
        "href": href,
        "accion": accion,
    }
    if extra:
        paso.update(extra)
    return paso


def construir_preparacion(clinica, user=None) -> dict:
    from apps.agenda.models import Cita
    from apps.configuracion.models import DocumensoConsentimientoTemplate
    from apps.migracion.models import LoteMigracion

    preferencias = clinica.preparacion or {}
    modelo = preferencias.get("modelo") if preferencias.get("modelo") in MODELOS_DE_VENTA else ""
    omitidos = set(preferencias.get("omitidos") or [])

    sedes = list(Sede.objects.filter(clinica=clinica, activo=True).order_by("created_at"))
    sede_con_horario = next((s for s in sedes if sede_tiene_horario(s)), None)
    profesionales = list(profesionales_activos(clinica).filter(sedes__in=sedes).select_related("user").distinct())
    procedimientos = Servicio.objects.filter(clinica=clinica, activo=True)
    filtra = clinica.filtrar_profesionales_por_procedimiento
    procedimientos_listos = (
        procedimientos.filter(colaboradores__in=profesionales_activos(clinica)) if filtra else procedimientos
    )
    total_procedimientos = procedimientos.count()

    # ── 1. Sede ──
    if sede_con_horario:
        dias = _dias_con_horario(sede_con_horario)
        resumen_sede = f"{sede_con_horario.nombre} · atiende {_plural(dias, 'día', 'días')} a la semana."
    elif sedes:
        resumen_sede = f"La sede {sedes[0].nombre} no tiene horario. Sin horario no hay turnos disponibles."
    else:
        resumen_sede = "Aún no tienes ninguna sede."

    # ── 2. Equipo ──
    puede_marcarse = es_admin_de(user, clinica) and not user.es_profesional
    if profesionales:
        resumen_equipo = f"{_nombres(profesionales)} {'atienden' if len(profesionales) > 1 else 'atiende'} pacientes."
        # No bloquea nada: solo avisa de quién aún no puede iniciar sesión.
        sin_aceptar = sum(1 for c in profesionales if not c.user.activo)
        if sin_aceptar:
            resumen_equipo += f" {_plural(sin_aceptar, 'aún no acepta', 'aún no aceptan')} su invitación."
    else:
        resumen_equipo = "Nadie está marcado como profesional. Sin profesional no se puede agendar ni atender."

    # ── 3. Procedimientos ──
    if not total_procedimientos:
        resumen_procedimientos = "Aún no tienes procedimientos."
    else:
        resumen_procedimientos = _plural(total_procedimientos, "procedimiento", "procedimientos") + "."
        if filtra:
            sin_profesional = total_procedimientos - procedimientos_listos.distinct().count()
            if sin_profesional:
                resumen_procedimientos = (
                    f"{_plural(total_procedimientos, 'procedimiento', 'procedimientos')}; "
                    f"{_plural(sin_profesional, 'no tiene', 'no tienen')} profesional asignado y no se puede agendar."
                )

    # ── 4. Consentimientos ──
    plantillas = DocumensoConsentimientoTemplate.objects.filter(clinica=clinica, activo=True, nombre__gt="").count()

    # ── 5. Recepción ──
    flujo = _flujo_de_recepcion(clinica)

    # ── 6. Tratamientos ──
    tratamientos = TratamientoCatalogo.objects.filter(clinica=clinica, activo=True).count()

    # ── 7. Primera cita ──
    citas = Cita.objects.filter(sede__clinica=clinica).exclude(estado=Cita.Estado.CANCELADA).count()

    # ── 8. Migración ──
    lotes = LoteMigracion.objects.filter(clinica=clinica, revertido_en__isnull=True).count()

    pasos = [
        _paso(
            "sede", "Clínica y sede",
            "Sin sede y horario no se ofrecen turnos disponibles.",
            resumen_sede, sede_con_horario is not None, "/configuracion/sedes",
            "Configurar sede" if sedes else "Crear sede",
        ),
        _paso(
            "equipo", "Equipo",
            "Cada cita necesita un profesional que la atienda.",
            resumen_equipo, bool(profesionales), "/equipo/personal", "Agregar profesional",
            extra={"puede_marcarse_profesional": puede_marcarse},
        ),
        _paso(
            "procedimientos", "Procedimientos",
            "Es lo que agendas en cada cita, con su duración y precio.",
            resumen_procedimientos, procedimientos_listos.exists(),
            "/catalogo?tab=procedimientos", "Crear procedimientos",
        ),
        _paso(
            "consentimientos", "Consentimientos",
            "Los procedimientos que lo requieren piden la firma del paciente antes de atender.",
            _plural(plantillas, "plantilla lista.", "plantillas listas.") if plantillas else "Aún no tienes plantillas.",
            plantillas > 0, "/configuracion/consentimientos", "Configurar consentimientos", requerido=False,
        ),
        _paso(
            "recepcion", "Cómo recibes al paciente",
            "Define qué hace recepción antes de que el profesional inicie la atención.",
            " → ".join(flujo) + "." if flujo else "Sin pasos: recepción no completa nada antes de atender.",
            True, "/configuracion/recepcion", "Revisar pasos", requerido=False,
        ),
        _paso(
            "tratamientos", "Tratamientos por sesiones",
            "Agrupan varios procedimientos en un paquete de sesiones que vendes con una cotización.",
            _plural(tratamientos, "tratamiento creado.", "tratamientos creados.") if tratamientos else "Aún no tienes tratamientos.",
            tratamientos > 0, "/catalogo?tab=tratamientos", "Crear tratamiento", requerido=False,
        ),
        _paso(
            "primera_cita", "Tu primera cita",
            "Agendar y atender una cita real es la mejor prueba de que todo funciona.",
            _plural(citas, "cita agendada.", "citas agendadas.") if citas else "Aún no agendas ninguna.",
            citas > 0, "/agenda", "Agendar una cita",
        ),
    ]
    if clinica.modo_puesta_en_marcha:
        pasos.append(
            _paso(
                "migrar", "Migrar pacientes en curso",
                "Trae a quienes ya venían en tratamiento, con lo que pagaron y las sesiones hechas.",
                _plural(lotes, "paciente migrado.", "pacientes migrados.") if lotes else "Aún no migras ninguno.",
                lotes > 0, "/puesta-en-marcha", "Migrar pacientes", requerido=False,
            )
        )

    # Si la clínica solo vende procedimientos, los tratamientos no aplican.
    if modelo == "procedimientos":
        pasos = [p for p in pasos if p["key"] != "tratamientos"]
    for paso in pasos:
        paso["omitido"] = paso["key"] in omitidos and not paso["requerido"] and not paso["completado"]

    requeridos = [p for p in pasos if p["requerido"]]
    completados = sum(1 for p in requeridos if p["completado"])

    alcanzados = {
        "datos_basicos": sede_con_horario is not None,
    }
    alcanzados["lista_para_agendar"] = alcanzados["datos_basicos"] and bool(profesionales) and procedimientos_listos.exists()
    niveles = [{"key": clave, "label": etiqueta, "alcanzado": alcanzados[clave]} for clave, etiqueta in NIVELES]
    nivel = next((n["key"] for n in reversed(niveles) if n["alcanzado"]), "sin_empezar")

    return {
        "items": pasos,
        "niveles": niveles,
        "nivel": nivel,
        "completados": completados,
        "total": len(requeridos),
        "todo_listo": completados == len(requeridos),
        "modelo": modelo,
    }


def guardar_preferencias(clinica, *, modelo=None, omitir=None, restaurar=None) -> None:
    preferencias = dict(clinica.preparacion or {})
    if modelo is not None:
        if modelo not in MODELOS_DE_VENTA:
            raise ValidationError({"modelo": "Elige procedimientos, tratamientos o ambos."})
        preferencias["modelo"] = modelo
    omitidos = set(preferencias.get("omitidos") or [])
    for clave, destino in ((omitir, True), (restaurar, False)):
        if clave is None:
            continue
        if clave not in PASOS_OPCIONALES:
            raise ValidationError({"paso": "Solo se pueden omitir los pasos opcionales."})
        (omitidos.add if destino else omitidos.discard)(clave)
    preferencias["omitidos"] = sorted(omitidos)
    clinica.preparacion = preferencias
    clinica.save(update_fields=["preparacion", "updated_at"])


def marcar_como_profesional(user, clinica) -> None:
    """Quien configura también atiende pacientes: lo marca como profesional y lo asigna a la sede."""
    from apps.colaboradores.services import ensure_admin_colaborador

    if not es_admin_de(user, clinica):
        raise ValidationError(
            {"error": "Solo el administrador de la clínica puede marcarse como profesional.", "code": "SOLO_ADMIN"}
        )
    if not user.es_profesional:
        user.es_profesional = True
        user.save(update_fields=["es_profesional", "updated_at"])

    colaborador = ensure_admin_colaborador(user, force=True) or getattr(user, "colaborador", None)
    sede = Sede.objects.filter(clinica=clinica, activo=True).order_by("created_at").first()
    if colaborador is not None and sede is not None and not colaborador.sedes.exists():
        colaborador.sedes.add(sede)
        if colaborador.sede_principal_id is None:
            colaborador.sede_principal = sede
            colaborador.save(update_fields=["sede_principal", "updated_at"])

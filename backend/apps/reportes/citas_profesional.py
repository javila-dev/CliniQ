"""Citas por profesional: qué pasó con cada cita del periodo y de qué fue.

Cada cita cae en un **resultado**:

- ``atendida``: completada.
- ``cancelada`` y ``no_asistio``: como quedaron en la agenda.
- ``sin_cerrar``: ya terminó su horario y sigue pendiente, confirmada, en espera
  o en curso. Es lo que nadie cerró: el paciente vino y no se registró, o no vino
  y no se marcó.
- ``programada``: todavía no llega su hora.

Y en un **tipo**, según de dónde salió:

- ``tratamiento``: sesión de un tratamiento vendido (con "sesión N de M" cuando la
  cita tiene su sesión asignada, como en la pantalla de atención).
- ``procedimiento``: procedimiento individual vendido.
- ``item_libre``: otro ítem de una venta.
- ``cita_libre``: agendada sin venta (valoración, consulta, control suelto).

Los obsequios se marcan aparte (``es_obsequio``) sin cambiar el tipo. Las sesiones
cargadas por la puesta en marcha (``es_migracion``) no son citas de la agenda y no
cuentan.
"""

from datetime import date, timedelta

from django.db.models import Prefetch
from django.utils import timezone

ESTADOS_ABIERTOS = ("pendiente", "confirmada", "en_espera", "en_curso")
RESULTADOS = ("atendida", "cancelada", "no_asistio", "sin_cerrar", "programada")
TIPOS = ("tratamiento", "procedimiento", "item_libre", "cita_libre")
MAX_DIAS = 366


def rango_del_periodo(params, hoy: date | None = None) -> tuple[date, date]:
    """``mes=YYYY-MM`` o ``desde``/``hasta``; sin nada, el mes en curso completo."""
    hoy = hoy or timezone.localdate()
    mes = (params.get("mes") or "").strip()
    if mes:
        try:
            anio, numero = (int(p) for p in mes.split("-", 1))
            desde = date(anio, numero, 1)
        except (TypeError, ValueError):
            desde = hoy.replace(day=1)
        siguiente = (desde.replace(day=28) + timedelta(days=4)).replace(day=1)
        return desde, siguiente - timedelta(days=1)

    def _fecha(valor):
        try:
            return date.fromisoformat(valor) if valor else None
        except ValueError:
            return None

    desde = _fecha(params.get("desde")) or hoy.replace(day=1)
    hasta = _fecha(params.get("hasta"))
    if hasta is None:
        hasta = (desde.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    if hasta < desde:
        desde, hasta = hasta, desde
    if (hasta - desde).days > MAX_DIAS:
        hasta = desde + timedelta(days=MAX_DIAS)
    return desde, hasta


def _nombre(user) -> str:
    if user is None:
        return ""
    return (f"{user.first_name} {user.last_name}".strip()) or user.email


def _minutos(inicio, fin):
    if inicio and fin and fin > inicio:
        return round((fin - inicio).total_seconds() / 60)
    return None


def _hora_real(valor, referencia):
    """HH:MM, con el día delante si no es el de la cita (una atención que se
    cerró días después)."""
    if valor is None:
        return None
    local = timezone.localtime(valor)
    if local.date() != referencia:
        return local.strftime("%d/%m %H:%M")
    return local.strftime("%H:%M")


def _duracion_real(cita):
    """Minutos entre el inicio y el fin reales, si son creíbles: el mismo día y no
    más de 12 h. Una atención cerrada al día siguiente inflaría las horas."""
    minutos = _minutos(cita.fecha_inicio_real, cita.fecha_fin_real)
    if minutos is None or minutos > 12 * 60:
        return None
    if timezone.localdate(cita.fecha_inicio_real) != timezone.localdate(cita.fecha_fin_real):
        return None
    return minutos


def _resultado(cita, ahora) -> str:
    if cita.estado == "completada":
        return "atendida"
    if cita.estado in ("cancelada", "no_asistio"):
        return cita.estado
    return "sin_cerrar" if cita.fecha_fin <= ahora else "programada"


def _tipo(item) -> str:
    if item is None:
        return "cita_libre"
    if item.tipo == "tratamiento":
        return "tratamiento"
    if item.tipo == "procedimiento":
        return "procedimiento"
    return "item_libre"


def _sesion_de(cita):
    """La sesión enganchada a la cita (entre varias, la que sigue pendiente, como
    ``protocolos.services._sesion_vinculada_o_pendiente``). Sin caer a "la próxima
    pendiente": en un listado varias citas futuras mostrarían la misma."""
    vinculadas = list(cita.sesiones_protocolo.all())
    if not vinculadas:
        return None
    return next((s for s in vinculadas if s.estado == "pendiente"), vinculadas[0])


def _numero_sesion(sesion):
    """(número, total) corridos dentro del tratamiento, igual que en la atención."""
    todas = list(sesion.tratamiento.sesiones.all())
    todas.sort(key=lambda s: (s.tipo_sesion.orden if s.tipo_sesion_id else 0, s.numero))
    numero = next((i for i, s in enumerate(todas, start=1) if s.id == sesion.id), sesion.numero)
    return numero, len(todas)


def _nombre_tratamiento(tratamiento) -> str:
    if tratamiento.tratamiento_catalogo_id:
        return tratamiento.tratamiento_catalogo.nombre
    if tratamiento.servicio_id:
        return tratamiento.servicio.nombre
    return ""


def _queryset(clinica, sede_ids, desde, hasta):
    from apps.agenda.models import Cita, CitaRecurso
    from apps.historia_clinica.models import NotaClinica
    from apps.protocolos.models import SesionProcedimiento

    qs = Cita.objects.filter(
        activo=True, es_migracion=False, sede__clinica=clinica,
        fecha_inicio__date__gte=desde, fecha_inicio__date__lte=hasta,
    )
    if sede_ids is not None:
        qs = qs.filter(sede_id__in=sede_ids)
    sesiones = SesionProcedimiento.objects.select_related(
        "tipo_sesion", "tratamiento__tratamiento_catalogo", "tratamiento__servicio",
    ).prefetch_related(
        Prefetch("tratamiento__sesiones", queryset=SesionProcedimiento.objects.select_related("tipo_sesion")),
    )
    return (
        qs.select_related(
            "paciente", "sede", "profesional", "servicio", "created_by",
            "item_cotizacion__cotizacion__profesional", "item_cotizacion__tratamiento",
        )
        .prefetch_related(
            Prefetch("sesiones_protocolo", queryset=sesiones),
            Prefetch(
                "notas_clinicas",
                queryset=NotaClinica.objects.filter(activo=True).only("id", "cita_id", "estado"),
                to_attr="_notas",
            ),
            Prefetch(
                "recursos_asignados",
                queryset=CitaRecurso.objects.select_related("recurso").order_by("recurso__tipo", "recurso__nombre"),
                to_attr="_recursos",
            ),
        )
        .order_by("fecha_inicio", "profesional__first_name")
    )


def _fila(cita, ahora, ve_sensibles: bool) -> dict:
    from apps.pacientes.serializers import enmascarar_cola

    item = cita.item_cotizacion
    sesion = _sesion_de(cita)
    numero = total = None
    tipo_sesion = ""
    if sesion is not None:
        numero, total = _numero_sesion(sesion)
        tipo_sesion = sesion.tipo_sesion.nombre if sesion.tipo_sesion_id else ""
        tratamiento = _nombre_tratamiento(sesion.tratamiento)
    else:
        tratamiento = ""
    if not tratamiento and item is not None:
        tratamiento = item.tratamiento.nombre if item.tratamiento_id else item.descripcion
    servicio = cita.servicio_nombre or (cita.servicio.nombre if cita.servicio_id else "")

    notas = cita._notas
    if any(n.estado == "completada" for n in notas):
        historia = "firmada"
    elif notas:
        historia = "borrador"
    else:
        historia = "sin_nota"

    paciente = cita.paciente
    documento = paciente.numero_documento or ""
    telefono = paciente.telefono or ""
    if not ve_sensibles:
        documento = enmascarar_cola(documento)
        telefono = enmascarar_cola(telefono)

    inicio_local = timezone.localtime(cita.fecha_inicio)
    return {
        "id": str(cita.id),
        "fecha": inicio_local.date().isoformat(),
        "hora": inicio_local.strftime("%H:%M"),
        "hora_fin": timezone.localtime(cita.fecha_fin).strftime("%H:%M"),
        "duracion_min": cita.duracion_min or _minutos(cita.fecha_inicio, cita.fecha_fin),
        "profesional_id": str(cita.profesional_id),
        "profesional": _nombre(cita.profesional),
        "sede_id": str(cita.sede_id),
        "sede": cita.sede.nombre,
        "recursos": ", ".join(r.recurso.nombre for r in cita._recursos),
        "paciente_id": str(paciente.id),
        "paciente": paciente.nombre_completo,
        "documento": f"{paciente.tipo_documento} {documento}".strip() if documento else "",
        "telefono": telefono,
        "estado": cita.estado,
        "resultado": _resultado(cita, ahora),
        "tipo": _tipo(item),
        "es_obsequio": bool(item is not None and item.es_obsequio) or bool(sesion and sesion.item_obsequio_id),
        "servicio": servicio,
        "tratamiento": tratamiento,
        "tipo_sesion": tipo_sesion,
        "sesion_numero": numero,
        "sesion_total": total,
        "motivo": cita.motivo,
        "motivo_cancelacion": cita.motivo_cancelacion,
        "confirmacion": cita.estado_confirmacion,
        "canal_origen": cita.canal_origen,
        "llegada": _hora_real(cita.checkin_en, inicio_local.date()),
        "inicio_real": _hora_real(cita.fecha_inicio_real, inicio_local.date()),
        "fin_real": _hora_real(cita.fecha_fin_real, inicio_local.date()),
        "duracion_real_min": _duracion_real(cita),
        "historia": historia,
        "firma_asistencia": cita.firma_asistencia_estado,
        "agendada_por": _nombre(cita.created_by),
        "agendada_en": timezone.localtime(cita.created_at).isoformat(),
        "vendida_por": _nombre(item.cotizacion.profesional) if item is not None else "",
    }


def _resumen_vacio(profesional_id, nombre) -> dict:
    return {
        "profesional_id": profesional_id, "profesional": nombre,
        "total": 0, **{r: 0 for r in RESULTADOS},
        "atendidas_por_tipo": {t: 0 for t in TIPOS},
        "pacientes_atendidos": 0, "minutos_atendidos": 0, "atendidas_sin_nota_firmada": 0,
        "pct_asistencia": None,
        "_pacientes": set(),
    }


def _sumar(resumen, fila):
    resumen["total"] += 1
    resumen[fila["resultado"]] += 1
    if fila["resultado"] != "atendida":
        return
    resumen["atendidas_por_tipo"][fila["tipo"]] += 1
    resumen["_pacientes"].add(fila["paciente_id"])
    resumen["minutos_atendidos"] += fila["duracion_real_min"] or fila["duracion_min"] or 0
    if fila["historia"] != "firmada":
        resumen["atendidas_sin_nota_firmada"] += 1


def _cerrar(resumen) -> dict:
    resumen["pacientes_atendidos"] = len(resumen.pop("_pacientes"))
    # Asistencia sobre las citas que ya se resolvieron (vino o no vino): las
    # canceladas, las programadas y las sin cerrar no dicen nada todavía.
    base = resumen["atendida"] + resumen["no_asistio"]
    resumen["pct_asistencia"] = round(resumen["atendida"] * 100 / base) if base else None
    return resumen


def citas_por_profesional(clinica, *, sede_ids, desde: date, hasta: date, ve_sensibles: bool) -> dict:
    ahora = timezone.now()
    filas = [_fila(c, ahora, ve_sensibles) for c in _queryset(clinica, sede_ids, desde, hasta)]

    por_profesional: dict[str, dict] = {}
    totales = _resumen_vacio(None, "Total")
    for fila in filas:
        resumen = por_profesional.get(fila["profesional_id"])
        if resumen is None:
            resumen = por_profesional[fila["profesional_id"]] = _resumen_vacio(
                fila["profesional_id"], fila["profesional"],
            )
        _sumar(resumen, fila)
        _sumar(totales, fila)

    profesionales = sorted(
        (_cerrar(r) for r in por_profesional.values()), key=lambda r: (-r["total"], r["profesional"].lower()),
    )
    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "totales": _cerrar(totales),
        "profesionales": profesionales,
        "citas": filas,
    }

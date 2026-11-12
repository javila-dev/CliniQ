"""Regularizar un paquete: registrar las sesiones que se hicieron por fuera de la app.

Cuando se vende o se importa un paquete y se atiende sin agendar en CliniQ, el
paquete queda con sesiones pendientes que en realidad ya se hicieron (ver
``reportes.paquetes``). Desde el reporte, el admin (o quien tenga
``reportes.paquetes.regularizar``) marca cada una como hecha, con su fecha y el
profesional que atendió. Decisiones del 12/11/2026:

- **Sin cita pasada.** La sesión del protocolo queda completada sin cita y el
  paquete descuenta el cupo (``sesiones_previas_consumidas``), igual que las
  previas de una carga. No se crea nada en la agenda, así que no cuenta para
  ocupación, comisiones, insumos ni ingresos.
- **Dos modos por sesión:** solo la sesión (con una nota corta opcional) o,
  además, la nota clínica, que se guarda como una evolución de la historia
  (nota sin cita, firmada por quien la escribe y cerrada al guardar). Escribirla
  exige además ``historia.notas.crear``.
- **Fecha** entre la venta (o la carga) y hoy. **Profesional** obligatorio: si no
  se sabe quién atendió, se pone a quien registra y se aclara en la nota.
- Cada sesión queda marcada como **registrada después**, con quién y cuándo. El
  reporte las cuenta por responsable.

Un error se deshace: la sesión vuelve a pendiente y el paquete recupera el cupo.
La evolución no se borra (no se editan); se le agrega otra que anula el registro.
"""

from datetime import date

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.cotizaciones.models import Cotizacion, ItemCotizacion

PERM_REGULARIZAR = "reportes.paquetes.regularizar"
PERM_NOTA_CLINICA = "historia.notas.crear"
MODO_SESION = "sesion"
MODO_NOTA_CLINICA = "nota_clinica"
OBSERVACION_POR_DEFECTO = "Hecha por fuera de la app, registrada después."
MOTIVO_SIN_CONSENTIMIENTO = "Sesión hecha por fuera de la app, registrada después."
LARGO_MAXIMO_NOTA = 500
LARGO_MAXIMO_EVOLUCION = 5000
ORDEN_PROTOCOLO = ("tipo_sesion__orden", "numero", "paso__orden", "created_at")


class RegularizacionError(Exception):
    def __init__(self, mensaje, code, status=400, extra=None):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.code = code
        self.status = status
        self.extra = extra or {}


def _item(clinica, item_id, sede_ids):
    item = (
        ItemCotizacion.objects.filter(
            pk=item_id, activo=True, cotizacion__clinica=clinica, cotizacion__activo=True,
            cotizacion__estado=Cotizacion.Estado.ACEPTADA,
        )
        .exclude(tipo=ItemCotizacion.Tipo.INSUMO)
        .select_related("cotizacion", "cotizacion__paciente", "cotizacion__profesional")
        .first()
    )
    if item is None or (sede_ids is not None and str(item.cotizacion.sede_id) not in {str(s) for s in sede_ids}):
        raise RegularizacionError("No se encontró el paquete.", "PAQUETE_NO_ENCONTRADO", status=404)
    return item


def _inicio(item):
    """Desde cuándo pudo hacerse una sesión: la venta o, si es importado, la carga."""
    cotizacion = item.cotizacion
    if cotizacion.es_migracion and cotizacion.lote_migracion:
        from apps.migracion.models import LoteMigracion

        lote = LoteMigracion.objects.filter(pk=cotizacion.lote_migracion).only("created_at").first()
        if lote is not None:
            return timezone.localdate(lote.created_at)
    return timezone.localdate(cotizacion.aceptada_en or cotizacion.created_at)


def _sesiones(item):
    from apps.protocolos.models import SesionProcedimiento

    return (
        SesionProcedimiento.objects.filter(tratamiento__cotizacion_item=item, activo=True)
        .select_related("tipo_sesion", "procedimiento", "profesional", "registrada_despues_por", "tratamiento")
        .order_by(*ORDEN_PROTOCOLO)
    )


def _nombre_sesion(sesion) -> str:
    if sesion.tipo_sesion_id:
        return sesion.tipo_sesion.nombre
    if sesion.procedimiento_id:
        return sesion.procedimiento.nombre
    return "Sesión"


def _profesionales(clinica, usuario):
    """Quienes pueden figurar como el que atendió: los que atienden y los admin
    de la clínica, también los inactivos (pudo atender alguien que ya se fue)."""
    from apps.users.models import User

    usuarios = list(
        User.objects.filter(clinica=clinica)
        .filter(Q(es_profesional=True) | Q(rol__in=("profesional", "admin")))
        .order_by("-is_active", "first_name", "last_name")
    )
    if usuario is not None and getattr(usuario, "clinica_id", None) == clinica.id and usuario not in usuarios:
        usuarios.insert(0, usuario)
    return usuarios


def _puede_nota_clinica(usuario, request=None) -> bool:
    from apps.users.authorization import user_has_permission

    return user_has_permission(usuario, PERM_NOTA_CLINICA, request=request)


def estado(clinica, item_id, *, usuario, sede_ids=None, request=None) -> dict:
    """El paquete con sus sesiones pendientes sin cita (las que se pueden
    registrar) y las ya registradas después (las que se pueden deshacer)."""
    from apps.protocolos.models import SesionProcedimiento

    item = _item(clinica, item_id, sede_ids)
    sesiones = list(_sesiones(item))
    posiciones = {s.id: i + 1 for i, s in enumerate(sesiones)}
    pendientes = [s for s in sesiones if s.estado == SesionProcedimiento.Estado.PENDIENTE and s.cita_id is None]
    registradas = [s for s in sesiones if s.registrada_despues_en is not None]
    cotizacion = item.cotizacion
    return {
        "item_id": str(item.id),
        "cotizacion_id": str(cotizacion.id),
        "paciente_id": str(cotizacion.paciente_id),
        "paciente_nombre": cotizacion.paciente.nombre_completo,
        "tratamiento": item.descripcion,
        "origen": "importado" if cotizacion.es_migracion else "venta",
        "fecha_minima": _inicio(item).isoformat(),
        "hoy": timezone.localdate().isoformat(),
        "sesiones_total": len(sesiones),
        "sin_agendar": item.citas_restantes(),
        "pendientes": [
            {"id": str(s.id), "nombre": _nombre_sesion(s), "posicion": posiciones[s.id], "de": len(sesiones)}
            for s in pendientes
        ],
        "registradas": [
            {
                "id": str(s.id),
                "nombre": _nombre_sesion(s),
                "posicion": posiciones[s.id],
                "de": len(sesiones),
                "estado": s.estado,
                "fecha": s.fecha.isoformat() if s.fecha else None,
                "profesional_nombre": s.profesional.nombre_completo if s.profesional_id else None,
                "observaciones": s.observaciones,
                "con_nota_clinica": s.evolucion_regularizacion_id is not None,
                "registrada_por": s.registrada_despues_por.nombre_completo if s.registrada_despues_por_id else None,
                "registrada_en": s.registrada_despues_en.isoformat(),
            }
            for s in registradas
        ],
        "profesionales": [
            {"id": str(u.id), "nombre": u.nombre_completo, "activo": u.is_active}
            for u in _profesionales(clinica, usuario)
        ],
        "puede_nota_clinica": _puede_nota_clinica(usuario, request),
    }


def _validar_fila(fila, *, inicio, hoy, profesionales, puede_nota):
    modo = fila.get("modo") or MODO_SESION
    if modo not in (MODO_SESION, MODO_NOTA_CLINICA):
        raise RegularizacionError("Modo de registro no válido.", "MODO_INVALIDO")
    fecha = fila.get("fecha")
    if isinstance(fecha, str):
        try:
            fecha = date.fromisoformat(fecha)
        except ValueError:
            fecha = None
    if not isinstance(fecha, date):
        raise RegularizacionError("Indica la fecha en que se hizo cada sesión.", "FECHA_REQUERIDA")
    if fecha > hoy:
        raise RegularizacionError("Una sesión hecha no puede tener fecha futura.", "FECHA_FUTURA")
    if fecha < inicio:
        raise RegularizacionError(
            f"La fecha no puede ser anterior a la venta o la carga del paquete ({inicio:%d/%m/%Y}).",
            "FECHA_ANTERIOR_A_LA_VENTA",
        )
    profesional = profesionales.get(str(fila.get("profesional_id") or ""))
    if profesional is None:
        raise RegularizacionError("Elige el profesional que atendió cada sesión.", "PROFESIONAL_REQUERIDO")
    nota = str(fila.get("nota") or "").strip()
    if len(nota) > LARGO_MAXIMO_NOTA:
        raise RegularizacionError(f"La nota no puede pasar de {LARGO_MAXIMO_NOTA} caracteres.", "NOTA_LARGA")
    texto = str(fila.get("nota_clinica") or "").strip()
    if modo == MODO_NOTA_CLINICA:
        if not puede_nota:
            raise RegularizacionError(
                "No tienes permiso para escribir notas clínicas: registra solo la sesión.",
                "SIN_PERMISO_NOTA_CLINICA", status=403,
            )
        if not texto:
            raise RegularizacionError("Escribe la nota clínica de la sesión.", "NOTA_CLINICA_REQUERIDA")
        if len(texto) > LARGO_MAXIMO_EVOLUCION:
            raise RegularizacionError(
                f"La nota clínica no puede pasar de {LARGO_MAXIMO_EVOLUCION} caracteres.", "NOTA_CLINICA_LARGA",
            )
    return {"modo": modo, "fecha": fecha, "profesional": profesional, "nota": nota, "texto": texto}


def _evolucion(paciente, usuario, texto):
    from apps.historia_clinica.models import HistoriaClinica, NotaClinica

    return NotaClinica.objects.create(
        historia=HistoriaClinica.del_paciente(paciente),
        estado=NotaClinica.EstadoNota.COMPLETADA,
        motivo_consulta=texto,
        firmada_por=usuario,
        firmada_en=timezone.now(),
        zonas_inicializadas=True,
    )


@transaction.atomic
def registrar(clinica, item_id, filas, *, usuario, sede_ids=None, request=None) -> dict:
    """Marca como hechas las sesiones de ``filas`` (``sesion_id``, ``fecha``,
    ``profesional_id``, ``modo``, ``nota``, ``nota_clinica``). Todo o nada."""
    from apps.core.logging import registrar_accion
    from apps.protocolos.models import SesionProcedimiento
    from apps.protocolos.services import marcar_sesion_completada

    item = _item(clinica, item_id, sede_ids)
    item = ItemCotizacion.objects.select_for_update().select_related(
        "cotizacion", "cotizacion__paciente",
    ).get(pk=item.pk)
    if not filas:
        raise RegularizacionError("Elige al menos una sesión.", "SIN_SESIONES")
    ids = [str(f.get("sesion_id") or "") for f in filas]
    if len(set(ids)) != len(ids):
        raise RegularizacionError("Una sesión aparece dos veces.", "SESION_REPETIDA")

    sin_agendar = item.citas_restantes()
    if len(filas) > sin_agendar:
        raise RegularizacionError(
            f"Al paquete le quedan {sin_agendar} {'sesión' if sin_agendar == 1 else 'sesiones'} sin agendar: "
            "no se pueden registrar más. Si una cita agendada ya no va, cancélala primero.",
            "SIN_CUPO", extra={"sin_agendar": sin_agendar},
        )

    sesiones = {
        str(s.id): s
        for s in _sesiones(item).select_for_update(of=("self",)).filter(pk__in=[i for i in ids if i])
    }
    inicio, hoy = _inicio(item), timezone.localdate()
    profesionales = {str(u.id): u for u in _profesionales(clinica, usuario)}
    puede_nota = _puede_nota_clinica(usuario, request)
    paciente = item.cotizacion.paciente
    ahora = timezone.now()

    registradas = []
    for sesion_id, fila in zip(ids, filas):
        sesion = sesiones.get(sesion_id)
        if sesion is None:
            raise RegularizacionError("Una de las sesiones no es de este paquete.", "SESION_NO_ENCONTRADA", status=404)
        if sesion.estado != SesionProcedimiento.Estado.PENDIENTE or sesion.cita_id is not None:
            raise RegularizacionError(
                f"La sesión {_nombre_sesion(sesion)} ya está hecha o tiene una cita.", "SESION_NO_PENDIENTE",
            )
        datos = _validar_fila(fila, inicio=inicio, hoy=hoy, profesionales=profesionales, puede_nota=puede_nota)
        marcar_sesion_completada(
            sesion,
            profesional=datos["profesional"],
            observaciones=datos["nota"] or OBSERVACION_POR_DEFECTO,
            fecha=datos["fecha"],
            forzar_sin_consentimiento=True,
            motivo=MOTIVO_SIN_CONSENTIMIENTO,
        )
        evolucion = None
        if datos["modo"] == MODO_NOTA_CLINICA:
            evolucion = _evolucion(paciente, usuario, (
                f"Sesión hecha por fuera de la app el {datos['fecha']:%d/%m/%Y} ({_nombre_sesion(sesion)}, "
                f"{item.descripcion}). Atendió: {datos['profesional'].nombre_completo}. "
                f"Registrada después por {usuario.nombre_completo}.\n\n{datos['texto']}"
            ))
        # La hora no se conoce: la que puso marcar_sesion_completada es la del registro.
        SesionProcedimiento.objects.filter(pk=sesion.pk).update(
            hora=None, registrada_despues_por=usuario, registrada_despues_en=ahora,
            evolucion_regularizacion=evolucion, updated_at=ahora,
        )
        registradas.append({
            "sesion_id": sesion_id, "nombre": _nombre_sesion(sesion), "fecha": datos["fecha"].isoformat(),
            "profesional": datos["profesional"].nombre_completo, "modo": datos["modo"],
            "evolucion_id": str(evolucion.id) if evolucion else None,
        })

    # El cupo del paquete: las sesiones hechas sin cita descuentan como las previas.
    item.sesiones_previas_consumidas += len(registradas)
    item.save(update_fields=["sesiones_previas_consumidas", "updated_at"])

    registrar_accion(
        request, "paquete.regularizar", item,
        {"cotizacion_id": str(item.cotizacion_id), "tratamiento": item.descripcion, "sesiones": registradas},
        clinica=clinica, actor=usuario,
    )
    return {"registradas": registradas, **estado(clinica, item.id, usuario=usuario, sede_ids=sede_ids, request=request)}


@transaction.atomic
def deshacer(clinica, item_id, sesion_id, *, motivo, usuario, sede_ids=None, request=None) -> dict:
    """La sesión registrada después vuelve a pendiente y el paquete recupera el cupo."""
    from apps.core.logging import registrar_accion
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    motivo = str(motivo or "").strip()
    if not motivo:
        raise RegularizacionError("Escribe por qué se deshace el registro.", "MOTIVO_REQUERIDO")
    item = _item(clinica, item_id, sede_ids)
    item = ItemCotizacion.objects.select_for_update().select_related("cotizacion", "cotizacion__paciente").get(pk=item.pk)
    sesion = (
        _sesiones(item).select_for_update(of=("self",))
        .filter(pk=sesion_id, registrada_despues_en__isnull=False).first()
    )
    if sesion is None:
        raise RegularizacionError("No se encontró la sesión registrada.", "SESION_NO_ENCONTRADA", status=404)
    if sesion.cita_id is not None or sesion.estado != SesionProcedimiento.Estado.COMPLETADO:
        raise RegularizacionError("La sesión ya no está como registrada después.", "SESION_NO_REGULARIZADA")

    anterior = {
        "fecha": sesion.fecha.isoformat() if sesion.fecha else None,
        "profesional": sesion.profesional.nombre_completo if sesion.profesional_id else None,
        "evolucion_id": str(sesion.evolucion_regularizacion_id) if sesion.evolucion_regularizacion_id else None,
    }
    if sesion.evolucion_regularizacion_id:
        _evolucion(item.cotizacion.paciente, usuario, (
            f"Se anula el registro de la sesión hecha por fuera de la app el "
            f"{sesion.fecha:%d/%m/%Y} ({_nombre_sesion(sesion)}, {item.descripcion}). Motivo: {motivo}"
        ))
    sesion.estado = SesionProcedimiento.Estado.PENDIENTE
    sesion.fecha = None
    sesion.hora = None
    sesion.profesional = None
    sesion.observaciones = ""
    sesion.forzado_sin_consentimiento = False
    sesion.motivo_forzado = ""
    sesion.registrada_despues_por = None
    sesion.registrada_despues_en = None
    sesion.evolucion_regularizacion = None
    sesion.save(update_fields=[
        "estado", "fecha", "hora", "profesional", "observaciones", "forzado_sin_consentimiento", "motivo_forzado",
        "registrada_despues_por", "registrada_despues_en", "evolucion_regularizacion", "updated_at",
    ])
    sesion.procedimientos_ejecutados.clear()
    sesion.consentimientos_verificados.clear()
    tratamiento = sesion.tratamiento
    if tratamiento.estado == TratamientoPaciente.Estado.COMPLETADO:
        tratamiento.estado = TratamientoPaciente.Estado.ACTIVO
        tratamiento.save(update_fields=["estado", "updated_at"])
    if item.sesiones_previas_consumidas:
        item.sesiones_previas_consumidas -= 1
        item.save(update_fields=["sesiones_previas_consumidas", "updated_at"])

    registrar_accion(
        request, "paquete.regularizar.deshacer", item,
        {"cotizacion_id": str(item.cotizacion_id), "sesion_id": str(sesion.id), "motivo": motivo, **anterior},
        clinica=clinica, actor=usuario,
    )
    return estado(clinica, item.id, usuario=usuario, sede_ids=sede_ids, request=request)

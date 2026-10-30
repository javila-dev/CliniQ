"""Corregir las sesiones previas de un paciente migrado (soporte, console).

La puesta en marcha guarda las sesiones que el paciente ya había hecho antes de
CliniQ de dos formas: como número en el ítem (``sesiones_previas_consumidas``) y
como sesiones del protocolo completadas sin cita. Las que se cargaron con
profesional quedaron como citas migradas y no se tocan aquí.

Si la clínica marcó mal cuántas eran, soporte las corrige, siempre que el
paciente no haya hecho todavía ninguna sesión de ese paquete dentro de la app:
desde ese momento las reales ya se cruzaron con las previas. El paquete queda
como si la carga se hubiera hecho con el número correcto.
"""

from django.db import transaction

from apps.agenda import soporte
from apps.agenda.models import Cita, CorreccionSoporte
from apps.agenda.soporte import error

# El texto con que la puesta en marcha marca sus sesiones (apps.migracion.services).
OBSERVACION_PREVIA = "Sesión previa a CliniQ (puesta en marcha)"
ESTADOS_HECHA = (Cita.Estado.COMPLETADA, Cita.Estado.EN_CURSO)


def _sesiones(item):
    from apps.protocolos.models import SesionProcedimiento

    # Mismo orden con que la puesta en marcha eligió las sesiones previas.
    return SesionProcedimiento.objects.filter(
        tratamiento__in=item.tratamientos_paciente.all(), activo=True,
    ).select_related("tipo_sesion", "procedimiento", "tratamiento").order_by(
        "tipo_sesion__orden", "numero", "paso__orden", "created_at",
    )


def _es_previa(sesion) -> bool:
    from apps.protocolos.models import SesionProcedimiento

    return (
        sesion.estado == SesionProcedimiento.Estado.COMPLETADO
        and sesion.cita_id is None
        and sesion.observaciones == OBSERVACION_PREVIA
    )


def _estado(item) -> dict:
    """Cómo están las sesiones del paquete y si se pueden corregir."""
    from apps.protocolos.models import SesionProcedimiento

    citas = item.citas.all()
    detalladas = citas.filter(es_migracion=True).exclude(estado__in=["cancelada", "no_asistio"]).count()
    hechas_citas = citas.filter(es_migracion=False, estado__in=ESTADOS_HECHA).count()
    sesiones = list(_sesiones(item))
    # Una sesión del protocolo completada en la app: con cita, o marcada a mano.
    hechas_sesiones = sum(
        1 for s in sesiones if s.estado == SesionProcedimiento.Estado.COMPLETADO and not _es_previa(s)
    )
    ocupadas_app = citas.filter(es_migracion=False).exclude(estado__in=["cancelada", "no_asistio"]).count()
    total = item.num_sesiones_efectivas()
    # Las de la carga sin cita: las que aún no se agendaron (una pendiente con
    # cita es de una cita agendada en la app y sigue siendo de ella).
    candidatas = [
        s for s in sesiones
        if s.cita_id is None and (s.estado == SesionProcedimiento.Estado.PENDIENTE or _es_previa(s))
    ]

    bloqueo = None
    if hechas_citas or hechas_sesiones:
        hechas = max(hechas_citas, hechas_sesiones)
        bloqueo = (
            f"Ya tiene {hechas} sesión{'es' if hechas != 1 else ''} hecha{'s' if hechas != 1 else ''} "
            "dentro de la app: las previas ya no se pueden corregir."
        )
    return {
        "total": total,
        "previas": detalladas + item.sesiones_previas_consumidas,
        "con_cita": detalladas,
        "agendadas_en_app": ocupadas_app,
        "minimo": detalladas,
        "maximo": max(detalladas, total - ocupadas_app),
        "restantes": item.citas_restantes(),
        "bloqueo": bloqueo,
        "sesiones": [{**soporte.sesion_payload(s), "previa": _es_previa(s)} for s in candidatas],
        "_candidatas": candidatas,
    }


def _lote(item):
    from apps.migracion.models import LoteMigracion

    cotizacion = item.cotizacion
    if not cotizacion.es_migracion or not cotizacion.lote_migracion:
        return None
    return LoteMigracion.objects.filter(pk=cotizacion.lote_migracion, revertido_en__isnull=True).first()


def _carga_payload(lote, item) -> dict:
    estado = _estado(item)
    estado.pop("_candidatas")
    return {
        "item_id": str(item.id),
        "lote_id": str(lote.id),
        "descripcion": item.descripcion,
        "cargado_en": lote.created_at,
        "cargado_por": soporte.nombre(lote.creado_por),
        "nota": lote.nota,
        **estado,
    }


def cargas_del_paciente(clinica, paciente) -> list[dict]:
    """Los paquetes que llegaron por la puesta en marcha, con sus sesiones previas."""
    from apps.cotizaciones.models import ItemCotizacion
    from apps.migracion.models import LoteMigracion

    lotes = {
        lote.id: lote
        for lote in LoteMigracion.objects.filter(
            clinica=clinica, paciente=paciente, revertido_en__isnull=True,
        ).select_related("creado_por")
    }
    items = (
        ItemCotizacion.objects.filter(
            cotizacion__clinica=clinica, cotizacion__paciente=paciente,
            cotizacion__es_migracion=True, cotizacion__lote_migracion__in=lotes.keys(), activo=True,
        )
        .select_related("cotizacion", "tratamiento")
        .order_by("-cotizacion__created_at")
    )
    return [_carga_payload(lotes[i.cotizacion.lote_migracion], i) for i in items if i.tiene_cupo_propio]


def _item_corregible(clinica, item_id):
    from apps.cotizaciones.models import ItemCotizacion

    item = (
        ItemCotizacion.objects.select_related("cotizacion", "cotizacion__paciente", "tratamiento")
        .filter(pk=item_id, cotizacion__clinica=clinica, activo=True)
        .first()
    )
    if item is None:
        error("El paquete no existe en esta clínica.", "ITEM_NO_ENCONTRADO")
    lote = _lote(item)
    if lote is None:
        error("El paquete no llegó por la puesta en marcha (o su carga se revirtió).", "ITEM_NO_MIGRADO")
    return item, lote


def corregir(clinica, item_id, *, sesiones, motivo, usuario, request=None) -> CorreccionSoporte:
    from apps.cotizaciones.models import ItemCotizacion
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

    motivo = (motivo or "").strip()
    if not motivo:
        error("Escribe el motivo.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        ItemCotizacion.objects.select_for_update().filter(pk=item_id).first()
        item, lote = _item_corregible(clinica, item_id)
        estado = _estado(item)
        if estado["bloqueo"]:
            error(estado["bloqueo"], "SESIONES_HECHAS_EN_APP")
        if sesiones == estado["previas"]:
            error("El paquete ya tiene ese número de sesiones previas.", "SIN_CAMBIOS")
        if sesiones < estado["minimo"]:
            error(
                f"{estado['con_cita']} de las sesiones previas se cargaron con cita y profesional: "
                f"el mínimo es {estado['minimo']}.",
                "SESIONES_BAJO_MINIMO",
            )
        if sesiones > estado["maximo"]:
            agendadas = estado["agendadas_en_app"]
            extra = f" ({agendadas} ya agendada{'s' if agendadas != 1 else ''} en la app)" if agendadas else ""
            error(
                f"El paquete tiene {estado['total']} sesiones{extra}: el máximo es {estado['maximo']}.",
                "SESIONES_SOBRE_MAXIMO",
            )

        antes = estado["previas"]
        sin_cita = sesiones - estado["con_cita"]
        item.sesiones_previas_consumidas = sin_cita
        item.save(update_fields=["sesiones_previas_consumidas", "updated_at"])

        # Las primeras `sin_cita` quedan hechas; las demás vuelven a pendiente.
        candidatas = estado["_candidatas"]
        fecha = next((s.fecha for s in candidatas if _es_previa(s) and s.fecha), None)
        marcadas, desmarcadas = [], []
        for i, sesion in enumerate(candidatas):
            hecha = i < sin_cita
            if hecha and not _es_previa(sesion):
                sesion.estado = SesionProcedimiento.Estado.COMPLETADO
                sesion.fecha = fecha
                sesion.observaciones = OBSERVACION_PREVIA
                marcadas.append(str(sesion.id))
            elif not hecha and _es_previa(sesion):
                sesion.estado = SesionProcedimiento.Estado.PENDIENTE
                sesion.fecha = None
                sesion.observaciones = ""
                desmarcadas.append(str(sesion.id))
            else:
                continue
            sesion.save(update_fields=["estado", "fecha", "observaciones", "updated_at"])

        # El protocolo termina si las previas cubren el paquete (como en la carga).
        for tratamiento in item.tratamientos_paciente.all():
            if sin_cita >= estado["total"] and tratamiento.estado == TratamientoPaciente.Estado.ACTIVO:
                tratamiento.estado = TratamientoPaciente.Estado.COMPLETADO
            elif sin_cita < estado["total"] and tratamiento.estado == TratamientoPaciente.Estado.COMPLETADO:
                tratamiento.estado = TratamientoPaciente.Estado.ACTIVO
            else:
                continue
            tratamiento.save(update_fields=["estado", "updated_at"])

        # El resumen de la carga (pantalla de puesta en marcha) refleja la corrección.
        resumen_lote = (lote.manifest or {}).get("resumen")
        if resumen_lote:
            resumen_lote["sesiones_realizadas"] = sesiones
            resumen_lote["sesiones_pendientes"] = max(0, resumen_lote.get("sesiones_total", 0) - sesiones)
            lote.save(update_fields=["manifest"])

        resumen = {
            "lote": str(lote.id),
            "paquete": item.descripcion,
            "sesiones_antes": antes,
            "sesiones_despues": sesiones,
            "sesiones_marcadas": marcadas,
            "sesiones_desmarcadas": desmarcadas,
        }
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.CORREGIR_SESIONES_PREVIAS, cita=None,
            paciente=item.cotizacion.paciente, item_origen=item,
            accion_cobro=CorreccionSoporte.AccionCobro.SIN_COBRO, motivo=motivo, usuario=usuario,
            resumen=resumen,
            detalle={"paquete": item.descripcion, "sesiones_antes": antes, "sesiones_despues": sesiones},
        )

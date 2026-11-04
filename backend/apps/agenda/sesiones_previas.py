"""Corregir el paquete de un paciente migrado (soporte, console): el tratamiento
que se cargó y las sesiones que ya había hecho.

La puesta en marcha guarda las sesiones que el paciente ya había hecho antes de
CliniQ de dos formas: como número en el ítem (``sesiones_previas_consumidas``) y
como sesiones del protocolo completadas sin cita. Las que se cargaron con
profesional quedaron como citas migradas y no se tocan aquí.

Si la clínica cargó otro tratamiento o marcó mal cuántas sesiones eran, soporte
lo corrige, siempre que el paciente no haya hecho todavía ninguna sesión de ese
paquete dentro de la app: desde ese momento las reales ya se cruzaron con las
previas. El paquete queda como si la carga se hubiera hecho con los datos
correctos; el precio, los pagos y la cartera no cambian.
"""

from django.db import transaction

from apps.agenda import soporte
from apps.agenda.models import Cita, CorreccionSoporte
from apps.agenda.soporte import error
from apps.migracion.services import OBSERVACION_PREVIA, campos_item, crear_protocolo

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
            "dentro de la app: el paquete migrado ya no se puede corregir."
        )
    return {
        "tipo": item.tipo,
        "tratamiento_id": str(item.tratamiento_id) if item.tratamiento_id else None,
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


def tratamientos_de_la_clinica(clinica) -> list[dict]:
    """Tratamientos del catálogo que se pueden poner en un paquete migrado, con
    las sesiones que trae su protocolo (las de compromiso)."""
    from django.db.models import Q, Sum

    from apps.clinicas.models import TratamientoCatalogo

    tratamientos = TratamientoCatalogo.objects.filter(clinica=clinica, activo=True).annotate(
        sesiones=Sum("tipos_sesion__cantidad", filter=Q(tipos_sesion__activo=True, tipos_sesion__es_compromiso=True)),
    ).order_by("nombre")
    return [{"id": str(t.id), "nombre": t.nombre, "total_sesiones": t.sesiones or 0} for t in tratamientos]


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


def _validar_rango(sesiones, *, minimo, maximo, total, con_cita, agendadas):
    if sesiones < minimo:
        error(
            f"{con_cita} de las sesiones previas se cargaron con cita y profesional: el mínimo es {minimo}.",
            "SESIONES_BAJO_MINIMO",
        )
    if sesiones > maximo:
        extra = f" ({agendadas} ya agendada{'s' if agendadas != 1 else ''} en la app)" if agendadas else ""
        error(f"El paquete tiene {total} sesiones{extra}: el máximo es {maximo}.", "SESIONES_SOBRE_MAXIMO")


def _remarcar_previas(item, estado, sin_cita) -> tuple[list[str], list[str]]:
    """Mismo tratamiento: las primeras `sin_cita` sesiones quedan hechas y las demás pendientes."""
    from apps.protocolos.models import SesionProcedimiento, TratamientoPaciente

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
    return marcadas, desmarcadas


def _cambiar_tratamiento(clinica, item, estado, trat, sesiones) -> list[str]:
    """Rehace el ítem y su protocolo con el otro tratamiento, como en la carga."""
    from apps.clinicas.models import TratamientoCatalogo
    from apps.protocolos.models import SesionProcedimiento

    agendadas = estado["agendadas_en_app"]
    if agendadas:
        error(
            f"El paquete tiene {agendadas} cita{'s' if agendadas != 1 else ''} agendada{'s' if agendadas != 1 else ''} "
            "en la app: cancélalas antes de cambiar el tratamiento.",
            "CITAS_AGENDADAS",
        )
    if SesionProcedimiento.objects.filter(
        tratamiento__cotizacion_item=item, item_obsequio__isnull=False,
    ).exists():
        error("El paquete tiene sesiones obsequiadas: no se puede cambiar el tratamiento.", "SESIONES_OBSEQUIO")

    if trat["tipo"] == "tratamiento":
        catalogo = TratamientoCatalogo.objects.filter(pk=trat["tratamiento"], clinica=clinica, activo=True).first()
        if catalogo is None:
            error("El tratamiento no existe en esta clínica.", "TRATAMIENTO_NO_ENCONTRADO")
        trat = {**trat, "descripcion": catalogo.nombre, "num_sesiones_total": 1}

    fecha = next((s.fecha for s in estado["_candidatas"] if _es_previa(s) and s.fecha), None)
    item.tratamientos_paciente.all().delete()
    for campo, valor in campos_item(trat, clinica).items():
        setattr(item, campo, valor)
    sin_cita = sesiones - estado["con_cita"]
    item.sesiones_previas_consumidas = sin_cita
    item.save()

    total = item.num_sesiones_efectivas()
    _validar_rango(
        sesiones, minimo=estado["con_cita"], maximo=max(estado["con_cita"], total), total=total,
        con_cita=estado["con_cita"], agendadas=0,
    )
    return crear_protocolo(item, sin_cita, fecha=fecha)


def corregir(clinica, item_id, *, sesiones, tratamiento=None, motivo, usuario, request=None) -> CorreccionSoporte:
    """Corrige las sesiones previas y, si viene `tratamiento`, el tratamiento del paquete."""
    from apps.cotizaciones.models import ItemCotizacion

    motivo = (motivo or "").strip()
    if not motivo:
        error("Escribe el motivo.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        ItemCotizacion.objects.select_for_update().filter(pk=item_id).first()
        item, lote = _item_corregible(clinica, item_id)
        estado = _estado(item)
        if estado["bloqueo"]:
            error(estado["bloqueo"], "SESIONES_HECHAS_EN_APP")

        antes = estado["previas"]
        tratamiento_antes = item.descripcion
        manifest = lote.manifest or {}
        marcadas = desmarcadas = []
        if tratamiento:
            manifest["tratamientos_paciente"] = _cambiar_tratamiento(clinica, item, estado, tratamiento, sesiones)
        else:
            if sesiones == antes:
                error("El paquete ya tiene ese número de sesiones previas.", "SIN_CAMBIOS")
            _validar_rango(
                sesiones, minimo=estado["minimo"], maximo=estado["maximo"], total=estado["total"],
                con_cita=estado["con_cita"], agendadas=estado["agendadas_en_app"],
            )
            item.sesiones_previas_consumidas = sesiones - estado["con_cita"]
            item.save(update_fields=["sesiones_previas_consumidas", "updated_at"])
            marcadas, desmarcadas = _remarcar_previas(item, estado, sesiones - estado["con_cita"])

        # El resumen de la carga (pantalla de puesta en marcha) refleja la corrección.
        resumen_lote = manifest.get("resumen")
        if resumen_lote:
            total = item.num_sesiones_efectivas()
            resumen_lote["sesiones_total"] = total
            resumen_lote["sesiones_realizadas"] = sesiones
            resumen_lote["sesiones_pendientes"] = max(0, total - sesiones)
        lote.manifest = manifest
        lote.save(update_fields=["manifest"])

        resumen = {
            "lote": str(lote.id),
            "paquete": item.descripcion,
            "sesiones_antes": antes,
            "sesiones_despues": sesiones,
            "sesiones_marcadas": marcadas,
            "sesiones_desmarcadas": desmarcadas,
        }
        detalle = {"paquete": item.descripcion, "sesiones_antes": antes, "sesiones_despues": sesiones}
        if tratamiento:
            resumen.update(tratamiento_antes=tratamiento_antes, tratamiento_despues=item.descripcion)
            detalle.update(tratamiento_antes=tratamiento_antes, tratamiento_despues=item.descripcion)
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.CORREGIR_SESIONES_PREVIAS, cita=None,
            paciente=item.cotizacion.paciente, item_origen=item,
            accion_cobro=CorreccionSoporte.AccionCobro.SIN_COBRO, motivo=motivo, usuario=usuario,
            resumen=resumen, detalle=detalle,
        )

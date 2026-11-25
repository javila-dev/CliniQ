"""Cambiar el tratamiento de una venta ya aceptada (soporte, console).

Quien cotizó eligió el tratamiento equivocado, la venta se aceptó y el paciente
ya tiene citas hechas o agendadas. Se hace lo mismo que al corregir un paquete
migrado (``sesiones_previas._cambiar_tratamiento``): el ítem pasa al tratamiento
correcto del catálogo, su protocolo se rehace y soporte elige a qué sesión del
tratamiento nuevo pasa cada atención, que conserva lo registrado en ella.

Lo vendido en dinero no cambia: el precio del ítem, el total, los pagos, la
cartera y las comisiones siguen igual. Si la clínica quiere cobrar una
diferencia, la cotiza aparte. Los documentos que el paciente ya firmó (compromiso
de pago, consentimientos de la venta) siguen siendo lo que firmó: la vista previa
avisa para que la clínica decida si los firma de nuevo.

Solo ítems de tratamiento del catálogo: en uno de procedimiento el número de
sesiones es parte del precio (``num_citas`` × valor) y cambiarlo cambiaría lo
cobrado.
"""

from django.db import transaction

from apps.agenda import soporte
from apps.agenda.models import CorreccionSoporte
from apps.agenda.sesiones_previas import _cambiar_tratamiento, _estado, _protocolo_payload, _publico
from apps.agenda.soporte import error


def _avisos(item) -> list[dict]:
    """Lo que la clínica debe revisar después del cambio: no lo bloquea."""
    from apps.consentimientos.models import Consentimiento

    firmados = Consentimiento.objects.filter(cotizacion=item.cotizacion, estado=Consentimiento.Estado.FIRMADO)
    avisos = []
    aceptacion = firmados.filter(plantilla__isnull=True)
    if aceptacion.exists():
        avisos.append({"code": "COMPROMISO_FIRMADO", "texto": (
            f"El documento de aceptación firmado nombra «{item.descripcion}». Sigue valiendo por el mismo monto; "
            "si la clínica quiere el tratamiento correcto en el papel, que el paciente firme uno nuevo."
        )})
    if aceptacion.filter(alcance_aceptacion__in=[
        Consentimiento.AlcanceAceptacion.PROMOCIONAL, Consentimiento.AlcanceAceptacion.AMBOS,
    ]).exists():
        avisos.append({"code": "COMPRA_PROMOCIONAL_FIRMADA", "texto": (
            "El paciente firmó las condiciones de compra promocional: la compra no se reemplaza por otro "
            "tratamiento. Usa este cambio solo para corregir un error al cotizar, no para cambiarle el "
            "tratamiento a pedido del paciente."
        )})
    otros = firmados.filter(plantilla__isnull=False).count()
    if otros:
        avisos.append({"code": "DOCUMENTOS_FIRMADOS", "texto": (
            f"La venta tiene {otros} documento{'s' if otros != 1 else ''} firmado{'s' if otros != 1 else ''} "
            "con el tratamiento anterior: revisa si el paciente debe firmarlo de nuevo."
        )})
    return avisos


def _ventas(clinica):
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion

    return ItemCotizacion.objects.filter(
        cotizacion__clinica=clinica, cotizacion__estado=Cotizacion.Estado.ACEPTADA,
        activo=True, es_obsequio=False, tipo=ItemCotizacion.Tipo.TRATAMIENTO,
    ).select_related("cotizacion", "cotizacion__paciente", "tratamiento")


def ventas_del_paciente(clinica, paciente) -> list[dict]:
    """Los tratamientos vendidos al paciente (sin los de la puesta en marcha, que
    se corrigen en su propia herramienta), con sus atenciones."""
    items = _ventas(clinica).filter(cotizacion__paciente=paciente, cotizacion__es_migracion=False)
    return [
        {
            "item_id": str(i.id),
            "cotizacion_id": str(i.cotizacion_id),
            "descripcion": i.descripcion,
            "aceptada_en": i.cotizacion.aceptada_en,
            "valor": str(i.subtotal),
            "avisos": _avisos(i),
            **_publico(_estado(i)),
        }
        for i in items.order_by("-cotizacion__aceptada_en", "created_at")
    ]


def _item_vendido(clinica, item_id):
    from apps.cotizaciones.models import Cotizacion, ItemCotizacion

    item = (
        ItemCotizacion.objects.select_related("cotizacion", "cotizacion__paciente", "tratamiento")
        .filter(pk=item_id, cotizacion__clinica=clinica, activo=True)
        .first()
    )
    if item is None:
        error("La venta no existe en esta clínica.", "ITEM_NO_ENCONTRADO")
    if item.cotizacion.estado != Cotizacion.Estado.ACEPTADA:
        error("La cotización no está aceptada: se corrige editándola.", "VENTA_NO_ACEPTADA")
    if item.cotizacion.es_migracion:
        error(
            "Este paquete llegó por la puesta en marcha: se corrige en «Corregir paquete migrado».",
            "ITEM_MIGRADO",
        )
    if item.es_obsequio or item.tipo != ItemCotizacion.Tipo.TRATAMIENTO:
        error("Solo se cambia un tratamiento del catálogo vendido.", "SOLO_TRATAMIENTOS")
    return item


def cambiar(
    clinica, item_id, *, tratamiento, asignaciones=(), motivo="", usuario=None, request=None, confirmar=True,
):
    """Pasa la venta al tratamiento ``tratamiento`` (id del catálogo). Cada
    atención del paquete va a la sesión que dice ``asignaciones``. Con
    ``confirmar=False`` hace todo, devuelve cómo queda y lo descarta."""
    from apps.cotizaciones.models import ItemCotizacion

    motivo = (motivo or "").strip()
    if confirmar and not motivo:
        error("Escribe el motivo.", "MOTIVO_REQUERIDO")

    with transaction.atomic():
        ItemCotizacion.objects.select_for_update().filter(pk=item_id).first()
        item = _item_vendido(clinica, item_id)
        if str(item.tratamiento_id) == str(tratamiento):
            error("La venta ya tiene ese tratamiento.", "SIN_CAMBIOS")
        estado = _estado(item)
        antes = item.descripcion
        total_antes = estado["total"]
        valor = str(item.subtotal)

        _, movidas = _cambiar_tratamiento(
            clinica, item, estado, {"tipo": "tratamiento", "tratamiento": tratamiento}, 0, asignaciones,
        )
        total = item.num_sesiones_efectivas()

        if not confirmar:
            vista = {
                "descripcion": item.descripcion,
                "total": total,
                "previas": 0,
                "restantes": item.citas_restantes(),
                "protocolo": _protocolo_payload(item),
                "atenciones_movidas": movidas,
            }
            transaction.set_rollback(True)
            return vista

        cambio = {
            "paquete": item.descripcion,
            "tratamiento_antes": antes,
            "tratamiento_despues": item.descripcion,
            "sesiones_total_antes": total_antes,
            "sesiones_total_despues": total,
            "valor": valor,
            "atenciones_movidas": movidas,
        }
        return soporte.registrar(
            request,
            clinica=clinica, tipo=CorreccionSoporte.Tipo.CAMBIAR_TRATAMIENTO, cita=None,
            paciente=item.cotizacion.paciente, item_origen=item,
            accion_cobro=CorreccionSoporte.AccionCobro.SIN_COBRO, motivo=motivo, usuario=usuario,
            resumen={"cotizacion": str(item.cotizacion_id), **cambio}, detalle=cambio,
        )

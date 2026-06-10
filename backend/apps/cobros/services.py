from django.db import transaction
from django.utils import timezone

from apps.cobros.models import Cobro, ItemCobro, PagoRecibido
from apps.inventario.models import MovimientoInventario


@transaction.atomic
def agregar_item_cobro(cobro: Cobro, item_data: dict, user) -> ItemCobro:
    tipo = item_data["tipo"]
    servicio = item_data.get("servicio")
    insumo = item_data.get("insumo")

    descripcion = item_data.get("descripcion", "")
    costo_unitario = 0

    if tipo == ItemCobro.TipoItem.SERVICIO:
        if not servicio:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"error": "El ítem de tipo servicio requiere un servicio.", "code": "SERVICIO_REQUERIDO"}
            )
        if not descripcion:
            descripcion = servicio.nombre

    if tipo in {ItemCobro.TipoItem.INSUMO_CONSUMO, ItemCobro.TipoItem.PRODUCTO_RETAIL}:
        if not insumo:
            from rest_framework.exceptions import ValidationError
            raise ValidationError(
                {"error": "El ítem de tipo insumo requiere un insumo.", "code": "INSUMO_REQUERIDO"}
            )
        if not descripcion:
            descripcion = insumo.nombre
        costo_unitario = insumo.costo_promedio

        from apps.inventario.services import registrar_salida
        origen = (
            MovimientoInventario.OrigenMovimiento.CONSUMO_CITA
            if tipo == ItemCobro.TipoItem.INSUMO_CONSUMO
            else MovimientoInventario.OrigenMovimiento.VENTA_RETAIL
        )
        registrar_salida(
            insumo=insumo,
            cantidad=item_data["cantidad"],
            origen=origen,
            referencia_id=cobro.id,
            referencia_tipo="cobro",
            user=user,
        )

    cantidad = item_data["cantidad"]
    precio_unitario = item_data["precio_unitario"]
    subtotal = cantidad * precio_unitario

    item = ItemCobro.objects.create(
        cobro=cobro,
        tipo=tipo,
        servicio=servicio,
        insumo=insumo,
        descripcion=descripcion,
        cantidad=cantidad,
        precio_unitario=precio_unitario,
        costo_unitario=costo_unitario,
        subtotal=subtotal,
    )

    cobro.recalcular_totales()
    _actualizar_estado_cobro(cobro)
    return item


@transaction.atomic
def registrar_pago(cobro: Cobro, pago_data: dict, user) -> PagoRecibido:
    if cobro.estado == Cobro.Estado.ANULADO:
        from rest_framework.exceptions import ValidationError
        raise ValidationError(
            {"error": "No se puede registrar un pago en un cobro anulado.", "code": "COBRO_ANULADO"}
        )

    pago = PagoRecibido.objects.create(
        cobro=cobro,
        medio_pago=pago_data["medio_pago"],
        valor=pago_data["valor"],
        referencia=pago_data.get("referencia", ""),
        fecha=pago_data.get("fecha", timezone.now()),
        recibido_por=user,
    )

    cobro.recalcular_totales()
    if cobro.origen == Cobro.Origen.COTIZACION:
        Cobro.objects.filter(pk=cobro.pk).update(fecha=pago.fecha)
    cobro.refresh_from_db()
    _actualizar_estado_cobro(cobro)
    return pago


def _actualizar_estado_cobro(cobro: Cobro):
    saldo = cobro.saldo_pendiente
    if cobro.estado == Cobro.Estado.ANULADO:
        return
    if saldo <= 0:
        nuevo_estado = Cobro.Estado.PAGADO
    elif cobro.pagos.exists():
        nuevo_estado = Cobro.Estado.PAGADO_PARCIAL
    else:
        nuevo_estado = Cobro.Estado.PENDIENTE

    Cobro.objects.filter(pk=cobro.pk).update(estado=nuevo_estado)
    cobro.estado = nuevo_estado

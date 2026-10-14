from decimal import Decimal

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
                {"error": "El ítem de tipo procedimiento requiere un procedimiento.", "code": "SERVICIO_REQUERIDO"}
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

        from apps.inventario.services import get_or_crear_stock, registrar_salida
        costo_unitario = get_or_crear_stock(insumo, cobro.sede).costo_promedio
        origen = (
            MovimientoInventario.OrigenMovimiento.CONSUMO_CITA
            if tipo == ItemCobro.TipoItem.INSUMO_CONSUMO
            else MovimientoInventario.OrigenMovimiento.VENTA_RETAIL
        )
        registrar_salida(
            insumo=insumo,
            sede=cobro.sede,
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
    from rest_framework.exceptions import ValidationError

    # Bloquear el cobro: dos pagos simultáneos (doble clic, dos pestañas) se
    # validan uno después del otro contra el saldo real.
    cobro = Cobro.objects.select_for_update().get(pk=cobro.pk)
    if cobro.estado == Cobro.Estado.ANULADO:
        raise ValidationError(
            {"error": "No se puede registrar un pago en un cobro anulado.", "code": "COBRO_ANULADO"}
        )
    valor = Decimal(pago_data["valor"])
    if valor <= 0:
        raise ValidationError({"valor": ["El valor debe ser mayor a cero."], "code": "VALOR_INVALIDO"})

    # El cobro de una cotización acumula los abonos de la cartera (su total es lo
    # pagado): no tiene saldo propio contra el cual validar.
    if cobro.origen != Cobro.Origen.COTIZACION:
        tiene_pagos = cobro.pagos.exists()
        saldo = cobro.saldo_pendiente
        if tiene_pagos and saldo <= 0:
            raise ValidationError(
                {"error": "Este ingreso ya está pagado por completo.", "code": "COBRO_YA_PAGADO"}
            )
        # Ningún pago se pasa del saldo. La única excepción es un cobro sin valor
        # (cita sin procedimiento, total $0): ahí el primer pago fija lo cobrado.
        if (tiene_pagos or cobro.total > 0) and valor > saldo:
            raise ValidationError(
                {
                    "valor": [f"El valor supera el saldo pendiente (${saldo:,.0f}).".replace(",", ".")],
                    "code": "PAGO_SUPERA_SALDO",
                }
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


@transaction.atomic
def reversar_pago(cobro: Cobro, pago: PagoRecibido) -> Cobro:
    """Elimina un pago mal registrado y recalcula el cobro (y la cuota, si era un abono).

    Los cierres de caja ya hechos guardan sus totales, así que no cambian.
    """
    from rest_framework.exceptions import ValidationError

    from apps.cartera.models import AbonoCuota, CuotaCartera

    cobro = Cobro.objects.select_for_update().get(pk=cobro.pk)
    if cobro.estado == Cobro.Estado.ANULADO:
        raise ValidationError({"error": "El ingreso está anulado.", "code": "COBRO_ANULADO"})
    if pago.es_migracion:
        raise ValidationError(
            {"error": "Los pagos cargados en la puesta en marcha se revierten desde allí.", "code": "PAGO_MIGRACION"}
        )
    for abono in AbonoCuota.objects.filter(pago=pago).select_related("cuota"):
        cuota = CuotaCartera.objects.select_for_update().get(pk=abono.cuota_id)
        cuota.valor_pagado = max(Decimal(cuota.valor_pagado or 0) - abono.valor, Decimal("0"))
        cuota.pagada = cuota.saldo_pendiente <= 0
        cuota.save(update_fields=["valor_pagado", "pagada", "updated_at"])
        abono.delete()
    pago.delete()
    cobro.recalcular_totales()
    cobro.refresh_from_db()
    _actualizar_estado_cobro(cobro)
    return cobro

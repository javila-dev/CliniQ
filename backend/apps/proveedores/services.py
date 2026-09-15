from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventario.models import MovimientoInventario, StockInsumoSede
from apps.proveedores.models import ItemOrdenCompra, OrdenCompra


@transaction.atomic
def recibir_orden(
    orden_id,
    items_recibidos: list[dict],
    user,
    numero_factura_proveedor: str = "",
    fecha_factura_proveedor=None,
) -> OrdenCompra:
    if not items_recibidos:
        raise ValidationError({"error": "Debes enviar al menos un item a recibir.", "code": "SIN_ITEMS"})

    orden = (
        OrdenCompra.objects.select_for_update()
        .select_related("proveedor", "sede")
        .prefetch_related("items__insumo")
        .get(pk=orden_id)
    )

    if orden.estado == OrdenCompra.Estado.CANCELADA:
        raise ValidationError(
            {"error": "No se puede recibir una orden cancelada.", "code": "ORDEN_CANCELADA"}
        )

    if orden.estado == OrdenCompra.Estado.RECIBIDA_TOTAL:
        raise ValidationError(
            {"error": "La orden ya fue recibida totalmente.", "code": "ORDEN_RECIBIDA_TOTAL"}
        )

    items_por_id = {
        str(item.id): item
        for item in ItemOrdenCompra.objects.select_for_update()
        .select_related("insumo", "orden__proveedor")
        .filter(orden=orden, activo=True)
    }

    procesados = set()
    for payload in items_recibidos:
        item_id = str(payload.get("item_id", ""))
        cantidad = payload.get("cantidad")

        if item_id not in items_por_id:
            raise ValidationError(
                {"error": "Uno de los items no pertenece a la orden.", "code": "ITEM_INVALIDO"}
            )

        item = items_por_id[item_id]
        if item_id in procesados:
            raise ValidationError(
                {"error": "No puedes repetir items en la misma recepcion.", "code": "ITEM_DUPLICADO"}
            )
        procesados.add(item_id)

        if cantidad is None:
            raise ValidationError(
                {"error": "La cantidad recibida es obligatoria.", "code": "CANTIDAD_REQUERIDA"}
            )

        cantidad = Decimal(str(cantidad))
        if cantidad <= 0:
            raise ValidationError(
                {"error": "La cantidad recibida debe ser mayor a 0.", "code": "CANTIDAD_INVALIDA"}
            )

        pendiente = item.pendiente_recibir
        if cantidad > pendiente:
            raise ValidationError(
                {
                    "error": f"La cantidad recibida para '{item.insumo.nombre}' supera lo pendiente.",
                    "code": "CANTIDAD_EXCEDE_PENDIENTE",
                }
            )

        insumo = item.insumo
        stock, _ = StockInsumoSede.objects.select_for_update().get_or_create(insumo=insumo, sede=orden.sede)
        stock_anterior = stock.stock_actual
        costo_actual = stock.costo_promedio
        nuevo_stock = stock_anterior + cantidad

        if nuevo_stock <= 0:
            nuevo_costo = item.precio_unitario
        elif stock_anterior <= 0:
            nuevo_costo = item.precio_unitario
        else:
            nuevo_costo = (
                (stock_anterior * costo_actual) + (cantidad * item.precio_unitario)
            ) / nuevo_stock

        item.cantidad_recibida += cantidad
        item.save(update_fields=["cantidad_recibida", "updated_at"])

        stock.stock_actual = nuevo_stock
        stock.costo_promedio = nuevo_costo.quantize(Decimal("0.01"))
        stock.save(update_fields=["stock_actual", "costo_promedio", "updated_at"])

        MovimientoInventario.objects.create(
            insumo=insumo,
            sede=orden.sede,
            tipo=MovimientoInventario.TipoMovimiento.ENTRADA,
            cantidad=cantidad,
            costo_unitario=item.precio_unitario,
            costo_promedio_resultante=stock.costo_promedio,
            stock_resultante=stock.stock_actual,
            origen=MovimientoInventario.OrigenMovimiento.COMPRA,
            referencia_id=orden.id,
            referencia_tipo="orden_compra",
            realizado_por=user,
        )

    activos = orden.items.filter(activo=True)
    if activos.exists() and all(item.cantidad_recibida >= item.cantidad for item in activos):
        orden.estado = OrdenCompra.Estado.RECIBIDA_TOTAL
    else:
        orden.estado = OrdenCompra.Estado.RECIBIDA_PARCIAL

    update_fields = ["estado", "updated_at"]
    if numero_factura_proveedor:
        orden.numero_factura_proveedor = numero_factura_proveedor
        update_fields.append("numero_factura_proveedor")
    if fecha_factura_proveedor:
        orden.fecha_factura_proveedor = fecha_factura_proveedor
        update_fields.append("fecha_factura_proveedor")
    orden.save(update_fields=update_fields)

    return orden

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventario.models import MovimientoInventario
from apps.proveedores.models import ItemOrdenCompra, OrdenCompra


@transaction.atomic
def recibir_orden(orden_id, items_recibidos: list[dict], user) -> OrdenCompra:
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
        stock_anterior = insumo.stock_actual
        costo_actual = insumo.costo_promedio
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

        insumo.stock_actual = nuevo_stock
        insumo.costo_promedio = nuevo_costo.quantize(Decimal("0.01"))
        insumo.save(update_fields=["stock_actual", "costo_promedio", "updated_at"])

        MovimientoInventario.objects.create(
            insumo=insumo,
            tipo=MovimientoInventario.TipoMovimiento.ENTRADA,
            cantidad=cantidad,
            costo_unitario=item.precio_unitario,
            costo_promedio_resultante=insumo.costo_promedio,
            stock_resultante=insumo.stock_actual,
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
    orden.save(update_fields=["estado", "updated_at"])

    return orden

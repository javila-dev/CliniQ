from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventario.models import Insumo, MovimientoInventario


@transaction.atomic
def registrar_salida(
    insumo: Insumo,
    cantidad,
    origen: str,
    referencia_id,
    referencia_tipo: str,
    user,
    costo_unitario=None,
) -> MovimientoInventario:
    insumo.refresh_from_db()
    if insumo.stock_actual < cantidad:
        raise ValidationError(
            {
                "error": f"Stock insuficiente para '{insumo.nombre}'. "
                f"Disponible: {insumo.stock_actual}, solicitado: {cantidad}.",
                "code": "STOCK_INSUFICIENTE",
            }
        )

    costo = costo_unitario if costo_unitario is not None else insumo.costo_promedio
    nuevo_stock = insumo.stock_actual - cantidad

    movimiento = MovimientoInventario.objects.create(
        insumo=insumo,
        tipo=MovimientoInventario.TipoMovimiento.SALIDA,
        cantidad=cantidad,
        costo_unitario=costo,
        costo_promedio_resultante=insumo.costo_promedio,
        stock_resultante=nuevo_stock,
        origen=origen,
        referencia_id=referencia_id,
        referencia_tipo=referencia_tipo,
        realizado_por=user,
    )

    Insumo.objects.filter(pk=insumo.pk).update(stock_actual=nuevo_stock)
    insumo.stock_actual = nuevo_stock
    return movimiento


@transaction.atomic
def registrar_ajuste(insumo: Insumo, cantidad_nueva, user, motivo: str) -> MovimientoInventario:
    if not motivo:
        raise ValidationError(
            {"error": "El motivo es obligatorio para ajustes manuales.", "code": "MOTIVO_REQUERIDO"}
        )

    insumo.refresh_from_db()
    diferencia = cantidad_nueva - insumo.stock_actual

    if diferencia == 0:
        raise ValidationError(
            {"error": "La cantidad nueva es igual al stock actual.", "code": "SIN_CAMBIO"}
        )

    tipo = (
        MovimientoInventario.TipoMovimiento.AJUSTE_POSITIVO
        if diferencia > 0
        else MovimientoInventario.TipoMovimiento.AJUSTE_NEGATIVO
    )
    cantidad_abs = abs(diferencia)

    movimiento = MovimientoInventario.objects.create(
        insumo=insumo,
        tipo=tipo,
        cantidad=cantidad_abs,
        costo_unitario=insumo.costo_promedio,
        costo_promedio_resultante=insumo.costo_promedio,
        stock_resultante=cantidad_nueva,
        origen=MovimientoInventario.OrigenMovimiento.AJUSTE_MANUAL,
        motivo=motivo,
        realizado_por=user,
    )

    Insumo.objects.filter(pk=insumo.pk).update(stock_actual=cantidad_nueva)
    insumo.stock_actual = cantidad_nueva
    return movimiento

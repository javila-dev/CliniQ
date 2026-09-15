from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.inventario.models import Insumo, MovimientoInventario, StockInsumoSede


def get_or_crear_stock(insumo: Insumo, sede) -> StockInsumoSede:
    stock, _ = StockInsumoSede.objects.select_for_update().get_or_create(insumo=insumo, sede=sede)
    return stock


@transaction.atomic
def registrar_salida(
    insumo: Insumo,
    sede,
    cantidad,
    origen: str,
    referencia_id,
    referencia_tipo: str,
    user,
    costo_unitario=None,
) -> MovimientoInventario:
    stock = get_or_crear_stock(insumo, sede)
    if stock.stock_actual < cantidad and not insumo.permite_stock_negativo:
        raise ValidationError(
            {
                "error": f"Stock insuficiente para '{insumo.nombre}' en {sede.nombre}. "
                f"Disponible: {stock.stock_actual}, solicitado: {cantidad}.",
                "code": "STOCK_INSUFICIENTE",
            }
        )

    costo = costo_unitario if costo_unitario is not None else stock.costo_promedio
    nuevo_stock = stock.stock_actual - cantidad

    movimiento = MovimientoInventario.objects.create(
        insumo=insumo,
        sede=sede,
        tipo=MovimientoInventario.TipoMovimiento.SALIDA,
        cantidad=cantidad,
        costo_unitario=costo,
        costo_promedio_resultante=stock.costo_promedio,
        stock_resultante=nuevo_stock,
        origen=origen,
        referencia_id=referencia_id,
        referencia_tipo=referencia_tipo,
        realizado_por=user,
    )

    StockInsumoSede.objects.filter(pk=stock.pk).update(stock_actual=nuevo_stock)
    return movimiento


@transaction.atomic
def registrar_ajuste(insumo: Insumo, sede, cantidad_nueva, user, motivo: str) -> MovimientoInventario:
    if not motivo:
        raise ValidationError(
            {"error": "El motivo es obligatorio para ajustes manuales.", "code": "MOTIVO_REQUERIDO"}
        )

    stock = get_or_crear_stock(insumo, sede)
    diferencia = cantidad_nueva - stock.stock_actual

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
        sede=sede,
        tipo=tipo,
        cantidad=cantidad_abs,
        costo_unitario=stock.costo_promedio,
        costo_promedio_resultante=stock.costo_promedio,
        stock_resultante=cantidad_nueva,
        origen=MovimientoInventario.OrigenMovimiento.AJUSTE_MANUAL,
        motivo=motivo,
        realizado_por=user,
    )

    StockInsumoSede.objects.filter(pk=stock.pk).update(stock_actual=cantidad_nueva)
    return movimiento

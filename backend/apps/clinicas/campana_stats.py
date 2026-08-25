from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum, Value

from apps.cotizaciones.models import Cotizacion, ItemCotizacion

_ZERO = Value(Decimal("0.00"))
_ONE = Value(Decimal("1"))
_HUNDRED = Value(Decimal("100"))

_ITEM_SUBTOTAL = ExpressionWrapper(
    F("num_citas") * F("valor_unitario") * (_ONE - F("descuento_porcentaje") / _HUNDRED),
    output_field=DecimalField(max_digits=14, decimal_places=2),
)

_DEFAULT_STATS = {
    "cotizaciones_aceptadas": 0,
    "items_vendidos": 0,
    "monto_total": Decimal("0.00"),
}


def get_stats_map(campana_ids):
    """Aggregate sales stats for accepted cotizaciones grouped by campana_id."""
    if not campana_ids:
        return {}

    rows = (
        ItemCotizacion.objects.filter(
            campana_id__in=campana_ids,
            activo=True,
            cotizacion__estado=Cotizacion.Estado.ACEPTADA,
            cotizacion__activo=True,
        )
        .values("campana_id")
        .annotate(
            items_vendidos=Count("id"),
            cotizaciones_aceptadas=Count("cotizacion_id", distinct=True),
            monto_total=Sum(_ITEM_SUBTOTAL),
        )
    )
    return {row["campana_id"]: row for row in rows}


def format_campana_stats(campana_id, stats_map):
    row = stats_map.get(campana_id)
    if not row:
        return {
            "cotizaciones_aceptadas": _DEFAULT_STATS["cotizaciones_aceptadas"],
            "items_vendidos": _DEFAULT_STATS["items_vendidos"],
            "monto_total": "0.00",
        }
    monto = row["monto_total"] or Decimal("0.00")
    return {
        "cotizaciones_aceptadas": row["cotizaciones_aceptadas"],
        "items_vendidos": row["items_vendidos"],
        "monto_total": f"{monto:.2f}",
    }

"""Precio de un procedimiento o tratamiento según la sede.

Regla única que usan la cotización, el cobro de cita directa, las promociones y
los obsequios:

- Precio de lista en una sede = el propio de esa sede (``PrecioSede``) o, si no
  tiene, el general (``Servicio.precio_base`` / ``TratamientoCatalogo.precio_estimado``).
- El descuento máximo es el general y se aplica sobre el precio de la sede.
- Una promoción ofrece su precio fijo o su % sobre el precio de la sede. Gana el
  más bajo: si la promoción no mejora el precio normal de la sede, no se ofrece.
"""

from decimal import ROUND_HALF_UP, Decimal


def _es_tratamiento(objeto) -> bool:
    from apps.clinicas.models import TratamientoCatalogo

    return isinstance(objeto, TratamientoCatalogo)


def precio_general(objeto) -> Decimal | None:
    if objeto is None:
        return None
    if _es_tratamiento(objeto):
        valor = objeto.precio_estimado
    else:
        valor = objeto.precio_base if objeto.precio_base is not None else objeto.precio
    return Decimal(str(valor)) if valor is not None else None


def _sede_id(sede):
    return getattr(sede, "id", sede)


def precio_sede(objeto, sede) -> Decimal | None:
    """Precio propio de la sede, o None si usa el general."""
    if objeto is None or sede is None:
        return None
    from apps.clinicas.models import PrecioSede

    filtro = {"tratamiento": objeto} if _es_tratamiento(objeto) else {"procedimiento": objeto}
    # Si ya vienen precargados (prefetch_related("precios_sede")), no consulta.
    cache = getattr(objeto, "_prefetched_objects_cache", {}).get("precios_sede")
    if cache is not None:
        sid = str(_sede_id(sede))
        return next((p.precio for p in cache if p.activo and str(p.sede_id) == sid), None)
    return (
        PrecioSede.objects.filter(sede_id=_sede_id(sede), activo=True, **filtro)
        .values_list("precio", flat=True)
        .first()
    )


def precio_lista(objeto, sede=None) -> Decimal | None:
    """Precio de lista en la sede (el propio o el general)."""
    propio = precio_sede(objeto, sede)
    return propio if propio is not None else precio_general(objeto)


def redondear_pesos(valor: Decimal) -> Decimal:
    return Decimal(valor).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def precio_promocion(item_campana, sede=None) -> Decimal | None:
    """Precio que ofrece un ítem de promoción en la sede.

    None si no se puede calcular o si no mejora el precio normal de la sede
    (nunca se ofrece una promoción más cara que el precio de lista).
    """
    objeto = item_campana.procedimiento or item_campana.tratamiento
    lista = precio_lista(objeto, sede)
    if item_campana.descuento_pct is not None:
        if lista is None:
            return None
        precio = redondear_pesos(lista * (Decimal("1") - Decimal(item_campana.descuento_pct) / Decimal("100")))
    else:
        precio = item_campana.precio_campana
    if precio is None or (lista is not None and precio >= lista):
        return None
    return precio

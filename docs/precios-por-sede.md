# Precios por sede

Decidido el 2026-10-10.

## Regla

- Un procedimiento o tratamiento tiene un **precio general** y puede tener un
  **precio propio en algunas sedes** (`clinicas.PrecioSede`). La sede sin precio
  propio usa el general.
- Por sede **solo cambia el precio**. El descuento máximo es el general y se
  aplica sobre el precio de cada sede.
- Una sola regla en el backend, `backend/apps/clinicas/precios.py`
  (`precio_lista`, `precio_promocion`), y su espejo en el front,
  `frontend/src/lib/precios.ts`. La usan:
  - la cotización (precarga, bloqueo de precio, tope de descuento, obsequios);
  - el cobro de cita directa y el precio que muestra la cita (sede de la cita);
  - las promociones.

## Promociones

- Cada ítem de una promoción es un **precio fijo** o un **% de descuento**
  (`CampanaItem.precio_campana` o `descuento_pct`). El % se calcula sobre el
  precio de cada sede y se redondea a pesos.
- **Gana el precio más bajo**: si una promoción no mejora el precio normal de una
  sede, ahí no se ofrece. Si hay varias promociones vigentes, se ofrece la más
  barata.
- Al armar la promoción, si un precio fijo queda igual o por encima del precio de
  alguna de sus sedes, la pantalla avisa y ofrece **quitar esa sede** o **pasar a %**.

## Cotización

- Al elegir un ítem del catálogo se usa el precio de la sede de la cotización, y
  se marca "Precio de {sede}" cuando es un precio propio.
- Si se cambia la sede, los ítems que seguían con el precio de la sede anterior
  pasan al de la nueva (con aviso); los que se cambiaron a mano no se tocan.
- Si un mismo guardado cambia la sede, los precios se validan con la nueva.

## Catálogo

- Procedimientos y tratamientos: sección plegable **"Precio distinto por sede"**
  (solo con más de una sede). Cada sede muestra el precio general como ejemplo;
  vacío = usa el general. Se ve la diferencia ("−14% vs general").
- En los listados del catálogo: "2 sedes con precio propio" bajo el precio.

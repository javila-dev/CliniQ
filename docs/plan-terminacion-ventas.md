# Terminación de ventas

Plan del 2026-11-14. Implementado en la rama local `feature/terminacion-ventas`
(backend con pruebas en `apps/cotizaciones/tests_terminacion.py`, frontend con
`tsc` limpio). Probado en el navegador el 2026-11-14 sobre una copia de la base:
cancelar citas y cobrar X, "Las manejo yo" con el saldo completo, reanudar, lista
de ventas y rechazo de agendar (`VENTA_TERMINADA`).

## El caso

El paciente compró un paquete, no ha terminado de pagar ni ha hecho todas sus
sesiones, y decide no continuar. Hoy la venta queda `aceptada` para siempre:

- Sus sesiones siguen pendientes. Aparece en "Paquetes sin movimiento", el
  seguimiento le manda recordatorios y Nueva cita la sigue ofreciendo.
- Su saldo sigue vivo. Si hay cuotas vencidas, el paciente queda en mora y no
  se le puede recibir en recepción por ninguna otra cosa.

## Decisiones (cerradas 2026-11-14)

| # | Decisión |
|---|---|
| D1 | Se termina la **venta completa** (la cotización aceptada), no un ítem. |
| D2 | La clínica elige qué pasa con el saldo: **perdonarlo** (queda en 0) o **cobrar un valor X** (entre 1 y el saldo pendiente). |
| D3 | **Fuera de alcance:** saldo a favor y devoluciones (el paciente pagó más de lo que usó). |
| D4 | Permiso propio, motivo obligatorio, registro en el log de acciones y opción de **reanudar** mientras no se haya tocado el dinero. |
| D5 | Si hay citas sin cerrar, se avisa y el usuario elige: **cancelarlas ahora** o **manejarlas a mano**. Las que están en atención nunca se cancelan solas. |

## Modelo

`Cotizacion` sigue en estado `aceptada`. "Terminada" se deriva de un campo,
igual que "vencida" se deriva de la vigencia. Todo lo que filtra por
`ACEPTADA` (ventas, KPI, cartera, agenda) sigue funcionando sin cambios, y la
venta sigue contando como vendida en su `aceptada_en`.

Campos nuevos en `Cotizacion`:

| Campo | Tipo | Uso |
|---|---|---|
| `terminada_en` | DateTime, null | Fecha de la terminación. `null` = no terminada. |
| `terminada_por` | FK usuario, null | Quién la terminó. |
| `motivo_terminacion` | choices | `economico`, `insatisfaccion`, `salud`, `traslado`, `no_responde`, `otro`. La lista es ajustable. |
| `nota_terminacion` | texto | Detalle libre. Obligatorio si el motivo es `otro`. |
| `saldo_al_terminar` | Decimal, null | Saldo pendiente en el momento de terminar. |
| `valor_perdonado` | Decimal, default 0 | Lo que la clínica no va a cobrar (`saldo_al_terminar − X`). |

Propiedad `esta_terminada` (`terminada_en is not None`). `estado_comercial`
**no cambia** (sigue `aceptada`): agregarle un valor rompía los filtros de
cotizaciones que ya usan `estado_comercial=aceptada`. La interfaz lee
`terminada_en`.

## Qué pasa al terminar

Todo ocurre en una transacción, con la cotización bloqueada (`select_for_update`).

### 1. Sesiones

- **Ningún ítem puede agendarse.** El serializer de citas y
  `_reservar_sesion_del_item` (`agenda/services.py`) rechazan con
  `VENTA_TERMINADA` (reprogramar una cita que ya existía sí se puede).
  `citas_restantes()` sigue diciendo cuántas faltaban, para que el avance no
  aparezca al 100 %. El endpoint `sesiones` devuelve `terminada: true`, y con
  eso Nueva cita no ofrece la venta y el panel de sesiones oculta "Agendar".
- **Tratamientos del paciente** (`TratamientoPaciente` de los ítems) pasan a
  `ABANDONADO`. Hoy ese estado existe y lo respetan el ritmo ("pausado"),
  "Paquetes sin movimiento" y la detección del seguimiento, pero nada lo
  activaba.
- **Ítems de procedimiento**: no tienen `TratamientoPaciente`. Por eso
  `reportes/paquetes.py` y `seguimiento/deteccion.py` también deben mirar
  `cotizacion.terminada_en`, no solo `ABANDONADO`.
- **Oportunidades de seguimiento abiertas** ligadas a la venta o a sus ítems se
  cierran como perdidas.

### 1b. Citas de la venta (decisión D5, 2026-11-14)

Si la venta tiene citas que no están cerradas, el modal las muestra y avisa
antes de terminar. Las citas completadas, canceladas o en "no asistió" no se
tocan ni se listan.

La vista previa las separa en tres grupos:

| Grupo | Estados | Qué es |
|---|---|---|
| Agendadas | `pendiente`, `confirmada`, con fecha desde hoy | Citas por venir. |
| Sin cerrar | `pendiente`, `confirmada`, con fecha pasada | Nadie las marcó como atendidas ni como "no asistió". |
| En atención | `en_espera`, `en_curso` | El paciente está en la clínica ahora. |

El usuario elige una de dos opciones (D5):

- **Cancelarlas ahora.** Se cancelan las agendadas y las sin cerrar, con el
  motivo "Venta terminada: <motivo>". Cada cancelación hace lo mismo que
  cancelar desde la agenda: libera la sesión del protocolo, devuelve los
  insumos al stock, deja el registro de confirmación y `cita.cancelar` en el
  log. Si la cita tiene un cobro con pagos, **se mantiene** (no hay
  devoluciones, D3).
- **Las manejo yo.** La venta se termina y las citas quedan como están. Se
  pueden atender (la sesión cuenta como hecha), reagendar o cancelar desde la
  agenda como siempre. Lo único que se bloquea es crear citas nuevas: una cita
  cancelada después ya no se puede reemplazar.

**Las citas en atención nunca se cancelan solas**, elija lo que elija: la
atención está ocurriendo y puede tener nota clínica e insumos. El modal las
muestra con el aviso "se cierran desde la agenda o la atención". No bloquean la
terminación.

Para no duplicar la lógica, la cancelación que hoy vive en
`CitaViewSet.cambiar_estado` (`agenda/views.py`, liberar sesiones, devolver
insumos, registro de confirmación) pasa a un servicio `cancelar_cita(cita, *,
motivo, usuario, accion_cobro)` que usan la vista y la terminación.

En la agenda, las citas que quedan de una venta terminada muestran la marca
"Venta terminada", para que recepción sepa por qué no puede agendar la
siguiente sesión.

### 2. Dinero

Solo si hay saldo pendiente. Si la venta está pagada completa, la sección no
aparece y solo se aplica lo de las sesiones.

**Perdonar el saldo (X = 0)**

- Las cuotas pendientes se cierran igual que en un acuerdo de pago
  (`aplicar_acuerdo_pago`). Una cuota con abono queda cerrada por lo abonado.
  Una sin abono queda `anulada=True`. Cada cambio deja su `CuotaCarteraLog`.
- `cartera.total` se recalcula como la suma de las cuotas vigentes, el mismo
  criterio que `partial_update` de cuotas (M6-26).
- `valor_perdonado = saldo`. Mora levantada.

**Cobrar un valor X (0 < X ≤ saldo)**

- Si X = saldo, el plan de cuotas no se toca: la deuda sigue tal cual.
- Si X < saldo, las cuotas pendientes se cierran como arriba y se crea **una
  cuota nueva** por X, con la fecha y la forma de pago que elija la clínica. Por
  defecto se proponen hoy y la forma de pago de la primera cuota pendiente.
- `valor_perdonado = saldo − X`. La cuota nueva es deuda real: si vence, genera
  mora como cualquier otra.

**Saldo en las pantallas.** El detalle de la cotización
(`get_saldo_pendiente`) y la lista de ventas (`saldo_venta`) calculan el saldo
con `total − pagado`. Pasan a calcularlo con `total − pagado − valor_perdonado`.
El total vendido no cambia; lo perdonado se muestra aparte.

**A verificar al implementar:** `cobros/services.py` y `cobros/serializers.py`
también calculan saldo (no deben aceptar pagos por encima del saldo nuevo), y
`cartera/views.py: resumen` suma totales de cartera.

### 3. Registro

`registrar_accion(request, "venta.terminar", cotizacion, {...})` con motivo,
saldo, X, valor perdonado, citas canceladas y oportunidades cerradas. Lleva su
etiqueta en `configuracion/log-acciones`.

## Reanudar

Se puede reanudar una venta terminada solo si **no se tocó el dinero**: no
había saldo, o se eligió X = saldo, que deja el plan de cuotas intacto.

- `terminada_en` y sus campos vuelven a `null`.
- Los `TratamientoPaciente` vuelven a `ACTIVO`, o a `COMPLETADO` si ya tenían
  todas sus sesiones hechas.
- **Las citas canceladas no se restauran.** Se reagendan a mano, y la pantalla
  lo avisa.
- Las oportunidades cerradas no se reabren.
- Queda en el log como `venta.reanudar`.

Si se perdonó algo, no se reanuda: se hace una venta nueva.

## Permiso

`cotizaciones.terminar` — "Terminar y reanudar ventas". Ningún rol lo trae por
defecto; el admin lo tiene por ser admin. Va en el grupo de cotizaciones de la
pantalla de roles. Aplican las mismas reglas de sede y de "solo su actividad
comercial" que `renovar` (`ACCIONES_EN_SU_SEDE`).

## API

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/cotizaciones/{id}/terminacion/` | Vista previa: sesiones hechas y pendientes, citas sin cerrar en sus tres grupos, oportunidades que se cierran, saldo, cuotas pendientes, si se puede reanudar. |
| POST | `/api/cotizaciones/{id}/terminar/` | `{motivo, nota, citas: "cancelar" \| "manual", modo: "perdonar" \| "cobrar", valor, fecha, forma_pago}`. `citas` es obligatorio solo si hay citas agendadas o sin cerrar. |
| POST | `/api/cotizaciones/{id}/reanudar/` | Sin cuerpo. |

Errores: `VENTA_NO_ACEPTADA`, `VENTA_YA_TERMINADA`, `ELEGIR_ACCION_CITAS`
(hay citas sin cerrar y no vino `citas`), `VALOR_FUERA_DE_RANGO`, `ACUERDO_PENDIENTE` (si hay un acuerdo de pago pendiente
de firma, se anula primero), `NO_REANUDABLE`.

## Frontend

- **Detalle de la venta** (`/ventas/[id]`, `CotizacionForm` en vista venta):
  botón "Terminar venta" para quien tenga el permiso. Abre un modal con:
  - motivo y nota;
  - resumen de la vista previa;
  - si hay citas sin cerrar: la lista por grupo (fecha, hora, profesional) y
    la elección "Cancelarlas ahora" o "Las manejo yo", sin opción marcada por
    defecto;
  - la elección de dinero: "Perdonar el saldo" o "Cobrar un valor" (con X,
    fecha y forma de pago; X viene con el saldo prellenado).
- **Venta terminada**: banner con la fecha, quién, el motivo y lo perdonado. Si
  se puede reanudar, botón "Reanudar". Se ocultan los botones de agendar.
- **Lista de ventas**: badge "Terminada" y filtro.
- **Ficha del paciente**: los tratamientos ya muestran "Abandonado"
  (`TratamientoCard`); no hay que cambiar nada.

## Fuera de alcance

- Terminar un solo ítem de la venta.
- Saldo a favor, devoluciones y notas crédito.
- Calcular X a partir de las sesiones usadas (prorrateo). La clínica escribe X.
- Acta de terminación firmada. Si la clínica la quiere, la maneja ella.

## Pruebas

La terminación toca `apps/agenda` (citas, reserva de sesiones) y
`permissions_catalog.py`, que son núcleo. Según la política de pruebas, va la
**suite completa** antes de llegar a `main`. Mientras se desarrolla:
`cotizaciones`, `cartera`, `cobros`, `agenda`, `seguimiento`, `reportes` y
`protocolos`.

Casos clave:

- Perdonar con cuotas sin abono, con abono parcial y vencidas: saldo 0, sin mora y `cartera.total` correcto.
- Cobrar X < saldo: una sola cuota nueva y mora si vence.
- Cobrar X = saldo: el plan queda intacto y se puede reanudar.
- No deja agendar más (serializer y `_reservar_sesion_del_item`).
- "Cancelarlas ahora": cancela las agendadas y las sin cerrar, libera sus sesiones, devuelve insumos y mantiene el cobro.
- "Las manejo yo": las citas quedan; se pueden atender, reagendar y cancelar, pero no reemplazar.
- Las citas en espera o en curso no se cancelan con ninguna de las dos opciones.
- Sin `citas` cuando hay citas sin cerrar: `ELEGIR_ACCION_CITAS`.
- Cancelar desde la agenda sigue funcionando igual tras extraer `cancelar_cita`.
- Desaparece de "Paquetes sin movimiento" y del seguimiento, tanto un tratamiento como un procedimiento.
- Sin el permiso: 403. De otra sede: 403.
- No se puede reanudar si se perdonó algo.

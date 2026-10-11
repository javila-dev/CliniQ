# M6 — Dinero: cobros, cartera, caja, resultados, reportes y dashboard

**Estado:** Revisado (10/10/2026) · **Sigue:** M7 · **Viene de:** M5

**Alcance.**
- *Pantallas:* Ingresos, Cartera, Resultados (Caja, Egresos, Resumen) y Dashboard, y el paso de pago del asistente de llegada.
- *Frontend:* `lib/api/cobros.ts`, `cartera.ts`, `caja.ts` y `reportes.ts`.
- *Backend:* `apps/cobros`, `apps/cartera`, `apps/caja`, `apps/reportes` y `apps/comisiones`.

**Antes de corregir.** M6-05, M6-08 y M6-20 tienen la misma raíz: se mezcla lo *facturado* (`Cobro.total` y `Cobro.fecha`) con lo *recaudado* (`PagoRecibido`), y todos los abonos de una cotización comparten un solo cobro. Conviene arreglarlos juntos. M6-01, M6-02 y M6-03 son los más urgentes, porque ocurren con el paciente enfrente.

## Hallazgos

| ID | Sev. | Categoría | Dónde | Qué ve el usuario | Causa | Arreglo sugerido | Conf. |
|---|---|---|---|---|---|---|---|
| ✅ M6-01 | Crítico | previsible | `frontend/src/app/(authenticated)/ingresos/page.tsx:152-158, 263-273, 666`; `backend/apps/cobros/services.py:264-285` | Registra un pago desde el detalle del ingreso, la ficha sigue mostrando el saldo anterior y el botón "Registrar pago", y vuelve a cobrar: **el pago queda duplicado**. | `ingresoDetalle` es una copia de la fila que no se vuelve a pedir al servidor. Además, el backend acepta sobrepagos (no compara contra el saldo, `valor` mínimo 0), acepta pagos sobre un cobro ya pagado y no usa `select_for_update`. | Detalle con `useQuery(['cobro', id])`. En el backend: bloquear la fila, exigir `0 < valor <= saldo` y rechazar si el cobro ya está pagado. | Confirmado |
| ✅ M6-02 | Crítico | previsible | `backend/apps/cartera/views.py:395-427`; `components/cartera/detalle/RegistrarPagoModal.tsx:85,163` | Con un doble clic o desde dos pestañas, **la misma cuota queda abonada dos veces**. | `get_object()` sin `select_for_update`. Además, `handleSubmit` es asíncrono por la validación zod, así que el segundo clic entra antes de que se desactive el botón. | `select_for_update` y validar el saldo dentro del bloqueo. En el frontend, desactivar el botón con `isSubmitting`. Agregar una clave de idempotencia. | Backend confirmado; doble clic probable |
| ✅ M6-03 | Alto | permisos | `backend/apps/cobros/views.py:46-55` | Quien solo tiene "ver cobros" puede cambiar por API la fecha, el descuento, la sede o el paciente de un ingreso. El descuento ni siquiera recalcula el total. | `update` y `partial_update` caen en el permiso por defecto, `cobros.ver`. | Quitar PUT y PATCH, o exigir `cobros.editar_items` y recalcular. | Confirmado |
| ✅ M6-04 | Alto | previsible | `backend/apps/cobros/views.py:39` | Al escribir en "Buscar paciente…" de Ingresos aparece "Error al cargar ingresos" (500). | `search_fields` usa `primer_nombre` y `primer_apellido`, que no existen. Los campos reales son `nombres` y `apellidos`. | Corregir los campos y agregar el documento. | Confirmado |
| ✅ M6-05 | Alto | previsible | `backend/apps/cobros/services.py:281-282`; `cartera/views.py:430-449`; `reportes/views.py:155-186, 216-247, 827` | Si un paciente paga hoy la cuota 5, "Ingresos hoy", "Total recaudado", la gráfica y el P&L **cuentan también las cuotas 1 a 4**. El P&L de meses pasados cambia. | El cobro único de la cotización acumula el total y mueve su fecha a la del último pago, y los reportes filtran por `cobro.fecha`. | Reportes de dinero recibido basados en `PagoRecibido.fecha` y `valor`. No mover `cobro.fecha`. | Confirmado |
| ✅ M6-06 | Alto | previsible | `backend/apps/cobros/views.py:235-241` | "Por cobrar" sale inflado con pagos mixtos. | `aggregate(Sum(pagos__valor), Sum(total))` hace un JOIN y suma `total` una vez por pago. | Dos agregados separados o una subconsulta. | Confirmado |
| ✅ M6-07 | Alto | roles / carga | `frontend/src/app/(authenticated)/resultados/egresos/page.tsx:216-222, 248`; `permissions_catalog.py:685-697` | Recepción ve "Registrar gasto", pero le sale "Esta sede no tiene caja configurada" y nunca puede registrar. | `/caja/sesiones/actual/` exige `caja.cierre.ver`, que Recepción no tiene, y el 403 se muestra como "sin caja". | Que `actual` acepte `caja.gastos.registrar`. Distinguir un error de "sin caja". | Confirmado |
| ✅ M6-08 | Alto | previsible | `backend/apps/cartera/views.py:456`; `backend/apps/caja/views.py:25-38, 178-187` | Un abono de cuota en efectivo no entra en el arqueo y la caja cierra con faltante o sobrante. | El pago se guarda a las 00:00 de `fecha_pago`, y queda fuera de la ventana del arqueo si hubo un cierre ese día o si es la primera sesión. | Guardar la hora real del registro, o medir el arqueo por `created_at`. | Confirmado |
| ✅ M6-09 | Alto | faltante | `frontend/src/lib/api/cobros.ts:41` (sin uso); `backend/apps/cobros/views.py:128-137` | Si se equivoca al digitar un pago ($500.000 en vez de $50.000), no hay forma de corregirlo: no existe un botón Anular ni se puede reversar un pago. | No existe una acción para reversar el pago, y anular exige reversarlo primero. | Agregar la acción `reversar_pago` (con `cobros.anular` y auditoría) y su botón. | Confirmado |
| M6-10 | Alto | permisos / sede | `backend/apps/cartera/views.py:99-125` | Una recepcionista de la sede A ve la cartera, los saldos y los indicadores de todas las sedes. | Los viewsets de cartera, cuotas y acuerdos no aplican `user_sede_ids_acotadas`. | Filtrar por `cotizacion__sede_id__in`. | Confirmado |
| M6-11 | Alto | previsible | `frontend/src/app/(authenticated)/ingresos/page.tsx:393` | Después de las 19:00, el atajo "Hoy" busca el día de mañana y la lista sale vacía justo al cerrar el día. | `toISOString()` devuelve la fecha en UTC. | Usar `todayISO()` o `toLocaleDateString('en-CA')`. | Confirmado |
| ✅ M6-12 | Medio | roles | `frontend/src/lib/permissions.ts:224`; `backend/apps/reportes/views.py:779`; `permissions_catalog.py:746` | Un rol "gerente" personalizado no ve Resumen/P&L, mientras que el Profesional por defecto sí puede pedir el P&L por API y ve "Ingresos hoy". | El frontend usa `rol === 'admin'` y el backend usa `reportes.ver_financieros`, que el Profesional tiene por defecto. | Usar el mismo permiso en ambos lados y revisar el default del Profesional. | Confirmado |
| M6-13 | Medio | previsible | `components/atenciones/IniciarAtencionWizard.tsx:118`; `PagoContent.tsx:50-67` | Si falla el pago después de crear el cobro, al reabrir el asistente el paso "Pago" aparece hecho. | El paso se marca con `cita.cobro_id != null`. | Basarse en el estado del cobro, o crear el cobro y el pago en un solo paso. | Confirmado |
| M6-14 | Medio | faltante | `components/atenciones/PagoContent.tsx:105-108, 137-147` | Al cobrar una cita directa no se puede pagar mitad en efectivo y mitad con tarjeta, ni hacer un pago parcial. Sí deja cobrar de más. El permiso "cambiar precio" no hace nada porque el campo está siempre bloqueado. | — | Permitir pago mixto o parcial y respetar `cobros.cambiar_precio`. | Confirmado |
| ✅ M6-15 | Medio | errores | `PagoContent.tsx:83-96`; `ingresos/page.tsx:136`; `RegistrarPagoModal.tsx:71-76` | Mensajes genéricos ("No se pudo registrar el cobro") cuando no hay formas de pago, el valor no es válido o la fecha es futura. | No se leen los errores por campo del 400. | Mostrar el error de cada campo y avisar si no hay formas de pago. | Confirmado |
| ✅ M6-16 | Medio | carga / errores | `resultados/caja/page.tsx:53-58, 88-97`; `cartera/page.tsx:73-77, 303-312, 424-448`; `cartera/[id]/page.tsx:40-46`; `egresos/page.tsx:65-69` | Si falla la carga, la pantalla dice "no tiene caja", "No hay cuotas vencidas", "No hay registros" o queda en blanco. | No se maneja `isError`, y `/cartera` no tiene `RoleGuard`. | Mostrar un estado de error con "Reintentar". | Confirmado |
| M6-17 | Medio | previsible | `backend/apps/caja/serializers.py:37-74, 145-147` | Deja registrar un gasto de $0 o negativo; un gasto negativo *sube* el efectivo esperado. El fondo de apertura también acepta negativos. | — | `min_value` en `valor` y en `monto_apertura`. | Confirmado |
| ✅ M6-18 | Medio | permisos | `cobros/serializers.py:74, 137-142`; `cartera/serializers.py:251, 273`; `caja/serializers.py`; `caja/views.py:305-307` | (Invisible.) Con un ID ajeno se puede crear un cobro o un acuerdo sobre datos de otra clínica. | Las relaciones (medio de pago, paciente, sede, cita, cotización, cartera, categoría) no se acotan a la clínica. | Querysets filtrados por la clínica activa. | Confirmado en código |
| ✅ M6-19 | Medio | faltante | `caja.gastos.aprobar`, `caja.categorias.ver` | El permiso "Aprobar o rechazar gastos" se puede asignar, pero no hace nada. | Los gastos no tienen estado de aprobación. | Implementar la aprobación o quitar el permiso. | Confirmado |
| ✅ M6-20 | Medio | previsible | `dashboard/page.tsx:1419-1431`; `reportes/views.py:166-176` | En "Cobros de hoy por medio", las filas suman pagos, pero el Total es lo facturado (Efectivo $50.000, Total $150.000). | — | Calcular el Total desde los pagos. | Confirmado |
| M6-21 | Medio | parámetros | `backend/apps/caja/views.py:247-253` | "Buscar descripción…" en Egresos no filtra. | Falta `search_fields`. | Agregarlo. | Confirmado |
| M6-22 | Medio | previsible | `frontend/src/lib/api/cartera.ts:86-117` | El modal "Cuotas vencidas" es lento (hasta 500 peticiones), se corta en 500 carteras y marca como vencida la cuota que vence hoy. | Recorre las carteras en el cliente, y `new Date('YYYY-MM-DD')` se interpreta en UTC. | Endpoint de cuotas vencidas en el backend. | Confirmado |
| M6-23 | Bajo | previsible | `ingresos/page.tsx:54-58` | Las fechas salen como mm/dd/aaaa: "03/10" se lee 3 de marzo. | — | Usar `formatFechaDMY`. | Confirmado |
| M6-24 | Bajo | permisos | `reportes/views.py:45-55` | El superadmin con una clínica activa ve en el dashboard los datos de todas las clínicas. | Usa `user.clinica` en vez de `get_clinica_activa`. | Corregirlo. | Confirmado |
| M6-25 | Bajo | errores | `backend/apps/caja/views.py:209` | Abrir la caja en dos pestañas a la vez da un error 500. | Choque con la `UniqueConstraint`. | Capturar el error y responder "ya está abierta". | Probable |
| M6-26 | Bajo | previsible | `backend/apps/cartera/views.py:376-390` | Por API, el monto de una cuota puede quedar por debajo de lo abonado, y el total de la cartera no se recalcula. | — | Validar el monto y recalcular el total. | Confirmado |
| M6-27 | Bajo | faltante | varios | Código muerto: `apps/comisiones` vacía, `IniciarPagoSheet.tsx` sin uso, `_pagos_queryset` y `_resumen_periodo` sin uso. `registrarPago` y `agregarItem` están mal tipados (devuelven `{pago\|item, cobro}`). `crear` devuelve un cobro existente aunque esté anulado. | — | Limpiar y corregir los tipos. | Confirmado |

## Pruebas no técnicas

Usuarios: Admin, Recepción (una sede), un rol personalizado de "gerente" y un usuario de la sede A.

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Ingresos → abrir un cobro pendiente → Registrar pago → mirar la ficha. | El saldo se actualiza; si quedó pagado, desaparece "Registrar pago". | M6-01 |
| 2 | Abrir el mismo cobro en dos pestañas y pagar el total en ambas. | La segunda se rechaza con un mensaje claro. | M6-01 |
| 3 | Cartera → una cuota → Cobrar → doble clic rápido en "Registrar pago". | Un solo abono en el historial. | M6-02 |
| 4 | Ingresos → escribir un nombre en "Buscar paciente…". | La lista se filtra, sin error. | M6-04 |
| 5 | Plan de 5 cuotas con 4 pagadas el mes pasado → pagar la 5.ª hoy → Dashboard. | "Ingresos hoy" muestra solo la 5.ª cuota. | M6-05 |
| 6 | Cobro de $100.000 pagado mitad en efectivo y mitad con tarjeta → Ingresos. | "Por cobrar" en $0. | M6-06 |
| 7 | Como Recepción, con la caja abierta → Resultados → Egresos → Registrar gasto. | Deja registrar. | M6-07 |
| 8 | Abrir caja a las 8:00, cerrar a las 13:00, reabrir a las 14:00 → cobrar una cuota de $30.000 en efectivo → cerrar. | Los ingresos en efectivo incluyen los $30.000. | M6-08 |
| 9 | Registrar un pago con un valor equivocado e intentar corregirlo. | Hay una forma de reversarlo o anularlo. | M6-09 |
| 10 | Con un usuario de la sede A → Cartera. | Solo aparecen pacientes y saldos de la sede A. | M6-10 |
| 11 | Después de las 19:00 → Ingresos → "Hoy". | Aparecen los cobros del día. | M6-11 |
| 12 | Rol personalizado con todos los permisos de finanzas → Resultados. | Ve la pestaña Resumen. | M6-12 |
| 13 | Asistente de llegada → Pago → desconectar internet al confirmar → cerrar y reabrir. | El paso Pago sigue pendiente. | M6-13 |
| 14 | Cobrar una cita de $200.000 con $100.000 en efectivo y $100.000 con tarjeta. | Se puede repartir el pago. | M6-14 |
| 15 | Registrar un gasto de "-5000". | Lo rechaza con un mensaje. | M6-17 |
| 16 | Egresos → buscar una palabra de la descripción. | Filtra. | M6-21 |
| 17 | Cartera → "Cuotas vencidas" el día en que vence una cuota. | Esa cuota no aparece como vencida. | M6-22 |
| 18 | Ingresos → mirar una fecha del 3 de octubre. | Dice 03/10/2026. | M6-23 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/cobros/cobros/?search=ana`, como Recepción. | 200 (hoy da 500). | M6-04 |
| 2 | `PATCH /api/v1/cobros/cobros/{id}/ {"descuento":"99999"}` con un usuario que solo tiene `cobros.ver`. | 403 o 405. | M6-03 |
| 3 | `POST /cobros/cobros/{id}/registrar_pago/` con `valor=0` y con un valor mayor al saldo. | 400. | M6-01 |
| 4 | `TransactionTestCase` con dos hilos: `PATCH /cartera/cuotas/{id}/registrar_pago/` por el saldo completo. | Un 200 y un 400. | M6-02 |
| 5 | `GET /caja/sesiones/actual/?sede=X`, como Recepción. | 200 (hoy 403). | M6-07 |
| 6 | Test: cerrar la sesión de caja, abrir otra, abonar una cuota en efectivo y pedir `actual`. | `total_ingresos` incluye el abono. | M6-08 |
| 7 | Test de `resumen`: cobro de 100 con dos pagos de 50. | `total_pendiente == "0.00"`. | M6-06 |
| 8 | `GET /reportes/dashboard/` tras abonar la cuota 5 (las cuotas 1 a 4, de otro mes). | `cobros_hoy.total_cop` igual a la cuota 5. | M6-05 |
| 9 | `GET /cartera/por-paciente/` con un usuario de la sede A. | Sin carteras de la sede B. | M6-10 |
| 10 | `POST /cartera/acuerdos/` con una cartera de otra clínica. | 400 o 404. | M6-18 |
| 11 | `POST /cobros/cobros/` con un `medio_pago` de otra clínica. | 400. | M6-18 |
| 12 | `POST /caja/gastos/` con `valor=-100`. | 400. | M6-17 |
| 13 | `GET /reportes/pyl/`, como Profesional por defecto. | Decidir: 403, o mostrarle la pestaña. | M6-12 |
| 14 | `GET /caja/gastos/?search=taxi`. | Solo coincidencias. | M6-21 |

## Notas

- `caja/sesiones/{pk}/` no tiene uso desde el frontend; es inofensivo.
- `caja.categorias.ver` usa `IsAuthenticated` a propósito.
- Los chequeos por rol fijo en caja, cartera y cobros solo sirven para el alcance del superadmin. Las excepciones son:
  - `resultadosPyL` (M6-12);
  - `GastoCajaViewSet._assert_editable`, que usa `user.es_admin`: un rol personalizado con `caja.gastos.editar` solo puede borrar sus propios gastos.
- La zona horaria es fija (`America/Bogota`). Un cliente en Chile vería los cortes del día desplazados.

# M5 — Comercial: cotizaciones, ventas y seguimiento

**Estado:** Revisado (10/10/2026) · **Sigue:** M6 · **Viene de:** M4

**Alcance:**
- *Frontend:* `cotizaciones/*`, `ventas/*`, `seguimiento/*`, `components/cotizaciones`, `components/seguimiento`, `lib/api/cotizaciones.ts`, `seguimiento.ts` y `lib/precios.ts`.
- *Backend:* `apps/cotizaciones` (PDF, aceptar, renovar, compromiso de pago, ventas) y `apps/seguimiento`.

**Antes de corregir:**
- M5-01 es el más importante. Las cotizaciones no respetan las sedes del usuario, a diferencia de ventas y seguimiento.
- Las rutas `seguimiento/oportunidades/detectar/` (la llama n8n) y `ventas/{pk}/` (inofensiva) no tienen uso en el frontend, y está bien así.

## Hallazgos

**M5-01 · Alto · permisos** · confirmado
- **Dónde:** `backend/apps/cotizaciones/views.py:115-142,860`.
- **Qué ve el usuario:** una recepcionista de la Sede Norte ve, abre, edita, acepta y descarta cotizaciones de la Sede Sur.
- **Causa:** no se usa `sede_ids_para_filtro`, que ventas y seguimiento sí usan. Además, al crear no se valida que la sede elegida sea del usuario.
- **Arreglo:** aplicar ese filtro en el listado, el detalle y `profesionales`, y validar la sede en el serializer.

**M5-02 · Alto · previsible** · confirmado
- **Dónde:** `backend/apps/cotizaciones/pdf.py:66`; `pdf_cotizacion.html:253`.
- **Qué ve el usuario:** el PDF que recibe el paciente dice "Sesiones: 1" en un paquete de 6, y la descripción dice "(6 sesiones)".
- **Causa:** usa `num_citas`.
- **Arreglo:** usar `item.num_sesiones_efectivas()`.

**M5-03 · Medio · parámetros** · confirmado
- **Dónde:** `CotizacionForm.tsx:254-274,364-367` vs `serializers.py:264-281`.
- **Qué ve el usuario:** con una promoción de $80 y un precio de lista de $100, escribe $90. La pantalla lo acepta, pero al guardar sale "No tienes permiso para bajar el precio".
- **Causa:** el backend solo permite el precio exacto de la promoción, mientras el frontend acepta cualquier valor entre la promoción y la lista.
- **Arreglo:** que el backend acepte cualquier valor mayor o igual al de la promoción.

**✅ M5-04 · Medio · errores** · confirmado
- **Dónde:** `CotizacionForm.tsx:59,1186,1779`.
- **Qué ve el usuario:** pulsa "Crear cotización" y no pasa nada. Ocurre con una fila de tratamiento sin elegir, o con Validez, Citas o Desc % vacíos.
- **Causa:** no hay `onInvalid` y el error no se muestra en esas secciones.
- **Arreglo:** un toast que diga qué falta, el error en cada fila y `z.coerce`.

**✅ M5-05 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `cotizaciones/[id]/page.tsx:31`; `ventas/[id]/page.tsx:31`.
- **Qué ve el usuario:** pantalla en blanco si la cotización no existe o da 403.

**✅ M5-06 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `cotizaciones/page.tsx:77-80,229-238`.
- **Qué ve el usuario:** si la carga falla, dice "No hay cotizaciones abiertas · Crear la primera".
- **Arreglo:** el mismo bloque de error de la pantalla de ventas.

**✅ M5-07 · Medio · errores** · confirmado (igual que M7-16)
- **Dónde:** `EnviarCotizacionModal.tsx:145-151`.
- **Qué ve el usuario:** con cualquier fallo de WhatsApp sale "Verifica que el paciente tenga teléfono", aunque el problema sea otro.
- **Arreglo:** mostrar `response.data.error`.

**M5-08 · Medio · API (campos)** · confirmado
- **Dónde:** `CotizacionForm.tsx:2095-2096`; `types/cotizaciones.ts`; `serializers.py:665-698`.
- **Qué ve el usuario:** al enviar por correo, el email aparece vacío aunque el paciente lo tenga. En WhatsApp nunca aparece "Se enviará al número…".
- **Arreglo:** que el serializer devuelva `paciente_telefono` y `paciente_email`, respetando el enmascarado.

**M5-09 · Medio · faltante** · confirmado
- **Dónde:** `lib/api/seguimiento.ts` (`reabrir`, `gestiones`); `seguimiento/views.py:166,189`.
- **Qué ve el usuario:** si saca a alguien de la lista por error, **no puede reabrirlo**. Tampoco ve el historial de llamadas.
- **Causa:** el backend existe, pero falta la interfaz.

**M5-10 · Medio · carga** · confirmado
- **Dónde:** `seguimiento/page.tsx:209`.
- **Qué ve el usuario:** "Para hoy 140", pero solo ve 100, sin aviso.
- **Arreglo:** paginar, o "Mostrando 100 de N · Cargar más".

**✅ M5-11 · Medio · llamada sin resolver** · confirmado (igual que M2-03)
- **Dónde:** `CotizacionForm.tsx:642-658`.
- **Qué ve el usuario:** crear un paciente desde la cotización con un documento duplicado no muestra ningún mensaje.

**M5-12 · Medio · permisos** · confirmado
- **Dónde:** `CotizacionForm.tsx:1125-1134`; `CobrosCotizacionPanel.tsx:85-89`.
- **Qué ve el usuario:** el Profesional, que no tiene `cobros.ver`, pulsa "Cobros" y ve "Sin cobros registrados" aunque los haya.
- **Arreglo:** ocultar el botón y manejar `isError`.

**M5-13 · Medio · previsible** · confirmado
- **Dónde:** `cotizaciones/views.py:161-171`.
- **Qué ve el usuario:** si se activa el compromiso de pago, las ventas viejas aparecen como "Pendiente de firma".
- **Causa:** el GET del detalle crea el documento en la base de datos.
- **Arreglo:** no generar documentos dentro de `retrieve`.

**M5-14 · Medio · concurrencia** · probable
- **Dónde:** `cotizaciones/services.py:76-109`; `views.py:237-288`.
- **Qué ve el usuario:** si dos personas aceptan la misma cotización a la vez, quedan cuotas duplicadas en la cartera o sale un error 500.
- **Arreglo:** `transaction.atomic` con `select_for_update`.

**M5-15 · Medio · roles** · confirmado (la intención está por decidir)
- **Dónde:** defaults de recepción en `permissions_catalog.py`; `cotizaciones/views.py:109-112`.
- **Qué ve el usuario:**
  - Recepción gestiona el seguimiento, pero no puede crear ni enviar cotizaciones (no tiene `cotizaciones.gestionar`).
  - Entregar un obsequio de producto exige `inventario.consumo.registrar`, que no se puede asignar desde Roles.
- **Arreglo:** decidirlo con el usuario y ajustar los defaults, o crear un permiso propio para la entrega.

**M5-16 · Medio · previsible** · probable
- **Dónde:** `services.py:225-258`; `views.py:217-235`.
- **Qué ve el usuario:** se edita un borrador con compromiso pendiente, el paciente firma y **la venta queda con cuotas que no suman el total**.
- **Arreglo:** validar el plan de pagos al editar o al aceptar por firma.

**M5-17 · Bajo · previsible** · confirmado
- **Dónde:** `CotizacionForm.tsx:1148`; `views.py:563,615`.
- **Qué ve el usuario:** "Enviar" aparece en cotizaciones descartadas, y enviarlas reactiva el seguimiento.
- **Arreglo:** permitir enviar solo borradores, en el frontend y en el backend.

**M5-18 · Bajo · permisos** · confirmado
- **Dónde:** `serializers.py:257-343`.
- **Qué pasa:** `cotizaciones.cambiar_precio` no permite bajar más allá del descuento máximo. Si el máximo es 0%, el permiso no sirve para nada, y eso confunde al configurar roles.
- **Arreglo:** decidir qué significa el permiso.

**M5-19 · Bajo · carga** · probable
- **Dónde:** `views.py:81-96`; `ventas.py:109-119`.
- **Qué ve el usuario:** los listados cargan lento.
- **Causa:** el listado usa el serializer completo, con varias consultas por ítem.
- **Arreglo:** un serializer liviano con prefetch.

**M5-20 · Bajo · API (campos)** · confirmado
- **Dónde:** `cotizaciones/page.tsx:262`.
- **Qué ve el usuario:** el listado no muestra la sede.
- **Causa:** el serializer no devuelve `sede_nombre`.

**M5-21 · Bajo · errores** · confirmado
- **Dónde:** `CotizacionForm.tsx:938-971`; `SesionesCotizacionPanel.tsx`.
- **Qué ve el usuario:** si falla la descarga del PDF, no pasa nada. Además, el botón no muestra que está cargando y cada clic registra otro envío.

**✅ M5-22 · Bajo · errores** · confirmado
- **Dónde:** `CotizacionForm.tsx:106`.
- **Qué ve el usuario:** sin ítems, aparece en inglés "Array must contain at least 1 element(s)".

**✅ M5-23 · Bajo · parámetros** · confirmado
- **Dónde:** `CotizacionForm.tsx:1910-1915`.
- **Qué ve el usuario:** al borrar la fecha de una forma de pago sale "Fecha con formato erróneo… YYYY-MM-DD".
- **Arreglo:** convertir `''` en `null`.

**M5-24 · Bajo · textos** · confirmado
- **Dónde:** `seguimiento/page.tsx:246-247`.
- **Qué pasa:** el aviso "Volverá a aparecer el día después de su cita" solo aplica a "Agendó". Hoy no tiene impacto, pero es frágil.

**M5-25 · Bajo · faltante** · confirmado
- **Dónde:** `seguimiento/page.tsx:268-289`.
- **Qué ve el usuario:** no puede vincular un interesado a un paciente que ya existe, solo crear otra ficha.

**M5-26 · Bajo · errores** · confirmado
- **Dónde:** `seguimiento/page.tsx:235-238`.
- **Qué ve el usuario:** aparece "X ya está en seguimiento", sin enlace para abrirlo, aunque el backend devuelve `oportunidad_id`.

**✅ M5-27 · Bajo · roles personalizados** · confirmado (casos borde)
- **Dónde:** `cotizaciones/page.tsx:53`; `seguimiento/page.tsx:175`.
- **Qué pasa:** el frontend decide "solo lo suyo" con `rol` o `es_profesional`, mientras el backend usa `comercial.ver_sede`.
- **Arreglo:** que `/me` exponga `ve_solo_su_actividad_comercial`.

**M5-28 · Bajo · permisos** · confirmado
- **Dónde:** `seguimiento/views.py:159`.
- **Qué pasa:** `ActualizarOportunidadSerializer` se crea sin `context`, así que se salta la validación de sede.
- **Arreglo:** pasar `context={"request": request}`.

**M5-29 · Bajo · permisos** · confirmado
- **Dónde:** `cotizaciones/views.py:123`.
- **Qué pasa:** un profesional limitado a "solo lo suyo" puede editar, aceptar o descartar, conociendo el id, la cotización de otro profesional.

**M5-30 · Bajo · varios** · confirmado
- **Qué pasa:**
  - Queda un `console.log('[PATCH payload]')` en `CotizacionForm.tsx:707`.
  - El PDF muestra "$1,500,000.00", mientras la interfaz muestra "$ 1.500.000" (`pdf.py:13-15`).
  - Ventas no tiene filtro "En mora", aunque el backend sí lo soporta.
  - La pestaña "Vendidas" incluye las cotizaciones migradas y Ventas no.

## Pruebas no técnicas

Usuarios: Recepción de una sola sede, un Profesional y un usuario sin "cambiar precio".

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Con Recepción de la Sede A → Cotizaciones → "Todas". | Solo ve la Sede A. | M5-01 |
| 2 | Cotizar un tratamiento de 6 sesiones → PDF. | La columna Sesiones dice 6. | M5-02 |
| 3 | Procedimiento de $100 con promoción de $80. Sin "cambiar precio", escribir $90 → Guardar. | Se guarda, o avisa antes de guardar. | M5-03 |
| 4 | "Agregar" un tratamiento sin elegirlo → Crear cotización. | Dice qué falta. | M5-04 |
| 5 | Borrar Validez → Guardar. | Aviso claro. | M5-04 |
| 6 | Abrir una cotización eliminada desde su enlace. | "No encontrada" y botón Volver. | M5-05 |
| 7 | Sin internet → Cotizaciones. | "No pudimos cargar" con Reintentar. | M5-06 |
| 8 | Enviar por WhatsApp sin el webhook configurado. | El mensaje explica que falta configurar WhatsApp. | M5-07 |
| 9 | Enviar por correo a un paciente que tiene email. | El email ya viene escrito. | M5-08 |
| 10 | Seguimiento → "Sacar de la lista" por error → intentar recuperarlo. | Existe "Reabrir". | M5-09 |
| 11 | Con más de 100 personas para hoy, recorrer la lista. | Se ven todas, o hay "Cargar más". | M5-10 |
| 12 | Desde la cotización, crear un paciente con un documento duplicado. | Sale un mensaje de error. | M5-11 |
| 13 | Como Profesional → venta con pagos → Cobros. | Ve los cobros, o el botón no aparece. | M5-12 |
| 14 | Activar el compromiso de pago → abrir una venta antigua. | No aparece "Pendiente de firma". | M5-13 |
| 15 | Como Recepción → venta con un obsequio de producto. | Puede entregarlo, o se entiende quién debe hacerlo. | M5-15 |
| 16 | Abrir una cotización descartada. | No hay botón Enviar. | M5-17 |
| 17 | Borrar la fecha de una forma de pago → Guardar. | Se guarda sin fecha. | M5-23 |
| 18 | Registrar un interesado con el teléfono de alguien que ya está en seguimiento. | Hay un enlace a su seguimiento. | M5-26 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/cotizaciones/` y `?sede=B` con un usuario de la sede A. | Sin cotizaciones de B. | M5-01 |
| 2 | `GET` y `PATCH` de `/api/v1/cotizaciones/{id_sede_B}/` con ese mismo usuario. | 404. | M5-01 |
| 3 | `GET /api/v1/cotizaciones/{id}/pdf/` de un tratamiento de 6 sesiones. | Sesiones = 6. | M5-02 |
| 4 | `POST /api/v1/cotizaciones/` sin `cambiar_precio` y con un valor entre la promoción y la lista. | 201 (hoy 400 `PRECIO_BLOQUEADO`). | M5-03 |
| 5 | `GET /api/v1/cotizaciones/{id}/` con solo `cotizaciones.ver`, en una venta aceptada con el compromiso activo. | No crea filas en `Consentimiento`. | M5-13 |
| 6 | Dos `POST /cotizaciones/{id}/cambiar_estado/ {"estado":"aceptada"}` concurrentes (`TransactionTestCase`). | Una sola cartera, sin 500. | M5-14 |
| 7 | `PATCH` de un borrador que descuadre el plan, y luego firmar el compromiso. | No acepta la venta. | M5-16 |
| 8 | `POST /cotizaciones/{id_descartada}/enviar_email/`. | 400 (hoy la envía). | M5-17 |
| 9 | `GET /api/v1/cobros/?cotizacion=<id>` como Profesional. | 403, así que el botón no debe mostrarse. | M5-12 |
| 10 | `PATCH /api/v1/seguimiento/oportunidades/{id}/ {"sede":"<ajena>"}`. | 400 (hoy 200). | M5-28 |
| 11 | `POST /api/v1/seguimiento/oportunidades/{id}/reabrir/` sobre una oportunidad perdida. | 200: el backend funciona, solo falta la interfaz. | M5-09 |
| 12 | `GET /api/v1/seguimiento/oportunidades/?para_hoy=1&page_size=100` con más de 100. | `count` mayor que los resultados, y hay `next`. | M5-10 |
| 13 | Contar las queries de `GET /api/v1/cotizaciones/` con 25 cotizaciones de 3 ítems. | Pocas, no cientos. | M5-19 |

## Notas

- Los chequeos por rol fijo en `cotizaciones/serializers.py` y `views.py` solo separan al superadmin; no afectan a los roles personalizados.
- Las fechas de campañas en el backend usan `America/Bogota` (verificado). En el frontend se usa `aFechaLocal`.
- `ObsequiosCotizacionSection` y `ritmo.py` no se revisaron a fondo porque ya tienen tests.

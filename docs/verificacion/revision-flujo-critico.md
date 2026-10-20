# Revisión del flujo crítico: cotización → agenda → atención (15/10/2026)

Dos frentes sobre la rama `worktree-funnel-comercial`, sin cambios de código:

1. **Revisión técnica de código.** Cotizaciones, agenda y atención: backend, frontend y su paso por cartera, cobros, seguimiento, protocolos e inventario. Cada hallazgo está verificado en el código y, cuando se pudo, contra la base local.
2. **QA funcional como usuarios reales.** Con los perfiles QA de [qa-perfiles.md](qa-perfiles.md):
   - **por API:** 57 pasos de punta a punta, revisando el estado en cada paso;
   - **en navegador:** 17 chequeos con Playwright sobre un build de producción, con datos reales del flujo que se borraron al terminar.

## Estado de las correcciones (15/10/2026, sin commit)

| Hallazgo | Corrección | Estado |
|---|---|---|
| AG-01 | `perform_update` de citas corre en una transacción. Test con `TransactionTestCase` (sin la transacción que lo escondía). | ✅ |
| QF-01 | `ItemCotizacion.procedimiento_efectivo`: procedimiento o servicio. Lo usan la duración (horarios libres y crear cita), el cruce ítem/procedimiento al agendar y protocolos. | ✅ |
| AG-02 | Las sesiones previas cuentan como usadas. `crear_cita` vuelve a contar con la fila del ítem bloqueada, así que dos recepcionistas no toman la última a la vez. | ✅ |
| AT-01 | Editar o borrar un examen: solo el de una atención abierta propia, o el que cargó el mismo usuario (el admin, todo). Ya no se puede mover un examen a otra historia o nota. | ✅ |
| AT-02 | Regla única `puede_documentar` (en `historia_clinica/autoria.py`) aplicada en: nota (editar y completar), fotos, exámenes, zonas, consumos, órdenes y mediciones. Ya no se escribe en notas completadas. | ✅ |
| AT-03 | Nuevo `POST /agenda/citas/{id}/completar_atencion/`: sesión, nota y cita en una sola transacción, idempotente. `completar` de la nota también es idempotente. La pantalla usa una sola llamada. Corrige además AT-10 (sesiones por pasos) y AT-11 (la sesión queda a nombre del profesional de la cita). | ✅ |
| AT-04 / QF-03 | Crear la nota de una cita devuelve el borrador existente, con la cita bloqueada. La pantalla hace una sola petición. | ✅ |
| AT-05 | La pantalla usa el `notaId` solo si es de esa cita e ignora respuestas tardías. | ✅ |
| QF-02 | Iniciar o cerrar la atención clínica: solo quien atiende esa cita, o el admin. | ✅ |
| AG-04 | En la cola, "el siguiente" es el primero en espera, no la fila 0. | ✅ |
| AG-05 | Quien no registra cobros no queda bloqueado en la cola por el pago pendiente. | ✅ |
| CT-01 | Al aceptar, un compromiso firmado que ya no coincide con la cotización se revoca y se genera uno nuevo para firmar. El aviso tras la firma sale del estado real. | ✅ |
| CT-07 | El acta de un acuerdo de pago ya no se muestra como compromiso de la venta. | ✅ |
| CT-08 | Si falla la generación del compromiso exigido, la venta no se acepta (503). | ✅ |
| CT-13 / AG-09 | Al aceptar se refrescan Nueva cita y cartera; al crear una cita, las sesiones del paquete, el aviso de sin confirmar y las asistencias. | ✅ |
| AT-16 (parte) | Una orden médica de una nota toma la cita de la nota (PDF con la sede correcta). | ✅ |
| QF-06 (nuevo) | Encontrado al probar en navegador: si el tipo de sesión del tratamiento no tiene procedimientos en el catálogo, "Completar sesión y atención" quedaba deshabilitado y la atención no se podía cerrar. Ahora lo explica y deja completar. | ✅ |
| AT-08 / AT-09 | El panel usa el número de sesión del tratamiento (decía "2 de 11" en la primera). "Últimas visitas" pide las completadas más recientes. | ✅ |
| AG-03 / AT-19 / AG-10 | **Decisión:** "no asistió" no consume la sesión del paquete, la libera igual que cancelar y no ocupa el horario del profesional. La cita queda como registro. | ✅ |
| AG-15 | **Decisión:** al cancelar una cita ya cobrada, el sistema avisa y pregunta: "Cancelar y mantener el cobro" o "Cancelar y anular el cobro". Anular reversa los pagos y exige "anular cobros"; si falta el permiso, se explica. | ✅ |
| CT-18 | **Decisión:** quien solo ve lo suyo ve en el listado del paciente todas sus cotizaciones, pero no abre las de otro profesional (detalle, PDF, envíos y consentimientos responden 403). Los enlaces de la ficha, el panel de la atención, el detalle de la cita y cartera se muestran sin enlace. | ✅ |
| CT-19 | **Decisión:** el listado para agendar, para quien no ve cotizaciones, sale sin montos, saldos, plan ni precios. | ✅ |
| AG-14 (mora) | **Decisión:** la mora no bloquea agendar ni reprogramar. El bloqueo queda al iniciar la atención. | ✅ |
| AT-13 | Antes de verificar y de completar la atención se envía lo escrito y aún no guardado, y se esperan los guardados en curso (`guardarBorradoresDeNota`). Si no se guarda, no se completa y se avisa. | ✅ |
| AG-06 | Con check-in apagado, el paso a "en espera" se reintenta cuando la cita o la configuración llegan tarde. "Llegó" deja la cita confirmada en caché antes de abrir el asistente. Los errores se avisan. | ✅ |
| AT-12 / QA-13 | `HistoriaClinica.del_paciente()` crea la historia si falta: la usan la consulta por paciente y "Datos clínicos". La migración `historia_clinica.0020` creó las de los 2 pacientes que no tenían. | ✅ |
| CT-04 | El historial de envíos enmascara el teléfono y el correo sin el permiso de datos sensibles. | ✅ |
| CT-06 | Descartar revoca los documentos sin firmar de la cotización. El webhook ignora la firma de un compromiso revocado (el sobre viejo de Documenso puede seguir abierto, pero ya no cuenta). | ✅ |
| AT-06 | Las fotos nuevas van a la nota de la atención (o de la cotización). En la historia, a la nota en borrador. "Agregar" ya no aparece en grupos de notas cerradas. | ✅ |
| AT-07 | Cancelar o marcar "no asistió" devuelve al stock los insumos de la nota de la cita, aunque ya no esté en curso (tras "Desiniciar"). | ✅ |
| AG-07 | La sesión elegida define la duración de la cita y de los horarios libres (`sesion_ejecutada_id` en `slots_disponibles`). Sin sesión elegida sigue la más larga. | ✅ |
| CT-03 | Una autorización cubre el ítem solo con el mismo precio o uno mayor, las mismas citas o menos, y sin que crezca la brecha frente al mínimo (cambia con la sede o la lista). | ✅ |
| CT-05 | Con otra propuesta abierta de la misma oportunidad, descartar no la cierra (el diálogo lo explica). Una venta gana la oportunidad aunque se haya dado por perdida. | ✅ |
| AG-08 | Cola de atenciones, selector de profesional, bloqueos (cargar, aprobar, rechazar, eliminar), iniciar desde la cola y check-in muestran el error real con "Reintentar". También se corrigió un hook después de un `return` en la cola, que rompía la pantalla al llegar el primer paciente. | ✅ |
| CT-02 | El detalle serializa una sola vez los ítems activos: de 166 a 32 consultas con 14 ítems (13 inactivos). | ✅ |
| QF-05 | **No es un error: es el diseño acordado el 07/10/2026.** En la ficha del colaborador, un día sin registro es "Igual a la sede". Quien tiene horario especial solo el lunes atiende el resto de días en el horario de la sede. Para que no atienda, ese día se marca "No atiende". | Descartado |
| CT-09 | Al aceptar, la diferencia de centavos (dentro de la tolerancia de $1) se suma a la última cuota: la cartera cuadra exacto. | ✅ |
| CT-10 | Entregar un obsequio valida que la sede sea del usuario. | ✅ |
| CT-11 | Una cotización de una sede sin acceso se muestra de solo lectura, con un aviso. | ✅ |
| CT-12 | Los paneles de sesiones y de consentimientos muestran el error con "Reintentar". | ✅ |
| CT-14 | Aceptar, descartar y editar bloquean la fila y deciden sobre el estado actual. Una cotización eliminada responde `COTIZACION_ELIMINADA`. | ✅ |
| CT-15 | El backend limita el descuento (0–100 %) y no acepta valores negativos. | ✅ |
| CT-16 | Si quien autoriza guarda sin tocar los precios pedidos, la solicitud sigue pendiente (se decide con su botón). Si los cambió, quedan autorizados a su nombre, como antes. | ✅ |
| CT-17 | El PDF de una cotización renovada usa la fecha de la renovación. | ✅ |
| AG-11 | Aprobar un bloqueo avisa de las citas agendadas mientras estaba pendiente y pide confirmar. Al editarlo se valida la sede como al crearlo, y se avisan las citas si cambió el horario. | ✅ |
| AG-12 | **Decisión (16/10/2026): regla única para las firmas por embed.** Compromiso de pago, consentimiento informado y asistencia se confirman con la API de Documenso (`confirmar_firma_con_documenso`: 3 intentos de 1 s), no con el aviso del navegador. Si Documenso no lo confirma, responde 409 `FIRMA_NO_CONFIRMADA` y la pantalla queda en "Esperando confirmación de Documenso" con "Verificar ahora". El webhook sigue de respaldo (firma por link, Documenso lento) y para guardar el PDF sellado. El compromiso antes se marcaba firmado sin verificar y aceptaba la venta; uno revocado ya no se marca. | ✅ |
| AG-13 | "Canceló" solo aparece a quien puede cancelar la cita. | ✅ |
| AG-14 (resto) | No se confirma una cita que no está pendiente ni confirmada. A una cita de paquete no se le cambia el paciente. | ✅ |
| AG-16 | Una cita de paquete sin sesión asignada toma una sesión pendiente que no esté asignada a otra cita. | ✅ |
| QF-04 | Nueva cita desde la venta abre con la sede de la venta (o la única del usuario). | ✅ |
| AT-14 | Cubierto con AG-08: la cola, el detalle y la pantalla de atención avisan por qué no se inició. | ✅ |
| AT-15 | Zonas, insumos y mediciones cuentan como contenido. Si la clínica apagó todas las pestañas donde se escribe, ya no se bloquea. | ✅ |
| AT-16 (resto) | En la atención la orden lleva siempre la nota, y el backend toma de ella la cita y valida el paciente. | ✅ |
| AT-17 | Zonas, insumos y exámenes muestran el error con "Reintentar". | ✅ |
| AT-18 | El listado de citas pasa de 211 a 125 consultas (32 citas): el catálogo de consentimientos se lee una vez por respuesta y la sesión pendiente sale de lo precargado. El autoguardado actualiza la nota en caché en vez de recargar la historia. | ✅ |
| AT-20 | `marcar_completado` bloquea la sesión, no se repite, exige que la cita sea del paciente y que los procedimientos sean del catálogo de la clínica. | ✅ |
| AT-21 | La historia solo acepta PATCH: un PUT responde 405. | ✅ |
| AT-22 | Un profesional asignado a ciertas sedes no se agenda en otra (`PROFESIONAL_FUERA_DE_SEDE`). Sin sedes asignadas, atiende en todas. | ✅ |

Pruebas:
- Contra Documenso real (16/10/2026), `scripts/auditoria/prueba_firmas_documenso_real.py`: 9 de 9. En las tres firmas, confirmar antes de firmar responde 409 y no marca nada; tras firmar como paciente responde 200. En el consentimiento con firma del médico se confirma con el sobre aún abierto, y queda sellado cuando firma el médico. La base se deshace y los sobres se borran.
- En navegador, los medios con `qa_navegador_medios.mjs` (3 de 3): la cola vacía recibe al primer paciente sin romperse, "Llegó" con check-in apagado deja la cita en espera, y completar justo después de escribir guarda el texto.
- `apps/core/tests/test_flujo_critico.py` (31 tests) y `CotizacionFlowTests.test_ct01_…`.
- El recorrido `qa_flujo_critico.py` da 57 de 57 pasos como se esperaba.
- En navegador, 18 de 18. Incluye agendar el procedimiento vendido (ya muestra horarios) y que el profesional inicie, documente y complete la atención de punta a punta.
- La suite completa (948 tests, tras los bajos) solo falla en los 7 de Google de siempre. Se actualizó el test de autorización que esperaba el comportamiento de CT-16 (aprobar al guardar sin cambiar el precio). Se actualizó un test que esperaba un 400 al completar dos veces, que ahora es idempotente.

## Lo más urgente

| # | Qué pasa | Dónde | Estado |
|---|---|---|---|
| **AG-01** | **Editar, reprogramar o cambiar el profesional de cualquier cita responde 500.** Confirmado contra el servidor. | `agenda/views.py` `perform_update`: `select_for_update` sin transacción | Solo en esta rama (commit 84f0e36, paso 6). **No está en main.** Corregir antes de cualquier merge. |
| **QF-01** | **Un procedimiento vendido en una cotización no se puede agendar.** Nueva cita → "Sesión de cotización" → el selector de horarios dice "El item no tiene duracion configurada". | `agenda/views.py` `slots_disponibles` y `agenda/services.py` `_resolver_duracion`: leen `item.servicio`, pero el ítem guarda `item.procedimiento` | Afecta a toda venta con procedimientos sueltos (2 de 2 en la base local). Confirmado por API y en pantalla. |
| **AG-02** | **Un paquete se puede agendar más allá de sus sesiones.** No se descuentan las previas de la puesta en marcha, y hay carrera entre dos recepcionistas. | `agenda/serializers.py:483-489` | Confirmado en código y con datos (ítem con 11 sesiones y 6 previas acepta 11 citas). |
| **AT-01** | **Quien atiende borra para siempre exámenes de cualquier paciente**, incluso de visitas cerradas de otro profesional. | `historia_clinica/views.py:927-957` | Confirmado en código. |
| **AT-02** | **Se escribe en la atención de otro profesional.** Edición, completar, zonas, consumos, órdenes y mediciones: el "solo lo propio" solo se valida al crear. | `historia_clinica/views.py:429-433`, `serializers.py:180-189` | Confirmado en código; también hay un camino desde la interfaz. |
| **AT-03** | **"Completar atención" son 3 llamadas sin transacción.** Si falla la última, la atención queda trabada y al recargar se crea una nota vacía. | `atenciones/[citaId]/page.tsx:170-201` | Confirmado en código. |
| **AG-04** | **La cola de espera se bloquea** si el primero de la lista no ha llegado: solo la fila 0 tiene "Iniciar". | `ColaEspera.tsx:151` | Confirmado en código. |
| **CT-01** | **Un compromiso de pago firmado no se invalida si se edita la cotización.** La venta se acepta con un documento firmado por otro valor. | `cotizaciones/views.py:416,471-475` | Confirmado en código. |

## Frente 2: QA funcional

### Recorrido por API (`qa_flujo_critico.py`)

Paciente nueva → el profesional cotiza un paquete con 20 % de descuento más un procedimiento → pide autorización → el admin autoriza → venta → recepción agenda las sesiones → llegada → atención → cierre → cartera.

**Funcionó bien (53 de 57 pasos):**
- **Autorización de precio:** sin motivo responde `PRECIO_REQUIERE_AUTORIZACION`; con motivo queda "por autorizar" y no se puede aceptar ni sacar el PDF.
- **Bandeja de autorizaciones:**
  - el admin ve el contador y la bandeja; gerencia no ve la bandeja;
  - quien pidió no puede autorizarse;
  - autorizar dos veces se rechaza.
- **Venta:** al aceptar, la cartera queda con el total, y una venta aceptada no se puede editar.
- **Agenda:**
  - recepción ve el paquete del paciente y agenda su sesión;
  - el profesional (que no agenda) y la asesora de otra sede no pueden agendar;
  - el mismo profesional a la misma hora se rechaza.
- **Su agenda:** el profesional ve solo sus citas; la esteticista no ve la de Pablo en su agenda, pero sí en el historial de la paciente.
- **Atención:**
  - otra profesional no puede iniciar la cita;
  - recepción no puede escribir en la nota;
  - el consumo de insumo baja el stock (5 → 4);
  - una nota completada no se edita.
- **Cierre:** cuenta 1 sesión completada del paquete; cancelar libera la sesión; la cita aparece en el historial de atenciones.
- **Cartera:** la cajera registra el abono y gerencia no puede; el abono entra en "Ingresos del mes" como venta.

**Hallazgos del recorrido:**

| ID | Sev. | Hallazgo |
|---|---|---|
| QF-01 | Alta | Un procedimiento suelto vendido no se puede agendar (ver tabla de urgentes). |
| QF-02 | Media | Recepción, con "cambiar estado", puede pasar la cita a **en curso** (iniciar la atención clínica) por API. También puede pasarla a completada sin nota (AG-14). La interfaz no se lo ofrece, pero el backend lo permite. |
| QF-03 | Media | Crear la nota dos veces para la misma cita (doble clic o dos pestañas) crea **dos notas**. En la base local hay citas con 15 y 7 borradores (AT-04). |
| QF-04 | Baja | Nueva cita abierta desde la venta no precarga la sede, aunque la venta tiene sede y la recepcionista solo tiene una. |
| QF-05 | Media | Un profesional con horario solo algunos días aparece **disponible toda la jornada de la sede** los días sin horario. Ejemplo: pro1 tiene horario solo los lunes y sale libre de jueves a sábado. Ya estaba en los pendientes del core; ver también AT-22. |

### Recorrido en navegador (`qa_navegador_flujo.mjs`)

17 chequeos, 16 bien. El único que falló es QF-01, que muestra el error en pantalla.

- **Profesional:**
  - la cotización por autorizar muestra el aviso y deja PDF y Enviar deshabilitados;
  - el dashboard muestra "Mis citas de hoy" con la paciente;
  - la agenda muestra solo la suya, sin selector;
  - la paciente aparece en la cola;
  - la atención abre "El paciente está listo";
  - la venta muestra sus sesiones.
- **Admin:** la solicitud aparece en "Por decidir" y la cotización muestra Autorizar y Rechazar.
- **Recepción:** la agenda del día muestra la cita, y el detalle la muestra "En espera"; la ficha de la paciente carga.
- **Esteticista:** no ve la cita de Pablo en su agenda; ve la ficha sin "Nueva cotización".
- **Cajera y gerencia:** la cajera ve "Registrar pago" en la cartera y gerencia no.
- **Asesora (otra sede):** no ve la venta de la sede Principal.

## Frente 1: revisión técnica

### Cotizaciones → ventas (CT)

| ID | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| CT-01 | Alta | Un compromiso de pago firmado no se invalida al editar la cotización; la aceptación usa la firma vieja. Además, el aviso "La cotización quedó aceptada" sale aunque siga en borrador. | `views.py:416,471-475,348-351`; `services.py:263-282`; `CotizacionForm.tsx:937-948` |
| CT-02 | Media | El detalle serializa también los ítems inactivos (166 consultas con 14 ítems), y empeora con cada edición. | `serializers.py:699,843-855`; `views.py:238-240` |
| CT-03 | Media | La autorización cubre "clave + precio unitario", pero no la cantidad, la sede ni el precio de lista. Después de autorizar se puede subir el número de citas o cambiar de sede sin pedir otra autorización. | `autorizaciones.py:31-72` |
| CT-04 | Media | El historial de envíos muestra el teléfono y el correo sin enmascarar. | `serializers.py:681-694`; `HistorialEnvios.tsx` |
| CT-05 | Media | Descartar una de varias propuestas cierra la oportunidad como perdida (casilla marcada por defecto), y la venta posterior no la marca como ganada. | `DescartarCotizacionDialog.tsx:30`; `seguimiento/services.py:313-327` |
| CT-06 | Media | Descartar no revoca el compromiso pendiente ni el sobre de Documenso: el paciente puede firmar una cotización descartada. | `services.py:130-138` |
| CT-07 | Media/Baja | En una venta con acuerdo de pago, la tarjeta del compromiso muestra el acta del acuerdo. | `views.py:249-258` |
| CT-08 | Media/Baja | Si falla la generación del compromiso exigido, la venta se acepta sin él (solo queda un log). | `views.py:477-483` |
| CT-09 | Baja | La tolerancia de $1 del plan deja la cartera con $0,48 pendientes para siempre. | `services.py:41,64,102-117` |
| CT-10 | Baja | `entregar_obsequio` no valida que la sede sea del usuario (solo por API). | `EntregarObsequioSerializer` |
| CT-11 | Baja | Una cotización de otra sede abierta desde la ficha del paciente aparece editable y todo responde 403. | `CotizacionForm.tsx:380,392` |
| CT-12 | Baja | Si su consulta falla, los paneles de sesiones y de consentimientos desaparecen sin aviso. | `SesionesCotizacionPanel.tsx:198-202,317` |
| CT-13 | Baja | Al aceptar no se refrescan Nueva cita (sigue "sin cotizaciones aceptadas") ni cartera durante 1 minuto. | `CotizacionForm.tsx:982-985` |
| CT-14 | Baja | Concurrencia aceptar/descartar/PATCH sin bloqueo de fila; además, por API se puede aceptar una cotización eliminada con `?activo=false`. | `services.py:89-138`; `views.py:167-169` |
| CT-15 | Baja | El backend no limita `descuento_porcentaje` (0-100) ni `valor_unitario` (≥0) (solo por API). | `serializers.py:183-186` |
| CT-16 | Baja | Quien tiene "cambiar precio" autoriza sin querer una solicitud pendiente al guardar cualquier cambio. | `autorizaciones.py:153-165` |
| CT-17 | Baja | El PDF de una cotización renovada muestra la fecha original con la validez nueva. | `pdf.py:117,126` |
| CT-18 | Baja (decidir) | En la ficha del paciente, quien "solo ve lo suyo" solo ve sus propias cotizaciones de ese paciente. | `views.py:141` |
| CT-19 | Baja (decidir) | El listado para agendar (`?paciente&estado=aceptada`) le muestra montos y plan de pagos a quien solo agenda. | `CotizacionListSerializer` |

### Agenda (AG)

| ID | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| AG-01 | **Alta** | Todo PATCH de una cita responde 500 (ver urgentes). Los tests no lo detectan porque `TestCase` envuelve todo en una transacción. | `views.py:288-331`; `services.py:399-405` |
| AG-02 | **Alta** | El paquete se puede agendar más allá de sus sesiones: no se descuentan las previas y hay carrera. | `serializers.py:483-489` |
| AG-03 | Alta (decidir) | "No asistió" consume la sesión del paquete, pero Seguimiento la cuenta como pendiente e invita a reagendar; además la sesión queda atada a la cita perdida. | `cotizaciones/models.py:359`; `agenda/views.py:496-505`; `seguimiento/ritmo.py` |
| AG-04 | **Alta** | La cola de espera se bloquea si el primero no ha llegado. | `ColaEspera.tsx:151` |
| AG-05 | Media | Después de "Continuar sin cobrar" (QA-02), la cola deja "Iniciar" deshabilitado con "Recepción debe completar los pasos previos". | `ColaEspera.tsx:57-73`; `IniciarAtencionWizard.tsx:118` |
| AG-06 | Media | Con check-in apagado, "Llegó" en una cita pendiente puede no pasar nunca a "en espera". | `CitaDetailSheet.tsx:178-187`; `IniciarAtencionWizard.tsx:115,144-150` |
| AG-07 | Media | La sesión de un paquete siempre ocupa la duración del tipo de sesión más largo, aunque se elija otra sesión. | `services.py:262-307`; `views.py:742-759` |
| AG-08 | Media | Errores que se ven como "no hay datos": cola de atenciones, selector de profesional, bloqueos, iniciar desde la cola, check-in. | varios |
| AG-09 | Baja/Media | Pantallas que no se refrescan: sesiones del paquete, aviso de sin confirmar, asistencias del paciente, reportes. | `NuevaCitaModal.tsx:237-241` y otros |
| AG-10 | Baja | Una cita "No asistió" sigue ocupando el horario del profesional. | `services.py:63-66` |
| AG-11 | Baja | Al aprobar un bloqueo no se revisan las citas nuevas; al editarlo, `sede:null` lo extiende a toda la clínica. | `views.py:1391,1407-1416` |
| AG-12 | Baja | `confirmar_firma_asistencia` marca "firmada" sin verificar nada. | `views.py:1132-1152` |
| AG-13 | Baja | "Canceló" se muestra a quien no puede cambiar el estado. | `ConfirmarCitaDialog.tsx:189` |
| AG-14 | Baja | Solo por API, validaciones incompletas: mora al reprogramar, confirmar una cita cancelada, completar sin nota, cambiar el paciente de una cita de paquete. | varios |
| AG-15 | Baja (decidir) | Cancelar una cita ya cobrada no avisa ni hace nada con el cobro. | `views.py:483-515` |
| AG-16 | Baja (probable) | Una cita de paquete sin "sesión a consumir" toma los consentimientos de la primera sesión pendiente. | `protocolos/services.py:105-139` |

### Atención clínica (AT)

| ID | Sev. | Hallazgo | Dónde |
|---|---|---|---|
| AT-01 | **Alta** | Quien atiende borra para siempre exámenes de cualquier paciente, y por PATCH puede moverlos de nota. | `historia_clinica/views.py:927-957` |
| AT-02 | **Alta** | Se escribe en la atención de otro profesional (nota, completar, zonas, consumos, órdenes, mediciones). | `views.py:429-433,482`; `serializers.py:180-189` |
| AT-03 | **Alta** | Completar no es atómico ni idempotente: la atención se traba o se duplica la nota. | `page.tsx:170-201`; `protocolos/services.py:473-516` |
| AT-04 | Media | Varios borradores por cita (en la base local: 15 y 7 en dos citas, y 11 huérfanos). | `historiaClinica.ts:69-76` |
| AT-05 | Media (probable) | Un `notaId` viejo en el store puede documentar en la nota de otro paciente. | `page.tsx:137-152`; `notaEnProgresoStore.ts` |
| AT-06 | Media | Las fotos de la atención van a `notas[0]` y no a la nota de la atención. | `TabFotos.tsx:56` |
| AT-07 | Media | Los insumos no vuelven al stock si se cancela después de "Desiniciar". | `agenda/views.py:507` |
| AT-08 | Media | El panel dice "Sesión 6 de 6" en la primera atención (cuenta las agendadas, no las hechas). | `PanelPaciente.tsx:58-66` |
| AT-09 | Media | "Últimas visitas" muestra las más antiguas, o "Primera visita" aunque haya visitas. | `PanelPaciente.tsx:39-46` |
| AT-10 | Media (probable) | Las sesiones de protocolo por pasos nunca se marcan como completadas. | `protocolos/services.py:150` |
| AT-11 | Media | La sesión queda a nombre de quien la cierra, no del profesional de la cita (afecta comisiones). | `protocolos/views.py:124-125` |
| AT-12 | Media | Con pacientes sin historia no se puede documentar ni completar, sin aviso, y "Datos clínicos" responde 500. | `page.tsx:113,133`; `cotizaciones/views.py:620` |
| AT-13 | Media | Completar justo después de escribir pierde lo último escrito (el autoguardado no se envía antes). | `useBorradorNota.ts:75-86` |
| AT-14 | Baja | Fallos silenciosos al iniciar la atención desde la cola o el detalle. | `ColaEspera.tsx:77-96`; `page.tsx:279` |
| AT-15 | Baja | "Nota sin contenido" no cuenta zonas, insumos ni mediciones; con algunas pestañas apagadas no se puede completar nunca. | `page.tsx:221-226,286` |
| AT-16 | Baja | Las órdenes médicas se guardan sin cita, y el PDF sale con la sede equivocada. | `TabOrdenesMedicas.tsx:53-58` |
| AT-17 | Baja | Pestañas que muestran "vacío" cuando la consulta falla. | varias |
| AT-18 | Baja | Rendimiento: unas 7 consultas por cita en los listados, y la historia completa se recarga en cada autoguardado. | — |
| AT-19 | Baja (decidir) | "No asistió" no libera la sesión del paquete (igual que AG-03). | `agenda/views.py:493-503` |
| AT-20 | Baja | `marcar_completada` acepta datos de otra clínica o paciente, no usa transacción y se puede repetir. | `protocolos/services.py:518` |
| AT-21 | Baja | Un PUT sobre la historia clínica responde 500. | `historia_clinica/views.py:197` |
| AT-22 | Baja (probable) | A un profesional sin horario en otra sede se le puede agendar ahí, pero luego no ve esa cita. | `agenda/services.py:217` |

## Decisiones (respondidas el 15/10/2026; ver la tabla de estado)

1. **AG-03 / AT-19:** ¿"No asistió" consume la sesión del paquete o la devuelve, como cancelar?
2. **AG-15:** si se cancela una cita ya cobrada, ¿solo avisar o anular o reversar el cobro?
3. **CT-18:** en la ficha del paciente, ¿quien "solo ve lo suyo" ve todas las cotizaciones de ese paciente? (La regla de agenda que acordamos dice que en el paciente se ve todo.)
4. **CT-19:** el listado para agendar, ¿sin montos para quien solo agenda?
5. **AG-14:** ¿se puede reprogramar a un paciente en mora?

## Orden de corrección sugerido

1. **Antes de cualquier merge:** AG-01 (regresión de esta rama) y QF-01.
2. **Integridad de datos y permisos:** AT-01, AT-02, AT-03, AG-02, CT-01, AT-04/QF-03, QF-02.
3. **Flujo diario:** AG-04, AG-05, AG-06, AT-13, AT-06, AT-07, AT-12, AG-07, QF-04, QF-05.
4. Los demás Media y Baja.

## Cómo repetir

```bash
docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py
docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --persistir
PLAYWRIGHT_DIR=<e2e/node_modules> FRONT_URL=http://localhost:3100 node backend/scripts/auditoria/qa_navegador_flujo.mjs
docker exec cliniq_backend python scripts/auditoria/qa_flujo_critico.py --limpiar
```

- El primer comando es el recorrido por API y se deshace solo.
- `--persistir` deja los datos para el navegador; `--limpiar` los borra.
- El navegador necesita el build de producción aparte en el puerto 3100. El servidor dev en Drive tarda unos 2 minutos por pantalla.

# M3 — Agenda

**Estado:** Revisado (10/10/2026) · **Sigue:** M4 · **Viene de:** M2

**Alcance.**
- *Frontend:* `agenda/*`, `components/agenda`, la confirmación pública `/confirmar/[token]` y `lib/api/agenda.ts`.
- *Backend:* `apps/agenda` (citas, slots, bloqueos, estados, recordatorios y citas que vienen de un ítem de cotización).

**Antes de corregir.**
- **Primero:** M3-01, M3-02 y M3-03. Son los que hacen que la agenda se vea vacía y que se dupliquen reservas. M3-01 se resuelve con T-01.
- **Después:** M3-04, M3-05, M3-06 y M3-07.
- **Sigue vigente un problema ya conocido:** un profesional sin horario propio aparece disponible todo el horario de la sede (`services.py:166-167,180-181`).

## Hallazgos

**✅ M3-01 · Crítico · previsible/parámetros** · confirmado
- **Dónde:** `frontend/src/app/(authenticated)/agenda/page.tsx:786-796,1102-1112,1236-1245`; `backend/config/settings/base.py:138-139`
- **Qué ve el usuario:** si hay más de 25 citas en el día, **las demás no aparecen**. Lo mismo pasa en Semana y Mes. La recepcionista ofrece un horario que parece libre, pero ya está ocupado.
- **Causa:** el backend ignora `page_size` y el frontend solo lee la página 1.
- **Arreglo:** T-01, o una acción de agenda sin paginar y acotada por rango de fechas.

**✅ M3-02 · Alto · parámetros/API** · confirmado
- **Dónde:** `frontend/src/lib/api/agenda.ts:150-159`; `backend/apps/agenda/views.py:1177-1200`
- **Qué ve el usuario:** cuando ya hay más de 25 bloqueos antiguos, **los bloqueos nuevos no se ven** ni en la agenda ni en el panel.
- **Causa:** el backend devuelve la página 1, ordenada del más viejo al más nuevo, y no implementa los filtros de fecha que declara el tipo.
- **Arreglo:** aceptar un rango de fechas en el backend y enviarlo desde el frontend.

**✅ M3-03 · Alto · previsible** · confirmado
- **Dónde:** `backend/apps/agenda/services.py:56-79,210-217,396-401`; `views.py:264-274`
- **Qué ve el usuario:** **se puede agendar dentro de un bloqueo** de toda la sede o de toda la clínica. También se puede en el día 2 o siguientes de un bloqueo de varios días, por ejemplo el cierre de fin de año.
- **Causa:** la disponibilidad solo mira los bloqueos con profesional. Los slots solo consideran bloqueos que empiezan ese mismo día. Crear o editar la cita por API no revisa los bloqueos de sede.
- **Arreglo:** una función común `rango_bloqueado(profesional, sede, ini, fin)` que detecte cualquier solapamiento real, y usarla en los slots, al crear y al editar.

**✅ M3-04 · Alto · permisos/roles** · confirmado (BD)
- **Dónde:** `permissions_catalog.py:683-718`; `agenda/views.py:149-150`; `ConfirmarCitaDialog.tsx:50,70-73`
- **Qué ve el usuario:** Recepción pulsa "No confirmó" y aparece "No se pudo guardar". **Nunca funciona.**
- **Causa:** la acción exige `agenda.citas.confirmar_manual`, que los roles Recepción de las 5 clínicas no tienen. Además, el frontend no lee `detail`.
- **Arreglo aplicado (por decisión del usuario):** se eliminó el permiso aparte. Confirmar o marcar "No confirmó" lo puede hacer quien puede crear o editar citas. La migración `users 0024` lo quita de la base de datos.

**✅ M3-05 · Alto · faltante** · confirmado
- **Dónde:** `CitaDetailSheet.tsx:206`; `EditarCitaForm.tsx:30,240-248`
- **Qué ve el usuario:** cuando el paciente pide mover su cita:
  - si la cita está **confirmada**, no hay forma de reprogramarla; hay que cancelar y crear otra, y se pierde el vínculo con la cotización;
  - si es de **paquete** o **consulta libre**, Editar obliga a elegir un procedimiento.
- **Arreglo:** permitir reprogramar citas pendientes y confirmadas, respetando el tipo de cita (`itemCotizacionId` o `duracion_min`).

**✅ M3-06 · Alto · previsible/permisos** · confirmado
- **Dónde:** `backend/apps/agenda/serializers.py:252-279`
- **Qué ve el usuario:** nada en pantalla. Pero por API, Recepción puede hacer `PATCH {"estado":"completada"}` y saltarse consentimientos, mora y tiempos.
- **Arreglo:** dejar `estado` y `motivo_cancelacion` como solo lectura, y rechazar la edición de citas cerradas.

**✅ M3-07 · Alto · permisos (aislamiento)** · confirmado en código
- **Dónde:** `serializers.py:183-285`; `services.py:371-401`; `views.py:1202-1219`
- **Qué ve el usuario:** nada en pantalla. Pero por API se pueden crear citas o bloqueos en la sede o con el profesional **de otra clínica**. Un usuario de la sede A también puede mover citas a la sede B.
- **Arreglo:** acotar los querysets a la clínica activa y validar que la sede esté entre las acotadas del usuario.

**✅ M3-08 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `CitaDetailSheet.tsx:93-111,135-143`
- **Qué ve el usuario:** "Cancelar cita", "No asistió" o "Confirmar asistencia" muestran "Guardando…" y luego no pasa nada.
- **Causa:** falta `onError`.

**✅ M3-09 · Medio · errores/carga** · confirmado
- **Dónde:** `SlotPicker.tsx:51-105`; `agenda/views.py:678-684`
- **Qué ve el usuario:** "No hay horarios disponibles", cuando en realidad el tratamiento no tiene duración configurada o hubo un error. El mensaje del backend tiene voseo ("Configurá").
- **Arreglo:** mostrar el error real y una acción para resolverlo.

**✅ M3-10 · Medio · carga** · confirmado
- **Dónde:** `agenda/page.tsx:786,1103,1236,1471`
- **Qué ve el usuario:** si la API falla, la agenda se ve vacía, como un día libre.
- **Arreglo:** estado de error con "Reintentar".

**✅ M3-11 · Medio · zona horaria** · confirmado (shell)
- **Dónde:** `agenda/views.py:248,264-267`; `services.py:82-94,178-185`
- **Qué ve el usuario:** "Cambiar profesional" en una cita de las 19:00 o más tarde responde "fuera del horario de la sede".
- **Causa:** se valida con la hora en UTC.
- **Arreglo:** usar `timezone.localtime` antes de validar.

**✅ M3-12 · Medio · previsible** · confirmado
- **Dónde:** `agenda/views.py:276-281`
- **Qué ve el usuario:** al reprogramar una cita, al paciente **no le llega recordatorio** de la nueva fecha.
- **Arreglo:** al cambiar la fecha, reiniciar `recordatorio_enviado`, `recordatorio_manual_pendiente` y `estado_confirmacion`.

**✅ M3-13 · Medio · previsible** · confirmado
- **Dónde:** `agenda/views.py:277-281`; `serializers.py:287-288`
- **Qué ve el usuario:** al cambiar el procedimiento, la agenda sigue mostrando el nombre anterior.
- **Arreglo:** recalcular `servicio_nombre` al editar.

**✅ M3-14 · Medio · doble reserva** · probable
- **Dónde:** `services.py:371-412`; `NuevaCitaModal.tsx:221-229,769`
- **Qué ve el usuario:** con dos recepcionistas o un doble clic, se reserva el mismo horario dos veces. Después del error, la lista de horarios no se refresca.
- **Arreglo:** transacción con bloqueo e invalidar `['slots']` en `onError`.

**✅ M3-15 · Medio · parámetros** · confirmado
- **Dónde:** `agenda/page.tsx:1471-1492`
- **Qué ve el usuario:** el aviso de "citas sin cerrar" cuenta de menos.
- **Arreglo:** filtrar por estado y orden en el backend.

**✅ M3-16 · Medio · errores** · confirmado
- **Dónde:** `BloqueosPanel.tsx:137-139`
- **Qué ve el usuario:** "Request failed with status code 400".
- **Arreglo:** dar prioridad a `response.data` sobre `err.message`.

**✅ M3-17 · Medio · permisos** · confirmado
- **Dónde:** `agenda/views.py:1158-1165`; `BloqueosPanel.tsx:142-155,376-388`
- **Qué ve el usuario:** quien puede "crear bloqueo" puede editar o borrar bloqueos **aprobados** por otros. Aprobar, rechazar y eliminar fallan sin mensaje.
- **Causa:** `agenda.bloqueos.gestionar` nunca se revisa, y faltan los `onError`.

**✅ M3-18 · Medio · faltante** · confirmado
- **Dónde:** `agenda/views.py:1202-1219`
- **Qué ve el usuario:** crea un bloqueo encima de citas existentes y no recibe ningún aviso.
- **Arreglo:** listar las citas afectadas y pedir confirmación.

**M3-19 · Medio · carga** · código confirmado; impacto probable
- **Dónde:** `services.py:56-70,219-229`; `serializers.py:23-38,296-357`
- **Qué ve el usuario:** los slots y la agenda se vuelven cada vez más lentos.
- **Causa:** la disponibilidad carga **todas** las citas históricas por cada slot, y el listado puede llamar a Documenso por HTTP (igual que M4-08).
- **Arreglo:** filtrar por rango de fechas y usar un serializer liviano.

**M3-20 · Medio · zona horaria** · probable
- **Dónde:** `config/settings/base.py:168`
- **Qué ve el usuario:** en clínicas fuera de Colombia, los horarios quedan corridos 1 o 2 horas.
- **Arreglo:** zona horaria por clínica (T-04).

**✅ M3-21 · Medio · faltante** · confirmado
- **Dónde:** `agenda/confirmacion.py:31-79`; `views.py:1127-1136`; `confirmar/[token]/page.tsx:27-34,80-83`
- **Qué ve el usuario:** la autoconfirmación por enlace **no existe en la práctica**: nunca se genera el token. Si se activara así como está:
  - las citas sin procedimiento darían 500 después de confirmarse;
  - se confirmarían citas canceladas;
  - no se mostraría el error.

**✅ M3-22 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `NuevaCitaModal.tsx:264-281`
- **Qué ve el usuario:** crear un paciente desde "Nueva cita" con datos inválidos no muestra ningún mensaje (igual que M2-03).

**✅ M3-23 · Bajo · roles personalizados** · confirmado
- **Dónde:** `CitaDetailSheet.tsx:206,419-520`; `lib/permissions.ts:166-168`
- **Qué ve el usuario:** "Editar" se oculta a quien atiende pacientes y se muestra a quien no tiene permiso. Las acciones de estado no revisan `cambiar_estado`.

**✅ M3-24 · Bajo · roles personalizados** · confirmado
- **Dónde:** `agenda/page.tsx:1384-1387,1512-1516,1735`
- **Qué ve el usuario:** un rol personalizado "profesional + ver agenda" solo ve sus propias citas y pierde el filtro, aunque el backend le deja ver todo.
- **Arreglo:** un permiso explícito para "ver la agenda de todos".

**✅ M3-25 · Bajo · permisos/faltante** · confirmado
- **Dónde:** `BloqueosPanel.tsx:70`
- **Qué ve el usuario:** quien solo puede "aprobar" ve "Nuevo bloqueo". Recepción y Profesional no tienen `crear_bloqueo`, así que el flujo de solicitud no se usa nunca.

**M3-26 · Bajo · UX** · confirmado
- **Dónde:** `CitaDetailSheet.tsx:179-185,428-431`
- **Qué ve el usuario:** si llega un paciente con la cita pendiente, no hay "Registrar llegada"; hay que confirmar primero.
- **Arreglo:** un botón "Llegó" que confirme y haga el check-in en un solo paso.

**M3-27 · Bajo · errores** · confirmado
- **Dónde:** `CitaDetailSheet.tsx:599-627`
- **Qué ve el usuario:** el motivo de cancelación dice "Requerido", pero se puede cancelar sin escribirlo.

**M3-28 · Bajo · visual** · confirmado
- **Dónde:** `agenda/page.tsx:798-809,840`; `BloqueosPanel.tsx:335-339`
- **Qué ve el usuario:**
  - en la vista Clásica, el bloqueo de un profesional sombrea todo el día;
  - los bloqueos de clínica desaparecen al filtrar por sede;
  - un bloqueo de clínica aparece rotulado "Toda la sede".

**M3-29 · Bajo · previsible** · confirmado
- **Dónde:** `agenda/views.py:697`; `destroy`
- **Qué pasa:** `slots_disponibles?fecha=mal` responde 500. `DELETE` de una cita que tiene cobro también da 500. "Eliminar citas" no tiene botón.

**M3-30 · Bajo · seguridad/UX** · confirmado
- **Dónde:** `serializers.py:241-242`; `agenda/page.tsx:1550-1555`
- **Qué pasa:**
  - el listado expone `firma_asistencia_signing_token`;
  - hacer clic en un hueco no precarga la hora ni el profesional;
  - un paciente puede quedar con dos citas a la misma hora.

## Pruebas no técnicas

Usuarios: Admin, Recepción y Profesional. Para la prueba 15 también se necesita un usuario con solo "crear bloqueo".

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Crear 30 citas el mismo día y abrir la vista Día. | Se ven las 30. | M3-01 |
| 2 | En un mes con más de 25 citas, abrir la vista Mes. | Los totales coinciden con los reales. | M3-01 |
| 3 | Con más de 25 bloqueos antiguos, crear un bloqueo para mañana. | Aparece en la agenda y en el panel. | M3-02 |
| 4 | Bloquear "toda la sede" de 12:00 a 14:00 e intentar agendar a las 12:30. Repetir con un bloqueo de 3 días, en el día 2. | No se ofrece el horario. | M3-03 |
| 5 | Como Recepción: cita pendiente → Confirmar → "No confirmó" con una nota. | Se guarda sin error. | M3-04 |
| 6 | Reprogramar una cita confirmada, una de paquete y una de consulta libre. | Existe "Reprogramar" y funciona en las tres. | M3-05 |
| 7 | Como Profesional: cita de otro profesional → Cancelar. | No aparece la opción, o sale un mensaje claro. | M3-08, M3-23 |
| 8 | Agendar un tratamiento sin duración configurada. | "Configura la duración…", no "No hay horarios". | M3-09 |
| 9 | Desconectar internet y abrir la agenda. | Error con "Reintentar". | M3-10 |
| 10 | Cita a las 19:30 (la sede abre hasta las 21:00) → Cambiar profesional. | Funciona. | M3-11 |
| 11 | Reprogramar una cita para dentro de 2 días. | Llega el recordatorio de la nueva fecha. | M3-12 |
| 12 | Editar una cita y cambiar el procedimiento. | La agenda muestra el nuevo nombre. | M3-13 |
| 13 | Dos personas agendan el mismo horario al mismo tiempo. | Solo se crea una cita; la otra ve "horario ocupado". | M3-14 |
| 14 | Dejar 30 citas de ayer sin cerrar. | El aviso las muestra todas. | M3-15 |
| 15 | Con "crear bloqueo", intentar eliminar un bloqueo aprobado. | No puede. | M3-17 |
| 16 | Crear un bloqueo encima de citas existentes. | Avisa cuáles citas quedan afectadas. | M3-18 |
| 17 | Nueva cita → crear un paciente con un documento duplicado. | Mensaje de duplicado. | M3-22 |
| 18 | Llega un paciente con la cita pendiente. | Se registra la llegada en un solo paso. | M3-26 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/agenda/citas/?fecha_inicio__date=<d>&page_size=100` con 30 citas. | 30 resultados (hoy 25). | M3-01 |
| 2 | `GET /api/v1/agenda/bloqueos/?estado=aprobado` con más de 25. | Incluye los futuros. | M3-02 |
| 3 | `POST /api/v1/agenda/citas/` dentro de un bloqueo de sede (`profesional=null`). | 400 (hoy 201). | M3-03 |
| 4 | `POST /api/v1/agenda/citas/{id}/no_confirmo/` como Recepción. | 200 (hoy 403). | M3-04 |
| 5 | `PATCH /api/v1/agenda/citas/{id}/ {"estado":"completada"}` como Recepción. | 400 o el campo se ignora (hoy 200). | M3-06 |
| 6 | `POST /api/v1/agenda/citas/` con sede, paciente y profesional de otra clínica. | 400/403 (hoy 201). | M3-07 |
| 7 | `POST` de una cita con `sede=B`, desde un usuario de la sede A. | 403. | M3-07 |
| 8 | `PATCH` del profesional de una cita a las 19:30. | 200 (hoy 400). | M3-11 |
| 9 | Test: `verificar_horario_sede` con hora UTC y con hora local (19:00 Bogotá). | Mismo resultado. | M3-11 |
| 10 | `PATCH`/`DELETE` de un bloqueo aprobado con solo `crear_bloqueo`. | 403, o vuelve a pendiente. | M3-17 |
| 11 | `GET /api/v1/agenda/confirmar/<token>/` de una cita sin servicio. | 200 (hoy 500). | M3-21 |
| 12 | `slots_disponibles` con `fecha=2026-13-40`. | 400 (hoy 500). | M3-29 |
| 13 | `DELETE /api/v1/agenda/citas/{id}/` de una cita con cobro. | 400 claro (hoy 500). | M3-29 |
| 14 | Contar las queries de `slots_disponibles` con un profesional con 2.000 citas. | Número constante. | M3-19 |

## Notas

- En la base de datos, los roles Recepción y Profesional de las 5 clínicas no tienen `confirmar_manual`, `crear_bloqueo` ni `bloqueos.ver`.
- `agenda/page.tsx:1384` (`isAdmin` por rol) tiene poco impacto: un Admin ya tiene el permiso de crear.
- **Fuera de M3**, sobre `ColaEspera.tsx:77-95`:
  - `CONSENTIMIENTO_REQUERIDO` y los 403 al iniciar la atención no muestran nada;
  - `IniciarAtencionWizard.tsx:97-100` no tiene `onError`.

# Plan: firma diferida del profesional en consentimientos informados

> Estado: **diseño aprobado, pendiente de implementar** (2026-09-23).
> Reemplaza la sección B de `propuesta-firma-profesional-y-zonas-por-sexo.md` (atestación in-app), que se descartó porque no quedaba firmado **el mismo documento**.

## Problema

El paciente firma el consentimiento al aceptar la cotización, pero en ese momento no se sabe qué profesional lo va a atender. La firma del profesional queda pendiente hasta la primera atención, que puede ocurrir meses después.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Soporte legal | **Un solo sobre de Documenso** con las dos firmas, sellado con un solo certificado. Nada de estampar datos después ni de generar documentos aparte. |
| Vencimiento del sobre | En la instancia (`documenso.2asoft.tech`) los sobres **nunca vencen**. |
| Quién firma como profesional | El profesional de la cita que inicia la primera atención. Se asigna en ese momento. |
| Cómo firma el profesional | **Con su firma guardada (PNG)**, sin abrir el embed. Un clic en "Firmar". |
| TP opcional (2026-09-24) | Cosmetólogas, masajistas, etc. no tienen TP y no se modelan cargos por clínica. **La plantilla decide**: solo la firma es obligatoria (nombre y TP opcionales); la TP solo se ubica en consentimientos que la exigen (procedimientos médicos) y, si el documento la tiene, solo firma quien tenga TP cargada. El aviso del dashboard solo exige la firma. |
| Campos del profesional | **Firma, Nombre y Tarjeta profesional (TP)**. Se llenan automáticamente. **Sin fecha** en el documento; la fecha y hora quedan en el certificado de Documenso. |
| Plantillas sin firma del profesional | Opción **"Esta plantilla no requiere firma del profesional"**. El sobre solo lleva al paciente y se sella cuando él firma, como hoy. |
| Captura de la firma | Lienzo (canvas) en el navegador, o **QR para firmar desde el celular** con actualización automática en el PC. Subir una imagen queda como opción secundaria. |

## Verificación técnica (probada el 2026-09-23 contra la instancia real)

La API pública (con API key) **no** permite firmar, y `prefillFields` no acepta firmas. Las rutas tRPC que usa la pantalla de firma sí funcionan desde el backend y se autentican con el **token del destinatario**:

| Ruta | Formato |
|---|---|
| `POST /api/trpc/envelope.field.sign` | `{"json": {"token", "fieldId", "fieldValue"}}` |
| `POST /api/trpc/recipient.completeDocumentWithToken` | `{"json": {"token", "documentId"}}`; `documentId` es el número del `secondaryId` (`document_514` → 514) |

Valores de `fieldValue` según el tipo de campo:
- SIGNATURE: `{"type":"SIGNATURE","value":"data:image/png;base64,..."}` ✅
- NAME: `{"type":"NAME","value":"Dra. ..."}` ✅
- TEXT (TP): `{"type":"TEXT","value":"..."}`. **Falta probarlo** (misma ruta; se verifica al empezar).

Resultados:
- Sobre `SEQUENTIAL` + `distributionMethod: NONE`. El paciente firma y el sobre sigue `PENDING`.
- `envelope/recipient/update-many` **funciona con el sobre pendiente y el paciente ya firmado**. El token del destinatario **no cambia**. El registro de auditoría deja el evento "RECIPIENT UPDATED".
- Firma con PNG + completar → `COMPLETED`, sellado. El PDF muestra las dos firmas, y el certificado y la auditoría muestran al doctor real.
- `completeDocumentWithToken` falla con "has unsigned fields" si falta algún campo del destinatario.
- El certificado registra la **IP del servidor**, el agente `python-requests` y "Dispositivo: undefined" para la firma del profesional.

Riesgo: son **rutas internas**, sin garantía de que no cambien entre versiones. Mitigación: fijar la versión de la imagen de Documenso en Dokploy y tener un comando de prueba de humo (sección 10) que se corra antes de cada actualización.

---

## 1. Creación de la plantilla: mapeador en dos pasos

Pantalla: `configuracion/consentimientos/[id]/campos` (y el flujo de `nuevo`).

Arriba, un indicador de pasos: **① Campos del paciente → ② Campos del profesional**.

### Paso 1: Campos del paciente
- Igual que hoy: se ubican libremente firma, nombre, email, fecha, texto, número y casilla. Todos se muestran en el color del paciente.
- Botón **"Completar campos del paciente"**. Solo se habilita con al menos una **firma** del paciente.

### Paso 2: Campos del profesional
- Los campos del paciente siguen visibles, atenuados y bloqueados.
- Una casilla o interruptor destacado arriba: **"Esta plantilla no requiere firma del profesional"**.
  - **Activado**: se ocultan los campos del profesional y aparece el aviso *"El documento se sellará solo con la firma del paciente"*. El botón pasa a ser **"Guardar plantilla"**.
  - **Desactivado** (por defecto): una lista fija de **tres campos por ubicar**, cada uno con su estado ("pendiente" / "ubicado ✓"):
    1. **Firma**
    2. **Nombre**
    3. **Tarjeta profesional (TP)**
  - Nota: *"Se completan automáticamente con la firma, el nombre y la TP del profesional que atienda la primera cita"*.
  - Se agregan con un clic sobre el PDF, se mueven y se cambian de tamaño como los demás, y se muestran en el color del profesional. No se pueden duplicar ni cambiar de tipo.
  - **"Guardar plantilla"** solo se habilita cuando los tres están ubicados.
- Botón **"Volver a campos del paciente"**.

### Plantillas existentes
- Se abren directo en el paso 2, con la casilla sin marcar y los tres campos pendientes.
- En el listado de plantillas aparece la etiqueta **"Incompleta: faltan campos del profesional"** mientras no se complete o se marque "no requiere".
- Una plantilla incompleta se sigue usando como hoy (solo paciente), para no bloquear la operación.

### Datos
- `DocumensoConsentimientoTemplate.requiere_firma_profesional` (bool, default `True`), un campo explícito que refleja el interruptor.
- Cada elemento de `campos` (JSON) gana dos claves:
  - `firmante`: `"paciente"` | `"profesional"`. Los campos existentes se leen como `paciente`.
  - `rol`: solo en los del profesional, `"firma"` | `"nombre"` | `"tp"`.
- Propiedad calculada `campos_profesional_completos`: los tres roles presentes.
- Validación en el serializer de `guardar_campos`:
  - Al menos una firma del paciente.
  - Si `requiere_firma_profesional`: exactamente un campo por cada rol del profesional.
- Tipo de campo en Documenso: `firma → SIGNATURE`, `nombre → NAME`, `tp → TEXT`.

### Plantillas hechas en Documenso (`template_token`, flujo antiguo)
- Convención: el destinatario con `signingOrder` 1 es el paciente y el 2 es el profesional. Campos del profesional: SIGNATURE → firma, NAME → nombre, TEXT → TP.
- Si la plantilla de Documenso tiene un solo destinatario, se trata como "no requiere firma del profesional".
- Recomendación: migrar esas plantillas al mapeador propio.

---

## 2. Creación del sobre (al firmar el paciente, en la cotización)

`iniciar_firma_consentimiento_desde_plantilla` (y la rama `template/use`):

- **Si la plantilla requiere firma del profesional:**
  - `meta.signingOrder = "SEQUENTIAL"`.
  - Destinatario 1: paciente (orden 1).
  - Destinatario 2: "Profesional tratante" (orden 2), con un correo único por consentimiento, `profesional+{consentimiento_id}@noreply.<dominio>`, para no chocar con el correo del paciente cuando este cae en el de la clínica.
  - Cada campo se crea con el `recipientId` que le corresponde según su `firmante`.
- **Si no la requiere:** solo el paciente, como hoy.
- `meta.distributionMethod = "NONE"` (**por confirmar**, ver pendientes): la app maneja las firmas con el embed y WhatsApp, y Documenso no envía correos.
- Se guardan en el consentimiento: los ids de ambos destinatarios, el token del paciente (como hoy) y la copia de `requiere_firma_profesional`.
- `_buscar_signatario` deja de usar "el primer SIGNER": se identifica a cada firmante por el id guardado.

---

## 3. Firma del paciente (sin cambios visibles)

- **Embed** (en la app o con la tablet): igual que hoy. `completar_firma` marca `firmado=True`.
- **Link de WhatsApp**: `verificar_firma_consentimiento_en_documenso` pasa a revisar el **estado de firma del destinatario paciente**, no el del sobre completo. Hoy exige que firmen todos y el paciente queda pendiente.
- **Webhook**:
  - Se agrega `DOCUMENT_SIGNED`: si el que firmó es el paciente, se marca `firmado`.
  - `DOCUMENT_COMPLETED`: guarda el PDF sellado y, si hubo profesional, marca su firma como confirmada.
  - Hay que activar el evento `DOCUMENT_SIGNED` en la configuración del webhook de Documenso.
- Si el consentimiento no requiere profesional, el sobre queda `COMPLETED` en cuanto firma el paciente, como hoy.

---

## 4. Primera atención: modal "Firma del profesional"

### Cuándo aparece
Al pulsar **"Iniciar atención"** (`ColaEspera` y `/atenciones/[citaId]`), si algún consentimiento de la cita cumple las tres condiciones: `firmado` (paciente), `requiere_firma_profesional` y sin `fecha_firma_profesional`.

La validación también está en el backend (`agenda/views.py`, transición a `en_curso`, después de `CONSENTIMIENTO_REQUERIDO`): responde 400 con código `FIRMA_PROFESIONAL_REQUERIDA` y la lista de documentos. Si el frontend recibe ese 400 (por una carrera o desde otra pantalla), abre el mismo modal.

### Estado A: puede firmar
- Título: **"Vas a firmar como profesional tratante"**.
- *"Consentimientos de {paciente} pendientes de tu firma:"*. Cada documento muestra:
  - su nombre;
  - *"Firmado por el paciente el DD/MM/AAAA"*;
  - un enlace **"Ver documento"** que abre el PDF en una vista previa.
- Vista previa de cómo quedará: su **firma**, su **nombre** y su **TP**.
- Botón principal: **"Firmar y comenzar atención"**.
  - El backend firma todos los documentos y la cita pasa a `en_curso`.
  - Si un documento falla, se informa cuál y la atención **no** inicia. Los que ya se firmaron quedan firmados.
- Botón secundario: "Cancelar".

### Estado B: no puede firmar
El modal queda bloqueado (en rojo, sin botón de firmar) con el motivo exacto:
- *"No has cargado tu firma."* → botón **"Cargar mi firma ahora"**.
- *"No has registrado tu tarjeta profesional."* → un campo para escribir la TP y "Guardar".
- *"Esta cita está asignada a {otro profesional}. Solo él o ella puede firmar."* Sin acción; se resuelve reasignando la cita.

"Cargar mi firma ahora" abre ahí mismo la pieza de captura (sección 5). Al terminar, el modal pasa al estado A sin salir de la pantalla.

### "Ver documento"
Mientras falte la firma del profesional, Documenso no entrega el PDF con la firma del paciente estampada. La vista previa muestra el PDF de la plantilla (texto completo) más el dato "firmado por el paciente el …". Si más adelante se necesita ver la firma del paciente estampada en ese momento, se arma la vista previa superponiendo la imagen de su firma (la devuelve la respuesta de `field.sign`).

### Endpoint
`POST /agenda/citas/{id}/firmar-consentimientos-profesional/`
1. Permiso: `request.user == cita.profesional`. **Decisión pendiente**: ¿también un admin?
2. Valida que el usuario tenga `firma_digital` y `registro_profesional`. Si no, responde 400 con el motivo.
3. Por cada consentimiento pendiente de la cita:
   1. `envelope/recipient/update-many` → nombre y correo del profesional.
   2. `GET /envelope/{id}` → token del profesional y los ids de sus campos.
   3. `envelope.field.sign` por cada campo: firma = `firma_digital` convertida a PNG (Pillow, si viene en JPEG o WEBP), nombre = `nombre_completo`, TP = `registro_profesional`.
   4. `recipient.completeDocumentWithToken`.
   5. Guarda `firmado_profesional_por = request.user` y `fecha_firma_profesional = now()`.
   6. Registra en `LogAccion` (`consentimiento.firma_profesional`): IP, user-agent y el id del sobre. Este registro complementa el certificado de Documenso, que muestra la IP del servidor.
4. Devuelve la información de consentimientos actualizada. El frontend después llama a `cambiar_estado(en_curso)`.
- **A verificar en la implementación:** si enviar el `User-Agent` y `X-Forwarded-For` del doctor en las llamadas tRPC hace que el certificado muestre su dispositivo en vez del servidor.

---

## 5. Captura de la firma del profesional

Un componente reutilizable, `CapturaFirmaProfesional`, que aparece en **Mi perfil → Firma digital** y en el botón "Cargar mi firma ahora" del modal. Tiene tres pestañas:

### a) Dibujar aquí
- Lienzo con `react-signature-canvas` (ya instalado), con "Limpiar" y "Guardar firma".
- Exporta a PNG con **fondo transparente**, recortado al trazo.
- Se sube a `firma_digital` con el mismo endpoint de perfil de hoy.

### b) Firmar desde mi celular (QR)
1. El PC llama a `POST /users/me/captura-firma/` y recibe `{token, url, expira_en}`.
2. Muestra el QR (`qrcode.react`, ya instalado) de `{FRONTEND}/firma-movil/{token}`, con la cuenta regresiva de la vigencia y "Generar nuevo QR".
3. El celular abre `/firma-movil/[token]`, una página pública sin login:
   - *"Firma de {nombre del profesional}"*.
   - Lienzo a pantalla completa (mejor en horizontal), "Limpiar" y "Guardar firma".
   - Al guardar: *"Firma guardada. Ya puedes volver al computador."*
4. El backend guarda el PNG en el `firma_digital` del usuario dueño del token y marca el token como usado.
5. El PC consulta `GET /users/me/captura-firma/{token}/estado/` cada 2 segundos. Al recibir `completado`, refresca la vista previa y muestra *"Firma recibida desde el celular ✓"*. Si el token vence, ofrece generar otro.

### c) Subir imagen
Se conserva el flujo actual (JPEG, PNG o WEBP) como opción secundaria.

### Backend
- Modelo `users.CapturaFirmaToken`: `user`, `token` (aleatorio y largo), `expira_en` (10 minutos), `usado_en`, `ip_captura`, `user_agent_captura`.
- Endpoints:
  - `POST /users/me/captura-firma/` (con sesión): crea el token e invalida los anteriores sin usar.
  - `GET /public/firma-movil/{token}/` (público): devuelve el nombre del profesional, o 404 si el token es inválido o venció.
  - `POST /public/firma-movil/{token}/` (público): recibe el PNG (valida tipo y tamaño), lo guarda y marca el token como usado.
  - `GET /users/me/captura-firma/{token}/estado/` (con sesión): `pendiente` | `completado` | `vencido`.
- `LogAccion` `usuario.firma_capturada` con el origen (`lienzo` / `movil` / `archivo`), la IP y el dispositivo.
- El texto de ayuda del perfil cambia: la firma se usa en **órdenes médicas y consentimientos**.

---

## 6. Vigencia

- Mientras falta la firma del profesional, el consentimiento cuenta como **vigente**. `fecha_vencimiento = NULL` ya significa "no vence", así que no bloquea agendar ni cotizar.
- La vigencia (`vigencia_meses`) se cuenta **desde la firma del profesional**, cuando el documento queda completo.
- Si la plantilla no requiere profesional: se cuenta desde la firma del paciente, como hoy.
- Cambio en `ConsentimientoInformado.save()`: la fecha base es `fecha_firma_profesional` si el consentimiento la requiere y `fecha_firma` si no.

---

## 7. Cambios en el modelo de datos

**`configuracion.DocumensoConsentimientoTemplate`**
- `requiere_firma_profesional` BooleanField(default=True)
- `campos` (JSON): claves nuevas `firmante` y `rol`. Sin migración de datos; lo que falte se lee como `paciente`.

**`historia_clinica.ConsentimientoInformado`**
- `requiere_firma_profesional` BooleanField(default=False). Es una copia al crear el sobre; los consentimientos antiguos quedan en `False`.
- `documenso_recipient_paciente_id` y `documenso_recipient_profesional_id` (CharField, null).
- `firmado_profesional_por` FK a User (null, PROTECT, related_name `consentimientos_firmados_profesional`).
- `fecha_firma_profesional` DateTimeField(null).
- `firmado` **conserva su significado** (el paciente firmó), así que `consentimiento_satisfecho`, la cotización y la agenda no cambian.
- Propiedad `completo`: `firmado and (not requiere_firma_profesional or fecha_firma_profesional)`.

**`users.CapturaFirmaToken`**: modelo nuevo (sección 5).

**Serializers**:
- `build_consentimiento_info` agrega por ítem `requiere_firma_profesional`, `firmado_profesional` y `fecha_firma_paciente`.
- `ConsentimientoInformadoSerializer` expone los campos nuevos y `completo`.

---

## 8. Casos borde

| Caso | Comportamiento |
|---|---|
| Consentimientos ya firmados con un solo firmante | `requiere_firma_profesional=False`: no cambian ni bloquean nada |
| Consentimientos manuales o en papel (`ConsentimientoPaciente`) | No aplica |
| Plantilla marcada "no requiere firma del profesional" | Un solo firmante, se sella al firmar el paciente; el modal nunca aparece |
| Plantilla incompleta (faltan los campos del profesional) | Funciona como hoy (solo paciente), con la etiqueta de aviso en configuración |
| Procedimiento con "firma cada vez" | El mismo flujo, un sobre por cita |
| Sesiones siguientes con otro profesional | No vuelve a firmar: el documento ya está completo |
| El paciente no firmó en la cotización | Al iniciar la atención, primero el paso de consentimiento del paciente y después el modal del profesional |
| Quien inicia la atención no es el profesional de la cita | Bloqueado con el motivo (decisión pendiente para el admin) |
| El profesional cambia su firma después | Los documentos ya sellados no cambian; la nueva firma aplica a los siguientes |
| Falla Documenso a mitad de un lote | Los documentos ya firmados quedan firmados; se informa cuál falló; se puede reintentar |

---

## 9. Riesgos

1. **Rutas tRPC internas de Documenso**: fijar la versión de la imagen y correr la prueba de humo antes de cada actualización.
2. **El certificado muestra la IP del servidor para el profesional**: el clic explícito + `LogAccion` con la IP y el dispositivo reales; probar el reenvío de cabeceras.
3. **Sobres pendientes durante meses**: aceptado (la instancia no vence sobres). Conviene un listado o filtro de "consentimientos pendientes de firma del profesional" para darles seguimiento.

---

## 10. Pruebas

- **Backend (con Documenso simulado):**
  - creación del sobre con 1 o 2 firmantes según la plantilla;
  - asignación de campos por firmante;
  - validación de `en_curso`;
  - endpoint de firma: permisos, falta de firma, falta de TP, lote parcial;
  - webhook `DOCUMENT_SIGNED` / `COMPLETED`;
  - verificación por destinatario paciente;
  - vigencia desde la firma del profesional;
  - token de captura: vencimiento, un solo uso, usuario correcto.
- **Prueba de humo real**: comando `python manage.py probar_firma_profesional_documenso`. Crea un sobre de prueba, firma los dos lados con PNG (incluida la TP en TEXT), verifica `COMPLETED` y lo borra. Es la versión permanente de la prueba del 2026-09-23.
- **Frontend:** revisión manual del asistente de dos pasos, del modal en sus dos estados y de la captura por QR con un celular real.

---

## 11. Fases y esfuerzo

| Fase | Contenido | Estimado |
|---|---|---|
| 1. Backend: plantilla y sobre | Modelo y migraciones, validación de `campos`, creación del sobre secuencial, identificación de firmantes, webhook `DOCUMENT_SIGNED`, verificación por paciente, vigencia | 1.5 días |
| 2. Backend: firma del profesional | Validación de `en_curso`, endpoint de firma con tRPC, conversión a PNG, LogAccion, prueba de humo | 1.5 días |
| 3. Backend: captura de firma | `CapturaFirmaToken` y los 4 endpoints | 0.5 días |
| 4. Frontend: mapeador en dos pasos | Pasos, interruptor "no requiere", tres campos fijos, etiqueta "incompleta" | 1.5 días |
| 5. Frontend: captura de firma | Componente con 3 pestañas, página `/firma-movil/[token]`, consulta de estado, integración en el perfil | 1.5 días |
| 6. Frontend: modal de firma | Estados A y B, "ver documento", conexión con ColaEspera y `/atenciones/[citaId]`, manejo del 400 | 1 día |

Total aproximado: **~7.5 días**.

## Pendientes por confirmar

1. **Correos de Documenso** (`distributionMethod: NONE`): confirmar que hoy nadie depende del correo que Documenso envía al paciente.
2. **¿Un admin puede firmar como profesional** si la cita está asignada a otro? Recomendación: no; se reasigna la cita.

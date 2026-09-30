# Plan: WhatsApp con número propio (addon)

Fecha: 2026-09-13. Revisado contra el código el 2026-09-14 y el 2026-09-24.
**Reescrito el 2026-09-25** porque el alcance en Lyvio se redujo al mínimo:
solo se agregó la creación de plantillas; todo lo demás usa la API que
Chatwoot ya tenía (ver D7).

**Rediseñado el 2026-09-25 (D12):** el addon define cuántos números puede
conectar la clínica; los números son de la clínica y cada sede elige desde
cuál envía. Desaparece el "modo" general / por sede.

Estado: backend y frontend implementados sin commit; faltan las pruebas con
un número real. Avance en
[checklist-whatsapp-numero-propio.md](checklist-whatsapp-numero-propio.md).
Referencia de la API de Lyvio:
[handoff-lyvio-whatsapp-coexistence.md](handoff-lyvio-whatsapp-coexistence.md).

## Resumen del flujo

1. Un superadmin activa el **addon de número propio** a la clínica, con
   cuántos números puede conectar (D1, D12).
2. La clínica conecta su número con **Embedded Signup de Meta en modo
   Coexistence**. CliniQ canjea el `code` en Lyvio y Lyvio crea el inbox. El
   primer número queda como **número por defecto**: todas las sedes lo usan.
3. Si tiene varios números, en **Asignación** elige desde cuál envía cada
   sede (un número, el por defecto o el de CliniQ).
4. **Por ahora a mano**, desde `/console/clinicas/[id]`, el superadmin crea el
   catálogo de plantillas en la WABA de ese número y luego actualiza su
   estado hasta que Meta las apruebe.
5. Con todas las plantillas del catálogo aprobadas, el número pasa a
   `activo` y los envíos de la clínica salen por él. Si algo falla, salen por
   el **número compartido, como hoy**.

El **OTP de check-in no se migra**: siempre sale por el número compartido
(D8). Los **recordatorios automáticos** por número propio quedan como bonus,
fuera del núcleo (D9).

## Contexto

Hoy CliniQ envía por WhatsApp (OTP de check-in, recordatorios, cotizaciones,
órdenes médicas, links de firma) desde un número compartido, vía n8n → Lyvio.
**Lyvio es nuestro Chatwoot 4.18.0 self-hosted** (https://app.lyvio.io).

WhatsApp por el número compartido **ya es un addon con cupo**
(`backend/apps/clinicas/models.py`, `backend/apps/notificaciones/services.py`):

- `Plan.whatsapp_habilitado` / `Clinica.whatsapp_override` → property
  `Clinica.whatsapp_habilitado`.
- `Plan.whatsapp_envios_incluidos` / `Clinica.whatsapp_envios_incluidos_override`
  → cupo mensual (0 = sin límite).
- `EnvioWhatsApp` registra cada envío y es lo que cuenta contra el cupo.
- Desde la fase 3 (sin commit), todos los envíos pasan por
  `enviar_whatsapp` + `resolver_ruta_whatsapp`
  (`notificaciones/services.py`). `RutaWhatsApp.canal` hoy es siempre
  `compartido`; este addon agrega `propio`.

El número propio es una capa encima: la clínica usa **su propio número de
WhatsApp Business**, con su propia WABA, sus propias plantillas y su propio
pago a Meta. El paciente recibe el mensaje desde la clínica y su respuesta le
llega a la clínica en el teléfono.

### Configuración de Meta (hecha, 2026-09-15)

- App ID: `2050257332050356` (el App de Lyvio, compartido con todos sus
  clientes; por eso Lyvio se mantiene genérico).
- Configuration ID (Embedded Signup): `2909835515866390`.
- Dominio `https://cliniq.2asoft.tech/` en la lista de dominios permitidos del
  SDK de JavaScript.
- Flujo de **SDK de JavaScript** (popup + `postMessage`), no de redirección.
- App en modo **Live**.

### Requisitos y límites de Coexistence (documentación de Meta, 2026-09-24)

- **Popup**: `FB.login` con `config_id`, `response_type: "code"`,
  `override_default_response_type: true` y
  `extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" }`.
  Sin el `featureType` el popup ofrece el flujo API-only.
- **Evento de fin**: `type: "WA_EMBEDDED_SIGNUP"` con
  `event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"` (Coexistence) o
  `"FINISH"` (API-only). `data` trae `waba_id`, `business_id` y, a veces,
  `phone_number_id` (en Coexistence puede venir vacío).
- **Versión mínima** de WhatsApp Business App: 2.24.17.
- **Throughput**: 20 mensajes/segundo por número.
- **Inactividad de 14 días**: si la clínica no abre WhatsApp Business en el
  teléfono principal, Meta desconecta el número de la API.
- **Cambio de teléfono**: si la clínica inicia sesión en otro dispositivo
  principal, la coexistencia se desconecta.
- **Funciones que se desactivan en la app**: mensajes temporales, "ver una
  vez", ubicación en tiempo real y listas de difusión (las existentes quedan
  de solo lectura). WhatsApp para Windows y WearOS dejan de funcionar como
  dispositivos vinculados.
- **Líneas de crédito previas** con otro partner pueden hacer fallar el
  onboarding.

Lo que Coexistence exige del lado de Lyvio (no registrar el número, webhooks
`history` / `smb_app_state_sync` / `smb_message_echoes`, sincronización de
24 h) **ya funciona en producción** y no es trabajo de CliniQ.

## 0. Lyvio: qué hay y qué no hace

Autenticación: header `api_access_token` de un **usuario administrador** de
la cuenta de Lyvio de CliniQ. Los tokens de agente bot no sirven. CliniQ
**nunca** maneja tokens de Meta: Lyvio los guarda por inbox.

| Uso en CliniQ | Endpoint (`/api/v1/accounts/{account_id}/…`) |
|---|---|
| Conectar número | `POST whatsapp/authorization` |
| **Crear plantilla** (lo único nuevo) | `POST lyvio/inboxes/{inbox_id}/message_templates` |
| Refrescar caché de plantillas | `POST inboxes/{inbox_id}/sync_templates` |
| Leer plantillas y su estado | `GET inboxes/{inbox_id}/message_templates` (lee el caché) |
| Salud del número | `GET inboxes/{inbox_id}/health` |
| Contacto | `POST contacts` / `GET contacts/search?q=` |
| Conversación | `GET contacts/{id}/conversations` / `POST conversations` |
| Mensaje con plantilla | `POST conversations/{id}/messages` con `template_params` |
| Estados y respuestas | Webhook de cuenta: `message_created`, `message_updated` |

Limitaciones que CliniQ debe cubrir:

- **Envío asíncrono**: crear el mensaje no confirma que Meta lo aceptó. El
  fallo llega después por `message_updated` (`status: failed` +
  `external_error`).
- **Sin idempotencia**: un reintento puede duplicar el mensaje.
- **Caché de plantillas**: Chatwoot solo envía plantillas que están en su
  caché y aprobadas; su sincronización automática corre cada ~3 h.
- **No borrar nunca un inbox de clínica**: Chatwoot llama `/deregister` en
  Meta y desconecta el número de la API.

Todo lo demás (catálogo, estado por clínica, elección de número, respaldo,
cupo, UI) vive en CliniQ. Lyvio no sabe nada de CliniQ.

## 0.1 Cuenta de Lyvio y configuración

Una sola cuenta de Lyvio exclusiva de CliniQ, con **un inbox por número
conectado**. Las clínicas nunca reciben usuarios ni tokens de Lyvio.

**Dos cuentas de Lyvio distintas (D4):** el número compartido sigue en la
cuenta principal (cuenta `1`, inbox `14`), operado solo por n8n. Los números
propios van en la cuenta de CliniQ, operados solo por Django. Django nunca
usa credenciales de la cuenta principal.

```env
LYVIO_BASE_URL=https://app.lyvio.io
LYVIO_CLINIQ_ACCOUNT_ID=
LYVIO_CLINIQ_API_TOKEN=          # secreto: solo en Dokploy, nunca en logs ni frontend
LYVIO_WHATSAPP_APP_ID=2050257332050356
LYVIO_WHATSAPP_CONFIG_ID=2909835515866390
LYVIO_WEBHOOK_SECRET=            # lo genera Lyvio al crear el webhook; firma cada aviso
```

`LYVIO_WHATSAPP_APP_ID` y `LYVIO_WHATSAPP_CONFIG_ID` son públicos, pero el
backend se los entrega al frontend en el endpoint del asistente de conexión.
Así no hacen falta variables `NEXT_PUBLIC_*` ni rebuild del frontend.

**Aislamiento:** los endpoints de CliniQ resuelven siempre
`clínica → número → lyvio_inbox_id` desde la base. Nunca se aceptan IDs de
inbox, contacto o conversación enviados por el cliente.

Los contactos de Chatwoot son de **toda la cuenta**: el mismo paciente en dos
clínicas es un solo contacto en Lyvio (las conversaciones sí van por inbox).
Es aceptable mientras ninguna clínica use la UI de Lyvio.

## 1. Catálogo de plantillas

Las plantillas pertenecen a la **WABA**. Las del número compartido no sirven
en la WABA de una clínica: hay que crear una copia del catálogo en cada una y
cada copia pasa por la aprobación de Meta.

El catálogo vive **en código de CliniQ, como datos** (no se lee de la WABA
del número compartido): nombre, idioma, categoría, componentes con ejemplos y
el mapeo de variables desde los datos del envío. Las claves son las de
`EnvioWhatsApp.Tipo`.

| Tipo | Categoría | En el catálogo | Referencia en el número compartido |
|---|---|---|---|
| `recordatorio_cita` | UTILITY | sí | `envio_recordatorios_cliniq`: paciente, clínica, sede, fecha y hora, servicio, teléfono de la sede |
| `firma_documento` | UTILITY | sí | `firma_documento_cliniq`: nombre, clínica, link |
| `envio_cotizacion` | UTILITY (Meta puede pasarla a MARKETING) | sí | `envio_cotizacion_cliniq`: encabezado PDF; nombre, clínica |
| `envio_formula` | UTILITY | sí | `envio_orden_medica`: encabezado PDF; nombre, clínica |
| `checkin_otp` | AUTHENTICATION | **no (D8)** | `otp_citas`: siempre por el número compartido |

Todas en `es_CO`.

Reglas de Meta que el catálogo debe cumplir:

- Nombre solo con `[a-z0-9_]`. Usar nombres versionados
  (`cliniq_firma_documento_v1`): para cambiar una plantilla aprobada se crea
  la versión siguiente en todas las clínicas, no se edita.
- Las variables **no pueden ir ni al principio ni al final** del texto.
  Ojo con `firma_documento`: si el link queda como última variable, hay que
  agregar texto después.
- Toda variable necesita ejemplo (`example.body_text`).
- Encabezado PDF: `{ "type": "HEADER", "format": "DOCUMENT", "example": { "header_url": "<PDF público de ejemplo>" } }`.
  Lyvio lo descarga y lo sube a Meta. Hace falta un PDF de ejemplo en una
  URL pública fija.
- Lyvio necesita además el **texto ya renderizado** (`content`) en cada
  envío, así que el catálogo guarda el cuerpo y una función que lo rinde con
  las variables. Para `firma_documento`, el texto que hoy arma n8n a partir
  de `documento_tipo` debe salir igual desde el catálogo.
- Variables posicionales (`{{1}}`, `{{2}}`…): coinciden con las claves de
  `processed_params.body` que espera Lyvio.

**Todas o ninguna (D5).** Un número solo pasa a `activo` cuando las **4**
plantillas del catálogo están `APPROVED` en su inbox. Mientras tanto, todo
sale por el número compartido. No hay ruteo mixto por tipo.

**Agregar un tipo nuevo** rompería el "todas" de los números ya activos. Se
agrega al catálogo como `borrador`, se crea y aprueba en todos los números
existentes desde el admin y solo entonces se marca vigente. Mientras está en
borrador, ese tipo sale por el compartido para todos.

## 2. Modelo de datos

Reusar el patrón de addons existente (`Plan` + override nullable en `Clinica`
+ property con `_addon_efectivo`). La última migración de `clinicas` es
`0044_backfill_formas_pago.py`.

**Addon (D1):**

- `Plan.whatsapp_numero_propio_habilitado` (BooleanField, default `False`).
- `Clinica.whatsapp_numero_propio_override` (nullable) + property
  `whatsapp_numero_propio_habilitado`, que devuelve `False` si
  `whatsapp_habilitado` es `False` (depende del addon base). Sin la excepción
  de "sin plan = habilitado".
- Validación: un `Plan` no puede tener número propio sin WhatsApp base. En la
  consola, el override se deshabilita mientras el addon base esté apagado.
- `Plan.whatsapp_numeros_incluidos` (default 1) +
  `Clinica.whatsapp_numeros_incluidos_override`: cuántos números puede
  conectar (property `whatsapp_numeros_incluidos`, 0 sin el addon).
- `Plan.precio_por_numero_whatsapp` (DecimalField opcional), de referencia:
  no hay facturación automática hacia las clínicas.

**Conexión y números:**

```python
class ConexionWhatsappPropio(BaseModel):
    clinica = models.OneToOneField(Clinica, on_delete=models.CASCADE)
    pago_meta_configurado = models.BooleanField(default=False)  # la clínica confirma método de pago (D2)
    # Para envíos sin sede, sedes sin asignación (incluidas las nuevas) y
    # respaldo si el número de una sede no está activo (D11). El primero que
    # se conecta queda como por defecto; la clínica puede cambiarlo.
    numero_por_defecto = models.OneToOneField("NumeroWhatsapp", null=True, blank=True,
                                              on_delete=models.SET_NULL, related_name="+")


class NumeroWhatsapp(BaseModel):  # de la clínica, no de una sede
    conexion = models.ForeignKey(ConexionWhatsappPropio, on_delete=models.CASCADE, related_name="numeros")
    lyvio_inbox_id = models.CharField(max_length=64, unique=True)
    waba_id = models.CharField(max_length=64)
    phone_number_id = models.CharField(max_length=64, blank=True)
    numero_visible = models.CharField(max_length=30, blank=True)
    estado = models.CharField(choices=[
        ("conectado", "Conectado"),
        ("plantillas_pendientes", "Plantillas pendientes de aprobación"),
        ("activo", "Activo"),
        ("error", "Error"),
    ])
    ultimo_error = models.TextField(blank=True)
    ultimo_chequeo_en = models.DateTimeField(null=True, blank=True)


class AsignacionWhatsappSede(BaseModel):  # sin fila = número por defecto
    conexion = models.ForeignKey(ConexionWhatsappPropio, on_delete=models.CASCADE)
    sede = models.OneToOneField(Sede, on_delete=models.CASCADE)
    tipo = models.CharField(choices=["por_defecto", "numero", "cliniq"])
    numero = models.ForeignKey(NumeroWhatsapp, null=True, on_delete=models.SET_NULL)  # solo con tipo "numero"


class PlantillaWhatsappNumero(BaseModel):
    numero = models.ForeignKey(NumeroWhatsapp, on_delete=models.CASCADE, related_name="plantillas")
    tipo = models.CharField(choices=EnvioWhatsApp.Tipo.choices)
    nombre = models.CharField(max_length=100)
    idioma = models.CharField(max_length=10)
    estado = models.CharField()  # PENDING|APPROVED|REJECTED|PAUSED|DISABLED
    categoria = models.CharField(max_length=20, blank=True)  # la que dejó Meta
    ultimo_error = models.TextField(blank=True)
    # UniqueConstraint(numero, nombre, idioma)
```

- "No conectado" es la ausencia de `NumeroWhatsapp`.
- Límite: no se conecta un número más si ya hay `whatsapp_numeros_incluidos`.
  Se valida antes de llamar a Lyvio.
- Validar que la sede y el número asignados sean de la misma clínica.
- **Las plantillas se llevan por número (inbox), no por clínica.** Con varios
  números en la misma WABA, crear el catálogo en el segundo inbox devuelve
  "ya existe" (se trata como éxito) y queda con el mismo estado. Si un número
  es de otra WABA, también queda cubierto sin lógica extra.

**Envíos (`EnvioWhatsApp`, en `notificaciones`), campos nuevos:**

- `ruta` (`compartido` | `propio`) y `numero` (FK nullable a `NumeroWhatsapp`).
- `motivo_ruta`: `sin_addon`, `sin_numero`, `numero_no_activo`,
  `respaldo_por_fallo`, `otp_siempre_compartido`, `ok`…
- `estado`: `enviado` | `fallido` | `incierto` (ruta propia).
- `lyvio_message_id`, `lyvio_conversation_id`, `error_externo`.
- `datos` (JSON): lo necesario para reenviar por el compartido si falla
  (tipo, `pdf_url`, link, `documento_tipo`, payload del recordatorio).
- `respaldo_de` (FK a sí mismo): el envío por el compartido que reemplazó a
  uno propio fallido.

**Contactos en Lyvio:** `ContactoLyvio(paciente, numero, contact_id,
conversation_id)` para no buscar en cada envío. Si Lyvio devuelve 404 al usar
un ID guardado, se vuelve a resolver.

## 3. Conexión del número (Embedded Signup)

**Frontend** (Configuración → WhatsApp → Número de envío). Siempre muestra
arriba desde qué número reciben hoy los pacientes. Sin el addon, promociona el
número propio (comparación + botón a ventas). Con el addon:

1. **Sin números:** tarjeta "Cambia a tu número propio" → "Conectar mi
   número". Con números: sección **Tus números** ("1 de 2 incluidos") con
   "Conectar otro número" mientras no se llegue al límite.
2. **Pago en Meta (D2)**: explicar que Meta cobra los mensajes a la WABA de la
   clínica, con enlace a la configuración de pagos. La clínica marca "Ya
   agregué el método de pago" (`pago_meta_configurado`). No bloquea la
   conexión.
3. **Avisos** antes del popup: el popup dice "Lyvio", solo aplica a WhatsApp
   Business App ≥ 2.24.17, Meta decide la elegibilidad, y lo que se desactiva
   en la app (sección 7).
4. Cargar el SDK de Facebook con el App ID y el Config ID que entrega el
   backend, lanzar `FB.login` con los parámetros de Coexistence y escuchar el
   `postMessage` de Meta.
5. Si el evento es de cancelación o error, mostrar el copy de "no habilitado"
   y no llamar al backend.
6. Al terminar, enviar al backend **de inmediato** (el `code` vence rápido y
   es de un solo uso): `code`, `waba_id`, `phone_number_id` si vino,
   `business_id` y el nombre del evento.

**Backend:** `POST /notificaciones/whatsapp-propio/conectar/` (estado y configuración en `GET/PATCH /notificaciones/whatsapp-propio/`; permiso `clinicas.editar`)

1. Valida el addon y el límite de números.
2. `POST {LYVIO_BASE_URL}/api/v1/accounts/{LYVIO_CLINIQ_ACCOUNT_ID}/whatsapp/authorization`
   con `code`, `waba_id`, `phone_number_id` (si vino) e `is_coexistence: true`
   si el evento fue `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`.
3. La respuesta de Chatwoot 4.18 es solo `{success, id, name, channel_type}`:
   `id` = `lyvio_inbox_id`, **sin teléfono**. Se lee `GET …/inboxes/{id}` para
   `phone_number`, `provider_config.phone_number_id` y
   `reauthorization_required`. Esa respuesta trae el token de Meta
   (`provider_config.api_key`): solo `lyvio.datos_inbox` la toca y nunca se
   loguea. Si el GET falla, el número se registra igual y "Revisar salud" lo
   completa.
4. Crea el `NumeroWhatsapp` en `conectado`; si Chatwoot pide reautorizar
   (falló la suscripción de webhooks o el token), nace bloqueado por
   `conexion`. Si la clínica no tiene número por defecto, este queda como
   por defecto.
5. Si Lyvio responde `422 {success: false, error}`, el texto (en inglés, fijo
   en el código de Chatwoot) se traduce: "Channel already exists" (el número
   ya está en otro inbox, la unicidad es global), "Multiple phone numbers" y
   genérico para el resto. El original queda en el log. No se crea nada.
6. **Timeout de lectura**: el inbox pudo quedar creado en Lyvio y reintentar
   daría "Channel already exists". Se le pide a la clínica que no reintente y
   soporte lo recupera en la consola con **"Registrar un inbox existente"**
   (`POST /admin/tenants/{id}/whatsapp-propio/registrar-inbox/`), que lee el
   inbox de la cuenta de CliniQ en Lyvio y crea el `NumeroWhatsapp` sin llamar
   a Meta.

## 4. Plantillas: creación y aprobación, manual desde el admin (por ahora)

En `/console/clinicas/[id]`, por cada número conectado (endpoints de superadmin: `GET /admin/tenants/{clinica_id}/whatsapp-propio/` y `POST /admin/whatsapp-numeros/{id}/crear-plantillas|actualizar-plantillas|revisar-salud/`):

**"Crear plantillas"** (número en `conectado`, o para reintentar las
fallidas). Por cada plantilla del catálogo vigente:

`POST …/lyvio/inboxes/{lyvio_inbox_id}/message_templates` con la definición.

| Respuesta | Qué hace CliniQ |
|---|---|
| `201` `{id, name, language, status, category}` | Guarda la plantilla con el `status` y la `category` de Meta |
| `422` con `error.meta.code = 100` y `subcode = 2388024` | Ya existía: éxito, estado `PENDING` hasta el próximo refresco |
| Otro `422` | Rechazada: guarda `error.meta.user_msg` (o `error.message` si es de validación) |
| `502` | Falla temporal de Meta: se reintenta con el mismo botón |
| `401/403/404` | Error de configuración de CliniQ (token o inbox): se muestra y se registra |

Los errores son por plantilla: una que falla no revierte las demás. Si todas
quedan creadas, el número pasa a `plantillas_pendientes`.

**"Actualizar estado de plantillas"**:

1. `GET …/inboxes/{lyvio_inbox_id}/message_templates`: el caché que dejó la
   sincronización anterior (crear una plantilla ya encola una). Del `payload`
   se toman `name`, `language`, `status` y `category` de cada plantilla.
2. `POST …/inboxes/{lyvio_inbox_id}/sync_templates` para la próxima vez. Así
   no se espera al job de Lyvio dentro del request; si Meta acaba de aprobar,
   hay que volver a pulsar en un minuto.
3. Si todas las del catálogo vigente están `APPROVED`, el número pasa a
   `activo`. Como el estado se leyó del caché de Lyvio, las plantillas ya
   están listas para enviarse.
4. Si alguna queda `REJECTED`, `PAUSED` o `DISABLED`, el número pasa a
   `error` con ese motivo y todo sale por el compartido.
5. Si todavía hay `PENDING`, se muestra "volver a actualizar más tarde".

Avisar en la UI si Meta cambió la categoría de `envio_cotizacion` a
`MARKETING`: cambia el precio que paga la clínica.

**Bonus:** un Schedule de n8n (D6) que llame un endpoint protegido para hacer
el paso "Actualizar estado" solo en números con plantillas pendientes.

## 5. Envío

### Decisión de ruta (`resolver_ruta_whatsapp`)

1. `checkin_otp` → siempre compartido (D8).
2. Sin addon de número propio → compartido.
3. Buscar el número (D11, D12):
   1. **Sede del envío**, en este orden: la del objeto (`cita.sede`,
      `cotizacion.sede`); la de la cita ligada al objeto (historia clínica,
      consentimientos y protocolos tienen un `cita` opcional); si no hay, la
      sede de la **última cita del paciente** en la clínica.
   2. Asignación de esa sede: `cliniq` → compartido; `numero` → ese número si
      está `activo`.
   3. Si no hay sede, no tiene asignación, o su número no está `activo` → el
      **número por defecto**.

   Nunca un número de otra clínica.
4. Número elegido en `activo` y plantilla del tipo `APPROVED` en su inbox →
   `propio`.
5. En cualquier otro caso → compartido, **como hoy**, con
   `verificar_disponibilidad_whatsapp` (addon base + cupo).

La idea es que el paciente reciba los mensajes desde un número de la clínica,
al que puede responder o que puede buscar después; el compartido es solo el
último recurso.

Solo la ruta compartida descuenta cupo (D1), **también cuando es el respaldo
de un envío propio que falló** (D10). Todo se registra en `EnvioWhatsApp` con
`ruta` y `motivo_ruta`.

### Envío por Lyvio (ruta propia)

1. Crear el `EnvioWhatsApp` con `estado=incierto` **antes** de llamar a
   Lyvio. No hay clave de idempotencia por envío: el único reintento
   automático es el respaldo por el compartido, y ese es único por envío
   (`respaldo_de`). Evitar el doble clic es tarea del frontend.
2. **Contacto**: `ContactoLyvio` o `POST …/contacts` con `inbox_id`, `name` y
   `phone_number` en E.164. Si el número ya existe, `GET …/contacts/search?q=`.
   El caché guarda el teléfono: si el paciente lo cambia, se resuelve de nuevo.
   La conversación se guarda en el envío **antes** del POST del mensaje: si
   Meta rechaza tan rápido que el aviso llega antes que el `message_id`, el
   webhook encuentra el envío por conversación.
3. **Conversación**: la guardada, o
   `GET …/contacts/{id}/conversations` filtrando por `inbox_id`.
4. **Mensaje**:
   Si no hay, `POST …/conversations` con `{inbox_id, contact_id}` (sin
   mensaje: así el mensaje siempre se crea en el paso siguiente y se obtiene
   su `id`).
   - `POST …/conversations/{id}/messages` con
     `{content, message_type: "outgoing", template_params}`. Si responde 404
     (conversación borrada en Lyvio), se resuelve de nuevo una vez.

   `template_params` = `{name, language, category, processed_params: {body: {"1": …}, header: {media_url, media_type: "document", media_name}}}`.
   `header` solo en las plantillas con PDF; `media_url` es la URL pública que
   ya genera `enviar_documento_whatsapp_webhook`.
5. Respuesta OK → guardar `lyvio_message_id` y `estado=enviado`.
6. Error HTTP inmediato de Lyvio (4xx/5xx) → `fallido` y se envía por el
   compartido en el mismo request (`respaldo_por_fallo`).
7. **Timeout** → queda `incierto` y **no** se reintenta ni se cae al
   compartido: podría duplicarse. Queda visible en el admin.

"Enviado" solo significa que Lyvio lo aceptó. La confirmación real llega por
el webhook.

## 6. Webhook Lyvio → CliniQ

Endpoint nuevo `POST /notificaciones/lyvio-webhook/`. Se configura en Lyvio
en **Configuración → Integraciones → Webhooks** de la cuenta de CliniQ, con
los eventos `message_created` y `message_updated`. Al guardarlo, Lyvio genera
un secreto: va en `LYVIO_WEBHOOK_SECRET`. Cada aviso trae
`X-Chatwoot-Timestamp` y `X-Chatwoot-Signature: sha256=<HMAC-SHA256(secreto,
"<timestamp>.<cuerpo>")>` (verificado en el código de Chatwoot 4.18). CliniQ
verifica la firma sobre el cuerpo crudo y rechaza avisos de más de 5 minutos.

- **Cómo se reconoce un fallo**: el webhook de mensaje de Chatwoot 4.18
  (`Message#webhook_data`) **no trae `status` en la raíz**. Chatwoot llena
  `content_attributes.external_error` solo cuando el mensaje falla (y lo borra
  en cualquier otro estado); si no hay error, el estado se busca en
  `conversation.messages` con el mismo `id`. Verificado en el código de 4.18.
- **Mensaje fallido**: buscar el `EnvioWhatsApp` por `lyvio_message_id` (o por
  conversación si el aviso llegó antes que el `message_id`), marcarlo
  `fallido` con `external_error`. `external_error` viene como
  `"<código>: <título>"` si llegó por el webhook de estados de Meta; si Meta
  rechazó en el momento, trae solo el texto. Según el código:
  - **del paciente** (`131026`, `131049`, `130472`, `131050`): **sin
    respaldo**, el número de CliniQ tampoco lo entregaría o pasaría por encima
    de una decisión del paciente. Queda en "Envíos que no salieron";
  - **del número** (`131042` pago, `131045` registro, `131031` cuenta
    bloqueada, `368` restricción): el número queda **bloqueado** (`pago` o
    `conexion`) y el envío sale por el compartido. Así los siguientes no fallan
    dos veces cada uno. `131042` además desmarca `pago_meta_configurado`;
  - **de la plantilla** (`132001`, `132015` pausada, `132016` deshabilitada):
    se marca la plantilla, el número deja de estar activo y el envío sale por
    el compartido;
  - cualquier otro código o sin código: respaldo por el compartido.
- **Respaldo solo dentro de 1 hora**: un fallo que Meta reporta más tarde
  (teléfono del paciente apagado) ya no se reenvía; se registra. Evita, p. ej.,
  el recordatorio de una cita que ya pasó.
- **Bloqueos**: `NumeroWhatsapp.bloqueo` manda sobre las plantillas;
  "Actualizar estado" no lo borra. El de `conexion` lo levanta "Revisar salud"
  si Meta lo ve sano; el de `pago`, la clínica al confirmar "Ya agregué el
  método de pago" (si Meta sigue sin pago, el próximo envío lo bloquea otra
  vez).
- **Sin reintentos de Chatwoot**: los webhooks de cuenta no se reintentan y
  tienen 5 s de timeout. Un aviso perdido (p. ej. durante un deploy) deja el
  envío como `enviado`. Si el job de envío de Chatwoot falla con excepción, el
  mensaje queda `sent` sin webhook. Detectarlo requiere guardar el `source_id`
  (wamid) cuando Meta acepta el mensaje: pendiente.
- **`message_created` con `message_type: incoming`**: respuesta del paciente.
  La clínica ya la ve en su teléfono. En el MVP solo se registra; se usará
  si más adelante hay un botón "Confirmar cita". Se ignoran los salientes y
  los ecos de lo que la clínica escribe desde su teléfono.
- Si llega un `message_id` desconocido, responder `200` y registrar.
- Con el webhook ya creado en Lyvio, capturar un evento real de cada tipo y
  compararlo con los tests (`_evento_fallido` en `notificaciones/tests.py`).

## 7. Salud del número

`GET …/inboxes/{lyvio_inbox_id}/health` y `GET …/inboxes/{lyvio_inbox_id}`:
si `status` no es `CONNECTED`, `is_on_biz_app` deja de ser `true` o Chatwoot
marca `reauthorization_required`, el número queda bloqueado por `conexion`,
sus envíos van por el compartido y la clínica ve el aviso con la acción
concreta (abrir WhatsApp Business en el teléfono y escribir a soporte). Si
está sano, se levanta el bloqueo de `conexion` (no el de `pago`). De paso
completa `numero_visible` si faltaba.

Reconectar un número bloqueado (Coexistence desconectado por inactividad,
cambio de teléfono) no se puede con un Embedded Signup nuevo: daría "Channel
already exists". Chatwoot 4.18 lo permite con `whatsapp/authorization` +
`inbox_id` (reautorización del mismo inbox): pendiente como botón
"Reconectar".

- Núcleo: botón "Revisar salud" en `/console/clinicas/[id]` y chequeo al
  pulsar "Actualizar estado de plantillas".
- Bonus: Schedule diario en n8n (D6) que llame un endpoint protegido de Django.

Un número en `error` no afecta a los demás números de la clínica. Nunca se
deja a la clínica sin envíos por un problema del addon.

## 8. UI y copy

- **Configuración → WhatsApp → Número de envío**: número en uso, promoción o
  "Tus números" (estado de cada uno y "Conectar otro número") y
  **Asignación** (número por defecto + un dropdown por sede con "Número por
  defecto", cada número y "Número de CliniQ"). La asignación no se muestra si
  hay un solo número y una sola sede.
- **Configuración → WhatsApp → Consumo y envíos**: consumo del mes por ruta y
  envíos fallidos.
- **`/console/clinicas/[id]`**: override del addon (3 estados) y de números
  incluidos, cada número con su inbox, las sedes que lo usan, plantillas por tipo con estado y error, botones
  "Crear plantillas", "Actualizar estado" y "Revisar salud", conteo de
  números `activo` (referencia de cobro).
- **Uso de WhatsApp** (`uso_whatsapp_mes_actual`): desglose por ruta.

### Copy obligatorio

Antes de conectar:

> Conecta el número que ya utilizas en WhatsApp Business. Si Meta habilita la
> modalidad de coexistencia para tu número, podrás seguir respondiendo desde
> tu teléfono mientras CliniQ envía recordatorios y documentos
> automáticamente.

> La disponibilidad de esta modalidad la determina exclusivamente Meta.
> CliniQ no puede garantizar ni forzar la elegibilidad de un número.

> Al conectar, WhatsApp Business desactiva en tu teléfono los mensajes
> temporales, los mensajes de "ver una vez", la ubicación en tiempo real y las
> listas de difusión (las existentes quedan solo de lectura). WhatsApp para
> Windows deja de funcionar como dispositivo vinculado.

> Los mensajes que CliniQ envíe desde tu número los cobra Meta directamente a
> tu cuenta de WhatsApp Business, según el tipo de mensaje. Antes de conectar,
> agrega un método de pago en Meta Business Suite; sin él, los mensajes
> saldrán por el número de CliniQ. Los mensajes enviados desde tu número no
> consumen el cupo de mensajes de tu plan de CliniQ; los que salgan por el
> número de CliniQ (incluidos los códigos de check-in, que siempre se envían
> desde ahí) sí lo consumen.

### Copy de la asignación (D11, D12)

> **Número por defecto.** Para sedes nuevas, documentos sin sede y cuando el
> número de una sede tiene un problema.

Bajo cada sede: "Enviando desde +57 …" o "Enviando desde el número de CliniQ".

Recuadro "¿Qué número se usa?":

> Los documentos sin sede (consentimientos, órdenes médicas, firmas) usan la
> sede de la cita relacionada o, si no hay, la última sede donde se atendió el
> paciente. Si el número de una sede tiene un problema, el mensaje sale desde
> el número por defecto, y si ninguno está disponible, desde el número de
> CliniQ.

Siempre visible: "Los códigos de check-in siempre salen desde el número de
CliniQ."

Si todavía no hay ningún número listo:

> Mientras Meta aprueba tus mensajes (suele tardar de minutos a un día), todo
> se sigue enviando desde el número de CliniQ, como hasta ahora.

Si Meta no ofrece Coexistence:

> Meta no habilitó la coexistencia para este número. Tu WhatsApp actual no ha
> sido modificado. Puedes intentarlo nuevamente más adelante o contactar a
> soporte.

Después de conectar:

> Conexión activa. Puedes seguir respondiendo desde WhatsApp Business en tu
> teléfono. Abre WhatsApp Business al menos una vez cada 14 días: si no, Meta
> desconecta el número y los envíos volverán a salir por el número de CliniQ.
> No cambies de teléfono sin contactar primero a soporte.

## Decisiones

- **D1 — Addon dedicado, sin cupo** (2026-09-24). Pagado aparte, exige el
  addon base de WhatsApp. Los envíos por número propio no descuentan cupo; la
  ruta compartida sí.
- **D2 — Pago a Meta** (2026-09-24). Lo paga la clínica con su método de pago
  en Meta. CliniQ lo informa en el asistente y detecta `131042`.
- **D3 — Modo del número** (2026-09-24). Reemplazada por D12.
- **D4 — Dos cuentas de Lyvio** (2026-09-24). El compartido en la cuenta
  principal (n8n); los propios en la cuenta de CliniQ (Django). El catálogo
  vive en código.
- **D5 — Todas o ninguna** (2026-09-24). Un número está `activo` solo con las
  4 plantillas del catálogo aprobadas. Sin ruteo mixto por tipo.
- **D6 — Tareas periódicas en n8n** (2026-09-24). Schedule de n8n → endpoint
  protegido de Django; nada de crons en Dokploy.
- **D7 — Lyvio mínimo** (2026-09-25). En Lyvio solo se agregó la creación de
  plantillas. Idempotencia, confirmación de envío, respaldo y seguimiento de
  aprobación los hace CliniQ con la API existente. Se descartan
  `operation_id`, clave de idempotencia en Lyvio y "envío por inbox" nuevo.
- **D8 — OTP siempre por el compartido** (2026-09-25). `checkin_otp` no entra
  al catálogo. Evita la plantilla AUTHENTICATION (cuerpo fijo de Meta y botón
  de código) en cada WABA.
- **D9 — Recordatorios automáticos: bonus** (2026-09-25). Conectar el polling
  de n8n (fase A) y despacharlos por número propio no es parte del núcleo. El
  recordatorio inmediato desde la agenda sí usa el número propio, porque pasa
  por `enviar_whatsapp`.
- **D10 — El respaldo descuenta cupo** (2026-09-25). Si un envío propio falla
  y se reenvía por el compartido, ese reenvío cuenta contra el cupo. Si no
  hay cupo, el respaldo no sale y queda registrado como fallido.
- **D11 — Número de la clínica antes que el compartido** (2026-09-25). Lo que
  no tiene sede, o cuya sede no tiene número activo, sale por el **número por
  defecto** de la clínica, no por el compartido: el paciente debe poder
  responder o buscar después el número de la clínica que le envió la
  información.
- **D12 — Números de la clínica + asignación por sede** (2026-09-25). El
  addon define cuántos números se pueden conectar. Los números son de la
  clínica; cada sede elige en un dropdown "Número por defecto", uno de los
  números o "Número de CliniQ". El primer número conectado queda como por
  defecto y todas las sedes lo usan sin configurar nada. Reemplaza el "modo"
  general / por sede de D3.

## Criterio de terminado

1. Una clínica de prueba conecta su número desde CliniQ, queda con
   `lyvio_inbox_id` y como número por defecto.
2. Desde el admin se crea el catálogo en su WABA, incluida una plantilla con
   PDF. Repetirlo (o hacerlo en un segundo número de la misma WABA) trata los
   duplicados como éxito.
3. Al actualizar el estado tras la aprobación de Meta, el número pasa a
   `activo`.
4. Una cotización real sale desde el número de la clínica; la respuesta del
   paciente llega a su teléfono y a CliniQ por el webhook.
5. Si el número no está listo, o el envío falla (probar con una WABA sin
   método de pago → `131042`), el mensaje sale por el compartido una sola vez
   y el número pasa a `error`.
6. El OTP de check-in sale por el compartido aunque la clínica tenga número
   `activo`.
7. Asignación: un envío de la sede A sale por el número asignado a A si está
   activo; un consentimiento sin cita sale por el número por defecto; una
   sede con "Número de CliniQ" sale por el compartido; nunca sale por el
   número de otra clínica; no se puede conectar más números que los incluidos.
8. Con el addon base apagado, el de número propio queda inactivo aunque su
   override diga `True`.
9. Tests: decisión de ruta (OTP, por defecto, número asignado, sede con
   CliniQ, sede de la cita ligada y de la última cita, respaldo al por
   defecto), límite de números,
   creación de plantillas con duplicado, rechazo y `502`, parser del webhook,
   respaldo por `failed` sin duplicar y descontando cupo, `131042` → `error`,
   y timeout → `incierto`.

# Lyvio para CliniQ: WhatsApp con el número de cada clínica

Fecha: 2026-09-25. Base: **Chatwoot v4.18.0**. Producción corría 4.17.1 y se
actualiza con este cambio. Todo lo descrito se verificó contra las dos
versiones.

## Objetivo

Hoy CliniQ envía recordatorios de cita, cotizaciones, etc. desde un **número
genérico** propio. Se quiere que cada clínica pueda conectar **su propio
número** (WhatsApp Business App en Coexistence), para que el paciente reciba
el mensaje desde la clínica y su respuesta le llegue a la clínica en el
teléfono.

## Por qué hace falta crear plantillas por API

Las plantillas pertenecen a la **WABA**, no a la app ni al número. Las
plantillas de CliniQ viven en la WABA del número genérico. Cada clínica
conecta **su propia WABA**, vacía, y Meta no permite usar plantillas de otra
WABA. Por eso CliniQ debe **crear una copia de su catálogo en la WABA de cada
clínica**.

Lyvio (Chatwoot) solo permitía listar y sincronizar plantillas, no crearlas.
Eso es lo único que se agregó. Todo lo demás ya lo ofrece la API de Lyvio.

## Estado de Lyvio

- Coexistence ya funciona en producción: onboarding por Embedded Signup desde
  la UI de Lyvio, mensajes entrantes y salientes, y los mensajes que el
  negocio envía desde el teléfono (`smb_message_echoes`).
- **Nuevo:** endpoint de creación de plantillas (repo `lyvio`, rama
  `feat/whatsapp-template-creation`, commits `5cbe1b3` y `f90b045`). Solo
  agrega archivos; no modifica ningún archivo de Chatwoot. La imagen base
  queda fijada en `chatwoot/chatwoot:v4.18.0` (antes `:latest`).
- **Mejoras de 4.18.0 que aplican aquí:**
  - la autorización ya no adivina el número de la WABA;
  - no llama `/register` sobre números en Coexistence;
  - los adjuntos se envían subidos a Meta, lo que evita el error `131053`.

## API disponible para CliniQ

Autenticación: header `api_access_token` de un **usuario administrador** de la
cuenta de Lyvio. Los tokens de agente bot no sirven para estos endpoints.

| Paso | Endpoint | Estado |
|---|---|---|
| Conectar el número de la clínica | `POST /api/v1/accounts/{account_id}/whatsapp/authorization` con `code`, `waba_id`, `phone_number_id` (si el Embedded Signup lo entrega) e `is_coexistence: true` cuando el evento fue `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`. `business_id` es opcional desde 4.18. La respuesta trae `id` = `inbox_id`. | Ya existía |
| Listar inboxes | `GET /api/v1/accounts/{account_id}/inboxes` | Ya existía |
| **Crear plantilla** | `POST /api/v1/accounts/{account_id}/lyvio/inboxes/{inbox_id}/message_templates` | **Nuevo** |
| Refrescar el caché de plantillas | `POST /api/v1/accounts/{account_id}/inboxes/{inbox_id}/sync_templates` | Ya existía |
| Listar plantillas y su estado | `GET /api/v1/accounts/{account_id}/inboxes/{inbox_id}/message_templates` | Ya existía (lee el caché) |
| Salud del número | `GET /api/v1/accounts/{account_id}/inboxes/{inbox_id}/health` (incluye `is_on_biz_app`, `status`, `quality_rating`) | Ya existía |
| Enviar plantilla | Crear o reutilizar el contacto y la conversación en ese inbox, y luego `POST …/conversations/{id}/messages` con `template_params` | Ya existía |
| Respuestas y estados | Webhook de cuenta en Lyvio con los eventos `message_created` y `message_updated` | Ya existía |

### Crear plantilla

El `inbox_id` en la URL determina en qué WABA se crea y con qué token de
Meta. Lyvio los toma del canal del inbox (`provider_config`), que guarda el
token obtenido al conectar el número. CliniQ nunca maneja tokens de Meta. El
inbox se busca solo dentro de la cuenta del `api_access_token`.

```json
POST /api/v1/accounts/{account_id}/lyvio/inboxes/{inbox_id}/message_templates
{
  "name": "cotizacion",
  "language": "es_CO",
  "category": "UTILITY",
  "components": [
    { "type": "HEADER", "format": "DOCUMENT", "example": { "header_url": "https://…/ejemplo.pdf" } },
    { "type": "BODY", "text": "Hola {{1}}, adjuntamos tu cotización", "example": { "body_text": [["Ana"]] } }
  ]
}
```

- `components` usa el esquema de Meta. Campos opcionales que se pasan tal
  cual: `allow_category_change`, `parameter_format`,
  `message_send_ttl_seconds`.
- **Encabezado con archivo:** en `example.header_url` va una URL pública del
  archivo de ejemplo. Lyvio lo descarga, lo sube a Meta y lo reemplaza por
  `header_handle`. Formatos y tamaños aceptados:
  - `IMAGE`: jpeg/png, hasta 5 MB;
  - `VIDEO`: mp4/3gpp, hasta 16 MB;
  - `DOCUMENT`: pdf, hasta 20 MB.

  También se acepta `example.header_handle` directo.
- Validaciones previas, sin llamar a Meta:
  - `name` con formato `[a-z0-9_]`;
  - `language` obligatorio;
  - `category` debe ser `UTILITY|MARKETING|AUTHENTICATION`;
  - `components` no puede estar vacío;
  - el inbox debe ser WhatsApp Cloud.
- Al crearla, Lyvio encola una sincronización del caché de plantillas del
  inbox.

Respuestas:

| Código | Cuándo | Cuerpo |
|---|---|---|
| `201` | Meta la aceptó | `{ "id", "name", "language", "status", "category" }` (`status` y `category` son los que devuelve Meta) |
| `422` | Validación | `{ "error": { "type": "validation", "field", "message" } }` |
| `422` | Meta la rechazó (p. ej. ya existe) | `{ "error": { "type": "meta", "message", "meta": { "code", "subcode", "user_title", "user_msg", "fbtrace_id", "http_status" } } }` |
| `502` | Meta falló (5xx) o no respondió | `type: "meta"` o `"upstream"` |
| `401/403/404` | Token sin permiso, token de agente bot, o inbox de otra cuenta | |

## Flujo en CliniQ

1. **Conectar la clínica:** Embedded Signup de Lyvio →
   `whatsapp/authorization`. Guardar por clínica `account_id`, `inbox_id` y el
   estado.
2. **Replicar el catálogo:** por cada plantilla del catálogo, llamar a
   *Crear plantilla* con el `inbox_id` de la clínica. Un duplicado llega como
   `422` con `meta.code = 100` y `meta.subcode = 2388024` ("Content in This
   Language Already Exists"; verificado en producción): significa que la
   plantilla ya existía y se puede tratar como éxito.
3. **Esperar la aprobación:** llamar a `sync_templates` y luego
   `GET message_templates`. Cuando todas estén `APPROVED`, marcar la clínica
   como **lista**.
   - Chatwoot solo envía plantillas que están en su caché y aprobadas, y su
     sincronización automática corre cada ~3 h. Por eso se sincroniza antes
     del primer envío.
4. **Enviar:**
   - si la clínica está lista, enviar por su inbox;
   - si no lo está, o el envío falla, enviar por el número genérico.
5. **Respuestas:** el paciente responde y le llega a la clínica en su WhatsApp
   Business y al inbox de Lyvio. Si CliniQ necesita la respuesta (p. ej. un
   botón "Confirmar cita"), la recibe por el webhook de cuenta
   (`message_created`).

## Reglas de Meta que CliniQ debe manejar

- **Pago por clínica:** los mensajes se cobran a la WABA de la clínica. Sin
  método de pago, el envío falla (`131042`). Debe ser un paso del onboarding
  de la clínica, con respaldo por el número genérico.
- **Aprobación por WABA:** cada copia se revisa por separado. Meta puede
  rechazarla o cambiarle la categoría en una clínica y no en otra.
- **Categoría:** los recordatorios son `UTILITY`. Las cotizaciones pueden
  quedar en `MARKETING` si Meta las ve promocionales, lo que cambia el precio
  y las reglas de envío.
- **Cambios al catálogo:** conviene versionar el nombre
  (`recordatorio_cita_v2`) y crearla de nuevo en todas las clínicas, en vez de
  editar plantillas aprobadas.
- **Desconexión de Coexistence:** Meta desconecta el número si el teléfono de
  la clínica no abre WhatsApp Business en ~14 días o si inicia sesión en otro
  dispositivo. Se puede vigilar con `health` (`status`, `is_on_biz_app`).

## Limitaciones de la API actual de Lyvio

- **Envío asíncrono:** crear el mensaje no confirma que Meta lo aceptó. El
  resultado llega después por `message_updated`. Ojo: en 4.18 ese webhook
  **no trae `status` en la raíz** (`Message#webhook_data`); el fallo se
  reconoce por `content_attributes.external_error` (Chatwoot lo borra en
  cualquier estado que no sea `failed`) o por `conversation.messages` con el
  mismo `id`. Los webhooks de cuenta no se reintentan (timeout de 5 s).
  - Si el fallo llega por el webhook de estados de Meta, `external_error`
    viene como `"<código>: <título>"` (p. ej. `131042: …`).
  - Si Meta rechaza el envío en el momento, trae solo el texto del error,
    sin código.
- **Sin idempotencia:** un reintento puede duplicar el mensaje. CliniQ debe
  controlarlo de su lado, p. ej. guardando el `message_id` de Lyvio antes de
  reintentar.
- **Autorización sin `phone_number_id`:** desde 4.18, si la WABA tiene más de
  un número, Lyvio responde error en vez de adivinar. Si llega un
  `phone_number_id` que no está en la WABA, también da error. Conviene enviar
  siempre `phone_number_id` cuando el Embedded Signup lo entregue.
- **No borrar inboxes Coexistence:** en Chatwoot (4.17 y 4.18), borrar un
  inbox creado por Embedded Signup llama a `/deregister` en Meta y desconecta
  el número de la API.

## Pendiente

1. **Desplegar** la rama `feat/whatsapp-template-creation`:
   - **respaldar la base de datos** antes: 4.18.0 trae 3 migraciones, que
     `db:chatwoot_prepare` aplica al arrancar;
   - rebuild de la imagen y recrear `chatwoot-lyvio` y
     `chatwoot-lyvio-worker`;
   - verificar que los números actuales siguen recibiendo y enviando.
2. **Prueba real** en un inbox Coexistence:
   - una plantilla de texto y otra con PDF;
   - ambas deben responder `201` y aparecer en Meta Business Manager.
   - A confirmar: que la subida del archivo de ejemplo funcione con el token
     del Embedded Signup. Meta documenta esa carga con token de usuario.
3. **Implementar en CliniQ** el flujo anterior: catálogo, estado por clínica,
   respaldo por número genérico y webhook.

## Fuera de alcance de Lyvio

Qué plantillas crear y cuándo, estado de cada clínica, elección del número
por el que sale cada mensaje, reintentos y respaldo, facturación, y UI de
CliniQ. Todo eso vive en CliniQ; Lyvio se mantiene genérico.

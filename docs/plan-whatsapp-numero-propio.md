# Plan: WhatsApp con número propio (addon)

Fecha: 2026-09-13 (revisado contra el código real el 2026-09-14 y actualizado
el 2026-09-17 para fijar el MVP de Coexistence y la topología de Lyvio).
Estado: planeado, no implementado.

**Config de Meta — confirmado hecho y verificado contra captura real
(2026-09-15):**
- App ID: `2050257332050356`
- Configuration ID (embedded signup): `2909835515866390`
- Dominio `https://cliniq.2asoft.tech/` agregado a la whitelist del SDK de
  JavaScript (mismo panel donde Lyvio ya tiene `lyvio.io`/`app.lyvio.io`).
- Es el flujo de **SDK de JavaScript** (popup + evento de mensaje), no el de
  redirección de página completa — no hace falta configurar "Valid OAuth
  Redirect URIs" para este caso. Webhook, system user token y verificación
  del negocio ya están funcionando en producción para Lyvio/Chatwoot, no se
  tocan.
- **App en modo Live, no Desarrollo** — confirmado por "Revisión de apps y
  verificación de acceso ✓: ahora puedes usar esta app en producción, no es
  necesario agregar manualmente usuarios de prueba". Esto descarta un riesgo
  real: si el App estuviera en modo Desarrollo, cualquier clínica real
  (al no ser un "test user" agregado a mano) quedaría bloqueada en el popup.
  Ya no aplica.
- Confirmado que Lyvio le sirve a más clientes que solo CliniQ (mismo App ID
  compartido entre todos) — refuerza por qué el endpoint `create_template`
  de la sección 0 debe ser genérico, sin ningún conocimiento de CliniQ: no es
  solo buena práctica, es la realidad de cómo está desplegado Lyvio.
- Los ítems sin marcar en "Configuración de registro insertado" del panel de
  Meta (`Create a system user token`, `Números de teléfono preverificados`)
  son para escenarios de aprovisionamiento manual/masivo, no para el flujo
  estándar de conexión en vivo que usa este plan — no bloquean nada.

La configuración base de Meta está lista. Antes de implementar todavía hay que
validar de punta a punta que la configuración usa el flujo vigente de Embedded
Signup con **Coexistence** y registrar los identificadores que devuelve el
modelo actual de cuentas de Meta (WABA/WAAC/PMA). El código no debe asumir que
un `waba_id` seguirá concentrando para siempre números, plantillas y billing.

## Contexto

Hoy CliniQ envía todo por WhatsApp (OTP de check-in, recordatorios, envío de
documentos/firma) desde un número compartido, con infraestructura propia.
**Lyvio es un fork/custom self-hosted de Chatwoot**: conserva su modelo de
cuentas, inboxes, contactos y conversaciones, y agrega la integración propia
con Meta que usa CliniQ. El costo de Meta es prácticamente nulo (~USD
$0,0008 por mensaje utility/authentication en Colombia). Ese número compartido
va en el plan base para todas las clínicas — no tiene sentido cobrarlo aparte.

Lo que sí es un addon legítimo es que una clínica use **su propio número de
WhatsApp Business**, porque ahí sí hay costo y trabajo real por clínica:
aprovisionar su WABA, aprobar sus propias plantillas de mensaje, y darle una
conversación bidireccional de verdad (las respuestas del paciente le llegan a
ella, no a nadie, como pasa hoy con el número compartido).

### Alcance cerrado del MVP: Coexistence, no bandeja de entrada

El autoservicio de esta primera versión acepta **únicamente Coexistence**: el
número ya vive en WhatsApp Business App, Meta permite conectarlo también a
Cloud API y la clínica continúa leyendo y respondiendo desde su teléfono. Lyvio
recibe/sincroniza la conversación como infraestructura, pero la clínica nunca
toca su UI. CliniQ tampoco construye todavía una bandeja de entrada.

Si Meta no ofrece Coexistence para el número, el flujo se detiene sin migrarlo
a API-only ni modificar su WhatsApp actual. La elegibilidad depende 100 % de
Meta: CliniQ no puede garantizarla ni forzarla. Si la clínica quiere evaluar
una conexión administrada directamente en Lyvio —que puede requerir migrar el
número o usar otro— debe contactar a soporte antes de cualquier cambio.

Detrás, CliniQ se apoya en el mismo App de Meta que ya tiene configurado Lyvio
(nada de un segundo registro/Tech Provider) y en el endpoint que Lyvio ya
expone (`POST /api/v1/accounts/:account_id/whatsapp/authorization`) para crear
el inbox y configurar el webhook.

### Topología decidida para el MVP

- Una sola **cuenta Lyvio exclusiva para CliniQ**, configurada globalmente.
- Un **inbox Lyvio por cada número conectado**, no solo por clínica. Una
  clínica con tres números/sedes tiene tres inboxes.
- Ninguna cuenta, usuario ni token de Lyvio se entrega a las clínicas.
- Cada clínica conserva sus propios activos de Meta. Compartir la cuenta de
  Lyvio no significa compartir WABA/WAAC/PMA ni números en Meta.
- CliniQ siempre resuelve `clinica -> sede/número -> lyvio_inbox_id`; jamás
  selecciona un inbox buscando solo el teléfono del paciente.

Esta topología es deliberadamente de MVP. Los contactos de Chatwoot son de
alcance de cuenta, aunque sus conversaciones pertenezcan a inboxes. Es
aceptable mientras solo los operadores internos tengan acceso a Lyvio y todo
el tráfico de CliniQ esté forzado por `inbox_id`. Si más adelante se ofrece la
UI de Lyvio a las clínicas, debe reevaluarse una cuenta por clínica o demostrar
aislamiento suficiente antes de abrir ese acceso.

## Plantillas: el problema que hay que resolver primero

Las plantillas de mensaje se aprueban **por WABA**, no globalmente. El WABA
compartido de Lyvio ya tiene las suyas aprobadas (OTP, recordatorio, envío de
documento); el WABA propio de cada clínica nace sin ninguna. Sin esto, una
clínica puede quedar "conectada" pero sin poder enviar nada real.

**Verificado directamente en el código de Chatwoot (self-hosted, `develop`)**:
la API de Lyvio **no expone ninguna acción para crear una plantilla nueva**.
Lo que sí existe (`app/controllers/api/v1/accounts/concerns/inbox_health_management.rb`):

- `sync_templates` → dispara `Channels::Whatsapp::TemplatesSyncJob`, que
  **lee/sincroniza** las plantillas que ya existen en Meta hacia la caché
  local de Chatwoot. No crea nada.
- `message_templates` (GET) → solo lee esa caché local, ni siquiera consulta
  Meta en vivo.

Y el token de acceso de Meta para cada WABA **nunca sale de Lyvio** — hay un
`PUT .../whatsapp_business_management_token` para cargarlo, pero ningún `GET`
para leerlo de vuelta. Consecuencia directa: **CliniQ no puede llamar
`POST /{waba_id}/message_templates` de Meta por su cuenta**, porque nunca
tiene el token.

**Solución**: agregar una acción nueva del lado de Lyvio (mismo patrón que ya
usan para `sync_templates`/`health`), por ejemplo `create_template`, que haga
internamente el `POST /{waba_id}/message_templates` de Meta usando el token
que el canal ya tiene guardado — sin que ese token salga nunca de Lyvio. Debe
ser **completamente genérica**: recibe nombre, categoría, idioma y
componentes por parámetro, sin ningún conocimiento de CliniQ ni de qué
plantillas son "las 3 conocidas". Así queda reutilizable por cualquier otra
cuenta de Lyvio, no solo la de CliniQ.

Categoría por plantilla, importante para el endpoint: `UTILITY`/`MARKETING`
llevan cuerpo libre con variables (`{{1}}`, `{{2}}`); `AUTHENTICATION` (la del
OTP) **no admite cuerpo editable** — Meta lo fija automáticamente y exige un
botón de "Copiar código" — por eso, para esa plantilla puntual, el payload es
incluso más simple de construir.

**Orquestación — manual desde el admin de CliniQ; ejecución en Lyvio.**
Decisión tomada a propósito para bajar riesgo: CliniQ no agrega Celery/RQ ni
dispara automáticamente la preparación de plantillas. Un superadmin inicia
cada operación desde `/console/clinicas/[id]`. Lyvio puede ejecutar internamente
con ActiveJob, como ya hace `sync_templates`, pero para CliniQ nunca puede ser
un fire-and-forget silencioso: la llamada debe devolver el resultado final o un
`operation_id` consultable hasta `succeeded`/`failed`.

Además, encadenar "esperar `health` y después crear estas 3 plantillas
puntuales" dentro de `Whatsapp::EmbeddedSignupService` estaría mal de
cualquier forma: ese servicio lo usan **todas** las cuentas de Lyvio, no solo
CliniQ — meter ahí una regla de negocio específica afectaría a clientes de
Lyvio que no tienen nada que ver con CliniQ. Lyvio se queda genérico (el
endpoint `create_template` de arriba, sin lógica de cuándo ni qué crear).

Dos acciones manuales en `/console/clinicas/[id]`, cada una con su propio
botón:

1. **"Crear plantillas"** — se **habilita solo cuando el `NumeroWhatsappSede`
   ya pasó a `estado="conectado_sin_plantillas"`** (es decir, apenas
   `whatsapp/authorization` devolvió `inbox_id` y la cuenta en Lyvio quedó
   creada — antes de eso no hay nada contra qué disparar nada, el botón ni
   aparece). Al apretarlo:
   1. Primero consulta `health` (GET, sección 4); si no está listo, muestra
      el error tal cual y no hace nada más — se reintenta apretando de nuevo,
      sin backoff ni reintentos automáticos.
   2. Si `health` da bien, consulta `message_templates` del inbox compartido
      y cruza la respuesta contra un **catálogo controlado de capacidades de
      CliniQ** (`checkin_otp`, `recordatorio_cita`, `firma_documento`,
      `envio_documento`, `envio_cotizacion`). No se ofrece para clonar toda la
      cuenta ni se exponen plantillas ajenas al producto.
   3. Al confirmar, por cada capacidad seleccionada llama `create_template`
      sobre la cuenta de mensajería nueva. Lyvio normaliza el objeto leído al
      esquema de creación de Meta: elimina IDs/estado/calidad, conserva idioma
      y ejemplos, transforma componentes y trata `AUTHENTICATION` de forma
      específica. No se reenvía la respuesta de lectura "tal cual".
   4. Guarda `pending` en `plantillas_estado` por capacidad, junto con nombre,
      idioma e ID externo cuando exista.
2. **"Actualizar estado de plantillas"** — visible mientras
   `plantillas_estado` tenga alguna en `pending`. Al apretarlo, primero dispara
   `sync_templates` en Lyvio y espera/consulta su operación. Solo cuando termina
   correctamente lee `message_templates` (GET) y refresca
   `plantillas_estado` con lo que Meta ya aprobó/rechazó, incluyendo
   `paused`/`disabled` si Meta los reporta. Leer la caché sin sincronizar antes
   no cuenta como una actualización.
   Cuando todas las capacidades **requeridas** quedan `approved`, ese número
   pasa a `estado="activo"`; una plantilla opcional no bloquea las demás.
   Nadie necesita quedarse mirando la
   pantalla — se
   aprieta cuando a alguien se le ocurra revisar, no hay ventana de tiempo
   que perder por no automatizarlo (mientras tanto, sigue saliendo por el
   número compartido sin fricción).

### Contrato de errores de las operaciones manuales

- El backend de CliniQ persiste inicio, fin, estado, `operation_id`, error
  legible y referencia técnica devuelta por Lyvio/Meta.
- El botón queda en estado "Procesando" mientras la operación siga activa y no
  permite iniciar otra igual para la misma conexión.
- Si Lyvio responde error sin encolar nada, se muestra inmediatamente y se
  persiste en `ultimo_error`.
- Si el job de Lyvio falla después de ser aceptado, el polling debe terminar en
  `failed`; nunca dejar la UI girando ni asumir éxito por haber recibido `202`.
- Los errores parciales se registran por capacidad/plantilla: una creación
  exitosa no se revierte porque otra falle.
- Ante cualquier error la conexión permanece en
  `conectado_sin_plantillas`, los tipos afectados siguen por el número
  compartido y el admin muestra un botón explícito de reintento.
- La UI presenta un mensaje útil al operador y conserva el detalle técnico
  desplegable/copiable para soporte; ningún fallo queda solo en logs de Lyvio.

Si más adelante se vuelve una operación frecuente y vale la pena automatizar
el paso 2, se evalúa sumar un cron. La primera versión mantiene el disparo
manual para que un operador observe el resultado.

## 0. Trabajo previo en Lyvio (no es código de CliniQ)

Antes de que CliniQ pueda apoyarse en esto, hace falta agregar en el propio
código de Lyvio (Chatwoot self-hosted, repo propio):

- Una acción nueva tipo `create_template` en el inbox (mismo módulo que
  `inbox_health_management.rb`), que reciba la definición de una plantilla
  (nombre, categoría, idioma, cuerpo, botones) y haga el
  `POST /{waba_id}/message_templates` de Meta usando el token que el canal ya
  tiene guardado — el token nunca sale de Lyvio.
- Confirmar (o agregar) que el webhook `message_template_status_update` de
  Meta llega a Lyvio y decidir cómo se lo hace saber a CliniQ: lo más simple
  es que Lyvio guarde el estado y CliniQ lo consulte por polling contra
  `message_templates` (GET) — ya confirmado que existe y es de lectura.
- Exponer el estado de los jobs disparados por `create_template` y
  `sync_templates` (`operation_id`, `queued|running|succeeded|failed`, error y
  timestamps), o hacer la operación síncrona si su duración lo permite. Un
  `202 Accepted` sin endpoint de estado no sirve para este MVP.

### Handoff técnico mínimo para el agente que modifica Lyvio

Implementar en el custom de Chatwoot/Lyvio, sin incorporar reglas de negocio
específicas de CliniQ:

1. **Autorización de WhatsApp con Coexistence**: el endpoint de Embedded Signup
   debe poder crear un inbox dentro de una cuenta Lyvio existente y devolver
   `inbox_id`, `phone_number_id`, los identificadores Meta vigentes y una señal
   inequívoca de que el resultado fue Coexistence. Debe devolver error explícito
   si ese modo no fue concedido; nunca convertir silenciosamente a API-only.
2. **Creación genérica de plantilla**: endpoint autenticado por inbox/cuenta que
   reciba nombre, categoría, idioma, componentes y ejemplos; normalice el
   payload y cree la plantilla con el token Meta que Lyvio ya custodia. El token
   nunca se expone a CliniQ.
3. **Sincronización observable**: `sync_templates` debe devolver resultado
   síncrono u `operation_id`. Si usa ActiveJob, agregar consulta de estado con
   `queued|running|succeeded|failed`, timestamps y error.
4. **Estado real de plantillas**: después de sincronizar,
   `message_templates` debe exponer al menos ID, nombre, idioma, categoría,
   componentes, estado y motivo de rechazo/error que conserve Lyvio.
5. **Envío por inbox explícito**: confirmar o ajustar el endpoint de envío para
   exigir `inbox_id`, retornar el ID externo del mensaje y propagar errores de
   Meta. No debe seleccionar el canal buscando solo el teléfono del contacto.
6. **Salud y webhook**: mantener utilizables por API `health` y
   `register_webhook`, y confirmar que los eventos de estado de plantilla y
   mensaje actualizan el inbox correcto.
7. **Errores no silenciosos**: toda operación aceptada debe terminar en estado
   consultable. Conservar código/mensaje de Meta y una referencia técnica; no
   responder éxito definitivo solo porque el job fue encolado.
8. **Pruebas mínimas**: éxito y fallo de Coexistence, creación de plantilla,
   fallo interno de job después de un `202`, sincronización, aislamiento entre
   dos inboxes de la misma cuenta y envío por el inbox indicado.

Fuera del alcance del agente de Lyvio: catálogo de plantillas de CliniQ,
selección clínica/sede, fallback al número compartido, cupos, billing, UI de
CliniQ y creación de cuentas/usuarios Lyvio por clínica.

El entregable se considera aceptado cuando CliniQ puede ejecutar manualmente
el ciclo `authorization -> health -> create_template -> sync_templates ->
message_templates -> send` y obtener un resultado terminal verificable en cada
paso, incluyendo los fallos inducidos.

## 0.1 Cuenta única de Lyvio para CliniQ

Se descarta crear una cuenta y un usuario Lyvio por clínica. El MVP usa una
sola cuenta Lyvio dedicada a CliniQ y crea dentro de ella un inbox por cada
número conectado. Esto elimina el aprovisionamiento por Platform API y evita
guardar credenciales de Lyvio dentro de cada tenant.

Configuración global nueva del backend:

```env
LYVIO_BASE_URL=
LYVIO_CLINIQ_ACCOUNT_ID=
LYVIO_CLINIQ_API_TOKEN=
```

El token es una credencial técnica con alcance sobre todos los inboxes de
CliniQ: debe vivir únicamente en secretos del despliegue, nunca enviarse al
frontend, guardarse en modelos por clínica ni aparecer en logs. Todos los
endpoints propios de CliniQ deben resolver el `lyvio_inbox_id` desde una
relación validada de la clínica/sede activa; no se aceptan inbox IDs arbitrarios
enviados por el cliente.

## 0.2 Consolidar los puntos de envío de WhatsApp (prerequisito real)

**El hallazgo más importante de la revisión.** El plan original asumía que
"los envíos de esa clínica migran al número propio" es un interruptor único.
No lo es: hoy el envío de WhatsApp está repartido en **al menos 7 sitios de
llamada, en 5 apps distintas**, con **2 URLs de webhook ya separadas** y
**2 funciones de OTP duplicadas**:

- `backend/apps/agenda/services.py:341` (`_enviar_otp_whatsapp_cita`) y
  `backend/apps/protocolos/services.py:22` (`enviar_otp_whatsapp`) — mismo
  propósito (OTP de check-in), payload casi idéntico, código duplicado en dos
  apps.
- `backend/apps/notificaciones/services.py:27` (`enviar_documento_whatsapp_webhook`),
  `:67` (`enviar_link_firma_whatsapp`), `:115` (`enviar_recordatorio_cita_webhook`,
  con su propia URL de webhook separada, `N8N_APPOINTMENT_REMINDERS_WEBHOOK`).
- Puntos de llamada adicionales en `agenda/views.py:627,771`,
  `historia_clinica/views.py:762,926`, `cotizaciones/views.py:286`,
  `consentimientos/services.py:305`.

Ninguno de estos consulta hoy nada específico de la clínica antes de
mandar — solo hay una URL global en settings. Meter la rama "¿esta clínica
tiene número propio activo?" en cada uno de estos sitios, uno por uno, es
frágil (fácil que alguno quede desactualizado cuando se agregue un envío
nuevo en el futuro).

**Se necesita, antes o como parte de esta feature**: una única función de
envío centralizada (ej. `notificaciones/services.py::enviar_whatsapp(clinica,
telefono, tipo_mensaje, **payload)`) que resuelva puertas adentro "¿número
propio activo para esta clínica? → Lyvio; si no → n8n de siempre", y refactor
de los ~7 call sites (incluida la deduplicación de las 2 funciones de OTP)
para que todos pasen por ahí. Sin este paso, la feature de número propio no
tiene un lugar limpio donde vivir.

**n8n no debería necesitar cambios.** El workflow `cliniq/envio-documentos`
ramifica hoy solo por `tipo_notificacion` (ver
`reference-n8n-webhook-envio-documentos` en memoria), no por clínica, y
termina pegándole a Lyvio con la cuenta compartida — sin ninguna noción de
"esta clínica tiene número propio". Con el diseño de arriba, para las
clínicas con número propio activo Django **le pega directo a la API de
Lyvio, sin pasar por n8n en absoluto**; n8n sigue haciendo exactamente lo
mismo que hoy (mandar por la cuenta compartida) y simplemente deja de ser
invocado para esas clínicas. No verificado abriendo el workflow real — es
inferencia a partir del payload que Django ya manda y de esa nota de
memoria; confirmarlo mirando el workflow de n8n en sí antes de dar por
cerrado este punto.

**De paso**: hay una tercera vía de envío (`enviar_confirmacion_whatsapp` +
`enviar_recordatorio`, `backend/apps/notificaciones/services.py:200`, vía
Evolution API) que no tiene ningún caller en todo el backend — código muerto
de una integración anterior a Lyvio. No afecta el plan mientras siga muerto,
pero conviene limpiarlo en el mismo barrido para no dejar una tercera ruta de
envío fantasma dando vueltas.

## 1. Modelo de datos

Reusar exactamente el patrón que ya existe para los otros addons (`Plan` +
override nullable en `Clinica`, ver `backend/apps/clinicas/models.py`,
migración `0033_addons_por_plan.py`). Última migración real de `clinicas` a
hoy: `0035_quitar_addons_directos_clinica.py` — esta feature continúa en
`0036_...`.

- `Plan.whatsapp_numero_propio_habilitado` (BooleanField, default `False`).
- `Clinica.whatsapp_numero_propio_override` (BooleanField nullable) + property
  `whatsapp_numero_propio_habilitado` (mismo patrón de `_addon_efectivo`).

**Decisión revisada — activos Meta por clínica, números por Sede (máx. 1 por
sede).** La conexión de Meta y el conjunto de plantillas/capacidades pertenecen
a cada clínica; cada `Sede` que lo necesite puede tener su propio número. El
modelo persiste los IDs que devuelva Meta sin acoplar el dominio a que todo
seguirá viviendo siempre en una única WABA: Meta está separando la identidad y
números (WAAC) de plantillas/billing (PMA). `Sede` ya tiene su propio campo
`telefono`, pero el número efectivamente conectado se guarda también en
`NumeroWhatsappSede` y no se infiere de ese campo informativo.

Del lado de Lyvio, cada número sigue necesitando su propio inbox (Chatwoot
ata 1 inbox a 1 `phone_number_id`), así que "agregar el número de la sede 2"
significa: un segundo paso de embedded signup (elige el mismo WABA, agrega un
número) + un segundo `whatsapp/authorization` con ese `phone_number_id`, pero
**sin** un segundo ciclo de aprobación de plantillas — ya están aprobadas a
nivel de WABA.

**Cobro por número, para efectos financieros.** El addon deja de ser un
simple on/off: el cobro es **por cada número conectado**, no un monto fijo
por clínica.

**Verificado: no existe ningún sistema de facturación/cobro de CliniQ hacia
las clínicas.** `Plan.precio` (`clinicas/models.py:57-63`) es puramente de
referencia — un campo que el superadmin llena a mano en `/console/planes`,
sin ningún job, señal ni pasarela de pago detrás que lo convierta en un
cobro real. No hay ninguna app de billing, ni integración de pasarela de
pago a nivel plataforma, en todo el backend. La suscripción de cada clínica
se factura hoy fuera del sistema, manualmente.

Dado eso, "cobro por número para efectos financieros" no tiene nada
automatizado con qué engancharse — construir un motor de facturación
completo está fuera del alcance de esta feature. Lo que sí corresponde:
seguir el mismo patrón que ya usan con `Plan.precio` (dato de referencia
visible para uso manual):

- `Plan.precio_por_numero_whatsapp` (DecimalField, opcional, mismo estilo que
  `precio`) — de referencia, para que el superadmin sepa cuánto cobrar por
  número al mirar la clínica.
- En `/console/clinicas/[id]`, mostrar el conteo real de
  `NumeroWhatsappSede` en `estado="activo"` para esa clínica — el dato que
  alguien necesita para facturar manualmente, igual que hoy se factura el
  plan.
- Nada de generación automática de factura/cobro — no hay dónde engancharlo
  hasta que exista un sistema de billing de plataforma, que sería un
  proyecto aparte, mucho más grande que este addon.

**Credenciales.** CliniQ no guarda un token Lyvio por clínica. El único token
de Lyvio es global y vive en secretos del despliegue (sección 0.1). Los tokens
de Meta permanecen en Lyvio, que ya administra el canal; CliniQ guarda solo
identificadores no secretos y estados operativos.

Dos modelos: uno para la conexión (la WABA, 1:1 con `Clinica`) y otro para
cada número conectado dentro de ella (1:N con `Sede`, `Sede` opcional para
soportar un número "general" de la clínica sin asignar a una sede puntual):

```python
class ConexionWhatsappPropio(BaseModel):
    clinica = models.OneToOneField(Clinica, on_delete=models.CASCADE)
    meta_business_id = models.CharField(max_length=64, blank=True)
    meta_account_id = models.CharField(max_length=64, blank=True)  # WABA/WAAC/PMA efectivo
    # clave lógica -> {nombre, idioma, external_id, requerida, estado, error}
    # estado: pending|approved|rejected|paused|disabled
    plantillas_estado = models.JSONField(default=dict)
    ultimo_chequeo_en = models.DateTimeField(null=True, blank=True)
    ultimo_error = models.TextField(blank=True)


class NumeroWhatsappSede(BaseModel):
    conexion = models.ForeignKey(ConexionWhatsappPropio, on_delete=models.CASCADE, related_name="numeros")
    sede = models.OneToOneField(Sede, on_delete=models.CASCADE, null=True, blank=True)  # null = número general de la clínica
    lyvio_inbox_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    phone_number_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    numero_visible = models.CharField(max_length=30, blank=True)
    coexistencia_confirmada = models.BooleanField(default=False)
    estado = models.CharField(choices=[
        ("no_conectado", "No conectado"),
        ("conectando", "Conectando"),
        ("conectado_sin_plantillas", "Conectado, plantillas pendientes"),
        ("activo", "Activo"),
        ("error", "Error"),
    ], default="no_conectado")
```

Agregar además una `UniqueConstraint` condicional para permitir como máximo un
número general (`sede IS NULL`) por conexión, y validar que cualquier `sede`
pertenezca a la misma clínica de `conexion`.

`estado`/`plantillas_estado` de la conexión (WABA) siguen la primera vez que
se conecta un número (la primera pasa por todo el ciclo de aprobación); los
números que se agreguen después, sobre la misma WABA ya aprobada, arrancan
directo en `activo` en cuanto `health` de ese inbox da bien — sin pasar por
`conectado_sin_plantillas`.

## 2. Flujo de conexión

Dos variantes: **primer número de la clínica** (crea la WABA + arranca el
ciclo de plantillas) y **número adicional de otra sede** (reusa la WABA ya
aprobada, salta directo a `activo`). El popup de Meta y la llamada a
`whatsapp/authorization` son los mismos en ambos casos — lo que cambia es qué
hace CliniQ con la respuesta.

**Meta (config, una sola vez, manual):**
- Agregar el dominio de CliniQ a los dominios permitidos del App de Meta que
  ya usa Lyvio (Facebook Login for Business → Client OAuth settings).

**Frontend de CliniQ:**
- Pantalla en Configuración (ej. `configuracion/integraciones` o dentro de
  `configuracion/clinica`) con un botón "Conectar WhatsApp" **por sede** (más
  uno general de la clínica), visible solo si `whatsapp_numero_propio_habilitado`
  es `true` para esa clínica.
- Copy de crédito a Lyvio **antes** de abrir el popup: algo como "Tu WhatsApp
  se conecta a través de Lyvio, nuestra plataforma de mensajería — vas a ver
  su nombre en la ventana de Meta, es esperado." Esto evita que la clínica se
  confunda cuando el popup de Meta muestre el nombre de Lyvio y no el de
  CliniQ (no vamos a renombrar el App de Meta, se mantiene tal cual está).
- Antes del popup, explicar que este autoservicio es solo para un número que ya
  funciona en **WhatsApp Business App** y que Meta decide su elegibilidad para
  Coexistence. Nunca prometer que todos los números califican.
- El flujo debe solicitar/validar explícitamente Coexistence. Si Meta no la
  ofrece, cancela sin continuar como API-only y muestra que el número actual no
  fue modificado, más un enlace para contactar a soporte si la clínica quiere
  evaluar una conexión administrada en Lyvio.
- Carga el JS SDK de Meta con el `WHATSAPP_APP_ID`/`WHATSAPP_CONFIGURATION_ID`
  que ya están configurados en Lyvio (son públicos del lado cliente). Si ya
  existe una `ConexionWhatsappPropio` para la clínica, el flujo de Meta debe
  apuntar a **agregar un número a esa misma WABA**, no crear una nueva (Meta
  lo permite desde el mismo popup, eligiendo la WABA existente en vez de
  "crear una nueva").
- Al completar el popup, recibe `code` + `waba_id` (+ `business_id`,
  `phone_number_id`) y se los pasa al backend de CliniQ, junto con qué `sede`
  (o "general") está conectando.

**Backend de CliniQ:**
- Endpoint nuevo (ej. `POST /clinicas/whatsapp/conectar/`) que recibe esos
  datos y llama a
  `POST /api/v1/accounts/{LYVIO_CLINIQ_ACCOUNT_ID}/whatsapp/authorization` en
  Lyvio con la credencial técnica global de la sección 0.1. La clínica no crea
  ni recibe un usuario Lyvio.
- Si es el **primer número** de la clínica: crea `ConexionWhatsappPropio`
  (guarda los identificadores Meta no secretos) y un `NumeroWhatsappSede` con
  `estado="conectando"`; con la respuesta de Lyvio (`inbox_id`), guarda
  `lyvio_inbox_id`/`phone_number_id`, confirma que el resultado corresponde a
  Coexistence, marca `coexistencia_confirmada=True` y pasa a
  `estado="conectado_sin_plantillas"`.
  Con eso ya se habilita el botón "Crear plantillas" de la sección 3 — nada
  se dispara solo, alguien lo aprieta.
- Si ya existe `ConexionWhatsappPropio` (número adicional de otra sede): crea
  solo el `NumeroWhatsappSede` nuevo, guarda `inbox_id`/`phone_number_id`, y
  en cuanto `health` de ese inbox da bien pasa directo a `estado="activo"` —
  sin pasar por `conectado_sin_plantillas` ni volver a llamar
  `create_template` (las plantillas ya están aprobadas a nivel de WABA).

En ningún caso el frontend puede indicar libremente el `account_id` o el
`inbox_id` de Lyvio. El backend los toma de configuración y de sus relaciones
tenant-scoped.

## 3. Replicar plantillas

**Solo corre una vez por cuenta de mensajería Meta de la clínica**, al conectar
el primer número. Los números adicionales que compartan esa cuenta no repiten
el ciclo. No acoplar esta regla al nombre histórico WABA: debe resolverse con
el identificador efectivo que devuelva Embedded Signup. La orquestación es
manual, con dos botones:

- **"Crear plantillas"**, habilitado apenas el número pasa a
  `estado="conectado_sin_plantillas"`. Al apretarlo: chequea `health` en el
  momento; si está bien, presenta únicamente el catálogo de capacidades de
  CliniQ y crea sus plantillas mediante el adaptador normalizado de Lyvio.
  Guarda `pending` por capacidad en `plantillas_estado` (campo de
  `ConexionWhatsappPropio`, no del número). Si `health` no está listo,
  muestra el error y no hace nada más — se reintenta apretando de nuevo.
- **"Actualizar estado de plantillas"**, disponible mientras haya alguna en
  `pending`. Al apretarlo: dispara `sync_templates`, sigue su `operation_id`
  hasta resultado terminal y, solo si termina bien, consulta
  `message_templates` (GET) para refrescar `plantillas_estado`. Si falla,
  conserva el estado anterior y muestra/persiste el error del job.
- Mientras falte una capacidad requerida, ese `NumeroWhatsappSede` se queda
  en `conectado_sin_plantillas`. El router decide por tipo de mensaje: usa el
  número propio para las capacidades ya aprobadas y el compartido para las que
  aún no estén disponibles. Un timeout o resultado incierto no debe provocar
  reenvío automático sin idempotencia, para evitar mensajes duplicados.
- Cuando todas las requeridas quedan `approved`, ese número pasa a
  `estado="activo"` — y
  cualquier número adicional que se conecte después arranca directo en
  `activo` en cuanto su propio `health` esté bien, sin pasar por este ciclo
  ni necesitar ninguno de estos dos botones.

## 4. Verificación end-to-end

Todo lo de esta sección es **por número** (por `NumeroWhatsappSede`/inbox),
no por clínica — cada sede con número propio puede fallar o estar sana de
forma independiente. No alcanza con "se creó el inbox". Antes de marcar
`activo` y antes de migrar los envíos de ese número:

- **Inbox real**: confirmar que Lyvio devolvió `inbox_id` (no solo que el
  request dio 200).
- **Salud del canal**: Lyvio ya expone `GET .../inboxes/:id/health`
  (confirmado en código, `Whatsapp::HealthService`) — golpea Meta en vivo y
  devuelve el estado real del canal, incluyendo errores de autorización
  (token vencido/revocado) con su código y subcódigo. Es el chequeo correcto
  a usar, no hay que inventar uno propio.
- **Webhook vivo**: si `health` reporta problema de suscripción, Lyvio también
  expone `POST .../inboxes/:id/register_webhook` para volver a registrarlo
  sin intervención manual.
- **Plantillas aprobadas**: los 3 (o los que correspondan) slugs de
  `plantillas_estado` en `approved`.
- **Prueba de envío real** (recomendado antes de migrar del todo): mandar un
  mensaje de prueba real al momento de conectar y pedirle a la clínica que
  confirme que le llegó — la única verificación que prueba el camino
  completo, no solo que las piezas están configuradas.

Este chequeo se corre al conectar, y de nuevo periódicamente mediante un
management command de Django ejecutado por cron (no requiere Celery),
iterando cada `NumeroWhatsappSede` en `activo`, para detectar que algo se
cayó después (autorización de la cuenta revocada, número dado de baja en Meta
o plantilla pausada/rechazada en una edición posterior). El alcance exacto de
cada fallo —cuenta completa o un solo número— se toma de la respuesta de Meta
y no se presupone por el modelo histórico WABA. Si algo falla,
ese `NumeroWhatsappSede` pasa a `estado="error"` + los envíos de esa sede
vuelven automáticamente al número compartido hasta que se resuelva — el
resto de números/sedes de la misma clínica que sigan sanos no se ven
afectados. Nunca dejar a una clínica/sede sin poder mandar
recordatorios/OTP por un problema del lado del addon.

## 5. UI en CliniQ

- Pantalla con **una fila por sede** (+ una fila "general" de la clínica),
  cada una con su propio badge de estado (5 posibles: no conectado /
  conectando / conectado sin plantillas — con lista de qué falta aprobar —
  / activo / error con el motivo) y su propio botón "Conectar"/"Reconectar",
  siguiendo el mismo patrón visual que ya existe para otros addons.
- En `/console/clinicas/[id]`, el superadmin ve el estado de la conexión y de
  cada número por clínica, más el **conteo de números en `activo`** (el dato
  de referencia para facturar manualmente, ver sección 1) — aunque la
  anulación del addon en sí se maneje con el mismo control de 3 estados que
  ya existe para los otros addons.

### Copy obligatorio del autoservicio

Antes de conectar:

> Conecta el número que ya utilizas en WhatsApp Business. Si Meta habilita la
> modalidad de coexistencia para tu número, podrás seguir respondiendo desde
> tu teléfono mientras CliniQ envía recordatorios, códigos y documentos
> automáticamente.

Aviso visible, no escondido en términos:

> La disponibilidad de esta modalidad la determina exclusivamente Meta.
> CliniQ no puede garantizar ni forzar la elegibilidad de un número.

Si Meta no ofrece Coexistence:

> Meta no habilitó la coexistencia para este número. Tu WhatsApp actual no ha
> sido modificado. Puedes intentarlo nuevamente más adelante o contactar a
> soporte para evaluar una conexión administrada mediante Lyvio.

Después de conectar:

> Conexión activa. Puedes seguir respondiendo desde WhatsApp Business en tu
> teléfono. CliniQ utilizará este número para los envíos automáticos
> habilitados. No desvincules el número desde Meta ni desde WhatsApp Business
> sin contactar primero a soporte.

La UI nunca debe describir la alternativa de soporte como equivalente a
Coexistence: puede requerir otro número o una migración que cambie el uso desde
el teléfono, y soporte debe explicarlo antes de ejecutar cualquier cambio.

## Verificación / pruebas antes de dar por hecho

1. Confirmar el flujo completo con un número real de WhatsApp Business App que
   Meta muestre como elegible para Coexistence (un número de prueba Cloud API
   puede no recorrer ese camino): whitelist de dominio, popup disparado desde
   CliniQ, resultado explícito de Coexistence y creación del inbox en Lyvio con
   los IDs vigentes que entregue Meta. Nunca se probó llamar ese endpoint desde
   un sistema externo a Lyvio; la lectura de código no sustituye esta prueba.
2. Construir y probar el endpoint `create_template` en el propio código de
   Lyvio (no existe hoy) — confirmar que el `POST` a Meta funciona con el
   token que ya tiene guardado el canal, y que el estado de aprobación
   aparece correctamente después de disparar y completar `sync_templates`.
   Forzar además un fallo dentro del job y comprobar que el admin recibe
   `failed` con el error, no un falso éxito por el `202` inicial.
3. Probar el camino de fallback: plantilla rechazada a propósito, confirmar
   que el tipo de mensaje afectado sale por el número compartido una sola vez
   y que queda auditado el motivo del cambio de ruta.
4. Probar el chequeo periódico de salud con un token revocado a propósito
   (revocar desde Meta Business Settings) y confirmar que el sistema lo
   detecta y actúa (fallback + alerta), no que se queda en silencio.
5. Hacer el refactor de consolidación de envíos (sección 0.2) **antes** de
   escribir la lógica de bifurcación — confirmar con tests existentes (si los
   hay para `agenda`/`protocolos`/`notificaciones`) que ningún envío actual
   se rompe al pasar por la función centralizada nueva.
6. Probar la cuenta única de Lyvio de punta a punta: confirmar que la
   credencial técnica global puede crear y operar varios inboxes y que cada
   operación de CliniQ exige la relación clínica/sede/inbox correcta. Probar
   expresamente que un usuario de una clínica no puede consultar ni operar el
   inbox de otra enviando IDs manipulados.
7. Probar el flujo de **número adicional** (segunda sede): confirmar en la
   práctica que el popup de Meta deja agregar un número a una WABA ya
   existente (no solo crear una nueva), y que ese segundo número llega a
   `activo` sin pasar por el ciclo de plantillas — es el supuesto central del
   modelo de "WABA por clínica, números por sede" y no está probado contra
   Meta todavía, solo verificado por documentación.
8. Probar que una falla en un número (ej. token de esa sede revocado, si eso
   es posible de forma independiente al resto de la WABA) no tira abajo los
   demás números activos de la misma clínica.
9. Abrir el workflow real de n8n (`cliniq/envio-documentos`) y confirmar que
   efectivamente no tiene ninguna lógica por clínica — solo inferido hasta
   ahora a partir del payload y de una nota de memoria, no visto
   directamente. Si resulta que sí hay algo específico por cuenta ahí,
   revisar la sección 0.2 antes de construir.
10. Probar un número **no elegible para Coexistence** y confirmar que el flujo
    se detiene sin registrarlo como API-only, sin crear un inbox utilizable y
    sin alterar su WhatsApp Business App.
11. Probar que el mismo teléfono de paciente presente en dos clínicas se
    resuelve siempre dentro del inbox correcto y no reutiliza una conversación
    de la otra clínica, dado que los contactos de Chatwoot son account-wide.

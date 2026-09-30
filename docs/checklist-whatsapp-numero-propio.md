# Checklist: WhatsApp con número propio

Seguimiento de [plan-whatsapp-numero-propio.md](plan-whatsapp-numero-propio.md).
Lo hecho va ~~tachado~~ con fecha y commit.

**Dónde se hace:** 🟦 CliniQ (este repo) · 🟪 Lyvio · 🟧 n8n · 🟨 Manual / Meta

**Resumen:** Fase 0 4/4 · Fase 1 2/4 · Fase 2 3/3 · Fase 3 5/6 · Fase 4 5/7 · Fase 5 5/5 · Fase 6 5/6 · Fase 7 3/3 · Fase 8 3/4 · Fase 9 3/4 · Bonus aparte

**Backend de las fases 4 a 8 hecho** (2026-09-25, sin commit): 69 tests en `notificaciones`; 370 de 371 en las apps afectadas (el que falla es `agenda.CitaCotizacionItemTests.test_rechaza_item_sin_sesiones_disponibles`, depende de la fecha: agenda "mañana" y un sábado la sede está cerrada). Frontend hecho el mismo día (Configuración → WhatsApp, pestaña WhatsApp de la consola, addon en planes y clínicas, consumo por ruta en Plan). Faltan las pruebas con un número real.

Commiteado en la rama `feat/whatsapp-numero-propio` (`e237b78` backend, `24040c5` frontend), sin push. Las correcciones de la revisión del 2026-09-29 están sin commit.

Todo se desarrolla y prueba en local, en ramas; nada se fusiona ni se sube hasta decidirlo.

---

## Fase 0 — Plan y decisiones

- [x] ~~🟦 Revisar el plan contra el código actual~~ — 2026-09-24
- [x] ~~🟦 Cerrar decisiones D1–D6~~ — 2026-09-24
- [x] ~~🟦 Reescribir el plan con Lyvio mínimo (D7), OTP por compartido (D8), recordatorios automáticos como bonus (D9) y modo general/por sede (D3)~~ — 2026-09-25
- [x] ~~🟦 Decidir D10 (el respaldo descuenta cupo) y D11 (número de la clínica antes que el compartido)~~ — 2026-09-25
- [x] ~~🟦 D12: el addon define cuántos números; los números son de la clínica y cada sede elige el suyo en un dropdown (reemplaza el modo general/por sede)~~ — 2026-09-25

## Fase 1 — Verificaciones

- [x] ~~🟨 `featureType` de Coexistence: `whatsapp_business_app_onboarding` + evento `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING`~~ — 2026-09-24
- [x] ~~🟨 Error por falta de pago: 131042~~ — 2026-09-24
- [ ] 🟨 Tarifas en Colombia en la calculadora oficial de Meta (UTILITY y MARKETING)
- [ ] 🟨 Con un número real: agregar un segundo número a una WABA ya conectada en Coexistence (necesario para tener más de un número)

## Fase 2 — Lyvio

- [x] ~~🟦 Encargo con contratos de API: [handoff-lyvio-whatsapp-coexistence.md](handoff-lyvio-whatsapp-coexistence.md)~~ — 2026-09-24
- [x] ~~🟪 Endpoint de creación de plantillas (rama `feat/whatsapp-template-creation`), Chatwoot 4.18.0 desplegado y probado en producción~~ — 2026-09-25
- [x] ~~🟪 Coexistence en producción: Embedded Signup, entrantes, salientes y ecos del teléfono~~ — 2026-09-25

## Fase 3 — Consolidar los envíos de WhatsApp

Rama `feat/whatsapp-numero-propio`.

- [x] ~~🟦 Función central `enviar_whatsapp` + `resolver_ruta_whatsapp`~~ — 2026-09-24, sin commit
- [x] ~~🟦 Migrar los 8 sitios de envío a la función central~~ — 2026-09-24, sin commit
- [x] ~~🟦 Unificar las dos funciones de OTP~~ — 2026-09-24, sin commit
- [x] ~~🟦 Borrar el código muerto de Evolution API (y SMS Mensatek)~~ — 2026-09-24, sin commit
- [x] ~~🟦 Tests: 242 de las apps afectadas + 14 nuevos de la función central~~ — 2026-09-24, sin commit
- [ ] 🟨 Prueba manual en local: OTP de cita, OTP de protocolo, firma, cotización, orden médica y recordatorio inmediato

## Fase 4 — Modelos y configuración

- [x] ~~🟦 Addon `whatsapp_numero_propio` en `Plan`/`Clinica`, dependiente del addon base, + `precio_por_numero_whatsapp` (migración `clinicas.0045`)~~ — 2026-09-25, sin commit
- [x] ~~🟦 Validación: no guardar un plan con número propio sin WhatsApp base~~ — 2026-09-25, sin commit
- [x] ~~🟦 `ConexionWhatsappPropio` (pago, `numero_por_defecto`), `NumeroWhatsapp`, `AsignacionWhatsappSede`, `PlantillaWhatsappNumero`, `ContactoLyvio`; `whatsapp_numeros_incluidos` en plan y clínica (migración `notificaciones.0003`)~~ — 2026-09-25, sin commit
- [x] ~~🟦 `EnvioWhatsApp`: `ruta`, `numero`, `motivo_ruta`, `estado`, `lyvio_message_id`, `datos`, `respaldo_de`; el cupo solo cuenta la ruta compartida~~ — 2026-09-25, sin commit
- [x] ~~🟦 Variables `LYVIO_*` en settings (token nunca en logs): `LYVIO_BASE_URL`, `LYVIO_CLINIQ_ACCOUNT_ID`, `LYVIO_CLINIQ_API_TOKEN`, `LYVIO_WEBHOOK_SECRET`, `LYVIO_WHATSAPP_APP_ID`, `LYVIO_WHATSAPP_CONFIG_ID`, `LYVIO_PLANTILLA_PDF_EJEMPLO_URL`~~ — 2026-09-25, sin commit
- [ ] 🟨 Crear la cuenta de Lyvio de CliniQ y un usuario administrador con token
- [ ] 🟨 Cargar las variables en producción

## Fase 5 — Conexión del número

- [x] ~~🟦 Endpoint del asistente: `GET/PATCH /notificaciones/whatsapp-propio/` (estado, pago, número por defecto, asignación por sede, App/Config ID)~~ — 2026-09-25, sin commit
- [x] ~~🟦 `POST /notificaciones/whatsapp-propio/conectar/` → `whatsapp/authorization` (422 visible; rechaza el evento API-only `FINISH` sin llamar a Lyvio)~~ — 2026-09-25, sin commit
- [x] ~~🟦 Front: "Tus números" con límite del plan y "Asignación" (número por defecto + dropdown por sede)~~ — 2026-09-25, sin commit
- [x] ~~🟦 Front: paso de método de pago y copy de costos y de funciones que se desactivan~~ — 2026-09-25, sin commit
- [x] ~~🟦 Front: SDK de Facebook, `FB.login` con Coexistence, `postMessage`, canje inmediato del `code`~~ — 2026-09-25, sin commit

## Fase 6 — Plantillas (manual desde el admin)

- [x] ~~🟦 Catálogo en código (`notificaciones/catalogo_whatsapp.py`): 4 plantillas `cliniq_*_v1` (sin OTP), variables no al inicio ni al final, render del `content`~~ — 2026-09-25, sin commit
- [ ] 🟨 PDF de ejemplo en URL pública fija para los encabezados (`LYVIO_PLANTILLA_PDF_EJEMPLO_URL`; si está vacío se sube uno genérico al storage público)
- [x] ~~🟦 Backend de "Crear plantillas" por número (201, duplicado = éxito, 422 con `user_msg`, 502 reintento)~~ — 2026-09-25, sin commit
- [x] ~~🟦 Front: botones en la consola~~ — 2026-09-25, sin commit
- [x] ~~🟦 Backend de "Actualizar estado" (sync + lectura) → `activo` con todas aprobadas; rechazada → `error`~~ — 2026-09-25, sin commit
- [x] ~~🟦 Front: aviso si Meta pasa la cotización a MARKETING (el backend ya guarda la categoría)~~ — 2026-09-25, sin commit

## Fase 7 — Envío por número propio

- [x] ~~🟦 `resolver_ruta_whatsapp`: OTP compartido, sede del envío (objeto → cita ligada → última cita) → su asignación → número por defecto, número `activo` + plantilla aprobada~~ — 2026-09-25, sin commit
- [x] ~~🟦 Cliente Lyvio (`notificaciones/lyvio.py`): contacto, conversación, mensaje con `template_params`~~ — 2026-09-25, sin commit
- [x] ~~🟦 `incierto` antes del POST, sin reintento a ciegas; error inmediato → compartido~~ — 2026-09-25, sin commit

## Fase 8 — Webhook y salud

- [x] ~~🟦 Endpoint `POST /notificaciones/lyvio-webhook/` con firma HMAC de Chatwoot (`X-Chatwoot-Signature`, secreto que genera Lyvio en `LYVIO_WEBHOOK_SECRET`, tolerancia de 5 min)~~ — 2026-09-25, sin commit
- [ ] 🟨 Configurar el webhook de cuenta en Lyvio (`message_created`, `message_updated`) y capturar eventos reales
- [x] ~~🟦 Parser: `failed` → respaldo por compartido una vez; `131042` → número en `error`; entrantes solo se registran; si el respaldo no sale, queda en `NotificacionFallida`~~ — 2026-09-25, sin commit
- [x] ~~🟦 Backend de "Revisar salud" (`health`: `CONNECTED` e `is_on_biz_app`)~~ — 2026-09-25, sin commit

## Fase 9 — UI y cierre

- [x] ~~🟦 Configuración: número en uso, promoción sin addon, tus números y asignación por sede~~ — 2026-09-25, sin commit
- [x] ~~🟦 `/console/clinicas/[id]`: override, números, plantillas, botones, conteo de activos~~ — 2026-09-25, sin commit
- [x] ~~🟦 Uso de WhatsApp desglosado por ruta~~ — 2026-09-25, sin commit
- [x] ~~🟦 Categoría propia "WhatsApp" en Configuración: pestañas "Número de envío" y "Consumo y envíos" (consumo del mes + envíos fallidos); Plan enlaza al detalle; enlaces desde recordatorios y desde el paso de check-in~~ — 2026-09-25, sin commit
- [x] ~~🟦 "Número de envío" muestra siempre qué número está en uso y promociona el número propio aunque el addon esté inactivo (comparación + botón a ventas por WhatsApp)~~ — 2026-09-25, sin commit
- [ ] 🟨 Definir `WHATSAPP_NUMERO_CLINIQ` (número compartido que se muestra) y `CLINIQ_VENTAS_WHATSAPP` (botón "Quiero mi número propio") en producción
- [x] ~~🟦 Revisión previa al commit: teléfono cambiado no reutiliza la conversación, fallo que llega antes del `message_id`, plantilla rechazada no se reenvía, respaldo fallido queda en `NotificacionFallida` y las vistas lo manejan~~ — 2026-09-25, sin commit
- [x] ~~🟦 Mejoras de la revisión: el webhook reenvía después del commit (sin bloqueo durante la llamada a n8n), se quitó `clave` (sin uso), "Actualizar estado" sin espera de 5 s, límite de números mínimo 1, `Bloque` compartido~~ — 2026-09-25, sin commit
- [x] ~~🟦 Revisión cruzada contra el código de Chatwoot 4.18.0 y la documentación de Meta: el webhook no trae `status` en la raíz (se reconoce el fallo por `external_error`); la autorización no trae el teléfono (se lee el inbox); errores de conexión traducidos y timeout sin reintento; "Registrar un inbox existente" en la consola; respaldo según el código de Meta (sin respaldo para errores del paciente) y solo dentro de 1 h; bloqueo de número (`pago`/`conexion`) que "Actualizar estado" no borra; variables sin saltos de línea ni comillas; teléfono inválido va directo al compartido; orden de `message_id` y estado al terminar el envío (migración `notificaciones.0004`, 90 tests)~~ — 2026-09-29, sin commit
- [ ] 🟨 **Antes del 15-oct-2026:** confirmar que la configuración de Embedded Signup `2909835515866390` es v4 (Login for Business con el producto Cloud API seleccionado) y que su token no vence a los 60 días; si no, crear una nueva y cambiar `LYVIO_WHATSAPP_CONFIG_ID`
- [ ] 🟨 Criterio de terminado 1–9 del plan con un número real

---

## Bonus (fuera del núcleo)

**Recordatorios automáticos (D9)** — rama `feat/recordatorios-automaticos-n8n`:

- [x] ~~🟦 `recordatorios_pendientes` excluye clínicas sin addon y respeta el cupo; `marcar_recordatorio_enviado` descuenta cupo una sola vez~~ — 2026-09-24, commit `b61fadf`
- [ ] 🟦 Fusionar la rama a `main` y desplegar
- [ ] 🟧 Workflow "Enviar recordatorios": activar el Schedule, apuntarlo a producción con credencial, recorrer citas y marcarlas
- [ ] 🟦🟧 Despacharlos por número propio (endpoint en Django que use `enviar_whatsapp`)

**Robustez (de la revisión del 2026-09-29):**

- [ ] 🟦 Botón "Reconectar" para un número bloqueado: `whatsapp/authorization` con `inbox_id` (reautorización del mismo inbox en Chatwoot)
- [ ] 🟦🟧 Guardar el `source_id` (wamid) cuando Meta acepta el mensaje y señalar los envíos sin él (job de Chatwoot fallido o webhook perdido: hoy quedan como `enviado`)
- [ ] 🟦 Precargar el SDK de Facebook al abrir el diálogo (en Safari el popup puede bloquearse) y registrar `session_id`/`error_code` del evento `CANCEL`

**Automatizar el seguimiento (D6):**

- [ ] 🟧 Schedule de n8n para "Actualizar estado" de números con plantillas pendientes
- [ ] 🟧 Schedule diario de n8n para la salud de los números

**Seguridad de n8n** (independiente, conviene hacerlo igual):

- [ ] 🟧 Rotar el secreto de n8n y el token de Lyvio en texto plano en los workflows
- [ ] 🟧 Workflow `envio-documentos`: la rama de orden médica lee datos de la rama OTP; OTP/cotización/orden no pasan `clinica_id`/`paciente_id` al aviso de fallo; contacto de OTP sin nombre

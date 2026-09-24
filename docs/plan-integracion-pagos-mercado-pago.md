# Plan regional de links de cobro — Mercado Pago

## Propósito

Incorporar en CliniQ un link de cobro para citas, cotizaciones y cobros libres. El paciente paga en el checkout alojado de Mercado Pago; el dinero y la comisión del procesador se liquidan en la cuenta Mercado Pago vinculada de la clínica o profesional. CliniQ solamente crea el enlace, consulta el resultado y registra el pago confirmado.

El plan es regional: una misma experiencia dentro de CliniQ para países soportados por Mercado Pago, iniciando por Colombia, Chile y México. La integración elegida es **Marketplace + OAuth + Checkout Pro**, porque permite conectar la cuenta del cobrador sin que CliniQ almacene sus credenciales.

## Decisiones del MVP

- El receptor del dinero es una cuenta de Mercado Pago por clínica. El pago directo a varios profesionales en una misma cita queda para una fase posterior.
- CliniQ no cobra una comisión por transacción al comienzo. La estructura soportará activar una comisión futura mediante `marketplace_fee`, previa validación comercial y fiscal por país.
- El enlace se abre en la página de Mercado Pago (Checkout Pro); no se capturan tarjetas en CliniQ.
- Un enlace vence por defecto en 24 horas, es de una sola finalidad y no cambia de monto luego de creado.
- Un pago se considera pagado únicamente después de consultar y validar el estado informado por Mercado Pago. El retorno del navegador nunca confirma un pago.
- **La cita tendrá estado de pago propio.** No se reutiliza `Cita.estado`, pues ese campo ya describe la atención (`pendiente`, `confirmada`, `en espera`, `en curso`, `completada`, `cancelada` o `no asistió`). Se añade `estado_pago` para que el cobro no cancele, complete ni modifique indebidamente el ciclo clínico de la cita.
- La política inicial será: pago aprobado → cita `estado_pago=pagado` y, si la clínica exige prepago, `Cita.estado` pasa de `pendiente` a `confirmada`. Pago rechazado, vencido o cancelado → `estado_pago` refleja el resultado y la cita permanece pendiente; no se cancela automáticamente. Cada clínica podrá activar posteriormente una regla de cancelación automática con plazo y autorización explícitos.

## Qué se reutiliza y qué cambia por país

| Elemento | CliniQ lo implementa una vez | Configuración o validación por país |
| --- | --- | --- |
| Flujo de link, cobro, webhook, conciliación y auditoría | Sí | No |
| OAuth y almacenamiento seguro de tokens | Sí | Cada cuenta local autoriza a CliniQ y sus tokens vencen; deben renovarse periódicamente |
| Credenciales de la aplicación | Adaptador único | Se administran por país/entorno. Antes de producción se valida con Mercado Pago si una aplicación regional cubre cada país o se registra una aplicación y credencial por país |
| Moneda | Modelo multi-moneda | El cobro se crea en la moneda local de la cuenta receptora: COP, CLP o MXN; nunca se convierte ni se cobra en una moneda distinta sin un producto explícito de conversión |
| Métodos de pago y cuotas | El checkout se redirige igual | Mercado Pago muestra los medios habilitados para esa cuenta y país. Colombia puede ofrecer PSE; Chile y México muestran sus medios locales. No se deben prometer medios fijos en la interfaz de CliniQ |
| Comisión, impuestos y plazo de disponibilidad | Se guarda el resultado recibido | Tarifas, IVA, cuotas, límites, medios y tiempos los define Mercado Pago según país y cuenta. Se consulta en su panel y no se calcula en CliniQ |
| KYC y habilitación del vendedor | Flujo de estado y mensajes | Cada clínica/profesional completa la verificación requerida por Mercado Pago en su país. No existe una vía legítima para omitirla |
| Split 1:1 | Mismo contrato técnico | Está documentado para Argentina, Brasil, Chile, Colombia, México, Perú y Uruguay. Su disponibilidad efectiva y condiciones comerciales se confirman al activar producción en cada país |
| Estado de la cita | La misma máquina de estados de pago | La política de exigir prepago y el plazo de cancelación son configurables por clínica, no por país |

> Regla operativa: el país se determina por la cuenta Mercado Pago que recibe el dinero y por la clínica, no por el país del paciente. Para cobros transfronterizos se muestra el checkout local del receptor; el MVP no se diseña como adquirencia internacional.

## Flujo objetivo

```text
Profesional/recepción crea un cobro en CliniQ
        ↓
CliniQ selecciona la cuenta Mercado Pago activa de la clínica y su país
        ↓
CliniQ crea una preferencia Checkout Pro en la moneda local
        ↓
Paciente recibe y abre el link → paga en Mercado Pago
        ↓
Mercado Pago notifica a CliniQ (webhook)
        ↓
CliniQ consulta el pago con el token de la cuenta receptora
        ↓
Si está aprobado: crea PagoRecibido y actualiza el Cobro de forma idempotente
        ↓
Actualiza `Cita.estado_pago`; confirma la cita sólo si su clínica exige prepago
```

## Hitos secuenciales

### Hito 0 — Confirmación regional y habilitación comercial

**Objetivo:** no iniciar producción con supuestos de cobertura.

1. Definir países iniciales: Colombia, Chile y México, y el orden de salida.
2. Confirmar con Mercado Pago que la cuenta de CliniQ podrá operar Marketplace/Split 1:1 en cada país y si requiere aplicación/credenciales separadas por país.
3. Crear una cuenta de prueba y una cuenta de vendedor real por país piloto; validar el nivel de identificación requerido del vendedor (la documentación de Split 1:1 indica KYC 6).
4. Configurar dominios, URL HTTPS de retorno y webhook público de CliniQ.
5. Crear una matriz operativa por país: moneda, identidad fiscal solicitada, métodos visibles, cuotas, comisión, plazo de disponibilidad y política de reembolso.

**Criterio de salida:** existe una ficha aprobada por país piloto y una decisión explícita sobre credenciales regionales o por país.

### Hito 1 — Base multi-país y modelo de datos

**Objetivo:** evitar que Chile, Colombia o México queden codificados como casos especiales.

1. Añadir a la clínica un país de operación, moneda de cobro y política de prepago: `no_requerido` o `requerido_para_confirmar`. No inferir país o moneda desde teléfono o dirección.
2. Añadir a `Cita` el campo `estado_pago`: `sin_cobro`, `link_enviado`, `pendiente`, `pagado_parcial`, `pagado`, `rechazado`, `vencido`, `cancelado` y `reembolsado`. Incluir `actualizado_en`, la última `SolicitudDePago` y una razón administrativa opcional.
3. Definir transiciones válidas: una cita cancelada o completada conserva su estado de atención aunque un enlace posterior sea pagado o reembolsado; un pago aprobado sólo confirma una cita que siga en estado `pendiente` y cuya clínica exija prepago.
4. Crear `CuentaDePago` con clínica receptora, proveedor, país, moneda, entorno, identificador Mercado Pago, estado, tokens cifrados, vencimiento y referencia de aplicación sin secretos.
5. Crear `SolicitudDePago` vinculada a `Cobro`: monto y moneda inmutables; país y cuenta congelados; referencia externa, ID de preferencia, URL, vencimiento y estado.
6. Crear `EventoDePago` para conservar webhooks y resultados de consulta, con llave de idempotencia.
7. Extender `PagoRecibido` con proveedor, ID externo, moneda, método real y estado conciliado. Agregar el medio `mercado_pago` sin alterar pagos manuales.
8. Crear permisos: configurar cuenta, conectar/desconectar, generar/re-enviar link, consultar estado y reembolsar.

**Criterio de salida:** dos clínicas de países distintos tienen cuentas, monedas, credenciales y políticas de prepago independientes sin compartir datos.

### Hito 2 — Adaptador regional de Mercado Pago y OAuth

**Objetivo:** que el vínculo de una cuenta local sea seguro y recuperable.

1. Implementar `MercadoPagoProvider`, recibiendo explícitamente país, credencial de aplicación y cuenta conectada.
2. Crear inicio OAuth desde la configuración de la clínica usando `state` de un solo uso, asociado a clínica, país, usuario y entorno.
3. Implementar callback: validar `state`, intercambiar código, guardar tokens cifrados y registrar `collector_id`.
4. Renovar tokens antes de su vencimiento y marcar la cuenta como `requiere_reconexion` cuando falle. La documentación de OAuth indica vigencia de seis meses.
5. Prohibir que el frontend reciba `access_token`, `refresh_token` o secretos de aplicación.

**Criterio de salida:** una clínica de cada país piloto conecta y desconecta su propia cuenta sin acceso a credenciales ajenas.

### Hito 3 — Emisión del link de cobro

**Objetivo:** generar un enlace confiable desde un cobro pendiente.

1. Crear `POST /cobros/{id}/solicitudes-pago`.
2. Validar cobro de la clínica, saldo mayor a cero, cuenta activa, moneda compatible y ausencia de solicitud abierta equivalente.
3. Crear la preferencia Checkout Pro en backend con el token OAuth de la cuenta receptora.
4. Enviar una `external_reference` única con el ID interno de solicitud y metadatos mínimos, sin datos clínicos sensibles.
5. Guardar ID externo, URL de checkout, vencimiento y respuesta esencial del proveedor.
6. Regenerar sólo al anular o vencer el enlace anterior, preservando el historial.

**Criterio de salida:** se emiten URLs para COP, CLP y MXN usando sólo la cuenta y moneda locales correspondientes.

### Hito 4 — Webhook, consulta y conciliación

**Objetivo:** registrar pagos reales exactamente una vez.

1. Exponer endpoint público exclusivo para notificaciones Mercado Pago.
2. Registrar el evento antes de procesarlo y verificar autenticidad conforme al mecanismo vigente del proveedor.
3. Consultar pago/preferencia con el token de la cuenta receptora; no confiar en monto o estado enviados por el webhook.
4. Validar cuenta receptora, `external_reference`, moneda, monto permitido y estado.
5. Si está aprobado, crear una única `PagoRecibido`, recalcular `Cobro`, aprobar la solicitud y actualizar `Cita.estado_pago=pagado` dentro de una transacción.
6. Si la clínica tiene `prepago_requerido_para_confirmar` y la cita aún está pendiente, el mismo proceso la pasa a `Cita.estado=confirmada`. Esta transición no reemplaza `estado_confirmacion`: el pago y la confirmación de asistencia se conservan como conceptos distintos.
7. En estados pendientes, rechazados, cancelados o en revisión, actualizar solicitud y `Cita.estado_pago`, pero no registrar dinero ni cancelar la cita automáticamente.
8. Si se reembolsa un pago completo, cambiar a `estado_pago=reembolsado` y conservar tanto el pago como el reembolso en el historial. La cita no se revierte automáticamente.
9. Habilitar reintentos seguros y una tarea de conciliación de solicitudes pendientes o eventos fallidos.

**Criterio de salida:** eventos duplicados, fuera de orden o reintentados no duplican pagos ni transiciones de cita; una aprobación cambia saldo y estado de pago una sola vez.

### Hito 5 — Experiencia en CliniQ y envío por WhatsApp

**Objetivo:** que recepción cobre sin conocer diferencias técnicas por país.

1. Mostrar “Cobrar con Mercado Pago” sólo si existe cuenta activa.
2. Mostrar separadamente el estado de atención y el estado de pago: por ejemplo, “Cita pendiente · Pago vencido” o “Cita confirmada · Pago pagado”.
3. Permitir copiar, enviar por WhatsApp, enviar por correo si está habilitado, cancelar y generar otro enlace.
4. Reutilizar el canal actual de WhatsApp; el mensaje lleva nombre de clínica, monto, moneda, concepto administrativo y link. Nunca diagnóstico, procedimiento o información clínica.
5. Mostrar avisos accionables: conectar cuenta, completar verificación o reconectar cuenta; no errores crudos de API.

**Criterio de salida:** recepción genera y envía un enlace de una cita en menos de un minuto sin salir de CliniQ.

### Hito 6 — Reembolsos, soporte y trazabilidad

**Objetivo:** operar excepciones sin alterar contabilidad ni ocultar responsabilidades.

1. Definir por país quién pide/aprueba reembolsos y cómo se cubren si en el futuro hay comisión CliniQ.
2. Ejecutar reembolsos en backend, conservar referencia Mercado Pago y nunca borrar el pago original.
3. Registrar ajuste como movimiento reversado/reembolso según el modelo de cobros actual.
4. Crear vista de soporte: clínica, país, cuenta receptora, moneda, referencia, ID Mercado Pago, eventos y motivo de falla sin secretos.
5. Publicar guía por país: KYC, liquidación de dinero y reautorización OAuth.

**Criterio de salida:** un reembolso y una reconexión se resuelven con historial auditable.

### Hito 7 — Pruebas regionales y piloto

**Objetivo:** validar comportamiento real antes de escalar.

1. Pruebas automatizadas: tenant, moneda, `state` OAuth, expiración, montos, firma, duplicados y concurrencia.
2. Pruebas por país con cuentas de prueba: preferencia, pago, webhook y conciliación.
3. Pruebas reales de monto mínimo por país: medios y reglas de seguridad pueden diferir del entorno de prueba.
4. Casos obligatorios: aprobado con y sin prepago requerido; rechazo, pendiente, vencido, webhook duplicado/retrasado, token vencido, pago parcial, reembolso, cita ya cancelada/completada y error de red.
5. Pilotear con una clínica por país. No habilitar otro país hasta aprobar Hito 0 y pruebas locales.

**Criterio de salida:** conciliación correcta, sin duplicados y piloto estable durante el periodo acordado.

## Secuencia y estimación

| Tramo | Hitos | Duración orientativa |
| --- | --- | --- |
| Preparación | 0 | 2–5 días hábiles, más respuesta/habilitación de Mercado Pago |
| Fundaciones | 1–2 | 3–5 días hábiles |
| Cobro confirmado | 3–4 | 3–5 días hábiles |
| Operación | 5–6 | 2–4 días hábiles |
| Pruebas y piloto | 7 | 3–5 días hábiles por país piloto |

Estimación: **10–16 días hábiles** para plataforma regional y primer país operativo; sumar **2–4 días hábiles** de validación por país adicional, sin demoras externas de KYC, revisión comercial o activación.

## Posterior al piloto

- Activar comisión CliniQ (`marketplace_fee`) sólo tras revisión tributaria, contractual y de reembolsos por país.
- Evaluar Split 1:N para varios profesionales. Mercado Pago lo reserva para cartera asesorada; no forma parte del MVP.
- Añadir otros proveedores a la misma interfaz sólo cuando un país o cliente lo justifique.
- Incorporar links reutilizables, recurrencias y conciliación de liquidaciones con validación independiente.

## Referencias de validación

- [Disponibilidad de Split Payments 1:1](https://www.mercadopago.com.co/developers/es/docs/split-payments/split-1-1/overview): Argentina, Brasil, Chile, Colombia, México, Perú y Uruguay.
- [Configuración OAuth y vigencia de tokens](https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/integration-configuration/create-configuration).
- [Requisitos de Split Payments 1:1](https://www.mercadopago.com.mx/developers/es/docs/split-payments/split-1-1/prerequisites): vendedor con KYC 6 y OAuth.
- [Medios de pago disponibles por cuenta/país](https://www.mercadopago.cl/developers/es/reference/online-payments/checkout-pro-preferences/payment-methods/get): deben consultarse por API y no asumirse en código.

# Plan: prueba, suscripciones con Wompi y factura electrónica con Alegra

**Fecha:** 2026-10-21
**Estado:** propuesta, sin implementar
**Alcance:** onboarding de la prueba, ciclo de vida de la cuenta (prueba → pago → renovación → vencimiento), seguimiento de activación real, cobro recurrente con tarjeta por Wompi y factura electrónica DIAN por Alegra.

Relacionado: `docs/plan-activacion-y-puesta-en-marcha.md` (este plan absorbe la parte de **medición** del Hito 6 y le añade el ciclo comercial).

---

## 1. Diagnóstico

### Lo que existe

| Área | Estado actual | Dónde |
|---|---|---|
| Registro | Autoservicio con verificación por correo, 14 días de prueba sin tarjeta | `clinicas/services.py` (`TRIAL_DAYS`, `iniciar_registro_clinica`, `confirmar_registro_clinica`) |
| Prueba | Un único campo `Clinica.trial_expires_at` | `clinicas/models.py` |
| Bloqueo | Permiso DRF global `TrialNotExpired`: 403 en todo al vencer | `users/permissions.py:216` |
| Aviso | `TrialBanner` ("Te quedan N días… contacta a soporte") | `components/shared/TrialBanner.tsx` |
| Planes | `Plan` con límites (usuarios, sedes), add-ons, precio mensual, extras con precio | `clinicas/models.py:49` |
| Preparación | "Preparar mi clínica", avance calculado desde los datos | `clinicas/preparacion.py`, `/preparar-clinica` |
| Consola | `/console/clinicas` con plan, usuarios, WhatsApp, historial | `AdminTenantViewSet` |
| Correo | Resend por SMTP, helper `enviar_email` | `notificaciones/services.py:390` |
| Tareas periódicas | No hay Celery; el patrón es n8n programado → endpoint con `X-N8N-Secret` | `agenda/views.py:98` |

### Huecos

1. **"Tener plan" = pagado para siempre.** `TrialNotExpired` deja pasar a cualquier clínica con `plan_id`. No hay estado de suscripción, fecha de corte ni noción de pago fallido.
2. **Las clínicas creadas desde la consola nunca vencen** (no se les fija `trial_expires_at`).
3. **Al vencer no hay pantalla:** las llamadas fallan con 403 y la app queda rota. El banner remite a soporte; no hay forma de pagar.
4. **Nadie se entera de nada:** sin correos de bienvenida, de avance, de "tu prueba vence", ni tarea programada que los dispare.
5. **No se mide la activación.** La consola no muestra días restantes, avance de preparación ni última actividad. El Hito 6 del plan de activación nunca se construyó.
6. **El registro no crea la primera sede** (confirmado en el diagnóstico del plan de activación; verificar si el Hito 1 lo cubrió).
7. **No hay cobro ni facturación del SaaS:** ningún código ni variable de Wompi o Alegra. `Clinica.onboarding_completado` es un campo muerto.

---

## 2. Decisiones tomadas (2026-10-21)

| # | Decisión |
|---|---|
| D1 | **Al vencer la prueba o agotarse los reintentos de pago:** la cuenta pasa a **solo lectura** (ve y consulta sus datos, incluidas historias clínicas, pero no crea ni modifica). A los **30 días** en solo lectura queda **suspendida**. **Nunca se borran datos automáticamente.** Pagar en cualquier momento restaura todo. |
| D2 | **Medio de pago v1: solo tarjeta** (crédito o débito) tokenizada en Wompi, con cobro automático. Nequi y PSE quedan fuera de la v1. |
| D3 | **Ciclos: mensual y anual con descuento.** El descuento se define por plan. |
| D4 | **Clientes actuales con plan:** quedan **activos con cobro manual**, sin cambios. Se les invita (consola y app) a registrar tarjeta cuando quieran. |
| D5 | Se mantiene la prueba **sin tarjeta** de 14 días (lo que promete la landing). |
| D6 | **Fecha de cobro propia por clínica (aniversario)**, no mes calendario. El periodo empieza el día en que termina la prueba (o en que paga, si ya venció) y se guarda el **día ancla**: si el mes no tiene ese día, se cobra el último día del mes (ancla 31 → 28 feb → 31 mar). El anual se renueva en la misma fecha del año siguiente. El único prorrateo es al subir de plan a mitad de periodo. |
| D7 | **WhatsApp de seguimiento sí, desde un número propio de CliniQ** (comercial y soporte, bandeja propia en Lyvio), **nunca desde el número compartido** que usan las clínicas con sus pacientes: un bloqueo o reporte de administradores bajaría su calidad y afectaría recordatorios, firmas y OTP de todas las clínicas. El usuario consigue el número mientras se construye; hasta entonces F2 sale solo con correo + botón `wa.me` manual en la consola. |

---

## 3. Lo que imponen Wompi y Alegra

### Wompi

- **No tiene suscripciones nativas.** CliniQ programa los cobros, los reintentos y el manejo de fallos.
- **Cobro recurrente = fuente de pago.** El navegador tokeniza la tarjeta directo en Wompi (`POST /v1/tokens/cards`, llave pública). El backend crea la fuente de pago (`POST /v1/payment_sources`, llave privada) y luego cobra sin el cliente presente (`POST /v1/transactions` con `payment_source_id` y `recurrent: true`).
- **El widget no sirve para esto:** solo hace pagos únicos. El formulario de tarjeta es propio. La tarjeta **nunca pasa por nuestro servidor**, pero la página la captura, así que aplica PCI **SAQ A-EP**: HTTPS, CSP estricta y nunca registrar campos de tarjeta en logs.
- **Tokens de aceptación** (políticas y tratamiento de datos) se obtienen con `GET /merchants/info`. El endpoint viejo `GET /merchants/{public_key}` deja de funcionar el **2026-10-31**: usar solo el nuevo.
- **Webhook `transaction.updated`** firmado con SHA256 (propiedades + timestamp + secreto de eventos). Si no respondemos 200, Wompi reintenta a los 30 min, 3 h y 24 h. Como respaldo, consultar `GET /v1/transactions/{id}`.
- **Firma de integridad** `sha256(referencia + monto_en_centavos + moneda + secreto_integridad)` en cada transacción.
- **Sandbox:** `https://sandbox.wompi.co/v1`. Tarjeta `4242 4242 4242 4242` se aprueba y `4111 1111 1111 1111` se rechaza.
- **3DS** no es obligatorio para fuentes de pago normales. La variante con 3DS requiere que Wompi la active.

### Alegra

- API `https://api.alegra.com/api/v1` con autenticación Basic (correo + token).
- **Factura:** `POST /invoices` con `stamp.generateStamp: true` la emite a la DIAN. Se le pueden incluir los pagos en la misma llamada para que quede pagada.
- **Si la DIAN la rechaza**, la factura queda en borrador y la API responde 400 con la factura. Se reintenta con `POST /invoices/stamp`.
- **No hay sandbox.** Se prueba con una empresa de prueba de Alegra o sin emitir a la DIAN (`generateStamp: false`).
- **Los webhooks de Alegra no están firmados ni documentados.** El estado DIAN se consulta con `GET /invoices/{id}`.
- **El impuesto (IVA) tiene un id propio por empresa:** se consulta con `GET /taxes`, nunca se escribe fijo.
- **Límite:** 150 solicitudes por minuto.
- **Envío al cliente:** `POST /invoices/{id}/email`.
- **Devoluciones:** `POST /credit-notes`.

---

## 4. Modelo de datos

App nueva **`suscripciones`** (el SaaS cobrándole a la clínica). No mezclar con `cobros`/`cartera`, que son los cobros de la clínica a sus pacientes.

### `Suscripcion` (uno por clínica)

| Campo | Notas |
|---|---|
| `clinica` | OneToOne |
| `plan` | FK a `Plan` |
| `ciclo` | `mensual` / `anual` |
| `estado` | ver §5 |
| `modo_cobro` | `automatico` (Wompi) / `manual` (clientes actuales, convenios) |
| `prueba_termina_el` | fecha; reemplaza `Clinica.trial_expires_at` |
| `periodo_inicio`, `periodo_fin` | periodo pagado vigente |
| `proximo_cobro_el` | null en modo manual |
| `precio_periodo` | copia del precio al contratar (lo vendido no cambia si se edita el plan) |
| `fuente_pago` | FK a `FuentePago`, null |
| `intentos_fallidos` | contador del ciclo de reintentos actual |
| `estado_desde` | cuándo entró al estado actual (para contar los 30 días de solo lectura) |
| `cancelar_al_terminar_periodo` | bool |

### `FuentePago`

`clinica`, `wompi_payment_source_id`, `marca`, `ultimos4`, `expira_mes/anio`, `estado` (`disponible`/`anulada`), `creada_por` (usuario), `aceptacion` (JSON: tokens aceptados, permalinks, fecha, IP).

### `DatosFacturacion` (uno por clínica)

`tipo_persona`, `tipo_documento` (NIT/CC/CE…), `numero`, `dv`, `razon_social` o `nombres`/`apellidos`, `email_facturacion`, `telefono`, `direccion`, `departamento`, `ciudad`, `regimen`, `responsabilidades_fiscales`, `alegra_contact_id`.

### `CobroSuscripcion` (un intento de cobro)

`suscripcion`, `referencia` (única; idempotencia frente a Wompi), `concepto` (`primer_pago`/`renovacion`/`cambio_plan`/`manual`), `periodo_inicio/fin`, `monto_centavos`, `estado` (`pendiente`/`aprobado`/`rechazado`/`error`/`anulado`), `wompi_transaction_id`, `intento`, `respuesta` (JSON sin datos sensibles), `registrado_por` (para pagos manuales).

### `FacturaSaaS`

`cobro` (OneToOne), `alegra_invoice_id`, `numero`, `cufe`, `estado_dian`, `pdf_url`, `enviada_at`, `ultimo_error`, `intentos`.

### `EventoWompi`

Bitácora cruda de webhooks: `evento`, `referencia`, `checksum_valido`, `payload`, `procesado_at`. Sirve para idempotencia y auditoría.

### Cambios en modelos existentes

- `Plan.descuento_anual_pct` (o `precio_anual` explícito: decidir en F0). `Plan.precio` sigue siendo el mensual.
- `Clinica.trial_expires_at`: se conserva durante la transición y se elimina al final. `Clinica.onboarding_completado`: se elimina.
- `ConfiguracionGlobal.dias_prueba` (14 por defecto) para no tenerlo fijo en código.

---

## 5. Ciclo de vida

```
            pago aprobado
  prueba ─────────────────────────────► activa ◄────────────┐
    │                                    │  │               │
    │ vence sin pago                     │  │ cobro falla   │ pago aprobado
    ▼                                    │  ▼               │ (reintento o tarjeta nueva)
 solo_lectura ◄──── agota reintentos ──── en_gracia ────────┘
    │  ▲
    │  └── cancelada (al terminar el periodo pagado)
    │ 30 días
    ▼
 suspendida ── pago aprobado ──► activa
```

| Estado | Qué puede hacer la clínica |
|---|---|
| `prueba` | Todo |
| `activa` | Todo |
| `en_gracia` | Todo, con aviso fijo de "actualiza tu tarjeta" |
| `solo_lectura` | Consultar todo (GET). No crea, edita ni elimina. Puede pagar, cambiar tarjeta y ver ayuda. Se detienen los envíos automáticos (recordatorios y seguimiento por WhatsApp) |
| `suspendida` | Solo el administrador entra, y solo ve la pantalla de pago. Los demás usuarios no pueden iniciar sesión. Enlaces públicos de pacientes (registro, firma) inactivos |
| `cancelada` | Igual que `solo_lectura` (cuenta los mismos 30 días) |

**Reglas de tiempo**

- La prueba termina a las **23:59 hora de Bogotá** del día 14, no a la hora exacta del registro.
- **Pagar durante la prueba no hace perder días:** el cobro se hace de inmediato (confirma que la tarjeta sirve) y el periodo pagado empieza cuando termina la prueba. La factura indica ese periodo.
- **Reintentos de cobro:** día 0, día +3 y día +5. Al fallar el tercero → `solo_lectura`.
- **Cambiar la tarjeta en `en_gracia` reintenta el cobro en el acto.**
- **Cancelar** = no renovar; sigue activa hasta `periodo_fin`. Sin reembolsos parciales en la v1 (confirmar política, §11).
- **Modo manual:** el superadmin puede registrar "pagado hasta". Si queda vacío, la cuenta no vence (es el comportamiento actual de los clientes con plan). La consola lista estas cuentas para revisarlas.

**Permiso global**

`SuscripcionVigente` reemplaza a `TrialNotExpired`.

- Responde 403 con códigos `SUSCRIPCION_SOLO_LECTURA` y `SUSCRIPCION_SUSPENDIDA`.
- Siempre permitidos: `me`, autenticación, endpoints de suscripción, pago y facturas, y centro de ayuda.
- Hay `POST` que solo leen (búsquedas, generación de PDF). Se marcan con un atributo de vista `permitido_en_solo_lectura = True` tras auditar la lista.
- **En el frontend:** un manejador global del 403 muestra un modal "Tu cuenta está en solo lectura → Elegir plan", con un banner fijo según el estado. La suspensión ocupa la pantalla completa.

---

## 6. Seguimiento de activación

### Hitos

Cada hito se registra una vez en la tabla `HitoClinica(clinica, hito, alcanzado_el)`, la llena la tarea diaria y tiene un comando de relleno para el histórico:

1. Cuenta verificada / primer ingreso
2. Sede con horario
3. Primer profesional que atiende
4. Primer procedimiento o tratamiento
5. Primer paciente
6. Primera cita
7. Primera atención completada
8. Primer cobro registrado
9. Segundo usuario activo
10. Cinco atenciones completadas

### Actividad

- `ActividadDiaria(clinica, fecha, usuarios_activos, solicitudes)`: se actualiza con un middleware ligero que escribe como máximo una vez cada 15 minutos por usuario (marca en Redis).
- `Clinica.ultima_actividad_at` se actualiza con la misma marca.

### Definición de "activación real" (propuesta, confirmar)

> **Al menos 3 atenciones completadas y uso en al menos 3 días distintos dentro de la prueba.**

Señales de riesgo:
- 2 días sin actividad.
- Lleva 3 días sin pasar de "Datos básicos".
- Faltan 3 días o menos y no se ha activado.

### Consola: vista "Pruebas"

Nueva pestaña o filtro en `/console/clinicas`.

**Columnas:**
- clínica y contacto (con enlace `wa.me` al administrador);
- días restantes;
- estado;
- nivel de "Preparar mi clínica";
- hitos alcanzados, en chips;
- días activos;
- última actividad;
- semáforo: activada / en camino / en riesgo / dormida.

**Filtros:** por vencer, en riesgo, activadas, vencidas sin pago, manuales sin fecha.

**Acciones:**
- **Extender prueba**: N días + motivo, con registro en `LogAccion`.
- **Registrar pago manual.**
- **Cambiar plan.**
- **Notas de seguimiento comercial**: `NotaSeguimientoClinica(texto, canal, autor, próximo contacto)`.

**Embudo:** porcentaje de clínicas que llega a cada hito y mediana de días hasta cada uno, por cohorte semanal de registro. Esto es la "Medición" del Hito 6.

### Mensajes de ciclo de vida

Correo por Resend. Cada envío queda en `MensajeCicloVida(clinica, clave, enviado_at)` con la pareja (clínica, clave) única, así nada se repite.

| Clave | Cuándo | Contenido |
|---|---|---|
| `bienvenida` | al verificar | acceso + "empieza por Preparar mi clínica" |
| `sin_configurar_24h` | 24 h sin sede o procedimientos | guía de 10 minutos |
| `sin_primera_cita_72h` | preparada pero sin cita | guía "tu primera cita" |
| `prueba_vence_3d`, `prueba_vence_1d` | D-3, D-1 | resumen de lo que hizo (pacientes, citas, atenciones) + elegir plan |
| `prueba_vencida` | D0 | quedó en solo lectura, sus datos están a salvo |
| `solo_lectura_7d`, `suspension_en_5d` | D+7, D+25 | recordatorio antes de suspender |
| `pago_aprobado` | cada cobro | (la factura la envía Alegra) |
| `pago_fallido_N` | cada intento | actualizar tarjeta (enlace directo) |
| `tarjeta_por_vencer` | 15 días antes del mes de vencimiento | actualizar tarjeta |

**WhatsApp (D7):** solo en cinco momentos, el resto por correo:

1. `bienvenida`
2. `sin_primera_cita_72h`, como invitación a una llamada de 15 minutos
3. `prueba_vence_2d`
4. `prueba_vencida`
5. `pago_fallido_1`

Condiciones:
- Sale por el número propio de CliniQ, mediante una rama nueva (`ciclo_vida_cliniq`) del flujo n8n `envio-documentos` apuntando a la bandeja de CliniQ.
- Requiere una casilla de autorización en el registro y una forma de darse de baja.
- `MensajeCicloVida` guarda el `canal`.
- Las plantillas de vencimiento y pago fallido probablemente entran como "utilidad"; las de empuje, como "marketing". Por eso son pocas.

Mientras el número no exista, el seguimiento por WhatsApp lo hace una persona desde la consola con el enlace `wa.me`.

---

## 7. Onboarding de la prueba (pulido)

1. **El registro crea la primera sede** con el nombre de la clínica. Dirección y horario quedan como paso de "Preparar mi clínica". Verificar antes si el Hito 1 ya lo hizo.
2. **Primer ingreso → `/preparar-clinica`**, con una pantalla corta de bienvenida que hace dos preguntas opcionales: cuántos profesionales atienden y especialidad (estética, obesidad, otra). Sirven para segmentar y sugerir plan; no se piden en el formulario de registro para no añadir fricción.
3. **`TrialBanner` nuevo:** días restantes + nivel de preparación + botón **Elegir plan** (nada de "contacta a soporte").
4. **`/configuracion/plan` pasa a ser autoservicio:**
   - plan y estado;
   - próximo cobro;
   - tarjeta (cambiar o quitar);
   - datos de facturación;
   - historial de pagos y facturas (PDF);
   - cambiar de plan o de ciclo;
   - cancelar renovación.
5. **Landing de precios:** selector mensual/anual que muestra el ahorro.
6. **Cerrar del plan de activación:** el Hito 5 (recepción con interruptores) y la parte de primera cita guiada del Hito 6.

---

## 8. Flujo de pago con Wompi

### Contratar (desde la prueba, solo lectura o suspendida)

1. **Elegir plan y ciclo** → total del periodo.
2. **Datos de facturación** → precargados con el NIT y el nombre del registro.
3. **Tarjeta**
   - Formulario propio + casillas de aceptación de Wompi (políticas y datos personales, con sus enlaces).
   - Casilla de **renovación automática** con los términos de suscripción de CliniQ.
   - El navegador tokeniza la tarjeta en Wompi, con JWE si la complejidad lo permite.
4. **`POST /api/v1/suscripcion/activar`**
   - Recibe `{plan, ciclo, token, acceptance_token, accept_personal_auth}`.
   - El backend crea la fuente de pago, el `CobroSuscripcion` y la transacción.
5. **Pantalla "Procesando pago"**
   - Consulta el estado del cobro.
   - Lo confirma el webhook, con consulta a Wompi como respaldo.
   - Al aprobarse: `activa`, factura y correo.

### Renovación (tarea diaria, 08:00 Bogotá)

1. Toma las suscripciones automáticas con `proximo_cobro_el <= hoy` y sin cobro pendiente.
2. Crea la referencia `SUB-<clinica>-<AAAAMMDD>-<intento>` y la transacción.
3. **Aprobado:** avanza el periodo, emite la factura y pone `intentos_fallidos = 0`.
4. **Rechazado:** pasa a `en_gracia`, programa el siguiente intento y envía el correo.

### Cambios de plan

- **Subir de plan:** inmediato, con cobro prorrateado por los días que quedan (su propio cobro y su propia factura).
- **Bajar de plan o cambiar de ciclo:** al terminar el periodo. Se bloquea si el uso actual supera los límites del plan nuevo (usuarios, sedes), indicando qué sobra.
- **Usuarios o sedes adicionales** (`precio_usuario_adicional`, `precio_sede_adicional` ya existen en `Plan`): fuera de la v1. Llegar al límite lleva a subir de plan.

### Webhook

`POST /api/v1/webhooks/wompi/`:
- **Sin autenticación de tenant**; valida el checksum con el secreto de eventos.
- **Idempotente:** el mismo evento procesado dos veces no cambia nada.
- **Responde 200 siempre que la firma sea válida**, y procesa en la misma petición, que es corta.
- **URLs distintas en sandbox y producción.**

### Variables de entorno

```
WOMPI_ENV=sandbox|production
WOMPI_PUBLIC_KEY, WOMPI_PRIVATE_KEY, WOMPI_EVENTS_SECRET, WOMPI_INTEGRITY_SECRET
```

---

## 9. Facturación con Alegra

**Al aprobarse un cobro:**

1. **Asegurar el contacto.** Crear o actualizar el contacto en Alegra con `DatosFacturacion` y guardar `alegra_contact_id`.
2. **Emitir la factura.** `POST /invoices` con:
   - un ítem genérico "Suscripción CliniQ";
   - descripción "Plan Pro – mensual – 21 oct a 20 nov 2026";
   - el impuesto que corresponda (§11.3);
   - forma de pago `CASH`, medio tarjeta crédito o débito según la tarjeta;
   - el pago incluido (cuenta bancaria de Wompi en Alegra);
   - `generateStamp: true`.
3. **Guardar** id, número, CUFE, estado DIAN y URL del PDF en `FacturaSaaS`.
4. **Enviar** con `POST /invoices/{id}/email` al correo de facturación.
5. **Si falla** (borrador o error de red): la tarea diaria, y también la horaria si se programa, reintenta la emisión con `POST /invoices/stamp`. Tras 3 fallos avisa al superadmin.

**Reglas:**
- El total facturado debe ser **exactamente** el monto cobrado en Wompi. Revisar el redondeo de centavos con IVA incluido.
- **Pagos manuales** registrados en la consola: el superadmin elige si generar factura.
- **Devoluciones:** manuales en la v1. Se reembolsa desde el panel de Wompi y se hace la nota crédito desde la consola (`POST /credit-notes`).
- **Desarrollo y pruebas:** `ALEGRA_EMITIR_DIAN=false` crea facturas sin emitirlas, o se usa una empresa de prueba.

**Variables de entorno:**

```
ALEGRA_EMAIL, ALEGRA_TOKEN, ALEGRA_NUMBER_TEMPLATE_ID, ALEGRA_ITEM_ID,
ALEGRA_TAX_ID (vacío si no lleva IVA), ALEGRA_BANK_ACCOUNT_ID, ALEGRA_EMITIR_DIAN
```

---

## 10. Migración de clínicas existentes

Antes de migrar, contar en producción cuántas clínicas caen en cada grupo.

| Situación hoy | Queda como |
|---|---|
| Con `plan` asignado | `activa`, `modo_cobro=manual`, sin fecha de vencimiento (D4) |
| Sin plan, con `trial_expires_at` futuro | `prueba` hasta esa fecha |
| Sin plan, con `trial_expires_at` vencido | `solo_lectura` (hoy están bloqueadas del todo; esto es más permisivo) |
| Sin plan y sin `trial_expires_at` (creadas desde la consola) | `activa` manual sin fecha, marcadas "revisar" en la consola |

**Desde la consola**, al crear una clínica se elige entre "prueba de N días" y "activa con cobro manual".

---

## 11. Pendientes antes de construir (F0)

1. **Wompi**
   - Confirmar que las fuentes de pago con tarjeta y el cobro recurrente (COF) están habilitados en la cuenta, o pedirlo al equipo comercial.
   - Tarifa para cobros recurrentes.
   - Si la cuenta es modelo pasarela o agregador.
   - Registrar las URLs de eventos de sandbox y producción.
2. **Alegra**
   - Resolución de facturación electrónica vigente y su numeración (`numberTemplate`).
   - Crear la cuenta bancaria "Wompi" en Alegra.
   - Empresa o cuenta de prueba.
3. **Contador: IVA.** La Ley 1819 de 2016 (art. 476 num. 24 ET) excluye de IVA la computación en la nube, y el Decreto 1412 de 2017 incluye el software como servicio en esa definición. Hay que confirmar si la suscripción de CliniQ va **sin IVA** o con IVA del 19 %. Esto define si `Plan.precio` es final y cómo se arma la factura.
4. **Contador: retenciones.** Las clínicas que son agentes de retención pagarán el 100 % con tarjeta. Definir cómo se atiende un reclamo de retención (nota crédito, certificado).
5. **Precios:** descuento anual por plan (sugerencia: 2 meses gratis ≈ 16,7 %) y si los precios publicados incluyen impuestos.
6. **Términos de suscripción de CliniQ** (renovación automática, cancelación, reembolsos). El texto legal es tuyo; la app solo lo enlaza y guarda la aceptación.
7. **Política de reembolsos** (propuesta v1: sin reembolsos parciales; la cancelación aplica al final del periodo).
8. **Confirmar la definición de "activación real"** (§6).

---

## 12. Fases

Todo en una rama local por fase, probado en local; nada de push ni merge hasta que se pida.

| Fase | Contenido | Depende de | Estimado |
|---|---|---|---|
| **F0** | Pendientes del §11 con proveedores y contador | — | en paralelo |
| **F1** | App `suscripciones`: `Suscripcion`, estados, permiso `SuscripcionVigente`, manejador 403 + pantallas de solo lectura y suspensión, extender prueba y pago manual desde la consola, migración de clínicas, `dias_prueba` configurable | — | 1 semana |
| **F2** | Seguimiento: `HitoClinica`, `ActividadDiaria`, vista "Pruebas" y embudo en la consola, notas comerciales, `MensajeCicloVida` + correos, tarea diaria | F1 | 1 semana |
| **F3** | Onboarding: sede automática, bienvenida, banner nuevo, Hito 5 pendiente | F1 (banner) | 3–5 días |
| **F4** | Wompi: `FuentePago`, `CobroSuscripcion`, pantalla de pago, webhook, renovaciones, reintentos, cambio de tarjeta, cancelar, subir o bajar de plan, `/configuracion/plan` autoservicio | F1, F0 (Wompi) | 1,5–2 semanas |
| **F5** | Alegra: `DatosFacturacion`, `FacturaSaaS`, emisión, reintentos, envío, listado de facturas, nota crédito manual | F4, F0 (Alegra y contador) | 1 semana |
| **F6** (después) | Nequi recurrente, usuarios y sedes adicionales, WhatsApp al administrador desde número propio de CliniQ | F4 | — |

**Orden sugerido:** F1 → F2 y F3 en paralelo → F4 → F5. F1 y F2 ya aportan valor sin pasarela: hoy la prueba vence en silencio y nadie hace seguimiento.

### Avance

**F1 hecha en la rama local `feature/suscripciones` (2026-10-21), sin commit:**

- **App `suscripciones`**
  - Estados por tiempo calculados al consultar, así que no dependen de la tarea programada.
  - Migración que crea la suscripción de las clínicas existentes.
  - `ConfiguracionGlobal.dias_prueba`.
- **Bloqueo en la autenticación**, no como permiso por defecto. Más de 120 vistas declaran sus propios permisos y con eso esquivaban `TrialNotExpired`, que se eliminó.
  - Lo que pasa siempre: perfil, sesión, ayuda y la propia suscripción (`suscripcion_libre`).
  - En solo lectura pasan los GET y lo marcado con `permitido_en_solo_lectura`.
  - La suplantación del superadmin no se bloquea.
- **Login con la cuenta suspendida:** solo entra quien la administra.
- **Envíos automáticos:** los recordatorios de cita se detienen en solo lectura y suspendida.
- **Endpoints:**
  - `GET /suscripcion/`;
  - en la consola, `GET /suscripcion/admin/<clinica>/`, `POST …/extender-prueba/` y `POST …/pago-manual/`;
  - al crear una clínica desde la consola se elige "prueba" o "cobro manual".
- **Frontend**
  - Aviso fijo según el estado, que reemplaza a `TrialBanner`.
  - Diálogo cuando una acción se rechaza por solo lectura.
  - Pantalla completa de cuenta suspendida.
  - Sección "Tu cuenta" en Configuración → Plan.
  - Pestaña "Suscripción" en la consola.
- **Días de prueba:** se cuentan por calendario (14 el día del registro, "termina hoy" el último). Los campos viejos `trial_days_remaining` y `trial_expires_at` salieron de las respuestas. La columna `trial_expires_at` sigue en la base y se borrará después.
- **"Elegir plan"** abre un WhatsApp con ventas (`CLINIQ_VENTAS_WHATSAPP`) hasta que exista el pago en línea.

**Cambio de comportamiento:** asignar un plan desde la consola **ya no activa la cuenta**. Una clínica en prueba sigue venciendo hasta que se registre un pago, manual (F1) o con tarjeta (F4).

**Falta en F1:** programar `procesar_suscripciones` en Dokploy. Es opcional, porque los estados se calculan solos.

**F2 hecha en la misma rama (2026-10-21), sin commit:**

- **Hitos** (`activacion.py`, tabla `HitoClinica`)
  - Diez hitos: entró a la app, sede con horario, profesional que atiende, primer procedimiento, primer paciente, primera cita, primera atención, primer pago, segundo usuario y 5 atenciones.
  - Se calculan desde los datos y, una vez guardados, no se recalculan.
  - Dos fechas son aproximadas, porque el momento exacto no queda guardado:
    - **Sede con horario:** se toma la última edición de la sede.
    - **Profesional que atiende:** se toma la creación del colaborador.
- **Actividad diaria** (`ActividadDiaria`)
  - Se registra en la autenticación, una vez cada 15 minutos por usuario, sin contar la suplantación del superadmin.
  - Se rellenó desde `LogAccion` al migrar, para no empezar en cero.
- **Semáforo:** activada, en camino, en riesgo o dormida, con el motivo en palabras.
  - **Activada:** al menos 3 atenciones completadas y uso en 3 días distintos.
  - **Dormida:** 7 días sin uso.
  - **En riesgo:** 2 días sin uso, preparación incompleta al tercer día, 3 días o menos de prueba sin haberse activado, o prueba terminada sin activarse.
- **Consola → Pruebas** (`/console/pruebas`)
  - Filtros: pruebas, por vencer, en riesgo, activadas, vencidas sin pago y manuales sin fecha.
  - En cada fila: los hitos como puntos, el uso, la última nota y la fecha de próximo contacto.
  - Acciones: WhatsApp (`wa.me`), correo, notas de seguimiento (`NotaSeguimientoClinica`) y extender la prueba.
  - Abajo, el embudo de activación por semana de registro (las últimas 12): porcentaje que llega a cada hito, mediana de días, activadas y pagaron.
- **Correos del ciclo de vida** (`ciclo_vida.py`, tabla `MensajeCicloVida`)
  - Avisos: bienvenida, sin configurar, sin primera cita, la prueba vence en 3 días, la prueba vence mañana u hoy, prueba vencida, 7 días en solo lectura, y suspensión en 5 días.
  - Van a los administradores activos de la clínica.
  - Como mucho un correo por corrida y ninguno si ya salió otro en las últimas 20 horas.
  - La `referencia` permite repetir el aviso de vencimiento si se extiende la prueba.
  - **Nacen apagados:** se encienden con el interruptor de la consola, en Pruebas (`ConfiguracionGlobal.correos_ciclo_vida_habilitados`).
- **Comando `procesar_suscripciones`:** estados, hitos y correos. Con `--simular` muestra qué correos saldrían sin enviarlos. Hay que programarlo **cada hora en Dokploy**.

**F3 hecha en la misma rama (2026-10-21), sin commit:**

- **Registro**
  - Crea la primera sede con el nombre de la clínica, sin dirección ni horario: completarla es el paso "Sede" de Preparar mi clínica.
  - Guarda el teléfono en el usuario administrador.
  - Agrega una casilla opcional para autorizar WhatsApp de CliniQ, desmarcada por defecto. Queda en `RegistroPendiente.acepta_whatsapp` y `Suscripcion.whatsapp_autorizado_at`.
- **Bienvenida en el primer ingreso**
  - Solo la ve quien administra la clínica, y solo en prueba.
  - Hace dos preguntas opcionales: cuántas personas atienden y especialidad. Las respuestas quedan en `Suscripcion.perfil` y se ven en la consola → Pruebas.
  - "Preparar mi clínica" lleva a `/preparar-clinica`; "Ahora no" la cierra. Sale una sola vez.
- **Aviso de prueba:** días restantes más el enlace "Preparar mi clínica: N de M" mientras falte algo. `/suscripcion/` trae un resumen de la preparación.
- **Precios:** `Plan.descuento_anual_pct` se edita en la consola → Planes. La landing muestra el selector mensual/anual cuando algún plan tiene descuento: precio por mes con descuento, total del año y el ahorro.
- **Correos:** el interruptor de los correos de la prueba está en la consola → Pruebas.

**F4 hecha en la misma rama (2026-10-21), sin commit. Probada con Wompi simulado; falta la prueba con el sandbox real:**

- **Modelos:** `FuentePago` (la tarjeta en Wompi; solo marca, últimos 4 y vencimiento), `CobroSuscripcion` (referencia única), `EventoWompi` (bitácora de webhooks) y `DatosFacturacion` (los usa F5).
- **Campos nuevos en `Suscripcion`:** `fuente_pago`, `precio_periodo` (lo vendido no cambia si se edita el plan), `proximo_cobro_el`, `plan_pendiente` y `ciclo_pendiente`.
- **`wompi.py`:** tokens de aceptación (`GET /merchants/info`, el endpoint nuevo), fuente de pago, cobro con `recurrent: true` y firma de integridad, consulta de la transacción, anular la tarjeta y verificar la firma de los eventos.
- **`cobros.py`**
  - **Contratar:** cobra el primer periodo de inmediato.
    - Pagando en la prueba, el periodo empieza al terminarla.
    - Un cliente con pago manual que pasa a tarjeta empieza cuando se acabe lo pagado.
    - Si el pago se rechaza, la tarjeta se anula y la cuenta no cambia.
  - **Fecha ancla:** el periodo que empieza el 31 de enero termina el 27 de febrero, y el siguiente empieza el 28.
  - **Renovación:** se cobra el último día del periodo, sin parpadeo de "pago pendiente". Si se rechaza: en gracia y reintentos a los +3 y +2 días; al tercer fallo, solo lectura.
  - **Cambiar tarjeta:** en mora, reintenta el cobro en el acto.
  - **Subir de plan:** se cobra la diferencia prorrateada por días.
  - **Bajar de plan o cambiar de ciclo:** se aplica al renovar. Se bloquea si la clínica usa más usuarios o sedes de los que permite el plan nuevo.
  - **Cancelar:** la renovación no se cobra y, al terminar el periodo, la cuenta queda cancelada (luego solo lectura y suspensión).
- **Endpoints** (`/suscripcion/pago/...`, solo para quien administra, también con la cuenta suspendida): `config`, `contratar`, `cobros`, `cobros/<ref>` (consulta Wompi si sigue pendiente), `tarjeta`, `cambiar-plan` y `cancelar`. Más `POST /suscripcion/webhooks/wompi/` y `GET /suscripcion/admin/<clinica>/cobros/` para la consola.
- **`procesar_suscripciones`** cobra las renovaciones y reintentos y consulta los cobros pendientes de más de 10 minutos.
- **Frontend**
  - `/configuracion/plan/pagar`, con tres modos:
    - **contratar:** plan y ciclo, facturación y tarjeta, con las dos políticas de Wompi y la casilla de renovación automática;
    - **tarjeta:** cambiar la tarjeta guardada;
    - **plan:** subir o bajar de plan.
  - La tarjeta se tokeniza directo con Wompi desde el navegador.
  - "Elegir plan" (aviso, diálogo y pantalla de suspensión) lleva ahí cuando hay llaves; si no, sigue yendo a WhatsApp. Con la cuenta suspendida, esa ruta es la única que se abre.
  - Configuración → Plan muestra el próximo cobro, la tarjeta, los botones para cambiar de plan o de tarjeta y para cancelar o reanudar la renovación, y el historial de pagos.
  - La consola muestra la tarjeta, el próximo cobro y los cobros de cada clínica.
- **Variables de entorno:** `WOMPI_ENV`, `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_SECRET` y `WOMPI_INTEGRITY_SECRET`. Sin llave privada no hay pago en línea.
- **Pendiente del lado del usuario:**
  - Los términos de servicio de CliniQ: la casilla los menciona, pero no hay una página que enlazar.
  - Registrar en Wompi la URL del webhook, `https://<api>/api/v1/suscripcion/webhooks/wompi/`. En local no llega, así que el estado se consulta a Wompi.

**F4 probada contra el sandbox real de Wompi (2026-10-22).** Funcionó todo el flujo:

1. Tarjeta rechazada.
2. Tarjeta aprobada; el periodo empieza al terminar la prueba.
3. Renovación.
4. Mora con reintento programado.
5. Recuperación al cambiar de tarjeta.

Lo que salió de esa prueba:
- Los tokens de aceptación de Wompi se usan una sola vez. El frontend los pide de nuevo en cada intento.
- En el sandbox el primer cobro llega "pendiente" y se rechaza después. La tarjeta rechazada se anula en `rechazar()`, no solo cuando el rechazo es inmediato.
- Wompi solo anula por API las fuentes de pago de preautorización. Las demás quedan anuladas solo en CliniQ, que no vuelve a cobrarlas.

Sigue pendiente ver la pantalla de pago en el navegador: el servidor de desarrollo del frontend estaba saturado y no la sirvió.

**F5 hecha en la misma rama (2026-10-22), sin commit. Probada con Alegra simulado; falta probarla contra la cuenta real:**

- **Modelo:** `FacturaSaaS` (uno por cobro aprobado), con el id de Alegra, número, CUFE, estado DIAN, intentos y último error.
- **`alegra.py`:** contactos (buscar, crear, actualizar), crear factura, reenviar a la DIAN (`/invoices/stamp`), consultar y enviar por correo.
- **`facturacion.py`**
  - Al aprobarse un cobro (`on_commit`) se emite la factura, ya pagada (el pago va en la misma factura), con la descripción del plan y del periodo.
  - El cliente en Alegra se crea o reutiliza con los `DatosFacturacion`.
  - **Con IVA**, el precio del ítem es el cobro sin IVA y el pago es el total cobrado.
  - **Si la DIAN la rechaza**, se guarda el borrador y el reintento solo lo reenvía (sin duplicar).
  - Hasta 5 intentos (la tarea periódica reintenta); después queda en error para la consola.
- **El PDF se pide a Alegra en el momento**, desde el historial de pagos y desde la consola, porque el enlace puede vencer. La consola tiene "reintentar factura".
- **`python manage.py alegra_configuracion`** lista de la cuenta de Alegra las numeraciones, impuestos, cuentas bancarias e ítems, para llenar el `.env`.
- **Variables de entorno:** `ALEGRA_EMAIL`, `ALEGRA_TOKEN`, `ALEGRA_NUMBER_TEMPLATE_ID`, `ALEGRA_ITEM_ID`, `ALEGRA_TAX_ID` (vacío = sin IVA), `ALEGRA_IVA_PCT`, `ALEGRA_BANK_ACCOUNT_ID`, `ALEGRA_MEDIO_PAGO` (por defecto `CREDIT_CARD`) y `ALEGRA_EMITIR_DIAN` (por defecto apagado: crea la factura sin enviarla a la DIAN).
- **Por confirmar con la cuenta real y el contador:**
  - el medio de pago DIAN para tarjeta;
  - el régimen del cliente (hoy: persona jurídica `COMMON_REGIME`, persona natural `SIMPLIFIED_REGIME`);
  - si va con IVA;
  - cómo responde Alegra el número y el CUFE.
- **Fuera de alcance por ahora:** factura de los pagos manuales y notas crédito (se harían a mano en Alegra).

**F5 probada contra la cuenta real de Alegra (2026-10-22), sin enviar a la DIAN:**
- Se creó el contacto de prueba id 18 (persona natural, CC 1000000001).
- Se creó la factura id 11 en borrador: total $120.000, ítem 1 "Alojamiento de aplicaciones Web on Cloud" con impuesto 2 "IVA Excluido", y `paymentMethod: CREDIT_CARD` aceptado.
- El número sale en `numberTemplate.fullNumber` (el borrador mostraba 2A76).
- **En modo de pruebas** (`ALEGRA_EMITIR_DIAN=False`) la factura va como borrador (`status: draft`), sin pago y sin envío a la DIAN, y se guarda como "Borrador N".
- **Falta comprobar con una emisión real:** el pago incluido en la factura y dónde vienen el CUFE y el estado DIAN.
- **Datos de facturación completos y válidos (2026-10-22).** Alegra **no valida** la ciudad ni el departamento: aceptó un contacto con "Ciudad Inventada" y "Departamento Falso", y eso haría fallar la factura al emitirse. Por eso CliniQ valida todo antes de guardar, de cobrar y de emitir (`validacion_facturacion.py`):
  - **Documento:**
    - una empresa factura con NIT;
    - NIT y cédula solo con números (se limpian puntos y guiones);
    - el DV del NIT se calcula con el algoritmo de la DIAN, que da el resultado correcto con NIT reales conocidos.
  - **Nombre:** razón social, o nombres y apellidos.
  - **Contacto:** correo válido, teléfono y dirección.
  - **Ubicación:** departamento y municipio del **catálogo de Alegra** (`datos/municipios_alegra.json`, 33 departamentos y 1.123 municipios). Los nombres difieren del DANE: "Abrego", "Barranco Minas", "Bogotá, D.C.".
  - **Régimen y responsabilidades:** responsable de IVA o no (`COMMON_REGIME` o `SIMPLIFIED_REGIME`) y las responsabilidades fiscales opcionales por id de Alegra (`fiscalResponsabilities`): 5 O-13, 7 O-15, 12 O-23 y 114 régimen simple. Probado contra Alegra real.
  - **Consecuencias:**
    - no se puede pagar con datos incompletos (ni se llega a guardar la tarjeta);
    - si los datos guardados quedaron incompletos, la factura no se manda a Alegra;
    - Configuración → Plan avisa "Datos de facturación incompletos" y lleva a `/configuracion/plan/pagar?modo=facturacion` (`GET`/`PUT /suscripcion/pago/facturacion/`). Al corregirlos se reintentan las facturas detenidas.
  - **Formulario:** departamento y municipio en listas, el DV calculado con botón "Usarlo", y cada error junto a su campo.
- **Consola → Pagos (`/console/pagos`, 2026-10-22):** los cobros con tarjeta de todas las clínicas (`GET /suscripcion/admin/pagos/`).
  - **Filtros:** fechas (por defecto, desde el día 1 del mes), estado (aprobados, rechazados o con error, pendientes), factura (emitida, pendiente, en error, aprobado sin factura), concepto y búsqueda por clínica, referencia o número de factura.
  - **Totales:** total aprobado, aprobados, rechazados, pendientes y facturas por resolver.
  - **En cada fila:** el PDF de la factura, o "reintentar" / "emitir" si no salió.
  - Los pagos manuales no aparecen porque no son cobros de Wompi.
- **Prueba con todo activo (2026-10-22):** la prueba muestra todo para que la clínica pruebe lo que después paga, sobre todo el WhatsApp con su número.
  - **Plan de prueba:** `ConfiguracionGlobal.plan_prueba`, elegido en Consola → Pruebas → "Así empieza una prueba", junto con los días de prueba y el cupo de WhatsApp.
  - **Un solo lugar decide el plan:** `Clinica.plan_vigente` devuelve el plan de prueba mientras la clínica está en prueba y, si no, el contratado. Los add-ons, el límite de usuarios y el de sedes lo usan; los overrides por clínica siguen mandando. Sin plan de prueba configurado, la prueba usa el plan de la clínica.
  - **Cupo de WhatsApp:** `whatsapp_envios_prueba` (100 por defecto, 0 = sin límite) por el número compartido, contado desde que empezó la prueba (no se renueva al cambiar de mes). Al agotarse, el mensaje dice "de tu prueba".
  - **Número propio en la prueba:** se puede conectar si el plan de prueba lo incluye. La pantalla ofrece "Que me ayuden" (WhatsApp de ventas con un texto de prueba) y avisa que, si el plan que elija no lo incluye, los mensajes vuelven a salir por el número de CliniQ y su número queda guardado.
  - **Al elegir plan:** cada plan dice "Dejas de tener: …" con las funciones que la clínica tiene hoy y ese plan no incluye. Si el uso actual (usuarios o sedes) supera el plan, el plan aparece deshabilitado con el motivo.
  - **Consola → Pruebas:** marca "Conectó su WhatsApp" en las clínicas que conectaron su número.
  - **Pendiente:** al darse de baja una prueba que conectó su número, limpiar el inbox de Lyvio (hoy queda hasta que alguien lo dé de baja).
- **Invitación a poner tarjeta (D4, 2026-10-24):** para clínicas activas con cobro manual.
  - **En la app**, solo quien administra: aviso arriba ("Ya puedes pagar CliniQ con tarjeta…") que se puede cerrar y vuelve a los 30 días, y en Configuración → Plan la fila "Paga con tarjeta" con "Registrar tarjeta".
  - **Cuándo empieza el cobro:** con "pagado hasta", el periodo con tarjeta empieza al día siguiente (se cobra al registrarla). Sin fecha, empieza ese día. La pantalla de pago lo dice.
  - **En la consola**, pestaña Suscripción de la clínica: "Cobro manual, sin tarjeta" con "Copiar enlace" a `/configuracion/plan/pagar`. Si no tiene fecha de pagado hasta, avisa que se le cobraría ese día y que, si ya pagó, conviene registrar antes el pago manual con su fecha.
  - El superadmin que entra como una clínica ahora ve su estado de cuenta, avisos incluidos, pero nunca la pantalla de suspendida.
- **Reintentar el pago con la tarjeta guardada (2026-10-24):** `POST /suscripcion/pago/reintentar/`, botón "Reintentar pago" en el aviso de arriba, en Configuración → Plan ("Pago pendiente"), en el diálogo de solo lectura y en la pantalla de suspendida.
  - **Cuándo se puede:** en mora, o en solo lectura / suspendida por 3 renovaciones rechazadas, con la tarjeta guardada disponible (`cobros.puede_reintentar`). Una prueba vencida no tiene tarjeta: ahí sigue "Elegir plan".
  - **Qué periodo cobra:** en mora, el que sigue al último (lo estaba usando). Desde solo lectura o suspendida, uno que empieza hoy, y el día de cobro se reinicia.
  - **Si se rechaza:** el cobro queda con concepto `reintento` y no suma intentos ni cambia la cuenta; los reintentos automáticos siguen igual. Entre un reintento de la clínica y el siguiente hay que esperar 5 minutos.
  - **"Cambiar tarjeta"** en mora ahora lleva a cambiar la tarjeta (antes llevaba a contratar, que el backend rechazaba). Cambiarla en solo lectura por rechazos también cobra de inmediato.
- **Ids que se proponen para el `.env`:** `ALEGRA_NUMBER_TEMPLATE_ID=15`, `ALEGRA_ITEM_ID=1`, `ALEGRA_TAX_ID=2` con `ALEGRA_IVA_PCT=0` (si el contador confirma la exclusión) y `ALEGRA_BANK_ACCOUNT_ID=3`.

**Queda fuera de F3:** el Hito 5 del plan de activación (recepción con interruptores por paso). Es un trabajo propio, de una semana o más, con decisiones abiertas (ver `docs/plan-activacion-y-puesta-en-marcha.md`).

**Antes de encender los correos en producción:**
- Revisar los textos.
- Saber que las pruebas vencidas que la migración pasa a solo lectura recibirán "prueba vencida" en la primera corrida, aunque hayan vencido hace meses. Correr antes `--simular` para ver la lista.

**Pendiente para después:** auditar los `POST` que solo leen, para marcarlos con `permitido_en_solo_lectura`. Por ahora solo están marcados cambiar la contraseña propia y la ayuda.

### Tarea periódica

Comando `procesar_suscripciones`, idempotente. Hace:
- transiciones de estado;
- cobros y reintentos;
- facturas pendientes;
- hitos;
- mensajes.

Al terminar guarda la hora en `ConfiguracionGlobal.suscripciones_procesadas_el`. Consola → Pruebas, en la tarjeta de correos, muestra si corrió en las últimas 2 horas; si no, avisa con el comando y el horario (`0 * * * *`) para crearla. Con `--simular` no se guarda la hora.

Se programa en **Dokploy** (tarea programada sobre el contenedor del backend) en lugar de n8n → endpoint, porque mueve dinero y así no queda expuesto por HTTP. Si se prefiere uniformidad con lo actual, la alternativa es un endpoint protegido con `X-N8N-Secret` llamado por n8n.

### Pruebas

- **Unitarias:**
  - máquina de estados;
  - permiso en cada estado;
  - firma del webhook (válida e inválida);
  - idempotencia de referencias y eventos;
  - prorrateo;
  - armado de la factura (total = cobro).
- **Integración con sandbox de Wompi:**
  - tarjeta aprobada y rechazada;
  - reintentos;
  - cambio de tarjeta en gracia.
- **Alegra** con `ALEGRA_EMITIR_DIAN=false` o empresa de prueba.
- **De punta a punta en local:**
  - registro → prueba → vencimiento → solo lectura → pago → activa → renovación → fallo → gracia → recuperación.

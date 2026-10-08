# Plan: seguimiento de pacientes y modo de trabajo

Fecha: 2026-09-25, reescrito el 2026-10-06 con el enfoque de láser y
aparatología, y ajustado el 2026-10-07 para compartir el modelo `Oportunidad`
con [plan-funnel-comercial.md](plan-funnel-comercial.md). Escrito contra
`main`.

Estado: **propuesta, no implementado**. Las decisiones confirmadas están
marcadas como tales; las demás siguen abiertas (ver
[Decisiones](#decisiones)).

## El problema

La clínica no sabe a quién llamar hoy para que vuelva. Los datos existen
(paquetes con sesiones sin usar, cotizaciones que no se cerraron, pacientes
que no asistieron), pero nadie los mira porque están repartidos en la agenda,
las cotizaciones y la ficha del paciente.

No se busca un CRM genérico con embudos y etapas configurables. Se busca que
la app **acompañe al paciente durante todo su paquete por WhatsApp** y que lo
que no se resuelva solo llegue a una **bandeja de trabajo diaria** para la
recepción.

Este plan cubre la **retención** (de la venta al mantenimiento). La
**adquisición** (de interesado a venta) está en
[plan-funnel-comercial.md](plan-funnel-comercial.md). Los dos usan **un solo
modelo `Oportunidad`** con un `tipo` y **una sola bandeja** (decisión D-F2 de
ese plan): las oportunidades de este plan son de tipo `paquete` (M1, M3) o
`recompra`/`reactivacion` (M2, M4–M6); las del embudo son de tipo `nueva`.

Sirve para la clínica de estética médica y, sobre todo, para centros de
depilación láser y aparatología. En esos centros el ingreso depende de que la
clienta complete el paquete (6 a 10 sesiones con un intervalo fijo) y vuelva
al mantenimiento. La app ya tiene lo que la competencia no tiene bien
estructurado: sesiones vendidas por paquete, sesiones usadas y cartera.

Este plan tiene dos partes:

1. **Seguimiento**: parte del core, incluido en todos los planes, igual que
   cobros (D1, confirmada). La bandeja, el link de agendamiento y el WhatsApp
   manual (`wa.me`) son para todos. **Los envíos por plantilla (automáticos o
   desde la bandeja) siguen siendo del addon de WhatsApp tal como está hoy**,
   con su cupo y el addon de número propio.
2. **Modo de trabajo**: una opción en la configuración de la clínica para
   trabajar en modo **completo** (como hoy) o **simple** (láser y
   aparatología). Se puede cambiar de uno a otro en cualquier momento sin
   perder nada. No es un módulo ni un producto aparte.

## Principio: no romper lo que hay

Hay clínicas usando CliniQ en producción tal como está. Reglas para todo el
plan (detalle en [Compatibilidad](#compatibilidad-con-las-clínicas-actuales)):

- **Todas las clínicas existentes quedan en modo completo**, que es
  exactamente la app de hoy.
- **Ningún mensaje nuevo sale a los pacientes sin que la clínica lo active.**
  El envío automático arranca apagado para las clínicas existentes.
- **Solo se agregan cosas**: campos nuevos opcionales o con valor por
  defecto, modelos nuevos, endpoints nuevos y rutas nuevas. No se cambia el
  significado de ningún campo ni se modifica ningún dato existente.
- **No se tocan las plantillas de WhatsApp ya aprobadas** ni las ramas de n8n
  que hoy están en uso.
- **Un error del seguimiento nunca impide agendar ni aceptar una cotización.**
- Se prueba en local y se activa el envío automático primero en una clínica
  piloto.

---

# Parte 1: Seguimiento

## Resumen del flujo

1. La clínica configura **cada cuántos días va cada sesión** en sus
   tratamientos (por ejemplo, axilas cada 30 días). Es un solo número; nada
   técnico.
2. Cuando a una clienta le toca su siguiente sesión y no tiene cita, la app le
   envía **automáticamente** un WhatsApp desde el número propio de la
   clínica: *"Te toca tu sesión 5 de 8 de axilas. Elige tu horario: <link>"*.
3. La clienta abre el link, ve los horarios libres y **se agenda sola**. La
   cita queda ligada a su paquete.
4. Si no se agenda en unos días, o si el caso no se automatiza (cotización
   abierta, no asistió), aparece en la bandeja **Seguimiento** para que la
   recepción la contacte con un clic.
5. Cuando la paciente agenda o acepta la cotización, la oportunidad se cierra
   como **recuperada**, y eso alimenta la métrica "recuperado este mes".

## Lo que ya existe y se reutiliza

| Pieza | Dónde | Uso |
|---|---|---|
| `ItemCotizacion.citas_restantes()` | `cotizaciones/models.py:332` | Sesiones vendidas sin agendar. Ya descuenta canceladas y sesiones previas migradas |
| `ItemCotizacion.num_sesiones_efectivas()` | `cotizaciones/models.py:307` | Total de sesiones del paquete, incluye obsequios |
| `Cita.item_cotizacion` | `agenda/models.py` | Liga cada cita al paquete: última sesión, próxima sesión |
| `Cita.CanalOrigen.WEB` | `agenda/models.py` | Ya existe y no se usa: lo usan las citas que la paciente agenda por link |
| `Cita.Estado.NO_ASISTIO` | `agenda/models.py` | Motivo "no asistió y no reagendó" |
| `Cita.es_migracion` | `agenda/models.py` | Excluir sesiones históricas cargadas por el wizard |
| `ConfirmacionToken` + página `/confirmar/[token]` | `agenda/models.py`, `frontend/src/app/confirmar` | Patrón para el link público de agendamiento |
| `get_slots_disponibles` | `agenda/services.py` | Cálculo de horarios libres por profesional; ya lo usa el endpoint interno `slots_disponibles` |
| `HorarioColaborador`, `BloqueoAgenda`, `Colaborador.especialidades` | `colaboradores/models.py`, `agenda/models.py` | Saber quién está de turno y quién hace el servicio |
| `verificar_disponibilidad_profesional`, `verificar_horario_sede` | `agenda/services.py` | Mismas validaciones al crear la cita desde el link |
| `Cotizacion.Estado` + `CotizacionEnvio` | `cotizaciones/models.py` | Cotización enviada y no aceptada |
| `TratamientoPaciente.Estado.ABANDONADO` | `protocolos/models.py` | Excluir tratamientos que la clínica ya dio por perdidos |
| `enviar_whatsapp` / `resolver_ruta_whatsapp` | `notificaciones/services.py` | Envío de plantillas, número propio, cupo |
| `catalogo_whatsapp.py` | `notificaciones/` | Plantillas que se crean en la WABA de la clínica con número propio |
| `RequirePermission("modulo.recurso.accion")` | `users/permissions.py` | Permisos |
| Endpoint consultado por n8n con `_n8n_secret_ok` | `agenda/views.py` (`recordatorios_pendientes`) | Mismo patrón para la detección diaria (no hay Celery) |
| `Paciente.autoriza_datos` | `pacientes/models.py` | Base legal; ver D6 |
| Enmascarado `pacientes.datos_sensibles.ver` | — | La bandeja muestra el teléfono con la misma regla |

`ItemCotizacion.periodicidad` es texto libre y no sirve para calcular fechas;
por eso hace falta un campo nuevo de intervalo.

## El ciclo de la paciente

| Momento | Qué pasa | Cómo | Fase |
|---|---|---|---|
| Le toca la siguiente sesión | *"Te toca tu sesión 5 de 8 de axilas 👉 elige tu horario"* | **Automático**, plantilla de utilidad con link | 1 |
| Aceptó el paquete y nunca agendó | *"Ya puedes agendar tu primera sesión 👉 link"* | **Automático**, misma plantilla | 1 |
| No se agendó tras el mensaje | Aparece en la bandeja | Manual (`wa.me` con el link, o llamada) | 1 |
| No asistió y no reagendó | Aparece en la bandeja | Manual, el texto sugerido trae el link | 1 |
| Cotización enviada sin aceptar | Aparece en la bandeja | Manual | 1 |
| Día antes de la cita | Indicaciones de preparación ("rasúrate 24 h antes, no te expongas al sol") | Automático, plantilla aparte del recordatorio | 2 |
| Después de la sesión | Cuidados posteriores | Automático | 2 |
| Mantenimiento, inactivos, cumpleaños | Bandeja / campañas | Manual | 2 |
| Terminó el paquete | Reseña de Google, oferta de mantenimiento | Marketing, requiere D6 | 4 |

## Motivos de seguimiento

Cada motivo es una regla que la detección evalúa. Todas excluyen a pacientes
inactivos, a los que pidieron no ser contactados (D6) y las citas con
`es_migracion=True` cuando se busca la "última cita real".

### Fase 1 (MVP)

**M1. Paquete con sesiones pendientes y sin cita agendada** (`sesiones_pendientes`)

- Ítem de una cotización `ACEPTADA` con `citas_restantes() > 0`.
- Sin ninguna cita futura no cancelada ligada a ese ítem.
- Y además una de estas:
  - la última cita completada del ítem fue hace al menos el **intervalo** del
    tratamiento (o el intervalo por defecto de la clínica), o
  - nunca se agendó y la cotización se aceptó (`aceptada_en`, campo nuevo del
    plan del embudo) hace más de N días (por defecto 3).
- Se excluyen los ítems con un `TratamientoPaciente` en `ABANDONADO`.
- Detalle en la bandeja: *"Depilación axilas · 3 de 6 sesiones · última hace
  52 días"*.
- Valor en juego: saldo proporcional de las sesiones pendientes.

**M1 es el único motivo automático en la fase 1** (D9, confirmada). Al
detectarse:

1. Si la clínica tiene el envío automático activo, el addon de WhatsApp con
   número propio y un número conectado (D11, confirmada), la paciente tiene teléfono y no está marcada
   como "no contactar", se envía la plantilla `SEGUIMIENTO_SESION` con el link
   de agendamiento. Se registra como una gestión automática
   (`canal = whatsapp_automatico`).
2. La oportunidad queda con `proximo_contacto` = hoy + N días (por defecto
   5), así que no aparece en "Para hoy". Si la paciente se agenda en ese
   tiempo, se cierra como `recuperada`.
3. Si pasan los N días sin cita, llega su fecha y aparece en "Para hoy" con
   la nota *"Se le envió el link hace 5 días, no agendó"*.
4. Tope: **un mensaje automático por ítem y por sesión**. No se reenvía
   aunque la detección corra todos los días.

Sin envío automático (apagado o sin número propio), M1 entra directo a
"Para hoy" (`proximo_contacto` = hoy), igual que los demás motivos.

**M2. Cotización enviada y no aceptada** (`cotizacion_abierta`)

- Cotización con `estado_comercial = enviada` (borrador con al menos un
  `CotizacionEnvio` y no vencida; ver el plan del embudo).
- Último envío hace más de N días (config, por defecto 3).
- Si la cotización ya tiene una `Oportunidad` del embudo, **no se crea otra**:
  se actualiza esa (su `proximo_contacto` pasa a hoy). Si no tiene, se crea una
  de tipo `recompra` (paciente con compras previas) o `nueva`.
- Detalle: *"Cotización #123 · $2.400.000 · enviada hace 5 días"*.
- Manual. Es marketing para Meta, así que no se automatiza (D6).

**M3. No asistió y no reagendó** (`no_asistio`)

- Cita en `NO_ASISTIO` en los últimos 30 días (D4).
- El paciente no tiene ninguna cita futura no cancelada.
- Si la cita tenía `item_cotizacion`, se fusiona con M1 (ver Deduplicación).
- Manual. El texto sugerido de `wa.me` incluye el link de agendamiento cuando
  la cita era de un paquete.

### Fase 2

**M4. Mantenimiento** (`mantenimiento`): último procedimiento de un servicio
con `frecuencia_mantenimiento_dias` configurada (bótox cada 120 días,
mantenimiento láser cada 365) y sin cita futura de ese servicio.

**M5. Paciente inactivo** (`inactivo`): última cita completada hace más de N
días (config, por defecto 180) y sin cita futura. Pestaña aparte para
campañas de reactivación.

**M6. Cumpleaños** (`cumpleanos`): a partir de `Paciente.fecha_nacimiento`,
con opción de ligar un beneficio de una promoción vigente (la `Campana` de
precios, que en la interfaz pasa a llamarse "Promoción").

## Link "elige tu horario"

Decisión D10, confirmada: entra en el MVP. No es una reserva online pública.
Solo sirve para **agendar una sesión de un paquete que la paciente ya compró**.

### Modelo `EnlaceAgendamiento`

| Campo | Tipo | Nota |
|---|---|---|
| `clinica` | FK Clinica | |
| `paciente` | FK Paciente | |
| `item_cotizacion` | FK ItemCotizacion | El paquete |
| `token` | char único | `secrets.token_urlsafe`, como `ConfirmacionToken` |
| `expira_en` | datetime | Por defecto 14 días |
| `usado_en` | datetime, null | |
| `cita` | FK Cita, null | La cita que se creó con el link |
| `oportunidad` | FK Oportunidad, null | Para cerrarla como recuperada |
| `origen` | choices | `automatico`, `manual` |

Es un modelo nuevo. No se toca `ConfirmacionToken` ni la página
`/confirmar/[token]`.

### Endpoints públicos (sin login)

Bajo `/api/public/agendar/<token>/`, con rate limit por IP y por token:

| Método | Ruta | Uso |
|---|---|---|
| GET | `` | Datos para pintar la página: clínica, logo, tratamiento, "sesión 5 de 8", sedes posibles, fecha mínima sugerida |
| GET | `slots/?sede=&fecha=` | Horarios libres de ese día para la sesión que sigue |
| POST | `` | `{sede, inicio}` → crea la cita |

Reglas al crear la cita:

- El token tiene que estar vigente y sin usar, y el ítem tiene que seguir
  teniendo `citas_restantes() > 0`. Si no, mensaje claro: *"Este link ya se
  usó"* o *"Ya agendaste todas tus sesiones"*.
- Mismas validaciones que la creación interna: horario de la sede,
  disponibilidad del profesional y bloqueos. Se llama al mismo servicio que usa
  la agenda, no a una copia.
- **Profesional (D12, confirmada)**: la paciente no lo elige. La app asigna
  el primer profesional **de turno** y libre a esa hora, en un orden fijo (por
  nombre en el MVP). Ver [Quién está de turno](#quién-está-de-turno).
- La cita queda con `canal_origen = WEB`, ligada al `item_cotizacion`, en
  estado `CONFIRMADA` (la eligió la paciente), y entra al flujo normal de
  recordatorios.
- Queda en `LogAccion` con usuario nulo y origen "link de agendamiento".
- Se cierra la oportunidad como `recuperada`.

### Quién está de turno

La app ya sabe quién trabaja cuándo; no hace falta nada nuevo:

- **`HorarioColaborador`** (`colaboradores/models.py:57`): por profesional,
  sede y día de la semana, hora de inicio y fin. Se configura en la ficha del
  colaborador.
- **`BloqueoAgenda`** aprobado: vacaciones, incapacidades, permisos.
- **Citas** ya agendadas del profesional.
- **Quién hace el servicio**: si la clínica tiene activo
  `filtrar_profesionales_por_procedimiento`, solo los colaboradores con ese
  servicio en `especialidades`; si no, cualquier profesional asignado a la
  sede.

Un profesional está **de turno** para una hora si tiene `HorarioColaborador`
activo ese día en esa sede que cubre la cita completa y no tiene un bloqueo
aprobado que la cruce. Está **libre** si además no tiene otra cita.

Una diferencia importante con la agenda interna: hoy
`verificar_horario_profesional` (`agenda/services.py:168`) **deja pasar** a
un profesional que no tiene horario configurado ese día (lo trata como "sin
restricción"). Para la recepción tiene sentido, porque ve la agenda y decide.
Para el link público no: un usuario marcado como profesional pero que no
atiende (por ejemplo, la dueña) recibiría citas. Por eso:

- **El link solo ofrece profesionales con horario explícito** ese día. Esta
  regla es nueva y solo aplica al link; la agenda interna no cambia.
- Si en una sede ningún profesional que haga el servicio tiene horarios
  configurados, el link muestra *"Escríbenos para agendar"* con el WhatsApp
  de la clínica, y la configuración de seguimiento avisa: *"Para que tus
  pacientes se agenden solas, configura los horarios de tus profesionales"*.

### Horarios libres

Ya existe `agenda/services.py::get_slots_disponibles(profesional_id,
sede_id, fecha, duracion_min)`. El endpoint público la llama para cada
profesional de turno y muestra la unión: una hora aparece si al menos uno
está libre. Al confirmar, se asigna el primero libre en el orden fijo,
revalidando en ese momento (alguien pudo tomar el horario mientras la
paciente miraba). El endpoint interno `slots_disponibles` no se toca.

### Página `/agendar/[token]`

Ruta pública nueva en el front, junto a `/confirmar`. Pensada para celular:

1. Encabezado con logo de la clínica y *"Sesión 5 de 8 · Depilación axilas"*.
2. Sede (si hay más de una) y un calendario con los próximos 21 días,
   empezando en la fecha sugerida.
3. Horarios del día elegido como botones.
4. Confirmación: *"Listo, te esperamos el martes 14 a las 3:00 p. m."*.

Sin cuenta, sin contraseña y sin datos personales en pantalla más allá del
nombre de pila.

## Modelo de datos

App nueva: `backend/apps/seguimiento/` (organización del código; para la
clínica es una parte más de la app, no un módulo que se contrata).

### `Oportunidad`

Modelo compartido con el embudo comercial. Abajo están los campos que usa
este plan; [plan-funnel-comercial.md](plan-funnel-comercial.md#oportunidad-compartida-con-el-seguimiento)
agrega `tipo`, `etapa`, `contacto_nombre`/`contacto_telefono`, `origen`,
`responsable`, `servicio_interes`, `valor_estimado`, `campana_marketing` y
`motivo_perdida`. **La fase que se implemente primero (esta o la 2 del
embudo) crea el modelo completo**, para no migrarlo dos veces.

| Campo | Tipo | Nota |
|---|---|---|
| `clinica` | FK Clinica | |
| `sede` | FK Sede, null | Sede de la cotización o de la última cita; filtra la bandeja |
| `paciente` | FK Paciente, null | Siempre lleno en las de este plan; null solo en interesados del embudo sin ficha |
| `tipo` | choices | `paquete` (M1, M3), `recompra` (M2 con compras previas, M4, M6), `reactivacion` (M5), `nueva` (embudo) |
| `motivo` | choices | `sesiones_pendientes`, `cotizacion_abierta`, `no_asistio` (+ fase 2) + `manual` y `campana` del embudo |
| `item_cotizacion` | FK, null | M1 |
| `cotizacion` | FK, null | M2 |
| `cita` | FK, null | M3, y la cita que la cerró como recuperada |
| `clave` | char, null, único por clínica cuando no es null | Deduplicación, p. ej. `sesiones_pendientes:item:<uuid>:sesion:5`. Null en las creadas a mano |
| `estado` | choices | `abierta`, `ganada`, `perdida`, `resuelta_sola`. Estados comunes con el embudo: en tipo `paquete`, `ganada` se muestra como **recuperada** y `perdida` como **descartada** |
| `proximo_contacto` | date, null | La única fecha que ve la recepción. Aparece en "Para hoy" si es hoy o ya pasó. Esperar tras un envío automático o posponer es solo mover esta fecha (simplificación del 2026-10-08: reemplaza los estados `en_espera` y `pospuesta`) |
| `detectada_en` | datetime | |
| `valor_en_juego` | decimal, null | Calculado al detectar; se refresca en cada pasada |
| `detalle` | JSON | Datos para pintar la fila sin más consultas |
| `cerrada_en` / `cerrada_por` | datetime / FK User, null | |
| `motivo_perdida` / `nota_perdida` | choices / text | Antes `motivo_descarte`; mismas opciones que el descarte de cotizaciones del embudo |

En el resto de este plan, "cerrar como `recuperada`" es `estado = ganada` y
"descartar" es `estado = perdida`.

La clave de M1 incluye el número de sesión, así cada sesión del paquete
genera como máximo una oportunidad y un mensaje automático.

Índices: `(clinica, estado, motivo)`, `(paciente, estado)`.

### `GestionOportunidad`

Historial de contactos, visible en la ficha del paciente.

| Campo | Tipo | Nota |
|---|---|---|
| `oportunidad` | FK | |
| `usuario` | FK User, null | Nulo en los envíos automáticos |
| `canal` | choices | `whatsapp_automatico`, `whatsapp_plantilla`, `whatsapp_manual`, `llamada`, `presencial`, `nota` |
| `resultado` | choices | `enviado`, `sin_respuesta`, `interesado`, `agendo`, `no_interesado`, `numero_errado`, `otro` |
| `nota` | text | |
| `envio_whatsapp` | FK EnvioWhatsApp, null | |
| `created_at` | datetime | |

### Campos nuevos en modelos existentes

Todos opcionales o con valor por defecto que mantiene el comportamiento
actual:

- `TratamientoCatalogo.intervalo_sesiones_dias` (entero, null). Null = usa el
  intervalo por defecto de la clínica. No afecta nada fuera del seguimiento.
- `Servicio.frecuencia_mantenimiento_dias` (entero, null): fase 2.
- `Servicio.indicaciones_previas` y `Servicio.cuidados_posteriores` (texto,
  blank): fase 2.
- `Paciente.no_contactar_seguimiento` (bool, default `False`) y
  `no_contactar_desde` (datetime, null): D6.
- `ConfigSeguimiento` 1:1 con `Clinica` (modelo nuevo, para no engordar
  `Clinica`), creado con `get_or_create` la primera vez que se lee:
  - `envio_automatico_activo`: **False** para las clínicas existentes. En las
    clínicas nuevas, True si se registran en modo simple y False en modo
    completo (D13, confirmada). Igual no envía nada sin el addon de WhatsApp
    con número propio.
  - `intervalo_por_defecto_dias` (30), `dias_sin_agendar_tras_aceptar` (3),
    `dias_espera_tras_envio` (5), `dias_cotizacion_abierta` (3), motivos
    activos.

Sin flag de plan ni override para el seguimiento: está en todos los planes
(D1). Los envíos por plantilla se validan con los flags de WhatsApp que ya
existen.

## Detección

Servicio `seguimiento/services.py::detectar_oportunidades(clinica)`,
idempotente:

1. Evalúa cada motivo activo y arma el conjunto de claves vigentes.
2. Crea las oportunidades nuevas (`get_or_create` por `clave`) y refresca
   `detalle` y `valor_en_juego` de las abiertas.
3. Para las M1 nuevas, hace el envío automático si aplica (ver M1) y les
   pone `proximo_contacto` = hoy + N días.
4. Las que ya no aparecen se cierran: `recuperada` si hay una cita nueva o la
   cotización se aceptó después de `detectada_en`; `resuelta_sola` en otro
   caso.
5. No hace falta mover estados por fecha: "Para hoy" filtra por
   `proximo_contacto <= hoy`.

Disparo:

- **Diario**: `POST /api/seguimiento/detectar/` protegido con
  `_n8n_secret_ok`, llamado por un workflow **nuevo** de n8n con cron. Recorre
  las clínicas activas. Hora del envío: media mañana (por ejemplo, 10:00 hora
  de la clínica), no de madrugada. Un error en una clínica se registra y no
  frena a las demás.
- **Al crear una cita o aceptar una cotización**: cerrar en el momento las
  oportunidades del paciente que correspondan. Se hace con una llamada al
  final del servicio que crea la cita, envuelta en `try/except` + log: un
  error del seguimiento nunca impide crear una cita ni aceptar una cotización.

### Deduplicación

Una fila por paciente y motivo. M3 se absorbe en M1 cuando la cita pertenece
a un paquete (la fila de M1 muestra "no asistió a su última cita").

## WhatsApp

**El WhatsApp por plantilla sigue siendo addon, tal como está hoy.** El
seguimiento está en el core, pero cualquier envío por plantilla (automático
o desde la bandeja) requiere `whatsapp_habilitado` y consume el cupo del
plan. El envío automático además requiere el addon de número propio. Sin
addon, la clínica usa la bandeja con `wa.me` manual y el link de
agendamiento, que no cuestan nada. Es también un buen argumento para vender
el addon: *"actívalo y el sistema le escribe solo a la paciente"*.

Decisión D11, confirmada: **los envíos automáticos salen solo por el número
propio de la clínica.** Así, cuando la paciente responde, la respuesta llega
al WhatsApp de la clínica y la recepción la atiende ahí. La app no lee ni
gestiona respuestas en esta versión.

- **Número propio**: plantilla `SEGUIMIENTO_SESION` en `catalogo_whatsapp.py`,
  categoría **utilidad** (se refiere a algo que la paciente ya compró).
  Variables: nombre, tratamiento, sesión N de M, nombre de la clínica, link.
  Texto sobrio, sin promociones, para que Meta no la recategorice como
  marketing.
- **Número compartido de CliniQ**: no hay envío automático (las respuestas
  llegarían a un número que nadie atiende). La clínica usa la bandeja con
  `wa.me` manual.
- **WhatsApp manual (`wa.me`)**: desde cualquier fila de la bandeja, con texto
  sugerido según el motivo y el link de agendamiento cuando aplica. No cuesta,
  no descuenta cupo, funciona sin el addon de WhatsApp.
- Todos los envíos por plantilla pasan por `enviar_whatsapp`, así que
  respetan el cupo y quedan en `EnvioWhatsApp` con un tipo nuevo
  `SEGUIMIENTO`.
- **Fase 2, indicaciones previas y cuidados**: plantillas **nuevas y
  separadas** (`INDICACIONES_PREVIAS`, `CUIDADOS_POSTERIORES`). El
  recordatorio de cita actual no se modifica. Solo se envían si el servicio
  tiene el texto configurado.

## API

Bajo `/api/seguimiento/`:

| Método | Ruta | Permiso | Uso |
|---|---|---|---|
| GET | `oportunidades/` | `seguimiento.oportunidades.ver` | Bandeja. Filtros: `estado`, `motivo`, `sede`, `q` |
| GET | `oportunidades/resumen/` | `seguimiento.oportunidades.ver` | Conteos por motivo y "recuperado este mes" |
| POST | `oportunidades/{id}/gestiones/` | `seguimiento.oportunidades.gestionar` | Registrar gestión |
| POST | `oportunidades/{id}/whatsapp/` | `seguimiento.oportunidades.gestionar` | Enviar plantilla a mano |
| POST | `oportunidades/{id}/enlace/` | `seguimiento.oportunidades.gestionar` | Generar link de agendamiento para pegar en `wa.me` |
| PATCH | `oportunidades/{id}/` | `seguimiento.oportunidades.gestionar` | Posponer = cambiar `proximo_contacto` (y los campos del embudo) |
| POST | `oportunidades/{id}/descartar/` | `seguimiento.oportunidades.gestionar` | `{motivo}` |
| GET | `pacientes/{id}/gestiones/` | `seguimiento.oportunidades.ver` | Historial en la ficha del paciente |
| GET/PUT | `config/` | `seguimiento.config.editar` | Configuración de la clínica |
| POST | `detectar/` | secreto de n8n | Detección diaria |

Más los endpoints públicos de `/api/public/agendar/<token>/`.

Permisos nuevos: el admin los tiene por su rol; para los demás roles se
asignan desde **Configuración → Roles**, como cualquier permiso. No se
agregan solos a los roles personalizados existentes, para que nadie vea algo
nuevo sin que el admin lo decida. Al implementar, revisar cómo se siembran los
permisos hoy para seguir el mismo mecanismo.

Las acciones quedan en `LogAccion`, como el resto de la app.

## Frontend

- **`/seguimiento`**: primera entrada del grupo **Comercial**, con el
  conteo de "Para hoy". Diseño en el plan del embudo
  ([Bandeja unificada](plan-funnel-comercial.md#bandeja-unificada)): pestaña
  **Para hoy** (una sola lista de todos los motivos, filtro Mías/Todas y sede;
  chips por motivo solo si hay más de 20 filas) y pestaña **Embudo**. Cada
  fila dice en una frase por qué está ahí y la última gestión ("Link enviado
  automáticamente · hace 5 días"). Acciones visibles: **WhatsApp** (manual o
  plantilla), **Agendar** (abre el modal de nueva cita con el paquete
  elegido) y **Ya lo llamé** (gestión + nueva fecha). En el menú de la fila:
  copiar link de agendamiento, posponer, descartar.
- **`/agendar/[token]`**: página pública descrita arriba.
- **Ficha del paciente**: bloque "Seguimiento" con oportunidades abiertas y
  el historial de gestiones.
- **Dashboard**: tarjeta "Para contactar hoy" y "Ganado y recuperado este
  mes" (ventas ganadas desde una oportunidad y sesiones recuperadas, por
  separado). Convive con las tarjetas nuevas de Cotizaciones y Ventas del plan
  del embudo.
- **Configuración**:
  - `/configuracion/seguimiento`: días de cada regla y el interruptor
    **"Enviar automáticamente el link cuando le toca la sesión"**, con una
    vista previa del mensaje. Si la clínica no tiene el addon de WhatsApp con
    número propio, el interruptor aparece deshabilitado con el aviso y el
    enlace al plan o a la configuración de WhatsApp. Aviso aparte si los
    profesionales no tienen horarios configurados (ver
    [Quién está de turno](#quién-está-de-turno)).
  - Campo "Días entre sesiones" en el formulario de tratamientos.
  - Casilla "No contactar para seguimiento" en el paciente.
- **Centro de ayuda**: artículo del seguimiento.

## Métricas

- **Recuperadas** por motivo, y cuántas fueron por el envío automático sin
  intervención de la recepción.
- **Sesiones recuperadas este mes**: valor de las sesiones agendadas desde una
  oportunidad. Ya estaban cobradas, así que se muestra como "sesiones
  recuperadas" y no como ingreso nuevo.
- **Cotizaciones cerradas** con oportunidad abierta (M2): ingreso nuevo,
  fechado por `aceptada_en` (la misma fecha de venta que usan los KPI del
  embudo).
- Atribución: la cita o la aceptación tiene que llegar dentro de 14 días desde
  el último contacto (automático, manual o campaña).

Entra en la fase 1 en su versión simple (tarjeta del dashboard), y el detalle
en la fase 3.

---

# Parte 2: Modo de trabajo

## La idea

En **Configuración → Clínica** aparece "¿Cómo trabaja tu centro?" con dos
opciones:

- **Completo** — *Clínica estética o médica.* Historia clínica completa,
  órdenes, exámenes, zonas y parámetros. Es la app de hoy.
- **Simple** — *Láser y aparatología.* Registrar una sesión toma un clic. La
  historia completa sigue disponible, pero no está en el camino.

El modo **solo cambia qué se muestra y qué pantalla se abre por defecto**.
Nunca borra datos, nunca cambia validaciones del backend ni permisos. Por eso
se puede cambiar de uno a otro en cualquier momento: todo lo registrado en un
modo se ve en el otro.

## Cómo trabajan los centros láser en Medellín

Revisión del 2026-10-06 de lo que publican centros de Medellín y algunas
cadenas de Bogotá (sitios web y tiendas online). Es información pública:
políticas internas como inasistencias o vencimiento de paquetes no aparecen y
hay que confirmarlas con los centros.

- **Venden por zona y por combos de N zonas.** Por ejemplo, axilas 8 sesiones
  con precio de lista y precio de promoción (Dermatológica), o "elige 2, 3, 4,
  6 u 8 zonas" y cuerpo completo (Lasertam). En los combos la clienta escoge
  las zonas al comprar, y en cada visita se hacen varias zonas a la vez.
- **Paquetes de 6 a 8 sesiones**, con 4 a 8 semanas entre sesiones según la
  zona. Mantenimiento ocasional después.
- **Venden el paquete online** (Mercado Pago, PSE, tarjeta) y luego *"un
  asesor te contacta para agendar"*. Ese contacto manual después de la venta
  es exactamente lo que resuelve el link "elige tu horario".
- **Financian con terceros** (Addi, Sistecrédito) además de tarjeta. En CliniQ
  eso ya se cubre como forma de pago; no hace falta desarrollo.
- **Indicaciones estándar**, iguales en todos: antes, rasurar el día anterior
  y no exponerse al sol; después, de 48 a 72 horas sin sol, calor, ejercicio
  intenso ni piscina, y protector solar.
- **Los equipos hacen la parte técnica.** Usan equipos de marca (Soprano Ice
  Platinum, lectores de melanina como Skintel) que ajustan los parámetros
  solos. Esto confirma que el registro técnico manual sobra.
- **Varias sedes** (Poblado, Laureles, Envigado) en los centros medianos.
- **Formalidad**: algunos se presentan como IPS habilitadas y otros trabajan
  con cosmetólogas bajo la Ley 711 de 2001. En los dos casos se lleva algún
  registro de la atención, así que el modo simple no debe quitar la historia:
  solo hacerla más rápida de llenar. Qué registro exige la norma a cada centro
  es responsabilidad de la clínica, como el texto de los consentimientos.

Fuentes: dermatologica.com.co (paquete axilas), lasertam.com.co (combos y
proceso de compra), miadermatologia.com (equipo y cuidados), dermaskincare.com.co
e info general de clinicasesteticas.com.co.

## Qué cambia en modo simple

Propuesta para D14, a partir de lo anterior:

| Dónde | Modo completo (hoy) | Modo simple |
|---|---|---|
| Atender una cita | Abre la atención completa con pestañas | Abre **"Registrar sesión"**: *"Sesión 4 de 8 · Axilas + bikini"*, casillas de las zonas hechas hoy (vienen marcadas), botón **Completar**, nota opcional que trae lo escrito la vez anterior y fotos opcionales. Siempre hay un enlace a "Abrir atención completa" |
| Zonas del combo | No aplica | Al vender un combo se eligen las zonas (campo nuevo opcional en el ítem de la cotización, `zonas_elegidas`). Se muestran en la agenda, en "Registrar sesión", en la bandeja y en el WhatsApp |
| Menú | Todo | Oculta órdenes médicas y plantillas de órdenes |
| Pestañas de la atención completa | Las que la clínica tenga activas | Preset: datos generales, motivo de consulta, antecedentes y fotos. Oculta exámenes, órdenes, mediciones, insumos y zonas con parámetros. Se puede ajustar |
| Ficha del paciente | Igual que hoy | Tarjeta visible con **fototipo** y **contraindicaciones** (campos opcionales que existen en los dos modos) |
| Servicios | Igual que hoy | Las indicaciones previas y los cuidados posteriores vienen con un texto sugerido para láser, que la clínica puede editar |
| Configuración | Todas las páginas | Las de uso clínico (plantillas de órdenes, historia clínica) se agrupan en "Más opciones" en lugar de desaparecer |

**No se oculta**: historia clínica (la consulta sigue disponible desde la
ficha), consentimientos, cartera, inventario. Solo cambian de lugar o de
pantalla por defecto.

Por eso, en modo simple conviene adelantar las **indicaciones previas y
cuidados posteriores** por WhatsApp (fase 3 → junto con el modo), porque todos
los centros las dan y hoy las mandan a mano.

Para más adelante, no ahora: **venta online del paquete** con pago (ya hay un
plan de integración con Mercado Pago en
`docs/plan-integracion-pagos-mercado-pago.md`). Combinada con el link de
agendamiento, la clienta compraría y se agendaría sin hablar con nadie.

Preguntas para 2 o 3 centros antes de cerrar D14:

1. ¿Qué pasa si la clienta no asiste: pierde la sesión o se reprograma?
2. ¿El paquete vence? ¿A los cuántos meses?
3. ¿Quién agenda hoy las sesiones siguientes y cómo (WhatsApp, llamada)?
4. ¿Qué registran de cada sesión y dónde?

Lo que **no cambia** entre modos: agenda, cotizaciones, tratamientos,
consentimientos, cartera, caja, inventario, seguimiento, WhatsApp, reportes,
roles y permisos.

## Cómo funciona por debajo

- Campo nuevo `Clinica.modo_trabajo` con opciones `completo` y `simple`,
  default **`completo`**. Las clínicas existentes quedan en `completo` sin
  tocar ningún dato.
- El front lee el modo desde `miClinica` (ya se consulta en la atención y la
  historia) y decide qué pantalla abrir y qué mostrar.
- **Registrar sesión** escribe en las mismas tablas que la atención: crea la
  `NotaClinica` de la cita (con la nota en `motivo_consulta` y estado
  `COMPLETADA`), marca la `SesionProcedimiento` y la cita como completadas y
  sube las fotos a `FotoClinica`. Por eso, si la clínica pasa a modo completo,
  esas sesiones aparecen en la historia como cualquier atención. Es otra forma
  de capturar, no otro modelo de datos.
- "Registrar sesión" también está disponible en modo completo, como un botón
  más en las citas de un paquete. Una clínica médica que además hace láser no
  tiene que cambiar de modo para usarlo; el modo solo decide cuál pantalla es
  la principal.
- `Paciente.fototipo` (choices I–VI, null) y
  `Paciente.contraindicaciones` (texto, blank): campos nuevos opcionales.
- **Cambiar de modo**: interruptor en Configuración → Clínica con un resumen
  de qué va a cambiar y confirmación. Es inmediato, sin migraciones ni
  procesos, y queda en `LogAccion`.
- **Registro de clínica nueva**: se pregunta "¿Qué tipo de centro es?" y se
  deja el modo elegido. Se puede cambiar después.

## Hallazgo: las pestañas de la atención se guardan en el navegador

Hoy la configuración de **Pantalla del profesional**
(`/configuracion/atencion`) se guarda con `zustand/persist` en el
`localStorage` del navegador (`store/atencionConfigStore.ts`), no en la
clínica. Eso significa que cada usuario y cada computador tiene su propia
configuración, y que la de la recepción no aplica al médico.

El modo de trabajo es de la clínica, así que las pestañas tienen que pasar al
servidor. Para no cambiarle nada a nadie:

- Campo nuevo `Clinica.pestanas_atencion` (JSON, null).
- Mientras sea null, el front sigue leyendo el `localStorage` como hoy.
- Cuando el admin guarde la configuración (o cambie de modo), se guarda en la
  clínica y desde ahí manda el servidor para todos los usuarios.

## Equipos en la agenda

Independiente del modo, porque también le sirve a la clínica médica (HIFU,
CO₂). Fase 3:

- Modelo `Equipo` por sede, con disponibilidad propia por días (para equipos
  alquilados) y un campo opcional en `Servicio` para indicar que usa un
  equipo.
- La validación de cruces solo se aplica cuando el servicio tiene un equipo
  asignado. Sin equipos configurados, la agenda funciona exactamente igual que
  hoy.

---

## Compatibilidad con las clínicas actuales

| Riesgo | Cómo se evita |
|---|---|
| Que la app cambie para las clínicas actuales | `modo_trabajo` default `completo`. Lo único nuevo que ven es la entrada **Seguimiento** en el menú (solo el admin, hasta que asigne permisos) y el campo opcional "Días entre sesiones" |
| Mensajes no esperados a pacientes | `envio_automatico_activo = False` para las clínicas existentes. Solo se envía con el interruptor activo, addon de WhatsApp con número propio, número conectado y sin `no_contactar_seguimiento`. Un mensaje por sesión como máximo |
| Que el link asigne citas a quien no atiende | El link solo usa profesionales con `HorarioColaborador` explícito ese día; la agenda interna conserva su regla actual |
| Migraciones que alteren datos | Solo `AddField` con null o default, y `CreateModel`. Sin migraciones de datos sobre tablas existentes. `ConfigSeguimiento` se crea al leerse por primera vez |
| Que crear una cita o aceptar una cotización falle por el seguimiento | El cierre de oportunidades corre al final, con `try/except` + log |
| Que cambien los horarios libres de la agenda | El link reutiliza `get_slots_disponibles` sin modificarla; el endpoint interno `slots_disponibles` no se toca |
| Que cambien los mensajes actuales | No se toca el recordatorio ni ninguna plantilla aprobada; las plantillas nuevas van aparte. No se modifican ramas de n8n en uso; la detección usa un workflow nuevo |
| Que cambie la pantalla del profesional | Mientras `pestanas_atencion` sea null, se sigue usando la configuración local de cada navegador |
| Que alguien vea información nueva sin permiso | Los permisos nuevos no se agregan solos a roles personalizados |
| Link público expuesto | Token largo, vence en 14 días, un solo uso, rate limit, sin datos sensibles en la página |
| Cambiar de modo y perder algo | El modo no borra ni oculta datos en el backend; todo se ve al volver al otro modo. Probado en las dos direcciones |

Proceso:

1. Rama local, todo probado en Docker local; nada de push ni cambios en n8n de
   producción hasta que se pida.
2. Correr la suite completa de backend, no solo las pruebas nuevas.
3. Deploy: para las clínicas actuales, lo único visible es la bandeja de
   Seguimiento (manual).
4. Activar el envío automático en **una clínica piloto** (idealmente un centro
   láser con número propio) y revisar envíos y bandeja durante dos semanas.
5. Contarle a las demás clínicas y que cada una lo active.

## Fases

1. **Seguimiento (MVP)**:
   - permisos, `ConfigSeguimiento`, intervalo entre sesiones en tratamientos;
   - detección de M1–M3 (diaria y al crear cita);
   - envío automático de M1 por número propio, apagado por defecto;
   - link "elige tu horario" con su página pública;
   - "Para hoy" con WhatsApp manual y por plantilla, gestión, posponer y
     descartar;
   - bloque en la ficha del paciente y tarjeta "Recuperado este mes".
2. **Modo de trabajo**: `modo_trabajo`, "Registrar sesión", zonas elegidas
   en combos, fototipo y contraindicaciones, pestañas de la atención en el
   servidor, pregunta en el registro de clínica, indicaciones previas y
   cuidados posteriores por WhatsApp (plantillas nuevas, addon de WhatsApp).
3. **Más ciclo y operación**: M4
   mantenimiento, M5 inactivos, M6 cumpleaños, equipos en la agenda, métricas
   detalladas.
4. **Marketing**: los envíos masivos con plantillas creadas por la clínica
   (reactivación, mantenimiento, cumpleaños, promociones) y la autorización de
   marketing pasan a la fase 3 de [plan-funnel-comercial.md](plan-funnel-comercial.md#campañas-de-marketing-por-whatsapp).
   Queda aquí: automatizar M2, encuesta después de la cita y reseña de Google,
   que usan esa misma autorización.

Las fases 1 y 2 son independientes; se pueden hacer en cualquier orden o en
paralelo.

## Pruebas

- Detección: cada motivo con casos que entran y que no (sesiones completas,
  cita futura, tratamiento abandonado, cita de migración, paciente con
  `no_contactar_seguimiento`, cotización vencida).
- Idempotencia: correr la detección dos veces no duplica filas ni mensajes.
- Envío automático: solo con el interruptor activo y número propio, una vez
  por sesión, respeta cupo y opt-out (con `enviar_whatsapp` mockeado, como en
  `notificaciones/tests.py`). Clínica existente sin tocar → cero envíos.
- Link: vigente, vencido, usado, sin sesiones restantes, horario ocupado entre
  que se cargó la página y se confirmó, sede fuera de horario, asignación al
  primer profesional libre en orden.
- Turno: el link no ofrece a un profesional sin `HorarioColaborador` ese día,
  con bloqueo aprobado o que no hace el servicio (cuando la clínica filtra por
  procedimiento); la agenda interna sigue igual.
- Cierre: agendar desde el link o desde la agenda cierra M1 como `recuperada`.
  Un error forzado en el seguimiento no impide crear la cita.
- Modo: "Registrar sesión" deja la nota, la sesión y la cita igual que la
  atención completa; cambiar de simple a completo y de vuelta no pierde ni
  oculta nada; con `pestanas_atencion` null se respeta el `localStorage`.
- Permisos por acción; filtrado por sede.

## Decisiones

Confirmadas:

- **D1.** El seguimiento es parte del core, incluido en todos los planes,
  igual que cobros. No es addon. El WhatsApp por plantilla sí sigue siendo
  addon, tal como está hoy.
- **D9.** El envío automático de "te toca tu sesión" (M1) entra desde el MVP.
  Los demás motivos son manuales hasta resolver D6.
- **D10.** El link "elige tu horario" entra en el MVP.
- **D11.** Los envíos automáticos salen solo por el número propio de la
  clínica; las respuestas se atienden en el WhatsApp de la clínica, fuera de
  la app.
- **D12.** La paciente no elige profesional: se asigna el primero de turno y
  libre, en un orden fijo. De turno = horario explícito ese día en esa sede y
  sin bloqueo aprobado.
- **D13.** Envío automático encendido por defecto en clínicas nuevas en modo
  simple, apagado en modo completo y en todas las existentes.
- **Modo de trabajo**: no hay módulo ni producto aparte para láser. La clínica
  elige "completo" o "simple" en su configuración y puede cambiar cuando
  quiera sin perder nada.
- **Compatibilidad**: nada de esto puede cambiar el funcionamiento para las
  clínicas actuales sin que ellas lo activen.

Abiertas:

- **D2. Nombre en la interfaz.** Recomendación: **"Seguimiento"**.
- **D3. ¿Plantillas editables por la clínica?** Recomendación: no en el MVP;
  fijas en código, como el catálogo actual. Las plantillas de **marketing**
  sí las crea la clínica, con el editor del plan del embudo; las de
  seguimiento (utilidad) siguen fijas.
- **D4. ¿Las cancelaciones entran en M3?** Recomendación: solo `NO_ASISTIO`
  en el MVP.
- **D5. ¿Responsable por oportunidad?** Resuelta por el plan del embudo:
  campo `responsable` opcional. En las de este plan se deja vacío en el MVP.
- **D6. Autorización para mensajes de marketing.** `autoriza_datos` cubre el
  tratamiento de datos; los mensajes de marketing piden consentimiento
  explícito (Ley 1581 en Colombia). `no_contactar_seguimiento` sigue como
  exclusión en el MVP (M1 es utilidad sobre algo ya comprado). La
  autorización explícita (`Paciente.autoriza_marketing` y la baja) se diseña
  en el plan del embudo, sección
  [Autorización de marketing](plan-funnel-comercial.md#autorización-de-marketing),
  y la usan los dos planes. Validar con un abogado.
- **D7. WhatsApp manual sin permiso de datos sensibles.** Recomendación: sin
  el permiso, solo plantilla o copiar link.
- **D8. ¿Detección diaria bastante?** Con el cierre al crear citas, sí.
- **D14. Qué cambia en modo simple.** Propuesta en
  [Qué cambia en modo simple](#qué-cambia-en-modo-simple), basada en lo que
  publican los centros de Medellín. Falta confirmar con 2 o 3 centros las
  preguntas de esa sección.

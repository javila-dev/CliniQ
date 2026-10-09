# Plan: embudo comercial (oportunidades, cotizaciones y ventas)

Fecha: 2026-10-07. Escrito contra `main` (`f52225d`).

Estado: **propuesta, no implementado**. Las decisiones confirmadas están
marcadas como tales; las demás siguen abiertas (ver
[Decisiones](#decisiones)).

Se articula con [plan-seguimiento-retencion.md](plan-seguimiento-retencion.md):
los dos planes comparten el modelo `Oportunidad` y la bandeja. Este plan cubre
la **adquisición** (de interesado a venta); el de seguimiento cubre la
**retención** (de venta a mantenimiento).

## El problema

Hoy todo lo comercial vive bajo **Cotizaciones**, y eso engaña:

- Una venta no es un concepto propio: es una `Cotizacion` en estado
  `aceptada`, materializada en su `Cartera`. La lista de cotizaciones mezcla
  propuestas abiertas con contratos firmados que tienen cartera, cuotas,
  sesiones y consentimientos. `CotizacionForm.tsx` (~1.900 líneas) pinta las
  dos cosas.
- No hay nada antes de la cotización: no existe el interesado que escribió por
  Instagram y todavía no es paciente, ni de dónde llegó, ni quién lo atiende.
- Los estados no cuentan el embudo: no existe "enviada" (aunque
  `CotizacionEnvio` registra cada envío) y **`vencida` existe como opción pero
  ningún código la asigna**.
- No hay fecha de aceptación. Los KPI la infieren de `Cartera.created_at`, que
  no siempre es la fecha real (ver [KPI](#kpi-del-dashboard)).

No se busca un CRM genérico: **etapas fijas** pensadas para la clínica, que
avanzan solas con lo que ya pasa en la app (cita, envío, aceptación). Solo las
primeras se marcan a mano.

## Principio: fácil para usuarios con poca experiencia

Lo usa la recepción de una clínica pequeña, no un equipo de ventas. Reglas de
diseño para todo el plan (revisión de 2026-10-08):

1. **Una sola pregunta diaria: "¿a quién llamo hoy?"** Todo lo demás es
   secundario. La pantalla principal es una lista, no un tablero.
2. **Una sola fecha por oportunidad: "próximo contacto".** Nada de estados
   como "en espera" o "pospuesta" en la interfaz: posponer es cambiar esa
   fecha. Si la fecha es hoy o ya pasó, aparece en la lista de hoy.
3. **Pocas etapas, con nombres de clínica**: Nuevo, Valoración, Cotizado. Al
   cerrar: Ganado o Perdido. Ninguna palabra de CRM ("lead", "deal",
   "pipeline", "funnel") en la interfaz.
4. **Lo que la app ya sabe no se pregunta.** Las etapas avanzan solas con la
   cita, el envío y la aceptación. Crear un interesado pide 3 datos.
5. **Sin configurar nada para empezar.** Sin etapas, campos ni flujos
   configurables. Los días de cada regla vienen con un valor por defecto que
   funciona.
6. **Campañas guiadas en 3 pasos**, con grupos de pacientes listos y mensajes
   de ejemplo. El editor completo es opcional.
7. **Cada número explica de dónde sale**, en una frase, con un tooltip.

### Qué se toma de otras apps

Revisión de lo que publican Zenoti, Pabau, Fresha, Mangomint, Kommo,
AgendaPro, Flowww y Doctocliq (la información viene de sus sitios y de
comparativas de otros proveedores, así que es material de marketing, no
evidencia independiente).

| De | Qué hacen | Qué adoptamos |
|---|---|---|
| **Zenoti** | Cuando una valoración no termina en paquete, se le asigna **una fecha y una persona** para volver a llamar; aviso cuando toca. Mide la conversión de consultas por empleado y por sede | El corazón del plan: `proximo_contacto` + `responsable`, y la lista "Para hoy". Tasa de cierre por vendedor y sede |
| **Fresha** | Campañas de un solo envío con **grupos de clientes predefinidos** ("compró X y no volvió en 3 meses") o reglas propias; tipo "oferta" ligado a una promoción; los segmentos se pueden mostrar como **etiqueta en la ficha** | Campañas en 3 pasos con grupos listos; campaña ligada a una promoción; etiquetas automáticas en la ficha del paciente |
| **Pabau** | **Recall por tratamiento** (inyectables a los 90 días, rellenos a los 6 meses); etiquetas tipo VIP | Ya está en el plan de seguimiento (M4 mantenimiento por servicio); se refuerza con la etiqueta en la ficha |
| **Mangomint** | Flujos automáticos para volver a agendar, bienvenida y clientes perdidos | Solo como **interruptores** con texto editable (cumpleaños, mantenimiento), nunca como constructor de flujos. Fase posterior |
| **Kommo** (CRM de WhatsApp muy usado en Latinoamérica) | Tablero de columnas por etapa, motivo de pérdida, etiquetas por tratamiento | El tablero existe como vista secundaria. Motivo de pérdida con 5 opciones de un toque |
| **Clientify** (comparativa del sector) | Lo esencial es: seguimiento de presupuestos abiertos, **origen del paciente**, recordatorios y campañas **medibles** | Origen con un toque al crear el interesado y la pregunta "¿Cómo nos conociste?" en el autorregistro. Cada campaña muestra cuánto vendió |

Qué **no** se adopta, porque complica sin servir a una clínica pequeña:
etapas o campos configurables, puntuación de leads, asignación automática por
habilidad, recepcionista con IA, constructor de flujos, email marketing,
programas de puntos y tarjetas regalo, y bandeja de chat propia (las
respuestas siguen en el WhatsApp de la clínica).

## El embudo

```
Nuevo → Valoración → Cotizado → Ganado (venta) → En tratamiento → Mantenimiento
└──────── adquisición (este plan) ───────┘      └──── retención (plan de seguimiento) ────┘
```

| Etapa | Entra cuando… | Cómo avanza |
|---|---|---|
| **Nuevo** | la recepción registra a alguien interesado (WhatsApp, Instagram, referido, campaña, llamada, visita) | Manual, 3 datos |
| **Valoración** | se agenda una cita para la oportunidad | Automático al crear la cita |
| **Cotizado** | se envía una cotización de la oportunidad | Automático con `CotizacionEnvio` |
| **Ganado** | la cotización se acepta (manual o por firma del compromiso de pago) | Automático en `aceptar_cotizacion` |
| **Perdido** | la recepción lo cierra con un motivo (precio, eligió otra clínica, no responde, lo pensará después, otro) | Manual, un toque |

Se quitó la etapa "Contactado" de la versión anterior: lo que dice ya se ve
en el historial de gestiones, y obligaba a mover tarjetas sin aportar nada.

Las etapas se pueden saltar: un paciente que llega a la sede y sale con la
cotización aceptada pasa de Nuevo a Ganado sin detenerse en las demás. La
etapa nunca retrocede sola; la recepción puede moverla a mano.

"Lo pensará después" no es una pérdida: el diálogo de cierre lo ofrece como
**"Volver a llamar el…"** con la fecha, y la oportunidad sigue abierta.

## Navegación

El grupo del menú que hoy se llama **Ventas** pasa a **Comercial**:

Cuatro entradas, en el orden en que se usan:

| Entrada | Ruta | Qué muestra |
|---|---|---|
| **Seguimiento** | `/seguimiento` | **La pantalla principal.** Pestaña **Para hoy** (lista de a quién llamar: interesados, cotizaciones sin respuesta, sesiones pendientes, no asistió) y pestaña **Embudo** (tablero Nuevo / Valoración / Cotizado con totales por columna). Botón grande **+ Nuevo interesado** |
| **Cotizaciones** | `/cotizaciones` | Solo propuestas: abiertas (con chip "Enviada" si ya salió al paciente), vencidas, descartadas. Las ganadas se ven en una pestaña "Convertidas" que enlaza a la venta |
| **Ventas** | `/ventas` | Cotizaciones aceptadas vistas como contrato: total, saldo, sesiones usadas de las vendidas, vendedor, consentimientos, estado de la cartera |
| **Campañas** | `/campanas` | Envíos de marketing por WhatsApp (ver [Campañas de marketing](#campañas-de-marketing-por-whatsapp)). Solo con el addon de número propio; sin él, una página que explica el addon |

Ya no hay una entrada "Oportunidades" aparte: el embudo es una pestaña de
Seguimiento. "Oportunidad" queda como nombre interno del modelo; en pantalla
se habla de **interesados** y de **seguimiento**.

**Catálogo** y las **promociones** (la `Campana` de descuentos que hoy está en
`/configuracion/campanas`) quedan al final del grupo o pasan a Configuración;
ver D-F7 sobre el nombre.

**Finanzas** no cambia: Resultados, Ingresos, Cartera.

### Cotizaciones vs ventas en el front

- `/ventas/[id]` es el detalle de una cotización aceptada. Reúne lo que hoy
  está en los paneles de `CotizacionForm` cuando la cotización está aceptada:
  ítems (solo lectura), cartera y cuotas, cobros, sesiones agendadas y
  restantes, consentimientos, acuerdos de pago, historial de envíos.
- `/cotizaciones/[id]` de una cotización aceptada **redirige** a
  `/ventas/[id]`, así no se rompe ningún enlace guardado ni los links que hoy
  apuntan a la cotización (cartera, cobros, ficha del paciente).
- Al aceptar una cotización, la pantalla salta a la venta.
- El id es el mismo: *"Venta #123 · de la cotización #123"*. No hay
  numeración nueva.
- Implementado (2026-10-08): `/ventas/[id]` usa el mismo `CotizacionForm` con
  `vista="venta"` (título "Venta", regreso a `/ventas`). Partir el archivo en
  propuesta y post-venta queda como refactor aparte, sin cambio de
  comportamiento, para no arriesgar la fase 1.

## Modelo de datos

### Sin modelo nuevo de venta

Una venta sigue siendo `Cotizacion` con `estado = aceptada` + su `Cartera`.
No se crea un modelo `Venta`: duplicaría la fuente de verdad y obligaría a
migrar datos. La separación es de **producto** (rutas, nombres, KPI), no de
tablas.

### Campos nuevos en `Cotizacion`

Todos opcionales o con default que conserva el comportamiento actual:

| Campo | Tipo | Nota |
|---|---|---|
| `aceptada_en` | datetime, null | Se llena en `aceptar_cotizacion` y en `aceptar_cotizacion_por_firma_compromiso`. Backfill: ver abajo |
| `aceptada_por` | FK User, null | Quién la aceptó en la app (nulo si fue por firma) |
| `descartada_en` | datetime, null | |
| `motivo_descarte` | choices, blank | `precio`, `otra_clinica`, `no_responde`, `no_candidato`, `otro`. Cinco opciones de un toque. "Lo pensará después" no es descarte: ofrece "Volver a llamar el…" |
| `nota_descarte` | text, blank | |
| `oportunidad` | FK Oportunidad, null | Las cotizaciones actuales quedan sin oportunidad y funcionan igual |

**Backfill de `aceptada_en`** (única migración de datos del plan, solo llena
un campo nuevo, no cambia ninguno existente): `Cartera.created_at` de la
cartera de la cotización, y si no tiene, `Cotizacion.updated_at`. Las
migradas (`es_migracion`) usan su `created_at`. Se acepta que el dato
histórico sea aproximado; desde el deploy es exacto.

### "Vencida" derivada; "enviada" es una marca, no un estado

Para no cambiar el significado del campo `estado` ni migrar datos:

- **Enviada** (decisión 2026-10-08) **no es un estado**: la cotización sigue en
  **borrador** y lleva la marca `enviada` / `enviada_en` (fecha del primer
  `CotizacionEnvio`: WhatsApp, correo o PDF descargado desde el modal de
  envío). En pantalla es un chip "Enviada 8 oct" junto al badge. Filtro
  aparte: `?enviada=true|false`. Una enviada se puede seguir editando.
- `estado_comercial` en el serializer: `borrador`, `vencida`, `aceptada`,
  `descartada`; también filtro de la lista.
- **Vencida** = `borrador` con `fecha_vencimiento < hoy`. Se calcula, no se
  guarda. El valor `vencida` de `Estado` se deja como está (sin uso), para no
  tocar datos.
- **Aceptar una vencida** se permite con confirmación: *"Esta cotización venció
  el 3 de octubre. ¿Aceptarla igual o renovarla?"*. **Renovar** reinicia la
  vigencia (nuevo campo `vigente_desde`, date, null; si es null se usa
  `created_at` como hoy).

Así M2 del plan de seguimiento ("cotización enviada y no aceptada") se lee
igual que antes y "vencida" deja de ser una opción muerta.

### `Oportunidad` (compartida con el seguimiento)

Un solo modelo para adquisición y retención (decisión D-F2, confirmada). El
modelo de [plan-seguimiento-retencion.md](plan-seguimiento-retencion.md#oportunidad)
se amplía así:

| Campo | Tipo | Nota |
|---|---|---|
| `tipo` | choices | `nueva` (adquisición), `recompra` (paciente que ya compró y vuelve a comprar), `reactivacion` (inactivo), `paquete` (completar sesiones ya vendidas: M1, M3) |
| `motivo` | choices | Los del seguimiento (`sesiones_pendientes`, `cotizacion_abierta`, `no_asistio`, `mantenimiento`, `inactivo`, `cumpleanos`) + **`manual`** (la creó la recepción) y **`campana`** (respondió a una campaña) |
| `etapa` | choices, null | Solo para `nueva`, `recompra`, `reactivacion`: `nuevo`, `valoracion`, `cotizado`. Null en `paquete` |
| `estado` | choices | `abierta`, `ganada`, `perdida`, `resuelta_sola`. En tipo `paquete` "ganada" se muestra como **recuperada** |
| `proximo_contacto` | date, null | **La única fecha que ve el usuario.** Si es hoy o ya pasó, la oportunidad abierta aparece en "Para hoy". Reemplaza a `en_espera_hasta` y `pospuesta_hasta` y a los estados `en_espera` y `pospuesta` de la versión anterior: tras un envío automático se pone en hoy + 5 días; posponer es cambiarla. Al crear una manual, por defecto hoy |
| `paciente` | FK Paciente, **null** | Null mientras es solo un interesado |
| `contacto_nombre` / `contacto_telefono` | char | Para interesados sin ficha. Al vincular el paciente se conservan como dato original |
| `origen` | choices, blank | `whatsapp`, `instagram`, `facebook`, `tiktok`, `google`, `referido`, `visita`, `llamada`, `campana`, `otro` |
| `origen_detalle` | char, blank | Quién lo refirió, qué anuncio |
| `campana_marketing` | FK, null | Si llegó por una campaña de WhatsApp |
| `responsable` | FK User, null | Opcional. Por defecto quien la crea. Resuelve D5 del plan de seguimiento. "Para hoy" tiene el filtro **Mías / Todas** |
| `interes` | char, blank | Texto libre corto: "depilación axilas, bótox". Sin selector de catálogo para no frenar el registro; la cotización ya trae el detalle |
| `valor_estimado` | decimal, null | Manual en `nueva`; el total de la cotización cuando la hay; el `valor_en_juego` del seguimiento en `paquete` |
| `motivo_perdida` / `nota_perdida` | choices / text | Mismas opciones que `motivo_descarte` de la cotización |
| `cerrada_en` / `cerrada_por` | datetime / FK User, null | |

El resto de campos del plan de seguimiento (`clave`, `detalle`,
`item_cotizacion`, `cotizacion`, `cita`) se mantienen; `en_espera_hasta` y
`pospuesta_hasta` se reemplazan por `proximo_contacto`. `clave` sigue siendo
única por clínica y solo se llena en las que crea la detección; las manuales
la dejan null (constraint condicional).

`GestionOportunidad` no cambia: es el historial de contactos para los dos
tipos.

### Interesado sin ficha → paciente

Decisión D-F1, confirmada: el interesado se registra solo con nombre y
teléfono, sin crear `Paciente`.

**Formulario "+ Nuevo interesado"** (un modal, se llena en menos de 20
segundos):

1. Nombre.
2. Teléfono (si ya es paciente, avisa *"Ya es paciente: Ana Gómez"* y lo
   vincula).
3. ¿Qué le interesa? (texto corto).
4. ¿Cómo llegó? Chips de un toque: WhatsApp, Instagram, Facebook, TikTok,
   Google, Referido, Pasó por la sede, Otro. Opcional.

Valor estimado, responsable y fecha de próximo contacto quedan con su valor
por defecto y se ven en "Más opciones". Al guardar, ofrece **Agendar
valoración** o **Enviar WhatsApp** (`wa.me`) en el mismo paso.

- Al crear una oportunidad con teléfono, se busca un `Paciente` de la clínica
  con ese teléfono. Si existe, se vincula y el tipo pasa a `recompra` (o
  `reactivacion` si está inactivo).
- **Al agendar la valoración** se pide completar la ficha mínima, porque `Cita`
  exige `paciente` y `Paciente` exige documento, fecha de nacimiento y sexo.
  El modal de nueva cita, abierto desde la oportunidad, trae nombre y teléfono
  precargados y pide el resto. Ver D-F6 si la recepción no tiene esos datos al
  llamar.
- **Crear una cotización** desde la oportunidad también exige el paciente (la
  cotización ya lo exige hoy).
- Los interesados que nunca llegan a valoración no ensucian la base de
  pacientes, y tampoco cuentan en el plan ni en los límites de pacientes.

### Avance automático de etapa

Ganchos al final de servicios existentes, envueltos en `try/except` + log,
como el cierre del seguimiento. **Un error del embudo nunca impide agendar,
enviar ni aceptar una cotización.**

| Evento | Dónde | Efecto |
|---|---|---|
| Gestión registrada | `GestionOportunidad` | Mueve `proximo_contacto` según el resultado (sin respuesta → mañana; interesado → en 2 días; agendó → se cierra sola con la cita). La recepción puede cambiar la fecha en el mismo diálogo |
| Cita creada para el paciente de una oportunidad abierta de venta | servicio de creación de cita | `→ valoracion` |
| `CotizacionEnvio` creado | servicio de envío | `→ cotizada`; si la cotización no tenía oportunidad y el paciente tiene una abierta, se vinculan |
| Cotización aceptada | `aceptar_cotizacion`, `aceptar_cotizacion_por_firma_compromiso` | `estado = ganada` |
| Cotización descartada | `cambiar_estado` | Si es la única cotización abierta de la oportunidad: pregunta en el front si cerrar la oportunidad como perdida (con el mismo motivo) |

Si se crea una cotización para un paciente **sin** oportunidad abierta, no se
crea una oportunidad (no se fuerza el embudo a quien no lo usa). Cuenta igual
en los KPI de cotizaciones y ventas.

## Bandeja unificada

`/seguimiento` es la única pantalla de trabajo. La pestaña **Para hoy** es
una sola lista con todas las oportunidades abiertas cuyo `proximo_contacto`
es hoy o ya pasó, de cualquier tipo, ordenadas por valor:

- Cada fila dice en una frase por qué está ahí: *"Nuevo · le interesa
  depilación · llegó por Instagram hace 2 días"*, *"Cotización $2.400.000 sin
  respuesta hace 5 días"*, *"Sesión 3 de 6 de axilas sin agendar"*.
- Tres acciones visibles: **WhatsApp**, **Agendar**, **Ya lo llamé** (abre el
  diálogo de gestión: resultado de un toque y nueva fecha sugerida). Lo demás
  (posponer, cerrar como perdido, cambiar responsable) va en el menú de la
  fila.
- Filtros mínimos: **Mías / Todas** y sede. Los chips por motivo se muestran
  solo si hay más de 20 filas.
- Cuando la lista queda vacía: *"Listo por hoy"*.
- M2 "cotización enviada y no aceptada" se fusiona: si la cotización tiene
  oportunidad, se actualiza esa oportunidad en vez de crear otra.
- La métrica del plan de seguimiento pasa a **"Ganado y recuperado este mes"**:
  ventas ganadas desde una oportunidad (ingreso nuevo) + sesiones recuperadas
  (ya cobradas), mostradas por separado.

La pestaña **Embudo** muestra todas las oportunidades de venta abiertas en
tres columnas (Nuevo, Valoración, Cotizado), con la cantidad y el valor de
cada columna. Se pueden arrastrar entre columnas, pero no hace falta: avanzan
solas. Abajo, los cerrados del mes (ganados y perdidos con su motivo). Es para
mirar, no para trabajar.

**Etiquetas en la ficha del paciente** (idea de Fresha y Pabau): chips
calculados, sin configurar nada: *Cotización abierta*, *Paquete en curso 3/6*,
*Le toca mantenimiento*, *Inactiva 8 meses*, *No recibe promociones*. Se ven
también en la agenda al pasar el mouse por la cita, para que la recepción
aproveche la visita.

## Campañas de marketing por WhatsApp

Decisión D-F8, confirmada: **los envíos de marketing van incluidos en el
addon de WhatsApp con número propio**, con plantillas que la clínica crea
desde CliniQ en un editor parecido al de Meta.

### Lo que ya existe

| Pieza | Dónde | Uso |
|---|---|---|
| `lyvio.crear_plantilla(inbox_id, payload)` | `notificaciones/lyvio.py:113` | Crea **cualquier** plantilla en la WABA del número (recibe el payload de Meta tal cual). Hoy solo la usa el catálogo fijo |
| `lyvio.sincronizar_plantillas` / `listar_plantillas` | `lyvio.py:119`, `:124` | Traer estado de aprobación desde Meta |
| `PlantillaWhatsappNumero` | `notificaciones/models.py:176` | Estado por número (`PENDING`, `APPROVED`, `REJECTED`, `PAUSED`...) y categoría que asignó Meta |
| `numero_propio.crear_plantillas` / `actualizar_plantillas` | `numero_propio.py:605`, `:665` | Patrón de creación y sincronización, hoy solo para el `CATALOGO` |
| `enviar_whatsapp` / `resolver_ruta_whatsapp` / `elegir_numero` | `services.py:288`, `:262`, `numero_propio.py:794` | Punto único de envío; ya maneja límites de Meta por número (`limite_mensajes`, `bloqueo`) |
| `EnvioWhatsApp` | `models.py:240` | Registro de cada envío |
| Error de Meta 131050 ("pidió no recibir marketing") | `numero_propio.py:1143` | Ya se traduce; se usará para marcar la baja |
| Flags del addon | `Plan.whatsapp_numero_propio_habilitado` + overrides de `Clinica` | Gating. No se agrega flag nuevo (D-F8) |

Lo que **no** existe: plantillas definidas por la clínica (el catálogo es fijo
en código, solo `UTILITY`, solo encabezado de documento y cuerpo), editor,
envío masivo, segmentación, autorización de marketing ni manejo de bajas.

### Nombre: Promociones vs Campañas

`Campana` hoy es una **promoción de precios** (`clinicas/models.py:550`:
fechas, sedes y precio especial por servicio o tratamiento, aplicada en
`ItemCotizacion.campana`). Para no tener dos "campañas" (D-F7):

- En la interfaz, la `Campana` actual pasa a llamarse **Promoción** (el modelo
  y la API no cambian).
- **Campaña** queda para los envíos de WhatsApp. Una campaña puede llevar una
  promoción ligada (*"20% en axilas hasta el 31"*), y así las ventas con
  precio de esa promoción se atribuyen a la campaña.

### Crear una campaña: 3 pasos

`/campanas` → **Nueva campaña**. Un asistente con tres pasos y nada más (la
forma en que lo hace Fresha):

**1. ¿A quién?** Tarjetas con **grupos listos**, cada una con la cantidad de
pacientes que podrían recibirla:

- Todos los que aceptan promociones
- Cumplen años este mes
- No vienen hace más de 6 meses
- Terminaron su paquete
- Les toca mantenimiento
- Tienen una cotización sin cerrar
- Compraron… (elige un servicio o tratamiento)

Debajo, "Afinar" (opcional, cerrado por defecto): sede, sexo y rango de edad.
Nada más. Si la clínica tiene varias sedes, la sede viene preseleccionada con
la del usuario.

**2. ¿Qué mensaje?** Elegir una plantilla ya aprobada, o **empezar desde un
ejemplo**: *Promoción del mes*, *Feliz cumpleaños*, *Te extrañamos*, *Es hora
de tu mantenimiento*. El ejemplo abre el editor (abajo) con el texto escrito y
las variables puestas; la clínica solo cambia lo que quiera y lo envía a
aprobación. Mientras Meta revisa, la campaña queda guardada y la app avisa
cuando se puede enviar. Opcional: ligar una promoción.

**3. ¿Cuándo?** Ahora o en una fecha y hora. Antes de confirmar, un resumen en
lenguaje simple:

> Se enviará a **312 pacientes**. 48 no la recibirán porque no aceptan
> promociones y 5 porque no tienen un teléfono válido. WhatsApp le cobra a tu
> clínica aproximadamente **$X** por estos mensajes.

Con una muestra del mensaje ya armado para un paciente real.

Después del envío, la campaña muestra solo cuatro números: **enviados**,
**no se pudieron enviar**, **se dieron de baja** y **vendido gracias a esta
campaña** (con la lista de ventas y citas atribuidas).

**Campañas automáticas** (fase posterior, idea de Mangomint pero sin
constructor de flujos): en Configuración → Campañas, interruptores con el
texto editable al lado: *Felicitar en el cumpleaños*, *Avisar cuando le toca
mantenimiento*. Cada uno usa su plantilla y respeta la autorización.

### Editor de plantillas

Se abre desde el paso 2 (o desde `/campanas/plantillas` para verlas todas). Es
parecido al administrador de plantillas de Meta, pero esconde lo técnico:
categoría, idioma y nombre técnico van con valor por defecto en "Opciones
avanzadas".

- **Categoría**: marketing (por defecto) o utilidad. Aviso de que Meta puede
  reclasificar una de utilidad como marketing (ya se avisa en la consola).
- **Idioma**: `es_CO` por defecto, como el catálogo.
- **Nombre**: se genera del título (`promo_axilas_oct_v1`); la clínica ve el
  título, no el nombre técnico.
- **Encabezado** (opcional): texto, imagen, video o documento. La clínica
  sube el archivo de ejemplo en el editor. Se crea igual que el encabezado de
  documento del catálogo, que ya funciona con Lyvio; imagen y video se asumen
  iguales y se validan con la primera plantilla de cada tipo.
- **Cuerpo** con variables insertables desde un menú, no escritas a mano:
  nombre del paciente, nombre de la clínica, sede, tratamiento, fecha de fin
  de la promoción, link. Cada variable lleva su valor de ejemplo, que Meta
  exige para aprobar.
- **Pie** (opcional). En las de marketing, el editor agrega al final del
  cuerpo la línea fija de baja: *"Para no recibir más promociones: {{link
  de preferencias}}"* (ver [Autorización de marketing](#autorización-de-marketing)).
  No se puede quitar.
- **Sin botones** (decisión D-F13, confirmada). Lyvio no los soporta. Los
  links van como texto en el cuerpo.
- **Vista previa** tipo celular a la derecha, que se actualiza al escribir, con
  los contadores de límites de Meta (1.024 caracteres en el cuerpo, 60 en
  encabezado y pie).
- **Enviar a aprobación**: crea la plantilla en **cada número** de la clínica
  (o en los elegidos, D-F10) con `lyvio.crear_plantilla`, y la deja en
  `PENDING`. El estado se refresca con la sincronización existente y con un
  botón "Actualizar estado".
- **Editar** una aprobada crea una versión nueva (`_v2`), como ya se hace con el
  catálogo. La anterior queda para el historial.
- Si Meta la rechaza, se muestra el motivo (`ultimo_error`) y se puede
  corregir y reenviar como versión nueva.

Modelo nuevo `PlantillaPersonalizada` (definición, por clínica): `titulo`,
`nombre_base`, `version`, `categoria`, `idioma`, `componentes` (JSON con el
formato de Meta), `variables` (mapa `{{1}} → clave de contexto`),
`creada_por`, `archivada`. El estado por número sigue en
`PlantillaWhatsappNumero`, con una FK nueva nullable `personalizada` y un
`tipo` nuevo `PERSONALIZADA`. Las del catálogo no cambian.

**Limitaciones de Lyvio** (confirmadas 2026-10-07):

1. Encabezado con imagen o video: se asume que funciona igual que el de
   documento, que ya se usa.
2. **No se pueden borrar plantillas en Meta.** "Archivar" solo las oculta en
   CliniQ; siguen existiendo en la WABA. El editor lo avisa al archivar.
3. **No hay botones** ni lectura de respuestas. Todo lo que necesite una
   acción del paciente va por un **link** en el cuerpo del mensaje.

### Autorización de marketing

Resuelve la D6 del plan de seguimiento. Los mensajes de marketing piden
autorización explícita (Ley 1581 en Colombia; Meta también la exige para
marketing). `autoriza_datos` no alcanza.

- Campos nuevos en `Paciente`: `autoriza_marketing` (bool, default `False`),
  `autoriza_marketing_en` (datetime, null), `autoriza_marketing_origen`
  (`ficha`, `autorregistro`, `enlace`, `importacion`),
  `baja_marketing_en` (datetime, null).
- Se captura en la ficha del paciente, en el formulario de autorregistro (casilla
  aparte, nunca premarcada) y en la importación masiva (columna opcional).
- **Página pública de preferencias** `/preferencias/[token]`, sin login, igual
  de liviana que `/agendar/[token]`: logo de la clínica, nombre de pila y una
  sola pregunta, *"¿Quieres recibir promociones de <clínica> por WhatsApp?"*,
  con **Sí** y **No**. Guarda la respuesta con fecha y origen `enlace`. Token
  largo por paciente (modelo nuevo `EnlacePreferencias`: `paciente`, `token`,
  `creado_en`), reutilizable, sin vencimiento, con rate limit; no muestra
  datos personales.
- La **baja** llega por esa página (el link va en cada mensaje de marketing),
  por el error 131050 de Meta, o a mano en la ficha cuando el paciente lo pide
  por WhatsApp a la recepción. Una baja nunca se revierte sola: solo el
  paciente puede volver a autorizar desde la página.
- **Los pacientes actuales empiezan sin autorización**: no se puede suponer.
  Para que la clínica pueda arrancar, el addon trae una plantilla de utilidad
  de **solicitud de autorización** (*"Hola <nombre>, en <clínica> queremos
  contarte nuestras promociones. Si quieres recibirlas, autorízalo aquí:
  <link>"*), que solo se puede mandar una vez por paciente. Ver D-F9; validar
  con un abogado. El link de preferencias también se puede copiar para
  `wa.me` o mostrar en un QR en la recepción.
- Las campañas **solo** llegan a pacientes con `autoriza_marketing = True`,
  sin baja, con teléfono válido y sin `no_contactar_seguimiento`.

### Campañas

Modelo nuevo `CampanaMarketing`:

| Campo | Tipo | Nota |
|---|---|---|
| `clinica` | FK | |
| `nombre` | char | |
| `plantilla` | FK PlantillaPersonalizada | Solo plantillas aprobadas en al menos un número |
| `promocion` | FK Campana (promoción), null | Para atribuir ventas |
| `grupo` | choices | El grupo listo elegido en el paso 1 (`todos`, `cumpleanos_mes`, `inactivos`, `paquete_terminado`, `mantenimiento`, `cotizacion_abierta`, `compraron`) |
| `filtros` | JSON | Parámetros del grupo y del "Afinar" (servicio, sede, sexo, edad); se guardan para poder repetir la campaña |
| `variables_fijas` | JSON | Valores de las variables que no salen del paciente (link, fecha de fin) |
| `estado` | choices | `borrador`, `programada`, `enviando`, `pausada`, `terminada`, `cancelada` |
| `programada_para` | datetime, null | |
| `creada_por` | FK User | |
| contadores | int | `destinatarios`, `enviados`, `fallidos`, `bajas`. `entregados` y `leidos` solo si el webhook de Lyvio ya reporta esos estados (revisar al implementar) |

`DestinatarioCampana`: `campana`, `paciente`, `estado` (`pendiente`,
`enviado`, `fallido`, `excluido`), `envio_whatsapp` (FK), `motivo_exclusion`.
Se congela al programar: quien cambie de segmento después no entra ni sale.

Los grupos se calculan con datos que ya existen (citas, ítems de cotización,
`fecha_nacimiento`, la detección del seguimiento para mantenimiento). No hay
constructor de reglas con "y/o": si un caso no entra en los grupos, se agrega
un grupo nuevo en código. El costo estimado es informativo (cantidad × tarifa
de marketing de Colombia); la clínica le paga a Meta directamente.

**Envío**: no hay Celery. Un endpoint protegido con `_n8n_secret_ok`, llamado
por un workflow **nuevo** de n8n cada pocos minutos, toma lotes de las
campañas en `enviando` y envía cada mensaje por `enviar_whatsapp` (tipo nuevo
`MARKETING`, solo ruta propia, nunca el número compartido). El lote respeta el
`limite_mensajes` diario del número y se detiene si el número pasa a
`bloqueo`; lo que no salió hoy sigue mañana. Horario de envío configurable
(por defecto 9:00–19:00 de la clínica).

**Respuestas**: llegan al WhatsApp de la clínica (Lyvio), igual que en el
seguimiento (D11); la app no las lee. Cuando alguien responde con interés, la
recepción la registra con **+ Nuevo interesado** (el teléfono lo vincula al
paciente y la campaña reciente se propone sola como origen) o desde la ficha
del paciente, donde se ve "Recibió la campaña X hace 2 días" con el botón
"Agregar a seguimiento". Queda como `Oportunidad` con `motivo = campana`. Si la plantilla lleva el link de agendamiento o un link de la
clínica, ese es el camino sin intervención.

**Atribución**: una venta (`aceptada_en`) o una cita del destinatario dentro de
14 días desde el envío, o una venta con precio de la promoción ligada, cuenta
como resultado de la campaña. Mismo criterio que el seguimiento.

## KPI del dashboard

Hoy la única tarjeta comercial es "Ventas" (`dashboard/page.tsx:933`, de
`CotizacionesReporteView`, `reportes/views.py:341`). Mezcla métricas de
cotización con valor vendido y tiene estos problemas:

| Problema | Dónde |
|---|---|
| "Cotizadas" cuenta todas las cotizaciones creadas en el período, incluidas aceptadas y descartadas | `views.py:365` |
| "Aceptadas" son las **creadas** en el período que hoy están aceptadas, no las aceptadas en el período | `views.py:366` |
| "Vendido" usa `Cartera.created_at`; en la misma tarjeta "Aceptadas 3" puede convivir con "4 ventas" | `views.py:372-387` |
| `Cartera.created_at` no es la fecha de aceptación cuando la cartera ya existía (`get_or_create`) o vino de `backfill_carteras` | `cotizaciones/services.py:91-97` |
| "Conversión" es por cohorte de creación: los meses recientes siempre se ven peor | `views.py:370` |
| Las cotizaciones migradas (`es_migracion`) inflan Cotizadas, Aceptadas y Conversión; "Vendido" sí las excluye | `views.py:365` vs `:375` |
| "Pacientes sin reagendar" usa `cotizacion.created_at` como fecha de compra | `views.py:498` |
| Estadísticas de promociones cuentan aceptadas sin filtro de fecha | `clinicas/campana_stats.py:23-42` |

### Reglas nuevas

1. **Una sola fecha de venta**: `Cotizacion.aceptada_en`. Todo lo que diga
   "venta" o "vendido" filtra por ella. Una sola fuente: cotización
   `aceptada`, `activo`, **sin** `es_migracion`, con valor = total de su
   cartera (igual que hoy).
2. **Migradas fuera en todos lados**: ni cotizaciones ni ventas cuentan
   `es_migracion`.
3. **Cada métrica dice su fecha**: creadas por `created_at`, enviadas por el
   primer `CotizacionEnvio`, perdidas por `descartada_en`, vencidas por
   `fecha_vencimiento`, vendidas por `aceptada_en`.
4. **Vendedor** sigue siendo `Cotizacion.profesional`. El responsable de la
   oportunidad es otra cosa y tiene su propio filtro en `/seguimiento`.

### Tarjetas

La tarjeta "Ventas" se separa en dos:

**Cotizaciones** (período):

- **Creadas**: cantidad y valor.
- **Enviadas**: con primer envío en el período.
- **Abiertas hoy**: foto actual, no del período (borrador no vencida),
  cantidad y valor. Enlaza a `/cotizaciones?estado=abiertas`.
- **Perdidas**: descartadas + vencidas en el período, con el motivo principal.

**Ventas** (período):

- **Vendido**: valor y cantidad por `aceptada_en`; ticket promedio.
- **Tasa de cierre** (solo con permiso de finanzas): ganadas ÷ (ganadas +
  perdidas + vencidas), **todas decididas en el período**. Reemplaza
  "Conversión". No castiga los meses recientes porque solo cuenta lo que ya se
  decidió. La conversión por cohorte se puede ver en el detalle de
  la pestaña Embudo de `/seguimiento`, no en el dashboard.
- **Tiempo promedio de cierre**: días entre `created_at` y `aceptada_en`.

**Embudo** (fase 2, solo si la clínica tiene oportunidades): cantidad por
etapa, conversión etapa a etapa y ventas por origen.

**Seguimiento** (plan de seguimiento): "Para contactar hoy" y "Ganado y
recuperado este mes".

**Campañas** (fase 3): en la pantalla de cada campaña, no en el dashboard:
enviados, entregados, leídos, bajas, ventas y citas atribuidas.

Además:

- **Pacientes sin reagendar** usa `aceptada_en` en lugar de `created_at`.
- **Estadísticas de promociones** aceptan rango de fechas por `aceptada_en`.
- **Cartera** no cambia (es una foto del saldo, sin período).

### Compatibilidad del reporte

Endpoint nuevo `GET /api/reportes/comercial/` con las métricas nuevas. El
actual `/reportes/cotizaciones/` no se cambia hasta que el front nuevo esté
desplegado, y luego se marca obsoleto. Prueba de consistencia: el "Vendido"
de un mes es igual a la suma de `/ventas` filtrada por ese mes, y a la de
`reportes/comercial` por vendedor sumado.

## API

| Método | Ruta | Permiso | Uso |
|---|---|---|---|
| GET | `/api/ventas/` | `cotizaciones.ver` | Lista de aceptadas con saldo, sesiones usadas/vendidas, vendedor, estado de cartera. Filtros: `aceptada_desde/hasta`, `sede`, `vendedor`, `con_mora`, `q` |
| — | `/api/ventas/{id}/` | — | No existe: el detalle de una venta es `/api/cotizaciones/{id}/` y sus acciones |
| GET | `/api/cotizaciones/?estado_comercial=` | existente | Filtro nuevo; `estado` sigue funcionando |
| POST | `/api/cotizaciones/{id}/cambiar_estado/` | existente | Acepta `motivo_descarte` y `nota_descarte` al descartar; `confirmar_vencida` al aceptar una vencida |
| POST | `/api/cotizaciones/{id}/renovar/` | `cotizaciones.gestionar` | Reinicia la vigencia |
| GET/POST | `/api/seguimiento/oportunidades/` | `seguimiento.oportunidades.ver` / `.gestionar` | Lista ("Para hoy" con `para_hoy=1`, filtros `mias`, `sede`, `etapa`, `tipo`) y alta de un interesado |
| PATCH | `/api/seguimiento/oportunidades/{id}/` | `seguimiento.oportunidades.gestionar` | Etapa, responsable, origen, interés, valor, `proximo_contacto` |
| POST | `/api/seguimiento/oportunidades/{id}/vincular_paciente/` | `seguimiento.oportunidades.gestionar` | Paciente existente o creado en el modal |
| POST | `/api/seguimiento/oportunidades/{id}/perder/` | `seguimiento.oportunidades.gestionar` | `{motivo, nota}` |
| GET | `/api/seguimiento/embudo/` | `seguimiento.oportunidades.ver` | Cantidad y valor por etapa, cerrados del mes por motivo y por origen |
| CRUD | `/api/campanas/plantillas/` | `comercial.plantillas.gestionar` | Editor; `POST {id}/enviar_aprobacion/`, `POST {id}/actualizar_estado/` |
| CRUD | `/api/campanas/` | `comercial.campanas.gestionar` | `GET grupos/` (grupos listos con su cantidad), `POST audiencia/` (resumen de destinatarios y exclusiones), `POST {id}/programar/`, `pausar/`, `cancelar/`, `GET {id}/metricas/` |
| POST | `/api/campanas/procesar/` | secreto de n8n | Envía el siguiente lote |
| GET/POST | `/api/public/preferencias/<token>/` | público, rate limit | Ver y guardar la autorización de marketing (`{autoriza: true/false}`) |
| POST | `/api/pacientes/{id}/enlace_preferencias/` | `pacientes.editar` | Obtener el link para `wa.me` o QR |
| GET | `/api/reportes/comercial/` | `reportes.ver_financieros` | KPI nuevos (mismo permiso que `/reportes/cotizaciones/`) |

Las oportunidades usan una sola API, la de `/api/seguimiento/` (gestiones,
WhatsApp, link de agendamiento y detección están en el plan de seguimiento).

**Permisos**: **Ventas usa los permisos de cotizaciones** (`cotizaciones.ver`,
`cotizaciones.gestionar`), así nadie pierde acceso a lo que hoy ve. Los
permisos nuevos (`seguimiento.oportunidades.*` del plan de seguimiento,
`comercial.plantillas.gestionar`, `comercial.campanas.gestionar`) los tiene el admin por su rol y no se agregan
solos a roles personalizados, igual que en el plan de seguimiento.

## Compatibilidad con las clínicas actuales

| Riesgo | Cómo se evita |
|---|---|
| Que se pierda acceso a ventas | `/ventas` usa los permisos de cotizaciones; `/cotizaciones/[id]` de una aceptada redirige |
| Enlaces viejos rotos | Mismo id; redirección en el front |
| Cambiar el significado de `estado` | "Enviada" y "vencida" son derivadas; `estado` no cambia ni se migra |
| Migraciones de datos | Solo `AddField` nullable/default y `CreateModel`. Única excepción: backfill de `aceptada_en` (llena un campo nuevo) |
| Que aceptar o enviar falle por el embudo | Ganchos al final con `try/except` + log |
| KPI que cambian de golpe | El dashboard nuevo explica en un tooltip qué mide cada número; el endpoint viejo se mantiene un ciclo |
| Mensajes no esperados | Campañas solo a pacientes con autorización explícita; los actuales arrancan sin ella; nada se envía sin que alguien programe la campaña |
| Plantillas aprobadas en uso | El catálogo no cambia; las personalizadas son filas nuevas |
| n8n de producción | La cola de campañas es un workflow **nuevo**; no se tocan ramas en uso |

Proceso igual al de los otros planes: rama local (este worktree), todo
probado en Docker local, sin push ni cambios en n8n de producción hasta que se
pida; suite completa de backend.

## Fases

1. **Cotizaciones y ventas** (sin dependencias, menor riesgo):
   - `aceptada_en` + backfill, `aceptada_por`, `descartada_en`, motivo de
     descarte, `vigente_desde`;
   - `estado_comercial` derivado (vencida) y marca `enviada`, aceptar vencida con
     confirmación, renovar;
   - `/ventas` y `/ventas/[id]`, redirección desde `/cotizaciones/[id]`
     (partir `CotizacionForm` queda como refactor aparte);
   - menú **Comercial**, "Promociones" en la interfaz;
   - `/reportes/comercial/` y tarjetas nuevas del dashboard; arreglos de
     "Pacientes sin reagendar" y estadísticas de promociones.
2. **Oportunidades** (comparte modelo con la fase 1 del seguimiento; la que se
   haga primero crea `Oportunidad` completa, con los campos de los dos
   planes):
   - interesados sin ficha, vinculación por teléfono, conversión a paciente;
   - "+ Nuevo interesado", "Para hoy" con `proximo_contacto`, pestaña
     Embudo, avance automático de etapa;
   - etiquetas calculadas en la ficha del paciente;
   - pestaña Ventas en la bandeja de seguimiento;
   - tarjeta Embudo.

   Implementado (2026-10-08, app `backend/apps/seguimiento/`): modelo
   `Oportunidad` completo (sin `campana_marketing`, que llega con la fase 3)
   y `GestionOportunidad`; `Cotizacion.oportunidad`; permisos
   `seguimiento.oportunidades.ver/gestionar` (roles de sistema admin y
   recepción); API `/api/v1/seguimiento/oportunidades/` (lista con
   `para_hoy`, alta de interesado, PATCH, `gestiones`, `perder`, `reabrir`,
   `vincular_paciente`, `embudo`); avance por señales de cita y envío y desde
   `aceptar_cotizacion`; al descartar una cotización se ofrece cerrar su
   oportunidad. Front: `/seguimiento` (Para hoy + Embudo), diálogos de
   interesado, gestión, posponer y perdida, "completar ficha" antes de agendar
   la valoración. **Pendiente**: etiquetas en la ficha del paciente y tarjeta
   del dashboard.
3. **Campañas de marketing** (addon de número propio):
   - página pública de preferencias (autorizar y darse de baja);
   - autorización de marketing en paciente, autorregistro e importación;
     plantilla de solicitud de autorización;
   - asistente de 3 pasos con grupos listos y mensajes de ejemplo;
   - editor de plantillas y aprobación;
   - cola por n8n, los 4 números de resultado y atribución;
   - después: campañas automáticas (cumpleaños, mantenimiento) como
     interruptores;
   - "Crear oportunidad" desde la ficha del paciente que recibió la campaña.

## Pruebas

- `aceptada_en` se llena en los dos caminos de aceptación; backfill correcto
  con y sin cartera.
- `estado_comercial`: borrador sin envío, con envío, vencida, aceptada,
  descartada; aceptar vencida exige confirmación; renovar.
- KPI: una cotización creada en septiembre y aceptada en octubre cuenta como
  creada en septiembre y vendida en octubre; migradas excluidas; tasa de
  cierre con decididas en el período; consistencia entre dashboard, `/ventas`
  y reporte.
- Oportunidades: vinculación por teléfono, cada evento avanza la etapa
  correcta, un error forzado en el embudo no impide aceptar ni enviar.
- Campañas: solo destinatarios con autorización y sin baja; los congelados no
  cambian; toda plantilla de marketing lleva la línea de baja con el link;
  la página de preferencias autoriza y da de baja; el lote respeta el límite
  diario y el bloqueo; error 131050 marca
  la baja; nunca sale por el número compartido; sin addon no se puede
  programar.
- Permisos: un rol con `cotizaciones.ver` ve `/ventas`; los permisos nuevos no
  aparecen en roles personalizados.

## Decisiones

Confirmadas (2026-10-07 y 2026-10-08):

- **D-F14.** Fácil para usuarios con poca experiencia: las reglas de
  [Principio](#principio-fácil-para-usuarios-con-poca-experiencia) mandan
  sobre cualquier otra parte del plan. Pantalla principal "Para hoy", una
  sola fecha (`proximo_contacto`), tres etapas, campañas en 3 pasos con grupos
  listos.

- **D-F1.** El interesado se registra con nombre y teléfono, sin `Paciente`;
  la ficha se crea al agendar la valoración.
- **D-F2.** Un solo modelo `Oportunidad` para adquisición y retención, con
  `tipo`; compartido con el plan de seguimiento.
- **D-F3.** Etapas fijas, no configurables por la clínica.
- **D-F8.** Campañas de marketing con plantillas creadas desde CliniQ,
  incluidas en el addon de WhatsApp con número propio.
- **D-F13.** Sin botones en las plantillas ni lectura de respuestas (Lyvio no
  los soporta). Autorización y baja por link a una página pública. Las
  plantillas no se pueden borrar en Meta, solo archivar en CliniQ.
- **KPI.** Los indicadores del dashboard tienen que separar cotizaciones de
  ventas (ver [KPI](#kpi-del-dashboard)).

Abiertas:

- **D-F4. Orden.** Recomendación: fase 1 primero; es independiente y arregla
  los KPI. La 2 se coordina con la fase 1 del seguimiento.
- **D-F5. Vencidas.** Recomendación: derivadas, aceptables con confirmación y
  renovables (descrito arriba).
- **D-F6. Ficha mínima en la valoración.** `Paciente` exige documento, fecha
  de nacimiento y sexo. Recomendación: no relajar el modelo; si la recepción
  no tiene los datos al agendar, enviar el **link de autorregistro** al
  interesado y dejar la valoración agendada cuando lo complete.
- **D-F7. Nombres.** Recomendación: "Promociones" para la `Campana` de
  precios y "Campañas" para los envíos de WhatsApp.
- **D-F9. Pacientes actuales sin autorización de marketing.** Recomendación:
  plantilla de utilidad de solicitud con link a la página de preferencias, una
  sola vez por paciente, más la casilla en ficha y autorregistro y el QR en
  recepción. Riesgo: Meta puede reclasificar esa plantilla como marketing. Validar con un abogado si esa solicitud es
  aceptable por WhatsApp.
- **D-F10. Plantillas por número.** Recomendación: crear cada plantilla en
  todos los números de la clínica, para que la campaña salga por el número
  asignado a la sede del paciente.
- **D-F11. Cola propia vs campañas de Chatwoot.** Lyvio es Chatwoot, que tiene
  campañas propias. Recomendación: cola en CliniQ, porque la segmentación,
  la autorización, las bajas y la atribución viven aquí.
- **D-F12. Límite de campañas.** Recomendación: sin límite de CliniQ; el
  límite real es el del número en Meta, y el costo de cada mensaje lo paga la
  clínica a Meta.

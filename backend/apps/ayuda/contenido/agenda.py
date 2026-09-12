"""Artículos de la categoría «Agenda y citas»."""

ARTICULOS = [
    {
        "slug": "agendar-una-cita",
        "categoria": "agenda",
        "titulo": "Agendar una cita",
        "resumen": "Los tres tipos de cita que puedes crear, qué datos pide cada una, de dónde sale la duración y qué hacer cuando el horario está ocupado.",
        "area": "agenda",
        "keywords": "cita, agendar, calendario, turno, reservar, nueva cita, horario, cupo",
        "destacado": True,
        "contenido": """
La agenda se abre en **Agenda** y muestra el calendario de la sede que tengas
seleccionada. Puedes verla por día, por semana o por mes, y filtrar por
profesional.

## Crear la cita

Presiona sobre un espacio libre del calendario o usa **Nueva cita**. El
formulario pide:

1. **Paciente**. Búscalo por nombre o documento. Si es la primera vez que viene,
   créalo sin salir de la agenda.
2. **Sede** y **profesional**. La lista de profesionales muestra a quienes
   atienden en esa sede.
3. **Fecha y hora de inicio**. La rejilla usa la frecuencia de turnos que
   configuró la clínica, normalmente de 15 minutos.
4. **Motivo de la cita**, que puede ser de tres tipos, y esto es lo importante
   del formulario.
5. **Canal de origen**: presencial, teléfono, web o redes. Sirve después para
   saber de dónde llegan tus pacientes.

## Los tres tipos de cita

| Tipo | Cuándo se usa | Qué implica |
|---|---|---|
| **Por procedimiento** | Una sesión suelta del catálogo | Toma la duración y el precio del procedimiento |
| **Por tratamiento** | Una sesión de un tratamiento ya vendido | Descuenta una sesión de la cotización aceptada; el cobro va por la cartera |
| **Libre** | Valoración, control, cita comercial | Escribes el motivo y defines la duración a mano |

Elegir bien el tipo es lo que hace que después todo cuadre solo: el cobro, el
consentimiento que se exige y el descuento de sesiones del tratamiento.

## La duración

- En una cita **por procedimiento**, la duración sale del catálogo y puedes
  ajustarla si ese paciente necesita más tiempo.
- En una cita **por tratamiento**, sale de la configuración del tipo de sesión.
- En una cita **libre**, la escribes tú.

Cambiar la duración en una cita concreta no cambia el catálogo; solo afecta a esa
cita.

## Choques de horario y bloqueos

Si el profesional ya tiene otra cita a esa hora, la agenda lo muestra al
superponer los bloques. Los bloqueos aprobados, como vacaciones o un día de
quirófano, se ven como franjas marcadas sobre el calendario. Consulta
[Bloqueos de agenda](/ayuda/articulo/bloqueos-de-agenda-y-disponibilidad).

## Pacientes con deuda vencida

Si tu clínica activó el bloqueo por mora, al agendar a un paciente con cuotas
vencidas aparece un aviso con el monto y el número de cuotas en mora, y la cita
no se crea. Un usuario con permiso puede aprobar una excepción sobre esa cuota
para dejar agendar. Está explicado en
[Mora y bloqueo de agenda](/ayuda/articulo/mora-bloqueo-de-agenda-y-excepciones).

## Después de crear la cita

La cita queda **pendiente**. Desde su detalle puedes confirmarla, registrar la
llegada del paciente, reprogramarla, cambiar el profesional o cancelarla, y ver
si tiene consentimientos pendientes de firma.

> Agenda siempre con el paciente correcto, aunque tengas el nombre a medias. Una
> cita creada en la ficha equivocada arrastra la nota clínica, el cobro y el
> consentimiento al paciente equivocado, y deshacer eso cuesta bastante más que
> buscar bien.
""",
    },
    {
        "slug": "estados-de-una-cita",
        "categoria": "agenda",
        "titulo": "Estados de una cita",
        "resumen": "Qué significa cada estado, en qué orden avanzan, quién los cambia y por qué una cita cancelada no es lo mismo que una a la que el paciente no asistió.",
        "area": "agenda",
        "keywords": "estados, pendiente, confirmada, en espera, en curso, completada, cancelada, no asistió, flujo",
        "destacado": False,
        "contenido": """
Una cita avanza por estados. Cada uno dice en qué punto del día está el paciente
y habilita acciones distintas.

## Los estados

| Estado | Qué significa |
|---|---|
| **Pendiente** | La cita está creada y nadie ha confirmado que el paciente vendrá. |
| **Confirmada** | Alguien contactó al paciente y confirmó que asistirá. |
| **En espera** | El paciente llegó a la clínica y está en la sala, esperando turno. |
| **En curso** | El profesional está atendiendo. |
| **Completada** | La atención terminó. |
| **Cancelada** | La cita no se realizará; se anula antes de la hora. |
| **No asistió** | El paciente no llegó y no avisó. |

## El orden en que avanzan

El camino normal es:

**Pendiente → Confirmada → En espera → En curso → Completada**

Y en cada punto hay salidas:

- Desde **pendiente** se puede confirmar o cancelar.
- Desde **confirmada** se puede registrar la llegada, cancelar o marcar que no
  asistió.
- Desde **en espera** se puede iniciar la atención o cancelar.
- Desde **en curso** se puede completar o cancelar.

No se salta hacia atrás. Si te equivocaste de cita, cancélala y crea la
correcta, en vez de intentar devolver el estado.

## Quién cambia cada estado

- **Recepción** confirma, registra la llegada y marca las inasistencias.
- El **profesional** pasa la cita a en curso al iniciar la atención y a
  completada al cerrarla.

Cada cambio queda registrado con el usuario, la fecha y, cuando aplica, el medio
de contacto y la nota de lo que dijo el paciente.

## Cancelada frente a No asistió

Parece un detalle y no lo es:

- **Cancelada** es una cita que no se hizo y que se avisó. El cupo se liberó a
  tiempo.
- **No asistió** es un cupo que se perdió. Es lo que te deja medir cuánta agenda
  se desperdicia y con qué pacientes pasa seguido.

Usarlos bien cambia por completo lo que ves después en los reportes de ocupación.

## Qué estados generan cobro

Solo las citas que se atienden generan movimiento de dinero. Una cita cancelada o
con inasistencia no crea cobro. Si tu clínica cobra la sesión al inicio de la
atención, ese cobro aparece cuando la cita entra en curso.

> Marcar las inasistencias el mismo día es la única forma de que los números de
> ocupación signifiquen algo. Una cita que se quedó en «confirmada» para siempre
> ensucia el reporte del mes.
""",
    },
    {
        "slug": "confirmar-reprogramar-y-cancelar-citas",
        "categoria": "agenda",
        "titulo": "Confirmar, reprogramar y cancelar citas",
        "resumen": "Cómo registrar la confirmación del paciente, qué recordatorios envía CliniQ solo, y cómo mover o anular una cita dejando rastro de lo que pasó.",
        "area": "agenda",
        "keywords": "confirmar, recordatorio, whatsapp, reprogramar, mover cita, cancelar, no asistió, cambiar profesional",
        "destacado": False,
        "contenido": """
## Confirmar

Abre la cita desde el calendario y usa la acción de confirmar. CliniQ te pide
dos datos que valen oro cuando después hay que reclamar algo:

- **Medio de contacto**: llamada, WhatsApp, SMS, correo o presencial.
- **Qué dijo el paciente**: una nota corta. Por ejemplo, «confirma, pero llega
  diez minutos tarde».

Ambos quedan guardados en el historial de la cita, con tu nombre y la hora.

## Recordatorios automáticos

Si la clínica los tiene activados, CliniQ envía un recordatorio al paciente con
la anticipación configurada, normalmente 24 horas antes. Se configura en
**Configuración → Recordatorios**, donde se elige si se envían y con cuánta
anticipación.

El recordatorio no reemplaza la confirmación: el paciente puede recibirlo y no
responder. La cita sigue en pendiente hasta que alguien registre la confirmación.

## Reprogramar

Para mover una cita, ábrela y edita la fecha y la hora, o arrástrala en el
calendario si tu vista lo permite. Conviene:

1. Acordar primero el nuevo horario con el paciente.
2. Mover la cita en vez de cancelarla y crear otra, para no perder el historial
   ni el vínculo con el tratamiento.
3. Dejar una nota con el motivo del cambio.

También puedes **cambiar el profesional** de una cita ya creada, por ejemplo
cuando alguien se incapacita y otro colega cubre la agenda.

## Cancelar

Al cancelar se pide el **motivo de cancelación**. Escríbelo aunque sea corto:
es lo que permite después distinguir cancelaciones del paciente de cancelaciones
de la clínica.

Una cita cancelada libera el cupo y, si era de un tratamiento, **no consume la
sesión**: esa sesión vuelve a quedar disponible para agendar.

## Cuando el paciente no llegó

Márcala como **No asistió**, no como cancelada. Esa diferencia es la base del
reporte de ocupación y de la conversación con el paciente la próxima vez.

> Regla práctica para recepción: al cerrar el día, ninguna cita del día debería
> quedar en «pendiente» o «confirmada». O se atendió, o se canceló, o el paciente
> no llegó.
""",
    },
    {
        "slug": "bloqueos-de-agenda-y-disponibilidad",
        "categoria": "agenda",
        "titulo": "Bloqueos de agenda y disponibilidad",
        "resumen": "Cómo reservar franjas donde no se pueden agendar citas, en qué se diferencia un bloqueo del horario de la sede, y cómo funciona la aprobación.",
        "area": "agenda",
        "keywords": "bloqueo, vacaciones, incapacidad, no disponible, horario, cerrar agenda, permiso, aprobar",
        "destacado": False,
        "contenido": """
Un **bloqueo** es una franja en la que no se debe agendar: vacaciones, una
capacitación, mantenimiento de un equipo, una incapacidad o la mañana en que la
sede está cerrada.

## Bloqueo, horario y cita: no son lo mismo

- El **horario de la sede** define el marco general de atención y se configura
  una vez, en Configuración → Sedes.
- El **bloqueo** es una excepción puntual sobre ese marco, con fecha y hora de
  inicio y fin.
- La **cita** es la reserva de un paciente concreto.

## Crear un bloqueo

Desde la agenda, abre el panel de bloqueos y crea uno indicando:

- **Profesional**, si aplica a una sola persona.
- **Sede**, si aplica a toda la sede.
- **Fecha y hora de inicio y de fin**.
- **Motivo**, para que el resto del equipo entienda qué pasa sin tener que
  preguntar.

## Aprobación

Los bloqueos nacen en estado **pendiente** y alguien con permiso los **aprueba** o
los **rechaza**. Esto existe para que un profesional pueda pedir sus días sin
cerrar la agenda por su cuenta.

| Estado | Qué pasa en la agenda |
|---|---|
| **Pendiente** | Queda registrado como solicitud, a la espera de decisión |
| **Aprobado** | La franja se muestra bloqueada sobre el calendario |
| **Rechazado** | No afecta la agenda; queda el registro de la solicitud |

Quién puede crear y quién puede aprobar depende de dos permisos distintos, así
que es normal que un profesional pueda solicitar pero no aprobar.

## Recomendaciones

- Carga con tiempo los bloqueos largos, como vacaciones. Un bloqueo cargado
  tarde obliga a llamar pacientes ya agendados.
- Usa un motivo concreto: «congreso dermatología» dice más que «ocupado».
- Si el bloqueo es de toda la sede, créalo a nivel de sede y no uno por
  profesional.

> Un bloqueo no cancela las citas que ya estaban creadas en esa franja. Después
> de aprobarlo, revisa el calendario y reprograma lo que haya quedado dentro.
""",
    },
    {
        "slug": "agendar-las-sesiones-de-un-tratamiento",
        "categoria": "agenda",
        "titulo": "Agendar las sesiones de un tratamiento",
        "resumen": "Cómo se agendan las sesiones de un tratamiento ya vendido, de dónde sale el número de sesiones disponibles y por qué a veces no deja agendar más.",
        "area": "agenda",
        "keywords": "sesiones, tratamiento, paquete, cuántas sesiones, restantes, programa, cotización aceptada",
        "destacado": False,
        "contenido": """
Cuando un paciente compra un tratamiento, la cotización aceptada define cuántas
sesiones tiene derecho a recibir. La agenda usa ese número para controlar lo que
se puede reservar.

## Cómo se agenda

Al crear la cita, en lugar de elegir un procedimiento suelto, elige el
**tratamiento del paciente**. CliniQ muestra:

- El nombre del tratamiento.
- Cuántas sesiones incluye en total.
- Cuántas ya están agendadas.
- Cuántas quedan por agendar.

Eliges la sesión que corresponde y la cita queda vinculada a ella. Esa
vinculación es la que hace que, al atender, se descuente la sesión y se exijan
los consentimientos del procedimiento que toca ese día.

## De dónde sale el número de sesiones

Del **catálogo**, no del número de líneas de la cotización. Un tratamiento se
configura con sus tipos de sesión y la cantidad de cada uno; la suma de los que
están marcados como parte del compromiso es el total agendable.

Por eso una cotización puede tener una sola línea de tratamiento por un valor
total y aun así habilitar, por ejemplo, ocho sesiones.

## Por qué a veces no deja agendar más

Las causas más frecuentes, en orden:

1. **Ya se agendaron todas las sesiones.** El contador de restantes está en
   cero. Si el paciente necesita más, se cotiza de nuevo.
2. **La cotización todavía no está aceptada.** Mientras esté en borrador no
   habilita el agendamiento.
3. **El paciente traía sesiones consumidas de antes.** Si se cargó por la
   puesta en marcha, las sesiones que ya había hecho se descuentan del total.
4. **Hay cuotas vencidas** y la clínica bloquea la agenda por mora.

## Citas canceladas

Una cita cancelada **no consume** la sesión: vuelve a quedar disponible. Una cita
marcada como no asistió sí afecta a la sesión, porque el cupo se usó.

## Seguimiento del tratamiento

Desde la ficha del paciente puedes ver el avance del tratamiento: qué sesiones
están completadas, cuáles pendientes y con qué fechas. Es la forma rápida de
responder la pregunta más común del mostrador, «¿cuántas sesiones me quedan?».

> Si un paciente lleva más de un mes sin volver y tiene sesiones pendientes,
> aparece en el reporte de pacientes sin reagendar del dashboard. Es una buena
> lista de llamadas para una tarde floja.
""",
    },
]

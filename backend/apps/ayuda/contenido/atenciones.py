"""Artículos de la categoría «Atención al paciente»."""

ARTICULOS = [
    {
        "slug": "como-funciona-la-cola-de-atencion",
        "categoria": "atenciones",
        "titulo": "Cómo funciona la cola de atención",
        "resumen": "La pantalla donde recepción prepara a los pacientes y el profesional los llama: qué muestra la cola, por qué a veces el botón de iniciar está apagado y por qué no se pueden abrir dos atenciones a la vez.",
        "area": "atenciones",
        "keywords": "cola, sala de espera, atenciones, iniciar, llamar paciente, turno, atención activa",
        "destacado": True,
        "contenido": """
**Atenciones** es la pantalla del día a día: muestra los pacientes citados para
hoy, en qué punto va cada uno y cuál sigue.

## Qué muestra la cola

Cada paciente en la cola aparece con:

- Su **posición** en el orden del día.
- La **hora** de su cita.
- El **nombre del paciente** y el servicio que viene a recibir.
- Un **escudo verde o ámbar** según si sus consentimientos están al día.
- Su **estado**: confirmada, en espera, en curso.

El primero de la lista queda resaltado: es el siguiente en pasar.

## Los dos roles de esta pantalla

- **Recepción** prepara al paciente: registra la llegada, resuelve los
  consentimientos pendientes, cobra si corresponde y recoge la firma del registro
  de asistencia.
- **El profesional** pulsa **Iniciar** y pasa a la pantalla de atención.

## Por qué el botón de iniciar puede estar apagado

Tres motivos, en orden de frecuencia:

1. **Faltan pasos previos.** Si el paciente todavía no registró llegada, tiene un
   consentimiento sin firmar o falta el cobro, el botón queda deshabilitado con
   el aviso de que recepción debe completar los pasos.
2. **El paciente no ha llegado.** Una cita solo confirmada, sin llegada
   registrada, muestra la etiqueta «Sin llegar».
3. **No tienes el permiso** de iniciar atenciones. Recepción prepara, pero no
   inicia.

## Una atención a la vez

No se puede abrir una atención nueva mientras haya otra en curso sin cerrar. Si
lo intentas, CliniQ te avisa con quién está la atención abierta y te ofrece ir a
ella.

Es una protección deliberada: dos atenciones abiertas terminan con notas
clínicas cruzadas entre pacientes. Si la anterior ya terminó, ciérrala; si se
abrió por error, ciérrala igual y deja constancia.

## Pacientes con deuda vencida

Si la clínica bloquea la atención por mora, al intentar iniciar aparece el aviso
con las cuotas vencidas y no deja continuar. Se resuelve cobrando, registrando
un acuerdo de pago o aprobando una excepción sobre esa cuota.

## Cerrar la atención

Al terminar, el profesional cierra la atención. Con eso la cita pasa a
**completada**, la nota clínica queda registrada y, si la cita pertenecía a un
tratamiento, esa sesión queda marcada como realizada.

> Al final del día la cola debería quedar vacía. Un paciente que se quedó «en
> curso» toda la noche bloquea al profesional a la mañana siguiente.
""",
    },
    {
        "slug": "asistente-de-inicio-de-atencion",
        "categoria": "atenciones",
        "titulo": "El asistente de inicio de atención, paso a paso",
        "resumen": "Los cinco pasos que pueden pedirse antes de que el paciente entre al consultorio: llegada, identidad, consentimiento, pago y firma, y cómo se configuran por clínica.",
        "area": "atenciones",
        "keywords": "wizard, asistente, llegada, check-in, otp, consentimiento, pago, firma, pasos, recepción",
        "destacado": False,
        "contenido": """
Antes de que el paciente pase al consultorio, CliniQ abre un asistente con los
pasos que tu clínica haya decidido exigir. Cada paso se marca en verde cuando se
cumple, y el asistente avanza solo hasta el siguiente pendiente.

## Los pasos

### 1. Llegada

Registra que el paciente está físicamente en la clínica. Hay dos formas de
dejarlo verificado:

- **Código por WhatsApp**: se envía un código al teléfono del paciente y él lo
  dicta en el mostrador.
- **Foto presencial**: se toma una foto en recepción como constancia de la
  llegada.

Con la llegada registrada, la cita pasa a **en espera**.

### 2. Identidad

Verificación facial del paciente contra su foto de control. Es un paso opcional
que solo aparece si tu clínica tiene habilitado el módulo.

### 3. Consentimiento

Revisa los consentimientos que exige el procedimiento del día. Si falta alguno,
desde aquí mismo se firma. Este paso **no se puede desactivar**: si el
procedimiento exige consentimiento, hay que resolverlo antes de atender.

### 4. Pago

Registra el cobro de la sesión: medio de pago y valor recibido. Puedes dejar el
valor en cero si el pago queda pendiente; el cobro igual queda creado y visible
en cartera.

Cuando la cita corresponde a un **tratamiento ya vendido**, este paso no pide
dinero, porque el cobro va por la cartera de la cotización. En ese caso el paso
aparece como «Tratamiento» y solo confirma el contexto.

### 5. Firma del registro de asistencia

El paciente firma la constancia de que asistió y recibió la sesión. Puede
firmarse en una tableta o en el celular del propio paciente, con un enlace
enviado por WhatsApp. Mientras el paciente firma en su teléfono, la pantalla se
actualiza sola en cuanto llega la firma.

## Qué se puede activar y desactivar

En **Configuración** cada clínica decide qué pasos exigir:

| Paso | ¿Se puede desactivar? |
|---|---|
| Llegada | Sí |
| Identidad | Sí, y viene desactivado por defecto |
| Consentimiento | No |
| Pago | Sí |
| Firma de asistencia | Sí |

La recomendación general: si cobras al momento, deja el paso de pago activo; si
todo tu cobro va por cartera de tratamientos, apágalo y evita pasos vacíos.

## Errores frecuentes

- **Saltarse la llegada** y registrarla al final del día. La hora de llegada deja
  de servir para medir esperas.
- **Firmar el consentimiento por el paciente.** Además de inválido, deja una
  firma que no corresponde a nadie.
- **Registrar el pago en la cita equivocada** cuando hay dos pacientes con
  nombres parecidos. Verifica el nombre en el encabezado del asistente.

> El asistente es también un guion de atención en mostrador. Si el equipo lo
> sigue en orden, ningún paciente entra al consultorio sin consentimiento ni sale
> sin cobro registrado.
""",
    },
    {
        "slug": "registrar-la-nota-clinica-de-la-atencion",
        "categoria": "atenciones",
        "titulo": "Registrar la nota clínica de la atención",
        "resumen": "Qué se escribe durante la atención, cómo se organizan las pestañas, cuándo la nota pasa de borrador a completada y qué queda registrado al cerrar.",
        "area": "atenciones",
        "keywords": "nota clínica, evolución, registrar, atender, borrador, completar, cerrar atención, zonas",
        "destacado": False,
        "contenido": """
La pantalla de atención es donde el profesional trabaja mientras el paciente está
en el consultorio. Todo lo que se registra allí forma **una sola nota clínica**
asociada a esa cita.

## Las pestañas de la atención

Cada clínica elige cuáles mostrar, en Configuración → Pantalla de atención. Las
disponibles son:

- **Datos generales** del paciente.
- **Motivo de consulta**: qué refiere el paciente hoy.
- **Antecedentes**: consulta y actualización de lo que ya está registrado.
- **Exámenes**: cargar resultados con su archivo.
- **Plan de manejo**: conducta, indicaciones y recomendaciones.
- **Órdenes médicas**: generar órdenes a partir de plantillas.
- **Fotos**: registro fotográfico de la sesión.
- **Seguimiento**: mediciones que se comparan en el tiempo.
- **Zonas**: qué zonas del cuerpo se trataron y con qué parámetros.

Mostrar menos pestañas hace la consulta más rápida. Si tu clínica no usa
exámenes, apágala y deja de verla todos los días.

## Borrador y completada

Mientras la atención está abierta, la nota está **en borrador** y se puede
editar libremente. Al cerrar la atención, la nota queda **completada** y forma
parte del registro clínico del paciente.

Por eso conviene escribir durante la consulta y no después: al cerrar, la nota
queda como constancia del acto clínico.

## Qué pasa al cerrar la atención

1. La cita pasa a **completada**.
2. La nota se marca como completada y aparece en la historia del paciente.
3. Si la cita era de un tratamiento, **esa sesión queda como realizada** y el
   contador de sesiones restantes baja.
4. El cobro asociado, si lo hubo, queda registrado en ingresos y en cartera.

## Qué escribir

Sin recetas mágicas, pero sí un mínimo útil:

- El **motivo** en las palabras del paciente.
- Los **hallazgos** relevantes de la valoración.
- Lo que **se hizo**, con parámetros si el equipo los tiene: zona, producto,
  unidades, energía.
- Lo que **se indicó**: cuidados posteriores, señales de alarma, cuándo volver.
- Lo que **no se hizo y por qué**, cuando corresponda.

## Fotos y zonas

Si el procedimiento trabaja sobre zonas del cuerpo, regístralas en la pestaña de
zonas con sus parámetros. Junto con las fotos de antes y después, es lo que
permite reconstruir después qué se hizo exactamente en cada sesión.

> Una nota de dos líneas es rápida hoy y cara dentro de seis meses, cuando haya
> que explicar qué se hizo y con qué parámetros. Escribe pensando en el colega
> que atenderá la próxima sesión.
""",
    },
    {
        "slug": "ordenes-medicas-y-examenes",
        "categoria": "atenciones",
        "titulo": "Órdenes médicas y exámenes",
        "resumen": "Cómo generar una orden médica desde una plantilla, qué se puede editar, cómo se firma y dónde se cargan los resultados que trae el paciente.",
        "area": "atenciones",
        "keywords": "órdenes médicas, fórmula, receta, plantilla, exámenes, laboratorio, resultados, firma",
        "destacado": False,
        "contenido": """
## Órdenes médicas

Una orden se genera durante la atención, desde la pestaña de **Órdenes médicas**.

1. Eliges una **plantilla** del listado que configuró la clínica.
2. La plantilla se llena con los datos del paciente y del profesional.
3. Si la plantilla lo permite, puedes **editar el texto** antes de emitirla.
4. La orden queda guardada en la historia del paciente, con la fecha, el
   profesional y la nota clínica a la que pertenece.

Cuando una orden se edita sobre la plantilla, queda marcada como editada. Así se
distingue de las que salieron tal cual estaban definidas.

### Plantillas

Las plantillas se administran en **Configuración → Plantillas de órdenes**. Cada
una tiene su nombre, su contenido y una opción que define si el profesional puede
modificarla al emitirla.

Sirven para cualquier documento repetitivo: órdenes de laboratorio, remisiones,
indicaciones posteriores a un procedimiento, incapacidades.

### Firma del profesional

La orden se imprime con el nombre, el registro profesional y la firma digital del
profesional que la emite, siempre que estén cargados en su perfil. Si faltan,
la orden sale sin ellos y hay que firmarla a mano.

### Enviar la orden al paciente

Además de imprimirla, la orden se le puede hacer llegar al paciente por sus
canales de contacto.

## Exámenes

En la pestaña de **Exámenes** se cargan los resultados que el paciente trae o los
que la clínica solicita:

- **Título** del examen.
- **Descripción** o interpretación breve.
- **Archivo adjunto**, que puede ser un PDF o una imagen.
- **Fecha** del examen.

Quedan ligados a la atención en que se cargaron y visibles en la historia del
paciente.

## Buenas prácticas

- Carga el resultado el día que llega, no cuando el paciente vuelve. Un examen
  archivado en el correo de recepción no existe para la historia clínica.
- Ponle título claro: «Perfil lipídico 12/03» dice más que «examen».
- Si un resultado cambia la conducta, anótalo también en el plan de manejo; el
  archivo adjunto respalda, la nota explica.
""",
    },
]

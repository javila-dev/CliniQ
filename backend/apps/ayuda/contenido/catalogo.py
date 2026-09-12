"""Artículos de la categoría «Catálogo de servicios»."""

ARTICULOS = [
    {
        "slug": "procedimientos-y-tratamientos-en-que-se-diferencian",
        "categoria": "catalogo",
        "titulo": "Procedimientos y tratamientos: en qué se diferencian",
        "resumen": "La distinción más importante del catálogo: qué es una unidad clínica, qué es un paquete, cómo se relacionan y qué consecuencias tiene elegir mal al cotizar.",
        "area": "configuracion",
        "keywords": "procedimiento, tratamiento, paquete, catálogo, servicio, protocolo, diferencia, sesiones",
        "destacado": True,
        "contenido": """
El catálogo tiene dos niveles y entenderlos bien ahorra la mayoría de los
problemas posteriores de agenda y de cobro.

## Procedimiento: la unidad clínica

Un **procedimiento** es una cosa concreta que se ejecuta en el consultorio: una
sesión de láser, una aplicación, una limpieza facial, una valoración.

Define:

- Cuánto **dura**, que es la duración que propone la agenda.
- Cuánto **cuesta**.
- Qué **consentimientos** exige.
- Si tiene un **protocolo** de pasos.

## Tratamiento: el paquete comercial

Un **tratamiento** es lo que se le vende al paciente: un plan con varias sesiones,
posiblemente de distintos procedimientos, con un precio de conjunto.

Define:

- Qué **procedimientos** incluye y en qué cantidad.
- Qué **tipos de sesión** lo componen y cuántas de cada uno.
- Un **precio estimado** de todo el plan.

## La relación entre los dos

Un tratamiento se arma **con** procedimientos. Un procedimiento puede aparecer en
varios tratamientos y también venderse suelto.

Ejemplo: «Rejuvenecimiento facial 6 meses» es un tratamiento; las sesiones de
láser y las de limpieza que lo componen son procedimientos.

## Por qué importa al cotizar

| Cotizas como | Qué obtienes |
|---|---|
| **Procedimiento** | Tantas sesiones agendables como cantidad hayas puesto |
| **Tratamiento** | Las sesiones que define el paquete en el catálogo |
| **Ítem libre** | Un valor cobrable, sin sesiones agendables |

Un ítem de tratamiento va con cantidad 1 porque representa el paquete completo,
una sola línea de precio. Las sesiones agendables no salen de esa cantidad, salen
de la configuración del tratamiento. Ponerle cantidad 8 a un tratamiento no da
ocho sesiones: da ocho paquetes cobrados.

## Cómo decidir cuál crear

- ¿Se ejecuta en una sesión y se puede vender solo? Es un **procedimiento**.
- ¿Es un plan de varias sesiones que se vende como conjunto y con un precio de
  paquete? Es un **tratamiento**.
- ¿Es algo que no se repite y no vale la pena parametrizar? Va como **ítem libre**
  en la cotización, sin tocar el catálogo.

> Antes de crear un tratamiento nuevo, revisa si ya existe uno parecido. Dos
> tratamientos casi iguales con nombres distintos parten las estadísticas de venta
> y confunden al equipo comercial.
""",
    },
    {
        "slug": "configurar-un-procedimiento",
        "categoria": "catalogo",
        "titulo": "Configurar un procedimiento",
        "resumen": "Los campos de un procedimiento y qué efecto tiene cada uno: duración, precio de lista, descuento máximo, consentimientos, protocolo de pasos y diagramas de zonas.",
        "area": "configuracion",
        "keywords": "procedimiento, crear, duración, precio, consentimiento, protocolo, pasos, catálogo, diagrama",
        "destacado": False,
        "contenido": """
Los procedimientos se administran en **Configuración → Procedimientos**. Cada
campo tiene un efecto concreto en la operación diaria.

## Los campos y su efecto

| Campo | Qué controla |
|---|---|
| **Nombre** | Lo que ve el equipo al agendar y el paciente en la cotización |
| **Descripción** | Detalle interno del procedimiento |
| **Duración en minutos** | El bloque que propone la agenda al crear la cita |
| **Precio** | El valor que se cobra al ejecutarlo suelto |
| **Precio de lista** | Fija el precio en cotizaciones y lo bloquea ante cambios manuales |
| **Descuento máximo** | Hasta cuánto se puede rebajar sobre el precio de lista |
| **Vigencia en meses** | Cada cuánto se considera que hay que repetir la venta |
| **Tiene protocolo** | Habilita definir los pasos del procedimiento |

## Duración realista

Pon la duración **real de consultorio**, incluyendo la preparación y la limpieza.
Una duración optimista se traduce en agendas apretadas, pacientes esperando y
profesionales corriendo todo el día.

## Consentimientos

Asocia al procedimiento los consentimientos que exige. A partir de ahí, cada vez
que se agende, CliniQ pedirá esas firmas antes de atender, sin que nadie tenga que
recordarlo. Puedes asociar más de uno y definir su orden.

## Protocolo de pasos

Si el procedimiento se ejecuta en varias etapas, actívale el protocolo y define
los pasos, con su orden y, si aplica, la semana en la que va cada uno. Un paso se
puede marcar como **control**, que es una visita de seguimiento y no una sesión de
tratamiento.

## Diagramas y zonas

En la pestaña de **Diagramas** del procedimiento se asocian los diagramas
corporales y los grupos de zonas que aplican. Eso es lo que permite después, en la
atención, marcar sobre el cuerpo qué zonas se trataron. Está explicado en
[Zonas de tratamiento y diagramas](/ayuda/articulo/zonas-de-tratamiento-y-diagramas).

## Antes de crear uno nuevo

- Revisa que no exista ya con otro nombre.
- Ponle un nombre que el equipo reconozca, no el nombre comercial de un equipo.
- Define precio de lista y descuento máximo desde el inicio: es más fácil que
  corregir cotizaciones después.

> Cambiar el precio de un procedimiento no cambia las cotizaciones ya creadas.
> Los precios acordados con un paciente se respetan tal como quedaron.
""",
    },
    {
        "slug": "configurar-un-tratamiento-y-sus-sesiones",
        "categoria": "catalogo",
        "titulo": "Configurar un tratamiento y sus sesiones",
        "resumen": "Cómo armar un paquete: los procedimientos que incluye, los tipos de sesión, cuáles cuentan como compromiso con el paciente y cómo eso define lo que se puede agendar.",
        "area": "configuracion",
        "keywords": "tratamiento, paquete, sesiones, tipos de sesión, compromiso, control, catálogo, protocolo",
        "destacado": False,
        "contenido": """
Los tratamientos se administran en **Configuración → Tratamientos**. Un
tratamiento bien configurado hace que, al venderlo, la agenda y la cartera se
comporten solas.

## Los datos generales

- **Nombre** y **descripción**: lo que verá el paciente en la cotización.
- **Precio estimado**: el valor del paquete completo.
- **Descuento máximo**: hasta cuánto se puede rebajar en una cotización.

## Los procedimientos que incluye

Agrega los procedimientos que componen el tratamiento, con su cantidad y su
orden. Es la composición clínica del paquete: qué se le va a hacer al paciente y
cuántas veces.

## Los tipos de sesión

Es la parte que más efecto tiene y la que más se pasa por alto. Un tipo de sesión
agrupa las visitas que son iguales entre sí. Por ejemplo, un tratamiento puede
tener:

- 6 sesiones de «Aplicación»
- 2 sesiones de «Control»

De cada tipo de sesión se define:

| Campo | Para qué |
|---|---|
| **Nombre** | Cómo se llama esa visita |
| **Cantidad** | Cuántas visitas de ese tipo incluye el paquete |
| **Duración** | Cuánto dura esa visita en la agenda |
| **Orden** | En qué secuencia van |
| **Cuenta como compromiso** | Si es una sesión que el paciente compró |
| **Procedimientos** | Qué se ejecuta en esa visita |

## Qué significa «cuenta como compromiso»

Las sesiones marcadas como compromiso son las que **el paciente compró** y las que
se pueden agendar contra la cotización. La suma de sus cantidades es el total de
sesiones agendables del tratamiento.

Las que no cuentan como compromiso, típicamente los controles de cortesía,
aparecen en el plan pero no consumen sesiones del paquete.

De ahí sale el número que ve recepción al agendar: «quedan 3 de 8 sesiones».

## Errores frecuentes

- **Poner las sesiones como cantidad del ítem en la cotización.** Las sesiones se
  definen aquí, en el catálogo, no en la cotización.
- **Marcar los controles como compromiso**, lo que infla el número de sesiones
  vendidas.
- **Dejar la duración en cero**, con lo que la agenda no sabe qué bloque reservar.

## Cambiar un tratamiento ya vendido

Si modificas la configuración de un tratamiento, los pacientes que ya lo
compraron mantienen lo que se les vendió. Para cambios grandes conviene crear un
tratamiento nuevo en vez de rehacer el existente, así las ventas viejas y las
nuevas quedan separadas en los reportes.

> Después de crear un tratamiento, pruébalo: cotízalo a un paciente de prueba,
> acéptalo y mira cuántas sesiones te ofrece la agenda. Es la forma más rápida de
> verificar que los tipos de sesión quedaron bien.
""",
    },
    {
        "slug": "zonas-de-tratamiento-y-diagramas",
        "categoria": "catalogo",
        "titulo": "Zonas de tratamiento y diagramas corporales",
        "resumen": "Cómo se registran las zonas del cuerpo que se tratan en cada sesión, cómo se asocian los diagramas a un procedimiento y para qué sirve ese registro después.",
        "area": "configuracion",
        "keywords": "zonas, diagrama, cuerpo, mapa corporal, parámetros, unidades, registro, láser",
        "destacado": False,
        "contenido": """
Cuando un procedimiento se aplica sobre zonas concretas del cuerpo, registrar
**dónde** y **con qué parámetros** es tan importante como registrar que se hizo.

## Cómo funciona

1. Se asocian al procedimiento uno o varios **diagramas corporales** y **grupos de
   zonas**, desde la pestaña de Diagramas del procedimiento.
2. Durante la atención, en la pestaña de **Zonas**, el profesional marca sobre el
   diagrama las zonas trabajadas.
3. Por cada zona se pueden registrar sus **parámetros**: producto, unidades,
   potencia, número de disparos, lo que corresponda al equipo.
4. Todo queda guardado en la nota clínica de esa sesión.

## Para qué sirve después

- **Continuidad**: el profesional de la próxima sesión ve exactamente qué se hizo
  y dónde, y puede ajustar en consecuencia.
- **Seguridad**: evita repetir sobre una zona que ya recibió el máximo, o dejar
  zonas sin tratar.
- **Respaldo**: ante un reclamo, el registro por zona con sus parámetros es la
  prueba concreta de lo que se ejecutó.
- **Consumo**: las unidades registradas por zona permiten estimar el gasto real
  de producto.

## Buenas prácticas

- Registra las zonas **durante** la sesión, no de memoria al final del día.
- Sé consistente con las unidades: si un equipo se mide en disparos, usa disparos
  siempre, no «medio rostro».
- Si una zona se omitió a propósito, déjalo anotado. Una zona en blanco es
  ambigua.

## Configuración

Los diagramas corporales y los grupos de zonas forman parte de la configuración
avanzada del catálogo y normalmente los deja listos el equipo de implementación.
Lo que sí administra cada clínica es **qué diagramas aplican a cada
procedimiento**.

> Si tus profesionales están describiendo las zonas en texto libre dentro de la
> nota, es señal de que falta asociar el diagrama al procedimiento. El registro
> estructurado se puede comparar entre sesiones; el texto libre no.
""",
    },
]

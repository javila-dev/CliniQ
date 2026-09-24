"""Artículos de la categoría «Catálogo»."""

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

## Tratamiento: el paquete comercial

Un **tratamiento** es lo que se le vende al paciente: un plan con varias sesiones,
posiblemente de distintos procedimientos, con un precio de conjunto.

Define:

- Qué **procedimientos** incluye y en qué cantidad.
- Cuántas **sesiones** de cada procedimiento lo componen y en qué orden.
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
        "resumen": "Los campos de un procedimiento y qué efecto tiene cada uno: duración, precio de lista, descuento máximo, consentimientos y diagramas de zonas.",
        "area": "configuracion",
        "keywords": "procedimiento, crear, duración, precio, consentimiento, catálogo, diagrama",
        "destacado": False,
        "contenido": """
Los procedimientos se administran en **Catálogo → Procedimientos** (dentro de
Ventas). Cada campo tiene un efecto concreto en la operación diaria.

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

## Duración realista

Pon la duración **real de consultorio**, incluyendo la preparación y la limpieza.
Una duración optimista se traduce en agendas apretadas, pacientes esperando y
profesionales corriendo todo el día.

## Consentimientos

Asocia al procedimiento los consentimientos que exige. A partir de ahí, cada vez
que se agende, CliniQ pedirá esas firmas antes de atender, sin que nadie tenga que
recordarlo. Puedes asociar más de uno y definir su orden.

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
        "resumen": "Cómo armar un paquete: en modo rápido o por bloques de sesiones, cuáles se agendan y cómo eso define lo que se puede agendar.",
        "area": "configuracion",
        "keywords": "tratamiento, paquete, sesiones, tipos de sesión, compromiso, control, catálogo, protocolo",
        "destacado": False,
        "contenido": """
Los tratamientos se administran en **Catálogo → Tratamientos** (dentro de
Ventas). Un tratamiento bien configurado hace que, al venderlo, la agenda y la
cartera se comporten solas.

## Crear un tratamiento rápido

El caso más común es vender varias sesiones del mismo procedimiento. Para eso
**Nuevo tratamiento** se abre en modo rápido, con una sola frase:

> Vendo **5** sesiones de **Láser facial**

Eliges la cantidad y el procedimiento, y le pones el precio de lista. El nombre se
propone solo («Láser facial ×5») y puedes cambiarlo. Si el procedimiento no está en
la lista, puedes crearlo desde ahí sin salir del tratamiento.

## Combinar procedimientos o agregar controles

Si el paquete mezcla procedimientos o incluye controles, pulsa **Combinar o agregar
controles**. El formulario se amplía y cada parte del tratamiento es un **bloque de
sesiones**: una cantidad y uno o varios procedimientos.

Por ejemplo, un tratamiento de rejuvenecimiento puede ser:

- 5 sesiones de «Láser facial»
- 1 sesión de «Control médico»
- 5 sesiones de «Láser facial»

A la derecha, **Así lo verá el paciente** muestra el recorrido numerado, cuántas
sesiones se pueden agendar y cuánto dura en total. Lo que ves ahí es lo que ofrecerá
la agenda.

Con cada bloque puedes:

- Cambiar la **cantidad** y los **procedimientos**. Si pones varios en el mismo
  bloque, es una sola visita que los combina.
- Elegir si **Se agenda** o es **Solo informativa**.
- **Reordenar**, **duplicar** o **quitar** el bloque.
- **Insertar una sesión distinta** entre dos bloques.
- **Intercalar** otra sesión dentro de un bloque: por ejemplo, partir «10 sesiones de
  láser» en 5, un control y otras 5. El bloque se parte en dos y deja una sesión
  vacía en medio para elegir el procedimiento.

Mientras lo armas, el avance se guarda en tu navegador: si cierras la ventana sin
querer, lo recuperas al volver a abrirla.

## Qué significa «Se agenda»

Los bloques que **se agendan** son las sesiones que el paciente compró: se pueden
agendar contra la cotización. La suma de sus cantidades es el total de sesiones
agendables del tratamiento.

Los bloques **solo informativos**, típicamente los controles de cortesía, aparecen en
el plan pero no consumen sesiones del paquete. Un tratamiento necesita al menos una
sesión que se agende; si no, no se puede guardar.

De ahí sale el número que ve recepción al agendar: «quedan 3 de 8 sesiones».

## Lo que hereda de sus procedimientos

El panel de la derecha también muestra los consentimientos que se pedirán, que
vienen de cada procedimiento, y avisa si algún procedimiento no tiene profesionales
asociados cuando tu clínica filtra por procedimiento. Para corregirlos, edita el
procedimiento, no el tratamiento.

## Errores frecuentes

- **Poner las sesiones como cantidad del ítem en la cotización.** Las sesiones se
  definen aquí, en el catálogo, no en la cotización.
- **Dejar como «Se agenda» los controles de cortesía**, lo que infla el número de
  sesiones vendidas.
- **Dejar un bloque sin procedimiento**: el formulario no deja guardar hasta que
  todos tengan uno.

## Duplicar y cambiar un tratamiento ya vendido

Para crear una variante sin empezar de cero, usa **Duplicar** en el menú del
tratamiento.

**Lo que ya vendiste no cambia.** Al aceptar una cotización, las sesiones del
tratamiento quedan guardadas tal como se vendieron. Editar el tratamiento después
solo afecta a las próximas ventas: los pacientes que ya lo compraron conservan sus
sesiones. Si abres un tratamiento ya vendido, el formulario te avisa cuántos
pacientes lo tienen.

Una cotización que todavía no se ha aceptado sí sigue al catálogo: si cambias el
tratamiento antes de aceptarla, verá la versión nueva.

Aun así, para cambios grandes conviene crear un tratamiento nuevo en vez de rehacer
el existente, así las ventas viejas y las nuevas quedan separadas en los reportes.

> Después de crear un tratamiento, pruébalo: cotízalo, acéptalo y mira cuántas
> sesiones te ofrece la agenda. Es la forma más rápida de verificar que quedó bien.
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

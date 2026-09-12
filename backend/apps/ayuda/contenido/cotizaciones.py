"""Artículos de la categoría «Cotizaciones y ventas»."""

ARTICULOS = [
    {
        "slug": "crear-y-enviar-una-cotizacion",
        "categoria": "cotizaciones",
        "titulo": "Crear y enviar una cotización",
        "resumen": "Cómo armar una propuesta con ítems del catálogo o libres, aplicar descuentos, definir la forma de pago y enviarla al paciente por WhatsApp, correo o PDF.",
        "area": "cotizaciones",
        "keywords": "cotización, presupuesto, propuesta, enviar, pdf, whatsapp, ítems, forma de pago",
        "destacado": True,
        "contenido": """
Una cotización es la propuesta económica que se le entrega al paciente. Además de
comunicar un precio, es la pieza que después crea su cartera, sus cuotas y sus
sesiones agendables, así que conviene armarla con cuidado.

## Crear la cotización

Entra a **Cotizaciones → Nueva** y elige el paciente. La cotización queda ligada
a él, a la sede y al profesional que la crea.

## Agregar ítems

Cada línea de la cotización es un ítem, y hay tres tipos:

| Tipo | Qué es | Qué habilita después |
|---|---|---|
| **Tratamiento** | Un paquete del catálogo | Habilita agendar todas las sesiones que incluye el paquete |
| **Procedimiento** | Una sesión suelta del catálogo | Habilita agendar esa cantidad de sesiones |
| **Libre** | Un concepto escrito a mano | No genera sesiones agendables |

En los ítems de **tratamiento**, la cantidad es 1 porque representa el paquete
completo: una línea, un precio. Las sesiones que se podrán agendar salen de la
configuración del tratamiento en el catálogo, no de esa cantidad. Es la confusión
más común al empezar.

Por cada ítem puedes ajustar:

- **Descripción**, que es lo que leerá el paciente.
- **Cantidad**, en procedimientos e ítems libres.
- **Valor unitario**, si tienes permiso y el precio no está bloqueado.
- **Descuento** en porcentaje, dentro del límite que permita el catálogo.
- **Duración estimada** y **periodicidad**, útiles para explicar el plan.

## Forma de pago

Abajo se arma cómo va a pagar el paciente. Cada línea de forma de pago tiene un
tipo, un valor y una fecha:

- Efectivo
- Transferencia
- Tarjeta de crédito o débito
- Cuotas
- Financiamiento

Estas líneas son las que, al aceptarse la cotización, **se convierten en las
cuotas de la cartera**. Si el paciente paga la mitad hoy y la otra mitad en 30
días, eso son dos líneas con sus fechas. Vale la pena dedicarles un minuto: son
la base del cobro posterior.

## Vigencia

Cada cotización tiene una **validez en días**, 30 por defecto. Pasada esa fecha
se considera vencida, lo que evita que un precio de hace medio año se acepte hoy.

## Enviar al paciente

Desde el detalle de la cotización puedes:

- **Descargar el PDF** para imprimirlo o entregarlo.
- **Enviarlo por WhatsApp**.
- **Enviarlo por correo electrónico**.

Cada envío queda registrado con su canal y su fecha, así que después se puede
saber cuándo y cómo se le entregó la propuesta al paciente.

## Después de crearla

La cotización queda en **borrador**. Sigue editable mientras el paciente decide.
Cuando la acepte, se convierte en cartera y en sesiones agendables: lo explicamos
en [Aceptar una cotización](/ayuda/articulo/aceptar-una-cotizacion-que-pasa-despues).

> Antes de enviarla, léela como la leería el paciente: ¿entiende qué incluye,
> cuántas sesiones son y cuándo paga cada parte? Una cotización clara ahorra tres
> llamadas.
""",
    },
    {
        "slug": "estados-de-una-cotizacion",
        "categoria": "cotizaciones",
        "titulo": "Estados de una cotización",
        "resumen": "Qué significan borrador, aceptada, vencida y descartada, qué se puede editar en cada uno y cómo llevar un seguimiento ordenado de las propuestas abiertas.",
        "area": "cotizaciones",
        "keywords": "estados, borrador, aceptada, vencida, descartada, seguimiento, vigencia, propuesta",
        "destacado": False,
        "contenido": """
## Los estados

| Estado | Qué significa | Qué se puede hacer |
|---|---|---|
| **Borrador** | Está armada y el paciente todavía no la acepta | Editar, enviar, aceptar o descartar |
| **Aceptada** | El paciente aceptó; ya existe su cartera | Consultar, cobrar, agendar sesiones |
| **Vencida** | Pasó su periodo de validez sin aceptarse | Duplicar y armar una nueva con precios vigentes |
| **Descartada** | El paciente no la tomó | Solo consulta, queda como histórico |

## Borrador

Es el estado de trabajo. Puedes cambiar ítems, precios, descuentos y forma de
pago las veces que haga falta, y reenviarla al paciente.

Mientras esté en borrador **no existe cartera** y **no se pueden agendar** las
sesiones del tratamiento. Es el motivo más común por el que recepción no puede
agendar un paquete que «ya se vendió»: falta aceptarlo en el sistema.

## Aceptada

Es un punto de no retorno razonable: se creó la cartera del paciente con sus
cuotas y quedaron habilitadas las sesiones. Si hay un error después de aceptar, no
se corrige editando la cotización; se maneja desde cartera, con un acuerdo de
pago o con los ajustes que corresponda.

## Vencida

La validez existe para proteger tus precios. Si el paciente vuelve después de
vencida, lo correcto es armar una cotización nueva con los precios actuales, no
revivir la anterior.

## Descartada

Descarta las propuestas que el paciente ya dijo que no toma. Un listado lleno de
borradores viejos hace imposible saber qué está realmente abierto.

## Seguimiento

El dashboard muestra las cotizaciones del periodo con cuántas se aceptaron. Ese
número, mirado por mes, es la medida más directa del trabajo comercial de la
clínica.

Rutina sugerida, una vez por semana:

1. Revisar los borradores enviados hace más de una semana y llamar.
2. Descartar lo que ya se sabe que no va.
3. Revisar las vencidas del mes con el equipo comercial.

> Un borrador no le sirve a nadie para siempre. O se acepta, o se descarta, o se
> renueva: esas tres salidas mantienen el embudo limpio.
""",
    },
    {
        "slug": "aceptar-una-cotizacion-que-pasa-despues",
        "categoria": "cotizaciones",
        "titulo": "Aceptar una cotización: qué pasa después",
        "resumen": "Todo lo que CliniQ crea automáticamente al aceptar una propuesta: la cartera con sus cuotas, las sesiones agendables y los consentimientos pendientes.",
        "area": "cotizaciones",
        "keywords": "aceptar, aprobar, cartera, cuotas, sesiones, consentimientos, compromiso de pago, tratamiento",
        "destacado": False,
        "contenido": """
Aceptar una cotización es el momento en que una propuesta se vuelve un compromiso
real, y dispara varias cosas a la vez.

## Qué crea la aceptación

1. **La cartera del paciente**, por el valor total de la cotización.
2. **Las cuotas**, una por cada línea de forma de pago, con su valor y su fecha.
3. **Las sesiones agendables** del tratamiento, que quedan disponibles en la
   agenda.
4. **La lista de consentimientos pendientes** de los procedimientos incluidos,
   para que se firmen antes de la primera sesión.

A partir de ahí, el paciente aparece en Cartera con su saldo, y sus pagos se
aplican contra esas cuotas.

## Las dos formas de aceptar

### Aceptación directa

Alguien con permiso cambia el estado de la cotización a **aceptada**. Es el
camino normal.

### Aceptación por firma del compromiso de pago

Si tu clínica exige compromiso de pago, el flujo cambia: se genera el documento,
el paciente lo firma y, **al confirmarse la firma, la cotización se acepta sola**.
No hay que volver a entrar a marcarla.

Esto se activa en Configuración → Otros documentos y se explica en
[El compromiso de pago](/ayuda/articulo/el-compromiso-de-pago).

## Revisa antes de aceptar

Después de aceptar ya no se edita la cotización, así que conviene verificar:

- Que el **paciente** sea el correcto.
- Que los **ítems** y sus cantidades reflejen lo acordado.
- Que el **total** coincida con lo que se le dijo al paciente.
- Que las **formas de pago** sumen el total y tengan fechas reales, no fechas de
  relleno.

Ese último punto es el que más problemas evita: las fechas de las líneas de pago
son las fechas en que las cuotas vencen y empiezan a generar mora.

## Qué no hace la aceptación

- **No cobra.** Aceptar no registra ningún pago; el dinero se registra aparte.
- **No agenda.** Habilita las sesiones, pero alguien tiene que ponerlas en la
  agenda.
- **No firma consentimientos.** Solo deja la lista de los que faltan.

> Si aceptaste una cotización equivocada, no la edites: revisa la cartera que se
> creó. Un acuerdo de pago o una anulación de cuotas es la vía correcta, y deja
> rastro de lo que pasó.
""",
    },
    {
        "slug": "precios-descuentos-y-permisos",
        "categoria": "cotizaciones",
        "titulo": "Precios, descuentos y permisos",
        "resumen": "Cómo se fija el precio de un ítem, por qué a veces no se puede editar, qué es el descuento máximo del catálogo y quién puede saltarse esos límites.",
        "area": "cotizaciones",
        "keywords": "precio, descuento, rebaja, bloqueado, permiso, cambiar precio, precio base, límite",
        "destacado": False,
        "contenido": """
Los precios de una cotización no son libres por defecto: el catálogo define el
marco y los permisos definen quién puede moverse dentro de él.

## De dónde sale el precio

Cuando agregas un ítem del catálogo, el valor se trae del **precio de lista** del
procedimiento o del tratamiento. Si ese precio está definido en el catálogo, el
ítem queda con el **precio bloqueado**: no se edita a mano salvo que tengas el
permiso para hacerlo.

Los ítems **libres** siempre se escriben a mano, porque no vienen de ningún
precio de catálogo.

## Descuento máximo

Cada procedimiento y cada tratamiento puede tener un **descuento máximo
permitido**, en porcentaje. El precio efectivo del ítem nunca puede bajar de ese
piso.

- Descuento máximo en **0** significa que no se permite ningún descuento.
- Un descuento máximo del 15 % permite bajar hasta ese 15 % sobre el precio de
  lista, ni un peso más.

Si intentas aplicar un descuento mayor, CliniQ lo rechaza y te dice cuál es el
límite.

## Los permisos que intervienen

| Permiso | Qué habilita |
|---|---|
| **Ver cotizaciones** | Consultarlas |
| **Gestionar cotizaciones** | Crearlas, editarlas, enviarlas y aceptarlas |
| **Cambiar precio en cotizaciones** | Editar un valor bloqueado por el catálogo |

La combinación típica: el equipo comercial gestiona cotizaciones pero no cambia
precios; solo la dirección tiene el permiso de cambio de precio.

## Cómo decidir la política de precios

- Si el precio es innegociable, ponlo en el catálogo y deja el descuento máximo
  en cero.
- Si quieres dar margen de negociación acotado, define el descuento máximo y no
  repartas el permiso de cambiar precio.
- Si el precio depende siempre del caso, déjalo sin precio de lista y trabaja con
  ítems que se valoran uno por uno.

## Campañas

Los precios promocionales no se manejan a punta de descuentos manuales: se
configuran como campañas, con su vigencia y sus sedes. Están explicadas en
[Campañas y precios promocionales](/ayuda/articulo/campanas-y-precios-promocionales).

> Cada descuento manual por fuera de la política es una conversación que se
> repetirá con el próximo paciente. Es más limpio bajar el precio de lista o abrir
> una campaña que autorizar excepciones una por una.
""",
    },
    {
        "slug": "campanas-y-precios-promocionales",
        "categoria": "cotizaciones",
        "titulo": "Campañas y precios promocionales",
        "resumen": "Cómo crear una campaña con vigencia y sedes, cómo se aplica su precio al cotizar y cómo saber después cuánto vendió cada promoción.",
        "area": "cotizaciones",
        "keywords": "campaña, promoción, descuento, temporada, precio especial, oferta, vigencia, métricas",
        "destacado": False,
        "contenido": """
Una campaña es un conjunto de **precios especiales con fecha de inicio y fin**.
Sirve para promociones de temporada, lanzamientos o acuerdos con una empresa, sin
tener que tocar el catálogo ni autorizar descuentos uno por uno.

## Crear una campaña

En **Campañas → Nueva**:

1. **Nombre** y **descripción**. El nombre es el que verá el equipo al cotizar,
   así que conviene que sea reconocible: «Mes de la madre 2026».
2. **Fecha de inicio y fin**. Fuera de ese rango la campaña no aplica.
3. **Sedes** donde aplica. Si lo dejas vacío, aplica en todas.
4. **Ítems**: los procedimientos y tratamientos incluidos, cada uno con su
   **precio de campaña**.

## Cómo se aplica al cotizar

Al agregar a una cotización un ítem que está en una campaña vigente, se ofrece el
precio de campaña. Queda registrado en el ítem **de qué campaña salió ese
precio**, y por eso el precio promocional se puede aplicar aunque el ítem tenga el
precio bloqueado por catálogo: no es un descuento manual, es una política de la
clínica.

## Medir resultados

Como cada ítem vendido recuerda su campaña, se puede saber después cuánto se
vendió con cada promoción y compararlas entre sí. Eso es lo que permite repetir
las que funcionan y dejar de repetir las que no.

## Recomendaciones

- **Una campaña, un objetivo.** Campañas que incluyen medio catálogo no dicen
  nada al medirlas.
- **Fechas reales**, y no fechas amplias «por si acaso». La vigencia es lo que
  crea urgencia y lo que hace comparables los periodos.
- **Avisa al equipo** cuando una campaña arranca y cuando termina. El precio se
  apaga solo en la fecha de fin, pero el discurso de mostrador no.
- **Revisa el margen** antes de fijar el precio de campaña. Un precio
  promocional por debajo del costo de insumos vende mucho y deja pérdida; el
  reporte de resultados te muestra esa relación.

> Si necesitas extender una promoción, cambia la fecha de fin de la campaña. Es
> preferible a dejar que el equipo aplique el precio viejo «a mano» después de
> vencida.
""",
    },
]

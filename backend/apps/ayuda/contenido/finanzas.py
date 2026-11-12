"""Artículos de la categoría «Caja, ingresos y resultados»."""

ARTICULOS = [
    {
        "slug": "ingresos-cobros-y-pagos",
        "categoria": "caja-e-ingresos",
        "titulo": "Ingresos: cobros, pagos y anulaciones",
        "resumen": "La diferencia entre un cobro y un pago, de dónde sale cada ingreso, qué significan sus estados y cómo anular un cobro mal registrado.",
        "area": "cartera",
        "keywords": "ingresos, cobros, pagos, anular, medio de pago, facturado, recaudo, estados",
        "destacado": False,
        "contenido": """
## Cobro y pago no son lo mismo

- Un **cobro** es lo que el paciente debe por algo concreto: una sesión, un
  tratamiento, un producto. Es la cuenta.
- Un **pago** es el dinero que efectivamente entró, con su medio y su fecha. Es
  el recaudo.

Un cobro puede tener varios pagos, y por eso existe el estado de pago parcial. La
distinción importa: la cuenta se genera cuando se presta el servicio, el dinero
entra cuando entra.

## De dónde salen los ingresos

| Origen | Cuándo aparece |
|---|---|
| **Cita** | Se cobra una sesión suelta al iniciar la atención |
| **Cotización** | Se registra un abono a una cuota de la cartera del paciente |
| **Libre** | Un ingreso que no corresponde a una cita ni a una cotización |

## Estados de un cobro

| Estado | Qué significa |
|---|---|
| **Pendiente** | Se generó la cuenta y todavía no entró dinero |
| **Pago parcial** | Entró una parte |
| **Pagado** | Cubierto por completo |
| **Anulado** | Se dejó sin efecto; no cuenta para ningún reporte |

## Qué se puede cobrar

Un cobro puede incluir procedimientos, insumos consumidos en la atención y productos
de venta al público. Eso permite que la venta de un producto en mostrador quede
registrada igual que una sesión.

## Anular un cobro

Anular es la forma correcta de corregir un cobro mal hecho: el cobro queda en el
histórico marcado como anulado y deja de sumar en los reportes. Requiere el
permiso de anular cobros.

No corrijas nunca con un cobro «al revés» ni con un pago negativo. El histórico
queda ilegible y los cierres de caja dejan de cuadrar.

## Filtros del listado

Ingresos se puede filtrar por rango de fechas, por sede, por estado y por origen,
con atajos para hoy, esta semana y este mes. Es la pantalla que se usa para
cuadrar el día con lo que hay en caja.

## Rutina de cierre del día

1. Filtrar Ingresos por el día y la sede.
2. Comparar el total en efectivo contra lo contado en caja.
3. Revisar los cobros que quedaron pendientes: o falta registrar un pago, o falta
   cobrarle a alguien.
4. Cerrar la caja de la sede.

> Si el total de ingresos del día no coincide con lo contado, la diferencia casi
> siempre está en un pago registrado con el medio equivocado, por ejemplo un
> datáfono cargado como efectivo.
""",
    },
    {
        "slug": "abrir-y-cerrar-la-caja",
        "categoria": "caja-e-ingresos",
        "titulo": "Abrir y cerrar la caja",
        "resumen": "Cómo funciona la caja de cada sede: quién la configura, cómo se abre una sesión, qué calcula el cierre y qué hacer cuando hay diferencia.",
        "area": "cartera",
        "keywords": "caja, apertura, cierre, efectivo, arqueo, diferencia, sesión, fondo",
        "destacado": False,
        "contenido": """
La caja es el control del **efectivo físico** de una sede. Hay una caja por sede,
y se trabaja por sesiones: una apertura, un cierre.

## Configurar la caja

Un administrador la crea en **Configuración → Cajas y categorías** e indica:

- El **fondo inicial** con el que se abre la primera vez.
- El **responsable** de la caja.

Si la sede no tiene caja creada, la pantalla de caja lo avisa y no deja registrar
nada hasta que un administrador la configure.

## Abrir una sesión

Al empezar el turno, se abre la caja indicando el **monto de apertura**: el
efectivo con el que se arranca. CliniQ propone el valor contado en el último
cierre, así que en condiciones normales basta con confirmarlo.

Solo puede haber **una sesión abierta por caja**. Si alguien ya la abrió, no se
abre de nuevo: se trabaja sobre esa.

Una sesión no está atada a un día: queda abierta hasta que alguien la cierra. Si
el turno cruza la medianoche, la sesión sigue siendo la misma.

## Durante la sesión

La pantalla de caja muestra el balance de la sesión en curso:

- El monto de apertura.
- Los ingresos registrados.
- Los egresos registrados.
- El efectivo esperado en ese momento.

## Cerrar la sesión

Al cerrar se pide el **efectivo contado**: lo que realmente hay en el cajón,
contado a mano. CliniQ calcula:

**Esperado** = apertura + ingresos en efectivo − egresos

**Diferencia** = contado − esperado

Si hay diferencia, escríbela en las **observaciones** con lo que se sepa: un
vuelto mal dado, un pago que no se registró, un gasto sin soporte. Una diferencia
explicada vale mucho más que una diferencia en cero conseguida a la fuerza.

El cierre queda guardado con quién lo hizo, a qué hora y con qué números, y el
efectivo contado pasa a ser la apertura sugerida de la siguiente sesión.

## Historial

Cada sede conserva el listado de sus sesiones cerradas con su apertura, sus
ingresos, sus egresos, lo contado y la diferencia. Es lo que se revisa cuando hay
que reconstruir qué pasó un día concreto.

> No cierres la caja «para que cuadre». El valor del cierre está en que las
> diferencias aparezcan: una diferencia repetida en el mismo turno es información,
> no un error contable.
""",
    },
    {
        "slug": "registrar-un-gasto-o-egreso",
        "categoria": "caja-e-ingresos",
        "titulo": "Registrar un gasto o egreso",
        "resumen": "Cómo cargar un gasto contra la caja de la sede, por qué la categoría y el soporte importan, y qué permisos controlan quién registra y quién aprueba.",
        "area": "cartera",
        "keywords": "gasto, egreso, salida de dinero, categoría, soporte, factura, caja menor, aprobar",
        "destacado": False,
        "contenido": """
Un gasto es una salida de dinero de la caja de una sede: domicilios, papelería,
mantenimiento, transporte, insumos comprados de urgencia.

## Cómo registrarlo

Desde la pantalla de caja de la sede:

1. **Descripción**: qué se compró o pagó, en concreto.
2. **Valor**.
3. **Categoría** de gasto, del catálogo que definió la clínica.
4. **Fecha**.
5. **Soporte**: foto de la factura o del recibo.

El gasto queda asociado a la **sesión de caja abierta**, así que descuenta del
efectivo esperado al cerrar.

## Las categorías de gasto

Se administran en **Configuración → Cajas y categorías**. Conviene tener pocas y
claras: una lista de treinta categorías termina en que todo el mundo usa «Otros».

Una lista razonable para empezar: aseo, papelería, transporte, domicilios,
mantenimiento, servicios públicos, insumos menores, otros.

## El soporte

Carga la foto del comprobante siempre que exista. Es la diferencia entre una
diferencia de caja explicada y una que hay que discutir a fin de mes. Si el gasto
no tiene comprobante, déjalo dicho en la descripción.

## Permisos

| Permiso | Para qué |
|---|---|
| **Ver gastos** | Consultar los egresos registrados |
| **Registrar gastos** | Cargar un gasto nuevo |
| **Editar gastos** | Corregir uno ya registrado |
| **Aprobar gastos** | Revisar y dar el visto bueno |

Lo habitual es que recepción registre y que la administración revise y apruebe.

## Dónde se ven

- En la **sesión de caja** de la sede, mientras está abierta.
- En el **listado de egresos**, dentro de Resultados, con sus filtros por
  periodo, sede y categoría.

> Registra el gasto en el momento, no al final del turno. El comprobante que se
> queda en el bolsillo es el que aparece descuadrando la caja tres días después.
""",
    },
    {
        "slug": "resultados-del-periodo",
        "categoria": "caja-e-ingresos",
        "titulo": "Resultados: facturación, costo y margen",
        "resumen": "Cómo leer el reporte de resultados, qué incluye cada columna, cómo se llega del facturado al margen y qué decisiones se toman con esos números.",
        "area": "reportes",
        "keywords": "resultados, margen, rentabilidad, facturado, costo, insumos, reportes, análisis",
        "destacado": False,
        "contenido": """
**Resultados** es la vista financiera de la operación. Responde a una pregunta
que la caja no responde: no cuánto entró, sino **cuánto quedó**.

## Del facturado al margen

El reporte recorre esta cadena:

1. **Facturado**: el valor de lo vendido en el periodo.
2. **Costo de insumos**: lo que costó ejecutar esos procedimientos.
3. **Margen**: la diferencia entre los dos.

Cada procedimiento aparece con esas columnas, lo que permite ordenar por margen y ver
qué procedimientos sostienen realmente a la clínica.

## Facturado no es recaudado

Es la confusión más frecuente. Facturado es lo que se vendió; recaudado es lo que
entró en dinero. Si vendes tratamientos en cuotas, el facturado del mes será
mayor que el recaudo, y la diferencia está en cartera.

- Para saber **cuánto entró**: Ingresos y caja.
- Para saber **cuánto se vendió y con qué margen**: Resultados.
- Para saber **cuánto falta por cobrar**: Cartera.

## Las otras vistas

- **Caja**: el estado de la caja de cada sede, con sus sesiones y diferencias.
- **Egresos**: los gastos del periodo, filtrables por categoría y sede.

## Qué hacer con estos números

- **Procedimientos de margen bajo**: revisa el precio de lista o el costo del insumo.
  A veces el problema no es el precio, es el desperdicio de producto.
- **Procedimientos de margen alto y poca venta**: son los candidatos naturales para la
  próxima campaña.
- **Comparar sedes**: el mismo procedimiento con márgenes distintos por sede
  suele indicar diferencias de precio autorizado o de consumo de insumos.

## Permisos

Ver Resultados requiere el permiso de **reportes financieros**, distinto del
permiso de ver el dashboard. Es la separación entre quien necesita operar y quien
necesita ver la plata de la clínica.

> Mira los resultados con un periodo suficientemente largo. Un mes flojo puede ser
> estacionalidad; tres meses con el mismo margen bajo en un procedimiento es una
> decisión pendiente.
""",
    },
    {
        "slug": "el-dashboard-que-muestra-y-a-quien",
        "categoria": "caja-e-ingresos",
        "titulo": "El dashboard: qué muestra y a quién",
        "resumen": "Los bloques del tablero principal, cómo cambia según tu rol, qué periodos se pueden comparar y cómo usar el reporte de paquetes sin movimiento.",
        "area": "reportes",
        "keywords": "dashboard, tablero, indicadores, métricas, ocupación, resumen, inicio, kpi",
        "destacado": False,
        "contenido": """
El **Dashboard** es la primera pantalla al entrar y resume el estado de la
clínica. Lo que muestra depende de tu rol.

## Si eres profesional

Ves tu jornada:

- **Mis citas de hoy**, en orden.
- **Progreso del día**: cuántas atenciones llevas y cuántas faltan.
- **Accesos rápidos** a agenda, atenciones y pacientes.

## Si tienes visión de gestión

Además ves el estado del negocio, con un selector de periodo que compara hoy,
este mes, tres meses, seis meses o el último año:

- **Citas de hoy** de toda la clínica.
- **Cotizaciones** del periodo y cuántas se aceptaron.
- **Cartera**: saldo total y cuánto está vencido.
- **Cobros de hoy por medio de pago**, útil para cuadrar caja de un vistazo.
- **Procedimientos** más vendidos del periodo.
- **Ocupación por profesional**, comparando el periodo con el día.

Los bloques financieros solo aparecen si tu rol tiene el permiso de reportes
financieros. Si un compañero ve un bloque de dinero que tú no ves, es eso.

## Paquetes sin movimiento

Uno de los bloques más útiles: tratamientos **vendidos o importados a los que les
faltan sesiones y no tienen próxima cita** desde hace un mes o más. Son ingresos
comprometidos que se están enfriando.

Al tocar la tarjeta se abre el reporte completo:

- **Nunca agendados**: se vendieron o importaron y nunca tuvieron una cita en la
  app. Si son muchos, lo más probable es que se estén atendiendo por fuera de la
  agenda.
- **Por responsable**: quién vendió o importó cada paquete y cuántos de los suyos
  están quietos. Toca una fila para ver solo los de esa persona.
- **Por sede**, si tienes varias.
- Puedes cambiar los días (15, 30, 60 o 90), filtrar solo ventas o solo
  importados y exportar la lista a Excel.

Es la mejor lista de llamadas para una tarde de baja ocupación, y la forma de ver
si alguien está vendiendo sin agendar.

### Registrar sesiones hechas por fuera

Si las sesiones sí se hicieron pero nadie las agendó en la app, el administrador
(o quien tenga el permiso **Registrar sesiones hechas por fuera**) las pone al día
con el botón **Regularizar** de cada paquete:

1. Marca las sesiones que se hicieron.
2. Para cada una, indica la fecha (entre la venta o la carga y hoy) y el
   profesional que atendió. Si no se sabe quién fue, elige a quien registra y
   acláralo en la nota.
3. Elige **Solo la sesión** (con una nota corta opcional) o **Con nota clínica**:
   esta queda como una evolución en la historia del paciente, firmada por quien
   la escribe.

No se crean citas: esas sesiones no cuentan para ocupación, comisiones, insumos
ni ingresos, solo para el avance del paquete. Quedan marcadas como **registradas
después**, con quién y cuándo, y el reporte muestra cuántas lleva cada
responsable. Si te equivocas, **Deshacer** devuelve la sesión a pendiente (la
nota clínica no se borra: se agrega otra que anula el registro).

## Cómo usarlo en la rutina diaria

- **En la mañana**: revisa las citas del día y las confirmaciones pendientes.
- **A media tarde**: mira el progreso del día y la ocupación de los
  profesionales.
- **Al cierre**: cuadra cobros por medio de pago contra la caja.
- **Una vez por semana**: cotizaciones aceptadas, cartera vencida y paquetes sin
  movimiento.

> El dashboard sirve para decidir hoy. Para analizar tendencias, usa Resultados y
> los listados con sus filtros de periodo.
""",
    },
]

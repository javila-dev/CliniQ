"""Artículos de la categoría «Inventario y compras»."""

ARTICULOS = [
    {
        "slug": "inventario-de-insumos",
        "categoria": "inventario",
        "titulo": "Inventario de insumos",
        "resumen": "Cómo crear insumos, en qué se diferencia el consumo interno de la venta al público, cómo se mueve el stock y qué mirar para no quedarte sin producto.",
        "area": "configuracion",
        "keywords": "inventario, insumos, stock, existencias, consumo, retail, lote, costo, movimientos",
        "destacado": False,
        "contenido": """
El módulo de **Inventario** controla los insumos de la clínica: lo que se consume
en los procedimientos y lo que se vende al público.

## Crear un insumo

Cada insumo se define con:

| Campo | Para qué sirve |
|---|---|
| **Nombre** y **categoría** | Identificarlo y agruparlo |
| **Unidad de medida** | Unidad, mililitros, gramos, centímetros, par o caja |
| **Consumo interno** | Se usa durante los procedimientos |
| **Venta al público** | Se vende al paciente como producto |
| **Precio de venta** | Solo si se vende al público |
| **Stock mínimo** | El punto en que el insumo se marca como bajo |
| **Requiere lote** | Si hay que controlar lote y vencimiento |

Un insumo puede ser de consumo interno, de venta al público, o ambos, pero tiene
que ser al menos uno de los dos.

## Cómo se mueve el stock

Cada cambio de existencias queda registrado como un **movimiento**, con su tipo y
su origen:

| Tipo | Cuándo ocurre |
|---|---|
| **Entrada** | Llega mercancía, normalmente por una compra |
| **Salida** | Se consume en una atención o se vende al paciente |
| **Ajuste positivo o negativo** | Corrección tras un conteo físico |
| **Baja** | Producto vencido, dañado o perdido |

Cada movimiento guarda quién lo hizo, la cantidad, el costo y el **stock
resultante**, así que el inventario siempre se puede reconstruir hacia atrás.

## Costo promedio

Con cada entrada, CliniQ recalcula el **costo promedio** del insumo. Ese costo es
el que se usa para valorar el stock y para calcular el costo de insumos en el
reporte de resultados.

De ahí que valga la pena registrar las entradas con su costo real: de ese número
sale después el margen de cada servicio.

## Stock bajo

Un insumo cuyo stock actual está en o por debajo de su **stock mínimo** queda
marcado como bajo. Define el mínimo pensando en el consumo de dos o tres semanas
más el tiempo que tarda tu proveedor en entregar.

## Rutina recomendada

- **Al recibir mercancía**: registra la entrada el mismo día, con costo y lote si
  aplica.
- **Semanal**: revisa el listado de stock bajo y arma el pedido.
- **Mensual**: haz conteo físico de los insumos caros y ajusta las diferencias
  con su motivo escrito.
- **Mensual**: revisa vencimientos y da de baja lo que ya no se puede usar.

> Un inventario que no se ajusta después del conteo físico deja de servir en dos
> meses. Es preferible un ajuste incómodo y explicado que un número bonito que
> nadie cree.
""",
    },
    {
        "slug": "proveedores-y-ordenes-de-compra",
        "categoria": "inventario",
        "titulo": "Proveedores y órdenes de compra",
        "resumen": "Cómo registrar proveedores, crear una orden de compra, seguir sus estados y qué pasa con el inventario cuando llega la mercancía.",
        "area": "configuracion",
        "keywords": "proveedores, compras, orden de compra, pedido, recepción, mercancía, estados",
        "destacado": False,
        "contenido": """
## Proveedores

En **Proveedores** se registran las empresas a las que se les compra, con su
categoría: insumos médicos, productos de belleza, equipos, papelería u otros.

Tener el proveedor cargado con su contacto evita el clásico «¿alguien tiene el
número del que nos vende el ácido?» a las seis de la tarde.

## Órdenes de compra

Una **orden de compra** es el pedido formal a un proveedor. Se arma con los
insumos que se necesitan, sus cantidades y sus precios.

### Estados

| Estado | Qué significa |
|---|---|
| **Borrador** | Se está armando; todavía se edita |
| **Enviada** | Ya se le pasó al proveedor |
| **Recibida parcial** | Llegó una parte del pedido |
| **Recibida total** | Llegó todo |
| **Cancelada** | No se concretó |

Los estados intermedios existen porque los pedidos rara vez llegan completos a la
primera. Registrar la recepción parcial deja claro qué falta sin tener que
acordarse.

## Recepción de mercancía

Al registrar la recepción de una orden, las cantidades recibidas entran al
inventario como movimientos de **entrada por compra**, con su costo. Con eso se
actualizan el stock y el costo promedio del insumo.

## Rutina recomendada

1. Revisa el listado de **stock bajo** en Inventario.
2. Agrupa por proveedor y crea una orden por cada uno.
3. Envía la orden y márcala como enviada.
4. Al llegar la mercancía, **cuenta antes de registrar** y registra lo que
   realmente llegó, no lo que se pidió.
5. Guarda la factura como soporte del gasto.

## Permisos

Consultar y gestionar proveedores e inventario son permisos distintos. Lo
habitual: el equipo clínico consulta el stock, y solo administración crea órdenes
y registra recepciones.

> Registrar la compra con el precio real es lo que hace que el reporte de márgenes
> signifique algo. Si las entradas se cargan con precios viejos, el margen de cada
> servicio queda mejor de lo que es.
""",
    },
]

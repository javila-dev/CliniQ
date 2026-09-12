"""Artículos de la categoría «Cartera y cobros»."""

ARTICULOS = [
    {
        "slug": "como-leer-la-cartera-de-un-paciente",
        "categoria": "cartera-y-cobros",
        "titulo": "Cómo leer la cartera de un paciente",
        "resumen": "Qué significan total, abonado y saldo, cómo se forman las cuotas, cuándo una cuota se considera vencida y qué mira el listado general de cartera.",
        "area": "cartera",
        "keywords": "cartera, saldo, deuda, cuotas, abonos, pendiente, vencida, estado de cuenta",
        "destacado": False,
        "contenido": """
La cartera de un paciente nace cuando se **acepta una cotización**. No hay
carteras sueltas: cada cartera corresponde a una propuesta aceptada, con su total
y su plan de pago.

## Los tres números

| Número | Qué es |
|---|---|
| **Total** | El valor de la cotización aceptada |
| **Abonado** | La suma de todo lo que el paciente ha pagado, incluidos los abonos parciales |
| **Saldo** | Total menos abonado: lo que falta por cobrar |

## Las cuotas

Cada línea de forma de pago de la cotización se convirtió en una **cuota**, con:

- Su **tipo**: efectivo, transferencia, cuotas o financiamiento.
- Su **valor esperado**.
- Su **fecha esperada** de pago.
- Lo **abonado** hasta el momento y la fecha del último abono.
- Su **medio de pago** real, que puede diferir del tipo pactado.

Una cuota se marca como pagada solo cuando lo abonado **cubre todo** su valor
esperado. Mientras tanto queda con saldo, aunque ya tenga abonos parciales.

## Cuándo una cuota está vencida

Cuando tiene saldo pendiente **y** su fecha esperada ya pasó. Dos consecuencias:

- Aparece marcada como vencida en la cartera y en los reportes.
- Si la clínica bloquea la agenda por mora, puede impedir agendar y atender a
  ese paciente.

## El listado general

**Cartera** muestra todos los pacientes con su total, lo abonado y su saldo, con
filtros por estado y por sede. Es la lista de trabajo del área de cobranza: se
ordena por lo más vencido y se llama de arriba hacia abajo.

Arriba, el resumen muestra el total de cartera y cuánto de eso está vencido.

## Cuotas anuladas

Si un paciente renegoció su plan con un acuerdo de pago, las cuotas del plan
anterior quedan **anuladas**: dejan de contar para el saldo y para la mora, pero
se conservan para poder reconstruir la historia. Verás el plan viejo marcado como
reemplazado, junto al plan nuevo vigente.

## Cartera migrada

Los saldos de pacientes que venían de antes, cargados con el asistente de puesta
en marcha, entran a la cartera como deuda real: se cobran y generan mora igual
que cualquier otra. Lo que no hacen es contar como venta nueva del periodo, para
no inflar los reportes comerciales.

> Si el saldo de un paciente no coincide con lo que dice el mostrador, revisa
> primero si hay abonos parciales registrados en otra cuota y si hay un acuerdo
> de pago pendiente de firma. Esas dos cosas explican casi todas las diferencias.
""",
    },
    {
        "slug": "registrar-un-pago",
        "categoria": "cartera-y-cobros",
        "titulo": "Registrar un pago",
        "resumen": "Cómo aplicar un abono a la cuota correcta, qué medios de pago admite, cómo funcionan los pagos parciales y dónde queda reflejado el dinero recibido.",
        "area": "cartera",
        "keywords": "pago, abono, cobrar, recibir dinero, efectivo, transferencia, tarjeta, cuota, parcial",
        "destacado": False,
        "contenido": """
Los pagos se registran **sobre una cuota concreta** de la cartera del paciente,
no sobre la deuda en general. Elegir bien la cuota es lo que mantiene el plan de
pago ordenado.

## Paso a paso

1. Entra a **Cartera** y abre el paciente.
2. Ubica la **cuota** que está pagando. Normalmente es la más antigua con saldo.
3. Presiona **Registrar pago**.
4. Completa:
   - **Valor recibido**.
   - **Medio de pago**: efectivo, transferencia, tarjeta débito, tarjeta crédito
     u otro.
   - **Fecha del pago**.
   - **Referencia**, cuando aplique: número de transacción, últimos dígitos del
     comprobante.
   - **Observaciones**, si hay algo que explicar.
5. Guarda.

## Pagos parciales

Puedes registrar un abono menor al valor de la cuota. Los abonos **se acumulan**:
la cuota baja su saldo y solo se marca como pagada cuando lo acumulado cubre el
valor esperado.

Esto significa que una misma cuota puede recibir varios pagos, en fechas y con
medios distintos, y todos quedan registrados.

## Dónde se refleja el dinero

Un pago registrado en cartera aparece, además:

- En **Ingresos**, como parte del cobro de esa cotización, con su medio de pago.
- En el **cierre de caja** de la sede, si fue en efectivo.
- En el **dashboard**, en los cobros del día por medio de pago.

No hay que registrarlo dos veces: con hacerlo en la cartera del paciente basta.

## Qué no se puede hacer

- **Cobrar una cuota ya cubierta.** Si ya está pagada, CliniQ lo rechaza; el
  abono probablemente va en otra cuota.
- **Cobrar mientras hay un acuerdo de pago pendiente de firma.** El plan está en
  revisión: primero se firma el acuerdo o se cancela.

## Corregir un error

Si registraste un pago mal, no lo «arregles» con otro pago en sentido contrario.
Revisa el cobro asociado en Ingresos, que se puede anular con el permiso
correspondiente, y vuelve a registrarlo bien. Así el rastro queda claro.

> Registra los pagos el mismo día que entra el dinero. Un pago cargado tres días
> después descuadra el cierre de caja, dispara alertas de mora falsas y hace que
> alguien llame a cobrarle a un paciente que ya pagó.
""",
    },
    {
        "slug": "mora-bloqueo-de-agenda-y-excepciones",
        "categoria": "cartera-y-cobros",
        "titulo": "Mora, bloqueo de agenda y excepciones",
        "resumen": "Cómo se decide que un paciente está en mora, qué hace el bloqueo por deuda, cómo funcionan los días de gracia y quién puede autorizar una excepción.",
        "area": "cartera",
        "keywords": "mora, deuda, vencida, bloqueo, excepción, días de gracia, no deja agendar, autorizar",
        "destacado": False,
        "contenido": """
## Cuándo hay mora

Un paciente está en mora cuando tiene al menos una cuota con **saldo pendiente**
y con **fecha esperada ya vencida**. No importa cuánto deba en total: importa que
una fecha pactada pasó sin pagarse.

## El bloqueo por deuda

Es una opción de la clínica, apagada por defecto. Cuando está activa:

- **No se pueden crear citas** para un paciente con cuotas vencidas.
- **No se puede iniciar la atención** de un paciente en mora.

En ambos casos aparece un aviso con cuántas cuotas están vencidas y por cuánto.
No es un error del sistema: es la política de cobro de la clínica aplicándose.

## Días de gracia

Junto al bloqueo se configura un número de **días de gracia** después del
vencimiento. Con tres días de gracia, una cuota vencida ayer todavía no bloquea;
una vencida hace una semana sí.

Sirve para no castigar al paciente que paga con un día de retraso y sí frenar al
que lleva semanas.

## Excepciones

Cuando hay que atender igual, alguien con el permiso **Aprobar excepción de
cartera** puede autorizar una excepción sobre la cuota vencida. Con la excepción
aprobada, esa cuota deja de bloquear, aunque la deuda sigue viva y visible.

La excepción queda registrada con quién la aprobó. Úsala para casos puntuales
—un paciente que viene desde lejos, una sesión que no se puede posponer—, no como
la vía normal de saltarse el bloqueo.

## Modificar el plazo

Otro permiso, **Modificar plazo de cartera**, permite cambiar la fecha o el monto
esperado de una cuota. Es útil para corregir un error de digitación en el plan de
pago.

Para renegociar de verdad un plan completo, la herramienta correcta no es esta
sino el acuerdo de pago, que deja el cambio firmado por el paciente. Ver
[Acuerdos de pago](/ayuda/articulo/acuerdos-de-pago).

## Cómo trabajar la mora

1. Revisa el listado de cartera ordenado por lo más vencido.
2. Llama y registra el resultado de la gestión en las observaciones de la cuota.
3. Si el paciente puede pagar distinto, propón un acuerdo de pago en vez de
   correr la fecha una y otra vez.
4. Reserva las excepciones para casos justificados.

> Un bloqueo que se levanta con excepción cada vez que el paciente protesta deja
> de ser una política. Si el equipo lo está usando todos los días, la discusión
> real es sobre la política, no sobre el sistema.
""",
    },
    {
        "slug": "acuerdos-de-pago",
        "categoria": "cartera-y-cobros",
        "titulo": "Acuerdos de pago",
        "resumen": "Cómo renegociar el plan de cuotas de un paciente: qué valida CliniQ al proponer el plan nuevo, por qué solo entra en vigencia al firmarse el acta y cómo se anula.",
        "area": "cartera",
        "keywords": "acuerdo, renegociar, refinanciar, plan de pago, acta, firma, cuotas nuevas, mora",
        "destacado": False,
        "contenido": """
Un **acuerdo de pago** reemplaza el plan de cuotas pendiente de un paciente por
uno nuevo: otras fechas, otros montos, el mismo saldo. Es la forma ordenada de
resolver una mora sin borrar el rastro de lo que se pactó antes.

## Cuándo usarlo

- El paciente no puede pagar como se pactó y propone otra distribución.
- Hay varias cuotas vencidas y quieres reordenar todo el saldo restante.
- Vas a dar un plazo distinto y quieres que quede firmado, no de palabra.

Para corregir un simple error de digitación en una fecha, basta con modificar la
cuota, si tienes el permiso. El acuerdo es para renegociaciones reales.

## Cómo se crea

1. Abre la cartera del paciente y crea un **acuerdo de pago**.
2. Escribe el **motivo**. Es obligatorio y es lo que después explica por qué se
   renegoció.
3. Arma el **plan nuevo**: una o más cuotas, cada una con tipo, descripción,
   valor y fecha.
4. Guarda. CliniQ genera el **acta del acuerdo** para que el paciente la firme.

## Lo que CliniQ valida

- El plan debe tener **al menos una cuota**.
- Cada cuota debe tener **valor mayor a cero** y **fecha no pasada**.
- La **suma de las cuotas nuevas debe ser exactamente el saldo pendiente**. Si no
  cuadra, el sistema dice cuánto sobra o falta.
- Solo puede haber **un acuerdo pendiente de firma** por cartera. Si ya hay uno,
  fírmalo o cancélalo antes de crear otro.

Un acuerdo no perdona deuda: redistribuye el saldo. Si quieres condonar un valor,
eso es otra decisión y se maneja aparte.

## El acuerdo solo vale firmado

Al crearse, el acuerdo queda **pendiente de firma** y **no toca la cartera**: el
plan viejo sigue rigiendo, las cuotas anteriores siguen vigentes y la mora se
sigue calculando sobre ellas.

Cuando se confirma la firma del acta:

1. Las cuotas pendientes del plan anterior quedan **anuladas**.
2. Se crean las **cuotas nuevas** del acuerdo.
3. El acuerdo pasa a **vigente** y la mora se recalcula sobre el plan nuevo.

Mientras un acuerdo está pendiente de firma no se pueden registrar pagos sobre
las cuotas involucradas: el plan está en revisión.

## Los estados

| Estado | Qué significa |
|---|---|
| **Pendiente de firma** | Propuesto, el acta espera la firma del paciente |
| **Vigente** | Firmado y aplicado; es el plan que rige |
| **Anulado** | Se canceló antes de entrar en vigencia |
| **Requiere revisión** | Algo quedó a medias en la aplicación y hay que revisarlo |

## Anular un acuerdo

Un acuerdo que todavía no entró en vigencia se puede anular indicando el motivo.
El acta se revoca y el plan original sigue como estaba, intacto.

> Explícale al paciente que el nuevo plan empieza a regir **cuando firma**, no
> cuando se acuerda de palabra. Es la fuente número uno de malentendidos con los
> acuerdos.
""",
    },
    {
        "slug": "el-compromiso-de-pago",
        "categoria": "cartera-y-cobros",
        "titulo": "El compromiso de pago",
        "resumen": "Qué es el documento que el paciente firma al aceptar una cotización, cómo se activa para toda la clínica y por qué la cotización se acepta sola al firmarse.",
        "area": "cartera",
        "keywords": "compromiso de pago, documento, firma, aceptación, cotización, promocional, cartera",
        "destacado": False,
        "contenido": """
El **compromiso de pago** es el documento en que el paciente reconoce lo que
compró y cómo lo va a pagar. Se genera al aceptar una cotización, cuando la
clínica lo tiene activado.

## Cómo se activa

En **Configuración → Otros documentos** hay un interruptor: o la clínica exige
compromiso de pago en todas sus cotizaciones, o no lo exige en ninguna. No es una
decisión caso por caso.

El texto del documento es **estándar y no editable**. Es intencional: el contenido
legal es responsabilidad de la clínica y se define una vez, no se improvisa por
paciente.

## Cómo funciona el flujo

1. Se arma la cotización con sus ítems y sus formas de pago.
2. Al aceptarla, CliniQ genera el compromiso de pago con esos datos.
3. El paciente lo firma, en la clínica o por un enlace enviado a su teléfono.
4. **Al confirmarse la firma, la cotización queda aceptada** y se crean su
   cartera y sus cuotas.

Es decir: con el compromiso activo, la firma es la que cierra la venta. Nadie
tiene que volver a marcar la cotización como aceptada.

## Dónde queda el documento

En el módulo de **Consentimientos**, junto con los demás documentos firmados del
paciente, con su estado y su PDF descargable. También se puede consultar desde la
cotización.

## Si el paciente no firma

La cotización se queda en borrador y no se crea cartera. Revisa dos cosas:

- Que el enlace haya llegado al teléfono o correo correcto.
- Que el documento no esté esperando una firma que quedó a medias en el
  dispositivo del paciente.

Si el paciente firmó y aun así la cotización sigue en borrador, vuelve a abrir el
documento: la confirmación puede tardar unos segundos en llegar.

## Cuándo conviene activarlo

- Si vendes tratamientos en cuotas y necesitas respaldo de lo pactado: sí.
- Si cobras todo de contado en la misma sesión: probablemente no lo necesites, y
  agrega un paso al mostrador.

> El compromiso de pago no reemplaza al consentimiento informado. Uno es sobre el
> dinero, el otro sobre el procedimiento, y ambos pueden ser necesarios en la
> misma venta.
""",
    },
]

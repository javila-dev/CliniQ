"""Artículos de la categoría «Consentimientos y firmas»."""

ARTICULOS = [
    {
        "slug": "consentimientos-informados-como-funcionan",
        "categoria": "consentimientos",
        "titulo": "Consentimientos informados: cómo funcionan",
        "resumen": "Cómo se configuran los formatos, cómo se asocian a los procedimientos, cuándo los pide CliniQ solo y qué significan sus estados.",
        "area": "consentimientos",
        "keywords": "consentimiento, informado, firma, documento, plantilla, procedimiento, legal, pendiente",
        "destacado": True,
        "contenido": """
Un consentimiento informado es el documento en que el paciente declara que
entiende el procedimiento y lo autoriza. En CliniQ deja de ser un papel suelto:
queda ligado al paciente, a la cita y al procedimiento que lo exigió.

## Cómo se configura

En **Configuración → Consentimientos informados**:

1. **Sube el formato** de tu clínica.
2. **Marca en el documento** dónde va la firma del paciente y los campos que se
   deben llenar.
3. **Asócialo a los procedimientos** que lo exigen.

El contenido del documento lo define la clínica: CliniQ se encarga de pedirlo,
recogerlo firmado y archivarlo, no de redactarlo.

Un procedimiento puede exigir **más de un consentimiento**, y el mismo formato
puede usarse en varios procedimientos.

## Cuándo se piden

No hay que acordarse de nada. Cuando un paciente va a recibir un procedimiento
que exige consentimiento:

- En la **cola de atención** el paciente muestra un escudo ámbar si le falta
  alguno, y verde si están todos al día.
- En el **asistente de inicio de atención** aparece el paso de consentimiento con
  los documentos pendientes, y se firman ahí mismo.
- La atención no debería iniciarse con consentimientos pendientes: ese paso no se
  puede desactivar.

## Los estados

| Estado | Qué significa |
|---|---|
| **Pendiente** | Generado y a la espera de la firma del paciente |
| **Firmado** | El paciente firmó; queda el PDF con fecha y hora |
| **Revocado** | Se dejó sin efecto, con su motivo registrado |

Cada firma queda con su marca de tiempo y los datos técnicos del dispositivo
desde el que se firmó. Eso es lo que da valor probatorio al documento.

## Dónde se consultan

El módulo **Consentimientos** lista todos los documentos de la clínica, con su
paciente, su estado y su PDF descargable. Desde la ficha del paciente se ven los
suyos.

## Los permisos

| Permiso | Para qué |
|---|---|
| **Ver consentimientos** | Consultar documentos y su estado |
| **Generar** | Crear el documento para que el paciente firme |
| **Gestionar** | Administrar los formatos y su configuración |
| **Revocar** | Dejar un consentimiento sin efecto |

> Un consentimiento firmado hace tres años para el mismo procedimiento no
> necesariamente sigue sirviendo. Revisa con tu asesoría jurídica cada cuánto
> conviene repetirlos y usa la vigencia como parte de la política de la clínica.
""",
    },
    {
        "slug": "firmar-en-la-clinica-o-enviar-el-enlace",
        "categoria": "consentimientos",
        "titulo": "Firmar en la clínica o enviar el enlace al paciente",
        "resumen": "Las dos formas de recoger una firma digital, cuándo conviene cada una, qué hacer si el paciente no recibe el enlace y qué alternativas hay si no puede firmar digital.",
        "area": "consentimientos",
        "keywords": "firmar, firma digital, enlace, link, whatsapp, tableta, presencial, documenso, escaneado",
        "destacado": False,
        "contenido": """
Cuando hay que recoger una firma, CliniQ ofrece dos caminos. Los dos producen el
mismo documento firmado.

## Firmar en la clínica

El documento se abre en la pantalla de la clínica y el paciente firma ahí mismo,
en una tableta o en el computador del mostrador.

**Conviene cuando** el paciente ya está presente y el procedimiento es hoy. Es lo
más rápido y evita depender de su teléfono.

## Enviar el enlace al paciente

Se le envía un enlace por WhatsApp y el paciente firma **desde su propio
teléfono**. La pantalla de la clínica se queda esperando y se actualiza sola en
cuanto la firma llega.

**Conviene cuando**:

- El paciente todavía no llegó y quieres adelantar el trámite.
- Quieres que lea el documento con calma, no de pie en el mostrador.
- Es un documento económico, como el compromiso de pago, que el paciente puede
  querer revisar antes de firmar.

También se puede copiar el enlace para enviarlo por otro medio.

## Si el paciente no recibe el enlace

1. Verifica el **teléfono** en la ficha del paciente. Es la causa más frecuente.
2. Pídele que revise los archivados o los mensajes de números desconocidos.
3. Reenvía el enlace o cambia a firma en la clínica.

## Si la firma no aparece como confirmada

Después de firmar, la confirmación puede tardar unos segundos. Si pasa un rato y
sigue pendiente, vuelve a abrir el documento para forzar la verificación. Si
persiste, revisa la conexión del dispositivo donde firmó el paciente.

## Alternativas a la firma digital

Cuando el paciente no puede firmar digital, hay dos caminos de respaldo:

- **Documento físico escaneado**: se imprime, se firma a mano y se carga el
  archivo firmado.
- **Confirmación del profesional**: el profesional deja constancia de que el
  consentimiento se explicó y se firmó en papel.

Ambos dejan registro de que el consentimiento existió y de cómo se recogió. Úsalos
como excepción, no como norma: el papel se pierde, el archivo digital no.

> Nunca firmes por el paciente «para agilizar». Un consentimiento firmado por
> otra persona no protege a nadie, y sí deja constancia de una irregularidad.
""",
    },
    {
        "slug": "firma-del-registro-de-asistencia",
        "categoria": "consentimientos",
        "titulo": "La firma del registro de asistencia",
        "resumen": "Qué es el documento que el paciente firma al final de la preparación, en qué se diferencia del consentimiento y qué hacer si queda pendiente.",
        "area": "consentimientos",
        "keywords": "asistencia, registro, firma, constancia, sesión, plantilla, soporte",
        "destacado": False,
        "contenido": """
El **registro de asistencia** es la constancia de que el paciente estuvo en la
clínica y recibió su sesión. Es el último paso del asistente de inicio de
atención, cuando la clínica lo tiene activado.

## En qué se diferencia del consentimiento

| | Consentimiento informado | Registro de asistencia |
|---|---|---|
| **Qué dice** | El paciente autoriza el procedimiento | El paciente asistió y recibió la sesión |
| **Cuándo** | Antes del procedimiento, una vez por procedimiento | En cada sesión |
| **Para qué sirve** | Respaldo clínico y legal del acto | Soporte de que la sesión se prestó |

En tratamientos vendidos por paquete, el registro de asistencia es lo que sostiene
que cada sesión efectivamente se entregó. Es especialmente útil cuando un paciente
reclama sesiones que ya recibió.

## Cómo se firma

Igual que los demás documentos: en un dispositivo de la clínica, o con un enlace
enviado al teléfono del paciente. Mientras el paciente firma en su celular, la
pantalla del asistente espera y se actualiza sola al recibir la firma.

## Los estados

| Estado | Qué significa |
|---|---|
| **Sin firma** | Todavía no se ha generado ni enviado |
| **Enviada** | El documento está esperando la firma |
| **Firmada** | Listo; queda el PDF asociado a la cita |
| **Rechazada** | El paciente no firmó |

## Si queda pendiente

- Confirma que el paciente recibió el enlace y terminó de firmar en su
  dispositivo.
- Espera unos segundos: la confirmación puede tardar.
- Si el paso está bloqueando la atención y el paciente ya está en el consultorio,
  un administrador puede desactivar este paso para toda la clínica, pero eso es
  una decisión de política, no un parche del día.

## Configuración

Las plantillas del registro de asistencia se administran en **Configuración →
Plantillas de asistencia**, y el paso se activa o desactiva desde la
configuración del asistente de atención.

> Si tu clínica vende paquetes de varias sesiones, deja este paso activo. Es el
> documento que evita la discusión de «yo solo vine tres veces».
""",
    },
    {
        "slug": "revocar-o-repetir-un-consentimiento",
        "categoria": "consentimientos",
        "titulo": "Revocar o repetir un consentimiento",
        "resumen": "Qué hacer cuando un consentimiento se firmó por error, cuando el paciente retira su autorización o cuando el formato cambió y hay que volver a firmarlo.",
        "area": "consentimientos",
        "keywords": "revocar, anular, repetir, corregir, versión, nueva firma, retirar autorización",
        "destacado": False,
        "contenido": """
## Revocar

Revocar deja un consentimiento **sin efecto**, conservando el documento original y
registrando el motivo, la fecha y quién lo hizo. Es la vía correcta cuando:

- El paciente **retira su autorización** para el procedimiento.
- El documento se firmó **para el paciente equivocado**.
- Se firmó un formato que no correspondía.

Requiere el permiso de revocar consentimientos.

Revocar no borra nada. Un consentimiento revocado sigue existiendo en el
histórico, marcado como tal. Es lo correcto: eliminar un documento firmado deja un
vacío que después no se puede explicar.

## Repetir la firma

Hay que volver a firmar cuando:

- **Cambió el formato** del consentimiento y el paciente inicia un tratamiento
  nuevo con la versión actualizada.
- **Pasó el tiempo** que la clínica definió como vigencia razonable.
- El paciente va a recibir **otro procedimiento** que exige su propio
  consentimiento.

Cada versión del formato queda identificada, así que se puede saber exactamente
qué texto firmó cada paciente y cuándo.

## Actualizar un formato

Si editas el contenido de un formato en Configuración, se registra como una
**versión nueva**. Los consentimientos ya firmados conservan el texto con el que se
firmaron: nadie queda atado retroactivamente a un texto que no leyó.

## Qué no hacer

- **No borres** consentimientos firmados para «limpiar» el listado.
- **No reutilices** el consentimiento de un procedimiento para otro distinto.
- **No firmes de nuevo encima** de un documento incorrecto: revócalo y genera el
  correcto, para que quede claro qué pasó.

> Cuando un paciente pide retirar su autorización, revoca el consentimiento y
> déjalo por escrito en su historia clínica. La revocación explica el documento;
> la nota clínica explica la decisión.
""",
    },
]

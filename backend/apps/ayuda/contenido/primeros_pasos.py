"""Artículos de la categoría «Primeros pasos»."""

ARTICULOS = [
    {
        "slug": "que-es-cliniq-y-como-se-organiza",
        "categoria": "primeros-pasos",
        "titulo": "¿Qué es CliniQ y cómo se organiza?",
        "resumen": "Un recorrido por los módulos de la aplicación y por el camino que recorre un paciente, desde que pide una cita hasta que termina de pagar su tratamiento.",
        "area": "general",
        "keywords": "introducción, empezar, módulos, menú, para qué sirve, visión general, tour",
        "destacado": True,
        "contenido": """
CliniQ reúne en un solo lugar todo lo que pasa alrededor de un paciente de tu
clínica: la cita, la atención, la historia clínica, la propuesta comercial, el
cobro y los documentos firmados. La idea de fondo es que **cada dato se registre
una sola vez** y que los demás módulos lo aprovechen.

## Los módulos

| Módulo | Para qué sirve |
|---|---|
| **Dashboard** | Resumen del día y del periodo: citas, cotizaciones, cartera y ocupación. |
| **Atenciones** | La cola de pacientes del día y la pantalla donde el profesional atiende. |
| **Agenda** | Calendario de citas por sede y profesional, con confirmaciones y bloqueos. |
| **Pacientes** | Ficha, antecedentes, historia clínica y fotos de evolución. |
| **Cotizaciones** | Propuestas de tratamiento con precios, descuentos y forma de pago. |
| **Cartera** | Lo que cada paciente debe: cuotas, abonos, mora y acuerdos de pago. |
| **Ingresos** | Los cobros y pagos recibidos, con su medio de pago y su estado. |
| **Resultados** | Facturación, costo de insumos, margen y caja de cada sede. |
| **Consentimientos** | Documentos que el paciente firma, con su estado y su PDF. |
| **Campañas** | Precios promocionales vigentes por temporada y por sede. |
| **Configuración** | Catálogo de servicios, sedes, equipo, roles y preferencias. |

No todos los módulos aparecen para todo el mundo. El menú lateral se arma según
los permisos de tu rol, así que si un compañero ve una opción que tú no ves, es
una diferencia de permisos y no un error. Lo explicamos en
[Qué hacer si una opción no te aparece](/ayuda/articulo/que-hacer-si-una-opcion-no-te-aparece).

## El camino típico de un paciente

1. **Se crea la ficha del paciente** con sus datos de identificación y contacto.
2. **Se agenda una cita** con profesional, sede y motivo o servicio.
3. **El paciente llega** y recepción registra la llegada; queda en la cola de
   espera del día.
4. **Antes de pasar**, el asistente de inicio de atención revisa lo que la
   clínica exija: consentimientos firmados, cobro de la sesión y firma del
   registro de asistencia.
5. **El profesional atiende** y deja la nota clínica: motivo de consulta,
   hallazgos, plan de manejo, fotos, órdenes médicas.
6. **Si hay una propuesta de tratamiento**, se arma una cotización con sus
   ítems y su forma de pago.
7. **Al aceptarse la cotización**, CliniQ crea la cartera del paciente con las
   cuotas pactadas y habilita el agendamiento de las sesiones del tratamiento.
8. **Cada pago** se registra contra esas cuotas y aparece en ingresos y en el
   cierre de caja de la sede.

## Cómo se conecta todo

La conexión entre módulos es lo que evita el doble trabajo:

- El **catálogo** define cuánto dura un procedimiento y cuántas sesiones tiene
  un tratamiento; de ahí salen la duración de la cita y el número de sesiones
  agendables.
- La **cotización aceptada** crea la cartera y las cuotas, y deja registrado
  qué sesiones quedan por agendar.
- La **cita atendida** consume una sesión del tratamiento y deja su nota en la
  historia clínica del paciente.
- El **cobro** se refleja en ingresos, en la cartera del paciente y en el cierre
  de caja.
- Los **consentimientos** quedan atados a la cita o a la cotización que los
  exigió, con su PDF firmado.

> Si algo no cuadra en un módulo, casi siempre el origen está un paso antes en
> esta cadena. Por ejemplo: un tratamiento que no deja agendar más sesiones
> suele significar que ya se agendaron todas las que incluía la cotización.
""",
    },
    {
        "slug": "checklist-de-configuracion-inicial",
        "categoria": "primeros-pasos",
        "titulo": "Checklist: qué configurar antes de empezar",
        "resumen": "El orden recomendado para dejar lista la clínica: datos generales, sedes, equipo, roles, catálogo, consentimientos y preferencias de atención y cobro.",
        "area": "configuracion",
        "keywords": "configurar, arranque, implementación, onboarding, puesta a punto, primer día, qué hacer primero",
        "destacado": True,
        "contenido": """
Este es el orden que recomendamos para montar la clínica. Cada paso se apoya en
el anterior, así que seguirlo evita tener que volver atrás a corregir.

## 1. Datos de la clínica

En **Configuración → General** carga el nombre, el NIT, el teléfono y el logo.
El logo aparece en los documentos que se generan, así que conviene subir una
imagen de buena calidad.

Aquí también defines dos cosas que afectan el día a día:

- **Frecuencia de turnos**: cada cuántos minutos se corta la agenda, 15 minutos
  por defecto. Es la rejilla sobre la que se ubican las citas.
- **Recordatorios**: si se envían automáticamente y con cuánta anticipación.

## 2. Sedes

En **Configuración → Sedes** crea una sede por cada ubicación física, con su
dirección, teléfono y horario de atención. Todo en CliniQ vive en una sede: las
citas, los cobros, la caja y los reportes se filtran por ella.

## 3. Equipo y roles

Primero revisa los **roles** en Configuración → Roles y permisos, y después crea
los **usuarios** en Configuración → Usuarios. Hacerlo en ese orden te deja
asignar el rol correcto desde el inicio, en vez de corregirlo después.

Marca como profesionales a quienes atienden pacientes: solo ellos pueden
aparecer en la agenda como responsables de una cita.

## 4. Catálogo de servicios

Es la parte que más tiempo toma y la que más rinde después.

1. **Procedimientos**: cada unidad clínica que ejecutas, con su duración y su
   precio. La duración es la que propone la agenda al crear una cita.
2. **Tratamientos**: paquetes que agrupan procedimientos, con su precio y sus
   tipos de sesión. De ahí sale cuántas sesiones se pueden agendar cuando se
   vende el tratamiento.

Lo explicamos con detalle en
[Procedimientos y tratamientos](/ayuda/articulo/procedimientos-y-tratamientos-en-que-se-diferencian).

## 5. Consentimientos

Sube tus formatos en **Configuración → Consentimientos informados**, marca en
cada uno dónde va la firma y asócialos a los procedimientos que los exigen. A
partir de ahí, CliniQ pide la firma cuando corresponde, sin que nadie tenga que
acordarse.

## 6. Preferencias de atención y cobro

- **Pantalla de atención** e **Historia clínica**: elige qué pestañas ve el
  profesional, para no mostrar campos que tu clínica no usa.
- **Otros documentos**: decide si al aceptar una cotización se exige un
  compromiso de pago firmado.
- **Cajas y categorías de gasto**: si vas a manejar efectivo, define la caja de
  cada sede, su fondo inicial y su responsable.

## 7. Datos que ya traes

Si ya venías trabajando con pacientes a mitad de tratamiento, no los cargues
como si empezaran de cero. Usa el asistente de
[puesta en marcha](/ayuda/articulo/puesta-en-marcha-cargar-pacientes-en-curso),
que registra lo que ya pagaron, las sesiones que ya hicieron y el saldo que
queda pendiente.

> Antes de abrir la aplicación a todo el equipo, haz una prueba completa con un
> paciente de prueba: agéndalo, atiéndelo, cotízale un tratamiento, acéptalo y
> regístrale un pago. En media hora detectas lo que falta configurar.
""",
    },
    {
        "slug": "como-moverte-por-cliniq",
        "categoria": "primeros-pasos",
        "titulo": "Cómo moverte por CliniQ",
        "resumen": "El menú lateral, los encabezados de página, la búsqueda, el código de colores de los estados y el trabajo con varias sedes.",
        "area": "general",
        "keywords": "menú, navegación, buscar, interfaz, dónde está, moverse, pantallas, colores, estados",
        "destacado": False,
        "contenido": """
## El menú lateral

Es la columna oscura de la izquierda y está agrupado por bloques, según el
momento del día:

- **Atención**: Atenciones, Agenda y Pacientes. Es lo que usan recepción y el
  profesional durante la jornada.
- **Ventas**: Cotizaciones y Campañas.
- **Finanzas**: Resultados, Ingresos y Cartera.
- Abajo, **Configuración** y el **Centro de ayuda**.

Arriba del menú aparece el nombre de la clínica en la que estás trabajando y
abajo tu usuario, con acceso a tu perfil y a cerrar sesión.

El menú **solo muestra lo que tu rol permite ver**. Si trabajas en recepción
probablemente no veas Resultados, y si eres profesional puede que no veas
Configuración. Es intencional.

## Los encabezados de cada página

Casi todas las pantallas tienen el mismo encabezado: el título, una descripción
corta, el botón de la acción principal a la derecha y, en varias de ellas, un
botón de ayuda con un signo de pregunta. Ese botón abre directamente el artículo
de esta ayuda que explica esa pantalla.

## Buscar

- En **Pacientes** puedes buscar por nombre, apellido o número de documento.
- En **Agenda** los filtros de arriba te dejan moverte por día, semana o mes y
  filtrar por sede y por profesional.
- En el **Centro de ayuda**, el buscador de la portada busca en el título, el
  resumen y las palabras clave de todos los artículos, y responde a medida que
  escribes.

## Estados y colores

CliniQ usa etiquetas de color para los estados, con el mismo criterio en toda la
aplicación:

- **Ámbar o amarillo**: algo está pendiente y espera una acción.
- **Azul o violeta**: en proceso.
- **Verde**: completado o pagado.
- **Rojo**: cancelado, anulado o vencido.
- **Gris**: sin efecto, como una cita a la que el paciente no asistió.

## Trabajar en varias sedes

Si tu clínica tiene más de una sede, casi todas las pantallas tienen un selector
de sede. El filtro que elijas se mantiene mientras navegas, así que si un listado
aparece vacío, revisa primero qué sede y qué rango de fechas tienes puestos.

> Una sola sesión por usuario: si inicias sesión en otro equipo o en otro
> navegador, la sesión anterior se cierra. Las cuentas son personales y no se
> comparten entre varias personas del mostrador.
""",
    },
    {
        "slug": "tu-perfil-y-la-seguridad-de-tu-cuenta",
        "categoria": "primeros-pasos",
        "titulo": "Tu perfil y la seguridad de tu cuenta",
        "resumen": "Cómo actualizar tus datos, cargar tu firma digital y tu registro profesional, cambiar la contraseña y qué significa que solo puedas tener una sesión abierta.",
        "area": "configuracion",
        "keywords": "perfil, contraseña, clave, firma, registro médico, foto, sesión, seguridad, olvidé mi contraseña",
        "destacado": False,
        "contenido": """
Tu perfil está en el menú lateral, abajo, sobre el botón de cerrar sesión.

## Datos personales

Puedes actualizar tu nombre, tu teléfono y tu foto. El nombre es el que verán
tus compañeros en la agenda, en las notas clínicas y en el historial de
acciones, así que vale la pena escribirlo completo y bien.

## Firma digital y registro profesional

Si atiendes pacientes, carga dos cosas:

- **Registro profesional**: el número de tu tarjeta o registro.
- **Firma digital**: una imagen de tu firma, idealmente sobre fondo blanco o
  transparente y bien recortada.

Ambos se imprimen en los documentos que generas, como las órdenes médicas. Sin
ellos, el documento sale sin firmar y toca firmarlo a mano.

## Contraseña

Cambia tu contraseña desde el perfil cuando quieras. Si la olvidaste, usa
**¿Olvidaste tu contraseña?** en la pantalla de inicio de sesión: llega un correo
con un enlace temporal para definir una nueva.

Si nunca activaste tu cuenta, el enlace que te llegó al crearla es de un solo uso
y vence. Si ya venció, pídele a un administrador que te reenvíe la invitación.

## Una sola sesión activa

CliniQ mantiene **una sesión por usuario**. Si inicias sesión en otro
dispositivo, la sesión anterior se cierra sola. Es una protección: si tu sesión
se cierra sin que hayas hecho nada, puede ser que alguien más esté entrando con
tu cuenta, y ahí lo correcto es cambiar la contraseña y avisar a un
administrador.

## Buenas prácticas

- No compartas tu usuario. Todo lo que se hace queda registrado a nombre de
  quien tenía la sesión abierta, y eso es lo que se revisa cuando hay una
  diferencia en caja o un cambio que nadie reconoce.
- Cierra sesión al terminar tu turno si el equipo es compartido.
- Pide solo los permisos que necesitas para tu trabajo. Es más fácil ampliarlos
  después que explicar un borrado accidental.
""",
    },
    {
        "slug": "que-hacer-si-una-opcion-no-te-aparece",
        "categoria": "primeros-pasos",
        "titulo": "Qué hacer si una opción no te aparece",
        "resumen": "Por qué a veces falta un botón, un módulo o un dato en pantalla, y cómo distinguir si es un tema de permisos, de filtros, de configuración o de un paso previo pendiente.",
        "area": "general",
        "keywords": "no me aparece, no puedo, falta botón, sin permiso, oculto, no veo, error, bloqueado, problema",
        "destacado": False,
        "contenido": """
Casi siempre que «falta algo» en CliniQ hay una de estas cinco explicaciones.
Revísalas en este orden.

## 1. Tu rol no tiene el permiso

Es la causa más común. El menú, los botones y hasta algunas columnas se muestran
según los permisos de tu rol. No es un error: alguien decidió que ese rol no
hace esa tarea.

**Qué hacer**: pídele a un administrador que revise tu rol en Configuración →
Roles y permisos. Explica qué tarea necesitas hacer, no qué botón quieres ver;
así puede darte el permiso exacto en vez de abrirte de más.

## 2. Los datos están enmascarados

Si ves el documento, el teléfono o el correo de un paciente con puntos o
asteriscos, tu rol no tiene el permiso de ver datos sensibles. La ficha funciona
igual para todo lo demás. Lo explicamos en
[Datos sensibles del paciente](/ayuda/articulo/datos-sensibles-quien-puede-verlos).

## 3. Estás filtrando por otra sede o por otra fecha

Los listados recuerdan el último filtro que usaste. Si una cita, un cobro o un
paciente «desapareció», revisa el selector de sede y el rango de fechas antes de
pensar en un error.

## 4. La función depende de una configuración de la clínica

Varias cosas están apagadas hasta que alguien las enciende:

- Los pasos de **llegada**, **cobro** y **firma de asistencia** del asistente de
  inicio de atención se activan o desactivan por clínica.
- El **compromiso de pago** al aceptar una cotización es opcional.
- Las pestañas de la **historia clínica** y de la **pantalla de atención** se
  eligen una por una.
- Los **módulos adicionales**, como el de obesidad o la verificación facial, se
  habilitan por clínica.

**Qué hacer**: revisa la sección correspondiente de Configuración, o pregúntale
a quien administra la clínica.

## 5. Falta un paso previo

Algunas acciones exigen que exista algo antes:

- No puedes agendar las sesiones de un tratamiento si la cotización todavía no
  está aceptada.
- No puedes registrar un gasto si la caja de la sede no está abierta.
- No puedes iniciar una atención si tienes otra atención abierta sin cerrar.
- No puedes crear un acuerdo de pago si la cartera no tiene saldo pendiente.

Cuando es esto, CliniQ suele decirlo en el mensaje de error. Vale la pena leerlo
completo antes de reintentar.

> Si después de revisar estos cinco puntos la función sigue sin aparecer, anota
> qué estabas haciendo, en qué pantalla y con qué paciente, y repórtalo. Con esos
> tres datos se resuelve mucho más rápido.
""",
    },
]

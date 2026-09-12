"""Artículos de la categoría «Pacientes e historia clínica»."""

ARTICULOS = [
    {
        "slug": "registrar-un-paciente-nuevo",
        "categoria": "pacientes",
        "titulo": "Registrar un paciente nuevo",
        "resumen": "Qué datos son obligatorios, cuáles conviene completar aunque no lo sean, cómo evitar fichas duplicadas y qué hacer con la autorización de datos.",
        "area": "pacientes",
        "keywords": "paciente, crear, registrar, ficha, nuevo, datos, duplicado, documento",
        "destacado": False,
        "contenido": """
La ficha del paciente es la base de todo lo demás: citas, historia clínica,
cotizaciones, cartera y consentimientos cuelgan de ella. Vale la pena crearla
bien la primera vez.

## Crear la ficha

Entra a **Pacientes → Nuevo paciente**. El formulario está dividido en bloques y
se puede completar por partes.

### Obligatorio

- **Tipo y número de documento**
- **Nombres y apellidos**
- **Fecha de nacimiento**
- **Sexo**
- **Teléfono**

Sin estos datos no se guarda la ficha. La fecha de nacimiento y el sexo no son
un capricho del formulario: condicionan lo que se muestra en la historia clínica
y en algunos protocolos.

### Muy recomendable

- **Correo electrónico**, para enviar cotizaciones y documentos.
- **Canal de confirmación** preferido del paciente, que es por donde se le
  escribirá para confirmar citas.
- **Dirección y ciudad**, si emites documentos que las exigen.
- **Datos del responsable**, indispensables cuando el paciente es menor de edad.

### Complementario

Ocupación, estado civil, escolaridad, grupo étnico, grupo sanguíneo, EPS,
régimen y tipo de afiliado. No frenan nada si quedan vacíos, pero son los campos
que después echas de menos cuando alguien pide un reporte.

## Autorización de tratamiento de datos

La ficha registra si el paciente **autoriza el tratamiento de sus datos** y la
fecha en que lo hizo. Márcalo cuando efectivamente lo haya autorizado, no por
defecto: es el respaldo de la clínica frente a la normativa de protección de
datos.

## Evitar duplicados

Antes de crear, **busca**. El buscador de Pacientes encuentra por nombre,
apellido o documento. Los duplicados aparecen casi siempre por tres razones:

- El paciente dio un nombre corto una vez y el completo otra.
- Se escribió el documento con puntos o con un dígito de más.
- Se creó la ficha desde la agenda con prisa, sin buscar primero.

Un paciente duplicado parte en dos su historia, su cartera y sus consentimientos.
Si detectas uno, avisa antes de seguir cargando información sobre él.

## Qué sigue después de crear la ficha

Desde la ficha del paciente puedes:

- Agendar su primera cita.
- Completar sus **antecedentes** clínicos.
- Abrir su **historia clínica**.
- Crear una **cotización**.
- Consultar su **cartera** y sus documentos firmados.

> Si tu clínica usa el registro público, el paciente puede llenar sus propios
> datos desde el celular antes de llegar. Lo explicamos en
> [Autoregistro de pacientes por enlace](/ayuda/articulo/autoregistro-de-pacientes-por-enlace).
""",
    },
    {
        "slug": "datos-sensibles-quien-puede-verlos",
        "categoria": "pacientes",
        "titulo": "Datos sensibles: quién puede verlos",
        "resumen": "Cómo funciona el permiso que enmascara documento, teléfono, correo, dirección y fecha de nacimiento, dónde se aplica y qué se puede seguir haciendo sin él.",
        "area": "pacientes",
        "keywords": "datos sensibles, privacidad, enmascarado, oculto, documento, teléfono, permiso, habeas data",
        "destacado": False,
        "contenido": """
Hay un permiso específico, **Ver datos sensibles del paciente**, que controla si
un usuario ve o no los datos de identificación y contacto.

## Qué se enmascara

Cuando el rol no tiene ese permiso, estos campos aparecen parcialmente ocultos:

- Número de documento
- Teléfono
- Correo electrónico
- Dirección
- Fecha de nacimiento

El enmascaramiento se aplica en todas partes donde ese dato aparece: el listado
de pacientes, la ficha, el detalle de la cita y las pantallas que muestran datos
de contacto.

## Qué se puede seguir haciendo

Casi todo. Una persona sin este permiso puede buscar al paciente por su nombre,
agendarlo, atenderlo, registrar su historia clínica, cotizarle y cobrarle. El
permiso limita **ver** el dato, no trabajar con el paciente.

El tipo de documento sí se sigue viendo, porque por sí solo no identifica a
nadie y a veces hace falta para elegir bien entre dos homónimos.

## Para qué sirve

Para separar dos cosas que suelen ir juntas por comodidad y no deberían: **atender
a un paciente** y **poder extraer su base de datos de contacto**. Es útil para
personal en formación, personal temporal o roles que solo ejecutan procedimientos.

## Documentos y PDF

Los documentos que genera el sistema, como consentimientos y órdenes, incluyen
los datos que el documento exige por su naturaleza legal. El enmascaramiento
aplica a la interfaz, no cambia el contenido de un documento firmado.

## Cómo se asigna

En **Configuración → Roles y permisos**, dentro del módulo de pacientes. Lo
razonable es:

| Rol | Datos sensibles |
|---|---|
| Administración y recepción | Sí, los necesitan para contactar y facturar |
| Profesional de planta | Normalmente sí |
| Personal en formación o apoyo | No |

> Este permiso no sustituye la autorización de tratamiento de datos que firma el
> paciente. Son dos capas distintas: una es hacia adentro, la otra es hacia el
> paciente.
""",
    },
    {
        "slug": "la-historia-clinica-del-paciente",
        "categoria": "pacientes",
        "titulo": "La historia clínica del paciente",
        "resumen": "Cómo se organiza la historia, qué es una nota clínica, qué pestañas se pueden activar y quién puede leer o escribir en ella.",
        "area": "pacientes",
        "keywords": "historia clínica, nota, evolución, registro clínico, pestañas, atención, borrador",
        "destacado": False,
        "contenido": """
La historia clínica se abre desde la ficha del paciente y reúne todo el registro
clínico: una entrada por cada atención, más los antecedentes que no cambian de
un día para otro.

## La nota clínica

Cada atención genera una **nota clínica**, que es la unidad básica de la
historia. Una nota agrupa todo lo que se registró ese día:

- Motivo de consulta
- Plan de manejo
- Exámenes cargados
- Órdenes médicas emitidas
- Fotos clínicas
- Zonas tratadas, cuando el procedimiento las usa

Una nota está **en borrador** mientras la atención sigue abierta, y pasa a
**completada** al cerrarla. Mientras esté en borrador puedes seguir editándola;
después queda como registro del acto clínico.

## Las pestañas

La historia se navega por pestañas y **cada clínica elige cuáles usar**, en
Configuración → Historia clínica:

| Pestaña | Contenido |
|---|---|
| **Datos generales** | Identificación y datos básicos del paciente |
| **Motivo de consulta** | Por qué viene el paciente y qué refiere |
| **Antecedentes** | Alergias, patologías, cirugías, hábitos, ginecoobstétricos |
| **Seguimiento** | Mediciones y controles en el tiempo |
| **Exámenes** | Resultados de laboratorio o imágenes, con su archivo adjunto |
| **Plan de manejo** | Conducta e indicaciones |
| **Órdenes médicas** | Órdenes generadas, con su plantilla y su firma |
| **Fotos** | Registro fotográfico de antes, durante y después |
| **Zonas** | Zonas del cuerpo tratadas y su parametrización |

Además, en Configuración → Pantalla de atención se elige por separado qué
pestañas ve el profesional **durante** la atención. Son dos listas distintas a
propósito: durante la consulta conviene mostrar poco y ordenado.

## Quién puede ver y quién puede escribir

Hay dos permisos separados:

- **Ver historia**: leer las notas ya escritas.
- **Escribir historia**: crear y editar notas. Es el permiso que además habilita
  el módulo de atenciones.

Un rol de recepción normalmente no tiene ninguno de los dos.

## Buenas prácticas

- Escribe la nota durante la atención, no al final del día. Lo que se reconstruye
  de memoria pierde detalle.
- Deja registro también de lo que no se hizo y por qué: un procedimiento
  pospuesto por una contraindicación es información clínica.
- Si algo aplica siempre al paciente, va en antecedentes, no repetido en cada
  nota.

> La historia clínica es un documento legal. Corrige aclarando, no borrando: lo
> que se escribió en una atención ya cerrada forma parte del registro.
""",
    },
    {
        "slug": "antecedentes-alergias-y-contraindicaciones",
        "categoria": "pacientes",
        "titulo": "Antecedentes, alergias y contraindicaciones",
        "resumen": "Qué se registra en los antecedentes del paciente, por qué conviene completarlos antes del primer procedimiento y cómo se usan durante la atención.",
        "area": "pacientes",
        "keywords": "antecedentes, alergias, medicamentos, patológicos, quirúrgicos, contraindicaciones, tipo de piel, ginecoobstétricos",
        "destacado": False,
        "contenido": """
Los antecedentes son la parte de la historia que **no cambia cada día**. Se
registran una vez y se actualizan cuando aparece algo nuevo.

## Qué se registra

- **Alergias** y **medicamentos actuales**.
- **Condiciones médicas** y **contraindicaciones** conocidas.
- **Antecedentes patológicos**, **quirúrgicos** y **traumáticos**.
- **Antecedentes familiares**.
- **Hábitos**: tabaquismo, alcohol, otras sustancias.
- **Antecedentes estéticos**: qué procedimientos se ha hecho antes y con qué
  resultado.
- **Tipo de piel**, clave para decidir parámetros de equipos y láser.
- **Ginecoobstétricos**: gestaciones, partos, cesáreas, abortos, fecha de última
  menstruación, planificación.

## Por qué importan antes del primer procedimiento

Porque son la base de la decisión clínica y del consentimiento. Un antecedente
de queloides, un anticoagulante, un embarazo o una alergia a anestésicos cambian
lo que se puede hacer ese día. Registrarlos después de la primera sesión es tarde.

## Cómo se usan durante la atención

Si la pestaña de antecedentes está activa en la pantalla de atención, el
profesional los tiene a la vista mientras atiende, sin salir a buscarlos.

## Permisos

Ver y editar antecedentes son dos permisos distintos. Es habitual que recepción
pueda verlos para anticipar un problema y que solo el personal clínico pueda
editarlos.

## Buenas prácticas

- Escribe «niega alergias» en vez de dejar el campo vacío. Vacío es ambiguo:
  no se sabe si no tiene o si no se preguntó.
- Anota la fuente cuando el dato viene del paciente y no de un documento.
- Revisa los antecedentes en cada sesión de un tratamiento largo. Un paciente
  puede empezar un medicamento nuevo a mitad de camino.

> Si un paciente trae un examen o una historia externa, cárgala en la pestaña de
> exámenes. El antecedente resume; el documento respalda.
""",
    },
    {
        "slug": "fotos-clinicas-y-evolucion",
        "categoria": "pacientes",
        "titulo": "Fotos clínicas y evolución",
        "resumen": "Cómo cargar fotos de antes, durante y después, cómo se organizan por zona y qué cuidados hay que tener con la imagen del paciente.",
        "area": "pacientes",
        "keywords": "fotos, imágenes, antes y después, evolución, galería, registro fotográfico, zona",
        "destacado": False,
        "contenido": """
El registro fotográfico es lo que permite mostrar resultados y sostener una
discusión clínica sobre la evolución de un tratamiento.

## Cómo se cargan

Desde la pestaña **Fotos**, durante la atención o después, en la historia
clínica. Cada foto se guarda con:

- **Tipo**: antes, durante o después.
- **Zona** del cuerpo a la que corresponde.
- **Descripción** opcional.
- La **fecha** y la atención a la que pertenece.

Como cada foto queda ligada a una nota clínica, la galería del paciente se puede
recorrer en orden cronológico y comparar la misma zona en distintas sesiones.

## Cómo tomar fotos que sirvan

La comparación solo funciona si las condiciones se repiten:

- Misma distancia y mismo ángulo.
- Misma iluminación; evita la luz de ventana que cambia con la hora.
- Fondo liso y sin objetos que distraigan.
- Paciente en la misma posición, con el cabello recogido igual.
- Sin maquillaje en la zona, salvo que el procedimiento lo requiera.

Una serie de fotos tomadas «como salga» no sirve para comparar y tampoco para
defender un resultado.

## Privacidad

Las fotos clínicas son datos sensibles del paciente:

- Se acceden desde la aplicación, con enlaces temporales que caducan.
- No las guardes en el carrete del celular ni las envíes por chat personal.
- Para usarlas en redes o publicidad necesitas una autorización específica del
  paciente para ese uso, distinta de la autorización de tratamiento de datos.

## Foto de control

Aparte de las fotos clínicas, la ficha del paciente puede tener una **foto de
control** de identidad. Se usa para reconocer al paciente en recepción y, si la
clínica activó la verificación facial, para confirmar su identidad al iniciar la
atención.

> Toma siempre la foto de «antes», aunque el caso parezca menor. La foto que
> falta es siempre la del día en que después hubo una reclamación.
""",
    },
    {
        "slug": "autoregistro-de-pacientes-por-enlace",
        "categoria": "pacientes",
        "titulo": "Autoregistro de pacientes por enlace",
        "resumen": "Cómo funciona el enlace público para que el paciente cargue sus propios datos antes de llegar, qué se le pide y qué revisar en recepción.",
        "area": "pacientes",
        "keywords": "autoregistro, link público, formulario, prellenar, whatsapp, registro, paciente nuevo",
        "destacado": False,
        "contenido": """
El autoregistro es un formulario público que el paciente llena desde su celular
antes de llegar a la clínica. Sirve para que el mostrador no tenga que dictar
veinte campos mientras hay fila.

## Cómo funciona

1. La clínica tiene un **enlace permanente** de registro público, propio y
   distinto del de cualquier otra clínica.
2. Se le envía al paciente cuando agenda, por WhatsApp o correo.
3. El paciente llena sus datos desde el celular y los envía.
4. La ficha del paciente **se crea al enviar el formulario** y queda disponible
   de inmediato para agendar.

## Qué se le pide al paciente

El formulario está dividido en bloques y la clínica decide cuáles son
obligatorios:

- **Datos personales**: identificación, contacto, dirección.
- **Salud y afiliación**: EPS, régimen, tipo de afiliado y datos básicos de
  salud.

Dejarlos opcionales sube la cantidad de formularios que se completan; exigirlos
mejora la calidad del dato. La decisión depende de qué tanto necesites cada campo
para facturar y para atender.

Si la clínica usa foto de control, el formulario también puede pedir una
fotografía del paciente.

## Controles que hace el formulario

- **Autorización obligatoria**: sin marcar el tratamiento de datos, el registro
  no se envía.
- **Antiduplicados**: si ya existe un paciente en esa clínica con el mismo
  documento, el mismo teléfono o el mismo correo, el formulario lo rechaza y
  avisa cuál es el dato repetido.
- **Límite de envíos** por remitente, para evitar registros masivos automáticos.

## Qué revisar en recepción

Cuando el paciente llegue, confirma de viva voz tres cosas:

- Que el nombre esté completo y no sea un apodo.
- Que el teléfono sea el correcto, porque por ahí van los recordatorios.
- Que la fecha de nacimiento coincida con el documento.

## Recomendaciones

- Envía el enlace junto con la confirmación de la cita; es el momento en que el
  paciente está más dispuesto a llenarlo.
- Si el paciente llega sin haberlo llenado, créale la ficha en recepción como
  siempre.
- Si el formulario le rechaza el registro por duplicado, búscalo: casi siempre
  es un paciente que ya vino antes.

> El enlace es público: cualquiera que lo tenga puede registrarse como paciente
> de tu clínica. Compártelo con pacientes reales, no lo publiques abierto en
> redes.
""",
    },
]

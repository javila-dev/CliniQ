"""Artículos de la categoría «Configuración y equipo»."""

ARTICULOS = [
    {
        "slug": "crear-usuarios-y-asignar-roles",
        "categoria": "configuracion",
        "titulo": "Crear usuarios y asignar roles",
        "resumen": "Cómo dar de alta al equipo, qué pasa con la invitación por correo, cómo desactivar a alguien que se va y por qué el límite de usuarios depende de tu plan.",
        "area": "configuracion",
        "keywords": "usuarios, equipo, crear, invitar, rol, activar, desactivar, colaborador, cupo, plan",
        "destacado": False,
        "contenido": """
El equipo se administra en **Configuración → Usuarios**. Cada persona que entre a
CliniQ necesita su propia cuenta: las cuentas compartidas rompen la trazabilidad
de todo lo que se hace.

## Crear un usuario

1. Presiona **Nuevo usuario**.
2. Completa nombre, apellido, correo y teléfono.
3. Elige el **rol**, que define sus permisos.
4. Indica si **atiende pacientes**. Solo quienes están marcados como
   profesionales pueden aparecer como responsables de una cita.
5. Guarda.

La persona recibe un correo con un enlace para definir su contraseña. Ese enlace
es de un solo uso y vence; si expiró, se le reenvía la invitación.

Mientras no active su cuenta aparece como **invitado**, y ya ocupa un cupo del
plan.

## Tipo de vinculación

Cada colaborador se marca como **empleado**, **contratista** o **socio**. Es
información administrativa que no cambia permisos, pero sirve para los reportes
del equipo.

## Activar y desactivar

Cuando alguien deja la clínica, **desactívalo**, no lo borres. Desactivar:

- Le quita el acceso de inmediato.
- Libera un cupo del plan.
- Conserva todo su historial: sus citas, sus notas clínicas y sus registros
  siguen atribuidos a su nombre.

La clínica no puede quedarse **sin ningún administrador activo**: si intentas
desactivar al último, CliniQ lo impide. Nombra primero a otro administrador.

## Límite de usuarios

El número de usuarios activos depende del plan contratado. Si alcanzaste el
límite, el botón de activar queda deshabilitado y aparece el aviso. Para ampliarlo
hay que cambiar de plan; para trabajar dentro del límite, desactiva las cuentas
que ya no se usan.

## Buenas prácticas

- Usa el correo institucional de cada persona, no uno genérico del mostrador.
- Crea las cuentas **antes** del primer día de la persona y dale diez minutos de
  inducción.
- Revisa la lista de usuarios activos una vez al trimestre. Siempre sobra alguien
  que ya no está.

> Si dos personas comparten una cuenta, el registro de auditoría deja de servir
> para cualquier cosa. El día que haya una diferencia de caja, no habrá forma de
> saber quién hizo qué.
""",
    },
    {
        "slug": "roles-y-permisos",
        "categoria": "configuracion",
        "titulo": "Roles y permisos: cómo decidir quién ve qué",
        "resumen": "Cómo funcionan los roles, qué grupos de permisos existen, cuáles conviene dar a cada puesto y qué precauciones tomar al crear un rol nuevo.",
        "area": "configuracion",
        "keywords": "roles, permisos, accesos, privilegios, seguridad, recepción, profesional, administrador",
        "destacado": False,
        "contenido": """
Un **rol** es un conjunto de permisos que se asigna a una persona. En vez de
configurar accesos usuario por usuario, se define una vez el rol «Recepción» y se
asigna a todas las recepcionistas.

## Roles del sistema y roles propios

CliniQ trae roles base, como administrador, profesional y recepción. Puedes
crear roles propios, normalmente partiendo de uno existente y ajustando permisos.

Los roles del sistema tienen límites de edición para evitar que alguien deje la
clínica sin administración por accidente.

## Qué controlan los permisos

Están agrupados por módulo. A grandes rasgos:

| Grupo | Ejemplos de lo que controla |
|---|---|
| **Agenda** | Ver, crear, editar y cancelar citas; crear y aprobar bloqueos |
| **Pacientes** | Ver, crear y editar fichas; ver datos sensibles; antecedentes |
| **Historia clínica** | Leer la historia; escribir notas, que además habilita atenciones |
| **Cotizaciones** | Ver, gestionar y cambiar precios |
| **Cobros y cartera** | Ver, crear y anular cobros; aprobar excepciones; modificar plazos |
| **Caja** | Registrar y aprobar gastos; abrir y cerrar caja; gestionar categorías |
| **Consentimientos** | Ver, generar, gestionar formatos y revocar |
| **Inventario y proveedores** | Consultar y gestionar |
| **Equipo** | Ver, crear, editar y eliminar usuarios y roles |
| **Reportes** | Ver el dashboard; ver los reportes financieros |
| **Configuración** | Editar los datos y las preferencias de la clínica |
| **Auditoría** | Consultar el log de acciones |

## Configuraciones típicas

**Recepción**: agenda completa, pacientes con datos sensibles, cotizaciones,
cobros y cartera para registrar pagos, consentimientos para generarlos. Sin
reportes financieros y sin configuración.

**Profesional**: agenda de consulta, pacientes, historia clínica con escritura,
consentimientos. Normalmente sin cobros ni configuración.

**Administración**: casi todo, incluidos reportes financieros, caja y equipo.

**Dirección**: lo anterior más los permisos sensibles: cambiar precios, anular
cobros, aprobar excepciones de cartera.

## Permisos que conviene repartir poco

- **Cambiar precio** en cotizaciones.
- **Anular cobros**.
- **Aprobar excepciones** de cartera y **modificar plazos**.
- **Eliminar usuarios** y **editar roles**.

No es desconfianza: son acciones que mueven dinero o accesos, y concentrarlas
hace que cualquier revisión posterior sea sencilla.

## Cambios en los roles

Las modificaciones de roles y permisos quedan registradas: qué cambió, quién lo
hizo y cuándo. Si alguien amplió sus propios accesos, queda rastro.

> Antes de crear un rol nuevo, pregúntate si no es en realidad el mismo puesto con
> una excepción puntual. Muchos roles casi idénticos son más difíciles de mantener
> que tres roles claros.
""",
    },
    {
        "slug": "sedes-horarios-y-turnos",
        "categoria": "configuracion",
        "titulo": "Sedes, horarios y frecuencia de turnos",
        "resumen": "Cómo configurar cada sede, para qué se usa el horario de atención, qué cambia la frecuencia de turnos y qué revisar al abrir una sede nueva.",
        "area": "configuracion",
        "keywords": "sede, sucursal, horario, turnos, intervalo, agenda, ubicación, apertura",
        "destacado": False,
        "contenido": """
## Sedes

Cada ubicación física es una **sede**, y se configura en **Configuración →
Sedes** con su nombre, dirección, teléfono y horario de atención.

La sede atraviesa toda la aplicación: las citas, los cobros, la caja, los gastos y
los reportes se filtran por ella. Por eso conviene crearla bien antes de empezar a
operar, no después.

## Horario de atención

El horario define la franja en la que la sede recibe pacientes. Sirve para que la
agenda muestre el día real de trabajo y para que no se agende a horas en que la
sede está cerrada.

Las excepciones puntuales, como un festivo o un cierre por mantenimiento, no se
manejan cambiando el horario: se manejan con
[bloqueos de agenda](/ayuda/articulo/bloqueos-de-agenda-y-disponibilidad).

## Frecuencia de turnos

Es un ajuste general de la clínica, en **Configuración → General**: cada cuántos
minutos se corta la agenda. Con 15 minutos, las citas empiezan en punto, y cuarto,
y media o menos cuarto.

- **Intervalos cortos** (10 o 15 minutos) dan flexibilidad, pero fragmentan la
  agenda y dejan huecos difíciles de llenar.
- **Intervalos largos** (30 minutos) ordenan mejor el día, a costa de perder
  tiempo cuando un procedimiento dura 20 minutos.

Elige el intervalo según tus procedimientos más frecuentes.

## Abrir una sede nueva

Checklist rápido:

1. Crear la sede con su horario y sus datos de contacto.
2. Asignar a los profesionales que atenderán allí.
3. Crear su **caja**, con fondo inicial y responsable, si va a manejar efectivo.
4. Revisar si alguna **campaña** vigente debe aplicar también en esa sede.
5. Hacer una cita de prueba para verificar que la agenda se comporta como
   esperas.

> Si un listado aparece vacío o un profesional no sale en la lista al agendar,
> revisa la sede seleccionada. Es el primer sospechoso cuando algo «desaparece»
> en una clínica con varias sedes.
""",
    },
    {
        "slug": "recordatorios-automaticos-de-citas",
        "categoria": "configuracion",
        "titulo": "Recordatorios automáticos de citas",
        "resumen": "Cómo activar los recordatorios, con cuánta anticipación conviene enviarlos, en qué se diferencian de la confirmación y qué revisar si un paciente no los recibe.",
        "area": "configuracion",
        "keywords": "recordatorios, whatsapp, aviso, confirmación, anticipación, inasistencia, mensajes",
        "destacado": False,
        "contenido": """
Los recordatorios son mensajes automáticos que se le envían al paciente antes de
su cita. Son la herramienta más directa contra las inasistencias.

## Configuración

En **Configuración → Recordatorios** se define:

- Si los recordatorios automáticos están **activos**.
- Con cuánta **anticipación** se envían, en horas. El valor habitual es 24.

## Recordatorio y confirmación no son lo mismo

- El **recordatorio** es automático y sale solo. Le avisa al paciente.
- La **confirmación** la registra una persona del equipo después de hablar con el
  paciente, e incluye el medio de contacto y lo que el paciente dijo.

Un paciente puede recibir el recordatorio y no responder. La cita sigue sin
confirmar hasta que alguien registre la confirmación.

## Cuánta anticipación conviene

- **24 horas** funciona para la mayoría de las clínicas: da margen para reasignar
  el cupo si el paciente avisa que no viene.
- **48 horas** es mejor para procedimientos que exigen preparación previa del
  paciente.
- **Menos de 12 horas** avisa, pero llega tarde para recuperar el cupo.

Algunas clínicas usan dos contactos: el recordatorio automático el día anterior y
una llamada de confirmación la misma mañana para los procedimientos largos.

## Si un paciente no recibe el recordatorio

1. Revisa el **teléfono** en su ficha: formato, indicativo, dígitos de más.
2. Revisa su **canal de confirmación** preferido.
3. Confirma que los recordatorios estén activados en la configuración.

## Buenas prácticas

- Actualiza el teléfono cada vez que el paciente venga. Es el dato que más se
  desactualiza.
- Registra siempre la respuesta del paciente en la cita: esa nota es lo que evita
  que dos personas lo llamen el mismo día.
- Mide el efecto: compara las inasistencias de un mes con recordatorios contra las
  de un mes sin ellos antes de descartar la herramienta.
""",
    },
    {
        "slug": "que-pestanas-mostrar-en-historia-y-atencion",
        "categoria": "configuracion",
        "titulo": "Qué pestañas mostrar en la historia y en la atención",
        "resumen": "Cómo elegir las secciones que ve el equipo en la historia clínica y en la pantalla de atención, y por qué son dos configuraciones separadas.",
        "area": "configuracion",
        "keywords": "pestañas, tabs, historia clínica, pantalla de atención, secciones, personalizar, ocultar",
        "destacado": False,
        "contenido": """
CliniQ trae muchas secciones clínicas porque no todas las clínicas trabajan
igual. Mostrarlas todas es una forma segura de que el equipo pierda tiempo en
campos que nunca usa.

## Dos configuraciones distintas

- **Configuración → Historia clínica**: qué pestañas se ven al consultar la
  historia completa de un paciente.
- **Configuración → Pantalla de atención**: qué pestañas ve el profesional
  mientras está atendiendo.

Son separadas a propósito. Durante la consulta conviene mostrar poco y en orden;
al revisar la historia, conviene poder ver todo.

## Las secciones disponibles

| Pestaña | Cuándo tiene sentido activarla |
|---|---|
| **Datos generales** | Casi siempre |
| **Motivo de consulta** | Casi siempre |
| **Antecedentes** | Siempre que hagas procedimientos con contraindicaciones |
| **Seguimiento** | Si mides variables en el tiempo, como peso o medidas |
| **Exámenes** | Si pides o recibes laboratorios e imágenes |
| **Plan de manejo** | Casi siempre |
| **Órdenes médicas** | Si emites órdenes, fórmulas o remisiones |
| **Fotos** | Si documentas resultados, que en estética es casi siempre |
| **Zonas** | Si trabajas por zonas del cuerpo con parámetros |

## Cómo decidir

Pregúntale al equipo clínico qué llena hoy en papel y qué nunca llena. La regla
práctica: si una sección lleva tres meses vacía en todas las historias, apágala.
Siempre se puede volver a encender.

## Efecto del cambio

Apagar una pestaña **no borra** lo que ya se registró en ella. Solo deja de
mostrarse. Si la vuelves a encender, la información sigue ahí.

> Una pantalla de atención con cuatro pestañas bien elegidas se llena completa en
> cada consulta. Una con nueve se llena a medias en todas.
""",
    },
    {
        "slug": "log-de-acciones-y-auditoria",
        "categoria": "configuracion",
        "titulo": "El log de acciones y la auditoría",
        "resumen": "Qué queda registrado en el historial de acciones, cómo consultarlo, para qué sirve en la práctica y qué no reemplaza.",
        "area": "configuracion",
        "keywords": "log, auditoría, historial, trazabilidad, quién hizo, registro, seguridad, control",
        "destacado": False,
        "contenido": """
El **log de acciones** es el registro de quién hizo qué y cuándo dentro de CliniQ.
Se consulta en **Configuración → Log de acciones**, con el permiso
correspondiente.

## Qué queda registrado

Las acciones con consecuencia sobre datos o dinero. Entre otras:

- Cobro de cuotas y registro de pagos.
- Anulación de cobros.
- Aprobación de excepciones de cartera y cambios de plazo.
- Creación y aplicación de acuerdos de pago.
- Cambios en roles y permisos.
- Creación, activación y desactivación de usuarios.
- Cambios de estado en citas y en cotizaciones.

Cada entrada guarda el usuario, la fecha y hora, la acción y el objeto afectado.

## Para qué sirve en la práctica

- **Cuadrar una caja**: ver quién registró un pago y a qué hora.
- **Aclarar un cambio**: quién movió una cita o modificó una cuota.
- **Revisar accesos**: si alguien cambió permisos que no debía.
- **Formar al equipo**: muchas veces el log muestra que no hubo mala intención,
  sino un flujo mal entendido.

## Cómo consultarlo

Filtra por usuario, por tipo de acción y por rango de fechas. Lo más eficiente es
partir del hecho concreto: la fecha del descuadre, el paciente de la queja, la
cita que apareció movida.

## Qué no reemplaza

- **No reemplaza la historia clínica.** Las decisiones clínicas se documentan en
  la nota, no en el log.
- **No reemplaza la conversación.** El log dice qué pasó, no por qué; eso lo
  aclara quien lo hizo.

## Un requisito para que sirva

Que **cada persona use su propia cuenta**. Con cuentas compartidas, el log
registra fielmente acciones que no se pueden atribuir a nadie.

> Revisa el log solo cuando haya un motivo concreto. Usarlo como vigilancia
> permanente cansa al equipo y no aporta nada.
""",
    },
    {
        "slug": "puesta-en-marcha-cargar-pacientes-en-curso",
        "categoria": "configuracion",
        "titulo": "Puesta en marcha: cargar pacientes en curso",
        "resumen": "Cómo registrar a los pacientes que llegan a mitad de un tratamiento: lo que ya pagaron, las sesiones que ya recibieron y el saldo que queda, sin ensuciar los reportes de ventas.",
        "area": "configuracion",
        "keywords": "migración, puesta en marcha, pacientes en curso, saldo previo, sesiones previas, arranque, cargar",
        "destacado": False,
        "contenido": """
Cuando una clínica empieza a usar CliniQ ya tiene pacientes a mitad de camino: con
sesiones hechas, con saldos pendientes y con tratamientos empezados. El asistente
de **puesta en marcha** existe para cargarlos sin distorsionar las cifras.

## Cuándo está disponible

El modo de puesta en marcha lo activa el equipo de implementación mientras dura la
migración, y se apaga cuando termina. Requiere un permiso específico y se
encuentra en **Configuración → Puesta en marcha**.

## Qué carga

Por cada paciente en curso se registra:

- Sus **datos personales**.
- El **tratamiento** que está recibiendo y su valor.
- Cuántas **sesiones ya consumió** antes de CliniQ.
- Cuánto **ya pagó** y cuánto **queda pendiente**, con las fechas de las cuotas
  por vencer.

Con eso queda armada su cartera y quedan disponibles solo las sesiones que
realmente le faltan.

## Por qué no se carga como una venta normal

Porque inflaría los reportes. Un saldo migrado:

- **Sí** entra a cartera, se cobra igual y genera mora si se vence.
- **No** cuenta como venta nueva del periodo.

Así, el primer mes de operación muestra lo que realmente se vendió ese mes, y no
todo el histórico de la clínica.

## Revertir una carga

Mientras revisas, una carga completa se puede revertir. Es la red de seguridad
para los errores típicos del arranque: un saldo mal digitado, un tratamiento
equivocado, un paciente duplicado.

## Recomendaciones

- Carga primero **cinco pacientes** y revísalos completos antes de seguir con el
  resto.
- Ten a mano el corte de cartera del sistema anterior, con fecha y responsable.
- Verifica las **sesiones ya consumidas**: es el dato que más reclamos genera si
  queda mal.
- Al terminar, compara el total de cartera migrada contra el corte del sistema
  anterior. Deben coincidir.

> Dedica una tarde a esta carga con el equipo completo y los datos a la vista. Un
> saldo migrado mal se descubre semanas después, discutiendo con un paciente.
""",
    },
]

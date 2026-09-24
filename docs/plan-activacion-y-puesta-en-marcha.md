# Plan de acción: activación y puesta en marcha de clínicas

## Objetivo general

Conseguir que un administrador sin ningún conocimiento previo de CliniQ pueda completar, sin capacitación externa y con la menor fricción posible, el recorrido:

> Crear clínica → configurarla → crear el catálogo → preparar una cita → atenderla → cerrarla

La prioridad es que **crear procedimientos y tratamientos sea muy sencillo y amigable**, y que **las configuraciones importantes se encuentren sin buscarlas**.

Metas iniciales:

- Completar la configuración básica en menos de 30 minutos.
- Crear el primer procedimiento en menos de 1 minuto.
- Crear un tratamiento sencillo en menos de 2 minutos.
- Completar una primera cita real el mismo día.
- Reducir las dudas sobre la diferencia entre procedimiento, tratamiento y sesión.
- Reducir las dudas sobre por qué una atención no se puede iniciar.

8. **Catálogo (procedimientos y tratamientos) sale de Configuración.** Pasa a ser una sección de primer nivel, `/catalogo`, dentro de Ventas en el sidebar, con permiso propio (`servicios.ver`). No es una configuración que se toca una vez: es lo que la clínica vende, se edita seguido y hoy exigía además un permiso (`clinicas.editar`/`usuarios.ver`/`roles.ver`) que no tenía nada que ver con gestionar el catálogo para siquiera ver el menú. Las rutas viejas (`/configuracion/procedimientos`, `/configuracion/tratamientos`, `/configuracion/servicios`) quedan como redirect. Ver Hito 4 (implementación).

## Decisiones de producto (fijadas)

Estas decisiones condicionan todo el plan y no se reabren sin motivo:

1. **Sin datos demo.** El sistema solo crea los roles. Todo lo demás (sede, equipo, catálogo, pacientes, citas) lo crea el usuario. No hay paciente ficticio, ni clínica de ejemplo, ni registros marcados como demo.
2. **Tratamientos siguen en modal.** El modal empieza compacto (modo rápido) y se amplía al constructor completo. No se crea una página aparte.
3. **Sin borrador en backend.** El avance de un tratamiento en construcción se guarda en el navegador (`localStorage`). No se reutiliza `activo` como "borrador".
4. **El flujo de recepción se muestra completo y visible**, con un interruptor por paso. No se usan opciones prearmadas.
5. **Nada se bloquea por configuración pendiente si se puede evitar.** Lo que falta se muestra como etiqueta con acción directa, no como error.
6. **Quién realiza cada procedimiento depende de un parámetro de la clínica, apagado por defecto.** Apagado: cualquier profesional de la sede puede atender cualquier procedimiento y asignarlos es opcional. Encendido: al agendar se elige primero la sede y el procedimiento, y luego solo aparecen los profesionales que lo realizan. Con el parámetro apagado la asignación queda fuera de la creación rápida (vive en "Más opciones" del procedimiento y en el perfil del profesional); encendido, pasa a mostrarse a la vista, porque sin ella el procedimiento no se puede agendar. Ver Hito 4C.
7. **Sin catálogo precargado ni importación por Excel.** El usuario crea sus procedimientos con el modal rápido y "Guardar y agregar otro". CliniQ no distribuye contenido propio.

## Diagnóstico

CliniQ tiene un modelo funcional sólido, pero la activación exige demasiado conocimiento previo. Lo siguiente está **verificado en el código**:

| Hallazgo | Detalle |
|---|---|
| El onboarding está huérfano | Nada enlaza a `/onboarding`. `onboarding_completado` solo se escribe, nunca se lee. |
| El onboarding además está roto | El Paso 2 siempre falla (envía contraseña vacía y `profesional` es un rol no creable desde usuarios). El Paso 1 solo guarda el teléfono. El Paso 3 crea un servicio sin profesional ni consentimiento. Aun así termina en "¡Tu clínica está lista!". |
| Una clínica nueva no puede agendar | No se encontró código de producción que cree una sede al registrarse, y sin horario de sede no hay turnos disponibles. |
| Ya existe un checklist | `setup_checklist` (backend) y `SetupChecklist.tsx` (dashboard) con 5 ítems. Exige logo para dar "Datos" por completo, solo verifica que exista una sede (no su horario) y desaparece al terminar. El paso "Agregar un profesional" sale completo desde el día 0 (ver la fila siguiente). |
| Un profesional válido exige tres cosas | Para atender una cita el profesional es obligatorio, y para poder elegirlo al agendar debe estar activo, tener `es_profesional=True` (por rol o por la casilla "también atiende pacientes") y estar asignado a la sede. El checklist solo comprueba que exista un `Colaborador` activo, y el sistema crea uno para el primer administrador, que no es profesional. Resultado: "Agregar un profesional" aparece completo sin haber nadie a quien agendar. |
| El vocabulario de agenda contradice el resto | El modal de nueva cita dice "Por servicio", "Selecciona un servicio" y "Servicio"; la edición y el detalle de la cita también. El término correcto es procedimiento. |
| Queda código muerto de un mecanismo legado | Los `pasos_protocolo` por procedimiento (H25). Su editor (`ProtocoloPasos.tsx`) no está en ninguna pantalla y **se comprobó en producción que no hay datos**: 0 procedimientos con pasos y 0 tratamientos de paciente sin catálogo. El backend y la atención conservan las ramas que los leen (`PanelLegacy` junto a `PanelH27`, una señal de cotizaciones y un servicio de protocolos). |
| El formulario de tratamientos es denso | Tres pestañas en un modal, tres párrafos de explicación, un nombre obligatorio por bloque, chips "seguim."/"info" y una leyenda. La vista previa es solo un contador. |
| El formulario de procedimientos tiene un callejón sin salida | Si no hay plantilla de consentimiento, el enlace "Crear una" navega fuera y pierde lo escrito. Al crear, aterriza en la pestaña "Zonas". |
| Las configuraciones están enterradas | El flujo de inicio de atención (OTP, facial, pago, firma) está en la tarjeta "General", pestaña "Atención", y la tarjeta no lo menciona. La pestaña Biometría aparece solo tras activar el paso facial. Hay dos configuraciones llamadas "atención" en lugares distintos. |
| Hay páginas de configuración sin enlace | `plantillas-asistencia`, `recordatorios` y `servicios` no aparecen en el hub ni en la barra lateral. |
| No hay analítica de producto | No existe infraestructura para medir eventos. |

Además, se mezclan los términos servicio, procedimiento, tratamiento, protocolo y sesión. "Puesta en marcha" nombra la migración de pacientes, aunque sugiere la configuración general. El asistente de recepción y la atención del profesional usan expresiones parecidas para acciones diferentes.

### Por confirmar antes de construir

- Dónde bloquea la agenda un procedimiento sin profesional asociado. Se revisó y **no se encontró**: los turnos disponibles (`slots_disponibles`), la validación de la cita y el selector del modal de nueva cita no filtran por procedimiento, solo por actividad, `es_profesional` y sede. El equipo indicó que sí bloquea; falta reproducirlo para ubicar la pantalla. Hasta ahora esa asignación era informativa; con el parámetro del Hito 4C pasa a ser una regla, pero solo en las clínicas que lo activen. Lo único obligatorio siempre es que exista un profesional válido.
- Si el backend rechaza un tratamiento sin sesiones agendables. El formulario actual no lo valida.
- Qué pasa hoy con una cita cuando se apaga cada paso del flujo de recepción (ver Hito 5).

---

## Hito 0 — Línea base y correcciones rápidas

**Duración estimada:** 1 semana
**Prioridad:** crítica

El plan parte de una intuición. Antes de construir se mide y se corrige lo que hoy engaña al usuario.

### Prueba de línea base

- Observar a 3 personas que no conozcan CliniQ intentando dejar una clínica lista para agendar. Sin ayuda.
- Anotar dónde se detienen, qué buscan y no encuentran, y cuánto tardan.
- Los resultados pueden reordenar los hitos siguientes.

### Correcciones de pocos días

Estado de cada corrección:

- ✅ **"Sede con horario" como primer ítem del checklist**, verificando que el horario no esté vacío. *(`setup_checklist` en `clinicas/views.py`, con tests.)*
- ✅ **Quitar el logo** como requisito de "Datos de la clínica".
- ✅ **Criterio de "Agregar un profesional":** exige un profesional válido (activo, `es_profesional` y asignado a una sede activa), no cualquier `Colaborador`.
- ✅ **"Configurar servicios" pasa a "Crear procedimientos"** en el checklist.
- ✅ **Opción "Atiende pacientes" visible** en el formulario de colaborador: junto al rol, con una línea que explica que de ella depende aparecer en la agenda. *(`ColaboradorSheet.tsx`.)*
- ✅ **"Servicio" pasa a "procedimiento"** en el modal de nueva cita ("Por servicio" pasa a "Por procedimiento"), en la edición, el detalle y el tipo de cita de la agenda.
- ✅ **"Puesta en marcha" pasa a "Migrar pacientes en curso"** en el título de la página y en el mensaje de módulo no habilitado. La ruta `/puesta-en-marcha` y el nombre del interruptor del superadmin no cambian.
- ✅ **Enlace "Crear una" del consentimiento** abre en otra pestaña, para no perder lo escrito en el modal de procedimiento.
- ⏭️ **Onboarding actual (pasos 2 y 3 y el texto "¡Tu clínica está lista!"):** no se corrige. Nadie llega a esa página y el Hito 2 la elimina. Arreglarla sería trabajo que se tira.
- ➡️ **Renombrar el asistente "Iniciar atención" a "Preparar paciente": se mueve al Hito 5.** No es un cambio de texto. Hoy el mismo asistente, desde `en_espera`, termina moviendo la cita a `en_curso`, y `CitaDetailSheet` ya distingue "Registrar llegada" (solo llegada) de "Iniciar atención". Renombrarlo sin separar antes la preparación de la atención sería engañoso.

### Entregable

Un informe corto de la prueba con la línea base de tiempos y abandono, y las correcciones aplicadas.

### Criterios de aceptación

- Ningún texto de la aplicación afirma que la clínica está lista sin verificarlo.
- El onboarding o su reemplazo no ofrece pasos que fallan.

---

## Hito 1 — Unificar conceptos y lenguaje

**Duración estimada:** 1 día para el diccionario; la aplicación se hace pantalla por pantalla mientras se trabaja en los demás hitos
**Prioridad:** alta

### Definiciones propuestas

| Concepto | Significado |
|---|---|
| Procedimiento | Acto clínico que puede ejecutarse en una cita |
| Tratamiento | Agrupa varios procedimientos en un paquete comercial de sesiones |
| Sesión | Cita perteneciente a un tratamiento |
| Preparar paciente | Llegada, identidad, pago y firma (recepción) |
| Iniciar atención | Trabajo del profesional |
| Migrar pacientes en curso | Carga de tratamientos que comenzaron fuera de CliniQ |

### Trabajo

Estado (el diccionario completo está en [diccionario-de-producto.md](diccionario-de-producto.md)):

- ✅ **Diccionario de una página.**
- ✅ **"Servicio" eliminado de las pantallas visibles:** agenda (nueva cita, edición, detalle y tipo de cita), tabla del dashboard, historial y listado de atenciones, detalle de movimientos de inventario, formulario de colaborador, página pública de confirmación y mensajes de error del backend (agenda, cotizaciones, consentimientos, protocolos y cobros). El modelo y la API conservan el nombre.
- ✅ **"Tratamiento" sin "(Protocolo)"** y "protocolo" reservado para instrucciones clínicas: hub de Configuración, descripciones de procedimientos, "Protocolo activo" de la atención y el texto de obsequios.
- ✅ **Las dos configuraciones de atención con nombre distinto:** **Recepción** (pasos antes de atender) y **Pantalla del profesional**.
- ✅ **Centro de ayuda:** 20 textos de agenda, catálogo, finanzas, inventario, atenciones y primeros pasos. La categoría "Catálogo de servicios" pasa a "Catálogo". Las palabras clave de búsqueda conservan "servicio" y "protocolo" como sinónimos. **Al desplegar hay que correr `python manage.py cargar_ayuda`** para actualizar la base.
- ⏭️ **Capturas de la ayuda:** las imágenes de "Nueva cita" todavía muestran "Por servicio"; hay que recapturarlas.
- ⏭️ **Compromiso de pago:** los artículos de cartera conservan "servicios" porque citan el texto fijo del documento.
- ⏭️ **Onboarding actual:** no se toca; el Hito 2 lo elimina.
- ⏭️ **"Iniciar atención" cuando lo hace recepción, "tipo de sesión", "seguim." e "info":** se resuelven en los Hitos 5 y 4B.
- ⏭️ **Landing:** habla de "protocolos con sesiones"; se revisa con su rediseño.
- ⏭️ **Consola del superadmin:** no se incluyó; son textos internos de CliniQ.

### Criterio de aceptación

El mismo objeto no recibe nombres distintos en pantallas distintas.

---

## Hito 2 — Preparar mi clínica

**Duración estimada:** 2 semanas
**Prioridad:** crítica

Este hito **fusiona** el onboarding y el centro de preparación en una sola superficie. No habrá un asistente de 3 pasos y un checklist de 9 que hagan lo mismo.

### Comportamiento

- Toda clínica nueva aterriza en **Preparar mi clínica**, no en el dashboard.
- El progreso se **calcula desde los datos reales**, no se guarda aparte. Por eso no se pierde al cerrar sesión ni al cambiar de pantalla.
- Mientras falte algo, el dashboard muestra un acceso visible. Cuando todo está completo, el acceso se oculta pero sigue disponible desde el menú.
- Cada paso muestra estado, una línea sobre para qué sirve, un resumen de lo ya configurado y **una acción que lo resuelve**, en línea siempre que sea posible.

### Pasos

1. **Clínica y sede**, con horario de atención.
2. **Equipo.** Al menos un profesional válido: activo, marcado como profesional y asignado a la sede. Si quien configura también atiende pacientes, un solo clic lo marca a sí mismo ("Yo atiendo pacientes"); si no, se invita a un profesional.
3. **Procedimientos.** Abre el modal rápido del Hito 4.
4. **Cómo recibes al paciente.** El flujo con interruptores del Hito 5.
5. **Tratamientos por sesiones.** Opcional, con opción de omitir.
6. **Tu primera cita.** Con datos reales que crea el usuario. Se marca completo al detectar la primera cita o atención real.
7. **Migrar pacientes en curso.** Opcional y solo visible si el superadmin activó el modo.

Al inicio se pregunta una sola cosa: si la clínica vende **procedimientos sueltos**, **tratamientos por sesiones** o **ambos**. Si vende solo procedimientos, el paso 5 se oculta.

### Estados de preparación

Dos estados, derivados de datos reales *(eran tres en el diseño original; ver más abajo)*:

- **Datos básicos:** clínica con sede y horario.
- **Lista para agendar y atender:** además, al menos un profesional válido (activo, `es_profesional` y en la sede) y un procedimiento. Sin profesional no se puede atender una cita.

"Lista para cobrar y operar" se elimina por ser difusa: el cobro forma parte del flujo de recepción.

### Trabajo técnico

- ✅ Evolucionar `setup_checklist` y `SetupChecklist.tsx`, no crear otro desde cero. El cálculo vive ahora en `backend/apps/clinicas/preparacion.py`.
- ✅ Criterios corregidos: sede con horario, profesional válido (`es_profesional` y asignado a la sede) y sin exigir logo.
- ✅ Aterrizaje: el dashboard redirige una vez por sesión a `/preparar-clinica` mientras la clínica no pueda agendar. Las que ya operan no se redirigen.
- ✅ `onboarding_completado` **queda sin uso**: el estado se deriva de los datos, así que no hay migración de datos ni riesgo de redirigir a clínicas existentes. El campo sigue en el modelo.
- ✅ El onboarding anterior (`/onboarding`) se eliminó.

### Estado de implementación

- ✅ **Página "Preparar mi clínica"** en `/preparar-clinica`, con progreso, niveles y una fila por paso: para qué sirve, resumen de lo configurado y el botón que lo resuelve. El siguiente paso pendiente lleva el botón principal.
- ✅ **"Yo atiendo pacientes"** en el paso Equipo: un clic marca al administrador como profesional y lo asigna a la sede. Solo vale para el administrador de esa clínica.
- ✅ **Pregunta "¿qué vendes?"** (procedimientos, tratamientos o ambos). Si vende solo procedimientos, el paso de tratamientos se oculta.
- ✅ **Omitir y restaurar** los pasos opcionales. Solo se guarda la preferencia (`Clinica.preparacion`, migración `0042`); el progreso nunca se guarda.
- ✅ **Widget del dashboard** reducido a los pasos requeridos, con enlace a la página completa. Se oculta cuando todo está listo.
- ✅ **Acceso permanente** desde el hub de Configuración.
- ✅ **Consentimientos** se mantiene como paso opcional (el checklist anterior lo tenía).
- ⏭️ **Resolución en línea del modal de procedimientos y del flujo de recepción:** hoy los botones llevan a las pantallas existentes. Se conectan en los Hitos 4 y 5.
- ⚠️ **Sin verificar en pantalla:** compila, pasa `tsc` y el endpoint devuelve un resultado correcto con datos reales de dev, pero no se probó con una sesión iniciada.

**Cambios respecto al diseño original:**

- **Se elimina "Lista para atender" como nivel aparte.** El criterio original (flujo de recepción definido y consentimientos con plantilla) no distinguía nada: el flujo siempre tiene valores por defecto y un procedimiento solo "requiere consentimiento" si ya tiene plantilla. Exigir que el profesional haya aceptado su invitación tampoco es correcto: quien atiende lo decide el indicador **"atiende pacientes"** (`es_profesional`), que puede tenerlo un administrador o cualquier otro rol, y es el mismo que habilita agendar. Por eso queda un solo nivel, "Lista para agendar y atender".
- **Invitación pendiente:** no bloquea nada. El paso Equipo solo avisa ("… aún no acepta su invitación") para que se sepa quién no puede iniciar sesión todavía.
- **"Tu primera cita"** cuenta las citas no canceladas de la clínica.
- **Requeridos:** sede, equipo, procedimientos y primera cita. Los demás pasos son opcionales y no cuentan para el progreso.

### Entregable

Una pantalla desde la que se deja la clínica lista para agendar, sin entrar al centro de ayuda.

### Criterios de aceptación

- Toda clínica nueva ve Preparar mi clínica al ingresar.
- Ningún estado "Lista para…" aparece si faltan sus requisitos.
- El paso Equipo no aparece completo hasta que haya un profesional que se pueda elegir al agendar.
- Un administrador nuevo deja la clínica lista para agendar sin instrucciones externas.

---

## Hito 3 — Reorganizar Configuración

**Duración estimada:** 3 a 5 días (solo frontend)
**Prioridad:** alta. Conviene hacerlo antes de terminar el Hito 2, para que el checklist enlace a lugares con nombre claro.

### Trabajo

- ✅ **La tarjeta "General" pasa a "Datos de la clínica"** (en el hub y como pestaña).
- ✅ **Una tarjeta propia por pestaña:** Agenda y recordatorios, Recepción, Registro de pacientes y Biometría. Cada pestaña se abre por enlace directo (`/configuracion/clinica?tab=atencion`), así el hub y el buscador llevan a la sección exacta. Hay una sección nueva, "Recepción y atención", que junta Recepción, Biometría y Pantalla del profesional.
- ✅ **Buscador de configuración,** con palabras clave por tarjeta (llegada, OTP, código, firma, recordatorio, facial…), sin distinguir tildes.
- ✅ **Biometría siempre visible.** Si el plan no incluye el add-on, lo dice. Si el paso facial está apagado, explica cómo activarlo y ofrece "Ir a Recepción". Desde Recepción hay un enlace de vuelta a los umbrales.
- ✅ **Nombres unificados** (Hito 1).
- ✅ **Páginas huérfanas:**
  - `servicios` ya era una redirección a procedimientos; se conserva.
  - `recordatorios` duplicaba una sección de la pestaña Agenda; ahora redirige allí.
  - `plantillas-asistencia` se borró: solo servía al envío antiguo de firma de asistencia, que el frontend ya no llama. El endpoint del backend y el cliente de la API quedan sin uso; limpieza opcional.
- ⏭️ **Accesos contextuales** desde donde ocurre el problema: Hito 5.
- ⚠️ **Sin verificar en pantalla:** compila y pasa `tsc`, pero no se probó con una sesión iniciada.

### Criterio de aceptación

Quien busca "verificación por código" o "firma de asistencia" llega a la configuración correcta en un clic desde el hub o con el buscador.

---

## Hito 4 — Catálogo: procedimientos y tratamientos

**Duración estimada:** 3 semanas (1 para procedimientos, 2 para tratamientos)
**Prioridad:** crítica

Es el corazón del plan. El objetivo es que crear el catálogo sea rápido, comprensible y difícil de hacer mal.

### Pasos de protocolo legados: se retiran (decisión cerrada)

El editor de `pasos_protocolo` no aparece en ninguna pantalla y en producción no hay datos que dependan de ellos (0 procedimientos con pasos, 0 tratamientos de paciente legados). El modo rápido no compite con nada visible, y lo que queda es limpieza. Se hace por etapas para no tocar el esquema de golpe:

1. **Interfaz y ramas de ejecución (sin migraciones).** Borrar `ProtocoloPasos.tsx`, la insignia "N pasos" del detalle del procedimiento y `PanelLegacy`. En el backend, quitar la rama legada de `crear_tratamiento_desde_cotizacion`, la condición `tiene_protocolo` de la señal de cotizaciones y las acciones `pasos` del viewset de procedimientos.
2. **Esquema (opcional, más adelante).** Eliminar `PasoProtocolo` y `Servicio.tiene_protocolo`. Cuidado: `SesionProcedimiento` guarda tanto `paso` (legado) como `tipo_sesion` (nuevo), así que quitar `paso` es una migración sobre una tabla con datos vivos. Dejar la columna sin uso cuesta poco; no hay urgencia.

Ya está corregido el texto de la tarjeta "Procedimientos" del hub de Configuración, que anunciaba "protocolo de pasos".

### 4A — Procedimientos

**Crear con nombre, descripción, minutos/precio/descuento en una fila, profesionales y consentimiento — todo a la vista.** *(Implementado en `ProcedimientoDialog.tsx`; sin verificar en pantalla.)*

- ✅ **Sin "Más opciones":** se retiró tras feedback de que escondía profesionales y consentimiento, dos decisiones importantes. Minutos, precio y descuento máximo van en una sola fila de 3 columnas; "Minutos" y "Descuento" llevan un ícono de ayuda con tooltip (qué es la duración, qué controla el descuento) en vez de texto explicativo permanente. Profesionales y consentimiento quedan siempre visibles, no solo cuando el parámetro de filtro por procedimiento está activo.
- ✅ Botón **"Guardar y agregar otro"**: guarda, deja el modal en blanco con el cursor en el nombre y muestra "Creados ahora: …". No aparece cuando el modal se abre desde un tratamiento, donde solo se crea uno.
- ✅ Después de crear, **no se fuerza la pestaña "Zonas"**. Se cierra con un aviso; las zonas se asignan al editar el procedimiento.
- ✅ Con el parámetro del Hito 4C encendido, **"Profesionales que lo realizan" sale a la vista** con la advertencia de que, sin ninguno, no se puede agendar. La lista de procedimientos muestra **"Falta: profesional"**, que abre el procedimiento para asignarlos.
- ✅ Errores del servidor como líneas separadas ("Nombre: …"), no una cadena unida por barras.
- ✅ Al crear se actualiza el aviso de "Preparar mi clínica" del dashboard.
- ❌ **Descartado (decisión 7):** importación por Excel y catálogo por especialidad.
- ⏭️ **"Falta: consentimiento":** no se construye. No existe un estado "requiere consentimiento pero aún sin plantilla" (hoy "requiere" se deduce de tener plantilla), así que no hay nada que etiquetar sin un campo nuevo en el backend.

**Consentimiento.** Crear una plantilla es pesado (PDF y Documenso). Se mantiene el criterio actual y el enlace "Crear una" ya se abre en otra pestaña para no perder lo escrito. Diferir el consentimiento sin plantilla exigiría un campo nuevo en el backend; queda como decisión abierta.

### 4B — Tratamientos (en modal)

**Estado de implementación** *(en desarrollo; sin verificar en pantalla)*. El modal vive en `components/configuracion/TratamientoDialog.tsx` y la página de tratamientos lo usa.

- ✅ **Modo rápido** ("Vendo N sesiones de X"), con el nombre sugerido y editable, y **crear procedimiento** sin salir del tratamiento.
- ✅ **Constructor** con bloques de sesiones: cantidad, uno o varios procedimientos, "Se agenda" o "Solo informativa". Reordenar con flechas, **duplicar**, **quitar**, **insertar una sesión distinta** entre bloques e **intercalar** una sesión dentro de un bloque (lo parte en dos).
- ✅ **Panel "Así lo verá el paciente":** recorrido numerado, sesiones agendables, duración total y procedimientos distintos. Avisa de: sin sesiones agendables, procedimiento repetido en dos momentos, consentimientos que se pedirán y, con el parámetro del Hito 4C, procedimientos sin profesional.
- ✅ **Sin nombre por bloque:** se deriva de los procedimientos. Los bloques antiguos con otro nombre lo conservan, con un campo para cambiarlo.
- ✅ **Avance guardado en el navegador** para tratamientos nuevos, con "Recuperamos lo que estabas armando. Empezar de cero".
- ✅ **Editar abre directo en el constructor;** el modal se amplía al pasar de rápido a constructor. **"Volver al modo rápido"** mientras el tratamiento siga siendo simple.
- ✅ **Duplicar** desde el menú de la lista.
- ✅ **Validación en el formulario:** nombre, al menos un bloque, procedimiento en cada bloque nuevo y al menos una sesión que se agende. Los bloques que ya existían sin procedimiento solo se avisan, sin bloquear: en la clínica de dev hay un tratamiento con 22 pacientes que tiene uno, y exigirlo impediría editar hasta el precio. El backend no exige nada de esto; queda como decisión abierta.
- ✅ **Se corrige un defecto del formulario anterior:** no enviaba el `id` de cada bloque, así que cada guardado desactivaba todos los bloques y creaba otros. Ahora los actualiza en su lugar. Test en `tests_tratamientos.py`.
- ✅ **Lo vendido es inmutable** *(requisito del producto, verificado en código)*. Antes, `ItemCotizacion.num_sesiones_efectivas()` calculaba el total de un tratamiento desde el catálogo vigente, incluso en cotizaciones ya aceptadas: editar el tratamiento cambiaba cuántas sesiones le quedaban a quien ya lo había comprado. Ahora, una vez aceptada la cotización, el total sale de las sesiones que se guardaron al aceptar (`TratamientoPaciente`), y lo mismo el detalle por bloque que devuelve `/cotizaciones/{id}/sesiones/`. Los obsequios de sesión siguen sumando. Una cotización sin aceptar sigue al catálogo. Tests en `cotizaciones/tests_inmutabilidad.py`.
  - **Límite:** una venta anterior a que se guardara esa copia (sin `TratamientoPaciente`) no tiene otra fuente y conserva el comportamiento anterior. En la clínica de dev, el tratamiento con 22 pacientes tiene copia.
  - **Lo que sigue leyendo el catálogo** de una venta ya hecha es la duración de la cita (agenda), no la cantidad de sesiones.
- ✅ **Aviso al editar un tratamiento ya vendido:** el backend expone `pacientes_con_tratamiento` y el modal dice cuántos pacientes lo tienen y que los cambios aplican solo a las próximas ventas.
- ✅ **Textos:** "tipo de sesión", "seguim." e "info" desaparecen de la interfaz. Estado vacío: "Crear mi primer tratamiento". Artículo de ayuda reescrito.
- ⏭️ **Atajos "Agregar valoración inicial / control al final":** no se construyen; "Insertar una sesión distinta" e "Intercalar" cubren ese caso.
- ✅ **Diferenciar cambios que solo afectan ventas futuras:** resuelto con la inmutabilidad de lo vendido (arriba). Ya no hace falta distinguir tipos de cambio en el formulario.

**El modal empieza compacto** con el modo rápido, el caso más común:

```text
Vendo [ 5 ] sesiones de [ Láser facial ▾ ]   ¿No está? Crear procedimiento
Precio de lista [ $ 1.200.000 ]     Nombre [ Láser facial ×5 ]

[Combinar o agregar controles]              [Cancelar] [Crear tratamiento]
```

- El nombre se sugiere solo y se puede editar.
- Cambiar cantidad o procedimiento actualiza el nombre sugerido mientras el usuario no lo haya editado.

**"Combinar o agregar controles" amplía el mismo modal** al constructor:

- Cada bloque se lee como una frase: **"[5] sesiones de [Láser facial] · Se agenda / Solo informativa"**.
- Se elimina el nombre obligatorio por bloque. Se propone a partir del procedimiento.
- La duración se calcula sola a partir de los procedimientos.
- **"Insertar una sesión distinta aquí"** parte un bloque en dos e inserta la sesión nueva. Reemplaza la explicación larga sobre repetir un procedimiento.
- **"Crear procedimiento"** sin salir del modal (ya existe con un modal apilado).
- Reordenar con flechas (ya existe), duplicar y quitar bloques.
- Panel lateral **"Así lo verá el paciente"** con línea de tiempo:

```text
Sesiones 1–5   Láser facial
Sesión 6       Control médico
Sesiones 7–11  Láser facial
11 sesiones agendables · 9 h 30 min · 2 procedimientos
```

- El panel muestra avisos con acción directa:
  - Sin sesiones agendables.
  - Un procedimiento repetido en dos momentos, con el motivo.
  - Un procedimiento que requiere consentimiento y no tiene plantilla, con enlace para configurarlo.
- Los consentimientos derivados aparecen en el panel. La pestaña "Consentimientos" actual deja de ser necesaria.
- Reemplazar "seguim." e "info" por **"Se agenda"** y **"Solo informativa"**.
- El término "tipo de sesión" desaparece de la interfaz. Para el usuario cada elemento es un bloque de sesiones.
- El avance se guarda en `localStorage`. Si el usuario cierra el modal por error, lo recupera.
- Al editar un tratamiento existente, el modal abre directo en constructor.
- Duplicar un tratamiento para crear una variante.
- Atajos del constructor: "Agregar valoración inicial" y "Agregar control al final". No crean datos: añaden bloques con los procedimientos que el usuario ya tiene.

**Editar un tratamiento ya vendido.** Avisar antes de cambiar su estructura y diferenciar entre cambios que afectan solo ventas futuras y cambios que podrían afectar tratamientos existentes. Esto requiere trabajo de backend y puede recortarse a una advertencia simple en una primera versión.

**Validación.** No permitir guardar un tratamiento sin ninguna sesión agendable, con un mensaje que lo explique. Confirmar si el backend debe rechazarlo también.

**Estado vacío.** En lugar de "No hay tratamientos configurados":

> Un tratamiento es un paquete que vendes al paciente. Está compuesto por las sesiones que podrá agendar después de aceptar la cotización.
> `Crear mi primer tratamiento`

### 4C — Parámetro de la clínica: filtrar profesionales por procedimiento (implementado en desarrollo)

Campo `filtrar_profesionales_por_procedimiento` en `Clinica` (migración `0041`), apagado por defecto y editable en Configuración > Agenda. El valor viaja también en el perfil del usuario, porque recepción puede no tener el permiso `clinicas.ver`.

**Apagado:** nada cambia. Cualquier profesional de la sede puede atender cualquier procedimiento.

**Encendido:**

- **Nueva cita, "Por procedimiento":** el procedimiento pasa antes que el profesional. El selector de profesional queda inactivo con "Elige sede y procedimiento primero" y después solo lista a quienes realizan ese procedimiento en esa sede. Si nadie lo realiza, lo explica.
- **Nueva cita, "Sesión de cotización":** filtra por el ítem elegido o, si se elige, por la sesión del tratamiento. La sesión es opcional; sin ella no se restringe. En una sesión combinada basta con que el profesional realice **al menos uno** de sus procedimientos.
- **Nueva cita, "Consulta libre":** no tiene procedimiento, así que se ofrecen todos.
- **Editar cita y Cambiar profesional:** mismo filtro.
- **Validación en el servidor** al crear una cita o cambiar su profesional o procedimiento. No es retroactiva: editar otros campos de una cita existente no se rechaza.
- **Al encenderlo,** avisa cuántos procedimientos quedarían sin profesional y ofrece **"Asignar a todos y activar"**, **"Activar sin asignar"** o cancelar.
- **Checklist:** "Crear procedimientos" solo se completa si hay un procedimiento con profesional.

**Pendiente de este hito:** la etiqueta "Falta: profesional" en la lista de procedimientos (4A), probar el flujo en pantalla y desplegar.

### 4D — Catálogo sale de Configuración (decisión 8, hecho en desarrollo)

- ✅ **Nueva ruta `/catalogo`**, sección de primer nivel dentro de Ventas en el sidebar, con pestañas Procedimientos/Tratamientos (`?tab=`) y un párrafo corto que explica la diferencia entre uno y otro.
- ✅ **Sin reescribir lógica:** las tablas, filtros y modales de 4A/4B se reubicaron tal cual a `components/catalogo/ProcedimientosCatalogo.tsx` y `TratamientosCatalogo.tsx`.
- ✅ **Permiso propio** (`servicios.ver`) para el ítem del sidebar, en vez de depender de poder ver "Configuración" (`clinicas.editar`/`usuarios.ver`/`roles.ver`) — antes, un rol con permiso para gestionar el catálogo pero sin esos otros tres no tenía forma de llegar ahí desde el menú.
- ✅ **Rutas viejas como redirect:** `/configuracion/procedimientos`, `/configuracion/tratamientos`, `/configuracion/servicios` → `/catalogo`. Actualizados los hrefs del checklist "Preparar mi clínica" (backend) y dos artículos del centro de ayuda.
- ⚠️ **Sin verificar en pantalla** con sesión real, igual que el resto del plan.

### Entregable

Un modal rápido de procedimiento, un modal de tratamiento con modo rápido y constructor con línea de tiempo, y el parámetro de profesionales por procedimiento.

### Criterios de aceptación

- Crear un procedimiento básico toma menos de 1 minuto.
- Crear un tratamiento sencillo toma menos de 2 minutos.
- El usuario crea un tratamiento sin leer una explicación extensa.
- Antes de guardar se ven el total y el orden de las sesiones.
- Todo aviso de consentimiento o profesional incluye una acción directa.
- Cuatro de cinco usuarios nuevos completan un tratamiento combinado sin asistencia.

---

## Hito 5 — Recepción y atención clínica

**Duración estimada:** 1 a 1,5 semanas
**Prioridad:** alta

### Flujo

```text
Recepción · Preparar paciente
Verificación de llegada → Verificación facial → Pago → Firma de asistencia
                                                                   ↓
Profesional                                                Listo para atender
Iniciar atención → Registrar nota → Completar atención
```

### Configuración: el flujo visible con interruptor por paso

- En **Cómo recibes al paciente** (y en Configuración > Recepción) se muestra el flujo completo como nodos.
- Cada nodo tiene una línea corta de descripción y un **interruptor** para activarlo o apagarlo.
- Los pasos apagados se ven atenuados. Debajo, una vista previa: **"Recepción verá: N pasos antes de atender"**.
- Los add-ons no habilitados (verificación por WhatsApp, verificación facial) se muestran bloqueados y, al pulsar, explican cómo activarlos.
- El orden de los pasos es fijo. Los cambios aplican a las próximas atenciones.
- Los ajustes avanzados (umbrales de confianza, foto de control obligatoria) quedan en un enlace aparte.

### Operación diaria

- Mostrar los nombres de los pasos permanentemente, sin depender del hover.
- Indicar cuántos pasos faltan.
- Cuando "Iniciar atención" esté bloqueado, mostrar **qué falta y quién debe resolverlo**.
- Dar a recepción un CTA principal: **Preparar paciente**. Dar al profesional otro: **Iniciar atención**.
- Añadir para administradores un acceso **"Cambiar los pasos de recepción"** desde el asistente de recepción y desde los mensajes de bloqueo.

### Estados operativos

Los estados mostrados (Sin llegar, En preparación, Listo para atender, En atención, Finalizada) se **derivan** de `EstadoCita` (`pendiente`, `confirmada`, `en_espera`, `en_curso`, `completada`, `cancelada`, `no_asistio`) y de los pasos completados. No se crean enums nuevos, para no tocar agenda, filtros y reportes.

### Separar la preparación de la atención (viene del Hito 0)

Hoy `IniciarAtencionWizard` cubre las dos cosas: desde `confirmada` registra la llegada (→ `en_espera`) y desde `en_espera` completa pago y firma y mueve la cita a `en_curso`. Antes de renombrarlo a **Preparar paciente** hay que decidir dónde termina la preparación y quién mueve la cita a `en_curso`. La propuesta es que el asistente de recepción termine en "Listo para atender" (estado derivado) y que solo el profesional inicie la atención.

### Por decidir

Qué ocurre con la cita cuando se apaga un paso de **pago** o **firma**: hoy ninguno de los dos deja un registro alternativo si están apagados (nadie cobra ni firma nada por otro lado). Falta decidir si eso es intencional o si hace falta un aviso o un registro manual, y mostrar la consecuencia junto a cada interruptor.

- ✅ **Verificado que el asistente ya respeta la configuración de la clínica, incluso con todo apagado.** Se dudó de que "todos los pasos apagados" dejara el asistente trabado (`activeSteps` vacío). Revisado a fondo: `'consentimiento'` siempre queda en la lista de pasos activos (no depende de ningún interruptor), así que nunca queda vacía; si el procedimiento no exige consentimiento, se completa sola y el asistente pasa igual a "Paciente listo". No hizo falta ningún cambio de código.

### Hecho fuera de este hito, pero relacionado (confirmación de la cita)

- ✅ **Modal de confirmación simplificado.** Al hacer clic en una acción específica ("Confirmar cita", "Cancelar cita", "Marcar no asistió"…) el modal ya no vuelve a preguntar "¿Qué ocurrió?": la acción viaja elegida desde el botón que lo abrió. "Medio de contacto" y la nota quedan bajo "Agregar detalles del contacto (opcional)", plegado por defecto. *(`CitaDetailSheet.tsx`, `ConfirmacionForm.tsx`.)*
- ✅ **Aviso de citas sin confirmar,** en el dashboard y en la barra de la agenda: cuenta las citas sin confirmar del próximo día que cada sede trabaja. No es siempre "mañana" en el calendario — si una sede no abre mañana, se corre al siguiente día hábil de esa sede (p. ej. de viernes a lunes si no abre los viernes). *(`agenda/services.py`: `proximo_dia_habil_sede`, `citas_sin_confirmar_proximo_dia_habil`; endpoint `GET /agenda/citas/sin_confirmar_proximo_dia_habil/`; tests en `agenda/tests_citas_sin_confirmar.py`; frontend `components/shared/AvisoCitasSinConfirmar.tsx`, usado en el dashboard y en `/agenda`.)*

### Criterios de aceptación

- Al mirar una cita se entiende qué falta y quién debe actuar.
- Ningún bloqueo depende solo de un tooltip.
- El flujo se entiende igual en escritorio y en pantalla táctil.
- Un administrador puede encender o apagar un paso viendo el flujo completo.

---

## Hito 6 — Validación, ayuda contextual y medición

**Duración estimada:** 1 semana
**Prioridad:** alta

### Ayuda contextual

Integrar el contenido del centro de ayuda dentro de las tareas:

- Explicaciones breves junto a decisiones difíciles.
- Enlaces directos para resolver configuraciones faltantes.
- Ejemplos dentro de los estados vacíos.
- Un resumen al completar cada etapa.

### Primera cita guiada, con datos reales

No hay paciente ficticio. El paso **Tu primera cita** del checklist acompaña al usuario con sus propios datos:

1. Crear un paciente real.
2. Agendar un procedimiento.
3. Registrar llegada.
4. Resolver el consentimiento, si el procedimiento lo requiere.
5. Iniciar la atención.
6. Registrar una nota mínima.
7. Completar la atención.
8. Verificar que la sesión o el cobro quedaron registrados.

Se cubre también el camino de **cotización**, que es el único para vender tratamientos.

### Medición

Sin infraestructura de analítica, se mide **desde la base de datos**, con una consulta en la consola de administración:

- Fecha de creación de la clínica, primera sede, primer profesional, primer procedimiento, primer tratamiento, primera cita y primera atención completada.
- Tiempo entre cada hito.
- Clínicas que se quedaron en cada paso.

Registrar eventos de abandono por paso puede posponerse hasta ver si esta medición basta.

### Validación con usuarios

Repetir la prueba del Hito 0, ahora con 5 personas que no conozcan CliniQ, y comparar con la línea base.

### Entregable

Recorrido validado con usuarios nuevos y medición básica de activación.

### Criterios de aceptación

- Cuatro de cinco completan la configuración básica sin asistencia.
- Cuatro de cinco distinguen procedimiento y tratamiento.
- Cuatro de cinco completan su primera cita.
- Se documentan los tres principales puntos de abandono restantes.

---

## Orden de entrega

### Versión 1: hitos 0 a 3

Resuelve el mayor riesgo: que una clínica se registre y no sepa cómo comenzar. Incluye las correcciones rápidas, el vocabulario, Preparar mi clínica y una Configuración encontrable.

### Versión 2: hito 4

El catálogo rápido y amigable. Es la parte más visible para el usuario nuevo y la que más pesa en la meta del plan.

### Versión 3: hitos 5 y 6

El flujo de recepción visible, la validación con usuarios y la medición.

**Duración total estimada:** 10 a 12 semanas, con margen para imprevistos. El Hito 2 es una reescritura del onboarding, no una simple conexión, y el Hito 4B incluye trabajo de backend.

## Indicadores de éxito

Las metas se ajustan con la línea base del Hito 0.

| Indicador | Objetivo inicial |
|---|---:|
| Clínicas que terminan la configuración básica | ≥ 70 % |
| Tiempo hasta la primera cita creada | < 30 minutos |
| Tiempo hasta el primer procedimiento | < 1 minuto (modal) |
| Clínicas que completan su primera cita | ≥ 60 % |
| Usuarios que distinguen procedimiento y tratamiento | ≥ 80 % |
| Consultas de "no encuentro" o "no puedo iniciar" | Reducción ≥ 40 % (requiere línea base de consultas) |

## Riesgos y decisiones abiertas

| Tema | Decisión o riesgo |
|---|---|
| Pasos de protocolo legados | **Resuelto:** sin datos en producción, se retiran por etapas (ver Hito 4). |
| Catálogo por especialidad | **Resuelto:** no se incluye ni hay importación por Excel (decisión 7). |
| Consentimiento pendiente | Campo nuevo en backend, o mantener el criterio actual. |
| Profesional por procedimiento | **Resuelto:** parámetro por clínica, apagado por defecto (Hito 4C). Queda por reproducir dónde bloqueaba la agenda un procedimiento sin profesional, porque no se encontró en el código. |
| Edición de tratamientos vendidos | Advertencia simple o control completo. Trabajo de backend. |
| Efecto de apagar un paso de recepción | Documentar y mostrar junto a cada interruptor. |
| Medición | Desde la BD primero. Instrumentar solo si hace falta. |

## Principio de ejecución

No comenzar por embellecer formularios aislados. Primero debe existir una columna vertebral clara que responda:

1. Qué se debe configurar.
2. En qué orden debe hacerse.
3. Qué habilita cada paso.
4. Cuándo la clínica está realmente preparada para agendar, atender y cobrar.

Y en cada pantalla, el criterio de decisión es: **menos campos, menos texto, y una acción directa para lo que falta.**

---

## Anexo A — Qué cambió respecto a la versión anterior

- **Nuevo:** sección "Decisiones de producto" (sin datos demo, tratamientos en modal, sin borrador en backend, flujo de recepción visible, sin bloqueos innecesarios).
- **Nuevo:** "Diagnóstico" con hallazgos verificados en código y una lista de puntos por confirmar.
- **Nuevo Hito 0:** línea base con 3 usuarios y correcciones rápidas (onboarding roto, textos que afirman "lista", sede con horario, logo, enlace de consentimiento).
- **Hitos 2 y 3 fusionados** en "Preparar mi clínica", evolucionando el checklist existente. Los estados de preparación pasan de cuatro a tres.
- **Nuevo Hito 3:** reorganizar Configuración (nombres, tarjetas, buscador, páginas huérfanas).
- **Hito 4 rehecho:**
  - Procedimientos: 3 campos, "guardar y agregar otro" y etiqueta "Falta: profesional" cuando aplica. Sin Excel ni catálogo precargado.
  - Tratamientos: modal compacto que se amplía a constructor con línea de tiempo, en lugar de 4 pasos.
  - Se elimina el borrador en backend.
  - Nuevo punto de decisión sobre los pasos de protocolo legados.
- **Hito 5:** flujo visible con interruptor por paso (en lugar de opciones prearmadas), estados derivados de `EstadoCita`, acceso contextual para administradores.
- **Hito 6:** se elimina el paciente ficticio, la primera cita usa datos reales, la medición sale de la base de datos y la prueba con usuarios se repite contra una línea base.
- **Profesional:** se documenta que un profesional válido (activo, `es_profesional` y en la sede) es obligatorio para atender, y que el checklist actual lo da por cumplido sin serlo. "Equipo" incorpora el atajo "Yo atiendo pacientes".
- **Vocabulario de agenda:** "Por servicio" y demás textos "servicio" del modal de nueva cita, la edición y el detalle pasan a "procedimiento" (Hitos 0 y 1).
- **Parámetro de profesionales por procedimiento (Hito 4C):** la clínica decide si al agendar se ofrecen todos los profesionales o solo los del procedimiento. Reemplaza la decisión anterior de dejar esa asignación siempre opcional.
- **Duración:** de 7–9 a 10–12 semanas.
- **Indicadores:** ajustados (primer procedimiento y tratamiento más rápidos, línea base de consultas).

## Anexo B — Referencias en el código

| Tema | Ubicación |
|---|---|
| Preparar mi clínica (Hito 2) | `backend/apps/clinicas/preparacion.py`, `views.py` (`setup_checklist`, `preparacion`, `preparacion_yo_atiendo`), `tests_preparacion.py`; en el frontend `app/(authenticated)/preparar-clinica/page.tsx` y `components/shared/SetupChecklist.tsx` (widget del dashboard). El onboarding anterior se eliminó. |
| Configuración reorganizada (Hito 3) | `frontend/src/app/(authenticated)/configuracion/page.tsx` (hub con buscador) y `configuracion/clinica/page.tsx` (pestañas por enlace `?tab=`) |
| Creación de usuarios y roles no creables | `backend/apps/users/serializers.py` |
| Disponibilidad de agenda | `backend/apps/agenda/services.py` (`get_slots_disponibles`) |
| Quién puede elegirse como profesional | `backend/apps/colaboradores/views.py` (`profesionales`), `backend/apps/agenda/serializers.py` (exige `es_profesional`) |
| Filtro por procedimiento (parámetro de la clínica) | `backend/apps/clinicas/models.py` (`filtrar_profesionales_por_procedimiento`), `colaboradores/views.py`, `agenda/serializers.py` (`procedimientos_de_la_cita`), `clinicas/views.py` (resumen y asignación masiva), `agenda/tests_filtro_profesionales.py`; en el frontend `ProfesionalSelect.tsx`, `NuevaCitaModal.tsx`, `EditarCitaForm.tsx`, `CambiarProfesionalDialog.tsx`, `FiltroProfesionalesPorProcedimiento.tsx` |
| Colaborador automático del primer administrador | `backend/apps/colaboradores/signals.py`, `backend/apps/colaboradores/services.py` (`ensure_admin_colaborador`) |
| Modal de nueva cita y textos "servicio" | `frontend/src/components/agenda/NuevaCitaModal.tsx`, `EditarCitaForm.tsx`, `CitaDetailSheet.tsx`, `ServicioSelect.tsx` |
| Modal de procedimiento | `frontend/src/components/configuracion/ProcedimientoDialog.tsx` |
| Modal de tratamiento | `frontend/src/components/configuracion/TratamientoDialog.tsx` |
| Catálogo (Procedimientos + Tratamientos, sacado de Configuración) | `frontend/src/app/(authenticated)/catalogo/page.tsx`, `frontend/src/components/catalogo/ProcedimientosCatalogo.tsx`, `TratamientosCatalogo.tsx`; sidebar en `AppShell.tsx` (sección Ventas); rutas viejas `configuracion/procedimientos` y `configuracion/tratamientos` quedan como redirect |
| Modelo de tratamientos | `backend/apps/clinicas/models.py` (`TratamientoCatalogo`, `TipoSesion`) |
| Pasos de protocolo legados | `frontend/src/components/configuracion/ProtocoloPasos.tsx`, `frontend/src/components/protocolos/ProtocoloPanelAtencion.tsx` |
| Hub de Configuración | `frontend/src/app/(authenticated)/configuracion/page.tsx` |
| Flujo de inicio de atención | `frontend/src/app/(authenticated)/configuracion/clinica/page.tsx` (pestaña Atención) |
| Asistente de recepción | `frontend/src/components/atenciones/IniciarAtencionWizard.tsx`, `ColaEspera.tsx` |
| Confirmación de cita (modal simplificado) | `frontend/src/components/agenda/CitaDetailSheet.tsx`, `ConfirmacionForm.tsx` |
| Aviso de citas sin confirmar | `backend/apps/agenda/services.py` (`proximo_dia_habil_sede`, `citas_sin_confirmar_proximo_dia_habil`), `agenda/views.py` (`CitaViewSet.sin_confirmar_proximo_dia_habil`); `frontend/src/components/shared/AvisoCitasSinConfirmar.tsx` |
| Carga masiva (patrón a reutilizar) | `frontend/src/components/pacientes/CargaMasivaPacientesModal.tsx` |
| Puesta en marcha | `frontend/src/components/shared/PuestaEnMarchaBanner.tsx`, `frontend/src/app/(authenticated)/puesta-en-marcha/` |

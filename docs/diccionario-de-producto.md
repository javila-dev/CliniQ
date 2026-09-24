# Diccionario de producto

Un mismo objeto recibe un mismo nombre en toda la aplicación. Lo que ve el usuario sigue esta página; el código interno puede conservar nombres antiguos.

## Los conceptos

| Se dice | Significa | No se dice |
|---|---|---|
| **Procedimiento** | Acto clínico que se puede realizar en una cita (limpieza facial, láser). Tiene duración y precio. | servicio |
| **Tratamiento** | Agrupa varios procedimientos en un paquete comercial de sesiones que se vende al paciente de una vez. | plan, protocolo, "Tratamiento (Protocolo)" |
| **Sesión** | Cada cita que forma parte de un tratamiento. | paso, tipo de sesión (en pantallas nuevas) |
| **Preparar paciente** | Lo que hace recepción antes de atender: llegada, verificación, pago y firma. | iniciar atención (cuando lo hace recepción) |
| **Iniciar atención** | Lo que hace el profesional al comenzar el trabajo clínico. | |
| **Migrar pacientes en curso** | Cargar tratamientos que empezaron fuera de CliniQ. | puesta en marcha |
| **Protocolo** | Solo instrucciones o pasos clínicos. Nunca un nombre para un tratamiento. | |

## Nombres de pantallas y configuraciones

| Pantalla | Nombre |
|---|---|
| Lo que ve el profesional durante una atención | **Pantalla del profesional** |
| Pasos que recepción completa antes de atender | **Recepción** (pasos antes de atender) |
| Catálogo de lo que ofrece la clínica | **Catálogo**, con **Procedimientos** y **Tratamientos** |

## Estados de una cita (de cara al usuario)

Sin llegar → En preparación → Listo para atender → En atención → Finalizada. Se derivan de los estados internos; no se crean estados nuevos. *(Se aplican en el Hito 5.)*

## Reglas de redacción

- Sentence case y español neutro.
- Un botón o una etiqueta nombra la acción o el objeto, no la estructura técnica.
- Los mensajes de error dicen qué pasó y qué hacer, sin nombres de campos ni de permisos.
- "Servicio" solo se usa con otro significado: servicio de mensajería, términos de servicio o categorías como "servicios públicos".

## Lo que conserva el nombre antiguo (interno, no visible)

Se dejan así a propósito para no tocar el esquema ni la API:

- El modelo `Servicio` y las rutas `/clinicas/servicios/`.
- Las claves de permiso `servicios.ver` y `servicios.gestionar`.
- Los campos `servicio`, `servicio_id` y similares en las respuestas de la API.
- El valor `'servicio'` de tipos internos (modo de cita, tipo de ítem de cobro).
- El nombre de la ruta `/puesta-en-marcha` y el interruptor del superadmin "Modo puesta en marcha".

## Pendiente de aplicar

- **Hito 2:** el onboarding actual (se elimina) y "Preparar mi clínica".
- **Hito 4:** "tipo de sesión", "seguim." e "info" en el formulario de tratamientos.
- **Hito 5:** "Iniciar atención" cuando lo hace recepción, y los estados de la cita.
- **Marketing:** la landing habla de "protocolos con sesiones"; se revisa con su rediseño.
- **Ayuda:** las capturas de "Nueva cita" muestran el nombre antiguo y hay que recapturarlas. Los artículos de cartera conservan "servicios" porque citan el texto fijo del compromiso de pago.

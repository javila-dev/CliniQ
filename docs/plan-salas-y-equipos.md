# Salas y equipos en la agenda

Plan del 5/11/2026. Fase 1 (backend) implementada en la rama local
`feature/salas-y-equipos`; ver *Implementación*.

## Problema

Hoy la agenda solo revisa al profesional: horario de la sede, horario especial
del colaborador, sus otras citas y los bloqueos (`apps/agenda/services.py`:
`get_slots_disponibles`, `validar_horario_cita`). No existe sala, cabina ni
equipo.

En depilación láser y aparatología el cuello de botella casi nunca es la
persona:

- Hay un solo láser y 2 o 3 cabinas. El láser se mueve de cabina en cabina, pero
  no puede estar en dos a la vez.
- Es común alquilar el equipo por días ("el Soprano viene martes y jueves"): los
  servicios con láser solo se agendan esos días.
- A veces hay dos equipos que sirven para lo mismo; da igual cuál se use.
- En la clínica médica pasa lo mismo con el HIFU o el CO₂, y con consultorios
  compartidos.

Pero **no todas las citas dependen de esto**. Una valoración, un control o una
consulta pueden hacerse sin cabina ni equipo, y no deben quedar frenadas porque
las cabinas estén llenas.

Hoy dos operadoras quedan agendadas a la misma hora con el único láser, o tres
citas en un centro de dos cabinas, y la app no avisa. Ya se había señalado como
lo más importante para ese segmento (sesiones "Evaluación de la app de citas",
25/9, y "Modo SPA depilación light", 7/10).

## Lo primero: que sea fácil

Pedido del usuario (5/11/2026): tiene que ser muy intuitivo y simple de usar.
Eso manda sobre todo lo demás del plan:

1. **Cada procedimiento dice si necesita sala o equipo**, al crearlo o editarlo,
   con opciones claras. Por defecto no necesita nada.
2. **Agendar no pide pasos nuevos.**
   - Si el procedimiento necesita sala o equipo, la app los elige sola y los
     muestra en una línea; solo se tocan si se quieren cambiar.
   - Si no necesita, se puede **agregar** una sala o un equipo a esa cita, de
     forma opcional.
3. **Cuando no hay horario, dice por qué** y ofrece el próximo libre.
   - Una agenda vacía sin explicación se siente como un error.
4. **Si no se usa, no se ve.**
   - Una clínica sin salas ni equipos no muestra campos, columnas ni avisos
     nuevos.
5. **Lenguaje simple.**
   - "Cabina 2 está ocupada", "El Soprano no viene los lunes".
   - Nunca "recurso", "conflicto" ni "requisito".

## Decisiones

| # | Pregunta | Decisión |
|---|---|---|
| D1 | Nombre en la interfaz | **Salas y equipos**. Cada sala lleva el nombre que quiera la clínica ("Cabina 1", "Consultorio 2"). En el código: `Recurso`. |
| D2 | ¿El recurso es de una sede o de la clínica? | **De una sede.** Un equipo que rota entre sedes queda para después (ver *Fuera de alcance*). |
| D3 | ¿Cruce de recurso bloquea o avisa? | **Bloquea.** El equipo no puede estar en dos sitios. No es como el cruce de paciente (M3-30), que se puede confirmar. |
| D4 | Citas futuras al configurarlo | Se les asigna sala o equipo a las que se pueda; las demás quedan marcadas **"Falta sala"** / **"Falta equipo"** en la agenda. No se cancela ni se mueve nada. Antes de guardar se muestra cuántas quedarían así. |
| D5 | ¿Dónde se dice qué usa cada procedimiento? | **En el procedimiento**, al crearlo o editarlo (pedido del usuario 5/11). Desde la pantalla del equipo hay un atajo para marcar varios procedimientos a la vez; es la misma información. |
| D6 | ¿Qué citas ocupan sala o equipo? | **Solo las que lo necesitan** según su procedimiento, **o a las que se les eligió uno al agendar**. Las demás no ocupan nada y se agendan como hoy. |
| — | ¿Cita sin profesional (se agenda "en la cabina")? | No. El profesional sigue obligatorio (atención, comisiones, firma dependen de él). Más adelante: "cualquier profesional disponible" al buscar horario. |

## Cómo se ve

### 1. Crear las salas y equipos de la sede (una vez)

En **Configuración → Sedes → *la sede* → Salas y equipos**. Sin nada
configurado, el estado vacío pregunta:

> **¿Cuántas cabinas o consultorios tiene esta sede?**  [ − 3 + ]
> Crea "Cabina 1", "Cabina 2" y "Cabina 3". Puedes cambiarles el nombre.
>
> **¿Tienes equipos que se comparten entre cabinas?**  [ + Agregar equipo ]

**Agregar equipo** abre un panel corto:

- **Nombre:** `Soprano`
- **Disponible:** ◉ Todos los días que abre la sede ○ Solo algunos días
  `[L] [M] [X] [J] [V] [S] [D]`. Debajo, un enlace opcional "Con horario
  distinto" abre las horas por día.
- **¿Qué procedimientos lo usan?** (opcional, atajo): buscador con casillas,
  por ejemplo ☑ Depilación axilas ☑ Depilación piernas ☑ Depilación bikini.
  Escribe lo mismo que el campo "Equipo" de cada procedimiento.

**En cada fila de sala o equipo**:
- Renombrar.
- **No disponible…** (fechas y motivo; crea un bloqueo ya aprobado).
- Desactivar.
- Debajo del nombre: "Lo usan 6 procedimientos".

### 2. Decir qué necesita cada procedimiento (al crearlo o editarlo)

En **Catálogo → Procedimiento**, una sección **Sala y equipo**. Solo aparece si
la clínica tiene alguna sala o equipo; si no, se muestra solo un enlace
discreto: "¿Usas cabinas o equipos? Configúralos en Sedes".

> **Sala**
> ◉ No necesita
> ○ Cualquier sala libre
> ○ Solo estas salas: `[Cabina 1 ×] [Cabina 3 ×]  + Agregar`
>
> **Equipo**
> ◉ No necesita
> ○ Necesita: `[Soprano ×]  + Agregar`
> *Si eliges varios, sirve cualquiera que esté libre.*

- **Por defecto**, "No necesita" en las dos: un procedimiento nuevo funciona
  como hoy.
- **Con varias sedes**, las salas y equipos aparecen agrupados por sede. Cada
  cita usa los de su sede.
- **Al guardar**, si cambia lo que necesita, se muestra el efecto sobre las
  citas ya agendadas (ver *Citas ya agendadas*).

### 3. Agendar

**Procedimiento que necesita sala o equipo:**
- Los horarios ya vienen filtrados: solo los que tienen cabina y equipo libres.
- Al elegir un horario aparece una línea discreta: `Cabina 2 · Soprano  Cambiar`.
  **Cambiar** ofrece solo las que sirven y están libres a esa hora.

**Procedimiento que no necesita nada** (o consulta libre):
- Los horarios son los de siempre.
- Al elegir un horario aparece un enlace discreto: `+ Sala o equipo (opcional)`.
- Al tocarlo se listan solo las salas y equipos libres a esa hora. Elegir uno lo
  reserva para esta cita; se puede quitar con ×.

**Día sin horarios por la sala o el equipo**, se explica:
> El Soprano no viene los lunes. **Ver martes 11 →**
>
> Las 3 cabinas están ocupadas toda la tarde. **Primer horario libre: 9:30 →**

**Si alguien ganó el horario mientras tanto**, sale un mensaje corto y se
refrescan los horarios:
> Otra persona acaba de agendar la Cabina 2 a esa hora. Elige otro horario.

Lo mismo aplica al editar o reprogramar una cita.

### 4. Ver la agenda

- **Tarjeta de la cita:** si tiene sala o equipo, una etiqueta pequeña
  `Cab. 2 · Soprano`. Si no usa nada, no cambia.
- **Vista Columnas:** gana "Por sala" y "Por equipo", solo si la sede tiene
  salas o equipos.
  - Cada columna muestra las citas que ocupan esa sala o equipo.
  - Las citas que no usan sala no aparecen en "Por sala"; se ven en la vista
    por profesional, que sigue siendo la principal.
  - Arrastrar una cita a otra columna de sala la cambia de cabina.
- **Citas con falta:** solo cuando hay alguna (D4), una barra ámbar:
  > 2 citas de esta semana necesitan cabina y no tienen. **Revisarlas**

## Principio: no cambia nada para quien no lo usa

- Una clínica sin salas ni equipos funciona exactamente igual que hoy y no
  muestra nada nuevo.
- Un procedimiento en "No necesita" se agenda igual que hoy, aunque la sede
  tenga cabinas.

## Modelo de datos

En `apps/clinicas` (`Servicio` los referencia; así no hay import circular):

**`Recurso`**
- `clinica` (FK, para acotar), `sede` (FK), `nombre`, `tipo` (`sala` | `equipo`),
  `orden`, `activo`.
- Nombre único por sede ignorando mayúsculas y espacios (como `Servicio`).
- Desactivar no borra: las citas pasadas lo siguen mostrando.

**`HorarioRecurso`** — copia de `HorarioColaborador`
- `recurso`, `dia_semana`, `no_disponible`, `hora_inicio`, `hora_fin`.
- Sin registro para el día = disponible en el horario de la sede.
- La interfaz de "Solo algunos días" escribe registros `no_disponible` para los
  días sin marcar.

**En `Servicio`** (procedimiento):
- `necesita_sala` (choices `no` | `cualquiera` | `algunas`, por defecto `no`).
- `salas` (M2M a `Recurso`): las admitidas cuando `necesita_sala = algunas`.
- `equipos` (M2M a `Recurso`): vacío = no necesita equipo; con varios, sirve
  cualquiera.
- El atajo "¿Qué procedimientos lo usan?" de la pantalla del equipo escribe en
  esta misma relación `equipos`.

En `apps/agenda`:

**`CitaRecurso`**
- `cita`, `recurso`, `elegido_a_mano` (bool). Una fila por recurso asignado.
- `elegido_a_mano`: la cita no lo necesitaba por su procedimiento; se agregó al
  agendar.
- Índice por `(recurso, cita)`.

**`BloqueoAgenda.recurso`** (FK, null)
- Un bloqueo con recurso afecta solo a ese recurso. "No disponible…" lo crea ya
  aprobado.

## Qué necesita cada cita

Solo cuentan los recursos activos de la sede de la cita.

**Sala** (se mira cada procedimiento de la cita):
- Si todos están en `no`, la cita no necesita sala.
- Si alguno está en `cualquiera` o `algunas`, necesita una.
- Sirve cualquier sala de la sede que admitan todos los que están en `algunas`.
- Si un procedimiento en `algunas` no tiene ninguna sala de esta sede, en esta
  sede se trata como `cualquiera`.

**Equipos:**
- Por cada procedimiento con `equipos` de esta sede, hace falta uno de ellos.
- Si dos procedimientos piden el mismo conjunto de equipos, cuenta una vez.
- Si un procedimiento pide equipos, pero ninguno es de esta sede, en esta sede no
  pide equipo.

**Además**, lo que se haya elegido a mano en la cita.

**Procedimientos de la cita, según su forma:**

| Forma de la cita | Procedimientos |
|---|---|
| Procedimiento (`servicio`) | Ese. |
| Ítem de cotización con procedimiento | El procedimiento efectivo del ítem. |
| Sesión de tratamiento (`sesion_ejecutada`) | Los de su tipo de sesión. |
| Tratamiento sin sesión elegida | Los del tipo de sesión que usa `_resolver_duracion` para la duración, para que horario y recursos coincidan. |
| Consulta libre (solo duración) | Ninguno. Solo lo elegido a mano. |

En la primera versión el recurso queda ocupado toda la cita.

## Reglas de disponibilidad

**Un solo cálculo.** Horarios disponibles, crear, editar (incluido arrastrar) y
la futura reserva online usan las mismas funciones. Un horario sirve si:

1. el profesional está libre (como hoy), y
2. para la sala y para cada equipo que necesite la cita, hay al menos una
   unidad que:
   - está dentro de su horario (o del de la sede si no tiene),
   - no tiene un bloqueo aprobado que se cruce,
   - no tiene otra cita activa que se cruce.

Lo elegido a mano no filtra la lista de horarios, porque se elige después de la
hora. Sí se valida al guardar.

**Ocupación.** Igual que con el profesional:
- Cancelada y no asistió liberan.
- En curso ocupa desde la hora real de inicio (`obtener_rango_ocupado`).
- Las citas de la migración (`es_migracion`) no se validan ni ocupan.

**Asignación.**
- Al crear: la primera unidad libre que sirva, según `orden`.
- Quien agenda la puede cambiar por otra libre que sirva, o agregar una a mano.
- Al editar (hora, duración, procedimiento o sede):
  - Lo que pide el procedimiento: se mantiene si sigue libre, se reasigna solo si
    no, error si no hay ninguna.
  - Lo elegido a mano: se mantiene si sigue libre. Si no, error con la opción de
    quitarlo: "La Cabina 2 está ocupada a esa hora. Elige otra o quítala."
  - Si el procedimiento nuevo ya no lo necesita, se suelta.
- Cambiar solo el profesional no toca los recursos.

**Motivo cuando no hay horarios.** `slots_disponibles` devuelve, además de la
lista, el motivo principal cuando la lista queda vacía o casi vacía por un
recurso, y el próximo horario libre:
- `equipo_no_viene` (día sin horario del equipo),
- `salas_llenas`,
- `equipo_ocupado`,
- `equipo_bloqueado`.

El texto lo arma el frontend con los nombres.

**Errores al guardar** (400, con nombres concretos):
- `RECURSO_OCUPADO`
- `RECURSO_FUERA_DE_HORARIO`
- `RECURSO_BLOQUEADO`

**Concurrencia.** Dentro de la transacción, después de bloquear al profesional
(`_bloquear_agenda_del_profesional`), `select_for_update` sobre las filas de
`Recurso` candidatas, ordenadas por id para no cruzar bloqueos.

**Rendimiento.** Para los horarios del día se leen una sola vez las citas,
bloqueos y horarios de todos los recursos candidatos, como ya se hace con el
profesional.

## Citas ya agendadas (D4)

**Cuándo.** Al guardar un procedimiento que pasa a necesitar sala o equipo, al
desactivar una sala o un equipo, o al cambiarle los días.

**Aviso antes de guardar**, con el efecto sobre las citas futuras:
> Las 12 citas agendadas de este procedimiento tienen cabina. ✓

o bien:
> 3 citas agendadas no tienen el Soprano libre. Quedarán marcadas "Falta equipo"
> para que las muevas. **Ver cuáles** · **Guardar igual**

**Al guardar:**
- Se asigna, en orden de fecha, la primera unidad libre a las citas futuras
  activas que ahora la necesitan.
- Las que no caben quedan sin asignar y aparecen en la barra ámbar de la agenda.
- Una cita sin asignar no ocupa ningún recurso. Mientras no se resuelva, otra
  cita puede tomar ese horario; la barra existe para que recepción la arregle.

## Permisos

- Crear y editar salas y equipos, y el atajo "¿Qué procedimientos lo usan?":
  `sedes.gestionar`.
- La sección "Sala y equipo" del procedimiento: el mismo permiso con el que hoy
  se edita el procedimiento.
- Listar recursos (para la agenda y los selectores): cualquiera que pueda
  agendar. Un permiso "ver" no debe romper las listas que otras pantallas usan.
- "No disponible…" en una sala o equipo: `sedes.gestionar` o el mismo permiso
  que los bloqueos de sede.

## API

- `GET/POST/PATCH /clinicas/recursos/` con filtros `sede`, `tipo`, `activo`; los
  horarios anidados; escritura opcional de `procedimientos` para el atajo.
- Procedimiento: `necesita_sala`, `salas`, `equipos` en el serializer.
- `POST /clinicas/recursos/previsualizar/`: el cambio propuesto (en un
  procedimiento, un recurso o sus días) → cuántas citas futuras caben y cuáles
  no (para el aviso de D4).
- Cita: lectura `recursos` (`[{id, nombre, tipo, elegido_a_mano}]`) y `falta`
  (lo que necesita y no tiene). Escritura opcional `sala` y `equipos`, para
  cambiar lo asignado o agregar a mano.
- `GET /agenda/citas/recursos_libres/?sede&fecha_inicio&` + la forma de la cita
  (`servicio_id` | `item_cotizacion_id` [+ `sesion_ejecutada_id`] |
  `duracion_min`) [+ `cita_id`]:
  - Lo que necesita, con las unidades libres que sirven (para **Cambiar**).
  - Las demás salas y equipos libres (para **+ Sala o equipo**).
- `slots_disponibles`: mismos parámetros. Sin cambios, sigue respondiendo la
  lista. Con `detalle=1` responde `{horarios, motivo, proximo}`; `SlotPicker` lo
  pide así en la fase 2.
- `GET /agenda/citas/?recurso=<id>` para la vista por columnas.
- Bloqueos: campo `recurso`.

## Fases

1. **Backend**
   - Modelos y migraciones (`clinicas` y `agenda`).
   - Reglas de "qué necesita cada cita", horarios con motivo, validación,
     asignación automática y a mano, bloqueos, concurrencia, previsualización y
     asignación a citas futuras.
   - Pruebas.
2. **Configuración y agendar**
   - Pantalla de salas y equipos con el estado vacío de dos preguntas y el atajo
     del equipo.
   - Sección "Sala y equipo" en el procedimiento, con el aviso de citas
     agendadas.
   - En el modal de cita y al editar: la línea "Cabina 2 · Soprano · Cambiar" y
     "+ Sala o equipo (opcional)".
   - Motivo y "próximo horario" en `SlotPicker`.
   - Etiqueta en la tarjeta y en el detalle.
   - Barra ámbar de citas con falta.
3. **Agenda por columnas**
   - "Por sala" y "Por equipo".
   - Arrastrar entre salas.
4. **Después** (ver *Fuera de alcance*).

Al terminar la fase 2, probarla en el navegador con alguien que no conozca la
pantalla, sin explicarle nada:
- crear 2 cabinas y un láser de martes y jueves;
- marcar un procedimiento de depilación con cabina y láser;
- agendar 3 citas de depilación y una valoración con consultorio elegido a mano.

Si duda en algún paso, se simplifica antes de seguir.

## Pruebas

Toca `apps/agenda` y `apps/clinicas`, que son núcleo: **suite completa** antes
de llegar a `main`, además de `apps/core/tests/`.

Casos mínimos:
- **Clínica sin recursos:** horarios y creación idénticos a hoy.
- **Procedimiento en "No necesita" en una sede con cabinas llenas:** se agenda
  igual.
- **Equipo para un procedimiento:** dos profesionales a la misma hora → la
  segunda falla con `RECURSO_OCUPADO`; sus horarios ya no ofrecen esa hora.
- **"Cualquier sala" con dos cabinas:** la tercera cita a la misma hora falla.
  Cancelar o "no asistió" libera.
- **"Solo estas salas":** no recibe una sala fuera de la lista.
- **Elegido a mano:**
  - Una consulta libre con Cabina 1 bloquea la Cabina 1 para otra cita que la
    necesite.
  - Elegir una sala ocupada falla.
- **Equipo solo martes y jueves:** el lunes no hay horarios y el motivo es
  `equipo_no_viene` con el próximo martes.
- **"No disponible…":** bloquea; un bloqueo pendiente no.
- **Edición:**
  - Mover la hora conserva la unidad si está libre, reasigna si no y falla si no
    hay ninguna.
  - Lo elegido a mano ocupado da el error con opción de quitarlo.
  - Cambiar a un procedimiento que no necesita sala la suelta.
  - Cambiar solo el profesional no revisa recursos.
- **Sesión de tratamiento con dos procedimientos de equipos distintos:**
  necesita los dos.
- **Dos equipos marcados en el mismo procedimiento:** sirve cualquiera.
- **Procedimiento con salas o equipos de otra sede:** en esta sede se aplican las
  reglas de *Qué necesita cada cita*.
- **Previsualización y activación:** las citas futuras se asignan en orden y las
  que no caben quedan con falta.
- **Cita en curso que empezó tarde:** ocupa desde la hora real.
- **Citas de migración:** no ocupan.

## Fuera de alcance (por ahora)

- **Equipos que trabajan solos** (criolipólisis): el aplicador ocupado 1–2 h y
  la operadora 15 min. Pide una ocupación del recurso distinta a la de la cita.
- **Contador de disparos** del cartucho de HIFU o de las membranas: va más con
  inventario.
- **Equipo que rota entre sedes** según el día (D2). Pide recurso de la clínica
  con horario por sede.
- **Necesitar dos salas a la vez** para una sola cita.
- **Cita sin profesional** o "cualquier profesional disponible".
- **Reserva online**: no existe aún. Cuando exista, debe usar el mismo cálculo.

## Implementación

### Fase 1: backend (5/11/2026, rama local `feature/salas-y-equipos`)

**Modelos y migraciones** (`clinicas 0054_salas_y_equipos`, `agenda 0018_salas_y_equipos`)
- `Recurso`: sala o equipo de una sede.
- `HorarioRecurso`: horario propio por día.
- `Servicio`:
  - `necesita_sala` (con `db_default="no"`, para que el código anterior siga creando procedimientos).
  - `salas` y `equipos`.
- `CitaRecurso`: sala o equipo asignado a la cita, con `elegido_a_mano`.
- `BloqueoAgenda.recurso`.

**Reglas** (`apps/agenda/recursos.py`)
- Qué procedimientos hace la cita y qué salas y equipos necesitan en su sede.
- La ocupación de una ventana se lee una vez:
  - citas que ocupan,
  - bloqueos aprobados,
  - horario propio.
- Asignación: una unidad libre por exigencia, primero lo que ya tenía la cita.
- Mensajes y códigos:
  - `RECURSO_OCUPADO`
  - `RECURSO_FUERA_DE_HORARIO`
  - `RECURSO_BLOQUEADO`
  - `RECURSO_SIN_SALA_COMPATIBLE`
  - `RECURSO_INVALIDO`
- Campos del error:
  - `recurso_tipo`, `recurso_causa` y `recurso_recursos` siempre.
  - `recurso_a_mano` solo cuando lo elegido a mano es lo que falla.
- `reasignar_citas_futuras(sedes)`: reacomoda lo agendado.
  - Se llama al crear, editar o eliminar una sala o un equipo.
  - Y al cambiar la sala o el equipo de un procedimiento.
  - Y con cada bloqueo de recurso (crear, editar, aprobar, rechazar, borrar).
  - Prioridad: quien agendó primero.

**Integración**
- `crear_cita` y la edición de citas resuelven y guardan la sala y el equipo:
  - con bloqueo de filas;
  - al editar, solo si cambia la hora, la duración, la sede, el procedimiento o
    lo elegido.
- `bloqueos_aplicables` ignora los bloqueos de recurso (no cierran la sede).
- El listado de bloqueos los excluye salvo `?recurso=` o `?incluir_recursos=1`.
- `slots_disponibles`:
  - filtra por sala y equipo;
  - con `detalle=1` responde `{horarios, motivo, proximo}` (próximo dentro de 21
    días).
- `GET /agenda/citas/recursos_libres/` y `GET /agenda/citas/?recurso=`.
- Cita (lectura): `recursos` y `falta`.
- Cita (escritura): `sala` y `equipos`.
- `GET/POST/PATCH/DELETE /clinicas/recursos/`:
  - horarios anidados;
  - `procedimientos` como atajo del equipo;
  - no se elimina con citas;
  - `POST /clinicas/recursos/{id}/no_disponible/` y
    `POST /clinicas/recursos/previsualizar/` (aplica el cambio, reacomoda y
    revierte).
- Procedimiento: `necesita_sala`, `salas`, `equipos`, `salas_detalle`,
  `equipos_detalle`. "Solo algunas" exige al menos una sala.

**Pruebas:** `apps/agenda/tests_salas_y_equipos.py`.

### Fase 2: front (5/11/2026, misma rama)

**Configuración**
- **Sedes → Salas y equipos** (`components/configuracion/SalasYEquipos.tsx`):
  - estado vacío con las dos preguntas (cuántas cabinas, agregar equipo);
  - frase de resumen;
  - filas con Editar, No disponible…, Desactivar y Eliminar;
  - panel de sala o equipo con días ("Todos" o "Solo algunos" + horario
    distinto) y "¿Qué procedimientos lo usan?" (buscador y "Marcar los que
    contienen…");
  - antes de guardar se previsualiza; si algo queda sin lugar, avisa y pide
    "Guardar igual".
- **Procedimiento → "Sala y equipo"** (`SalaYEquipoProcedimiento.tsx`, en
  `ProcedimientoDialog`):
  - solo aparece si hay salas o equipos; si no, un enlace a Sedes;
  - al editar, el aviso de citas agendadas se actualiza solo.

**Agendar**
- **Nueva cita y editar** (`RecursosDeLaCita.tsx`): debajo del horario,
  `Cabina 2 · Soprano` con **Cambiar**, y "+ Sala o equipo (opcional)". Solo se
  envían `sala` y `equipos` si la persona tocó algo.
- **`SlotPicker`**:
  - pide `detalle=1`;
  - sin horarios por sala o equipo, lo explica ("Soprano no está disponible
    este día.");
  - ofrece "Primer horario libre: … →", que cambia la fecha y elige ese
    horario.

**Agenda**
- **Tarjetas, lista y detalle**: muestran la sala y el equipo, o "Falta sala" /
  "Falta equipo".
- **Aviso ámbar** "N citas sin sala esta semana · Revisar"
  (`AvisoCitasSinSala.tsx`): la lista abre cada cita.

**Probado en el navegador** con un backend y un front aparte del worktree
(puertos 8013 y 3013, base `cliniq_salas`, copia de `cliniq_funnel`):
1. crear 2 cabinas y el Soprano (martes y jueves) para LÁSER IPL;
2. marcar el procedimiento con "Cualquier sala libre";
3. agendar un lunes: aparece el motivo y el próximo martes;
4. Cambiar a Cabina 2 y agendar;
5. marcar el Soprano no disponible: la cita muestra "Falta equipo" y aparece el
   aviso.

**Pendiente:** la fase 3 (columnas por sala o equipo y arrastrar entre salas).
El panel de bloqueos de la agenda no ofrece bloquear una sala; se hace con "No
disponible…" desde Sedes.

### Fase 3: agenda por columnas (5/11/2026, misma rama)

- **Selector "Columnas por":** en la vista Día → Columnas, encima de la grilla,
  "Profesional · Sala · Equipo". Solo aparecen los tipos que la sede filtrada
  tiene. Se recuerda en la preferencia de la agenda (`columnasPor`).
- **Por sala o por equipo:**
  - una columna por unidad, con el número de citas;
  - con varias sedes, el nombre de la sede;
  - columna ámbar "Falta sala/equipo" cuando hay citas sin asignar;
  - las citas que no usan sala no aparecen ahí, pero siguen en la vista por
    profesional.
- **Arrastrar una cita a otra columna:** cambia la sala (`sala`) o el equipo de
  esa columna (`equipos`, conservando los demás), a la misma hora.
  - Si no se puede, sale el mensaje del backend en un aviso.
  - Solo se arrastran citas pendientes, confirmadas o en espera.
- **Sin cambios:** Semana y Mes (matriz por profesional) siguen igual.

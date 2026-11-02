# Atención sencilla (vista de tabla)

Plan del 2026-10-27. No implementado.

## Por qué

Una clínica cliente (Dra. Máróly González Beauty Clinic) hoy registra cada
paquete en una hoja impresa: una fila por sesión con los procedimientos, fecha,
hora, firma del profesional y firma del paciente. Su personal no maneja con
soltura la atención completa con pestañas. Quieren que en la atención solo se
diga **qué se hizo y dónde**, en algo que se parezca a esa hoja.

Es la primera pieza del "modo simple" de
[plan-seguimiento-retencion.md](plan-seguimiento-retencion.md) (allí era una
tarjeta "Registrar sesión"); la tabla queda más cerca de lo que el personal ya
conoce.

## Principio: solo cambia la vista

La hoja coincide con lo que CliniQ ya guarda:

| Hoja de papel | CliniQ |
|---|---|
| "Rejuvenecimiento básico" | `TratamientoPaciente` (copia de lo vendido) |
| Cada fila | `SesionProcedimiento`, ordenadas como en `contexto_sesion_para_cita` (tipo de sesión, número) |
| Procedimientos de la fila | procedimientos del `TipoSesion`; los hechos quedan en `procedimientos_ejecutados` |
| Fecha y hora | `Cita.fecha_inicio_real` (o `fecha_inicio`) |
| Firma profesional | `User.firma_digital` de quien atendió; si no tiene, su nombre |
| Firma paciente | firma de asistencia de la cita (Documenso) |
| "Dónde" | pestaña Zonas: `NotaDiagramaZona` + `AnotacionZona` de la nota |

La vista sencilla escribe exactamente lo mismo que la atención completa:
borrador de `NotaClinica` al entrar, marcas de zonas en esa nota y cierre con
`POST /citas/{id}/completar_atencion/` (ya recibe `nota` y
`procedimientos_ejecutados`). Por eso cambiar de vista, de rol o de usuario
nunca pierde ni oculta datos: lo hecho en una vista aparece en la otra.

No cambian: preparar al paciente, consentimientos, firma del profesional en
consentimientos y bloqueo por mora. Los exige el backend al pasar la cita a
`en_curso`, así que ninguna vista se los salta.

## Quién ve qué vista (decisión 1)

Tres niveles; cada uno, si tiene valor, manda sobre el anterior:

1. **Clínica**: `ConfiguracionHistoria.vista_atencion` (`completa` | `sencilla`,
   default `completa`).
2. **Rol**: `Rol.vista_atencion` (null = hereda de la clínica).
3. **Usuario**: `User.vista_atencion` (null = hereda del rol).

Ejemplo: clínica en sencilla, rol "Médico" en completa, y una cosmetóloga
puntual en completa aunque su rol diga sencilla.

- Lo resuelve el backend en una sola función (`vista_atencion_de(user)`):
  usuario → `rol_dinamico` → clínica (`apps/users/vista_atencion.py`). Se
  expone como `vista_atencion_efectiva` (`{vista, origen}`, origen
  `"usuario" | "rol" | "clinica"`) en `/auth/me/` y en el listado de
  usuarios, para que la pantalla de ajustes diga "Sencilla, por su rol
  Cosmetóloga". El valor propio se lee y escribe como `vista_atencion` en
  usuarios, roles y `/configuracion/historia/`.
- Decide quien abre la atención (el usuario conectado), no el profesional
  asignado a la cita.
- Dónde se configura: Configuración → Pantalla del profesional (clínica),
  editor de roles y formulario de usuario, con tres opciones: "La de la
  clínica / del rol", "Sencilla", "Completa". Mismo patrón de
  `SeccionAjustes`/`FilaAjuste`.
- Escape: la vista sencilla siempre tiene "Abrir atención completa"
  (`/atenciones/{id}?vista=completa`) y la completa tiene "Ver como tabla".
  Es solo otra pantalla sobre la misma nota; los permisos no cambian.

Default `completa` en los tres niveles (null en rol y usuario): ninguna clínica
actual ve un cambio.

## La pantalla

Misma ruta `/atenciones/[citaId]`; si la vista efectiva es sencilla, se monta
otro componente. El gate de "aún no en curso" (Iniciar atención, Preparar
paciente) es el mismo de hoy.

**Regla de diseño (requisito del usuario): una sola pantalla, todo a la
vista.** Sin pestañas, sin paneles que se abren, sin popovers, sin secciones
plegadas y sin scroll. Lo único que abre algo es "Agregar foto" (cámara o
selector de archivos del sistema) y el enlace de escape "Abrir atención
completa".

Distribución en dos columnas que ocupan el alto de la ventana:

- **Encabezado** (una línea): paciente, tratamiento, "Sesión 4 de 6",
  profesional y el enlace "Abrir atención completa".
- **Izquierda, la hoja del paquete**: la tabla con todas las sesiones, una
  línea por fila.
  - Hechas: procedimientos realizados, fecha, hora, firma del profesional,
    firma del paciente y las zonas escritas debajo en texto pequeño
    ("Cara, cuello"). No se abren: lo que dicen es todo lo que hay que ver.
  - Hoy: resaltada, con la fecha y la hora actuales; lo que se llena a la
    derecha se refleja en ella.
  - Pendientes: procedimientos planeados, el resto vacío.
  - Obsequios con la etiqueta "Obsequio", en su lugar del paquete (después
    de las sesiones de su mismo tipo), para que el número de fila coincida
    con "Sesión X de Y".
- **Derecha, la sesión de hoy**, de arriba abajo:
  - *Qué se hizo*: casillas con los procedimientos del tipo de sesión, todas
    marcadas.
  - *Dónde*: los diagramas de la nota dibujados ahí mismo, uno al lado del
    otro. Tocar el diagrama pone una marca y tocar una marca la quita. Encima,
    "Usar las de la sesión anterior" como botón visible. Sin el popover de
    tipo de aplicación y parámetros de la vista completa: la marca se guarda
    con `parametros` vacío (ya es el default), y quien necesite parámetros
    usa la vista completa.
  - *Nota* (una línea, opcional) y *fotos* como tira de miniaturas con el
    botón "Agregar foto".
  - Botón **Terminar sesión**.
- Cita sin paquete (consulta o procedimiento suelto): la hoja tiene una sola
  fila, la de hoy, con el procedimiento de la cita.

Cómo cabe todo sin scroll (pantalla objetivo: 1366×768 y tablet horizontal;
el celular vertical queda fuera y ahí sí habrá scroll):

- El alto de las filas de la hoja se reparte entre las sesiones del paquete;
  con paquetes largos (más de 8 sesiones) las filas hechas se compactan a una
  línea con el nombre del procedimiento ajustado a dos líneas como máximo,
  nunca cortado con "…".
- Los diagramas se escalan para que todos quepan en el espacio de "Dónde": uno
  o dos a buen tamaño; con tres o más, en cuadrícula más pequeña. Se agrega o
  quita un diagrama con los mismos botones visibles de `TabZonas`.
- La tira de fotos muestra las de hoy; si son muchas, las miniaturas se
  achican en vez de desbordar.
- Para marcar, el componente de diagramas de `TabZonas` se reutiliza en un
  modo compacto (sin popover, tamaño dado por el contenedor); la lógica de
  marcas y la API son las mismas.

Reglas al terminar:

- Sesión de paquete: al menos un procedimiento marcado (hoy el backend ya
  completa con todos si llega vacío; la vista no lo permite para que el
  desmarcado sea consciente).
- Cita suelta: se puede terminar con el procedimiento de la cita como
  registro, aunque no haya zonas ni nota. **Verificar** que la historia no
  muestre esa nota como vacía o rota (la nota no tiene texto; el registro
  está en la cita y en las zonas).
- No hay insumos en esta vista (la clínica no los usa). Si una clínica con
  inventario por atención elige sencilla, sus consumos se registran desde la
  vista completa.

### Datos

Un endpoint nuevo de solo lectura, `GET /agenda/citas/{id}/tarjeta/`
(`apps/agenda/tarjeta.py`), que devuelve las filas ya armadas: sesión,
procedimientos planeados y hechos, fecha, hora, profesional con URL de su
firma, estado de la firma de asistencia y nombres de los diagramas con marcas
en la nota de esa cita. Así la pantalla hace una sola consulta y la regla de
orden vive en el backend, igual que `contexto_sesion_para_cita`. Mismos
permisos que ver la cita.

- Tres casos: tratamiento (una fila por `SesionProcedimiento`), paquete de un
  procedimiento (ítem de cotización sin sesiones de tratamiento: sus citas y
  filas vacías hasta `num_sesiones_efectivas()`, como el PDF consolidado) y
  cita suelta (una fila).
- La miniatura de la firma del paciente no va en esta fase: sale de recortar
  el PDF firmado, que es caro por fila. La pantalla muestra el estado; si se
  quiere la imagen, se agrega después con caché.
- El rol `admin` no se puede editar, así que no tiene vista propia: si un
  administrador quiere otra vista que la de la clínica, se le pone en su
  usuario.

## Sin firma de asistencia (decisión 5)

`ConfiguracionWizard.paso_firma_asistencia` apagado significa que ninguna cita
nueva pide la firma del paciente. Confirmado por el usuario el 2026-10-27:

- **En pantalla**: la columna "Firma paciente" se oculta si el paso está
  apagado y ninguna fila del paquete tiene firma. Si hay filas firmadas de
  antes (la clínica lo apagó a mitad del paquete), la columna se muestra y las
  filas sin firma dicen "No se pidió", nunca "Pendiente".
- **En papel**: el PDF "consolidado de asistencia" (que ya existe por
  cotización) pasa a tener las mismas columnas que la tabla y, en las filas
  sin firma digital, deja el **recuadro en blanco** para firmar a mano en vez
  del rótulo "Sin firma". Así la clínica que no usa Documenso imprime la hoja
  y sigue firmando como hoy.
- **No** se agrega una firma dibujada en pantalla sin Documenso en esta fase:
  sería otra forma de firma con otro valor probatorio, y hoy la clínica tiene
  dos caminos que funcionan (Documenso o papel). Queda como opción si la
  piden.

Con el paso encendido nada cambia: recepción la toma en "Preparar paciente" y
el backend no deja iniciar sin ella, así que en la fila de hoy ya aparece
firmada.

## Elección en "Preparar mi clínica" (onboarding)

La clínica elige cómo trabaja su equipo durante el recorrido de
`/preparar-clinica`, viendo cómo se ven **de verdad** las dos opciones.

### El paso

- Paso nuevo `atencion`, "Cómo registra tu equipo la atención", justo después
  de "Cómo recibes al paciente" (en `construir_preparacion`,
  `apps/clinicas/preparacion.py`). No es obligatorio (`requerido=False`), igual
  que recepción, para no mover el nivel ni el "Todo listo".
- Abierto, muestra dos tarjetas lado a lado, sin nada escondido:
  - **Completa**: "Historia clínica con pestañas: motivo, antecedentes,
    exámenes, órdenes, fotos, zonas con parámetros."
  - **Sencilla**: "La hoja del paquete en una sola pantalla: qué se hizo,
    dónde y listo."
  - Cada tarjeta lleva un video corto en bucle de la pantalla real, tres
    líneas de qué hace el profesional y el botón "Trabajar así".
- Debajo, una línea: "Puedes cambiarlo cuando quieras en Configuración →
  Pantalla del profesional, y elegir distinto por rol o por persona."
- Al elegir: `POST /clinicas/preparacion` con `vista_atencion`, que guarda
  `ConfiguracionHistoria.vista_atencion` (el nivel clínica) y marca
  `Clinica.preparacion["vista_atencion_elegida"] = True`. El paso se da por
  completado con esa marca, porque el valor por defecto ("completa") no dice si
  alguien eligió. Cerrado, el paso dice "Tu equipo trabaja con la vista
  sencilla" y "Cambiar", como hoy "Vendes: … · Cambiar".
- No se preselecciona ninguna opción ni se deduce de "¿Qué vendes?": vender
  paquetes no significa que el personal quiera la vista sencilla.
- Clínicas existentes: una migración de datos les pone la marca, así que el
  paso les aparece ya hecho ("completa") y su recorrido no retrocede.
- Las mismas dos tarjetas (componente `ElegirVistaAtencion`) se usan en
  Configuración → Pantalla del profesional para el nivel clínica, y los videos
  en el artículo de ayuda de la vista sencilla.

### Imágenes y videos reales

Sin bocetos ni maquetas: se graban de la app de verdad, después de terminar la
vista sencilla (fase 3). Hasta que existan los videos, el paso no se publica.

- Se graban con Playwright contra la app local (spec nuevo en
  `e2e/capturas/vista-atencion.spec.ts`, como `landing.spec.ts`), con una
  clínica y pacientes inventados. Nunca con datos de una copia de producción.
- Guion de cada video (8–10 s, sin cortes, encuadrando la pantalla completa
  de la atención como pide la guía de capturas de los promocionales):
  - Completa: abrir la atención, escribir el motivo, pasar por las pestañas,
    marcar una zona con su popover, terminar.
  - Sencilla: abrir, la hoja del paquete con la fila de hoy, desmarcar y
    marcar un procedimiento, tocar dos zonas, terminar.
- Archivos en `frontend/public/onboarding/vista-atencion/`:
  `completa.webm`, `completa.mp4`, `completa.png` y lo mismo para `sencilla`.
  La imagen es el primer cuadro (póster). Unos 960 px de ancho y menos de
  1,5 MB por video.
- En la página: `<video muted loop playsInline autoPlay poster=…>`, que solo
  carga cuando la tarjeta está en pantalla. Con "reducir movimiento" activado
  en el sistema se muestra la imagen con un botón de reproducir.
- Si la vista cambia de aspecto más adelante, se vuelve a correr el spec; el
  guion está en el código, así que los videos no quedan desactualizados por
  descuido.

## Fases

1. **Backend**: campos `vista_atencion` (configuración, rol, usuario) con sus
   migraciones aditivas, `vista_atencion_de`, exposición en `/me` y en los
   serializers de rol y usuario, endpoint `tarjeta`, pruebas del resolvedor y
   del endpoint.
2. **Ajustes**: selector en Pantalla del profesional, editor de roles y
   formulario de usuario. Hecho así: la entrada de Configuración se llama
   "Pantalla del profesional" (antes "Pestañas de la atención") y abre con la
   sección "Vista al atender"; el rol tiene la lista en su diálogo y una
   etiqueta en el listado cuando fija una vista; en la ficha del usuario el
   campo aparece solo si atiende pacientes y solo al editar (al crear, hereda
   de su rol). Las listas de rol y usuario dicen qué resulta al heredar:
   "La de la clínica (sencilla)", "La de su rol (completa)".
3. **Vista sencilla**: pantalla de dos columnas sin scroll, modo compacto del
   diagrama de zonas, tira de fotos, terminar sesión, enlaces entre vistas.
   Probar en 1366×768 y tablet horizontal con un paquete de 11 sesiones y
   tres diagramas. Hecho así (`components/atenciones/sencilla/`):
   - La página de atención consulta `/auth/me/` al entrar y, con vista
     sencilla, monta `AtencionSencilla` después de la misma compuerta de
     "Iniciar atención". "Abrir atención completa" y "Vista sencilla" cambian
     de vista en la misma página (sin recargar ni tocar la nota).
   - `AppShell` crece con su contenido, así que la pantalla se da a sí misma
     el alto que queda en la ventana; las filas de la hoja se lo reparten.
   - Zonas: componente propio (`ZonasSencillas`) con la misma API y caché que
     la pestaña Zonas; reutiliza el selector "Agregar zona". Una marca con
     tipo, parámetros o texto (puestos en la vista completa) no se borra con
     un toque en la sencilla.
   - Fotos: botones "Foto antes" y "Foto después" (abren la cámara o el
     selector del equipo) y la tira de miniaturas de la nota.
   - Terminar: guarda la nota pendiente y llama a `completar_atencion` con los
     procedimientos marcados; pide al menos uno en una sesión de paquete.
   - Ajustes del 28/10/2026, tras revisarla el usuario:
     - Paquetes largos (hasta 50 sesiones): las filas miden entre 44 y 80 px,
       la página nunca crece y solo se desplaza la lista de la hoja, que abre
       con la sesión de hoy como tercera fila visible (o lo más abajo que se
       pueda, si es de las últimas).
     - La card de hoy pone en línea lo corto (título con "Qué se hizo"; nota con
       "Terminar sesión") para dejar el alto a los diagramas.
     - Zonas: sin botón "Agregar zona"; un badge por diagrama de la clínica con
       su nombre, agrupados como en Configuración. Tocar uno lo agrega; tocar
       uno sin marcas lo quita. "Como el 27 oct" repite los de la sesión
       anterior.
     - Fotos: dos recuadros, "Foto antes" y "Foto después", con miniaturas que
       se abren en grande y una × para quitarlas (con confirmación).
   - Rediseño de la card de hoy (28/10/2026, pedido del usuario): se relaja el
     "sin scroll" para que nada quede perdido. La card es un acordeón de tres
     pasos numerados, uno abierto a la vez; los cerrados muestran su resumen y
     un ✓ cuando tienen algo, y el abierto se desplaza si no le alcanza el
     alto. "Terminar sesión" queda siempre visible abajo.
     1. ¿Qué hiciste hoy?: procedimientos marcados y un campo de texto de al
        menos 4 filas (la nota, `motivo_consulta`).
     2. ¿Dónde lo hiciste?: badges de zonas y vistas previas de las de esta
        atención. Tocar un badge o una vista previa abre el dibujo grande en un
        modal, donde se ponen y quitan las marcas (ya no se marca en la card).
     3. Fotos: antes y después.
     - "Terminar sesión" pide confirmación con el resumen de lo que queda
       registrado (qué se hizo, nota, dónde y fotos) y avisa que después ya no
       se cambia; el botón del encabezado se llama "Vista completa" (antes
       "Atención completa", que se podía confundir con terminar la atención).
     - Permiso (decisión del usuario): solo se quitan fotos de la atención en
       curso, y basta con poder subir fotos. Las de atenciones pasadas no se
       tocan con ningún permiso, ni siquiera `historia.fotos.eliminar`
       (`FotoClinicaAccessPermission`). Las fotos de la mini-atención de una
       cotización conservan su regla anterior.
4. **PDF**: consolidado con las columnas de la tabla y recuadros para firmar a
   mano. Hecho así: el PDF de la cotización ("consolidado de asistencia") arma
   cada ítem con la misma hoja que la vista sencilla (`filas_de_item` en
   `apps/agenda/tarjeta.py`): todas las sesiones del paquete, hechas o no, con
   procedimientos, zonas, fecha, hora, firma del profesional (la de su perfil)
   y firma del paciente (el recorte de Documenso). Donde no hay firma digital,
   o en lo que falta por hacer, queda la línea para escribir a mano. Cambia
   para todas las clínicas, no solo las de vista sencilla: antes listaba solo
   las citas existentes.
5. **Onboarding**: grabar los videos con el spec, paso `atencion` en
   Preparar mi clínica (backend: paso, guardado de `vista_atencion` y
   migración de datos de la marca; front: `ElegirVistaAtencion`), reusar las
   tarjetas en Pantalla del profesional.

## Pruebas

- Toca `apps/users` (campo en `Rol` y `User`): es núcleo, así que antes de
  `main` va la suite completa. Durante el desarrollo: `configuracion`,
  `users`, `agenda`, `protocolos` e `historia_clinica`.
- Resolvedor: los 3 niveles, null en cada nivel, usuario sin `rol_dinamico`.
- Endpoint `tarjeta`: orden igual a `contexto_sesion_para_cita`, sesiones de
  obsequio, cita suelta, firma con el paso apagado y encendido, otra clínica
  (404).
- Ida y vuelta: atender en sencilla y abrir en completa (y al revés) muestra
  la misma nota, zonas y procedimientos.
- Preparación (`clinicas/tests_preparacion.py`): el paso aparece pendiente en
  una clínica nueva, se completa al elegir, guarda el nivel clínica y queda
  hecho en las existentes tras la migración; no cambia `nivel` ni
  `todo_listo`.
- Front: `tsc --noEmit` y prueba en navegador con la base local, incluida la
  carga de los videos y la variante con "reducir movimiento".

## Pendiente de confirmar

- Que la historia muestre bien una nota sin texto que solo tiene zonas o solo
  el procedimiento de la cita.

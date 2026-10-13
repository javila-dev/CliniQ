# M1 — Configuración de la clínica y catálogo

**Estado:** Revisado (10/10/2026) · **Sigue:** M2 · **Viene de:** M0

**Alcance:**
- *Pantallas:* `configuracion/*` (clínica, sedes, formas de pago, recordatorios, recepción, biometría, consentimientos, plantillas de órdenes, promociones, plan, seguimiento), catálogo (procedimientos y tratamientos, con precios por sede), Preparar mi clínica y Puesta en marcha.
- *Frontend:* `lib/api/clinicas.ts`, `configuracion.ts`, `formasPago.ts` y `campanas.ts`.
- *Backend:* `apps/clinicas` y `apps/configuracion`.

**Antes de corregir:**
- M1-06 y M1-07 se arreglan junto con M0-04 y M0-09 (los mismos guards y permisos).
- M1-24 es T-01.
- Los errores 405 que detectó el script de rutas (reordenar pasos o consentimientos y borrar tipos) **no afectan hoy a nadie**: solo los usa código muerto (M1-31).

## Hallazgos

**✅ M1-01 · Alto · API inexistente** · confirmado
- **Dónde:** `frontend/src/lib/api/clinicas.ts:445,449`; `configuracion/clinica/ClinicaConfig.tsx:223-249,516-520`.
- **Qué ve el usuario:** en "Agenda y pacientes", los recordatorios aparecen siempre como "activados · 1 día" aunque no sea el valor real. Guardar está habilitado sin haber tocado nada y al pulsarlo sale "Error al guardar". **Nunca se pueden apagar los recordatorios.**
- **Causa:** la URL tiene un error: falta un `/clinicas/` (la ruta real es `/clinicas/clinicas/{id}/recordatorio_config/`). Ante el 404, la pantalla muestra los valores por defecto.
- **Arreglo:** corregir la URL y mostrar el error si falla la carga.

**✅ M1-02 · Alto · parámetros** · confirmado
- **Dónde:** `ClinicaConfig.tsx:281-292,703,711`; `backend/apps/clinicas/serializers.py:187-218`.
- **Qué ve el usuario:** enciende "Datos personales" y "Salud y afiliación" como obligatorios en el autorregistro, pero **al recargar vuelven a estar apagados**. El formulario público nunca los exige.
- **Causa:** el PATCH va a `/clinicas/mi-clinica/`, que ignora esos campos y responde 200. El endpoint real es `/configuracion/registro-publico/`.
- **Arreglo:** leer y guardar en `/configuracion/registro-publico/`.

**✅ M1-03 · Alto · faltante** · confirmado
- **Dónde:** `components/shared/TrialBanner.tsx:17-19`; `configuracion/plan/page.tsx:77`; `serializers.py:198-217`.
- **Qué ve el usuario:** una clínica en prueba **nunca ve "quedan X días"**. El día que vence, todo empieza a fallar sin aviso previo.
- **Causa:** `MiClinicaSerializer` no devuelve `trial_days_remaining` (ni `plan_nombre`).
- **Arreglo:** agregar esos campos al serializer.

**✅ M1-04 · Alto · previsible** · confirmado
- **Dónde:** `components/configuracion/PreciosPorSedeEditor.tsx:18-21`; `serializers.py:350`; `ProcedimientoDialog.tsx:306-315`.
- **Qué ve el usuario:** si se desactiva una sede que tenía precio propio, **ya no se puede guardar ese procedimiento o tratamiento**. Aparece "precios_sede: [object Object]".
- **Causa:** el formulario reenvía el precio de la sede inactiva y el backend solo acepta sedes activas.
- **Arreglo:** filtrar el payload (o ignorar esas sedes en el backend) y mostrar bien los errores anidados.

**✅ M1-05 · Alto · previsible** · confirmado (bloqueo en recepción: probable)
- **Dónde:** `backend/apps/configuracion/views.py:116-122`; `configuracion/consentimientos/page.tsx:94`; `apps/agenda/serializers.py:86,130`; `ProcedimientoDialog.tsx:262-275`.
- **Qué ve el usuario:** borra una plantilla de consentimiento, pero los procedimientos **la siguen exigiendo** al agendar y atender. Al editar el procedimiento sale "template_id: No existe un template activo…", y lo demás queda guardado a medias.
- **Causa:** borrar solo desactiva la plantilla; las relaciones `ServicioConsentimiento` siguen activas.
- **Arreglo:** desactivar también las relaciones, o filtrar por `template__activo=True`.

**✅ M1-06 · Alto · roles personalizados** · confirmado (igual que M0-09)
- **Dónde:** `AppShell.tsx:71`; `configuracion/layout.tsx:9`; `lib/permissions.ts:251-256`.
- **Qué ve el usuario:** con solo "Gestionar promociones", "Consentimientos", "Formas de pago", "Sedes" o "Cajas", al entrar **vuelve al Dashboard sin explicación**.

**✅ M1-07 · Alto · roles personalizados** · confirmado (igual que M0-04)
- **Dónde:** `backend/apps/configuracion/views.py:257,292,327`; `ClinicaConfig.tsx:257-260,631`.
- **Qué ve el usuario:** con un rol personalizado que tiene "Editar datos de la clínica", los interruptores de Recepción no hacen nada, sin mensaje. Biometría y Otros documentos responden "No se pudo actualizar".
- **Causa:** se usa `IsAdmin` y falta `onError`.
- **Arreglo:** `RequirePermission("clinicas.editar")` y mostrar el error.

**✅ M1-08 · Alto · roles personalizados** · confirmado
- **Dónde:** `backend/apps/historia_clinica/views.py:78-82,949-951`; `PlantillaOrdenSheet.tsx:50-58`; `plantillas-ordenes/page.tsx:26-29`.
- **Qué ve el usuario:** con un rol personalizado, Guardar y Desactivar una plantilla de orden **no hacen nada**.
- **Causa:** solo lo permite al admin o a un rol con slug `coordinador`, y no hay `onError`.
- **Arreglo:** usar una clave de permiso del catálogo.

**✅ M1-09 · Medio · errores** · confirmado
- **Dónde:** `serializers.py:336-344`; `views.py:627-642`; `configuracion/sedes/page.tsx:240-242`.
- **Qué ve el usuario:** crear o renombrar una sede con un nombre repetido muestra "Error al guardar. Intenta de nuevo", y reintentar nunca funciona.
- **Causa:** la validación se salta cuando no viene `clinica` en el payload, así que el `IntegrityError` termina en 500.
- **Arreglo:** validar el nombre contra la clínica activa y mostrar el error en el campo.

**M1-10 · Medio · permisos** · confirmado
- **Dónde:** `configuracion/sedes/page.tsx:298-305,343-346,397-405`; `views.py:120-121`.
- **Qué ve el usuario:** con solo "ver sedes" aparecen Nueva, Editar y Desactivar, y todos fallan. Un rol personalizado no ve el cupo del plan.
- **Arreglo:** mostrar las acciones solo con `sedes.gestionar` y abrir `plan_usage` a `clinicas.ver`.

**M1-11 · Medio · previsible** · confirmado
- **Dónde:** `configuracion/campanas/page.tsx:829-832` vs `configuracion/sedes/page.tsx:338-341`.
- **Qué ve el usuario:** después de entrar a Promociones, en Sedes desaparecen las sedes inactivas y no se pueden reactivar.
- **Causa:** las dos pantallas usan la misma clave de caché `['sedes']` para consultas distintas.
- **Arreglo:** usar claves distintas.

**M1-12 · Medio · faltante** · confirmado
- **Dónde:** `ProcedimientoDialog.tsx:244-256,527-537`.
- **Qué ve el usuario:** desmarca "Activo" y guarda, pero el procedimiento **sigue activo**.
- **Causa:** el payload no incluye `activo`.

**M1-13 · Medio · errores** · confirmado
- **Dónde:** `ClinicaConfig.tsx:100,385`; `clinicas/models.py:156`.
- **Qué ve el usuario:** si el NIT está vacío o repetido, solo sale "Error al guardar".
- **Arreglo:** marcar el NIT como obligatorio y mostrar el error en el campo.

**M1-14 · Medio · parámetros** · confirmado
- **Dónde:** `ClinicaConfig.tsx:203,346,351` vs `clinicas/views.py:241`.
- **Qué ve el usuario:** la pantalla dice que acepta "PNG, JPG o WebP", pero un logo WebP falla.
- **Arreglo:** aceptar WebP en el backend o quitarlo del texto.

**M1-15 · Medio · parámetros** · confirmado
- **Dónde:** `lib/api/historiaClinica.ts:250-252`; `historia_clinica/views.py:957-962`.
- **Qué ve el usuario:** "Mostrar inactivas" en Plantillas de órdenes no muestra nada, así que una plantilla desactivada no se puede recuperar.
- **Causa:** `listAll` no envía `activa`.

**M1-16 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `configuracion/campanas/page.tsx:167-179,205`.
- **Qué ve el usuario:** al crear una promoción con un ítem inválido sale "Error al crear". Si vuelve a guardar, **se duplica**. No le dice el motivo (por ejemplo, fechas invertidas).
- **Causa:** se crea la campaña y luego cada ítem por separado.
- **Arreglo:** hacerlo en una sola petición, o pasar a edición después del primer éxito, y mostrar `response.data`.

**M1-17 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `configuracion/consentimientos/nuevo/page.tsx:13-18,49-55`.
- **Qué ve el usuario:** "Request failed with status code 400", y al reintentar se crea una plantilla duplicada.
- **Arreglo:** después de subir el PDF, navegar a `/[id]/campos` y traducir el error.

**M1-18 · Medio · permisos** · confirmado
- **Dónde:** `configuracion/consentimientos/page.tsx:83-97,104-112`.
- **Qué ve el usuario:** con solo "ver plantillas" aparecen Nueva, Mapear y Eliminar. Eliminar no hace nada.
- **Arreglo:** mostrar esas acciones solo con `consentimientos.plantillas.gestionar` y agregar `onError`.

**✅ M1-19 · Medio · roles personalizados** · confirmado
- **Dónde:** `permissions_catalog.py:520-523,616-620,640-644`; `navegacion.ts:199-204`; `catalogo/page.tsx:26`.
- **Qué ve el usuario:**
  - con "Crear y editar procedimientos": "No tienes permiso para ver el catálogo";
  - con "Gestionar formas de pago": nunca ve esa pantalla;
  - con "Editar clínica" sin "Ver": el formulario aparece vacío.
- **Causa:** las capacidades de "gestionar" no incluyen su permiso de "ver".
- **Arreglo:** que cada capacidad de gestionar incluya el permiso de ver.

**M1-20 · Medio · previsible** · confirmado
- **Dónde:** `backend/apps/clinicas/preparacion.py:40-50,116-118,147`.
- **Qué ve el usuario:** "Preparar mi clínica" dice "N procedimientos sin profesional" aunque estén cubiertos por un grupo de atención. Nunca llega a "Lista para agendar".
- **Arreglo:** reutilizar `procedimientos_sin_profesional`.

**✅ M1-21 · Medio · permisos** · confirmado (igual que M2-14)
- **Dónde:** `backend/apps/migracion/views.py:32,68`.
- **Qué ve el usuario:** cualquier usuario puede revertir una carga de migración completa.

**M1-22 · Bajo · previsible** · confirmado
- **Dónde:** `configuracion/campanas/page.tsx:35-43,295-297`.
- **Qué ve el usuario:** una promoción que termina hoy aparece "Vencida" desde las 7 p. m.
- **Causa:** usa la fecha en UTC (ver T-04).

**✅ M1-23 · Bajo · carga** · confirmado
- **Dónde:** `ProcedimientosCatalogo.tsx:176-194,281`; `TratamientosCatalogo.tsx:137-144`; `formas-pago/page.tsx:204-207`.
- **Qué ve el usuario:** si la carga falla, dice "No hay procedimientos". Activar o desactivar puede fallar sin avisar.

**✅ M1-24 · Bajo · parámetros** · confirmado
- **Dónde:** `lib/api/formasPago.ts:7`.
- **Qué ve el usuario:** con más de 25 formas de pago, promociones o sedes, las demás no aparecen.
- **Causa:** es el mismo problema de paginación de T-01.

**✅ M1-25 · Bajo · carga** · confirmado
- **Dónde:** `backend/apps/seguimiento/views.py:287-290`; `configuracion/seguimiento/page.tsx:48,84`.
- **Qué ve el usuario:** quien edita la clínica pero no ve seguimiento se queda en "Cargando…" para siempre en Configuración → Seguimiento.
- **Arreglo:** permitir el GET con `clinicas.editar` y mostrar el error.

**M1-26 · Bajo · previsible** · probable
- **Dónde:** `configuracion/sedes/page.tsx:175-198`.
- **Qué ve el usuario:** después de editar una sede, "Nueva sede" puede abrir con los datos de la anterior.

**M1-27 · Bajo · previsible** · confirmado
- **Dónde:** `clinicas/views.py:627-642`.
- **Qué ve el usuario:** reactivando sedes se puede superar el límite del plan.

**M1-28 · Bajo · errores** · confirmado
- **Dónde:** `campanas/page.tsx:836-842,1010-1016`; `clinicas/views.py:1454-1456`.
- **Qué ve el usuario:** pulsa "Eliminar", ve "Promoción eliminada", y la promoción sigue en la lista como "Inactiva".
- **Arreglo:** cambiar el texto a "Desactivar" o filtrar la lista.

**M1-29 · Bajo · faltante** · confirmado
- **Dónde:** `preparar-clinica/page.tsx:121`.
- **Qué ve el usuario:** si eligió por error "Procedimientos sueltos" en "¿Qué vendes?", no puede cambiar la respuesta.

**M1-30 · Bajo · textos** · confirmado
- **Dónde:** `puesta-en-marcha/page.tsx:94,111`.
- **Qué ve el usuario:** textos con voseo ("Podés revertir… mientras revisás").

**M1-31 · Bajo · API (código muerto)** · confirmado
- **Qué pasa:**
  - `POST …/pasos/reordenar/` y `…/consentimientos/reordenar/` dan 405 porque DRF ordena las acciones por nombre: `paso_detalle` y `eliminar_consentimiento` capturan la URL antes.
  - `DELETE …/tratamientos/{id}/tipos/{tipo}/` cae en `editar_tipo`.
  - `PlantillaAsistenciaViewSet` exige `clinicas.config.gestionar`, que no existe.
- **Impacto hoy:** ninguno. `ProtocoloPasos.tsx`, `ConsentimientosServicio.tsx`, `removeTipo` y `plantillasAsistencia` no se usan en ninguna pantalla.
- **Arreglo:** borrar ese código, o usar `url_path` únicos y la clave `clinicas.editar` antes de volver a usarlo.

## Pruebas no técnicas

Usuarios: Admin, un rol personalizado con "Editar datos de la clínica", un rol solo con "Gestionar promociones" y un usuario solo con "Ver sedes".

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Configuración → Agenda y pacientes → apagar "Recordatorios automáticos" → Guardar → recargar. | Sigue apagado. | M1-01 |
| 2 | En la misma pantalla, sin tocar nada, mirar el botón Guardar. | Está deshabilitado. | M1-01 |
| 3 | Registro de pacientes → encender "Datos personales" → recargar. Luego abrir el enlace de autorregistro y enviar sin esos datos. | Sigue encendido, y el formulario pide los datos. | M1-02 |
| 4 | Con una clínica en prueba, abrir cualquier pantalla y luego Configuración → Plan. | Se ve "quedan X días". | M1-03 |
| 5 | Dar precio propio a la Sede B en un procedimiento → desactivar la Sede B → editar el procedimiento. | Guarda sin error. | M1-04 |
| 6 | Asociar una plantilla de consentimiento a un procedimiento → borrar la plantilla → agendar ese procedimiento. | No pide esa firma y editar el procedimiento no da error. | M1-05 |
| 7 | Con el rol de "Gestionar promociones", clic en Promociones. | Se abre. | M1-06 |
| 8 | Con el rol de "Editar datos de la clínica", cambiar un paso de Recepción y Otros documentos. | Se guarda. | M1-07 |
| 9 | Con ese mismo rol, crear una plantilla de orden. | Se guarda, o aparece un mensaje claro. | M1-08 |
| 10 | Crear una sede con el nombre de otra que ya existe. | "Ya existe una sede con ese nombre". | M1-09 |
| 11 | Con "Ver sedes", abrir Sedes. | No aparecen Nueva ni Editar. | M1-10 |
| 12 | Abrir Promociones y enseguida Sedes. | Se ven las sedes inactivas. | M1-11 |
| 13 | Desmarcar "Activo" en un procedimiento y guardar. | Queda Inactivo. | M1-12 |
| 14 | Borrar el NIT y guardar; subir un logo .webp. | Mensaje junto al NIT; el logo se sube. | M1-13, M1-14 |
| 15 | Desactivar una plantilla de orden → "Mostrar inactivas". | Aparece y se puede reactivar. | M1-15 |
| 16 | Crear una promoción con la fecha de fin antes de la de inicio. | Mensaje claro, sin duplicados. | M1-16 |
| 17 | Después de las 7 p. m., mirar una promoción que termina hoy. | Dice "Activa". | M1-22 |
| 18 | Preparar mi clínica con un procedimiento cubierto solo por un grupo de atención. | No dice "sin profesional". | M1-20 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/clinicas/{id}/recordatorio_config/` vs `GET /api/v1/clinicas/clinicas/{id}/recordatorio_config/`. | La primera da 404 (es el bug); la segunda da 200. | M1-01 |
| 2 | `PATCH /api/v1/clinicas/mi-clinica/ {"tab_personal_requerido":true}` y luego `GET /configuracion/registro-publico/`. | Hoy no se guarda; con `PATCH /configuracion/registro-publico/` sí se guarda. | M1-02 |
| 3 | `GET /api/v1/clinicas/mi-clinica/` de una clínica en prueba. | Incluye `trial_days_remaining`. | M1-03 |
| 4 | `PATCH /clinicas/procedimientos/{id}/` con `precios_sede` que incluya una sede inactiva. | 200, ignorando esa sede (hoy 400). | M1-04 |
| 5 | `DELETE /configuracion/plantillas-consentimiento/{id}/` y luego `GET /clinicas/procedimientos/{pid}/consentimientos/`. | La plantilla ya no aparece. | M1-05 |
| 6 | Con un rol que solo tiene `clinicas.editar`: `PATCH` a `/configuracion/wizard/`, `/cartera/` y `/facial/`; `GET /clinicas/mi-clinica/plan/`. | 200 (hoy 403). | M1-07, M1-10 |
| 7 | Con ese mismo rol: `POST /historia-clinica/plantillas-ordenes/`. | 201 (hoy 403). | M1-08 |
| 8 | `POST /clinicas/sedes/` con un nombre repetido. | 400 en `nombre` (hoy 500). | M1-09 |
| 9 | `GET /historia-clinica/plantillas-ordenes/` con y sin `activa`. | Sin el parámetro solo trae activas; con otro valor trae todas. | M1-15 |
| 10 | `POST /migracion/lotes/{id}/revertir/` como Profesional. | 403. | M1-21 |
| 11 | `GET /clinicas/formas-pago/?page_size=100` con 30 formas de pago. | 30 resultados (hoy 25). | M1-24 |
| 12 | `resolve()` de `…/procedimientos/<uuid>/pasos/reordenar/`. | `procedimientos-reordenar-pasos` (hoy `paso-detalle`). | M1-31 |
| 13 | Test: `MiClinicaSerializer.Meta.fields` contiene `trial_days_remaining`. | Verdadero. | M1-03 |

## Notas

- El usuario `prueba.sede.unica@beautyclinic.test` no tiene `clinicas.editar`. Para M1-06, M1-07, M1-08 y M1-19 hay que crear un rol con esa capacidad.
- `/configuracion/procedimientos/[id]` es una página huérfana: queda en blanco si falla la carga y nada enlaza a ella.
- `SetupChecklist.tsx:22` y `preparacion.py:69` solo funcionan para el rol `admin`.
- `CampanaViewSet.activas` exige `campanas.gestionar`. Si una pantalla de Recepción la llamara, daría 403.

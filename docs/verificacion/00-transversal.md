# T — Resumen general: problemas transversales, avance y lo que falta

**Estado:** En corrección. Pasos 1 a 6 de 7 hechos.

Este es el **resumen de toda la verificación**. Tiene tres partes:
1. El tablero de abajo: qué se hizo y qué falta.
2. Los problemas que se repiten en varios módulos (T-01 a T-10). Cada uno se arregla una vez y resuelve hallazgos en muchas pantallas.
3. El detalle del avance y el orden de corrección.

El detalle de cada hallazgo está en el archivo de su módulo (m0 a m7), marcado con ✅ cuando se corrige.

## Tablero

| Paso | Qué cubre | Estado | Commit |
|---|---|---|---|
| 1 | Bloqueos del día a día: paginación, sesión, editar pacientes, recordatorios, autorregistro, buscador de Ingresos, atención con roles personalizados, confirmar citas | ✅ Hecho | `c8e2a65` |
| 2 | Dinero y stock: pagos y abonos dobles, stock, edición de cobros, reportes de ingresos, arqueo, "Por cobrar", reversar pagos | ✅ Hecho | `28db7ce` |
| 3 | Legal y seguridad: consentimientos firmados sin firma, firma que no llega al PDF, correo abierto, aislamiento entre clínicas, escalada de rol, usuario desactivado que entra, registro público sin límite | ✅ Hecho | `521456f` |
| 4 | Roles personalizados y permisos: chequeos por rol fijo, permisos huérfanos, defaults de Recepción y Profesional, menús que expulsan sin aviso | ✅ Hecho | `03c7e93` |
| 5 | Manejo de errores y carga: mensajes comunes, "no hay datos" cuando hubo error, guardados que fallan en silencio | ✅ Hecho | `03c7e93` |
| 6 | Agenda: bloqueos que no se ven o no bloquean, reprogramar citas confirmadas, estado editable por API, zona horaria, recordatorio al reprogramar | ✅ Hecho | pendiente de commit |
| 7 | Todo lo demás, por módulo y severidad | Pendiente | — |

**Hallazgos:** 106 de 227 corregidos. No queda ningún crítico pendiente.

| Módulo | Corregidos | Pendientes | Críticos pendientes |
|---|---|---|---|
| M0 Acceso y roles | 22 | 8 | 0 |
| M1 Configuración y catálogo | 11 | 20 | 0 |
| M2 Pacientes | 9 | 17 | 0 |
| M3 Agenda | 21 | 9 | 0 |
| M4 Atención clínica | 13 | 15 | 0 |
| M5 Comercial | 8 | 22 | 0 |
| M6 Dinero | 15 | 12 | 0 |
| M7 Inventario y plataforma | 7 | 18 | 0 |

**Decisiones del usuario (10/10/2026)**

| Pregunta | Decisión | Efecto |
|---|---|---|
| ¿Recepción crea y envía cotizaciones? | **No, por defecto no.** | M5-15 (primera parte) es intencional. No se cambian los defaults; el admin lo activa por rol si quiere. |
| ¿Revertir una carga de migración exige un permiso? | **Sí.** | M1-21 y M2-14: exigir `migracion.gestionar` para revertir (paso 4). |
| ¿La historia clínica se acota por sede? | **No.** La historia es del paciente, no de la sede. | Se mantiene el alcance por clínica (nota de M4). |
| ¿El Profesional ve reportes financieros por defecto? | **No el rol de sistema Profesional. El Admin sí.** | M6-12 y M0-21: quitar `reportes.ver_financieros` del default del Profesional, migrar los roles de sistema existentes y que la pestaña Resumen/P&L se rija por ese permiso (paso 4). |
| ¿Quién puede pedir un bloqueo de agenda? (13/10/2026) | **Quien ve la agenda lo solicita; solo quien tiene "aprobar bloqueos" lo acepta.** | M3-25: crear un bloqueo pide `agenda.citas.ver` (o `agenda.crear_bloqueo`); sin permiso de aprobar queda pendiente (paso 6). |
| ¿Quién entrega los obsequios de producto? | **Quien atiende pacientes.** | M5-15 (segunda parte): ya funciona así, porque la entrega exige `inventario.consumo.registrar`, que da el check "atiende pacientes". Solo falta que la pantalla lo explique a quien no puede (paso 5). |

## Resumen en números

| Módulo | Hallazgos | Críticos | Altos |
|---|---|---|---|
| M0 Acceso y roles | 30 | 1 | 9 |
| M1 Configuración y catálogo | 31 | 0 | 8 |
| M2 Pacientes | 26 | 1 | 5 |
| M3 Agenda | 30 | 1 | 6 |
| M4 Atención clínica | 28 | 2 | 8 |
| M5 Comercial | 30 | 0 | 2 |
| M6 Dinero | 27 | 2 | 9 |
| M7 Inventario y plataforma | 25 | 0 | 4 |
| **Total** | **227** | **7** | **51** |

Algunos hallazgos se repiten entre módulos y cada archivo indica con cuál coinciden. Los transversales de abajo agrupan muchos de ellos.

## Verificaciones automáticas (10/10/2026)

| Verificación | Resultado |
|---|---|
| `manage.py check` | Sin problemas. |
| `makemigrations --check` | Sin migraciones pendientes. |
| `tsc --noEmit` | Compila. Solo quedan errores en `.next/types` de la ruta `preview-tablas` ya borrada (cache viejo). |
| Rutas | 453 llamadas del frontend. 3 a rutas inexistentes: 2 reales (M1-01) y 1 falso positivo de WhatsApp. 5 con un método que el backend no acepta, todas en código muerto (M1-31). |
| Permisos | El catálogo y la base de datos coinciden (95 claves). Hay 2 claves usadas que no existen en el catálogo: `clinicas.config.gestionar` (M1-31) y `rol.permisos`, que es un nombre de log y no un permiso. Además, 5 claves solo las revisa el frontend y 6 las revisa nadie (T-06). |
| Calidad del frontend | 50 archivos con guardados sin manejo de error, 55 con consultas sin estado de error y 1 sin estado de "guardando". |
| Tests del backend | 734 tests: todos pasan salvo 7 errores de login con Google, por el entorno local. Detalle en [Resultado de los tests](#resultado-de-los-tests). |

## T-01 · El backend ignora `page_size` · Crítico

**Dónde:** `backend/config/settings/base.py:138-139`. Se usa `PageNumberPagination` con `PAGE_SIZE=25` y sin `page_size_query_param`.

**Qué ve el usuario:** listas cortadas en 25 sin aviso:
- citas del día;
- bloqueos;
- pacientes;
- insumos en la atención;
- proveedores;
- equipo;
- log de acciones;
- formas de pago;
- consentimientos;
- exámenes y órdenes;
- clínicas de la consola.

Además, los paginadores calculan mal y dan 404.

**Hallazgos que agrupa:** M0-12, M1-24, M2-04, M3-01, M3-02, M3-15, M4-20, M4-26, M7-02 y M7-14.

**Arreglo:**
1. Crear una clase de paginación por defecto con `page_size_query_param="page_size"` y `max_page_size` (por ejemplo, 500).
2. Revisar las pantallas que piden 300 o más; para la agenda, usar una acción sin paginar acotada por rango de fechas.

Es una línea de configuración que destraba unos 10 hallazgos.

## T-02 · No hay manejo común de errores en el frontend · Alto

**Dónde:** `components/shared/QueryProvider.tsx:9-16`. No tiene `MutationCache` ni `QueryCache` con `onError`, y no existe una función común que convierta un error del backend en un mensaje.

**Qué ve el usuario:**
- **Guardados que fallan sin aviso:** unos 50 archivos.
- **Pantallas que muestran "no hay datos" cuando en realidad hubo un error o falta de permiso:** unos 55 archivos.
- **Mensajes en inglés de axios**, como "Request failed with status code 400".
- **Mensajes genéricos** que esconden la explicación que sí da el backend.

**Hallazgos que agrupa:** M0-15, M0-17, M2-03, M2-10, M3-08, M3-10, M3-16, M4-03, M4-14, M4-17, M5-04, M5-05, M5-06, M5-07, M6-15, M6-16, M7-06 y M7-08, entre otros.

**Arreglo:**
1. Crear `lib/errores.ts` con `mensajeDeError(err)`. Debe leer, en orden: `error`, `detail`, `non_field_errors`, el primer error por campo y el estado HTTP (403 → "Tu rol no tiene permiso para esto"; red; 500), y devolver un texto en español.
2. Agregar un `MutationCache({ onError })` que muestre un toast cuando la mutación no tenga su propio `onError`.
3. Crear un componente `ErrorState` con "Reintentar" y usarlo donde hoy se muestra el estado vacío ante un error.
4. Para formularios, crear un helper que pase los errores 400 por campo a `setError` de react-hook-form.

**Lista de archivos:** `backend/scripts/auditoria/salida/calidad_frontend.txt`.

## T-03 · Chequeos por rol fijo en el backend · Alto

`user.rol` en el **backend** es un campo oculto. Para cualquier rol personalizado vale `"recepcion"`, así que estos chequeos ignoran los permisos que se configuran en Roles. Los `rol != "superadmin"` (unos 85) son inofensivos. Estos sí rompen:

| Chequeo | Dónde | Hallazgo |
|---|---|---|
| `IsAdmin` en PATCH de configuración | `configuracion/views.py:135,184,257,292,327,365`; `clinicas/views.py:121` (`plan_usage`) | M0-04, M1-07, M1-10 |
| `IsAdmin` en reenviar invitación | `users/views.py:793` | M0-07 |
| `IsAdminOrRecepcion` (acepta a cualquier personalizado) | `protocolos/views.py:51` | M0-05 |
| `rol in (admin, profesional)` en antecedentes | `pacientes/views.py:106-111` | M0-03, M2-07 |
| `rol == "profesional"` (solo su cita) | `historia_clinica/serializers.py:147`, `views.py:546/596`, `protocolos/views.py:110-116` | M0-22, M4-12, M4-13 |
| Slug `"coordinador"` fijo | `historia_clinica/views.py:78-82,951` | M0-23, M1-08 |
| `es_admin` | `caja/views.py:302`; `users/views.py:958-976` | M0-24, M0-18 |
| Horarios solo propios si no es admin | `colaboradores/views.py:318-327` | M0-08 |

**Arreglo:** cambiar cada uno por `RequirePermission(<clave>)`, `user_is_tenant_admin(user)` o `es_profesional`. Agregar un test que recorra estos endpoints con un `Rol(es_sistema=False)` y compruebe que el resultado depende solo de los permisos.

En el **frontend**, `user.rol` es el slug del rol dinámico. Esos chequeos no rompen los roles personalizados, pero son más estrictos que los permisos:
- M6-12 y M0-21: el P&L se muestra solo al admin;
- M3-24: la agenda del profesional.

## T-04 · Fechas en UTC en el frontend y zona horaria única · Medio

**Qué ve el usuario:** después de las 7 p. m.:
- "Hoy" pasa a ser mañana;
- las promociones salen como vencidas;
- la fecha por defecto de una compra es la de mañana.

Además, los cumpleaños y los vencimientos se muestran un día antes.

**Causa:** `toISOString().slice(0,10)` y `new Date('YYYY-MM-DD')`.

**Hallazgos que agrupa:** M1-22, M2-12, M2-26, M6-11, M6-22, M6-23 y M7-20.

**Arreglo:**
- Usar siempre `todayISO()` y parsear las fechas en hora local. Ya existen `aFechaLocal` y `formatFechaDMY`.
- Buscar `toISOString().slice` y `new Date(` aplicado a strings de fecha.

**Aparte:** `TIME_ZONE="America/Bogota"` es fijo y no hay zona horaria por clínica (M3-20). Afecta al cliente de Chile.

## T-05 · Relaciones no acotadas a la clínica (multiclínica) · Alto

**Qué pasa:** por API, conociendo un UUID, se puede escribir sobre datos de otra clínica. Nada de esto se ve en pantalla.

**Hallazgos que agrupa:**
- M2-05: `clinica` del paciente escribible;
- M3-07: citas y bloqueos;
- M4-10: obesidad;
- M4-11: fotos;
- M6-18: cobros, acuerdos y gastos;
- M7-09: inventario.

**Arreglo:**
1. Crear un mixin de serializer que acote todos los `PrimaryKeyRelatedField` a `get_clinica_activa(request)` en `__init__`.
2. Tomar la clínica siempre del request, nunca del body.
3. Agregar un test que intente cada `POST` con FKs de otra clínica.

## T-06 · Permisos huérfanos o mal agrupados · Medio

**Permisos que el backend nunca revisa**, así que el interruptor del rol no hace nada o la API no protege:

| Permiso | Hallazgo |
|---|---|
| `agenda.bloqueos.gestionar` | M3-17 |
| `caja.gastos.aprobar` | M6-19 |
| `caja.categorias.ver` | — |
| `configuracion.formas_pago.ver` | — |
| `migracion.gestionar` | M2-14, M1-21 |
| `sedes.ver` | — |

**Problemas de agrupación:**
- **Capacidades "gestionar" sin su "ver":** M0-10 y M1-19. Por ejemplo, gestionar procedimientos sin poder ver el catálogo.
- **Permisos que no se pueden asignar desde Roles:**
  - `configuracion.formas_pago.ver`;
  - los 4 permisos que solo da el check "atiende pacientes";
  - `inventario.consumo.registrar`, que hace falta para entregar obsequios (M5-15).
- **Defaults del rol Recepción a revisar:**
  - ~~no tiene `confirmar_manual`, y "No confirmó" no funciona nunca (M3-04)~~ → resuelto eliminando ese permiso;
  - no tiene `caja.cierre.ver`, y no puede registrar gastos (M6-07);
  - no tiene `cotizaciones.gestionar` (M5-15);
  - no tiene `crear_bloqueo` (M3-25).
- **Default del Profesional a revisar:** `reportes.ver_financieros` (M6-12).
- **El check "atiende pacientes"** no da `historia.ver` (M4-02, que es crítico) ni `antecedentes.ver` (M0-03).

**Regla al tocar permisos de "ver"**, por indicación del usuario:
- Un permiso de **ver** controla la *pantalla* de ese módulo, **no las listas que otras pantallas necesitan para funcionar**.
- Ejemplos: el selector de procedimientos en la agenda o en una cotización, de sedes, de profesionales, de formas de pago al cobrar, o de insumos en la atención.
- Esos selectores deben responder a cualquier usuario que pueda usar la pantalla que los contiene.
- Ya pasó antes que quitar un "ver" dejaba vacío un selector en otra pantalla (ver M7-19 y M0-25).
- Al exigir un permiso nuevo en un endpoint de lista, revisar quién lo consume como dependencia. Si hace falta, separar el endpoint liviano del selector (`/activos/`, `/opciones/`) del de la pantalla de gestión.

**Arreglo:**
1. Decidir los defaults con el usuario.
2. Ajustar `permissions_catalog.py` y sincronizar los roles con una migración.
3. Eliminar o implementar cada permiso huérfano.

## T-07 · Doble envío y concurrencia en operaciones de dinero y stock · Crítico

**Qué ve el usuario:** pagos duplicados, abonos duplicados, stock inflado, citas duplicadas y cuotas duplicadas.

**Hallazgos que agrupa:** M6-01, M6-02, M3-14, M5-14, M6-25, M7-01 y M7-22.

**Arreglo:**
- En el backend: `transaction.atomic` + `select_for_update` y validar el estado dentro del bloqueo.
- En el frontend: deshabilitar el botón con `isPending || formState.isSubmitting`.
- Para los pagos, una clave de idempotencia.

## T-08 · Código muerto y endpoints sin pantalla

**Para borrar o reconectar:**
- `ProtocoloPasos.tsx` y `ConsentimientosServicio.tsx`: son los únicos que llaman a las rutas de reordenar con 405 (M1-31).
- `removeTipo` y `clinicasApi.plantillasAsistencia` (M1-31).
- `ProtocoloPanelAtencion`, `TratamientoCard`, `CheckinSheet`, `ConsentimientosSesionCheck`, `AntecedentesSheet` y `ConsentimientoFirmaSheet` (M4-27).
- `IniciarPagoSheet` y `apps/comisiones`, que está vacía (M6-27).
- `VerificacionFacialSeccion` (M2-26).
- `notificacionesApi.enviarEmail` y los helpers de bienvenida (M7-04).

**Endpoints sin pantalla que sí se necesitan:**
- `reintentar_pdf` (M4-09);
- `seguimiento reabrir` y `gestiones` (M5-09);
- `cobros anular` y reversar un pago (M6-09);
- editar insumos y proveedores y cancelar una orden (M7-07);
- `configuracion/registro-publico` (M1-02).

## T-09 · Textos con voseo y en inglés

**Con voseo:**
- `puesta-en-marcha/page.tsx:94,111` (M1-30);
- `PacienteEnCursoWizard.tsx` (M2-15);
- mensaje del backend "Configurá la duración" (M3-09).

**En inglés:** "Array must contain at least 1 element(s)" (M5-22).

**Para encontrar más:**

```bash
grep -rnE "\b(podés|tenés|querés|revisá|configurá|corregí|cargaste|revisás)\b" frontend/src backend/apps
```

## T-10 · Datos personales en logs y `console.log` en producción

- **`console.log` en producción:**
  - `ColaboradorDialog.tsx` muestra los payloads (M0-25);
  - `CotizacionForm.tsx:707` muestra el payload del PATCH (M5-30).
- **`request.data` en nivel warning:**
  - `historia_clinica/views.py`, en el create de consentimiento;
  - `agenda/views.py`, en `cambiar_estado`.

## Avance

**Paso 1 — corregido el 10/10/2026 (commit c8e2a65)**

| Ítem | Qué se hizo |
|---|---|
| T-01 | `apps/core/pagination.py` define `PaginacionEstandar`, con `page_size_query_param` y máximo 500, y es la paginación por defecto. La agenda usa `PaginacionAgenda`, con máximo 2000; la vista Día pide 500 y la vista Mes 2000. Resuelve M0-12, M1-24, M2-04, M3-01, M4-26 y M7-02. |
| M0-01 | El interceptor guarda el `refresh` rotado. |
| M2-01 | Con datos enmascarados, el formulario no valida documento, teléfono ni correo. |
| M1-01 | Se corrigió la URL de recordatorios y se agregó un estado de error con "Reintentar". |
| M1-02 | Los interruptores del autorregistro leen y guardan en `/configuracion/registro-publico/`; si falla el guardado, se revierten y avisan. |
| M6-04 | `search_fields` de cobros (vista y admin) ahora usa `nombres`, `apellidos` y `numero_documento`. |
| M4-02 | `PERMISOS_ATIENDE_PACIENTES` incluye `historia.ver` y `pacientes.antecedentes.ver`. |
| M3-04 | Se eliminó el permiso `agenda.citas.confirmar_manual`, por decisión del usuario: confirmar o marcar "No confirmó" es parte de gestionar la agenda. Ahora `confirmar_manual` y `no_confirmo` exigen `agenda.citas.crear` o `agenda.citas.editar` (`RequireAnyPermission`). La migración `users 0024` borra el permiso y sus asignaciones. El diálogo explica el 403. |

- **Pruebas:** `apps/core/tests/test_verificacion_paso1.py`.
- **Script nuevo:** `backend/scripts/auditoria/verificar_campos_vistas.py`. Busca `search_fields`, `ordering_fields` y `filterset_fields` con campos inexistentes; solo encontró el de M6-04.
- **Pendientes que dependían de la paginación:**
  - M3-02: los bloqueos necesitan además un filtro por rango de fechas.
  - M4-20: la pantalla de consentimientos no pide `page_size`.
  - M7-14: la consola no tiene paginador.

**Paso 2 — dinero y stock (10/10/2026)**

| Ítem | Qué se hizo |
|---|---|
| M6-01 | `registrar_pago` bloquea el cobro (`select_for_update`) y valida `valor > 0`. En cobros que no son de cotización, rechaza el pago si el ingreso ya está pagado (`COBRO_YA_PAGADO`) y rechaza abonos mayores al saldo (`PAGO_SUPERA_SALDO`). El primer pago puede superar el total porque el cobro de cita permite "valor cobrado" mayor al costo; se revisa en M6-14. Frontend: el detalle del ingreso se pide al servidor y se actualiza con la respuesta del pago. Además, el valor sugerido es el saldo y se muestran los errores del backend. |
| M6-02 | El abono de cuota bloquea la cartera y la cuota antes de validar el saldo. El modal se desactiva mientras valida (`isSubmitting`) y muestra el error de cada campo. |
| M7-01 | `eliminar_consumo_insumo` bloquea el consumo y rechaza uno ya revertido. `destroy` solo encuentra consumos activos. |
| M6-03 | `CobroViewSet` ya no acepta PUT ni PATCH; un ingreso cambia solo por sus acciones. |
| M6-05 + M6-20 | Los reportes cuentan el dinero recibido por la **fecha de cada pago**, sin filtrar el cobro por su fecha. Aplica a: dashboard ("Ingresos hoy", desglose por medio y semana), `/reportes/ingresos/`, el P&L (facturado = cobros de cita y libres por su fecha + abonos de cotización por fecha del pago; recaudado = pagos del periodo) y "Total recaudado" en Ingresos. |
| M6-08 | El arqueo mide la ventana por `created_at` del pago, es decir, cuándo entró al cajón. El abono de cuota con fecha de hoy guarda la hora real en lugar de las 00:00. |
| M6-06 | "Por cobrar" usa dos agregados separados, sin el JOIN que repetía el total por cada pago. |
| M6-09 | Nueva acción `POST /cobros/cobros/{id}/pagos/{pago}/reversar/` con `cobros.anular` y motivo obligatorio. Si el pago era un abono de cuota, devuelve el saldo a la cuota, y la acción queda en el log. Frontend: botón "Reversar" en cada pago, con diálogo de motivo, y "Anular ingreso" cuando no hay pagos. |

**Pruebas del paso 2:**
- `apps/core/tests/test_verificacion_paso2.py`: 10 casos.
- `apps/cartera/tests.py::test_reversar_un_abono_devuelve_el_saldo_a_la_cuota`.

**Paso 3 — legal y seguridad (10/10/2026)**

| Ítem | Qué se hizo |
|---|---|
| M4-01 | `firmado`, `fecha_firma` y `archivo` del consentimiento informado son de solo lectura; `paciente` y `cita` no cambian después de crearlo. Ya no se puede marcar como firmado ni "desfirmar" para borrarlo. Se quitó del frontend la función de PATCH, que no se usaba. |
| M4-05 | `completar_firma` confirma con Documenso (3 intentos, 1 s entre cada uno) antes de marcar la firma. Si Documenso aún no la refleja, responde 409 y la pantalla ofrece "Reintentar sincronización". |
| M4-04 | La firma dibujada en el enlace público es obligatoria, se valida (PNG en base64, máximo 500 KB) y queda en el PDF. La pantalla muestra el motivo del rechazo. Hoy ninguna pantalla genera ese enlace, porque el flujo real es Documenso. |
| M7-04 | Se eliminaron `POST /notificaciones/emails/enviar/`, su serializer y los helpers muertos del frontend, que armaban HTML con la contraseña en texto plano. El permiso `notificaciones.email.enviar` queda huérfano y se resuelve en el paso 4. |
| M0-06 | Quien no es administrador no puede asignar el rol Administrador, ni modificar, activar, desactivar o borrar a un administrador, ni cambiar su propio rol o editar los permisos del rol que tiene. Aplica en usuarios, colaboradores y roles. |
| M0-02 | Activar y desactivar (y el PATCH de `activo`) mantienen `is_active` alineado: un usuario desactivado ya no entra. Al reactivar a alguien con la invitación pendiente, sigue sin poder entrar hasta crear su contraseña. |
| M7-11 | El registro público de clínicas tiene un límite de 5 intentos por hora por IP y ya no devuelve el error interno. |
| T-05 | Nuevo `apps/core/clinica_scope.py` con `AcotadoAClinicaMixin`, que limita a la clínica activa cada relación por id del serializer. Se aplicó en citas y bloqueos, cobros y pagos, acuerdos y abonos de cartera, gastos de caja, insumos y ajuste de stock, fotos y consumo de insumos, y obesidad. Además, la clínica del paciente sale siempre de la request (M2-05), los procedimientos e insumos de un ingreso se buscan en su clínica, y citas y bloqueos validan las sedes del usuario (M3-07). Cubre M2-05, M3-07, M4-10, M4-11 (la nota; falta el límite de tamaño de la foto), M6-18 y M7-09. |
| M4-10 | Las mediciones de obesidad exigen `historia.ver` para leer y ser quien atiende para escribir; antes bastaba con estar logueado. |

- **Pruebas:** `apps/core/tests/test_verificacion_paso3.py`, con 15 casos.
- **Pendiente de este grupo:** M4-11 (límite de tamaño y tipo de la foto), M4-25 (datos de más en el GET público del consentimiento) y el reenvío de la invitación del registro (M7-12) pasan al paso 7.

**Paso 4 — roles personalizados y permisos (10/10/2026)**

| Ítem | Qué se hizo |
|---|---|
| T-03 · configuración | Los PATCH de wizard, facial, cartera, registro público, signos vitales y plantillas Documenso exigen `clinicas.editar`, no el rol admin (M0-04, M1-07). El cupo del plan se consulta con ver clínica o sedes (M1-10, parte backend). |
| T-03 · protocolos | Crear o editar un tratamiento exige agendar o atender (`RequireAnyPermission`); antes entraba cualquier rol personalizado (M0-05). |
| T-03 · "solo lo propio" | Nueva función `atiende_solo_lo_propio(user)`, basada en `es_profesional` y no en el rol fijo, para notas, fotos y antecedentes (M0-22, M4-12, M0-03, M2-07). Las sesiones completadas por un admin conservan el profesional de la cita (M4-13). |
| T-03 · otros | Plantillas de órdenes con `clinicas.editar`, no con el slug "coordinador" (M0-23, M1-08). Gastos: quien tiene `caja.gastos.editar` edita cualquiera (M0-24). Horarios: quien los ve, ve los de todos (M0-08). Reenviar invitación con `usuarios.editar` (M0-07). |
| M0-18 | Cambiar la contraseña propia pide la actual y exige una clave fuerte. La de otro exige `usuarios.editar` y no se aplica a administradores. Perfil tiene el campo "Contraseña actual" y confirma el cambio. |
| Decisión 2 | Revertir una carga de puesta en marcha exige `migracion.gestionar` (M1-21, M2-14). |
| Decisión 4 | El rol de sistema Profesional ya no trae `reportes.ver_financieros` (default + migración). La pestaña Resumen/P&L se rige por ese permiso (M6-12, M0-21). |
| T-06 · catálogo | Cada capacidad de "gestionar" incluye su "ver" (M1-19, M0-10). Se eliminaron `caja.gastos.aprobar` (M6-19) y los permisos de correo, junto con `EmailConfigView`. La migración `users 0025` agrega el "ver" a los roles que ya tenían el "gestionar", quita los financieros al Profesional de sistema y borra los permisos eliminados. |
| M3-17 | Editar o borrar un bloqueo exige `agenda.bloqueos.gestionar`, o ser quien lo creó mientras esté pendiente. Un bloqueo aprobado editado sin permiso de aprobar vuelve a revisión. |
| Selectores (regla del usuario) | Lista de roles con permiso de usuarios o colaboradores (M0-25); caja abierta con permiso de registrar o editar gastos (M6-07); ajustes de Seguimiento con `clinicas.editar` (M1-25); lista de colaboradores con ver usuarios (M0-07). |
| Menús | Configuración se abre si hay algún ajuste gestionable (`puedeEntrarAConfiguracion`); Promociones se abre con `campanas.gestionar` (M0-09, M1-06). Equipo muestra Nuevo, Editar y Activar solo con `colaboradores.gestionar`, y Reenviar con `usuarios.editar` (M0-07). Grupos de atención usa `colaboradores.gestionar` (M0-30). |
| M5-27 | `/auth/me/` devuelve `ve_solo_su_actividad_comercial`, y Seguimiento y Cotizaciones lo usan en lugar de deducirlo del rol. |

- **Pruebas:** `apps/core/tests/test_verificacion_paso4.py`, con 13 casos.
- **Revisan solo en el frontend, a propósito:** `caja.categorias.ver` y `configuracion.formas_pago.ver`. Controlan la pantalla, mientras que los selectores del backend quedan abiertos (regla del usuario).
- **Quedan de este grupo para el paso 5 o el 7:** ocultar las acciones de Sedes y Consentimientos sin permiso (M1-10, M1-18), "Editar" en la agenda según el permiso (M3-23, M3-24, M3-25) y la pantalla de aterrizaje según permisos (M0-20).

**Paso 5 — manejo de errores y carga (10/10/2026)**

| Ítem | Qué se hizo |
|---|---|
| T-02 · helper | `lib/errores.ts`: `mensajeDeError(err, porDefecto)` lee `error`, `detail`, `non_field_errors` y el primer error de campo, y traduce la red caída, el 403 ("Tu rol no tiene permiso…"), el 404, el 429 y el 5xx. Incluye `aplicarErroresDeCampo` (400 por campo → `setError` de react-hook-form) y `esSinPermiso`. |
| T-02 · red de seguridad | `QueryProvider` tiene un `MutationCache` que muestra un toast cuando falla una mutación sin `onError`: ya no hay guardados que fallen en silencio (M0-15, M3-08, M4-14, M4-17 y M3-17 en sus botones). Las mutaciones que manejan el error con `try/catch` llevan `meta.errorManejado`. |
| T-02 · pantallas | `ErrorState` con "Reintentar" en lugar de "no hay datos" o carga infinita en: agenda (Día, Semana, Mes), cotizaciones (lista y detalle), venta, cartera (lista, detalle y vencidas), caja, egresos (y su panel de gasto), inventario (alertas, insumos y "crea una sede primero"), roles, historia del paciente, SlotPicker (mensaje real del backend), firma del profesional, ajustes de Seguimiento, catálogo de procedimientos y log de acciones (M3-09, M3-10, M5-05, M5-06, M6-16, M7-06, M0-17, M4-19, M1-23). |
| Pacientes | `PacienteForm` muestra los errores del servidor en su campo y un aviso junto al botón; sirve en la página, la agenda, la cotización y el autorregistro (M2-03, M5-11, M3-22). La fecha de nacimiento es obligatoria y está marcada con `*` (M2-02). El autorregistro muestra "Guardando…" y evita el doble envío (M2-18). |
| Atención | Motivo de consulta y Plan de manejo se guardan solos al dejar de escribir y al salir de la pestaña; indican "Guardando…", "Guardado" o "No se guardó", y al volver se recupera lo escrito (`useBorradorNota`, M4-06). Si la nota no se puede cerrar, la cita no se completa (M4-14). La nota de la atención se refresca al crearse, así las fotos no van a la visita anterior (M4-07), y si no se puede abrir la nota se avisa. |
| Consentimientos | Revocar pide el motivo en un diálogo y muestra el error (M4-03). |
| Cotización | Si falta algo, un toast dice qué falta y en qué ítem (M5-04). El mensaje de "sin ítems" está en español (M5-22). Una forma de pago sin fecha viaja como null (M5-23). El envío por WhatsApp o correo muestra el motivo real (M5-07). |
| Mensajes reales | Bloqueos (M3-16), ajuste de stock y compras (M7-08), sedes (M1-09), cobro en la atención (M6-15) y carga de puesta en marcha (M2-15, que antes mostraba JSON crudo). |
| Sesión | Recargar sin conexión ya no cierra la sesión: aparece "Sin conexión con el servidor · Reintentar" (M0-14). Cuando la sesión vence se avisa (M0-28). |
| T-09 | Se corrigió el voseo en la puesta en marcha y en dos mensajes del backend (agenda y migración). |

- **Siguen sin mensaje propio:** quedan 46 archivos de la lista de `calidad_frontend.txt`. Ya no fallan en silencio (los cubre el aviso global), pero muestran un texto genérico.
- **Pendiente de este grupo para el paso 7:** M0-11 (filtro de usuario en el log), M2-10 (modales de la ficha del paciente), M4-17 (descargas de PDF) y M4-21 (mensajes de firma).

**Paso 6 — agenda (13/10/2026)**

| Ítem | Qué se hizo |
|---|---|
| M3-02 | `GET /agenda/bloqueos/` acepta `desde` y `hasta` (días, ambos incluidos) y trae todo bloqueo que se cruce con el rango, también los de varios días que empezaron antes. La agenda (Día y Semana) pide solo los de su rango, y el panel de bloqueos los vigentes y próximos, hasta 500. Una fecha mal escrita responde 400. |
| M3-03 | `bloqueos_aplicables()` en `agenda/services.py` reúne los bloqueos del profesional, de su sede y de toda la clínica que se cruzan con el horario. La usan los horarios disponibles, crear y editar citas. Una cita dentro de un bloqueo responde "Ese horario está bloqueado en la agenda" (`HORARIO_BLOQUEADO`). |
| M3-05 | "Editar" aparece en citas pendientes y confirmadas. En citas de paquete, de sesión o de consulta libre el procedimiento se muestra fijo y los horarios se calculan con la duración de la cita. Reprogramar una cita de paquete ya no vuelve a exigir que la cotización tenga sesiones libres. |
| M3-06 | `estado` y `motivo_cancelacion` son de solo lectura en la cita: el estado cambia solo por `cambiar_estado`. Una cita completada, cancelada o con "No asistió" no se edita (`CITA_CERRADA`). |
| M3-11 | El horario de la sede y del profesional se comparan en hora local. "Cambiar profesional" en una cita de las 19:00 ya no dice "fuera del horario". |
| M3-12 y M3-13 | Al cambiar la fecha se reinician el recordatorio y la confirmación, así le llega el aviso de la nueva fecha. Al cambiar el procedimiento se actualiza el nombre que muestra la agenda. |
| M3-14 | Crear y editar citas bloquean la agenda del profesional mientras revisan y guardan: dos recepcionistas ya no toman el mismo horario. Si falla, la lista de horarios se refresca. |
| M3-15 | El aviso de "citas sin cerrar" filtra por estado en el backend; antes contaba solo dentro de las primeras 100 citas. |
| M3-19 (en parte) | Los horarios disponibles leen las citas y bloqueos del día una sola vez, no todo el historial por cada horario. Queda el listado, que puede llamar a Documenso (paso 7, junto con M4-08). |
| M3-23 | "Editar", "Cambiar profesional" y "Recordatorio" dependen de `agenda.citas.editar`; las acciones de estado, de `cambiar_estado` o de ser quien atiende la cita. Confirmar la cita lo puede hacer quien crea o edita citas, igual que "No confirmó" (decisión del paso 1). |
| M3-24 | El profesional arranca viendo sus citas, pero el filtro de profesionales queda visible y puede ver la agenda completa, que es lo que el backend ya le permite. |
| M3-25 | Por decisión del usuario, quien ve la agenda (`agenda.citas.ver`) puede **solicitar** un bloqueo: queda pendiente y no bloquea hasta que alguien con `agenda.aprobar_bloqueo` lo acepte. Quien aprueba lo crea ya aprobado. El botón dice "Solicitar bloqueo" o "Nuevo bloqueo" según el caso, y avisa que queda pendiente. Quien solicita ve sus solicitudes aunque no tenga "ver bloqueos", y solo puede borrarlas mientras siguen pendientes. |
| Otros | Bloqueos sin sede rotulados "Toda la clínica" (parte de M3-28). `slots_disponibles` con fecha mal escrita responde 400 (parte de M3-29). |

- **Pruebas:** `test_verificacion_paso6.py` (18). La suite completa (794 tests) pasa salvo los 7 de login con Google (entorno); después del ajuste de solicitudes de bloqueo se volvieron a correr agenda, usuarios y el paso 6 (168 tests), con el mismo resultado.
- **Queda de agenda para el paso 7:** M3-18 (avisar de las citas afectadas al crear un bloqueo), M3-19 (el listado), M3-20 (zona horaria por clínica), M3-21 (autoconfirmación por enlace) y M3-26 a M3-30.

## Orden de corrección sugerido

Cada paso deja la app más usable para el siguiente. Las pruebas no técnicas de cada módulo se hacen después de su paso.

1. **Lo que bloquea el día a día, con arreglos de pocas líneas:**
   - **T-01:** paginación.
   - **M0-01:** guardar el refresh token.
   - **M2-01:** editar pacientes con datos enmascarados.
   - **M1-01:** URL de recordatorios.
   - **M1-02:** guardado del registro público.
   - **M6-04:** `search_fields` de cobros.
   - **M4-02:** dar `historia.ver` a quien atiende.
   - **M3-04:** confirmar citas sin un permiso aparte.
2. **Dinero y stock:** T-07 (M6-01, M6-02, M7-01), M6-03, M6-05 + M6-08 + M6-20 juntos, M6-06 y M6-09.
3. **Legal y seguridad:** M4-01, M4-04, M4-05, M7-04, T-05 (aislamiento entre clínicas), M0-06 (escalada de rol), M0-02 y M7-11.
4. **Roles personalizados y permisos:** T-03 y T-06, con la decisión de los defaults y los guards de M0-09/M1-06.
5. **Manejo de errores y carga:** T-02, pantalla por pantalla, con el helper común.
6. **Agenda:** M3-02, M3-03, M3-05, M3-06, M3-11 y M3-12.
7. **Lo demás**, por módulo y en orden de severidad.

## Resultado de los tests

Se corrió `docker exec cliniq_backend python manage.py test apps --noinput` (en serie: con `--parallel` el runner falla con "cannot pickle 'traceback'").

- **734 tests en 568 s**: todos pasan salvo **7 errores de login con Google**. Esos 7 fallan por `ModuleNotFoundError: No module named 'google'` en el contenedor local; es un problema del entorno, no del código.
- Las demás trazas que aparecen en la salida (`DocumensoIntegrationError`, `ConnectionError: caido`, `RuntimeError: boom`, `botocore ClientError`) son errores simulados dentro de tests que pasan.
- Los tests actuales **no cubren** la mayoría de los hallazgos de esta verificación: roles personalizados, paginación, concurrencia y aislamiento entre clínicas. Cada módulo propone en su sección "Pruebas técnicas" los tests que faltan.

# T — Resumen general: problemas transversales, avance y lo que falta

**Estado:** En corrección. Pasos 1 a 3 de 7 hechos.

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
| 3 | Legal y seguridad: consentimientos firmados sin firma, firma que no llega al PDF, correo abierto, aislamiento entre clínicas, escalada de rol, usuario desactivado que entra, registro público sin límite | ✅ Hecho | ver git log (fix(seguridad)) |
| 4 | Roles personalizados y permisos: chequeos por rol fijo, permisos huérfanos, defaults de Recepción y Profesional, menús que expulsan sin aviso | Pendiente (decisiones ya tomadas) | — |
| 5 | Manejo de errores y carga: mensajes comunes, "no hay datos" cuando hubo error, guardados que fallan en silencio | Pendiente | — |
| 6 | Agenda: bloqueos que no se ven o no bloquean, reprogramar citas confirmadas, estado editable por API, zona horaria, recordatorio al reprogramar | Pendiente | — |
| 7 | Todo lo demás, por módulo y severidad | Pendiente | — |

**Hallazgos:** 34 de 227 corregidos. No queda ningún crítico pendiente.

| Módulo | Corregidos | Pendientes | Críticos pendientes |
|---|---|---|---|
| M0 Acceso y roles | 4 | 26 | 0 |
| M1 Configuración y catálogo | 3 | 28 | 0 |
| M2 Pacientes | 3 | 23 | 0 |
| M3 Agenda | 3 | 27 | 0 |
| M4 Atención clínica | 6 | 22 | 0 |
| M5 Comercial | 0 | 30 | 0 |
| M6 Dinero | 10 | 17 | 0 |
| M7 Inventario y plataforma | 5 | 20 | 0 |

**Decisiones del usuario (10/10/2026)**

| Pregunta | Decisión | Efecto |
|---|---|---|
| ¿Recepción crea y envía cotizaciones? | **No, por defecto no.** | M5-15 (primera parte) es intencional. No se cambian los defaults; el admin lo activa por rol si quiere. |
| ¿Revertir una carga de migración exige un permiso? | **Sí.** | M1-21 y M2-14: exigir `migracion.gestionar` para revertir (paso 4). |
| ¿La historia clínica se acota por sede? | **No.** La historia es del paciente, no de la sede. | Se mantiene el alcance por clínica (nota de M4). |
| ¿El Profesional ve reportes financieros por defecto? | **No el rol de sistema Profesional. El Admin sí.** | M6-12 y M0-21: quitar `reportes.ver_financieros` del default del Profesional, migrar los roles de sistema existentes y que la pestaña Resumen/P&L se rija por ese permiso (paso 4). |
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

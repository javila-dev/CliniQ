# M2 — Pacientes

**Estado:** Revisado (10/10/2026) · **Sigue:** M3 · **Viene de:** M1

**Alcance.**
- *Pantallas:* listado, nuevo, ficha (`pacientes/[id]` y sus pestañas), editar y crear paciente desde la agenda o una cotización.
- *Flujos:* autorregistro público (`/registro/[token]`), puesta en marcha/migración, foto de control y verificación facial, datos sensibles y antecedentes.
- *Código:* `lib/api/pacientes.ts`, `registroPublico.ts` y `migracion.ts`; backend `apps/pacientes` y `apps/migracion`.

**Antes de corregir.**
- M2-01 bloquea el trabajo diario de Recepción y del Profesional: no pueden editar casi ningún paciente.
- M2-04 comparte causa con M3-01 y M7-02: el paginador global ignora `page_size`. Arreglarlo una sola vez en `config/settings/base.py` (ver [00-transversal.md](00-transversal.md), T-01).

## Hallazgos

**✅ M2-01 · Crítico · errores/permisos** · confirmado
- **Dónde:** `frontend/src/components/pacientes/PacienteForm.tsx:55,82-84,159,289-332`; `pacientes/[id]/editar/page.tsx:29`
- **Qué ve el usuario:** Recepción o el Profesional (por defecto sin "datos sensibles") **no puede guardar ningún cambio** en un paciente con CC/TI o con correo. Aparece "Solo números…" o "Correo inválido" sobre un campo gris que no puede tocar.
- **Causa:** la API devuelve el documento y el correo enmascarados (`••••5678`). RHF valida con zod también los campos `disabled`, así que la validación falla antes de quitarlos del payload.
- **Arreglo:** con `lockSensitive`, aplicar un esquema que no valide los campos sensibles, o no registrarlos en el formulario.

**✅ M2-02 · Alto · parámetros/errores** · confirmado
- **Dónde:** `PacienteForm.tsx:53,209,293`; `backend/apps/pacientes/models.py:86`; `pacientes/nuevo/page.tsx:56-59`; `registro/[token]/page.tsx:43-46`
- **Qué ve el usuario:** la fecha de nacimiento parece opcional (sin `*`). Si se deja vacía:
  - en Nuevo paciente sale "Este campo es requerido." sin decir cuál campo;
  - en el autorregistro sale "Ocurrió un error al registrarte".
- **Causa:** el campo es `NOT NULL` en el modelo. Además, los mensajes de error descartan el nombre del campo.
- **Arreglo:** marcarla como obligatoria con `*` (o permitir null) y mostrar los errores 400 en cada campo con `setError`.

**✅ M2-03 · Alto · llamada sin resolver** · confirmado
- **Dónde:** `components/agenda/NuevaCitaModal.tsx:264-280`; `components/cotizaciones/CotizacionForm.tsx:642-656`
- **Qué ve el usuario:** "Crear y seleccionar" paciente desde la agenda o una cotización **no muestra ningún error** (documento duplicado, fecha vacía, sin permiso).
- **Causa:** `try/finally` sin `catch`.
- **Arreglo:** agregar el `catch` y mostrar los errores por campo.

**✅ M2-04 · Alto · parámetros** · confirmado
- **Dónde:** `app/(authenticated)/pacientes/page.tsx:250-267,63`; `backend/config/settings/base.py:138-139`
- **Qué ve el usuario:**
  - con "10 / pág" se ven 25 filas, y la página 6 da "Error al cargar pacientes";
  - con "50 / pág" los pacientes del 76 en adelante no se pueden alcanzar;
  - "Mostrando 1–50 de 120" no coincide con lo que se ve.
- **Causa:** el paginador global no tiene `page_size_query_param`.
- **Arreglo:** ver T-01.

**✅ M2-05 · Alto · permisos (multiclínica)** · confirmado
- **Dónde:** `backend/apps/pacientes/serializers.py:58`; `views.py:79`
- **Qué ve el usuario:** nada en pantalla. Pero por API se puede crear un paciente en otra clínica, o moverlo con `PATCH {clinica}`.
- **Causa:** `clinica` es escribible y `perform_create` la respeta.
- **Arreglo:** `clinica` de solo lectura y tomarla siempre de `get_clinica_activa`.

**✅ M2-06 · Alto · previsible** · confirmado
- **Dónde:** `backend/apps/pacientes/registro_publico.py:19-23,114,148,198`; `app/registro/[token]/page.tsx:61-75`
- **Qué ve el usuario:** con una tableta de autorregistro, o con el WiFi de la clínica, después de unos 6 registros por hora aparece **"Enlace no válido o ha expirado"**.
- **Causa:** el límite es de 20 por hora por IP y lo comparten las 3 vistas, y la pantalla muestra el 429 como "enlace no válido".
- **Arreglo:** límite propio de cada vista, más alto, y un mensaje específico para el 429.

**✅ M2-07 · Medio · roles personalizados** · confirmado
- **Dónde:** `backend/apps/pacientes/views.py:106-115`
- **Qué ve el usuario:** "No tienes permiso para consultar los antecedentes", aunque el rol tenga `pacientes.antecedentes.ver`.
- **Causa:** `_can_manage_antecedentes` usa el `user.rol` fijo.
- **Arreglo:** usar `user_is_tenant_admin` y `user_has_permission`.

**✅ M2-08 · Medio · faltante** · confirmado
- **Dónde:** `PacienteForm.tsx:209-224`
- **Qué ve el usuario:** borrar el correo, la dirección o la EPS al editar no se guarda; el valor vuelve a aparecer.
- **Causa:** el payload convierte `''` en `undefined`.
- **Arreglo:** en modo edición, enviar `''`.

**✅ M2-09 · Medio · parámetros/faltante** · confirmado
- **Dónde:** `pacientes/[id]/page.tsx:301,307,499,567`
- **Qué ve el usuario:** "Ver citas", "Nueva cotización" y "Ver todos" (Ingresos) no llegan filtrados por el paciente.
- **Causa:** la agenda, `cotizaciones/nueva` e `ingresos` no leen `?paciente=`.
- **Arreglo:** leer `?paciente=` en esas tres pantallas.

**✅ M2-10 · Medio · llamada sin resolver** · confirmado
- **Dónde:** `pacientes/[id]/page.tsx:196-222` (modales 507, 575, 607 y 648); `[id]/historia/page.tsx:113-118,142`
- **Qué ve el usuario:**
  - sin permiso de cotizaciones, cobros o agenda: "Sin cotizaciones" o "Sin ingresos", aunque existan;
  - ante un error en la historia: "Este paciente aún no tiene historia clínica".
- **Causa:** no se maneja `isError`.
- **Arreglo:** distinguir "error/sin permiso" de "vacío" y ocultar los botones sin permiso.

**✅ M2-11 · Medio · permisos (frontend)** · confirmado
- **Dónde:** `pacientes/page.tsx:296-305`; `[id]/page.tsx:282-284,297-306`; `[id]/historia/page.tsx:222`
- **Qué ve el usuario:** un rol de solo lectura ve "Nuevo paciente", "Cargar masivo", "Editar" y "Tomar foto". Llena todo el formulario y recibe "No tienes permiso".
- **Causa:** no hay `RoleGuard` en `/pacientes/*` ni chequeo de `PACIENTES_CREAR`/`EDITAR`/`FOTO_CONTROL_CAMBIAR`.
- **Arreglo:** ocultar las acciones según el permiso y proteger las rutas.

**✅ M2-12 · Medio · previsible** · confirmado
- **Dónde:** `historia/page.tsx:167`; `components/atenciones/PanelPaciente.tsx:28-35,100`; `components/historia/TabDatosGenerales.tsx:114`
- **Qué ve el usuario:** el Profesional no ve la edad del paciente en la atención; sale "—".
- **Causa:** la edad se calcula con `fecha_nacimiento`, que llega en null por el enmascarado. Además, `new Date('YYYY-MM-DD')` interpreta la fecha en UTC y adelanta el cumpleaños un día.
- **Arreglo:** usar `paciente.edad`, que ya trae la API, y parsear las fechas en hora local.

**✅ M2-13 · Medio · permisos** · confirmado
- **Dónde:** `backend/apps/pacientes/views.py:49-50,179-217,255-264`
- **Qué ve el usuario:** quien solo tiene "ver pacientes" puede registrar consentimientos manuales y subir PDFs legales, sin que se valide el tipo de archivo.
- **Arreglo:** exigir `historia.consentimientos.gestionar` y validar que el archivo sea PDF.

**✅ M2-14 · Medio · permisos** · confirmado
- **Dónde:** `backend/apps/migracion/views.py:16-25,68-72`
- **Qué ve el usuario:** en puesta en marcha, cualquier usuario puede cargar lotes y **revertir lotes ajenos**, lo que borra cobros, citas y cartera.
- **Causa:** `migracion.gestionar` existe pero nunca se revisa.
- **Arreglo:** decidir si exigirlo, al menos para revertir.

**✅ M2-15 · Medio · errores** · confirmado
- **Dónde:** `components/puesta-en-marcha/PacienteEnCursoWizard.tsx:214-217`; `backend/apps/migracion/serializers.py:136`; `puesta-en-marcha/page.tsx`
- **Qué ve el usuario:**
  - toasts con JSON crudo (`{"plan_saldo":[...],"code":[...]}`);
  - textos con voseo ("Corregí", "Podés revertir", "Todavía no cargaste");
  - ante un 403, la lista de lotes dice "Todavía no cargaste…".
- **Arreglo:** extraer un mensaje legible, pasar los textos a español neutro y manejar `isError`.

**✅ M2-16 · Medio · previsible** · probable
- **Dónde:** `backend/apps/migracion/services.py:282-304`
- **Qué ve el usuario:** "No se pudo revertir", o un 500, si después de la carga se registraron pagos o citas que cuelgan de lo migrado.
- **Causa:** `ProtectedError` sin manejar. Tampoco se valida `profesional_id`/`servicio_id` contra la clínica.
- **Arreglo:** revisar las dependencias antes de borrar y responder un 400 que lo explique.

**✅ M2-17 · Medio · previsible/privacidad** · confirmado
- **Dónde:** `backend/apps/pacientes/registro_publico.py:35-56`
- **Qué ve el usuario:**
  - dos familiares con el mismo teléfono no pueden autorregistrarse;
  - con el enlace se puede averiguar si un documento, teléfono o correo ya es paciente.
- **Arreglo:** marcar duplicados solo por documento y responder con un mensaje genérico.

**✅ M2-18 · Bajo · carga** · confirmado
- **Dónde:** `app/registro/[token]/page.tsx:181-188`
- **Qué ve el usuario:** "Registrarme" no muestra spinner y permite el doble envío; el segundo da 500.
- **Arreglo:** pasar `isLoading` al formulario.

**M2-19 · Bajo · errores** · confirmado / probable
- **Dónde:** `backend/apps/pacientes/serializers.py:151,232-233`; `nuevo/page.tsx:56-59`; `editar/page.tsx:51-55`
- **Causa:** el chequeo de duplicados usa `request.user.clinica`, que es null para el superadmin. Una carrera termina en `IntegrityError` 500, y con un 500 en HTML el mensaje que se muestra es "<".
- **Arreglo:** usar `get_clinica_activa`, capturar `IntegrityError` y mostrar un mensaje genérico.

**M2-20 · Bajo · previsible** · confirmado
- **Dónde:** `serializers.py:238-249`
- **Qué ve el usuario:** Recepción puede crear dos fichas con el mismo teléfono o correo sin ningún aviso.
- **Arreglo:** mostrar un aviso no bloqueante de "posible duplicado".

**M2-21 · Bajo · previsible** · confirmado
- **Dónde:** `views.py:117-134`; `components/pacientes/PacienteSearchInput.tsx:34-38,100`
- **Qué ve el usuario:** el buscador rápido no encuentra:
  - por teléfono;
  - por "Gómez Ana" (apellido primero);
  - por "Gomez" sin tilde.

  Además, al buscar por documento y luego crear, el número queda precargado en "Nombres".
- **Arreglo:** buscar por teléfono, usar `unaccent`, buscar por palabras sueltas y manejar `isError`.

**M2-22 · Bajo · previsible** · probable
- **Dónde:** `backend/apps/pacientes/carga_masiva.py:69,73`
- **Qué ve el usuario:** los teléfonos cargados por Excel quedan sin `+57`, y un documento como `1020304050.0` falla.
- **Arreglo:** normalizar el teléfono y el documento.

**M2-23 · Bajo · permisos** · confirmado
- **Dónde:** `views.py:225`
- **Causa:** `verificar_consentimientos` no filtra el tratamiento por clínica, y con un UUID inválido responde 500.

**M2-24 · Bajo · previsible** · probable
- **Dónde:** `components/atenciones/VerificacionFacialContent.tsx:108-110`
- **Qué ve el usuario:** si falla la verificación posterior a la foto, el flujo se cierra sin mensaje.

**M2-25 · Bajo · previsible** · probable
- **Dónde:** `nuevo/page.tsx:110-126,241`
- **Qué ve el usuario:** con la foto de control obligatoria y el servicio facial caído (503), queda atrapado en un diálogo que no se puede cerrar.

**M2-26 · Bajo · faltante** · confirmado
- **Dónde:** `pacientes/page.tsx:169,316-325`; `[id]/page.tsx:79-82,232-234,622-623,765`
- **Qué ve el usuario:**
  - las tarjetas Activos e Inactivos siempre muestran "—";
  - no hay forma de desactivar a un paciente;
  - los contadores se calculan con `results.length` (máximo 25);
  - el vencimiento de los consentimientos se muestra un día antes, por la zona horaria.
- **Además:** `VerificacionFacialSeccion` es código muerto.

## Pruebas no técnicas

Usuarios: Recepción (rol de sistema), Profesional, un rol personalizado con solo "Ver pacientes" y Recepción con el check "atiende pacientes".

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Como Recepción, abrir un paciente con CC → Editar → cambiar la ocupación → Guardar. | Se guarda. | M2-01 |
| 2 | Lo mismo con un paciente con pasaporte y correo. | Se guarda. | M2-01 |
| 3 | Nuevo paciente → llenar todo menos la fecha de nacimiento → Registrar. | Aparece un mensaje claro junto al campo de fecha. | M2-02 |
| 4 | Autorregistro sin fecha de nacimiento. | Indica qué falta. | M2-02 |
| 5 | Agenda → Nueva cita → Crear nuevo paciente con la fecha vacía → Crear y seleccionar. | Se ve un mensaje de error. | M2-03 |
| 6 | Igual, pero con un documento que ya existe. | Dice "Ya existe un paciente con ese documento". | M2-03 |
| 7 | Con más de 60 pacientes: "10 / pág" → ir a la última página; luego "50 / pág" → ir a la última. | Siempre se ven 10 o 50 filas y se llega al último paciente. | M2-04 |
| 8 | Registrar 8 pacientes seguidos por el enlace público desde la misma red. | Todos se registran. | M2-06 |
| 9 | Editar un paciente → borrar el correo → Guardar. | El correo queda vacío. | M2-08 |
| 10 | En la ficha, pulsar "Ver citas" y "Nueva cotización". | Las citas salen filtradas y la cotización trae al paciente. | M2-09 |
| 11 | Con un rol sin cotizaciones → Historial → Cotizaciones de un paciente que sí tiene. | Un aviso de "sin permiso", no "sin cotizaciones". | M2-10 |
| 12 | Con el rol que solo tiene "Ver pacientes" → Pacientes. | No aparecen Nuevo, Cargar masivo ni Editar. | M2-11 |
| 13 | Como Profesional, abrir una atención. | Se ve la edad del paciente. | M2-12 |
| 14 | Como Recepción con "atiende pacientes" → Historia → Antecedentes. | Los ve. | M2-07 |
| 15 | Puesta en marcha → cargar un paciente cuyo plan no cuadra. | Un mensaje legible, sin JSON y sin voseo. | M2-15 |
| 16 | Autorregistrarse con el teléfono de un familiar ya registrado. | Se permite, o se pide hablar con la clínica sin revelar datos. | M2-17 |
| 17 | Autorregistro con conexión lenta → "Registrarme". | Muestra "Guardando…" y no deja pulsar dos veces. | M2-18 |
| 18 | Buscador de la agenda: escribir el celular, o "Gomez" sin tilde. | Encuentra al paciente. | M2-21 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `GET /api/v1/pacientes/?page_size=10`; con 60 pacientes, `?page=6&page_size=10`. | 10 resultados (hoy 25); 200 (hoy 404). | M2-04 |
| 2 | `PATCH /api/v1/pacientes/{id}/ {"clinica":"<otra>"}` como admin. | Se ignora o da 400. | M2-05 |
| 3 | `POST /api/v1/pacientes/` con `clinica` ajena, como Recepción. | Se crea en la clínica propia o da 400. | M2-05 |
| 4 | `POST /api/v1/pacientes/` sin `fecha_nacimiento`. | 400 por campo, y el frontend lo muestra en el campo. | M2-02 |
| 5 | `GET /api/v1/pacientes/{id}/antecedentes/` con `rol=recepcion`, `es_profesional=True` y cita con el paciente. | 200 (hoy 403). | M2-07 |
| 6 | `POST /api/v1/pacientes/{id}/consentimientos/` con solo `pacientes.ver`. | 403 (hoy 201). | M2-13 |
| 7 | `POST /api/v1/migracion/lotes/{id}/revertir/` como Profesional. | Según la decisión de M2-14. | M2-14 |
| 8 | 21 × `GET /api/v1/registro-publico/clinica/?token=…` desde la misma IP. | No debe bloquear el uso normal. | M2-06 |
| 9 | Test de frontend: `PacienteForm` con valores enmascarados y `canEditSensitive=false` → enviar. | Se llama a `onSubmit`. | M2-01 |
| 10 | `GET /api/v1/pacientes/{id}/consentimientos/verificar/?tratamiento=<de otra clínica>` y luego `?tratamiento=abc`. | 404 y 400 (hoy 200 y 500). | M2-23 |
| 11 | `docker exec cliniq_backend python manage.py test apps.pacientes apps.migracion` después de cada arreglo. | Todo en verde. | — |

## Notas

- El backend sí protege contra sobrescribir con asteriscos: `PacienteSerializer.update` descarta los campos sensibles. El fallo de M2-01 está solo en la validación del formulario.
- Los pacientes son de la clínica, no de la sede. Parece intencional.
- `RecordatorioPendienteSerializer` (`agenda/serializers.py:594-595`) expone el teléfono y el correo sin enmascarar. Puede estar justificado, pero es inconsistente.
- `pacientes.antecedentes.editar` solo lo da el check "atiende pacientes". Es así por diseño.

# M0 — Acceso, sesión, usuarios, roles y permisos

**Estado:** Revisado (10/10/2026) · **Sigue:** M1

**Alcance.**
- *Pantallas:* login, recuperar contraseña, interceptores de `lib/api/client.ts`, `authStore`, `AppShell` y guardas de ruta, Configuración → Roles y Usuarios, Equipo → Personal, horarios, Mi perfil y Log de acciones.
- *Backend:* `apps/users` y `apps/colaboradores`.

**Clave para entender los roles.** La palabra "rol" significa cosas distintas en el frontend y en el backend:

| Dónde | Qué guarda `user.rol` | Efecto en roles personalizados |
|---|---|---|
| **Frontend** | El *slug del rol dinámico* (`serializers.py:20-23`). | Los chequeos `rol === 'admin'` del front no rompen los roles personalizados; solo son más restrictivos que los permisos. |
| **Backend** | El *campo oculto legado*. En todo rol personalizado vale `"recepcion"` (`legacy_storage_role`, `serializers.py:56`). | Los chequeos `rol == "x"` del backend tratan a cualquier rol personalizado como Recepción, sin importar sus permisos. |

**Chequeos por rol fijo listados en `permisos.txt`:**
- De los 105, unos 85 son `rol != "superadmin"` y solo acotan a la clínica, así que son inofensivos.
- Los que sí rompen roles personalizados están marcados aquí y en M1, M2, M4 y M6.

**Antes de corregir.**
- **M0-01** saca a todos los usuarios cada ~2 horas.
- Para los chequeos por rol fijo conviene una sola tanda: reemplazar `rol ==`, `IsAdmin`, `IsAdminOrRecepcion` y `es_admin` por `user_is_tenant_admin` o `RequirePermission(...)`. Ver [00-transversal.md](00-transversal.md), T-03.

## Hallazgos

**✅ M0-01 · Crítico · errores** · confirmado
- **Dónde:** `frontend/src/lib/api/client.ts:89-96`.
- **Qué ve el usuario:** cada ~2 horas de uso lo saca al login **sin aviso** y pierde lo que estaba escribiendo.
- **Causa:** `ROTATE_REFRESH_TOKENS` y `BLACKLIST_AFTER_ROTATION` están activos. El interceptor guarda solo `data.access` y no el nuevo `refresh`, así que el segundo refresh falla.
- **Arreglo:** guardar también `data.refresh`.

**✅ M0-02 · Alto · permisos** · confirmado
- **Dónde:** `backend/apps/users/views.py:1017,1040`.
- **Qué ve el usuario:** un usuario desactivado desde la consola **sigue pudiendo entrar**. Al revés, uno reactivado desde Colaborador puede quedar sin acceso.
- **Causa:** `desactivar` y `activar` cambian `activo`, pero el login mira `is_active`.
- **Arreglo:** sincronizar los dos campos, como ya hace `_sync_user_activo`.

**✅ M0-03 · Alto · roles personalizados** · confirmado
- **Dónde:** `backend/apps/pacientes/views.py:46-48,106-111`.
- **Qué ve el usuario:** quien atiende con un rol personalizado (o es Recepción con el check "atiende pacientes") no puede ver los Antecedentes ni de sus propios pacientes. Es el mismo problema que M2-07.
- **Causa:** se exige el rol oculto admin o profesional, y el check da `antecedentes.editar` pero no `antecedentes.ver`.
- **Arreglo:** chequear por permisos y agregar `.ver` a `PERMISOS_ATIENDE_PACIENTES`.

**✅ M0-04 · Alto · roles personalizados** · confirmado
- **Dónde:** `backend/apps/configuracion/views.py:135,184,257,292,327,365`; `clinicas/views.py:121`.
- **Qué ve el usuario:** con "Editar datos de la clínica" ve Pasos de recepción, Biometría, Otros documentos, Registro de pacientes, Signos vitales y Plantillas, pero **al guardar falla**. Es el mismo problema que M1-07.
- **Causa:** el PATCH usa `IsAdmin`.
- **Arreglo:** `RequirePermission("clinicas.editar")`.

**✅ M0-05 · Alto · roles personalizados** · confirmado
- **Dónde:** `backend/apps/protocolos/views.py:51`; `users/permissions.py:81-92`.
- **Qué ve el usuario:** cualquier rol personalizado, aunque solo vea la agenda, puede crear y editar protocolos de tratamiento.
- **Causa:** `IsAdminOrRecepcion` acepta el rol oculto `"recepcion"`.
- **Arreglo:** usar una clave de permiso concreta.

**✅ M0-06 · Alto · permisos (escalada)** · confirmado
- **Dónde:** `backend/apps/users/serializers.py:16-17,62-96`; `users/views.py:676-772`.
- **Qué ve el usuario:** con "Crear y editar usuarios" puede **ponerse a sí mismo de Administrador**. Con "Gestionar roles" puede darse todos los permisos editando su propio rol.
- **Arreglo:** que solo un admin pueda asignar el rol admin, y prohibir editar el usuario propio y el rol propio.

**✅ M0-07 · Alto · permisos** · confirmado
- **Dónde:** `equipo/personal/page.tsx:231-259,325,395,428`; `EquipoShell.tsx:8`; `users/views.py:793`.
- **Qué ve el usuario:**
  - con "Ver usuarios": "Error al cargar colaboradores";
  - con "Ver colaboradores": botones que terminan en error;
  - "Reenviar invitación" falla sin decir por qué.
- **Causa:** la guarda usa `usuarios.ver`, pero los datos exigen `colaboradores.ver`; reenviar exige `IsAdmin`; el frontend no lee `detail`.
- **Arreglo:** alinear las claves y leer `detail`.

**✅ M0-08 · Alto · roles personalizados** · confirmado
- **Dónde:** `backend/apps/colaboradores/views.py:318-327`.
- **Qué ve el usuario:** Recepción, o un rol con "Gestionar horarios", ve vacío el horario de un profesional ("Igual a la sede"). Al cambiar un día que ya existe le sale un error de duplicado.
- **Causa:** sin rol admin, solo se listan los horarios propios.
- **Arreglo:** filtrar según el permiso.

**✅ M0-09 · Alto · permisos** · confirmado
- **Dónde:** `configuracion/layout.tsx:9`; `AppShell.tsx:71`.
- **Qué ve el usuario:** con solo "Gestionar campañas" ve "Promociones" en el menú, pero al entrar **vuelve al Dashboard sin explicación**. Lo mismo pasa en Cajas, Plantillas y Formas de pago. Es el mismo problema que M1-06.
- **Arreglo:** que la guarda deje entrar si hay al menos una categoría visible (`categoriasVisibles(user).length > 0`).

**✅ M0-10 · Medio · roles personalizados** · confirmado
- **Dónde:** `navegacion.ts:201`; `permissions_catalog.py:640-644`.
- **Qué ve el usuario:** con "Gestionar formas de pago" nunca ve esa pantalla.
- **Causa:** el menú pide `configuracion.formas_pago.ver`, que ninguna capacidad otorga.

**✅ M0-11 · Medio · parámetros** · confirmado
- **Dónde:** `log-acciones/page.tsx:245`; `backend/apps/core/views.py:30-31`.
- **Qué ve el usuario:** al escribir un nombre en el filtro "Usuario" aparece "No hay registros".
- **Causa:** el texto se envía como `usuario_id` y el backend responde 500.
- **Arreglo:** buscar por nombre o usar un selector de usuario.

**✅ M0-12 · Medio · parámetros** · confirmado
- **Dónde:** `log-acciones/page.tsx:27,243`; `equipo/personal/page.tsx:344`.
- **Qué ve el usuario:**
  - el Log dice "1–50 de 73" pero muestra 25, y no se llega al registro 51;
  - en Equipo aparecen solo 25 personas.
- **Arreglo:** ver T-01.

**✅ M0-13 · Alto · previsible** · confirmado
- **Dónde:** `backend/apps/users/serializers.py:447-474`; `perfil/page.tsx:80-93`; `AvisoDatosProfesionales.tsx:14`.
- **Qué ve el usuario:**
  - aunque ya cargó su firma, aparece "Carga tu firma";
  - en Mi perfil el teléfono sale vacío;
  - si cambia su nombre, **se borra el teléfono**.
- **Causa:** el payload del login no trae `telefono`, `firma_digital_url`, `registro_profesional` ni `created_at`.
- **Arreglo:** que el login devuelva lo mismo que `/auth/me/`, o llamar a `loadUser()` después del login.

**✅ M0-14 · Medio · errores** · confirmado
- **Dónde:** `frontend/src/store/authStore.ts:84-90`.
- **Qué ve el usuario:** si recarga la página con mala conexión, se cierra la sesión.
- **Arreglo:** cerrar sesión solo ante un 401 o 403.

**✅ M0-15 · Medio · errores** · confirmado
- **Dónde:** `components/shared/QueryProvider.tsx:9-16`.
- **Qué ve el usuario:** los errores se ven distintos en cada pantalla, o no se ven.
- **Arreglo:** ver T-02.

**✅ M0-16 · Medio · errores** · confirmado
- **Dónde:** `configuracion/roles/page.tsx:28-41,313-320,446-449`.
- **Qué ve el usuario:**
  - crear un rol llamado "Recepción" o "Admin" da "Error al guardar el rol" sin explicación;
  - con un nombre de una letra, el botón no hace nada;
  - si falla la asignación de permisos, el rol queda creado vacío.
- **Arreglo:** generar el slug en el backend, mostrar el error en el campo Nombre y hacerlo en una sola llamada.

**✅ M0-17 · Medio · carga** · confirmado
- **Dónde:** `configuracion/roles/page.tsx:397-398,537-547,603-606`.
- **Qué ve el usuario:** "Cargando capacidades…" infinito, o "Sin roles configurados" cuando en realidad hubo un error.

**✅ M0-18 · Medio · permisos** · confirmado
- **Dónde:** `backend/apps/users/views.py:958-976`; `perfil/page.tsx:104-112,232`.
- **Qué ve el usuario:**
  - cambia la contraseña **sin que le pida la actual**;
  - no se valida que sea fuerte;
  - no recibe confirmación;
  - un rol personalizado con "editar usuarios" no puede cambiar la contraseña de otros.
- **Arreglo:** pedir la contraseña actual, validar la fortaleza, mostrar un toast y usar `usuarios.editar`.

**M0-19 · Bajo · errores** · confirmado
- **Dónde:** `backend/apps/users/views.py:500-501`.
- **Causa:** `MeView.patch` descarta los errores de cada campo y muestra un mensaje genérico.

**✅ M0-20 · Medio · carga** · confirmado
- **Dónde:** `dashboard/page.tsx:667-722`; `lib/permissions.ts:198,267-271`.
- **Qué ve el usuario:** un rol sin reportes entra a un Dashboard que muestra **"0 citas hoy"**.
- **Arreglo:** decidir la pantalla de aterrizaje según los permisos y condicionar los indicadores.

**✅ M0-21 · Bajo · roles personalizados** · confirmado
- **Dónde:** `lib/permissions.ts:224-225`.
- **Qué ve el usuario:** tener `reportes.ver_financieros` no muestra el Resumen/P&L. Es el mismo problema que M6-12.

**✅ M0-22 · Medio · roles personalizados** · confirmado
- **Dónde:** `historia_clinica/serializers.py:147`; `views.py:596`.
- **Qué ve el usuario:** quien atiende con un rol personalizado puede escribir en citas ajenas, y el Profesional de sistema no. Es el mismo problema que M4-12.

**✅ M0-23 · Medio · roles personalizados** · confirmado
- **Dónde:** `historia_clinica/views.py:78-82,951`.
- **Qué ve el usuario:** solo el admin, o un rol con el slug exacto "coordinador", puede crear plantillas de órdenes. Es el mismo problema que M1-08.

**✅ M0-24 · Medio · roles personalizados** · confirmado
- **Dónde:** `caja/views.py:302`.
- **Qué ve el usuario:** un rol con "Editar gastos" solo puede editar los gastos que él mismo registró.
- **Causa:** usa `user.es_admin`.

**✅ M0-25 · Medio · roles personalizados** · confirmado
- **Dónde:** `components/colaboradores/ColaboradorDialog.tsx:492-505,603-614`.
- **Qué ve el usuario:** con "Gestionar colaboradores" pero sin "Gestionar roles", el selector de Rol sale vacío y no puede crear colaboradores.
- **Además:** quedan `console.log` con los payloads.
- **Arreglo:** exponer los roles asignables con `colaboradores.gestionar`.

**M0-26 · Bajo · previsible** · confirmado
- **Dónde:** `equipo/personal/page.tsx:289-290,404,422`.
- **Qué ve el usuario:** los contadores y el filtro "Profesionales" ignoran a los admin y a los roles personalizados que atienden.

**M0-27 · Bajo · previsible** · confirmado
- **Dónde:** `perfil/page.tsx:132`.
- **Qué ve el usuario:** el rol aparece como "prueba-sede-unica" en lugar del nombre.
- **Arreglo:** usar `role_nombre`.

**✅ M0-28 · Bajo · errores** · confirmado
- **Dónde:** `components/shared/AuthGuard.tsx:36-39`.
- **Qué ve el usuario:** cuando vence la sesión aparece el login sin ninguna explicación.
- **Arreglo:** toast "Tu sesión venció".

**M0-29 · Bajo · previsible** · confirmado
- **Dónde:** `backend/apps/users/views.py:181-184`.
- **Qué ve el usuario:** intentar entrar a una clínica inactiva cierra la sesión abierta en otro equipo.

**✅ M0-30 · Bajo · permisos** · confirmado
- **Dónde:** `navegacion.ts:226-231`.
- **Qué ve el usuario:** con "Ver usuarios" ve Grupos de atención, pero al guardar falla, porque guardar exige `colaboradores.gestionar`.

## Pruebas no técnicas

**Preparación:** crear el rol personalizado "Auxiliar" en Configuración → Roles y un usuario con ese rol y el check "atiende pacientes". En cada prueba se le agregan o quitan capacidades.

| # | Pasos | Resultado esperado | Valida |
|---|---|---|---|
| 1 | Iniciar sesión y usar la app de vez en cuando durante 2 h 15 min. | Sigue dentro, sin que lo saque. | M0-01 |
| 2 | Desactivar un usuario desde la consola e intentar entrar con él. | "Tu cuenta está desactivada". | M0-02 |
| 3 | Como "Auxiliar", abrir la historia de un paciente → Antecedentes. | Los ve y los edita. | M0-03 |
| 4 | Dar a "Auxiliar" "Editar datos de la clínica" → Configuración → Recepción → cambiar un paso → Guardar. | Se guarda. | M0-04 |
| 5 | Con "Auxiliar" solo con "Ver la agenda", intentar crear un protocolo. | No puede. | M0-05 |
| 6 | Dar a "Auxiliar" "Crear y editar usuarios" → editarse a sí mismo y elegir Administrador. | No lo permite. | M0-06 |
| 7 | Dar a "Auxiliar" solo "Ver usuarios" → Configuración → Usuarios. | Ve la lista, sin errores y sin botones que no pueda usar. | M0-07 |
| 8 | Como Recepción, abrir un profesional con horario especial. | Ve su horario real. | M0-08 |
| 9 | Dar a "Auxiliar" solo "Gestionar campañas" → clic en "Promociones". | Se abre la pantalla. | M0-09 |
| 10 | Dar a "Auxiliar" "Gestionar formas de pago". | Ve Formas de pago. | M0-10 |
| 11 | Log de acciones → escribir un nombre en "Usuario". | Filtra o avisa. | M0-11 |
| 12 | Recorrer todas las páginas del Log, con más de 50 registros. | Se llega a todos. | M0-12 |
| 13 | Profesional con firma y teléfono: salir, entrar, cambiar el apellido, guardar y recargar. | No pide la firma y el teléfono sigue. | M0-13 |
| 14 | Con la app abierta, apagar el WiFi, pulsar F5 y volver a prender el WiFi. | No lo saca del sistema. | M0-14 |
| 15 | Crear un rol "Recepción" y otro "A". | Un mensaje claro en el campo Nombre. | M0-16 |
| 16 | Mi perfil → cambiar la contraseña a "12345678". | Pide la contraseña actual o rechaza la clave débil; confirma si se cambió. | M0-18 |
| 17 | Entrar con "Auxiliar" sin permisos de reportes. | Llega a una pantalla útil, no a un Dashboard en ceros. | M0-20 |
| 18 | Dar a "Auxiliar" "Gestionar colaboradores" → Nuevo colaborador. | El selector de Rol tiene opciones. | M0-25 |

## Pruebas técnicas

| # | Verificación | Esperado | Valida |
|---|---|---|---|
| 1 | `POST /api/v1/auth/refresh/` dos veces con el mismo refresh. | La segunda da 401: el frontend debe usar el refresh nuevo. | M0-01 |
| 2 | `POST /usuarios/{id}/desactivar/` y luego `POST /auth/login/`. | 403 `ACCOUNT_DISABLED` (hoy 200). | M0-02 |
| 3 | `GET /pacientes/{id}/antecedentes/` con `prueba.sede.unica@beautyclinic.test`. | 200 (hoy 403, verificado). | M0-03 |
| 4 | `PATCH /configuracion/wizard/` (y facial, cartera, registro-publico, signos-vitales) con un rol personalizado que tenga `clinicas.editar`. | 200 (hoy 403). | M0-04 |
| 5 | `POST /protocolos/...` con un rol personalizado sin permisos clínicos. | 403 (hoy 201). | M0-05 |
| 6 | `PATCH /usuarios/{self}/ {"rol":"admin"}` con `usuarios.editar`. | 403 (hoy 200). | M0-06 |
| 7 | `GET /colaboradores/horarios/?colaborador=<otro>` como Recepción. | Devuelve los horarios (hoy `[]`). | M0-08 |
| 8 | `GET /core/log-acciones/?usuario=Maria`. | 200 o 400 (hoy 500, verificado). | M0-11 |
| 9 | `GET /core/log-acciones/?page_size=50`. | 50 resultados (hoy 25, verificado). | M0-12 |
| 10 | Comparar las claves de `POST /auth/login/` → `user` con las de `GET /auth/me/`. | Son iguales. | M0-13 |
| 11 | `POST /usuarios/{id}/reenviar_invitacion/` con `usuarios.editar`. | 200 (hoy 403 `{detail}`). | M0-07 |
| 12 | Test de Django: un `Rol(es_sistema=False)` con `es_profesional=True` recorriendo los endpoints de arriba. | El resultado depende de los permisos, no de `user.rol`. | T-03 |

## Notas

- **M0-01** se confirmó leyendo simplejwt 5.3.1 en el contenedor y la configuración. No se ejecutó porque escribe en la lista negra de tokens.
- **Rutas sin guarda en el frontend:** agenda, pacientes, catálogo, cotizaciones, ventas, cartera, seguimiento y puesta en marcha dependen solo de la protección del backend.
- **Permisos que el backend no revisa:** `migracion.gestionar`, `sedes.ver`, `caja.categorias.ver`, `caja.gastos.aprobar` y `configuracion.formas_pago.ver` (según `permisos.txt`).

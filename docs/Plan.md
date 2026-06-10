# Plan de trabajo — Sistema de gestión clínica estética
> Proyecto: Clínica Dra. Maroly González | Stack: Django 5 + Next.js 15 + PostgreSQL + MinIO + n8n | Infra: Docker + Dokploy + Contabo/Hostinger

---

## Cómo usar este documento

Cada tarea tiene un bloque `### Prompt para AI` listo para copiar a Claude, Copilot o Codex.
Antes de copiar cualquier prompt, lee la sección **Convenciones globales** — el AI debe conocerlas para generar código consistente.
Marca cada tarea con `[x]` cuando esté completa y en producción, no solo cuando el código esté escrito.
Cuando una tarea tenga backend y frontend, ejecuta primero backend, luego frontend, y valida el contrato entre ambos antes de marcarla como terminada.
Referencias derivadas: `plan-backend.md` para el carril backend y `plan-frontend.md` para el carril frontend.

---

## Convenciones globales del proyecto

> **Pega esto al inicio de cada sesión con el AI antes de cualquier prompt de tarea.**

```
Proyecto: Sistema de gestión para clínica estética (Django 5 + DRF + Next.js 15 + PostgreSQL 16 + MinIO + n8n)

STACK BACKEND:
- Django 5.0, Python 3.12, DRF 3.15, SimpleJWT, django-filter
- Integración con n8n para automatizaciones, recordatorios y flujos programados del MVP
- psycopg2 + pgvector para PostgreSQL
- django-storages + boto3 para MinIO (S3-compatible)
- WeasyPrint para PDFs
- python-decouple para variables de entorno

STACK FRONTEND:
- Next.js 15 App Router, TypeScript estricto
- Tailwind CSS + shadcn/ui
- TanStack Query v5 para server state
- Zustand para UI state
- React Hook Form + Zod para formularios
- Recharts para gráficas
- axios para HTTP

CONVENCIONES DJANGO:
- UUIDs como primary keys en todos los modelos (default=uuid.uuid4, editable=False)
- Todos los modelos tienen created_at y updated_at (auto_now_add / auto_now)
- AUTH_USER_MODEL = "users.User" — nunca usar el User de Django directamente
- Serializers siempre en apps/<app>/serializers.py
- Viewsets en apps/<app>/views.py, rutas en apps/<app>/urls.py con DefaultRouter
- Permisos siempre explícitos en cada ViewSet — nunca confiar en el default global
- Soft delete con campo activo=BooleanField en lugar de DELETE real en todos los modelos funcionales. Evitar `DELETE` físico salvo tokens efímeros o tablas puramente técnicas.
- NUNCA borrar registros de historia clínica, notas clínicas ni consentimientos — modelos inmutables
- Todas las respuestas de error en formato {"error": "mensaje", "code": "ERROR_CODE"}
- Usar django-filter para filtros en listados, nunca filtrar en el queryset manualmente
- Los managers personalizados van en apps/<app>/managers.py
- Para el MVP, evitar workers internos: si una automatización puede resolverse con webhook/API y n8n, no introducir Celery

CONVENCIONES FRONTEND:
- Componentes en PascalCase, hooks en camelCase con prefijo "use"
- Todas las llamadas API van por /src/lib/api/<recurso>.ts — nunca fetch directo en componentes
- Types/interfaces en /src/types/<recurso>.ts
- Constantes globales en /src/lib/constants.ts
- Nunca hardcodear URLs — usar NEXT_PUBLIC_API_URL del .env
- Formularios siempre con React Hook Form + Zod, nunca estado manual
- Tablas de datos siempre con TanStack Table
- Para el MVP de auth en frontend, usar access token en memoria + refresh token en cookie segura gestionada por backend; no usar localStorage

SEGURIDAD:
- Consentimientos y notas clínicas: solo INSERT, nunca UPDATE/DELETE
- Todas las rutas protegidas con JWT — el middleware verifica en cada request
- URLs de MinIO siempre firmadas con expiración, nunca públicas
- Variables sensibles solo en .env, nunca en el código

ESTRUCTURA DE CARPETAS BACKEND:
clinica/
  backend/
    config/
      settings/
        base.py, development.py, production.py
      urls.py, wsgi.py
    apps/
      users/          — User custom, autenticación
      clinicas/       — Clinica, Sede, Servicio
      colaboradores/  — Colaborador, contrato
      pacientes/      — Paciente, ficha básica
      agenda/         — Cita, BloqueoAgenda, ConfirmacionToken
      historia_clinica/ — HistoriaClinica, NotaClinica, FotoClinica
      consentimientos/  — PlantillaConsentimiento, Consentimiento
      cobros/         — Cobro, ItemCobro, PagoRecibido
      inventario/     — Insumo, CategoriaInsumo, MovimientoInventario
      proveedores/    — Proveedor, OrdenCompra, ItemOrdenCompra
      comisiones/     — ReglaComision, LiquidacionComision, ItemComision
      notificaciones/ — canal de envío SMS/WA, log de mensajes
      caja/           — GastoCaja, CategoriaGasto, CierreCaja
      reportes/       — solo lógica de queries para dashboard
    requirements/
      base.txt, dev.txt, prod.txt
    templates/        — HTML para WeasyPrint (consentimientos, recibos)
    Dockerfile

ESTRUCTURA DE CARPETAS FRONTEND:
clinica/
  frontend/
    src/
      app/            — App Router (páginas y layouts)
        (auth)/       — login, recuperar contraseña
        (dashboard)/  — layout protegido
          agenda/
          pacientes/
          historia-clinica/
          cobros/
          inventario/
          proveedores/
          comisiones/
          colaboradores/
          caja/
          reportes/
          configuracion/
      components/
        ui/           — componentes shadcn (no editar)
        shared/       — componentes reutilizables propios
        agenda/       — componentes específicos del módulo
        pacientes/
        ... (un folder por módulo)
      lib/
        api/          — funciones de llamada a la API por módulo
        constants.ts
        utils.ts
      types/          — interfaces TypeScript por módulo
      hooks/          — hooks custom compartidos
      store/          — stores de Zustand
    Dockerfile
```

---

## Arquitectura de referencia

```
Internet
    │
    ▼
Cloudflare (CDN + DNS)
    │
    ▼
Traefik (reverse proxy + TLS automático)
    ├── app.dominio.com      → frontend (Next.js :3000)
    ├── app.dominio.com/api  → backend (Django/Gunicorn :8000)
    └── storage.dominio.com  → MinIO (:9000)

Backend internos (red Docker `clinica_net`):
    Django ←→ PostgreSQL 16
    Django ←→ MinIO (fotos, PDFs)
    Django ←→ n8n Webhook/API (automatizaciones y recordatorios)

Externos:
    Django → Evolution API (WhatsApp)
    Django → Mensatek/Twilio (SMS)
    Django → Resend (email)
```

### Variables de entorno de email

Para SMTP con Resend, el backend usa estas variables:

- `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`
- `EMAIL_HOST=smtp.resend.com`
- `EMAIL_PORT=465`
- `EMAIL_HOST_USER=resend`
- `EMAIL_HOST_PASSWORD=<smtp-password-de-resend>`
- `EMAIL_USE_TLS=False`
- `EMAIL_USE_SSL=True`
- `EMAIL_TIMEOUT=10`
- `DEFAULT_FROM_EMAIL=CliniQ <no-reply@noreply.2asoft.tech>`
- `SERVER_EMAIL=CliniQ <no-reply@noreply.2asoft.tech>`

`EMAIL_HOST_PASSWORD` debe vivir solo en `.env`.

---

## Hitos y orden de ejecución

| Hito | Nombre | Depende de |
|------|--------|-----------|
| H1 | Infraestructura y base del proyecto | — |
| H2 | Autenticación y usuarios | H1 |
| H3 | Clínicas, sedes y servicios | H2 |
| H4 | Colaboradores | H3 |
| H5 | Pacientes | H3 |
| H6 | Agenda y citas | H4, H5 |
| H7 | Confirmación de citas (multicanal) | H6 |
| H8 | Historia clínica | H5, H6 |
| H9 | Consentimientos informados | H8 |
| H10 | Categorías y catálogo de insumos | H3 |
| H11 | Proveedores y órdenes de compra | H10 |
| H12 | Inventario y kardex | H11 |
| H13 | Cobros en cita | H6, H12 |
| H14 | Caja menor y cierre diario | H13 |
| H15 | Comisiones | H4, H13 |
| H16 | Control de asistencia de pacientes | H6 |
| H17 | Reportes y dashboard | H13, H14, H15 |
| H18 | QA, ajustes finales y go-live | todos |

---

## Vista por stream: backend y frontend

Este plan se ejecuta en dos carriles coordinados:

**Carril backend**
- H1 infraestructura y settings
- H2 auth y permisos
- H3 entidades maestras: clínicas, sedes, servicios
- H4 colaboradores
- H5 pacientes
- H6 agenda y reglas de disponibilidad
- H7 confirmación multicanal
- H8 historia clínica
- H9 consentimientos
- H10-H16 operación: inventario, compras, cobros, caja, comisiones, asistencia
- H17 reportes
- H18 hardening y go-live

**Carril frontend**
- H2.4 login y layout protegido
- H5.3 pacientes
- H6.4 agenda
- H7 página pública de confirmación y acciones manuales
- H8.3 historia clínica
- H17.2 dashboard

**Relación entre ambos**
- Ninguna pantalla debe arrancarse sin endpoint estable, serializer definido y ejemplos de payload/respuesta.
- Cada hito funcional se considera completo cuando backend, frontend y validación del flujo completo están listos.
- Si un hito solo requiere backend por ahora, dejar explícito el contrato listo para consumir después desde frontend.

## Matriz de dependencia backend ↔ frontend

| Hito funcional | Backend primero | Frontend después | Contrato mínimo que debe existir |
|------|------|------|------|
| Auth | H2.1, H2.2, H2.3 | H2.4 | `/api/v1/auth/login/`, `/me/`, `/refresh/`, `/logout/` |
| Pacientes | H5.1, H5.2 | H5.3 | CRUD + `buscar/` |
| Agenda | H4.2, H6.1, H6.2, H6.3 | H6.4 | CRUD citas + `slots_disponibles/` + `profesionales/` |
| Confirmación | H7.1 | H7.1 | endpoint público de detalle + endpoint público de confirmar |
| Notificaciones email | H7.1 | cuando frontend lo consuma | `/api/v1/notificaciones/emails/config/`, `/api/v1/notificaciones/emails/enviar/` |
| Historia clínica | H8.1, H8.2 | H8.3 | retrieve historia + list/create notas + create fotos |
| Dashboard | H17.1 | H17.2 | KPIs y agregados listos para cards/tablas |

---

## H1 — Infraestructura y base del proyecto

### H1.1 — Estructura de carpetas y archivos base

**Archivos que se crean:**
`docker-compose.yml`, `.env.example`, `backend/Dockerfile`, `frontend/Dockerfile`, `backend/config/settings/base.py`, `backend/config/settings/development.py`, `backend/config/settings/production.py`, `backend/config/urls.py`, `backend/requirements/base.txt`

**Definition of done:**
- [x] `docker-compose up` levanta todos los servicios sin errores
- [x] Django responde en `localhost:8000/admin`
- [x] Next.js responde en `localhost:3000`
- [x] PostgreSQL acepta conexiones desde Django
- [x] MinIO accesible en `localhost:9001`

### Prompt para AI
```
Usando las convenciones globales del proyecto, genera la estructura completa de archivos de arranque para el sistema de gestión de clínica estética.

Necesito:
1. docker-compose.yml con servicios: db (pgvector/pgvector:pg16), backend (Django), frontend (Next.js), minio, n8n, traefik. Todos en red `clinica_net`. Healthcheck en db.
2. .env.example con todas las variables necesarias comentadas por sección: Django, DB, MinIO, JWT, n8n, WhatsApp/Evolution, SMS/Mensatek, Email/Resend, Wompi (opcional futuro)
3. backend/Dockerfile multistage: base → development → production. En producción usa gunicorn con 3 workers gthread. Incluir dependencias del sistema para WeasyPrint (libcairo2, libpango, libgdk-pixbuf2.0-0)
4. frontend/Dockerfile multistage: deps → development → builder → production (standalone Next.js)
5. config/settings/base.py completo con: INSTALLED_APPS (django_apps + third_party + local_apps), DATABASES, REST_FRAMEWORK con JWT auth y paginación de 25, SIMPLE_JWT con access 60min y refresh 7 días, CORS, storage MinIO con URLs firmadas privadas, TIME_ZONE="America/Bogota", LANGUAGE_CODE="es-co"
6. Configurar variables de integración para n8n (base URL, secret/token, webhook endpoints) sin acoplar lógica de negocio a n8n dentro de settings
7. requirements/base.txt con versiones fijas de todas las dependencias listadas en las convenciones del MVP, excluyendo Celery y django-celery-beat

No incluyas comentarios obvios. El código debe ser production-ready desde el inicio.
```

Contrato adicional ya entregado para frontend:

- variables `EMAIL_*` documentadas en `.env.example`
- SMTP de Resend configurado desde settings
- endpoints:
  - `GET /api/v1/notificaciones/emails/config/`
  - `POST /api/v1/notificaciones/emails/enviar/`

---

### H1.2 — Apps Django vacías con estructura base

**Archivos que se crean:**
`apps/<app>/__init__.py`, `apps/<app>/models.py`, `apps/<app>/serializers.py`, `apps/<app>/views.py`, `apps/<app>/urls.py`, `apps/<app>/admin.py` para cada una de las 14 apps.

**Definition of done:**
- [x] `python manage.py migrate` corre sin errores
- [x] Todas las apps aparecen en `python manage.py showmigrations`

### Prompt para AI
```
Usando las convenciones globales, crea la estructura base de las siguientes apps Django (todas vacías pero con archivos correctamente configurados):
users, clinicas, colaboradores, pacientes, agenda, historia_clinica, consentimientos, cobros, inventario, proveedores, comisiones, notificaciones, caja, reportes

Para cada app genera:
- models.py con solo el import y un comentario del propósito de la app
- serializers.py vacío con imports de drf
- views.py vacío con ViewSet base importado
- urls.py con DefaultRouter vacío
- admin.py registrando el site
- apps.py con AppConfig correcto (label único, default_auto_field BigAutoField)

En config/urls.py incluye todos los include() con prefijo api/v1/<nombre-app>/, excepto auth que debe quedar agrupado explícitamente bajo api/v1/auth/

Recuerda: AUTH_USER_MODEL = "users.User" va en settings antes de que cualquier otra app lo referencie.
```

---

## H2 — Autenticación y usuarios

### H2.1 — Modelo User personalizado y roles

**Archivos que se tocan:** `apps/users/models.py`, `apps/users/admin.py`, migración inicial

**Definition of done:**
- [x] `python manage.py createsuperuser` funciona
- [x] User tiene campos: id (UUID), rol, clinica, telefono, foto_perfil, activo
- [x] Roles: superadmin, admin, profesional, recepcion
- [x] Admin de Django muestra el User correctamente

### Prompt para AI
```
Usando las convenciones globales, crea el modelo User personalizado en apps/users/models.py.

Requisitos:
- Extiende AbstractUser
- id: UUIDField primary key, default=uuid.uuid4, editable=False
- rol: CharField con choices Rol(TextChoices): superadmin, admin, profesional, recepcion
- clinica: ForeignKey a "clinicas.Clinica" on_delete=PROTECT, null=True, blank=True (null porque superadmin no tiene clínica)
- telefono: CharField max 20, blank=True
- foto_perfil: ImageField upload_to="perfiles/", null=True, blank=True
- activo: BooleanField default=True
- created_at, updated_at: auto_now_add y auto_now
- Meta: db_table="users", ordering=["last_name", "first_name"]
- Property: es_admin (True si rol in [admin, superadmin])
- Property: es_profesional (True si rol == profesional)

En admin.py registra UserAdmin personalizado que muestre: email, rol, clinica, activo en list_display. Agrega list_filter por rol y activo.

Genera también la migración 0001_initial.
```

---

### H2.2 — Endpoints de autenticación JWT

**Archivos que se tocan:** `apps/users/serializers.py`, `apps/users/views.py`, `apps/users/urls.py`

**Definition of done:**
- [x] `POST /api/v1/auth/login/` devuelve access + refresh token
- [x] `POST /api/v1/auth/refresh/` renueva el access token
- [x] `POST /api/v1/auth/logout/` invalida el refresh token
- [x] `GET /api/v1/auth/me/` devuelve datos del usuario autenticado
- [x] `PATCH /api/v1/auth/me/` permite actualizar telefono y foto_perfil

### Prompt para AI
```
Usando las convenciones globales, implementa los endpoints de autenticación JWT en apps/users/.

Endpoints requeridos:
1. POST /login/ — recibe email + password, devuelve {access, refresh, user: {id, email, nombre_completo, rol, clinica_id, clinica_nombre}}. Usa TokenObtainPairSerializer de SimpleJWT extendido para incluir los datos del user en la respuesta.
2. POST /refresh/ — usa TokenRefreshView de SimpleJWT directamente
3. POST /logout/ — recibe {refresh} y lo agrega a la blacklist (SimpleJWT blacklist app debe estar instalada)
4. GET /me/ — devuelve el usuario autenticado con todos sus campos. Permiso: IsAuthenticated
5. PATCH /me/ — actualiza solo telefono y foto_perfil del usuario actual. Usa serializer separado MeUpdateSerializer.

Serializer LoginResponseSerializer debe incluir en el user: id, email, first_name, last_name, nombre_completo (property), rol, clinica_id, clinica_nombre (método).

Todos los errores en formato {"error": "mensaje", "code": "CODIGO"}.
Nunca devolver el password en ninguna respuesta.
```

---

### H2.3 — Permisos granulares por rol

**Archivos que se crean:** `apps/users/permissions.py`

**Definition of done:**
- [x] Clases de permiso cubren todos los roles definidos
- [x] Test manual: un usuario recepcion no puede acceder a endpoints de admin

### Prompt para AI
```
Crea apps/users/permissions.py con clases de permiso DRF reutilizables para el proyecto de clínica estética.

Clases requeridas (todas extienden BasePermission):
- IsSuperAdmin: rol == superadmin
- IsAdmin: rol in [admin, superadmin]
- IsProfesional: rol == profesional
- IsRecepcion: rol == recepcion
- IsAdminOrProfesional: rol in [admin, superadmin, profesional]
- IsAdminOrRecepcion: rol in [admin, superadmin, recepcion]
- IsSameClinica: el objeto accedido pertenece a la misma clinica del usuario (para multi-clinica). Verifica obj.clinica_id == request.user.clinica_id. Superadmin siempre True.
- IsSameSede: similar pero para sede. Verifica obj.sede_id == request.user.colaborador.sede_principal_id cuando el usuario tenga colaborador asociado. Superadmin siempre True.

Cada clase debe tener message descriptivo en español.
Añade también mixin HasClinicamente que se usa en ViewSets para filtrar automáticamente el queryset a la clinica del usuario si no es superadmin:
  def get_queryset(self):
      qs = super().get_queryset()
      if not self.request.user.rol == 'superadmin':
          qs = qs.filter(clinica=self.request.user.clinica)
      return qs
```

---

### H2.4 — Frontend: pantalla de login

**Archivos que se tocan:** `src/app/(auth)/login/page.tsx`, `src/lib/api/auth.ts`, `src/types/auth.ts`, `src/store/authStore.ts`, `src/hooks/useAuth.ts`

**Definition of done:**
- [x] Login funciona con credenciales reales
- [x] Access token en memoria del cliente y refresh token persistido en cookie segura del backend
- [x] Redirección a /dashboard tras login exitoso
- [x] Error visible si credenciales incorrectas
- [x] Ruta /login redirige a /dashboard si ya está autenticado

### Prompt para AI
```
Implementa el flujo de autenticación completo en el frontend Next.js 15 con App Router.

1. src/types/auth.ts — interfaces: User {id, email, first_name, last_name, nombre_completo, rol, clinica_id, clinica_nombre}, AuthTokens {access, refresh}, LoginResponse {access, refresh, user: User}

2. src/lib/api/auth.ts — funciones:
   - login(email, password): POST /api/v1/auth/login/
   - logout(refresh): POST /api/v1/auth/logout/
   - refreshToken(refresh): POST /api/v1/auth/refresh/
   - getMe(): GET /api/v1/auth/me/
   Usa axios desde src/lib/axios.ts (que debes crear con baseURL=NEXT_PUBLIC_API_URL, withCredentials=true, interceptor que agrega Bearer token desde memoria y un interceptor de respuesta que intenta refresh automático si recibe 401)

3. src/store/authStore.ts — Zustand store con: user (User|null), setUser, clearUser, isAuthenticated (getter)

4. src/app/(auth)/login/page.tsx — formulario con React Hook Form + Zod:
   - Schema: email (email válido) + password (min 6 chars)
   - Usa componentes de shadcn/ui: Card, Input, Button, Form
   - Muestra error de API bajo el formulario
   - Al éxito: guarda user en Zustand, guarda access token solo en memoria y asume que el refresh token llega por cookie segura desde backend, redirige a /dashboard
   - Si ya está autenticado: redirect a /dashboard

5. src/app/(dashboard)/layout.tsx — layout protegido que verifica autenticación. Si no hay token, redirect a /login.

No usar localStorage. No usar js-cookie para leer tokens sensibles.
```

---

## H3 — Clínicas, sedes y servicios

### H3.1 — Modelos Clinica, Sede, Servicio

**Archivos que se tocan:** `apps/clinicas/models.py`, migración

**Definition of done:**
- [x] Modelos creados y migrados
- [x] Admin muestra Sedes inline dentro de Clinica
- [x] Servicios filtrados por clínica en admin

### Prompt para AI
```
Usando las convenciones globales, crea los modelos en apps/clinicas/models.py:

1. Clinica:
   - id UUID PK, nombre, nit (unique), logo (ImageField upload_to="clinicas/logos/"), activa bool, created_at
   - Meta: db_table="clinicas", ordering=["nombre"]

2. Sede:
   - id UUID PK, clinica FK(Clinica, PROTECT), nombre, ciudad, direccion, telefono
   - horario: JSONField(default=dict) — estructura: {"lunes": ["08:00","18:00"], "martes": [...], ...}
   - activa bool, created_at, updated_at
   - Meta: db_table="sedes", unique_together=[["clinica","nombre"]]

3. Servicio:
   - id UUID PK, clinica FK(Clinica, PROTECT), nombre, descripcion (TextField blank)
   - duracion_min (PositiveIntegerField), precio (DecimalField 12,2)
   - requiere_consentimiento (BooleanField default=True)
   - activo bool, created_at, updated_at
   - Meta: db_table="servicios", ordering=["nombre"]

En admin.py: SedeInline (StackedInline) dentro de ClinicaAdmin. ServicioAdmin con list_filter por clinica y activo.

Genera migración 0001.
```

---

### H3.2 — API REST de clínicas, sedes y servicios

**Archivos que se tocan:** `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, `apps/clinicas/urls.py`

**Definition of done:**
- [x] CRUD completo para Sede y Servicio
- [x] Superadmin ve todas las clínicas; Admin ve solo la suya
- [x] No se puede eliminar una sede que tenga citas (validación en serializer)
- [x] Listado de servicios filtrables por activo y por clinica

### Prompt para AI
```
Implementa la API REST para apps/clinicas/ siguiendo las convenciones del proyecto.

ViewSets requeridos:
1. SedeViewSet (ModelViewSet):
   - Permisos: list/retrieve → IsAuthenticated; create/update → IsAdmin; destroy → IsSuperAdmin
   - Mixin HasClinicamente aplicado
   - Filtros: activa, ciudad
   - Búsqueda: nombre, ciudad, direccion
   - Validación en perform_destroy: si tiene citas asociadas raise ValidationError

2. ServicioViewSet (ModelViewSet):
   - Permisos: list/retrieve → IsAuthenticated; create/update/destroy → IsAdmin
   - Mixin HasClinicamente
   - Filtros: activo, requiere_consentimiento
   - Búsqueda: nombre, descripcion
   - Acción extra: @action GET "activos/" que retorna solo servicios activos sin paginación (para selects en formularios)

Serializers:
- SedeSerializer: todos los campos + nombre_clinica (SerializerMethodField)
- ServicioSerializer: todos los campos + validación de precio > 0 y duracion_min entre 15 y 480

Rutas en urls.py con DefaultRouter, prefijos: sedes/, servicios/
```

---

## H4 — Colaboradores

### H4.1 — Modelo Colaborador

**Archivos que se tocan:** `apps/colaboradores/models.py`, migración

**Definition of done:**
- [x] Colaborador creado como extensión de User con OneToOne
- [x] Relación M2M con Servicio para especialidades
- [x] Admin muestra colaborador con sus especialidades

### Prompt para AI
```
Crea el modelo Colaborador en apps/colaboradores/models.py usando las convenciones globales.

Colaborador:
- id UUID PK
- user: OneToOneField(settings.AUTH_USER_MODEL, PROTECT, related_name="colaborador")
- sede_principal: FK(Sede, PROTECT, related_name="colaboradores")
- tipo_contrato: CharField choices TipoContrato(TextChoices): empleado, contratista, socio
- fecha_ingreso: DateField
- especialidades: ManyToManyField("clinicas.Servicio", blank=True, related_name="colaboradores") — los servicios que puede realizar este profesional
- numero_documento: CharField 30 (para liquidaciones)
- activo: BooleanField default=True
- created_at, updated_at
- Meta: db_table="colaboradores"
- Property: nombre_completo → self.user.get_full_name()
- Property: clinica → self.sede_principal.clinica

Nota: el rol del User se mantiene en el modelo User. Colaborador es solo el perfil laboral.
Un Colaborador con rol=profesional aparece en la agenda. Uno con rol=recepcion no.
La agenda debe resolver disponibilidad y filtros a partir de `User` como actor autenticable, pero consumiendo `colaborador.sede_principal` y `colaborador.especialidades` como fuente de datos laboral.

Admin: ColaboradorAdmin con especialidades como filter_horizontal.
```

---

### H4.2 — API REST de colaboradores

**Definition of done:**
- [x] CRUD de colaboradores accesible para admin
- [x] Listado de profesionales disponibles para el módulo de agenda (solo activos con rol=profesional)
- [x] No se puede desactivar un colaborador con citas futuras

### Prompt para AI
```
Implementa la API REST para apps/colaboradores/ siguiendo las convenciones.

ColaboradorViewSet (ModelViewSet):
- Permisos: list/retrieve → IsAuthenticated; create/update → IsAdmin; destroy → IsAdmin
- HasClinicamente mixin (filtrar por clinica de la sede_principal)
- Filtros: activo, tipo_contrato, sede_principal
- Búsqueda: user__first_name, user__last_name, user__email

Acción extra: @action GET "profesionales/" sin paginación
- Devuelve solo colaboradores activos cuyo user.rol == "profesional"
- Acepta parámetro opcional ?sede_id=UUID para filtrar por sede
- Respuesta: [{id, nombre_completo, especialidades: [{id, nombre}]}]
- Usado en el selector de profesional al crear una cita

ColaboradorSerializer:
- Campos del colaborador + campos anidados del user (solo lectura): email, first_name, last_name, nombre_completo, rol
- especialidades: lista de {id, nombre, duracion_min}
- Para crear/actualizar colaborador, el user ya debe existir (se pasa user_id)

ColaboradorCreateSerializer (para POST):
- Crea User y Colaborador en una transacción atómica
- Campos: email, first_name, last_name, password, telefono, rol, sede_principal_id, tipo_contrato, fecha_ingreso, especialidades (lista de IDs)
- Valida que el rol sea solo profesional o recepcion (no admin/superadmin desde este endpoint)
```

---

## H5 — Pacientes

### H5.1 — Modelo Paciente

**Archivos que se tocan:** `apps/pacientes/models.py`, migración

**Definition of done:**
- [x] Paciente creado con todos los campos de identificación obligatorios (Res. 1995/1999)
- [x] Campo canal_preferido para confirmación de citas
- [x] Unique constraint por clínica + tipo_doc + número_doc

### Prompt para AI
```
Crea el modelo Paciente en apps/pacientes/models.py usando las convenciones globales.

Paciente:
- id UUID PK
- clinica: FK(Clinica, PROTECT)
- tipo_documento: CharField choices TipoDoc: CC, CE, PA, TI, NIT
- numero_documento: CharField 30
- nombres: CharField 100
- apellidos: CharField 100
- fecha_nacimiento: DateField
- sexo: CharField choices Sexo: M, F, O
- ocupacion: CharField 100 blank
- direccion: CharField 300
- telefono: CharField 20
- email: EmailField blank
- canal_confirmacion: CharField choices CanalConfirmacion: whatsapp, sms, llamada — default=whatsapp
- autoriza_datos: BooleanField default=False (Ley 1581/2012 — obligatorio antes de guardar)
- fecha_autorizacion: DateTimeField null blank
- activo: BooleanField default=True
- created_at, updated_at
- Meta: db_table="pacientes", unique_together=[["clinica","tipo_documento","numero_documento"]], ordering=["apellidos","nombres"]
- Property: nombre_completo → f"{self.nombres} {self.apellidos}"
- Property: edad → calculada desde fecha_nacimiento

Validación en save(): si autoriza_datos=True y fecha_autorizacion es None, setear fecha_autorizacion=now().
```

---

### H5.2 — API REST de pacientes

**Definition of done:**
- [x] CRUD completo para pacientes
- [x] Búsqueda por nombre, documento, teléfono
- [x] No se puede crear un paciente sin autoriza_datos=True
- [x] Endpoint de búsqueda rápida para el selector de citas

### Prompt para AI
```
Implementa la API REST para apps/pacientes/ siguiendo las convenciones.

PacienteViewSet (ModelViewSet):
- Permisos: list/retrieve/create/update → IsAuthenticated (todos pueden registrar pacientes); destroy → IsAdmin
- HasClinicamente mixin
- Filtros: activo, sexo, canal_confirmacion, tipo_documento
- Búsqueda: nombres, apellidos, numero_documento, telefono, email
- Ordenamiento: apellidos, nombres, created_at

Validaciones en PacienteSerializer:
- autoriza_datos debe ser True para crear o se lanza ValidationError
- numero_documento: solo dígitos si tipo_documento es CC o TI
- fecha_nacimiento: no puede ser futura, no puede ser mayor a 120 años

Acción extra: @action GET "buscar/"
- Acepta parámetro ?q=texto (mínimo 3 caracteres)
- Busca en nombres, apellidos, numero_documento
- Devuelve máximo 10 resultados sin paginación: [{id, nombre_completo, numero_documento, tipo_documento, telefono, canal_confirmacion}]
- Usado en el selector al crear una cita nueva
```

---

### H5.3 — Frontend: módulo de pacientes

**Definition of done:**
- [x] Tabla de pacientes con búsqueda y paginación
- [x] Formulario de creación/edición con validaciones
- [x] Vista de detalle del paciente
- [x] Búsqueda rápida funciona desde el módulo de agenda

### Prompt para AI
```
Implementa el módulo de pacientes en el frontend Next.js 15.

1. src/types/pacientes.ts — interfaces Paciente, PacienteCreate, PacienteUpdate, BusquedaPaciente

2. src/lib/api/pacientes.ts — funciones:
   - getPacientes(params): GET con filtros y paginación
   - getPaciente(id): GET detalle
   - createPaciente(data): POST
   - updatePaciente(id, data): PATCH
   - buscarPacientes(q): GET buscar/?q= retorna array simple

3. src/app/(dashboard)/pacientes/page.tsx:
   - Tabla con TanStack Table: columnas nombre_completo, documento, teléfono, canal_confirmacion, activo
   - Búsqueda en tiempo real (debounce 300ms) por nombre/documento
   - Botón "Nuevo paciente" abre Sheet (panel lateral) con formulario
   - Click en fila navega a /pacientes/[id]

4. src/app/(dashboard)/pacientes/[id]/page.tsx:
   - Datos del paciente en Card
   - Tabs: Datos personales | Citas | Historia clínica
   - Botón editar abre Sheet con formulario de edición

5. Formulario PacienteForm (componente compartido create/edit):
   - React Hook Form + Zod
   - Campos: tipo_documento (Select), numero_documento, nombres, apellidos, fecha_nacimiento (DatePicker), sexo (Select), telefono, email, direccion, ocupacion, canal_confirmacion (RadioGroup con íconos), autoriza_datos (Checkbox obligatorio con texto legal)
   - Validaciones igual que el backend

Usa componentes shadcn: Table, Sheet, Form, Input, Select, RadioGroup, Checkbox, DatePicker (Calendar + Popover).
```

---

## H6 — Agenda y citas

### H6.1 — Modelo Cita y BloqueoAgenda

**Archivos que se tocan:** `apps/agenda/models.py`, migración

**Definition of done:**
- [x] Cita con todos los estados y relaciones correctas
- [x] BloqueoAgenda para vacaciones y ausencias
- [x] Índices en fecha_inicio + profesional y fecha_inicio + sede

### Prompt para AI
```
Crea los modelos en apps/agenda/models.py usando las convenciones globales.

1. Cita:
- id UUID PK
- paciente FK(Paciente, PROTECT)
- sede FK(Sede, PROTECT)
- servicio FK(Servicio, PROTECT)
- profesional FK(settings.AUTH_USER_MODEL, PROTECT, related_name="citas_asignadas", limit_choices_to={"rol":"profesional"})
- fecha_inicio, fecha_fin: DateTimeField
- fecha_inicio_real, fecha_fin_real: DateTimeField null blank — timestamps reales de atención, gestionados por el sistema
- estado: CharField choices Estado: pendiente, confirmada, en_curso, completada, cancelada, no_asistio — default=pendiente
- estado_confirmacion: CharField choices EstadoConfirmacion: sin_enviar, enviado, confirmado, sin_respuesta — default=sin_enviar
- canal_confirmacion: CharField choices CanalConfirmacion: whatsapp, sms, llamada — copiado del paciente al crear
- canal_origen: CharField choices CanalOrigen: presencial, telefono, web, redes — default=presencial
- notas_internas: TextField blank
- motivo_cancelacion: TextField blank
- confirmado_por: FK(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="citas_confirmadas_manual") — para confirmación manual
- confirmado_en: DateTimeField null blank
- recordatorio_enviado: BooleanField default=False
- created_by FK(User, PROTECT, null=True, related_name="citas_creadas")
- created_at, updated_at
- Meta: db_table="citas", ordering=["fecha_inicio"], indexes en [profesional+fecha_inicio], [sede+fecha_inicio], [paciente+fecha_inicio]

2. BloqueoAgenda:
- id UUID PK, profesional FK, sede FK, fecha_inicio, fecha_fin DateTimeField
- motivo CharField 200 blank, created_at
- Meta: db_table="bloqueos_agenda"

3. ConfirmacionToken:
- id UUID PK
- cita FK(Cita, CASCADE, related_name="tokens")
- token: CharField 64 unique — generado con secrets.token_urlsafe(48)
- usado: BooleanField default=False
- expira_en: DateTimeField — now() + 48h al crear
- created_at
- Meta: db_table="confirmacion_tokens"
- Method: esta_vigente() → not self.usado and self.expira_en > now()
```

---

### H6.2 — Lógica de disponibilidad y validaciones de solapamiento

**Archivos que se crean:** `apps/agenda/services.py`

**Definition of done:**
- [x] No se puede crear cita fuera del horario de la sede
- [x] No se puede crear cita si el profesional tiene otra cita en ese horario
- [x] No se puede crear cita si el profesional tiene un bloqueo en ese horario
- [x] fecha_fin se calcula automáticamente desde fecha_inicio + servicio.duracion_min

### Prompt para AI
```
Crea apps/agenda/services.py con la lógica de disponibilidad para el sistema de agenda.

Funciones requeridas:

1. calcular_fecha_fin(fecha_inicio: datetime, duracion_min: int) -> datetime
   Suma los minutos al datetime de inicio.

2. verificar_disponibilidad_profesional(profesional_id, fecha_inicio, fecha_fin, excluir_cita_id=None) -> bool
   Retorna True si el profesional está disponible.
   Verifica:
   a) No hay citas con estado != cancelada que se solapen.
      Regla especial: si una cita está en estado en_curso y tiene fecha_inicio_real, usar como rango ocupado
      [fecha_inicio_real, fecha_inicio_real + servicio.duracion_min] en lugar del rango programado original.
   b) No hay BloqueoAgenda que se solapen
   Si excluir_cita_id es provisto, excluye esa cita (para edición).

3. verificar_horario_sede(sede, fecha_inicio, fecha_fin) -> bool
   Verifica que el horario de la cita esté dentro del horario configurado de la sede.
   El campo sede.horario es JSON: {"lunes": ["08:00","18:00"]} donde el key es el día de la semana en español en minúscula.
   Si el día no está en el JSON, la sede no atiende ese día → retorna False.

4. get_slots_disponibles(profesional_id, sede_id, fecha: date, duracion_min: int) -> list[datetime]
   Devuelve lista de datetimes disponibles ese día en intervalos de duracion_min.
   Respeta horario de sede y citas/bloqueos existentes del profesional.

5. crear_cita(data: dict, created_by) -> Cita
   Transacción atómica:
   a) Calcula fecha_fin
   b) Verifica disponibilidad — lanza ValidationError si no está disponible
   c) Verifica horario sede — lanza ValidationError si está fuera de horario
   d) Crea la Cita
   e) Copia canal_confirmacion del paciente a la cita
   f) Retorna la cita creada
```

---

### H6.3 — API REST de agenda

**Definition of done:**
- [x] CRUD de citas con validaciones del servicio
- [x] Endpoint de slots disponibles para el calendario
- [x] Cambio de estado con validaciones de flujo
- [x] Listado filtreable por fecha, profesional, sede, estado

### Prompt para AI
```
Implementa la API REST para apps/agenda/ usando el services.py ya creado.

CitaViewSet (ModelViewSet):
- Permisos: list/retrieve → IsAuthenticated; create/update → IsAdminOrRecepcion; destroy → IsAdmin
- HasClinicamente mixin (filtrar por clinica de la sede)
- Filtros: estado, estado_confirmacion, profesional, sede, fecha_inicio__date, canal_origen
- Búsqueda: paciente__nombres, paciente__apellidos, paciente__numero_documento
- Ordenamiento: fecha_inicio, created_at

En perform_create: usar agenda.services.crear_cita(validated_data, request.user)
En perform_update: re-verificar disponibilidad si cambian fecha_inicio, fecha_fin o profesional

Acciones extra:
1. @action POST "cambiar_estado/" — recibe {estado, motivo_cancelacion?}. Valida flujo:
   pendiente → confirmada, cancelada
   confirmada → en_curso, cancelada, no_asistio
   en_curso → completada, cancelada
   completada → (no se puede cambiar)
   cancelada → (no se puede cambiar)
   Reglas automáticas:
   - al pasar a en_curso, guardar fecha_inicio_real = now() si aún no existe
   - al pasar a completada, guardar fecha_fin_real = now() si aún no existe
   - al pasar a cancelada o no_asistio, dejar fecha_inicio_real y fecha_fin_real en null

2. @action GET "slots_disponibles/" — recibe ?profesional_id=&sede_id=&fecha=YYYY-MM-DD&servicio_id=
   Llama a services.get_slots_disponibles y retorna lista de datetimes disponibles.

3. @action GET "hoy/" — citas del día actual para la sede del usuario. Sin paginación.

BloqueoAgendaViewSet (ModelViewSet):
- Solo admin puede crear/editar/eliminar bloqueos
- Filtros: profesional, sede, fecha_inicio__date
```

---

### H6.4 — Frontend: calendario de agenda

**Definition of done:**
- [x] Calendario muestra citas del día/semana/mes
- [x] Vista multi-profesional (columnas por profesional)
- [x] Click en slot vacío abre formulario de nueva cita
- [x] Click en cita abre detalle con opciones de cambio de estado
- [x] Colores según estado de confirmación

### Prompt para AI
```
Implementa el módulo de agenda en el frontend Next.js 15.

1. Instala y configura react-big-calendar con localizer de date-fns en español.

2. src/types/agenda.ts — interfaces: Cita, CitaCreate, SlotDisponible, EstadoCita, EstadoConfirmacion

3. src/lib/api/agenda.ts — funciones:
   - getCitas(params): GET con filtros de fecha, profesional, sede
   - createCita(data): POST
   - updateCita(id, data): PATCH
   - cambiarEstado(id, estado, motivo?): POST cambiar_estado/
   - getSlotsDisponibles(profesional_id, sede_id, fecha, servicio_id): GET slots_disponibles/
   - getCitasHoy(): GET hoy/

4. src/app/(dashboard)/agenda/page.tsx:
   - Toolbar custom con: selector de vista (día/semana), selector de sede, selector de profesional(es), navegación de fecha
   - Calendario react-big-calendar en vista "semana" por defecto
   - Columnas por profesional cuando se seleccionan múltiples (resourceView)
   - Colores de eventos según estado_confirmacion: confirmado=verde, enviado=amarillo, sin_respuesta=rojo, sin_enviar=gris
   - Click en slot vacío: abre Sheet con CitaForm
   - Click en evento: abre Sheet con CitaDetalle

5. CitaForm (Sheet):
   - Paso 1: búsqueda de paciente (BusquedaPacienteInput con debounce que llama a buscar/)
   - Paso 2: seleccionar servicio (Select filtrado por especialidades del profesional)
   - Paso 3: seleccionar slot disponible (llama a slots_disponibles/, muestra grid de horarios)
   - Notas internas (Textarea)
   - Canal de origen (Select)

6. CitaDetalle (Sheet):
   - Datos de la cita con estado_confirmacion visible
   - Botones de cambio de estado según flujo permitido
   - Historial de la cita (created_by, confirmado_por, etc.)
```

---

## H7 — Confirmación de citas multicanal

### H7.1 — Lógica de envío y página de confirmación

**Archivos que se crean:** `apps/agenda/confirmacion.py`, `apps/notificaciones/services.py`, página pública Next.js

**Definition of done:**
- [x] Workflow de n8n envía WA/SMS 24h antes de la cita
- [x] Link de confirmación funciona en móvil con pantalla grande y simple
- [x] Al confirmar, cita pasa a estado_confirmacion=confirmado
- [x] Confirmación manual disponible desde la interfaz de recepción
- [x] Si no responde en 2h, alerta en la interfaz (badge en la cita)

### Prompt para AI
```
Implementa el sistema de confirmación multicanal de citas.

BACKEND:

1. apps/agenda/confirmacion.py:
   - generar_token(cita) → ConfirmacionToken: crea token con secrets.token_urlsafe(48), expira en 48h
   - get_url_confirmacion(token) → str: f"{settings.FRONTEND_URL}/confirmar/{token.token}"
   - confirmar_cita(token_str) → Cita: busca token vigente, marca usado=True, actualiza cita.estado_confirmacion="confirmado", cita.confirmado_en=now(), retorna cita. Lanza ValueError si token inválido/expirado/usado.
   - confirmar_manual(cita_id, user) → Cita: actualiza estado_confirmacion="confirmado", confirmado_por=user, confirmado_en=now()

2. apps/notificaciones/services.py:
   - enviar_confirmacion_whatsapp(cita): usa Evolution API, mensaje con nombre paciente + fecha + link. Retorna bool.
   - enviar_confirmacion_sms(cita): usa Mensatek API (POST a endpoint con api_key, to, message). Retorna bool.
   - enviar_recordatorio(cita): despacha según cita.canal_confirmacion al servicio correspondiente. Si canal=llamada, solo crea alerta interna (no envía nada externo).
   - enviar_email(...): usa SMTP de Resend vía backend de email de Django. Acepta `to`, `subject`, `body`, `html_body`, `from_email`, `cc`, `bcc`, `reply_to`.
   - Ambos servicios externos tienen timeout=10s y try/except — si falla, loguea el error y retorna False.

3. Integración Django ↔ n8n:
   - Crear endpoint interno o servicio invocable que entregue a n8n las citas con fecha_inicio entre now()+23h y now()+25h, estado in [pendiente,confirmada], recordatorio_enviado=False.
   - n8n ejecuta cada 30 min, consulta ese endpoint o recibe webhook desde Django, y por cada cita llama enviar_recordatorio o el canal equivalente.
   - Tras envío exitoso, Django marca recordatorio_enviado=True y actualiza estado_confirmacion=enviado mediante endpoint interno autenticado o servicio dedicado.

4. Endpoints públicos (sin auth):
   - GET /api/v1/agenda/confirmar/{token}/detalle/ → valida token sin consumirlo y retorna {ok, paciente_nombre, servicio_nombre, fecha_inicio, profesional_nombre, clinica_telefono}
   - POST /api/v1/agenda/confirmar/{token}/ → llama confirmar_cita(token) y confirma realmente la cita

5. Endpoints autenticados para email desde frontend:
   - GET /api/v1/notificaciones/emails/config/ → retorna provider, host, port, username, flags TLS/SSL, `default_from_email` y `configured`
   - POST /api/v1/notificaciones/emails/enviar/ → envía email administrativo usando Resend SMTP
   - Roles permitidos: `admin`, `superadmin`, `recepcion`

FRONTEND:

6. src/app/confirmar/[token]/page.tsx (ruta PÚBLICA, fuera del layout protegido):
   - Server component que llama al endpoint GET de detalle
   - Si ok: muestra nombre del paciente, servicio, fecha en letras grandes, profesional. Botón verde grande "Confirmar mi cita". Botón gris "Necesito cambiarla" → muestra número de teléfono de la clínica.
   - Al hacer click en "Confirmar mi cita", llama al POST público de confirmación
   - Si error/expirado: mensaje amigable "Este link ya no es válido. Llame a la clínica: [teléfono]"
   - Diseño muy simple: una Card centrada, texto grande (text-2xl mínimo), sin barra de navegación, sin sidebar.

7. En CitaDetalle del dashboard agregar botón "Confirmar manualmente" visible solo cuando estado_confirmacion != confirmado. Llama a endpoint PATCH /api/v1/agenda/{id}/confirmar_manual/.
```

---

## H8 — Historia clínica

### H8.1 — Modelos inmutables de historia clínica

**Archivos que se tocan:** `apps/historia_clinica/models.py`, migración

**Definition of done:**
- [x] HistoriaClinica se crea automáticamente al registrar un paciente (signal)
- [x] NotaClinica no tiene endpoint UPDATE ni DELETE
- [x] FotoClinica almacena en MinIO con path organizado por fecha
- [x] save() de NotaClinica lanza error si se intenta modificar un registro existente

### Prompt para AI
```
Crea los modelos inmutables de historia clínica en apps/historia_clinica/models.py.

1. HistoriaClinica:
- id UUID PK
- paciente: OneToOneField(Paciente, PROTECT, related_name="historia_clinica")
- clinica: FK(Clinica, PROTECT)
- numero: CharField 20 unique — formato "HC-{año}-{secuencial 5 dígitos}" asignado solo en la creación
- created_at
- Meta: db_table="historias_clinicas"
- IMPORTANTE: permitir únicamente el INSERT inicial. Después de creada, bloquear cambios de campos clínicos. El número debe resolverse antes del insert o dentro de la misma transacción de creación, no con un update posterior.

2. NotaClinica:
- id UUID PK
- historia: FK(HistoriaClinica, PROTECT, related_name="notas")
- cita: FK("agenda.Cita", PROTECT, null=True, blank=True)
- servicio: FK(Servicio, PROTECT, null=True)
- tipo: CharField choices TipoNota: consulta, procedimiento, evolucion, aclaratoria
- nota_aclarada: FK("self", PROTECT, null=True, blank=True, related_name="aclaraciones") — solo para tipo=aclaratoria
- anamnesis, diagnostico, plan_manejo, observaciones: TextField blank
- firmada_por: FK(User, PROTECT, related_name="notas_firmadas")
- firmada_en: DateTimeField
- created_at
- Meta: db_table="notas_clinicas", ordering=["firmada_en"]
- INMUTABILIDAD: sobrescribir save(): si self.pk existe lanza ValueError("Las notas son inmutables. Crea una nota aclaratoria.")
- INMUTABILIDAD: sobrescribir delete(): lanza ValueError("Las notas no pueden eliminarse. Resolución 1995/1999.")

3. FotoClinica:
- id UUID PK
- nota: FK(NotaClinica, PROTECT, related_name="fotos")
- tipo: CharField choices TipoFoto: antes, durante, despues
- archivo: ImageField upload_to=foto_upload_path (función que retorna "fotos/{año}/{mes}/{uuid}.{ext}")
- descripcion: CharField 200 blank
- created_at
- Meta: db_table="fotos_clinicas", ordering=["tipo","created_at"]

Signal post_save en Paciente: crear HistoriaClinica automáticamente si no existe.
La numeración de HC debe ser segura ante concurrencia. No usar `SELECT MAX` fuera de una transacción con bloqueo. Preferir un secuencial por año en tabla auxiliar, o resolverlo en una función de servicio atómica.
```

---

### H8.2 — API REST de historia clínica

**Definition of done:**
- [x] Solo GET y POST para notas (sin PUT/PATCH/DELETE)
- [x] Fotos con upload a MinIO y URLs firmadas en la respuesta
- [x] Solo el profesional asignado a la cita puede crear notas (o admin)
- [x] Galería de fotos ordenable por tipo y fecha

### Prompt para AI
```
Implementa la API REST para apps/historia_clinica/ con restricciones de inmutabilidad.

1. HistoriaClinicaViewSet (ReadOnlyModelViewSet — solo list y retrieve):
   - Permisos: IsAuthenticated + IsSameClinicamente
   - retrieve: devuelve historia con resumen de notas (sin contenido completo) y últimas 3 fotos
   - Acción extra: @action GET "{pk}/notas/" — lista todas las notas cronológicas con sus fotos

2. NotaClinicaViewSet — SOLO list y create (NO update, NO destroy):
   - HTTP methods permitidos: GET, POST únicamente
   - Permisos create: IsAdminOrProfesional
   - Validación en create: si tipo=aclaratoria, nota_aclarada es obligatoria
   - En create: firmada_por=request.user, firmada_en=now() automáticamente
   - Respuesta incluye fotos anidadas con URLs firmadas de MinIO

3. FotoClinicaViewSet — solo create y list por nota. No exponer destroy en el MVP:
   - create: recibe nota_id, tipo, descripcion, archivo (multipart)
   - En create: sube a MinIO, guarda ruta relativa en BD
   - Respuesta siempre incluye url_firmada (generada on-the-fly con expiración 1 hora)
   - Nunca devolver la ruta interna de MinIO en la respuesta pública
   - Si una foto se cargó por error, registrar una marca lógica `activa=False` o `oculta=True`, pero conservar el rastro

FotoClinicaSerializer:
- Agrega campo url_firmada como SerializerMethodField
- Usa boto3 client para generate_presigned_url con ExpiresIn=3600
```

---

### H8.3 — Frontend: historia clínica y galería

**Definition of done:**
- [x] Historia clínica accesible desde el perfil del paciente
- [x] Formulario de nueva nota con campo de tipo y secciones colapsables
- [x] Galería antes/después con lightbox para ver las fotos
- [x] Upload de fotos con preview antes de guardar

### Prompt para AI
```
Implementa el módulo de historia clínica en el frontend Next.js 15.

1. src/app/(dashboard)/pacientes/[id]/historia/page.tsx:
   - Timeline vertical de notas clínicas ordenadas por fecha
   - Cada nota muestra: fecha, profesional, tipo (badge de color), resumen del diagnóstico, fotos en grid 3 columnas
   - Botón "Nueva nota" (solo para profesionales y admin) abre Sheet

2. NuevaNotaForm (Sheet):
   - Select de tipo: consulta, procedimiento, evolución, nota aclaratoria
   - Si tipo=aclaratoria: selector de nota a aclarar
   - Secciones colapsables (Accordion de shadcn):
     - Anamnesis (Textarea)
     - Diagnóstico (Textarea)
     - Plan de manejo (Textarea)
     - Observaciones (Textarea)
   - Sección de fotos: upload múltiple con preview
     - Por cada foto: selector de tipo (antes/durante/después) + descripción
     - Drag and drop con react-dropzone

3. GaleriaFotos:
   - Grid responsive de fotos organizadas por nota y por tipo
   - Filtro: mostrar solo "antes/después" para comparación
   - Click en foto abre Lightbox (usa yet-another-react-lightbox)
   - Vista comparativa: foto "antes" a la izquierda, "después" a la derecha en la misma cita
   - Las URLs de fotos vienen firmadas del backend (no cachear más de 50 minutos)
```

---

## H9 — Consentimientos informados

### H9.1 — Modelos y generación de PDF

**Definition of done:**
- [x] PlantillaConsentimiento editable por admin con HTML
- [x] Consentimiento generado como PDF con WeasyPrint al firmar
- [x] PDF guardado en MinIO, inmutable
- [x] Token de firma único con expiración

### Prompt para AI
```
Implementa el módulo de consentimientos en apps/consentimientos/.

Modelos (en models.py):
1. PlantillaConsentimiento:
   - id UUID PK, clinica FK, servicio FK null (si null aplica a todos los servicios)
   - nombre CharField 200, contenido_html TextField
   - version PositiveIntegerField default=1, activa bool
   - created_at
   - Al actualizar el contenido, incrementar version automáticamente en save()

2. Consentimiento:
   - id UUID PK
   - cita FK(Cita, PROTECT), paciente FK(Paciente, PROTECT)
   - plantilla FK(PlantillaConsentimiento, PROTECT)
   - contenido_snapshot TextField — copia del HTML renderizado al momento de crear (para inmutabilidad)
   - hash_contenido CharField 64 — SHA-256 del contenido_snapshot
   - estado CharField choices: pendiente, firmado, revocado — default=pendiente
   - token CharField 64 unique null blank — para firma digital
   - token_expira DateTimeField null blank
   - firmado_en DateTimeField null blank
   - firma_ip GenericIPAddressField null blank
   - firma_user_agent TextField blank
   - pdf_archivo FileField upload_to="consentimientos/%Y/%m/" null blank
   - revocado_en DateTimeField null blank
   - motivo_revocacion TextField blank
   - created_at
   - INMUTABILIDAD: en save(), si ya está firmado no permitir cambios en: cita, paciente, plantilla, contenido_snapshot, hash_contenido

services.py:
- generar_consentimiento(cita, plantilla) → Consentimiento: renderiza el template HTML con datos del paciente/cita, calcula hash SHA-256, guarda snapshot, genera token
- firmar_consentimiento(token, ip, user_agent) → Consentimiento: valida token vigente, actualiza estado=firmado, genera PDF con WeasyPrint y lo sube a MinIO
- generar_pdf_consentimiento(consentimiento) → bytes: usa WeasyPrint para renderizar HTML a PDF. El PDF incluye al pie: nombre paciente, documento, fecha/hora firma, IP, hash del documento.
```

---

## H10 — Catálogo de insumos

### H10.1 — Modelos de categorías e insumos

**Definition of done:**
- [x] Categorías de insumos configurables por admin
- [x] Insumo distingue entre consumo interno y venta retail
- [x] Alerta visual cuando stock_actual <= stock_minimo

### Prompt para AI
```
Crea los modelos base de inventario en apps/inventario/models.py.

1. CategoriaInsumo:
   - id UUID PK, clinica FK, nombre CharField 100, descripcion blank
   - activa bool, created_at
   - Meta: db_table="categorias_insumos", unique_together=[["clinica","nombre"]]

2. Insumo:
   - id UUID PK, clinica FK, categoria FK(CategoriaInsumo, PROTECT)
   - nombre CharField 200, descripcion TextField blank
   - es_consumo_interno: BooleanField default=True (se usa en tratamientos, no se vende directamente al paciente)
   - es_venta_retail: BooleanField default=False (se puede vender al paciente como producto)
   - Validación: al menos uno de los dos debe ser True (pueden ser ambos True)
   - unidad_medida: CharField choices: unidad, ml, gr, cm, par, caja
   - stock_actual: DecimalField(10,3) default=0
   - stock_minimo: DecimalField(10,3) default=0 (para alertas)
   - costo_promedio: DecimalField(12,2) default=0 (costo promedio ponderado — se actualiza automáticamente)
   - precio_venta: DecimalField(12,2) null blank (solo para venta_retail)
   - requiere_lote: BooleanField default=False
   - activo bool, created_at, updated_at
   - Meta: db_table="insumos"
   - Property: stock_bajo → self.stock_actual <= self.stock_minimo
   - Property: valor_stock → self.stock_actual * self.costo_promedio

En API: endpoint GET "alertas_stock/" que devuelve insumos donde stock_actual <= stock_minimo de la clínica del usuario.
```

---

## H11 — Proveedores y órdenes de compra

### H11.1 — Modelos de proveedor y OC

**Definition of done:**
- [x] CRUD completo de proveedores
- [x] OC con estados: borrador, enviada, recibida_parcial, recibida_total, cancelada
- [x] Al recibir OC (total o parcial) se actualiza stock y costo promedio automáticamente

### Prompt para AI
```
Crea los modelos en apps/proveedores/models.py y la lógica de recepción de compras.

1. Proveedor:
   - id UUID PK, clinica FK, nombre CharField 200, nit CharField 20
   - contacto CharField 100 blank, telefono, email EmailField blank
   - categoria CharField choices: insumos_medicos, productos_belleza, equipos, papeleria, otro
   - activo bool, created_at, updated_at
   - Meta: db_table="proveedores"

2. OrdenCompra:
   - id UUID PK, proveedor FK(Proveedor, PROTECT), sede FK(Sede, PROTECT)
   - numero CharField 20 unique (formato "OC-{año}-{secuencial}")
   - fecha DateField, fecha_entrega_esperada DateField null blank
   - estado CharField choices: borrador, enviada, recibida_parcial, recibida_total, cancelada — default=borrador
   - notas TextField blank, created_by FK(User, PROTECT), created_at, updated_at
   - Property: total → sum de item.subtotal

3. ItemOrdenCompra:
   - id UUID PK, orden FK(OrdenCompra, CASCADE, related_name="items")
   - insumo FK(Insumo, PROTECT), cantidad Decimal(10,3), precio_unitario Decimal(12,2)
   - cantidad_recibida Decimal(10,3) default=0
   - Property: subtotal → self.cantidad * self.precio_unitario
   - Property: pendiente_recibir → self.cantidad - self.cantidad_recibida

services.py (apps/proveedores/):
- recibir_orden(orden_id, items_recibidos: list[{item_id, cantidad}], user) → OrdenCompra:
  Transacción atómica:
  a) Para cada item recibido: actualizar cantidad_recibida
  b) Crear MovimientoInventario tipo=entrada con origen=compra, referencia=orden
  c) Recalcular costo_promedio del insumo:
     nuevo_costo = (stock_actual * costo_actual + cantidad_recibida * precio_unitario) / (stock_actual + cantidad_recibida)
  d) Actualizar insumo.stock_actual y insumo.costo_promedio
  e) Actualizar estado de la OC: si todos los items están completamente recibidos → recibida_total, sino → recibida_parcial
  f) Retornar OC actualizada
```

---

## H12 — Inventario y kardex

### H12.1 — Movimientos de inventario

**Definition of done:**
- [x] Todo movimiento de stock queda registrado en MovimientoInventario
- [x] Kardex muestra historia completa de un insumo
- [x] El stock nunca puede quedar en negativo (validación)
- [x] Ajustes manuales requieren motivo y solo admin puede hacerlos

### Prompt para AI
```
Crea el modelo MovimientoInventario y la lógica del kardex en apps/inventario/.

MovimientoInventario (models.py):
- id UUID PK
- insumo FK(Insumo, PROTECT, related_name="movimientos")
- tipo CharField choices TipoMovimiento: entrada, salida, ajuste_positivo, ajuste_negativo, baja
- cantidad Decimal(10,3)
- costo_unitario Decimal(12,2) — costo al momento del movimiento
- costo_promedio_resultante Decimal(12,2) — costo promedio DESPUÉS de este movimiento
- stock_resultante Decimal(10,3) — stock DESPUÉS de este movimiento
- origen CharField choices OrigenMovimiento: compra, consumo_cita, venta_retail, ajuste_manual, baja_vencimiento
- referencia_id UUID null — ID de la OC, cita o cobro relacionado
- referencia_tipo CharField null — "orden_compra", "cita", "cobro"
- motivo TextField blank — obligatorio para ajustes manuales
- realizado_por FK(User, PROTECT)
- fecha DateTimeField default=now
- Meta: db_table="movimientos_inventario", ordering=["-fecha"]
- IMPORTANTE: este modelo es solo-INSERT. No tiene UPDATE ni DELETE.

services.py (apps/inventario/):
- registrar_salida(insumo, cantidad, origen, referencia_id, referencia_tipo, user, costo_unitario=None) → MovimientoInventario:
  Transacción atómica.
  Valida que insumo.stock_actual >= cantidad (lanza ValidationError si no).
  Si costo_unitario es None, usa insumo.costo_promedio.
  Actualiza insumo.stock_actual -= cantidad.
  Crea y retorna MovimientoInventario.

- registrar_ajuste(insumo, cantidad_nueva, user, motivo) → MovimientoInventario:
  Calcula diferencia = cantidad_nueva - insumo.stock_actual.
  Crea movimiento tipo ajuste_positivo o ajuste_negativo según diferencia.
  Actualiza stock.
```

---

## H13 — Cobros en cita

### H13.1 — Modelos de cobro

**Definition of done:**
- [x] Cobro vinculado a una cita (una cita, un cobro máximo)
- [x] ítems de cobro pueden ser servicios o insumos/productos
- [x] Al guardar ítem de insumo, se registra salida de inventario automáticamente
- [x] Cobro no se puede anular si tiene pagos registrados sin reversar primero

### Prompt para AI
```
Crea los modelos de cobro en apps/cobros/models.py y su lógica de negocio.

1. Cobro:
   - id UUID PK
   - cita FK(Cita, PROTECT, null=True blank=True, related_name="cobro")
   - paciente FK(Paciente, PROTECT), profesional FK(User, PROTECT, null=True)
   - sede FK(Sede, PROTECT)
   - fecha DateTimeField default=now
   - subtotal, descuento, total: DecimalField(12,2) default=0
   - estado CharField choices: pendiente, pagado_parcial, pagado, anulado — default=pendiente
   - notas TextField blank
   - created_by FK(User, PROTECT, related_name="cobros_creados")
   - created_at, updated_at
   - Meta: db_table="cobros"
   - Property: saldo_pendiente → self.total - sum(pagos recibidos)
   - Method: recalcular_totales(): suma subtotales de ítems, aplica descuento, actualiza total. Llamar después de agregar/quitar ítems.

2. ItemCobro:
   - id UUID PK, cobro FK(Cobro, CASCADE, related_name="items")
   - tipo CharField choices: servicio, insumo_consumo, producto_retail
   - servicio FK(Servicio, null=True blank=True)
   - insumo FK(Insumo, null=True blank=True)
   - descripcion CharField 200 — nombre del ítem al momento del cobro (snapshot)
   - cantidad Decimal(10,3) default=1
   - precio_unitario Decimal(12,2) — precio al momento del cobro (snapshot)
   - costo_unitario Decimal(12,2) default=0 — costo del insumo al momento (para margen)
   - subtotal Decimal(12,2) — calculado: cantidad * precio_unitario
   - created_at
   - Validación: si tipo=servicio, servicio no puede ser null. Si tipo=insumo_consumo o producto_retail, insumo no puede ser null.

3. PagoRecibido:
   - id UUID PK, cobro FK(Cobro, CASCADE, related_name="pagos")
   - medio_pago CharField choices: efectivo, tarjeta_debito, tarjeta_credito, transferencia, otro
   - valor Decimal(12,2), referencia CharField 100 blank
   - fecha DateTimeField default=now, recibido_por FK(User, PROTECT)
   - created_at

services.py (apps/cobros/):
- agregar_item_cobro(cobro, item_data, user) → ItemCobro:
  Si tipo != servicio: registrar salida de inventario (apps.inventario.services.registrar_salida)
  Copiar descripcion y costo_unitario actuales del insumo/servicio al ítem (snapshot)
  Llamar cobro.recalcular_totales()
  Actualizar estado del cobro

- registrar_pago(cobro, pago_data, user) → PagoRecibido:
  Crear PagoRecibido
  Recalcular estado del cobro: si saldo_pendiente <= 0 → pagado, sino → pagado_parcial
```

---

## H14 — Caja menor y cierre diario

### H14.1 — Gastos y cierre de caja

**Definition of done:**
- [ ] Gastos con soporte fotográfico obligatorio para montos > $50.000 COP
- [ ] Flujo de aprobación: recepcion registra, admin aprueba/rechaza
- [ ] Cierre de caja calcula automáticamente cobros del día
- [ ] Solo se puede cerrar la caja una vez por día por sede

### Prompt para AI
```
Implementa el módulo de caja menor en apps/caja/models.py y su API.

1. CategoriaGasto:
   - id UUID PK, clinica FK, nombre (aseo, papeleria, cafeteria, mantenimiento, otro_configurable)
   - activa bool, created_at

2. GastoCaja:
   - id UUID PK, sede FK, categoria FK(CategoriaGasto, PROTECT)
   - descripcion CharField 200, valor Decimal(12,2)
   - soporte_foto ImageField upload_to="gastos/%Y/%m/" null blank
   - fecha DateField default=today
   - estado CharField choices: pendiente, aprobado, rechazado — default=pendiente
   - motivo_rechazo TextField blank
   - registrado_por FK(User, PROTECT), aprobado_por FK(User, null=True, blank=True)
   - aprobado_en DateTimeField null blank, created_at
   - Validación: si valor > 50000 y soporte_foto está vacío → ValidationError

3. CierreCaja:
   - id UUID PK, sede FK, fecha DateField
   - total_cobros Decimal(12,2) default=0 — calculado
   - total_gastos Decimal(12,2) default=0 — calculado
   - efectivo_contado Decimal(12,2) — ingresado manualmente
   - diferencia Decimal(12,2) — efectivo_contado - (lo que debería haber en efectivo)
   - observaciones TextField blank
   - cerrado_por FK(User, PROTECT), created_at
   - Meta: db_table="cierres_caja", unique_together=[["sede","fecha"]]

API GastoCajaViewSet:
- create: IsAuthenticated (recepcion puede crear)
- Acción "aprobar/": IsAdmin — cambia estado a aprobado, registra aprobado_por y aprobado_en
- Acción "rechazar/": IsAdmin — requiere {motivo_rechazo}
- Filtros: estado, fecha, categoria, sede

API CierreCajaViewSet:
- create: IsAdmin — al crear, calcular automáticamente total_cobros (sum de cobros del día en esa sede) y total_gastos (sum de gastos aprobados del día). Validar que no exista ya un cierre para esa sede y fecha.
- Acción "resumen_dia/": GET — devuelve resumen del día actual sin cerrar: total_cobros, total_gastos, desglose por medio de pago.
```

---

## H15 — Comisiones

### H15.1 — Modelos de reglas y liquidación

**Definition of done:**
- [ ] Reglas de comisión parametrizables por colaborador y por servicio
- [ ] Liquidación calcula automáticamente desde los cobros del periodo
- [ ] Detalle ítem a ítem auditable
- [ ] Flujo: borrador → aprobado → pagado

### Prompt para AI
```
Implementa el módulo de comisiones en apps/comisiones/.

models.py:

1. ReglaComision:
   - id UUID PK, colaborador FK(Colaborador, CASCADE, related_name="reglas")
   - aplica_a CharField choices: servicio_especifico, categoria_servicio, todos_los_servicios
   - servicio FK(Servicio, null=True blank=True)
   - tipo_comision CharField choices: porcentaje, valor_fijo
   - valor Decimal(8,4) — porcentaje (ej: 20.00) o valor fijo en COP
   - base_calculo CharField choices: precio_bruto, precio_neto — precio_neto descuenta el costo del insumo
   - vigente_desde DateField, vigente_hasta DateField null blank
   - activa bool default=True
   - Meta: db_table="reglas_comision"

2. LiquidacionComision:
   - id UUID PK, colaborador FK(Colaborador, PROTECT, related_name="liquidaciones")
   - mes PositiveIntegerField (1-12), anio PositiveIntegerField
   - total_ventas Decimal(12,2), total_comision Decimal(12,2)
   - estado CharField choices: borrador, aprobado, pagado — default=borrador
   - aprobado_por FK(User, null=True blank=True), aprobado_en DateTimeField null blank
   - pagado_en DateTimeField null blank, notas TextField blank
   - created_at
   - Meta: unique_together=[["colaborador","mes","anio"]]

3. ItemComision:
   - id UUID PK, liquidacion FK(LiquidacionComision, CASCADE, related_name="items")
   - cobro FK(Cobro, PROTECT), item_cobro FK(ItemCobro, PROTECT)
   - descripcion CharField 200 — snapshot del servicio/producto
   - base_calculo Decimal(12,2), porcentaje_aplicado Decimal(8,4), comision Decimal(12,2)

services.py:
- calcular_liquidacion(colaborador_id, mes, anio) → LiquidacionComision:
  Busca o crea LiquidacionComision en borrador.
  Borra ítems existentes (si se recalcula).
  Obtiene todos los ItemCobro de cobros completados en el periodo donde cobro.profesional == colaborador.user.
  Para cada ítem: busca la ReglaComision aplicable (más específica primero: servicio > categoria > todos). Si hay regla vigente en ese periodo, calcula comisión. Crea ItemComision.
  Actualiza totales de la liquidación.
  Retorna liquidación.

API: endpoint para calcular, aprobar, marcar como pagado. Solo admin puede aprobar y pagar. Colaborador puede ver sus propias liquidaciones (GET only).
```

---

## H16 — Control de asistencia de pacientes

### H16.1 — Planes de sesiones y seguimiento

**Definition of done:**
- [ ] Plan de sesiones vinculado a un paciente y un servicio
- [ ] Cada cita completada suma automáticamente una sesión al plan
- [ ] Alerta si un paciente lleva más de X días sin asistir (configurable)

### Prompt para AI
```
Implementa el control de asistencia en apps/agenda/ (agrega modelos al módulo existente).

Modelos adicionales en apps/agenda/models.py:

PlanSesiones:
- id UUID PK, paciente FK, servicio FK, sede FK
- total_sesiones PositiveIntegerField
- sesiones_completadas PositiveIntegerField default=0
- dias_alerta PositiveIntegerField default=30 — alertar si no viene en X días
- fecha_inicio DateField, fecha_fin DateField null blank
- activo bool default=True, created_at, updated_at
- Property: progreso_pct → (sesiones_completadas / total_sesiones) * 100
- Property: sesiones_restantes → total_sesiones - sesiones_completadas
- Property: completado → sesiones_completadas >= total_sesiones

SesionAsistencia:
- id UUID PK, plan FK(PlanSesiones, CASCADE, related_name="sesiones")
- cita FK(Cita, PROTECT, null=True blank=True)
- numero_sesion PositiveIntegerField — calculado automáticamente
- estado CharField choices: asistio, no_asistio, cancelada
- fecha DateField
- notas TextField blank, created_at

Signal: cuando una Cita pasa a estado=completada, buscar PlanSesiones activo para ese paciente+servicio y crear SesionAsistencia automáticamente.

Workflow diario en n8n o comando programado externo: buscar PlanSesiones activos donde la última SesionAsistencia es más antigua que dias_alerta → crear notificación interna para recepción.

API:
- PlanSesionesViewSet: CRUD completo para admin/recepcion. Acción "historial/" muestra sesiones del plan.
- Dashboard endpoint: GET "pacientes_sin_asistir/" — lista planes con alerta activa.
```

---

## H17 — Reportes y dashboard

### H17.1 — Queries de reportes y dashboard API

**Definition of done:**
- [ ] Dashboard carga en menos de 2 segundos
- [ ] KPIs del día precisos: cobros, ingresos, gastos, citas
- [ ] Margen real por servicio (cobro - costo insumos)
- [ ] Comisiones del mes acumuladas y pendientes

### Prompt para AI
```
Implementa la API de reportes en apps/reportes/views.py. Solo lógica de queries — no modelos propios.

Endpoints (todos IsAdmin, HasClinicamente):

1. GET /api/v1/reportes/dashboard/:
   Parámetros: ?sede_id=&fecha=YYYY-MM-DD (default=hoy)
   Respuesta:
   {
     citas_hoy: {total, confirmadas, pendientes, completadas, canceladas},
     cobros_hoy: {total_cop, pagados, pendientes, por_medio_pago: [{medio, total}]},
     gastos_hoy: {total_cop, aprobados, pendientes_aprobacion},
     caja_hoy: {cerrada: bool, diferencia: null|Decimal},
     stock_alertas: count de insumos con stock bajo,
     sesiones_alerta: count de pacientes sin asistir,
     comisiones_mes: {mes_actual: total_acumulado, pendientes_liquidar: count}
   }
   Usar select_related y prefetch_related agresivamente. Evitar N+1.

2. GET /api/v1/reportes/ingresos/:
   Parámetros: ?sede_id=&fecha_inicio=&fecha_fin=&agrupar_por=dia|semana|mes
   Respuesta: [{periodo, total_cobros, total_gastos, margen}]

3. GET /api/v1/reportes/servicios/:
   Parámetros: ?sede_id=&fecha_inicio=&fecha_fin=
   Respuesta: [{servicio_nombre, cantidad_citas, ingresos, costo_insumos, margen, margen_pct}]
   El margen incluye el costo real de los insumos consumidos (desde ItemCobro.costo_unitario * cantidad)

4. GET /api/v1/reportes/ocupacion/:
   Parámetros: ?sede_id=&fecha_inicio=&fecha_fin=
   Respuesta: [{profesional_nombre, total_citas, completadas, canceladas, no_asistio, tasa_completadas_pct}]

5. GET /api/v1/reportes/comisiones_resumen/:
   Parámetros: ?mes=&anio=
   Respuesta: [{colaborador_nombre, total_ventas, total_comision, estado_liquidacion}]

Usar django.db.models agregaciones: Sum, Count, Avg, F, ExpressionWrapper. No hacer cálculos en Python si se puede hacer en SQL.
```

---

### H17.2 — Frontend: dashboard con métricas

**Definition of done:**
- [ ] Dashboard muestra KPIs del día en cards
- [ ] Gráfica de ingresos vs gastos de los últimos 30 días
- [ ] Tabla de servicios más rentables del mes
- [ ] Alertas de stock y pacientes sin asistir visibles

### Prompt para AI
```
Implementa el dashboard administrativo en src/app/(dashboard)/page.tsx.

Layout del dashboard:
- Row 1 — KPI cards (4 columnas): Citas hoy, Ingresos hoy, Gastos hoy, Caja (abierta/cerrada)
- Row 2 — Alertas (si existen): stock bajo (badge rojo con count) + pacientes sin asistir (badge amarillo)
- Row 3 — Gráfica de barras: ingresos vs gastos últimos 30 días (Recharts BarChart)
- Row 4 — Dos tablas lado a lado: "Servicios del mes" (nombre, citas, ingresos, margen%) | "Ocupación por profesional" (nombre, citas, tasa completadas%)
- Row 5 — Comisiones del mes: tabla de colaboradores con comisión acumulada y estado de liquidación

Componentes:
- KPICard: Card con número grande, label, variación respecto a ayer (flecha + porcentaje)
- AlertaBadge: Badge clickeable que navega al módulo correspondiente
- GraficaIngresos: BarChart de Recharts con colores: ingresos=azul, gastos=rojo, margen=verde
- TablaServicios: tabla con columnas ordenables usando TanStack Table

TanStack Query:
- useQuery para cada bloque independiente (no un solo query gigante)
- Refetch automático cada 5 minutos (staleTime: 5 * 60 * 1000)
- Skeleton loaders mientras carga cada sección
- Selector de sede en el toolbar del dashboard (si el user es admin con múltiples sedes)
```

---

## H18 — QA, ajustes finales y go-live

### H18.1 — Checklist pre-lanzamiento

**Definition of done:**

**Seguridad:**
- [ ] DEBUG=False en producción
- [ ] SECRET_KEY diferente a development
- [ ] ALLOWED_HOSTS restringido al dominio real
- [ ] Headers de seguridad activos (HSTS, X-Frame-Options, CSP básico)
- [ ] Todas las URLs de MinIO son firmadas — ninguna pública
- [ ] JWT con refresh rotation y blacklist definidos desde H1/H2 y verificados en producción
- [ ] Rate limiting en endpoints de login (máximo 5 intentos por minuto)

**Performance:**
- [ ] select_related y prefetch_related en todos los ViewSets con relaciones
- [ ] Índices en todos los campos de filtro y búsqueda frecuente
- [ ] Paginación activa en todos los listados (máximo 50 registros sin paginación explícita)
- [ ] Next.js con output: 'standalone' para imagen Docker optimizada
- [ ] Imágenes de Next.js optimizadas con next/image

**Datos:**
- [ ] Script de carga inicial: superadmin, clínica, sede, categorías de gasto por defecto
- [ ] Comando `python manage.py seed_initial_data` documentado
- [ ] Backup configurado: pg_dump diario a las 2am, retención 30 días

**Operacional:**
- [ ] `docker-compose up` en Contabo/Hostinger funciona sin intervención manual
- [ ] Traefik genera certificados TLS automáticamente
- [ ] n8n ejecuta workflows periódicos (verificar historial de ejecuciones y logs)
- [ ] Logs de Django rotando (máximo 100MB, mantener 7 archivos)
- [ ] Variables de entorno en Dokploy — nunca en el repositorio

### Prompt para AI
```
Genera el script de datos iniciales para el proyecto de clínica estética.

Crea apps/core/management/commands/seed_initial_data.py (comando de Django):

El comando debe:
1. Crear superusuario 2ASoft si no existe (email desde settings, password desde env SUPERADMIN_PASSWORD)
2. Preguntar al usuario (input) los datos de la clínica: nombre, NIT
3. Crear Clinica con esos datos
4. Preguntar datos de la sede principal: nombre, ciudad, dirección, teléfono, horario básico (lunes-viernes 8am-6pm, sábado 8am-1pm)
5. Crear usuario admin para la clínica (email y password solicitados por input)
6. Crear CategoriaGasto por defecto: Aseo, Papelería, Cafetería, Mantenimiento, Varios
7. Crear CategoriaInsumo por defecto: Insumos médicos, Productos de belleza, Anestésicos, Equipos y materiales
8. Mostrar resumen de todo lo creado al final

Usar transaction.atomic() para toda la operación.
Imprimir mensajes con self.style.SUCCESS, self.style.WARNING, self.style.ERROR.
```

---

## Notas de desarrollo

### Orden recomendado de trabajo por sprint

**Sprint 1 (semanas 1-2):** H1 + H2 + H3 + H4 completos. Backend + frontend básico funcional con login y estructura de datos lista.

**Sprint 2 (semanas 2-3):** H5 + H6 completos. Módulo de pacientes y agenda funcionando — es el núcleo del producto.

**Sprint 3 (semana 3):** H7 + H8 + H9. Confirmación multicanal, historia clínica y consentimientos.

**Sprint 4 (semanas 4-5):** H10 + H11 + H12 + H13. Inventario completo con proveedores y cobros.

**Sprint 5 (semana 5):** H14 + H15 + H16. Caja, comisiones y asistencia.

**Sprint 6 (semana 6):** H17 + H18. Dashboard, QA y go-live.

### Reglas para usar el AI eficientemente

1. **Siempre pega las convenciones globales** al inicio de cada sesión nueva — el AI no recuerda entre sesiones.
2. **Un hito a la vez** — no pidas H6 sin haber completado H5. Las dependencias son reales.
3. **Revisa las migraciones** antes de aplicar — el AI a veces genera campos con nombres que colisionan con Django internals.
4. **Verifica los permisos** en cada ViewSet manualmente — es el error más difícil de encontrar en QA.
5. **Copia el prompt exacto** de cada tarea — están redactados con el contexto mínimo necesario para que el AI genere código correcto sin alucinar dependencias.
6. **Si el AI genera código que no sigue las convenciones**, corrígelo explícitamente en el mismo chat antes de seguir — no lo dejes pasar o la consistencia del proyecto se rompe rápido.

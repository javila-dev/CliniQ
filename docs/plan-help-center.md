# Plan — Centro de Ayuda (Help Center)

> **Estado (2026-09-12): Fases 1, 2, 3 y 4 implementadas y verificadas.** Backend con 22
> tests propios en verde + suite completa sin regresiones. Frontend compila, tipa limpio
> y se probó de punta a punta en el navegador: landing, categoría, artículo, videoteca,
> panel de gestión con drag-reorder, editor creando/guardando un artículo real, búsqueda
> fuzzy client-side (Fuse.js, sin red por tecla) y ayuda contextual (`helpSlug` en
> `PageHeader` + `HelpButton`) en Pacientes, Cotizaciones, Cartera y Equipo. Sin commitear
> todavía.

> Stack: mismo del core (Django + DRF + Next.js 15 App Router + PostgreSQL + MinIO)
> App nueva: `apps.ayuda`. Contenido **global** (igual para todas las clínicas).

---

## Objetivo

Un centro de ayuda dentro de la app con **FAQ / artículos** y **videos de ayuda**, más un
**panel de gestión con UX de primera** para que el equipo interno cargue y mantenga el
contenido sin necesidad de deploy.

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién edita el contenido | UI dedicada propia (no Django admin como herramienta principal) |
| Alcance del contenido | Global — un solo cuerpo de ayuda del producto, no personalizable por clínica |
| Videos | YouTube/Vimeo **no listados**. Se guarda solo la URL; embed y thumbnail se derivan. Cero storage propio. Ya existe canal de YouTube. |
| Quién **ve** el centro de ayuda | Cualquier `User` autenticado (`IsAuthenticated`). No filtra por rol ni por clínica. |
| Quién **gestiona** el contenido | `rol == "superadmin"` **o** `user.is_staff == True` |
| Portales públicos de pacientes | Fuera de alcance. Solo staff autenticado. |

### Sobre "staff"

En este código no hay una marca de rol "staff". Se usa el flag `is_staff` de Django
(heredado de `AbstractUser`), que **hoy no participa en ninguna autorización de la app**
(solo da acceso al admin de Django) y solo lo tienen los superusuarios. Se reutiliza
ese flag como "equipo interno de CliniQ": permite dar permiso de edición a personas del
equipo sin convertirlas en superadmin. Es un flag global (no atado a clínica), lo cual
encaja con contenido global.

---

## Lo que ya existe y se reutiliza

| Necesidad | Componente existente |
|---|---|
| Patrón de app DRF (BaseModel, router, viewsets con mixins) | `apps/obesidad` |
| Subida de archivos a bucket público + URL pública | `apps/core/storage.py` → `upload_public_file`, `get_public_url` |
| Permission classes | `apps/users/permissions.py` (`IsSuperAdmin`, `RequirePermission`, ...) |
| Paneles admin en el front | `/admin/planes`, `/admin/tenants` (react-query + react-hook-form + zod + shadcn/ui) |
| Drag & drop / sortable | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (ya instalados) |
| Guard de cambios sin guardar | `frontend/src/components/ui/confirm-dialog.tsx` |
| Sidebar por permisos | `frontend/src/components/shared/AppShell.tsx` (`buildNav`) |

### Dependencias nuevas (frontend)

- `react-markdown` + `remark-gfm` — render de Markdown
- `@tailwindcss/typography` — clase `prose` para el artículo renderizado

dnd-kit ya está. No se agrega editor pesado: el editor Markdown se arma sobre un
`<textarea>` con toolbar propia.

---

## Backend — `backend/apps/ayuda/`

Estructura estándar (misma que `apps/obesidad`):

```
apps/ayuda/
  __init__.py
  apps.py
  models.py
  serializers.py
  views.py
  urls.py
  admin.py            # respaldo para superadmin; no es la herramienta principal
  migrations/0001_initial.py
  tests/
```

Registro:
- `backend/config/settings/base.py` → `LOCAL_APPS += ["apps.ayuda"]`
- `backend/config/urls.py` → `path("ayuda/", include("apps.ayuda.urls"))` dentro de `api_urlpatterns`

### Modelos

#### `CategoriaAyuda(BaseModel)`

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | `CharField(100)` | |
| `slug` | `SlugField(unique=True)` | autogenerado del nombre si viene vacío |
| `descripcion` | `CharField(255, blank=True)` | subtítulo en la card |
| `icono` | `CharField(40, blank=True)` | nombre de icono lucide (ej. `"calendar-days"`) |
| `orden` | `PositiveIntegerField(default=0)` | para dnd |

`Meta.ordering = ["orden", "nombre"]`, `db_table = "ayuda_categorias"`.

#### `ArticuloAyuda(BaseModel)`

| Campo | Tipo | Notas |
|---|---|---|
| `categoria` | `FK(CategoriaAyuda, PROTECT, related_name="articulos")` | |
| `titulo` | `CharField(160)` | |
| `slug` | `SlugField(unique=True)` | autogenerado; avisa en UI si cambia uno publicado |
| `resumen` | `CharField(300, blank=True)` | para cards y búsqueda |
| `contenido` | `TextField(blank=True)` | Markdown |
| `video_url` | `URLField(blank=True)` | YouTube/Vimeo no listado; opcional |
| `keywords` | `CharField(255, blank=True)` | términos extra para búsqueda, separados por coma |
| `area` | `CharField(30, blank=True, choices=AREA_CHOICES)` | agenda / pacientes / cartera / cotizaciones / configuracion / general |
| `orden` | `PositiveIntegerField(default=0)` | dentro de la categoría, para dnd |
| `destacado` | `BooleanField(default=False)` | aparece en el landing |
| `estado` | `CharField(12, choices=Estado.choices, default="borrador")` | `borrador` / `publicado` (deja lugar a `archivado`) |
| `publicado_at` | `DateTimeField(null=True, blank=True)` | se setea al pasar a `publicado`; ordena "novedades" |
| `vistas` | `PositiveIntegerField(default=0)` | contador (fase 4) |
| `util_si` / `util_no` | `PositiveIntegerField(default=0)` | feedback 👍/👎 (fase 4) |
| `actualizado_por` | `FK(User, SET_NULL, null=True)` | quién tocó el artículo por última vez |

`Meta.ordering = ["orden", "-publicado_at"]`, `db_table = "ayuda_articulos"`.

Propiedad/serializer `tiene_video = bool(video_url)`.

> Un "video de ayuda" no es un modelo aparte: es un `ArticuloAyuda` con `video_url`. La
> videoteca (`/ayuda/videos`) filtra `tiene_video`.

### Serializers

- `CategoriaAyudaSerializer` — incluye `articulos_count` (publicados) por `SerializerMethodField` o `annotate`.
- `ArticuloAyudaListSerializer` — `id, titulo, slug, resumen, categoria (slug+nombre), area, tiene_video, thumbnail_url, destacado, estado, publicado_at, updated_at`.
- `ArticuloAyudaDetailSerializer` — todo lo anterior + `contenido`, `video_url`, `video_provider`, `video_id`, `keywords`, `vistas`, `util_si`, `util_no`.
- `ArticuloAyudaWriteSerializer` — campos editables; autogenera `slug` si viene vacío; setea `publicado_at` al pasar a `publicado`; `actualizado_por = request.user`.

Derivación del video en el serializer:
- `video_provider` ∈ {`youtube`, `vimeo`}, `video_id` parseado de la URL.
- `thumbnail_url`:
  - YouTube → `https://i.ytimg.com/vi/{id}/hqdefault.jpg`
  - Vimeo → oEmbed (`https://vimeo.com/api/oembed.json?url=...`), cacheado; fallback a `null`.

### Views — `ArticuloAyudaViewSet` y `CategoriaAyudaViewSet`

Un solo viewset por recurso, con **permisos por acción**:

```python
def get_permissions(self):
    if self.action in ("list", "retrieve", "feedback"):
        return [IsAuthenticated()]
    return [PuedeGestionarAyuda()]
```

- **Sin** filtro por `clinica_id`.
- **Sin** `TrialNotExpired` (hay que poder leer "cómo activar el plan" con el trial vencido).
- `list`/`retrieve` públicos devuelven **solo** `estado == "publicado"`, salvo:
  - `?preview=1` **y** el request pasa `PuedeGestionarAyuda` → incluye borradores (para "previsualizar como staff").

Endpoints:

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/v1/ayuda/categorias/` | auth | categorías + `articulos_count` |
| GET | `/api/v1/ayuda/articulos/` | auth | filtros `?categoria=&area=&search=&tiene_video=true&destacado=true` |
| GET | `/api/v1/ayuda/articulos/{slug}/` | auth | detalle; `?preview=1` para gestores |
| POST | `/api/v1/ayuda/articulos/{slug}/feedback/` | auth | body `{ util: true|false }` → incrementa `util_si`/`util_no` con `F()` |
| POST | `/api/v1/ayuda/categorias/` · PATCH · DELETE | gestor | CRUD categorías |
| POST | `/api/v1/ayuda/articulos/` · PATCH · DELETE | gestor | CRUD artículos |
| POST | `/api/v1/ayuda/categorias/reordenar/` | gestor | body `{ orden: [id, id, ...] }` |
| POST | `/api/v1/ayuda/articulos/reordenar/` | gestor | body `{ categoria: id, orden: [id, ...] }` |
| POST | `/api/v1/ayuda/imagenes/` | gestor | multipart `archivo` → `{ url }` (bucket público) |

`list`/`retrieve` incrementan `vistas` con `F("vistas") + 1` (sin romper caché de queryset).

### Subida de imágenes

`POST /api/v1/ayuda/imagenes/`:
- Valida content-type (`image/png|jpeg|webp|gif`) y tamaño (≤ 5 MB).
- `path = f"ayuda/imagenes/{uuid4().hex}{ext}"`.
- `upload_public_file(bytes, path, content_type)` → `get_public_url(path)`.
- Devuelve `{ "url": "<public_url>" }`. El front inserta `![](url)` en el cursor del editor.
- No se crea modelo para las imágenes en fase 1 (se aceptan huérfanas). Limpieza = fase posterior si hace falta.

### Permission class nueva — `apps/users/permissions.py`

```python
class PuedeGestionarAyuda(BasePermission):
    message = "Solo el equipo interno puede editar el centro de ayuda."

    def has_permission(self, request, view):
        u = request.user
        return bool(
            u and u.is_authenticated and (u.rol == "superadmin" or u.is_staff)
        )
```

### Exponer `is_staff`

Agregar `is_staff` (read-only) al serializer del usuario que arma la respuesta de
`/auth/login`, `/auth/refresh` y `/auth/me`, para que el front pueda gatear la UI.

### Seed inicial

Data migration o comando `seed_ayuda` con:
- 5–6 categorías (Primeros pasos, Agenda, Pacientes, Cotizaciones, Cartera y cobros, Configuración).
- 8–10 artículos FAQ base.
- 2–3 artículos con video (URLs del canal de YouTube existente).

### `admin.py` (respaldo)

`ModelAdmin` para `CategoriaAyuda` y `ArticuloAyuda` con `list_display`, `list_filter`
(`estado`, `categoria`, `area`), `prepopulated_fields = {"slug": ("titulo",)}`,
`search_fields`. Es un respaldo para superadmin; la herramienta real es el panel del front.

---

## Frontend — Centro de ayuda (staff)

Rutas bajo `frontend/src/app/(authenticated)/ayuda/`:

| Ruta | Contenido |
|---|---|
| `/ayuda` | Landing: buscador grande, grid de categorías, artículos destacados, videos destacados, y bloque **"Novedades"** (artículos publicados recientes, orden por `publicado_at` desc). Header con botón **"Gestionar contenido"** si `canAccess.ayudaAdmin`. |
| `/ayuda/[categoria]` | Lista de artículos de la categoría. |
| `/ayuda/articulo/[slug]` | Artículo: si hay `video_url`, embed arriba; luego Markdown renderizado (`prose`). Bloque "¿te sirvió?" 👍/👎 (fase 4). Acepta `?preview=1`. |
| `/ayuda/videos` | Videoteca: grid de thumbnails (`tiene_video`), click → `/ayuda/articulo/[slug]`. |

### Componentes — `frontend/src/components/ayuda/`

- `AyudaSearchBar.tsx` — input + resultados (fase 1: server `?search=`; fase 4: Fuse.js).
- `CategoriaCard.tsx` — icono lucide dinámico + nombre + count.
- `ArticuloView.tsx` — `react-markdown` + `remark-gfm`, clase `prose`. **Reutilizado por el editor como preview.**
- `VideoEmbed.tsx` — parsea provider/id → iframe `youtube-nocookie.com` / `player.vimeo.com`, `loading="lazy"`, `aspect-video`.
- `VideoCard.tsx` / `VideoGrid.tsx` — thumbnail + duración + título.

### API client — `frontend/src/lib/api/ayuda.ts`

```ts
export const ayudaApi = {
  categorias: () => ...,                      // GET /ayuda/categorias/
  articulos: (params) => ...,                 // GET /ayuda/articulos/
  articulo: (slug, { preview } = {}) => ...,  // GET /ayuda/articulos/{slug}/
  feedback: (slug, util: boolean) => ...,     // POST .../feedback/
}
```

### Tipos — `frontend/src/types/ayuda.ts`

`CategoriaAyuda`, `ArticuloAyudaLista`, `ArticuloAyudaDetalle`, `AreaAyuda`.

### `AuthUser` y permisos

- `frontend/src/types/auth.ts` → agregar `is_staff: boolean`.
- `frontend/src/lib/permissions.ts` → `canAccess.ayudaAdmin = (u) => isSuperAdmin(u) || !!u?.is_staff`.

### Sidebar — `AppShell.tsx`

- `NAV.ayuda = { href: '/ayuda', label: 'Centro de ayuda', icon: HelpCircle }` — **sin permiso**, visible siempre, al fondo (junto a Configuración o antes del bloque de usuario).
- **Sin ítem de gestión en el sidebar.** El acceso al panel es solo el botón "Gestionar contenido" en el header de `/ayuda`, visible únicamente si `canAccess.ayudaAdmin(user)`.

---

## Frontend — Panel de gestión

> **Ruta: `/ayuda/gestion` (NO bajo `/admin/`).**
> `admin/layout.tsx` bloquea todo `/admin/*` a superadmin vía `RoleGuard check={canAccess.admin}`.
> El panel de ayuda necesita su propio guard porque lo usan también `is_staff` no-superadmin.

Rutas bajo `frontend/src/app/(authenticated)/ayuda/gestion/`:

| Ruta | Contenido |
|---|---|
| `gestion/layout.tsx` | `RoleGuard check={canAccess.ayudaAdmin}` |
| `gestion/page.tsx` | Vista lista de 2 paneles |
| `gestion/articulo/nuevo/page.tsx` | Editor (crear) |
| `gestion/articulo/[id]/page.tsx` | Editor (editar) |

### Vista lista (`gestion/page.tsx`)

- **Riel izquierdo**: categorías con **drag-to-reorder** (dnd-kit `SortableContext`), cada una con count de artículos y publicados. Botón "+ Categoría" (dialog inline). Click filtra el panel principal. Entrada "Todos".
- **Panel principal**: tabla de artículos de la categoría seleccionada, **drag-reorder** por fila.
  - Columnas: *Título · Estado (badge borrador/publicado) · Área · Video (icono) · Actualizado*.
  - Acciones por fila (`DropdownMenu`): Editar · Duplicar · Previsualizar (abre `/ayuda/articulo/[slug]?preview=1`) · Publicar/Despublicar · Eliminar (con `confirm-dialog`).
- **Barra superior**: búsqueda, filtro estado, filtro área, botón "+ Artículo".
- Reorden → `ayudaAdminApi.reordenarArticulos(...)` / `reordenarCategorias(...)`, optimistic con react-query.

### Editor (`gestion/articulo/[id]/page.tsx`)

Página completa, layout de 2 columnas (en mobile: tabs Editar / Vista previa).

- **Izquierda — editor Markdown**: `<textarea>` con toolbar propia (negrita, itálica, H2, H3, link, lista, cita, código, imagen). Atajos de teclado básicos (`Cmd/Ctrl+B`, `+I`, `+K` para link).
- **Derecha — preview en vivo**: renderiza con `<ArticuloView>` (el mismo componente que ve el staff), incluido el embed de video.
- **Panel de metadatos** (columna lateral o colapsable):
  - Categoría (`select`), Área (`select`, opcional).
  - Título → **slug autogenerado**, editable; si el artículo ya está `publicado` y se cambia el slug, warning ("los enlaces existentes dejarán de funcionar").
  - Resumen (`textarea` corto).
  - Keywords (input de tags → string separado por coma).
  - **Video**: input URL → debajo, preview del embed en vivo (`<VideoEmbed>`).
  - Toggle **Destacado**.
  - Toggle grande arriba: **Borrador / Publicado**.
- **Imágenes**: arrastrar o pegar imagen en el `<textarea>` → `ayudaAdminApi.subirImagen(file)` → inserta `![](url)` en la posición del cursor, con barra de progreso y estado de error.
- **Autosave** de borrador cada ~5 s cuando hay cambios; indicador "Guardando… / Guardado ✓ hace Xs". Botón explícito "Guardar" también.
- **Guard de salida** con `confirm-dialog` si hay cambios sin guardar.
- **"Previsualizar como staff"**: abre `/ayuda/articulo/[slug]?preview=1` en pestaña nueva.
- Metadato visible: "Última edición por {actualizado_por} · {updated_at}". Versionado completo = fuera de alcance.

### API client admin — `frontend/src/lib/api/ayuda.ts` (mismo archivo)

```ts
export const ayudaAdminApi = {
  crearCategoria, actualizarCategoria, eliminarCategoria, reordenarCategorias,
  crearArticulo, actualizarArticulo, eliminarArticulo, reordenarArticulos,
  duplicarArticulo,          // cliente: get + crear con titulo "… (copia)", estado borrador
  subirImagen,               // POST /ayuda/imagenes/ (multipart) → { url }
}
```

---

## Fases

### Fase 1 — Backend `ayuda`
Modelos + migración, serializers, `ArticuloAyudaViewSet` / `CategoriaAyudaViewSet` con
permisos por acción, acciones `reordenar` · `feedback` · `subir_imagen`, permission
class `PuedeGestionarAyuda`, exponer `is_staff` en el serializer de usuario, registro en
`settings`/`urls`, seed inicial, `admin.py`, tests.

### Fase 2 — Panel `/ayuda/gestion`
Guard `canAccess.ayudaAdmin`, vista lista 2 paneles con dnd, editor split con preview en
vivo, subida de imágenes por drag/paste, autosave + guard de salida, previsualizar como
staff. Añadir `is_staff` a `AuthUser` y `canAccess.ayudaAdmin`.

### Fase 3 — Centro de ayuda (staff)
Rutas `/ayuda`, `/ayuda/[categoria]`, `/ayuda/articulo/[slug]`, `/ayuda/videos`.
Componentes de consumo. Landing con bloque "Novedades" (por `publicado_at`). Ítem de
sidebar `/ayuda` + botón "Gestionar contenido" (solo `canAccess.ayudaAdmin`). Deps
`react-markdown` + `remark-gfm` + `@tailwindcss/typography`.

> Se puede hacer Fase 1 → Fase 3 y cargar contenido provisorio por el `admin.py` de
> Django mientras se construye la Fase 2.

### Fase 4 — Extras
- Contador de `vistas` mostrado en gestión (qué artículos importan).
- Feedback 👍/👎 en `/ayuda/articulo/[slug]` + `util_si`/`util_no` en la tabla de gestión.
- Búsqueda fuzzy client-side (Fuse.js) sobre el corpus cargado.
- Ayuda contextual: prop `helpSlug` en páginas clave → botón `?` que abre el artículo.
- (Si hace falta) modelo `ImagenAyuda` + limpieza de huérfanas. Fase 1 acepta imágenes huérfanas.

---

## Archivos

### Nuevos — backend
```
backend/apps/ayuda/__init__.py
backend/apps/ayuda/apps.py
backend/apps/ayuda/models.py
backend/apps/ayuda/serializers.py
backend/apps/ayuda/views.py
backend/apps/ayuda/urls.py
backend/apps/ayuda/admin.py
backend/apps/ayuda/migrations/0001_initial.py
backend/apps/ayuda/migrations/0002_seed_ayuda.py   # o management command
backend/apps/ayuda/tests/test_ayuda.py
```

### Modificados — backend
```
backend/config/settings/base.py          # LOCAL_APPS += "apps.ayuda"
backend/config/urls.py                    # path("ayuda/", include("apps.ayuda.urls"))
backend/apps/users/permissions.py         # + PuedeGestionarAyuda
backend/apps/users/serializers.py         # + is_staff en el user serializer
```

### Nuevos — frontend
```
frontend/src/types/ayuda.ts
frontend/src/lib/api/ayuda.ts
frontend/src/components/ayuda/AyudaSearchBar.tsx
frontend/src/components/ayuda/CategoriaCard.tsx
frontend/src/components/ayuda/ArticuloView.tsx
frontend/src/components/ayuda/VideoEmbed.tsx
frontend/src/components/ayuda/VideoCard.tsx
frontend/src/components/ayuda/VideoGrid.tsx
frontend/src/app/(authenticated)/ayuda/page.tsx
frontend/src/app/(authenticated)/ayuda/[categoria]/page.tsx
frontend/src/app/(authenticated)/ayuda/articulo/[slug]/page.tsx
frontend/src/app/(authenticated)/ayuda/videos/page.tsx
frontend/src/app/(authenticated)/ayuda/gestion/layout.tsx
frontend/src/app/(authenticated)/ayuda/gestion/page.tsx
frontend/src/app/(authenticated)/ayuda/gestion/articulo/nuevo/page.tsx
frontend/src/app/(authenticated)/ayuda/gestion/articulo/[id]/page.tsx
frontend/src/components/ayuda/gestion/CategoriaRail.tsx
frontend/src/components/ayuda/gestion/ArticulosTable.tsx
frontend/src/components/ayuda/gestion/MarkdownEditor.tsx
frontend/src/components/ayuda/gestion/MetadataPanel.tsx
```

### Modificados — frontend
```
frontend/src/types/auth.ts               # + is_staff
frontend/src/lib/permissions.ts          # + canAccess.ayudaAdmin
frontend/src/components/shared/AppShell.tsx  # ítem "Centro de ayuda" (+ "Gestión de ayuda")
frontend/package.json                     # react-markdown, remark-gfm, @tailwindcss/typography
```

---

## Puntos cerrados

- Acceso al panel de gestión: **solo botón** "Gestionar contenido" en el header de `/ayuda` (visible solo a `superadmin` / `is_staff`). Sin ítem en el sidebar.
- Bloque **"Novedades"** en el landing (orden por `publicado_at`): **desde el inicio** (fase 3).
- Imágenes huérfanas: **aceptadas en fase 1**; limpieza y modelo `ImagenAyuda` quedan para fase 4 si hacen falta.

---

## Contenido (2026-09-12)

El contenido base dejó de vivir en la migración de seed y pasó a un corpus propio:
`backend/apps/ayuda/contenido/`, un módulo por categoría más un `__init__.py` con la
lista de categorías, la agregación de artículos, validaciones y la función `cargar()`.

- **11 categorías / 52 artículos**, todos publicados.
- Se **conservan los 9 slugs** del seed original (URLs y `helpSlug` de `PageHeader`).
- Carga automática en deploy: migración `ayuda/0003_contenido_ayuda` (upsert por slug,
  sin reversa, no borra artículos creados desde el panel).
- Refresco manual tras editar el corpus: `python manage.py cargar_ayuda`
  (`--dry-run` para validar y contar sin escribir).

| Categoría | Artículos |
|---|---|
| Primeros pasos | 5 |
| Agenda y citas | 5 |
| Pacientes e historia clínica | 6 |
| Atención al paciente | 4 |
| Cotizaciones y ventas | 5 |
| Cartera y cobros | 5 |
| Caja, ingresos y resultados | 5 |
| Consentimientos y firmas | 4 |
| Catálogo de servicios | 4 |
| Configuración y equipo | 7 |
| Inventario y compras | 2 |

Pendiente: ningún artículo tiene `video_url` todavía (la videoteca queda vacía hasta
cargar URLs del canal de YouTube) y la ayuda contextual (`helpSlug`) sigue cableada solo
en Pacientes, Cotizaciones, Cartera y Equipo.

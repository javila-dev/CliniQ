# Plan Frontend — Sistema de gestión clínica estética
> Derivado de `Plan.md`. Este documento organiza solo el carril frontend y deja explícito de qué contratos backend depende cada módulo.

---

## Cómo usar este documento

Frontend no arranca módulos por intuición: cada fase depende de un contrato backend estable. Si el backend aún no cerró payloads, permisos o estados, no cerrar la UI como terminada.

## Reglas de coordinación con backend

- Consumir solo endpoints que ya estén estables en `Plan.md` o `plan-backend.md`.
- No inventar campos que el backend no exponga.
- Validar Zod según las mismas reglas del serializer backend.
- Si falta un campo para una UX importante, devolver feedback al carril backend antes de maquillar la UI.

## Convenciones clave

- Todas las llamadas API en `src/lib/api/<recurso>.ts`.
- Formularios con React Hook Form + Zod.
- Tablas con TanStack Table.
- Auth del MVP: access token en memoria, refresh token en cookie segura gestionada por backend, sin localStorage.
- No cachear URLs firmadas de MinIO más allá de su ventana útil.
- **Arquitectura 2 buckets (H29):** MinIO tiene dos buckets:
  - `clinica-static` (PÚBLICO): logos, fotos de perfil, assets. URL directa, sin `X-Amz-*`, cargable por el browser directamente.
  - `clinica-media` (PRIVADO): fotos clínicas, consentimientos, check-ins. URL presignada con `X-Amz-*`, TTL 1h. El browser no puede resolver el hostname interno → usar `/api/media-proxy`.
- Detectar tipo de URL con `resolveMediaUrl()` (`src/lib/utils/media.ts`): sin `X-Amz-` → mostrar directo; con `X-Amz-` → usar proxy.

## Orden frontend recomendado

### Fase F1 — Auth y shell de aplicación

Depende de backend:
- `/api/v1/auth/login/`
- `/api/v1/auth/refresh/`
- `/api/v1/auth/logout/`
- `/api/v1/auth/me/`

Construir:
- login
- store/auth hook
- cliente axios con `withCredentials`
- layout protegido
- navegación base del dashboard

Notas de implementación:
- El store de auth debe persistir en memoria no solo `user.rol`, sino también `role_id`, `role_nombre` y `permissions`.
- La UI no debe resolver accesos por strings fijos tipo `admin|recepcion`; debe usar `permissions.includes("<clave>")`.
- `superadmin` no debe modelarse como rol de producto en frontend; existe solo como usuario técnico y el shell tenant debe diseñarse alrededor de permisos.

Entregable UX:
- inicio de sesión real
- redirección por sesión
- manejo visible de errores

### Fase F1.5 — Gestión de usuarios y permisos

Depende de backend:
- `GET /api/v1/usuarios/`
- `POST /api/v1/usuarios/`
- `PATCH /api/v1/usuarios/{id}/`
- `DELETE /api/v1/usuarios/{id}/`
- `POST /api/v1/usuarios/{id}/cambiar_password/`
- `POST /api/v1/usuarios/{id}/activar/`
- `POST /api/v1/usuarios/{id}/desactivar/`
- `GET /api/v1/usuarios/permisos/`
- `GET /api/v1/usuarios/roles/`
- `POST /api/v1/usuarios/roles/`
- `GET /api/v1/usuarios/roles/{id}/`
- `PATCH /api/v1/usuarios/roles/{id}/`
- `DELETE /api/v1/usuarios/roles/{id}/`
- `PUT /api/v1/usuarios/roles/{id}/permisos/`

**Definition of done:**
- [ ] Tabla de usuarios con filtro por rol dinámico (`rol=<slug>`) y estado activo/inactivo
- [ ] Crear usuario desde sheet lateral usando `rol` o `role_id`
- [ ] Editar rol, nombre y teléfono desde sheet lateral
- [ ] Cambiar contraseña desde el detalle
- [ ] Activar / desactivar con confirmación
- [ ] Eliminar usuario con confirmación y manejo de errores cuando tenga relaciones
- [ ] Pantalla de roles con tabla, alta, edición y borrado de roles editables
- [ ] Editor de permisos por rol usando matriz agrupada por módulo
- [ ] Sidebar y guards de rutas resueltos por `permissions[]`, no por roles fijos
- [ ] Acceso a configuración resuelto por permisos `usuarios.*` y `roles.*`

Construir:
1. `src/types/auth.ts` — extender tipos de sesión con `role_id`, `role_nombre`, `permissions: string[]`
2. `src/types/usuarios.ts` — interfaces `UsuarioAdmin`, `CreateUsuarioRequest`, `UpdateUsuarioRequest`, `Rol`, `Permiso`
3. `src/lib/api/usuarios.ts` — listado/CRUD de usuarios + cambio de password + activar/desactivar
4. `src/lib/api/roles.ts` — listado/CRUD de roles + update de permisos + catálogo de permisos
5. `src/lib/permissions.ts` — helpers `hasPermission`, `hasAnyPermission`, `canAccessRoute`
6. `src/app/configuracion/usuarios/page.tsx` — tabla + sheet de creación/edición
7. `src/app/configuracion/roles/page.tsx` — tabla de roles + editor de permisos
8. Agregar en sidebar:
   - "Configuración › Usuarios" visible con `usuarios.ver`
   - "Configuración › Roles" visible con `roles.ver`

Entregable UX:
- El tenant admin puede gestionar usuarios y roles sin tocar Django admin.
- La aplicación puede soportar roles personalizados como `auxiliar` sin cambios de UI adicionales.

Contrato frontend importante:
- `rol` en responses es el slug compatible del rol dinámico; no asumir catálogo fijo.
- `role_id` es la referencia estable para selects y updates.
- `permissions` es la fuente de verdad para mostrar acciones, rutas y CTAs.
- `role_id` y `rol` son excluyentes al crear/editar usuario; preferir `role_id` en formularios nuevos.
- Para profesionales con perfil laboral, la creación sigue viviendo en `/colaboradores/`, no en `/usuarios/`.

UX esperada de `/configuracion/roles`:
- Tabla con `nombre`, `slug`, cantidad de usuarios, editable, activo.
- Sheet o página detalle para crear/editar rol.
- Editor de permisos agrupado por `modulo`, con checkbox por permiso.
- Los permisos no asignables no se muestran como editables; si se listan, deben verse bloqueados.
- El rol `admin` debe verse como rol de sistema no editable/no eliminable.

UX esperada de `/configuracion/usuarios`:
- Tabla con columnas `nombre`, `email`, `rol`, `activo`, `sede_principal_nombre`.
- Filtro por `rol` usando opciones cargadas desde `/usuarios/roles/`.
- Formulario de alta/edición con select de rol basado en `role_id`.
- Acciones por fila visibles según permisos: editar, activar/desactivar, eliminar, cambiar contraseña.

---

### Fase F2 — Pacientes

Depende de backend:
- CRUD pacientes
- `GET /pacientes/buscar/`

Construir:
- listado
- búsqueda
- alta/edición
- detalle
- acceso a historia clínica desde ficha

Entregable UX:
- flujo rápido de búsqueda o creación de paciente antes de agendar

---

#### F2.2 — Formulario de paciente extendido con datos demográficos y de afiliación

**Motivación:** el formulario actual solo captura identidad y contacto. La captura en producción requiere datos de residencia, perfil socioeconómico, grupo sanguíneo y afiliación al SGSSS. Algunos de estos campos se almacenaron temporalmente en `localStorage` (datos_comp_*) como puente; este hito los mueve al backend (depende de H5.2) y enriquece el formulario con secciones agrupadas.

**Depende de backend:** H5.2 — campos extendidos en `Paciente`.

**Archivos que se tocan:**
- `src/types/pacientes.ts` — nuevos campos en `Paciente` y `CreatePacienteRequest`
- `src/components/pacientes/PacienteForm.tsx` — 5 nuevas secciones
- `src/components/historia/TabDatosGenerales.tsx` — eliminar bloque localStorage `datos_comp_*` y leer del objeto `Paciente`

**Cambios en `src/types/pacientes.ts`:**

Agregar a `Paciente` y `CreatePacienteRequest` (todos opcionales):
```typescript
// Residencia
direccion?:              string
ciudad?:                 string
barrio?:                 string

// Perfil socioeconómico
estado_civil?:           'soltero' | 'casado' | 'union_libre' | 'separado' | 'divorciado' | 'viudo'
ocupacion?:              string
escolaridad?:            'ninguna' | 'primaria' | 'secundaria' | 'tecnico' | 'universitario' | 'posgrado'
grupo_etnico?:           'mestizo' | 'blanco' | 'afrocolombiano' | 'indigena' | 'raizal' | 'rom' | 'otro'

// Datos de salud
grupo_sanguineo?:        'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'

// Seguridad social SGSSS
eps?:                    string
tipo_afiliado?:          'cotizante' | 'beneficiario' | 'independiente' | 'subsidiado' | 'vinculado'
regimen?:                'contributivo' | 'subsidiado' | 'vinculado' | 'especial' | 'pensionado'

// Responsable / acompañante
nombre_responsable?:     string
parentesco_responsable?: string
telefono_responsable?:   string
```

**Estructura de secciones en `PacienteForm`:**

El formulario queda en 4 bloques visuales separados por `<Separator />` y etiqueta de sección:

1. **Identificación** — campos actuales (nombres, apellidos, tipo/número doc, sexo, fecha nacimiento)
2. **Contacto** — teléfono, email, canal de confirmación
3. **Residencia** — direccion, ciudad, barrio
4. **Perfil socioeconómico** — estado_civil, ocupacion, escolaridad, grupo_etnico *(todos Select)*
5. **Salud y seguridad social** — grupo_sanguineo, eps, tipo_afiliado, regimen
6. **Responsable / acompañante** — nombre_responsable, parentesco_responsable, telefono_responsable
7. **Autorización** — autoriza_datos *(bloque existente, queda al final)*

Las secciones 3–6 son opcionales y se muestran siempre (no colapsables); el formulario de creación rápida desde `NuevaCitaModal` puede omitir secciones 3–6 usando un prop `compact?: boolean` que las oculta.

**Cambios en `TabDatosGenerales`:**
- Eliminar el bloque localStorage `datos_comp_${paciente.id}` y el formulario inline asociado.
- Los campos `ocupacion`, `grupo_sanguineo`, `estado_civil`, `eps`, `direccion` ahora vienen directamente del objeto `paciente` devuelto por el backend.
- El widget de signos vitales (`SignosVitalesWidget`) se mantiene en localStorage hasta H5.3 (no tocar).

**Definition of done:**
- [ ] Tipos actualizados con todos los campos nuevos (todos opcionales)
- [ ] `PacienteForm` muestra las 6 secciones con layout de 2 columnas para los campos tipo Select
- [ ] Prop `compact` oculta secciones 3–6 para el flujo rápido de creación en `NuevaCitaModal`
- [ ] `TabDatosGenerales` elimina el bloque localStorage y lee directo del objeto `Paciente`
- [ ] La edición de paciente desde `/pacientes/[id]` persiste los nuevos campos correctamente
- [ ] Los campos Select tienen opción vacía `"— Sin especificar —"` para todos los enums opcionales

---

### Fase F3 — Agenda

Depende de backend:
- CRUD citas
- `GET /colaboradores/profesionales/`
- `GET /clinicas/servicios/activos/`
- `GET /agenda/citas/slots_disponibles/`
- `POST /agenda/citas/{id}/cambiar_estado/`
- `GET /agenda/citas/hoy/`

Construir:
- calendario día/semana
- alta de cita por pasos
- detalle de cita
- cambio de estado
- filtros por sede y profesional

Entregable UX:
- recepción puede crear, revisar y mover citas sin salir del calendario

### Fase F4 — Confirmación pública

Depende de backend:
- `GET /api/v1/agenda/confirmar/{token}/detalle/`
- `POST /api/v1/agenda/confirmar/{token}/`
- `PATCH /api/v1/agenda/{id}/confirmar_manual/`

Construir:
- pantalla pública de confirmación
- CTA de confirmar
- fallback de contacto con clínica
- confirmación manual desde dashboard

Entregable UX:
- paciente confirma desde móvil con flujo simple y sin autenticación

### Fase F5 — Historia clínica estética y pantalla de atención dedicada

Depende de backend (H8):
- `GET /historia-clinica/historias/?paciente=<uuid>`
- `GET /historia-clinica/historias/{id}/notas/`
- `POST /historia-clinica/notas/` — con campos estéticos nuevos
- `POST /historia-clinica/fotos/`
- `GET /pacientes/{id}/antecedentes/`
- `PUT /pacientes/{id}/antecedentes/`
- `PATCH /pacientes/{id}/antecedentes/`

Depende de backend (H9):
- `GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>`
- `POST /historia-clinica/consentimientos/`
- `PATCH /historia-clinica/consentimientos/{id}/`

**Definition of done:**
- [ ] Ruta `/atenciones/[citaId]` — pantalla dedicada de atención con 3 paneles
- [ ] Panel izquierdo: datos del paciente, alertas de alergias/contraindicaciones, semáforo de consentimientos, mini-timeline últimas 4 citas
- [ ] Panel central: formulario de registro del procedimiento actual con campos estéticos
- [ ] Panel derecho: historial de notas previas expandibles
- [ ] Formulario de antecedentes: accesible desde el panel izquierdo (sheet lateral)
- [ ] La página `/atenciones` (cola del día) enlaza al botón "Atender" → `/atenciones/[citaId]`
- [ ] La página `/pacientes/[id]/historia` sigue existiendo como vista archivística completa

---

#### Pantalla `/atenciones/[citaId]` — layout y componentes

**Layout:** 3 columnas en desktop, tabs en mobile.

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Atenciones    PACIENTE EN ATENCIÓN: María García   [Completar]│
├───────────────┬─────────────────────────────┬────────────────────┤
│  PACIENTE     │   CITA ACTUAL               │  HISTORIAL         │
│  (col 1/4)    │   (col 2/4)                 │  (col 1/4)         │
└───────────────┴─────────────────────────────┴────────────────────┘
```

**Componente: `PanelPaciente`** (`src/components/atenciones/PanelPaciente.tsx`)

Muestra:
- Avatar, nombre completo, edad calculada desde fecha_nacimiento, tipo de piel (Fitzpatrick)
- Bloque de alertas: si `antecedentes.alergias` o `antecedentes.contraindicaciones` no están vacíos, mostrar con fondo ámbar/rojo. Si vacíos, mostrar "Sin alertas registradas" en gris.
- Botón "Editar antecedentes" → abre `AntecedentesSheet` (sheet lateral)
- **Semáforo de consentimientos:** consume `GET /consentimientos/resumen/`; muestra cada tipo con ícono:
  - verde: firmado y vigente
  - naranja: firmado pero vencido
  - gris: no firmado
  - Solo mostrar los relevantes al servicio de la cita (el backend devuelve todos; el frontend filtra por relevancia según `servicio_nombre`)
- Mini-timeline: últimas 4 notas del historial (fecha + tipo + servicio), solo lectura

**Componente: `AntecedentesSheet`** (`src/components/atenciones/AntecedentesSheet.tsx`)

Sheet lateral con formulario React Hook Form + Zod:
- Campos: `alergias`, `medicamentos_actuales`, `condiciones_medicas`, `contraindicaciones`, `tipo_piel` (select Fitzpatrick), `antecedentes_esteticos`
- `PUT /pacientes/{id}/antecedentes/` al guardar
- Se prefill desde `GET /pacientes/{id}/antecedentes/` si existe

**Componente: `FormularioProcedimiento`** (`src/components/atenciones/FormularioProcedimiento.tsx`)

Reemplaza el `NuevaNotaForm` genérico. Campos organizados en secciones:

*Sección 1 — Identificación:*
- `tipo`: selector (consulta / procedimiento / evolucion / aclaratoria)

*Sección 2 — Descripción clínica (visible en todos los tipos):*
- `anamnesis`: textarea "Motivo de consulta / evolución del paciente"
- `diagnostico`: textarea

*Sección 3 — Procedimiento estético (visible si tipo = procedimiento):*
- `zona_tratada`: tabla dinámica con botón "+ Agregar zona". Columnas: Zona (input), Descripción (input), Unidades/dosis (input). Mínimo 1 fila si se abre la sección.
- `productos_usados`: tabla dinámica con "+ Agregar producto". Columnas: Nombre, Marca, Lote, Cantidad, Unidad.
- `tecnica`: input de texto libre

*Sección 4 — Resultado y seguimiento:*
- `reacciones_adversas`: textarea (placeholder: "Ninguna / describir si hubo")
- `cuidados_post`: textarea
- `proxima_cita_sugerida`: input texto libre (ej. "3 meses")
- `plan_manejo`: textarea
- `observaciones`: textarea

*Fotos:*
- Subida inline de fotos dentro del formulario (antes / durante / después)
- Preview inmediato; se suben al guardar la nota (`POST /historia-clinica/fotos/` con el `nota.id` recién creado)

**Componente: `FotosAntesDespues`** (`src/components/atenciones/FotosAntesDespues.tsx`)

Sección de fotos dentro del panel central del formulario. Es independiente del formulario de nota — las fotos se pueden subir incluso antes de guardar la nota.

Flujo:
1. Al abrir la pantalla de atención (cita en `en_curso`), mostrar inmediatamente el bloque de fotos con estado vacío
2. **"Antes"** — botón prominente al inicio: "📷 Tomar foto antes del procedimiento". Si ya se subió, mostrar thumbnail con opción de reemplazar
3. **"Durante"** — opcional, aparece después de subir la primera foto
4. **"Después"** — se activa con énfasis cuando se está por completar la cita

Comportamiento:
- Las fotos se suben inmediatamente al seleccionarlas (`POST /historia-clinica/fotos/`) — no esperan al guardado de la nota
- Si la nota aún no existe al subir la foto "antes", la foto queda pendiente y se adjunta a la nota al crearla
- Cada foto tiene un selector de `zona` (input de texto con sugerencias según el servicio de la cita)
- Las fotos subidas se muestran en miniatura (3 columnas: antes / durante / después)

Sugerencias de zona por servicio (lógica en frontend):
- Toxina botulínica → frente, entrecejo, patas de gallo, zona ocular, cuello
- Rellenos → labios, surco nasogeniano, ojeras, pómulos
- Láser → cara completa, escote, manos

**Componente: `GaleriaPaciente`** (`src/components/historia/GaleriaPaciente.tsx`)

Componente para la página `/pacientes/[id]/historia` y para el panel derecho del historial. Muestra la galería visual de fotos del paciente.

Consume: `GET /historia-clinica/historias/{id}/galeria/`

Vistas:
- **Por sesión** (default): agrupa fotos por `cita_fecha` + `servicio_nombre`. Cada sesión muestra miniaturas de antes/durante/después
- **Por zona**: agrupa por `zona`, mostrando la evolución temporal de esa zona
- **Comparador**: selector de dos fotos cualquiera para mostrar side-by-side con slider

Filtros: tipo (antes/durante/después), zona (input de texto), rango de fechas

El comparador es especialmente valioso para mostrarle al paciente la evolución: selecciona el "antes" de la primera sesión y el "después" de la última.

**Componente: `HistorialPanel`** (`src/components/atenciones/HistorialPanel.tsx`)

- Lista de notas previas del paciente (excluyendo la de la cita actual si ya se guardó)
- Usa el `NotaClinicaCard` existente (expandible)
- Muestra todos los campos nuevos estéticos si están presentes (zonas tratadas como chips, productos como lista compacta)
- Enlace al fondo: "Ver historial completo →" → `/pacientes/[id]/historia`

**Tipos nuevos** — `src/types/historia.ts` (extender los existentes):
```typescript
export interface ZonaTratada {
  zona: string
  descripcion?: string
  unidades?: string
}

export interface ProductoUsado {
  nombre: string
  marca?: string
  lote?: string
  cantidad?: string
  unidad?: string
}

// Extender NotaClinica existente:
export interface NotaClinica {
  // ... campos existentes ...
  zona_tratada: ZonaTratada[] | null
  productos_usados: ProductoUsado[] | null
  tecnica: string | null
  reacciones_adversas: string | null
  cuidados_post: string | null
  proxima_cita_sugerida: string | null
}

export interface AntecedentePaciente {
  paciente: string
  alergias: string
  medicamentos_actuales: string
  condiciones_medicas: string
  contraindicaciones: string
  tipo_piel: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | ''
  antecedentes_esteticos: string
  updated_at: string
}

export type EstadoConsentimiento = 'vigente' | 'vencido' | 'no_firmado'

export interface ResumenConsentimiento {
  id: string | null
  tipo: string
  label: string
  firmado: boolean
  vigente: boolean
  fecha_firma: string | null
  fecha_vencimiento: string | null
}
```

**API client** — `src/lib/api/historiaClinica.ts` (agregar):
```typescript
antecedentes: {
  get: (pacienteId: string) => api.get(`/pacientes/${pacienteId}/antecedentes/`),
  upsert: (pacienteId: string, data) => api.put(`/pacientes/${pacienteId}/antecedentes/`, data),
  patch: (pacienteId: string, data) => api.patch(`/pacientes/${pacienteId}/antecedentes/`, data),
},
consentimientos: {
  resumen: (pacienteId: string) => api.get(`/historia-clinica/consentimientos/resumen/?paciente=${pacienteId}`),
  list: (pacienteId: string) => api.get(`/historia-clinica/consentimientos/?paciente=${pacienteId}`),
  create: (data) => api.post('/historia-clinica/consentimientos/', data),
  update: (id: string, data) => api.patch(`/historia-clinica/consentimientos/${id}/`, data),
},
```

**Actualización en `/atenciones` page:**
- El componente `PacienteActivo` actual se simplifica: solo muestra nombre, servicio, tiempo transcurrido y un botón prominente "Atender →" que navega a `/atenciones/${cita.id}`
- La lógica compleja de nota/fotos se mueve a la nueva ruta dedicada

**Actualización en `NotaClinicaCard`:**
- Si `zona_tratada` no es null, mostrar como chips coloreados (ej. "Frente · 20 UI")
- Si `productos_usados` no es null, mostrar como lista compacta (nombre + lote)
- Resto de campos nuevos como secciones adicionales colapsadas

Entregable UX:
- El profesional abre la cita, ve inmediatamente las alertas del paciente y el estado de consentimientos, registra el procedimiento con campos específicos para estética, y ve el historial completo sin salir de la pantalla

---

### Fase F6 — Consentimientos

Depende de backend (H9) — `resumen` ya cubierto en F5 (dentro de la pantalla de atención). Esta fase construye la gestión administrativa.

Depende de backend:
- `GET /historia-clinica/consentimientos/?paciente=<uuid>`
- `POST /historia-clinica/consentimientos/`
- `PATCH /historia-clinica/consentimientos/{id}/` (incluye subida de archivo)
- `DELETE /historia-clinica/consentimientos/{id}/`

Construir:
- Sección "Consentimientos" dentro de la ficha del paciente (`/pacientes/[id]`)
- Lista de consentimientos con estado visual (vigente / vencido / pendiente)
- Botón "Registrar firma" → sheet con campos fecha_firma + upload de archivo (PDF/imagen del consentimiento físico firmado)
- Visualizador del archivo firmado (link con `url_firmada`)
- Botón "Eliminar" solo visible si `firmado=False`

Entregable UX:
- Admin o recepcionista registra los consentimientos firmados físicamente y los vincula al paciente

### Fase F7 — Dashboard con KPIs reales

Depende de backend:
- `GET /api/v1/reportes/dashboard/`
- `GET /api/v1/reportes/ingresos/`
- `GET /api/v1/reportes/servicios/`
- `GET /api/v1/reportes/ocupacion/`

**Definition of done:**
- [x] KPI cards muestran datos reales del día (citas, cobros, stock bajo)
- [x] Gráfica de barras con ingresos vs gastos de los últimos 30 días
- [x] Tabla de servicios del mes con margen real
- [x] Tabla de ocupación por profesional
- [x] Skeleton loaders en cada sección independiente
- [x] Refetch automático cada 5 minutos

Construir:

1. `src/lib/api/reportes.ts` — funciones:
   - `getDashboard(params?)` → `GET /reportes/dashboard/`
   - `getIngresos(params)` → `GET /reportes/ingresos/`
   - `getServicios(params)` → `GET /reportes/servicios/`
   - `getOcupacion(params)` → `GET /reportes/ocupacion/`

2. `src/types/reportes.ts` — interfaces para cada respuesta

3. `src/app/dashboard/page.tsx` — reemplazar el dashboard actual:
   - **Row 1 — KPI cards (4 columnas):** Citas hoy (con desglose por estado), Ingresos hoy (total_cop), Alertas de stock (badge rojo si > 0), Completadas hoy
   - **Row 2 — Gráfica:** `BarChart` de Recharts con ingresos vs gastos de los últimos 30 días. Eje X = fecha, dos barras por día.
   - **Row 3 — Tablas lado a lado:** "Servicios del mes" (nombre, citas, ingresos, margen%) | "Ocupación" (profesional, citas, tasa%)
   - Mantener la lista de citas del día y accesos rápidos que ya existen

4. Componentes nuevos en `src/components/shared/`:
   - `KPICard` — Card con número grande, label, subdetalle opcional
   - `GraficaIngresos` — BarChart Recharts encapsulado
   - `TablaServicios` — tabla simple sin TanStack (datos pequeños)
   - `TablaOcupacion` — ídem

Entregable UX:
- Admin y recepción ven el estado operativo del día de un vistazo sin navegar a otros módulos

---

### Fase F8 — Historia clínica estructurada en 7 tabs

Depende de backend:
- H8.2: `GET/PATCH /historia-clinica/historias/{id}/` con `motivo_consulta` y `plan_manejo`
- H8.3: `GET/POST/PATCH/DELETE /historia-clinica/resultados-examenes/?historia=<id>`
- H8.4: `GET /historia-clinica/plantillas-ordenes/`
- H8.5: `GET/POST /historia-clinica/ordenes-medicas/?historia=<id>`
- H8.6: `POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/`

**Definition of done:**
- [ ] `/pacientes/[id]/historia` muestra 7 tabs; URL preserva tab activo con `?tab=<slug>`
- [ ] Cada tab carga sus datos de forma independiente (lazy query activada al seleccionar el tab)
- [ ] Tab activo por defecto: `datos-generales`
- [ ] En mobile, los tabs se muestran como selector scrollable horizontal

**Construir:**

`src/types/historia.ts` — agregar:
```typescript
// Extender HistoriaClinica:
motivo_consulta: string
plan_manejo: string

export interface ResultadoExamen {
  id: string
  historia: string
  titulo: string
  descripcion: string
  archivo_url: string | null
  fecha: string
  created_by_nombre: string
  created_at: string
}

export interface PlantillaOrden {
  id: string
  nombre: string
  contenido: string
  permite_edicion_profesional: boolean
  activa: boolean
}

export interface OrdenMedica {
  id: string
  historia: string
  cita: string | null
  plantilla_origen: string | null
  plantilla_nombre: string | null
  contenido: string
  fue_editada: boolean
  profesional_nombre: string
  created_at: string
}
```

`src/lib/api/historiaClinica.ts` — agregar:
```typescript
historias: {
  patch: (id: string, data: Partial<{ motivo_consulta: string; plan_manejo: string }>) =>
    apiClient.patch(`/historia-clinica/historias/${id}/`, data),
},
resultadosExamenes: {
  list: (historiaId: string) => GET `/historia-clinica/resultados-examenes/?historia=${historiaId}`
  create: (data: FormData) => POST `/historia-clinica/resultados-examenes/`
  patch: (id, data) => PATCH `/historia-clinica/resultados-examenes/${id}/`
  delete: (id) => DELETE `/historia-clinica/resultados-examenes/${id}/`
},
plantillasOrdenes: {
  list: () => GET `/historia-clinica/plantillas-ordenes/`
},
ordenesMedicas: {
  list: (historiaId: string) => GET `/historia-clinica/ordenes-medicas/?historia=${historiaId}`
  create: (data) => POST `/historia-clinica/ordenes-medicas/`
  enviarWhatsapp: (id: string) => POST `/historia-clinica/ordenes-medicas/${id}/enviar_whatsapp/`
},
```

**Refactor `/pacientes/[id]/historia/page.tsx`:**

Reemplazar el layout actual (columna notas + sidebar) por `<Tabs>` de shadcn/ui con 7 paneles:

---

**Tab 1 — Datos Generales** (`?tab=datos-generales`)

Datos del paciente en cards de solo lectura:
- Nombre completo, documento, fecha nacimiento, edad calculada
- Teléfono, email, dirección
- Tipo de piel Fitzpatrick (de `antecedentes`)
- Fecha apertura historia, número de notas, número de fotos
- Información complementaria: género, tipo afiliado, tipo afiliación seg. social, autorización notificaciones
- Seguridad social: fecha afiliación EPS, sede del paciente
- Botón "Editar datos" → `/pacientes/[id]/editar`

**Sección Signos Vitales** (dentro del mismo tab):
- Consume `GET /historia-clinica/historias/{id}/evolucion-signos/`
- Gráfica de línea temporal (Recharts) con los campos que tengan datos: peso, tensión, IMC, etc.
- Tabla compacta del último registro con todos los campos
- Botón "+ Registrar signos vitales" → modal/sheet con form de SignosVitales
  - Campos estándar: peso (kg), altura (cm), IMC (calculado automático), tensión sistólica/diastólica (mmHg), frecuencia cardiaca (ppm), frecuencia respiratoria (rpm), temperatura (°C), saturación O₂ (%)
  - Campos adicionales: cargados desde `GET /configuracion/signos-vitales/` (campos_extra de la clínica)
- `POST /historia-clinica/signos-vitales/` al guardar

Componente: `src/components/historia/TabDatosGenerales.tsx`
Sub-componente: `src/components/historia/SignosVitalesWidget.tsx`

---

**Tab 2 — Motivo de consulta** (`?tab=motivo-consulta`)

Dos secciones:
1. **Resumen clínico persistente** (campo `motivo_consulta` de `HistoriaClinica`):
   - Textarea editable con botón "Guardar" → `PATCH /historias/{id}/`
   - Placeholder: "Resumen del motivo de consulta principal del paciente…"
   - Autoguardado opcional con debounce de 2s o botón explícito
2. **Historial de anamnesis** (de notas):
   - Timeline con `nota.anamnesis` de cada `NotaClinica`, ordenadas por fecha DESC
   - Cada entrada muestra: fecha, profesional, servicio, texto de anamnesis (colapsable si > 3 líneas)

Componente: `src/components/historia/TabMotivoConsulta.tsx`

---

**Tab 3 — Antecedentes** (`?tab=antecedentes`)

Tres sub-tabs internos (implementados con un segundo nivel de tabs dentro del panel):
- **Personales** — formulario inline con categorías:
  - *Toxicológicos*: checkboxes (Tabaquismo, Consumo de alcohol, Drogas) + textarea "Otros"
  - *Patológicos*: textarea (HTA, diabetes, cáncer, etc.)
  - *Quirúrgicos*: textarea (cirugías con año)
  - *Farmacológicos*: textarea (medicamentos actuales)
  - *Alérgicos*: textarea
  - *Contraindicaciones profesionales*: textarea (alertas para el profesional)
  - *Tipo de piel*: select Fitzpatrick I–VI
  - *Antecedentes estéticos*: textarea (rellenos, cirugías previas, etc.)
- **Ginecoobstétricos** — campos: fórmula obstétrica (input), fecha última menstruación (date), método anticonceptivo (input), menopausia (checkbox), observaciones (textarea)
- **Familiares** — textarea libre

Si `alergicos` o `contraindicaciones` tienen contenido → banner de alerta ámbar sobre todos los sub-tabs.
Botón "Guardar cambios" → `PUT /pacientes/{id}/antecedentes/` con el formato anidado de H8.8.
Badge "Actualizado: hace X días" según `updated_at`.

Componente: `src/components/historia/TabAntecedentes.tsx`

---

**Tab 4 — Resultados de exámenes** (`?tab=examenes`)

Lista de resultados:
- Cada item muestra: fecha, título, descripción (colapsable), botón "Ver archivo" si `archivo_url != null`
- Badge de tipo de archivo (PDF / imagen) inferido de la extensión
- Botón "Eliminar" con confirmación

Formulario de alta (inline, expandible con botón "+ Agregar resultado"):
- `titulo` (input), `fecha` (date picker), `descripcion` (textarea), `archivo` (file input — PDF o imagen)
- `POST /historia-clinica/resultados-examenes/` con `multipart/form-data`

Componente: `src/components/historia/TabExamenes.tsx`

---

**Tab 5 — Plan de Manejo** (`?tab=plan-manejo`)

Misma estructura que Tab 2 pero para `plan_manejo`:
1. **Plan de manejo persistente** (campo `plan_manejo` de `HistoriaClinica`) — textarea editable con guardado
2. **Historial de planes** — timeline de `nota.plan_manejo` de cada `NotaClinica`

Componente: `src/components/historia/TabPlanManejo.tsx`

---

**Tab 6 — Órdenes médicas** (`?tab=ordenes`)

Lista de órdenes existentes:
- Cada orden muestra: fecha, profesional, primeras 2 líneas de contenido, badge "Editada" si `fue_editada=true`, badge "Plantilla: {nombre}" si tiene origen
- Botón "Enviar por WhatsApp" en cada orden → `POST /ordenes-medicas/{id}/enviar_whatsapp/` + toast feedback
- Las órdenes son inmutables; no hay botón de editar

Formulario de nueva orden (expandible con "+ Nueva orden"):
- Selector de plantilla (combobox con búsqueda → `GET /plantillas-ordenes/`) con opción "Sin plantilla"
- Al seleccionar plantilla: pre-llenar textarea con `plantilla.contenido`
- Si `plantilla.permite_edicion_profesional === false`: textarea deshabilitado, texto de aviso "Esta plantilla no puede modificarse"
- Si `plantilla.permite_edicion_profesional === true` y el profesional modifica el texto: mostrar aviso sutil "Se registrará que modificaste esta plantilla"
- Si "Sin plantilla": textarea vacío y editable libremente
- Botón "Crear orden" → `POST /ordenes-medicas/` con `{ historia, contenido, plantilla_origen? }`

Componente: `src/components/historia/TabOrdenesMedicas.tsx`

---

**Tab 7 — Fotos** (`?tab=fotos`)

Galería completa del paciente:
- Consume `GET /historia-clinica/historias/{id}/galeria/`
- Agrupación por sesión (fecha + servicio)
- Filtros: tipo (antes/durante/después), rango de fechas
- Click en foto → modal lightbox con info de la sesión
- Botón "Agregar foto" → abre `SubirFotosModal` con selector de nota a la que adjuntar

Componente: `src/components/historia/TabFotos.tsx` (reutiliza `SubirFotosModal` y lógica de galería existente)

---

**UX transversal:**
- Rutas frontend prioritarias actualizadas (ver sección al final)
- Las notas clínicas completas (el timeline actual) se eliminan de la historia y quedan accesibles solo desde el panel de atención (`/atenciones/[citaId]`)
- El botón "Nueva nota" se elimina de la historia; las notas se crean únicamente desde el flujo de atención

Entregable UX: el profesional navega la historia como un expediente médico estructurado, no como un log cronológico de notas.

---

### Fase F8.1 — Datos generales de la atención en formulario de nota

Depende de backend (H8.9):
- `POST /historia-clinica/notas/` — acepta `modalidad_consulta`, `tipo_consulta`, `causa_externa`, `via_ingreso`, `lugar_atencion`
- `GET /historia-clinica/notas/choices/` — devuelve choices disponibles

**Motivación:** el formulario de nota clínica (en `/atenciones/[citaId]`) debe capturar los datos administrativos de la atención requeridos por RIPS Colombia. Estos campos aparecen como sección "Datos generales de la atención" en la parte superior del formulario, colapsable para no distraer.

**Sección nueva en `FormularioProcedimiento`** — "Datos generales de la atención" (colapsable, collapsed por defecto en controles, expansible):
- **Modalidad de consulta** (select): Intramural / Extramural / Telemedicina / Domiciliaria
- **Tipo de consulta** (select): Primera Vez / Control / Urgencia / Otro
- **Causa externa** (select): Enfermedad General / Accidente de Trabajo / Accidente de Tránsito / Lesión Física / Otro
- **Vía de ingreso** (select): Espontáneo / Remitido / Derivado de Consulta Externa / Otro
- **Lugar de atención** (select): Institucional / Domicilio / Vía Pública / Otro
- **Consecutivo** (read-only, auto): "Atención N°{consecutivo_consulta}"

Todos los campos son opcionales en el formulario. Cuando se despliega la sección, los selects muestran "Sin especificar" como opción vacía.

Los valores de las choices se cargan una vez al montar la pantalla de atención (o se hardcodean desde el contrato backend — son estables).

**Definition of done:**
- [ ] Sección "Datos generales de atención" visible y colapsable en `FormularioProcedimiento`
- [ ] Los 5 selects envían los valores al `POST /historia-clinica/notas/`
- [ ] El consecutivo se muestra al recibir la nota creada (read-only)
- [ ] La sección recuerda su estado collapsed/expanded en sessionStorage

---

### Fase F9 — Configuración de plantillas de órdenes médicas

Depende de backend:
- H8.4: `GET/POST/PATCH/DELETE /historia-clinica/plantillas-ordenes/`

**Definition of done:**
- [ ] `/configuracion/plantillas-ordenes/` lista todas las plantillas de la clínica
- [ ] Sheet lateral para crear y editar plantilla
- [ ] Soft-delete con confirmación (marca `activa=False`)
- [ ] Solo visible en sidebar para admin/coordinador (guard por permisos)

**Construir:**

`src/app/(authenticated)/configuracion/plantillas-ordenes/page.tsx`:
- Tabla: Nombre, preview del contenido (1 línea), "Permite edición" (badge sí/no), Estado (activa/inactiva), acciones
- Filtro: activa=true por defecto, toggle para ver inactivas
- Botón "+ Nueva plantilla" → abre sheet

`src/components/configuracion/PlantillaOrdenSheet.tsx`:
- Campos: `nombre` (input), `contenido` (textarea grande — min 6 filas), `permite_edicion_profesional` (toggle con descripción: "Si está activado, los profesionales podrán modificar el texto al usar la plantilla")
- Validación Zod: `nombre` requerido, `contenido` requerido mínimo 10 caracteres
- `POST` al crear, `PATCH` al editar

Agregar al sidebar en Configuración:
```
Configuración
├── Clínica
├── Sedes
├── Servicios
├── Consentimientos
├── Plantillas de órdenes  ← nuevo
└── Roles
```

Entregable UX: el admin configura las plantillas una sola vez; los profesionales las usan desde el tab "Órdenes médicas" de la historia.

---

### Fase F10 — Cotizaciones

> ⚠️ **Estados actualizados (H24).** `enviada` y `rechazada` ya no existen como estados. El envío es un log, no una transición. Ver F17 para el flujo de envío.
> ⚠️ **Items actualizados (H27).** `ItemCotizacion` pasará a referenciar `TratamientoCatalogo` FK en lugar de texto libre. Ver F19 para el flujo de selección.

Depende de backend:
- H19 + H24: `GET/POST /cotizaciones/`, `GET/PATCH/DELETE /cotizaciones/{id}/`, `POST /cotizaciones/{id}/cambiar_estado/`, `GET /cotizaciones/{id}/pdf/`
- H27 (pendiente): `GET /clinicas/tratamientos/` para selector de ítems en cotización

**Definition of done:**
- [x] `/cotizaciones/` lista cotizaciones con filtros por estado y búsqueda por paciente
- [x] Sheet lateral para crear/editar cotización (solo en estado `borrador`)
- [x] Total calculado en tiempo real en el formulario
- [x] Cambio de estado a `aceptada` con validación de formas de pago
- [x] Descarga de PDF
- [x] Acceso desde ficha del paciente en sección "Cotizaciones"
- [ ] Eliminar badge y lógica de estados `enviada` y `rechazada` (requiere H24 en backend)
- [ ] Acciones de `borrador`: Guardar, **Enviar** (→ abre modal de envío F17), Aceptar, Eliminar
- [ ] Acciones de `aceptada` / `vencida`: solo lectura + Descargar PDF + historial de envíos
- [ ] Selector de ítem = `TratamientoCatalogo` (reemplaza texto libre; requiere H27) con búsqueda y quick-create

**Tipos actualizados — `src/types/cotizaciones.ts`:**
```typescript
// Después de H24:
export type EstadoCotizacion = 'borrador' | 'aceptada' | 'vencida'

// Nuevo tipo para historial de envíos:
export type CanalEnvio = 'whatsapp' | 'email' | 'pdf'

export interface CotizacionEnvio {
  id: string
  canal: CanalEnvio
  destinatario: string
  enviado_por_nombre: string
  notas: string
  created_at: string
}

// Cotizacion amplía con envios:
export interface Cotizacion {
  ...
  envios?: CotizacionEnvio[]   // incluido en GET /cotizaciones/{id}/
}
```

**API — `src/lib/api/cotizaciones.ts`:**
```typescript
list: (params?) => GET /cotizaciones/?estado=&paciente=
get: (id) => GET /cotizaciones/{id}/
create: (data) => POST /cotizaciones/
patch: (id, data) => PATCH /cotizaciones/{id}/
delete: (id) => DELETE /cotizaciones/{id}/
cambiarEstado: (id, estado) => POST /cotizaciones/{id}/cambiar_estado/
pdf: (id) => GET /cotizaciones/{id}/pdf/ (blob, descargar)
enviarWhatsapp: (id) => POST /cotizaciones/{id}/enviar_whatsapp/
enviarEmail: (id, body) => POST /cotizaciones/{id}/enviar_email/
registrarEnvioPdf: (id) => POST /cotizaciones/{id}/registrar_envio/ { canal: 'pdf' }
getEnvios: (id) => GET /cotizaciones/{id}/envios/
```

**Lista `/cotizaciones/page.tsx`:**
- Tabs de filtro: Todas / Borrador / Aceptadas / Vencidas (sin "Enviadas" / "Rechazadas")

**`CotizacionEstadoBadge.tsx` — estados simplificados:**
- `borrador` → gris
- `aceptada` → verde
- `vencida` → ámbar

**Acceso desde ficha del paciente** (`/pacientes/[id]`):
- Sección "Cotizaciones" ya implementada con list y botón "Nueva cotización"

---

#### F10.1 — Ítems de cotización con tipo semántico: 3 secciones en el formulario

> Depende de backend: **H27.1** — campo `tipo` + FK `procedimiento` en `ItemCotizacion`.

**Motivación:** el formulario actual muestra una única tabla "Procedimientos" donde el selector de tratamiento pre-llena campos pero no persiste el FK. Con H27.1 el backend distingue tres tipos de ítem. El formulario debe reflejar esa semántica: tres secciones dentro del mismo card de ítems, cada una con su selector de catálogo o entrada libre, pero compartiendo los mismos campos de línea (descripción, citas, precio, descuento, periodicidad, subtotal).

---

**Cambios en `src/types/cotizaciones.ts`:**

```typescript
export type TipoItemCotizacion = 'tratamiento' | 'procedimiento' | 'libre'

export interface ItemCotizacion {
  id: string
  tipo: TipoItemCotizacion          // nuevo
  tratamiento?: string | null       // UUID del TratamientoCatalogo (nuevo)
  tratamiento_nombre?: string | null
  procedimiento?: string | null     // UUID del Procedimiento (nuevo)
  procedimiento_nombre?: string | null
  descripcion: string
  num_citas: number
  duracion_estimada: string
  periodicidad: string
  valor_unitario: string
  descuento_porcentaje: string
  subtotal: string
  citas_agendadas?: number
  citas_completadas?: number
  citas_restantes?: number
}

export interface CreateItemCotizacion {
  tipo: TipoItemCotizacion
  tratamiento?: string | null
  procedimiento?: string | null
  descripcion: string
  num_citas: number
  duracion_estimada: string
  periodicidad: string
  valor_unitario: number
  descuento_porcentaje: number
}
```

---

**Cambios en `src/components/cotizaciones/CotizacionForm.tsx`:**

El card de ítems pasa de una tabla plana a **3 secciones** dentro del mismo card, separadas por un divisor con encabezado:

```
┌─────────────────────────────────────────────────────────────────┐
│  TRATAMIENTOS                       [+ Agregar tratamiento]     │
│  ─────────────────────────────────────────────────────────────  │
│  [Selector catálogo] │ Desc │ Sesiones │ Precio │ Desc% │ Subtot│
│                                                                  │
│  PROCEDIMIENTOS                     [+ Agregar procedimiento]   │
│  ─────────────────────────────────────────────────────────────  │
│  [Selector catálogo] │ Desc │ Citas    │ Precio │ Desc% │ Subtot│
│                                                                  │
│  ÍTEMS ADICIONALES                  [+ Agregar ítem]            │
│  ─────────────────────────────────────────────────────────────  │
│  Descripción         │ Desc │ Citas    │ Precio │ Desc% │ Subtot│
└─────────────────────────────────────────────────────────────────┘
```

Internamente sigue siendo un único `useFieldArray('items')`. Cada fila tiene `tipo` que determina en qué sección aparece. Los totales se calculan sobre todos los ítems sin distinción.

**Cambios en el schema Zod:**
```typescript
const itemSchema = z.object({
  _tratamientoId:  z.string().optional(),   // alias UI — reemplazado por tipo+tratamiento
  _procedimientoId: z.string().optional(),  // alias UI
  tipo: z.enum(['tratamiento', 'procedimiento', 'libre']).default('libre'),
  tratamiento:     z.string().nullable().optional(),
  procedimiento:   z.string().nullable().optional(),
  descripcion:     z.string().min(1, 'Requerido'),
  num_citas:       z.number().int().min(1),
  duracion_estimada: z.string(),
  periodicidad:    z.string(),
  valor_unitario:  z.number().min(0),
  descuento_porcentaje: z.number().min(0).max(100),
})
```

**Nuevo componente `ProcedimientoSelector`** (análogo al `TratamientoSelector` existente):
- Dropdown de búsqueda sobre `clinicasApi.procedimientos.activos()`
- Al seleccionar: pre-llena `descripcion` ← `procedimiento.nombre`, `valor_unitario` ← `procedimiento.precio_referencia`, `tipo` ← `'procedimiento'`, `procedimiento` ← `procedimiento.id`
- Implementar en el mismo archivo `CotizacionForm.tsx` (componente local)

**Función `onTratamientoChange` actualizada:**
```typescript
function onTratamientoChange(idx: number, tratamiento: TratamientoCatalogo) {
  setValue(`items.${idx}.tipo`, 'tratamiento')
  setValue(`items.${idx}.tratamiento`, tratamiento.id)
  setValue(`items.${idx}.procedimiento`, null)
  setValue(`items.${idx}.descripcion`, tratamiento.nombre)
  if (tratamiento.total_sesiones > 0)
    setValue(`items.${idx}.num_citas`, tratamiento.total_sesiones)
  if (tratamiento.precio_estimado)
    setValue(`items.${idx}.valor_unitario`, parseFloat(tratamiento.precio_estimado))
}

function onProcedimientoChange(idx: number, proc: Procedimiento) {
  setValue(`items.${idx}.tipo`, 'procedimiento')
  setValue(`items.${idx}.procedimiento`, proc.id)
  setValue(`items.${idx}.tratamiento`, null)
  setValue(`items.${idx}.descripcion`, proc.nombre)
  if (proc.precio_referencia)
    setValue(`items.${idx}.valor_unitario`, parseFloat(proc.precio_referencia))
}
```

**Botones de agregar por sección:**
```typescript
// Agregar tratamiento
addItem({ tipo: 'tratamiento', tratamiento: null, procedimiento: null,
  descripcion: '', num_citas: 1, duracion_estimada: '', periodicidad: '',
  valor_unitario: 0, descuento_porcentaje: 0 })

// Agregar procedimiento
addItem({ tipo: 'procedimiento', tratamiento: null, procedimiento: null,
  descripcion: '', num_citas: 1, duracion_estimada: '', periodicidad: '',
  valor_unitario: 0, descuento_porcentaje: 0 })

// Agregar ítem libre
addItem({ tipo: 'libre', tratamiento: null, procedimiento: null,
  descripcion: '', num_citas: 1, duracion_estimada: '', periodicidad: '',
  valor_unitario: 0, descuento_porcentaje: 0 })
```

**`buildPayload` actualizado:**
```typescript
const buildPayload = (values: FormValues) => ({
  paciente: values.paciente?.id ?? cotizacion!.paciente,
  validez_dias: values.validez_dias,
  notas: values.notas,
  items: values.items.map(({ _tratamientoId: _, _procedimientoId: __, ...i }) => i),
  formas_pago: values.formas_pago,
})
```

**Al cargar cotizacion existente** (`useEffect` de reset):
Los ítems del backend ya traen `tipo`, `tratamiento`, `procedimiento` — mapearlos directamente, sin `_tratamientoId` local.

---

**Cambios en `src/components/agenda/NuevaCitaModal.tsx`:**

El selector "Vincular a cotización aprobada" agrupa los ítems por `tipo` con cabeceras:

```typescript
// Antes (lista plana):
cotiz.items.filter(i => (i.citas_restantes ?? i.num_citas) > 0).map(item => (
  <SelectItem key={item.id} value={item.id}>
    {item.descripcion} — {item.citas_restantes} de {item.num_citas} restantes
  </SelectItem>
))

// Después (agrupado por tipo):
(['tratamiento', 'procedimiento', 'libre'] as const).flatMap(tipo => {
  const LABELS = { tratamiento: 'Tratamientos', procedimiento: 'Procedimientos', libre: 'Ítems adicionales' }
  const itemsFiltrados = cotiz.items.filter(i => i.tipo === tipo && (i.citas_restantes ?? i.num_citas) > 0)
  if (!itemsFiltrados.length) return []
  return [
    <SelectLabel key={tipo}>{LABELS[tipo]}</SelectLabel>,
    ...itemsFiltrados.map(item => (
      <SelectItem key={item.id} value={item.id}>
        {item.descripcion} — {item.citas_restantes} de {item.num_citas} restantes
      </SelectItem>
    ))
  ]
})
```

---

**Cambios en `src/components/cotizaciones/SesionesCotizacionPanel.tsx`:**

Agregar badge de tipo junto al nombre de cada ítem para que el recepcionista identifique de qué tipo de ítem proviene la sesión:

```typescript
const TIPO_BADGE: Record<string, { label: string; className: string }> = {
  tratamiento:   { label: 'Tratamiento',   className: 'bg-violet-100 text-violet-700' },
  procedimiento: { label: 'Procedimiento', className: 'bg-blue-100 text-blue-700' },
  libre:         { label: 'Ítem',          className: 'bg-gray-100 text-gray-600' },
}

// En el header del ítem (junto al nombre):
{item.tipo && (
  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TIPO_BADGE[item.tipo]?.className}`}>
    {TIPO_BADGE[item.tipo]?.label}
  </span>
)}
```

---

**Definition of done — F10.1:**
- [ ] `types/cotizaciones.ts` actualizado con `TipoItemCotizacion`, `tipo`, `tratamiento`, `procedimiento`
- [ ] `CotizacionForm` muestra 3 secciones dentro del card de ítems: Tratamientos, Procedimientos, Ítems adicionales
- [ ] Sección "Tratamientos" usa `TratamientoSelector` existente; persiste `tipo='tratamiento'` y `tratamiento` UUID
- [ ] Sección "Procedimientos" usa nuevo `ProcedimientoSelector`; persiste `tipo='procedimiento'` y `procedimiento` UUID
- [ ] Sección "Ítems adicionales" es texto libre sin selector; persiste `tipo='libre'`
- [ ] Al recargar cotización existente, los ítems aparecen en la sección correcta según `tipo`
- [ ] `buildPayload` envía `tipo`, `tratamiento`, `procedimiento` al backend
- [ ] `NuevaCitaModal` agrupa ítems por tipo con cabeceras en el selector de vinculación
- [ ] `SesionesCotizacionPanel` muestra badge de tipo por ítem
- [ ] Los totales del formulario siguen calculándose sobre todos los ítems sin distinción de tipo

---

### Fase F11 — Configuración de historia clínica (tabs activos por clínica)

Depende de backend (H8.10):
- `GET /configuracion/historia/`
- `PATCH /configuracion/historia/`

**Definition of done:**
- [ ] `/configuracion/historia-clinica/` muestra los 7 tabs con toggle activo/inactivo
- [ ] El tab "Datos Generales" aparece siempre activo y deshabilitado (no se puede desactivar)
- [ ] Los cambios se guardan con `PATCH` y muestran toast de confirmación
- [ ] Solo visible en sidebar con permiso de admin
- [ ] La historia clínica (`/pacientes/[id]/historia`) lee la config al montar y solo renderiza los tabs activos

**Construir:**

`src/lib/api/configuracion.ts` — agregar:
```typescript
historiaConfig: {
  get: () => apiClient.get('/configuracion/historia/'),
  patch: (data: { tabs_activos: string[] }) => apiClient.patch('/configuracion/historia/', data),
}
```

`src/types/configuracion.ts` — agregar:
```typescript
export interface TabHistoriaConfig {
  slug: string
  label: string
  activo: boolean
  obligatorio: boolean
}
export interface ConfiguracionHistoria {
  tabs_activos: string[]
  tabs_disponibles: TabHistoriaConfig[]
  updated_at: string
}
```

`src/app/(authenticated)/configuracion/historia-clinica/page.tsx`:
- Card por tab con nombre, descripción de qué contiene, y switch activo/inactivo
- Switch del tab "Datos Generales" siempre disabled=true con tooltip "Este tab es obligatorio"
- Botón "Guardar cambios" al final → `PATCH`
- `useQuery` con queryKey `['config-historia']` + `useMutation` para actualizar

**Integración en `/pacientes/[id]/historia/page.tsx`:**
```typescript
const { data: configHistoria } = useQuery({
  queryKey: ['config-historia'],
  queryFn: () => configuracionApi.historiaConfig.get(),
})

const TABS_ACTIVOS = configHistoria
  ? TABS.filter(t => configHistoria.tabs_activos.includes(t.value))
  : TABS  // fallback: mostrar todos si la config aún no cargó
```

Agregar al sidebar en Configuración:
```
Configuración
├── Clínica
├── Sedes
├── Servicios
├── Consentimientos
├── Historia Clínica       ← nuevo (tabs activos)
├── Plantillas de órdenes
└── Roles
```

Entregable UX: el admin activa o desactiva tabs de la historia sin tocar código; los profesionales ven solo los tabs relevantes para su especialidad.

---

### Fase F12 — Agenda con cotización: crear cita desde plan aprobado

Depende de backend (H20):
- `GET /cotizaciones/?paciente=<id>&estado=aceptada`
- `POST /agenda/citas/` acepta `item_cotizacion`
- `GET /agenda/citas/{id}/` expone `cotizacion_resumen`

**Motivación:** al agendar una cita para un paciente que tiene una cotización aceptada, la recepción o el profesional deben poder asociarla a un ítem del plan, de modo que quede descontada del total de sesiones cotizadas.

**Flujo UX al crear cita (NuevaCitaModal o equivalente):**
1. Usuario selecciona paciente → el sistema consulta cotizaciones aceptadas vigentes de ese paciente.
2. Si existen, aparece un selector opcional "¿Aplica a cotización?" con los ítems disponibles (que tengan `citas_restantes > 0`).
3. Si el usuario selecciona un ítem, el campo servicio se prellenará con la descripción del ítem.
4. Al guardar, se envía `item_cotizacion` en el payload.

**Definition of done:**
- [ ] Al seleccionar un paciente en la creación de cita, se consultan sus cotizaciones aceptadas vigentes
- [ ] El selector muestra: descripción del ítem, sesiones restantes (`X de Y`)
- [ ] Ítems con `citas_restantes = 0` aparecen deshabilitados con label "Sin sesiones disponibles"
- [ ] Si no hay cotizaciones aceptadas, el selector no aparece (cita independiente)
- [ ] En el detalle de cita (`CitaDetailSheet` y pantalla de atención) se muestra el vínculo a la cotización si existe
- [ ] El badge "Sesión X de Y" se calcula como `citas_agendadas` del ítem

**Construir / modificar:**
- `src/components/agenda/NuevaCitaModal.tsx` — agregar sección opcional de cotización
- `src/components/agenda/CitaDetailSheet.tsx` — mostrar vínculo a cotización si `cotizacion_resumen` existe
- `src/lib/api/cotizaciones.ts` — agregar `cotizacionesApi.byPaciente(id, { estado: 'aceptada' })`
- `src/types/agenda.ts` — extender `Cita` con `item_cotizacion_id` y `cotizacion_resumen`

**Cambio en `soloLectura` (cotizaciones):**
```typescript
// Antes:
const soloLectura = !!(cotizacion && cotizacion.estado !== 'borrador')
// Después (H20):
const ESTADOS_EDITABLES = ['borrador', 'enviada']
const soloLectura = !!(cotizacion && !ESTADOS_EDITABLES.includes(cotizacion.estado))
```

---

### Fase F13 — Timeline de sesiones por cotización

Depende de backend (H21):
- `GET /cotizaciones/{id}/sesiones/`

**Motivación:** el profesional y la recepción necesitan ver de un vistazo el avance de un plan de tratamiento: cuántas sesiones se han completado, cuáles están agendadas y cuántas quedan pendientes de agendar.

**Construir:**

`/cotizaciones/[id]/sesiones` o como sección dentro del detalle de cotización aceptada:
- Por cada ítem: barra de progreso `citas_completadas / num_citas` + texto "2 completadas · 1 agendada · 1 pendiente"
- Lista de citas vinculadas con fecha, estado (badge), profesional y sede
- Botón "Agendar siguiente sesión" que abre `NuevaCitaModal` preseleccionando el ítem
- Sesiones en estado `cancelada` excluidas del conteo pero visibles con tachado

**Definition of done:**
- [ ] Panel de sesiones accesible desde el detalle de cotización (tab o sección colapsable)
- [ ] Barra de progreso por ítem con colores: verde completada, azul agendada, gris pendiente
- [ ] Botón "Agendar" disponible solo si `citas_restantes > 0`
- [ ] Citas ordenadas por `fecha_inicio` asc
- [ ] Estado de cada cita con badge (pendiente, confirmada, completada, cancelada)

---

### Fase F14 — Módulo de cartera

Depende de backend (H22):
- `GET /cartera/`
- `GET /cartera/{id}/`
- `PATCH /cartera/cuotas/{id}/registrar_pago/`
- `GET /cartera/resumen/`

**Motivación:** la clínica necesita controlar los saldos pendientes de sus pacientes: qué deben, cuándo vence cada cuota y cuánto se ha recibido vs lo cotizado.

**Construir:**

`/cartera` — listado:
- Tabla con columnas: Paciente, Cotización (link), Total, Cobrado, Saldo pendiente, Próximo vencimiento
- Filtros: todos / con saldo / vencidos
- Tarjeta de resumen en la parte superior: total cartera, cobrado, pendiente, cuotas vencidas (con alerta si > 0)
- Clic en fila → `/cartera/[id]`

`/cartera/[id]` — detalle:
- Header: datos del paciente + totales (igual que tarjeta del listado)
- Lista de cuotas con: tipo, descripción, valor esperado, fecha esperada, estado (badge: pagada/pendiente/vencida)
- Cuota pendiente: botón "Registrar pago" → abre modal inline
- Modal registro de pago: valor pagado (formateado), fecha pago, medio pago (select), observaciones → `PATCH /cartera/cuotas/{id}/registrar_pago/`
- Cuota pagada: muestra valor pagado, fecha pago, medio

`src/lib/api/cartera.ts` — nuevo archivo:
```typescript
export const carteraApi = {
  list:    (params?) => apiClient.get('/cartera/', { params }),
  get:     (id: string) => apiClient.get(`/cartera/${id}/`),
  resumen: () => apiClient.get('/cartera/resumen/'),
  registrarPago: (cuotaId: string, data: RegistrarPagoPayload) =>
    apiClient.patch(`/cartera/cuotas/${cuotaId}/registrar_pago/`, data),
}
```

`src/types/cartera.ts` — nuevo archivo con interfaces `Cartera`, `CuotaCartera`, `ResumenCartera`, `RegistrarPagoPayload`.

**Definition of done:**
- [ ] `/cartera` lista todas las carteras de la clínica con totales correctos
- [ ] Filtro "vencidos" muestra solo carteras con al menos una cuota vencida
- [ ] `/cartera/[id]` muestra cuotas con estado calculado (vencida = no pagada y fecha_esperada < hoy)
- [ ] Modal de registro de pago valida que `valor_pagado <= valor_esperado`
- [ ] Al registrar pago, la cuota actualiza estado en UI sin recargar página (optimistic o refetch)
- [ ] Enlace desde cartera → cotización (`/cotizaciones/[id]`) y viceversa

---

### Fase F15 — Logo de clínica en configuración

Depende de backend (H19.2):
- `POST /clinicas/mi-clinica/logo/`
- `DELETE /clinicas/mi-clinica/logo/`
- `GET /clinicas/mi-clinica/` — campo `logo_url`

**Motivación:** el backend ahora incluye el logo en los PDFs de cotizaciones (y futuros documentos). El admin de la clínica debe poder subir, reemplazar y eliminar el logo desde `/configuracion/clinica/` sin necesidad de contactar soporte.

**Cambios en `/configuracion/clinica/page.tsx`:**

Agregar sección "Logo de la clínica" encima o debajo de los datos generales:

```
┌─────────────────────────────────────────────────┐
│  Logo de la clínica                             │
│                                                 │
│  [Preview 160×80 o placeholder con ícono]       │
│                                                 │
│  [Subir logo]  [Eliminar]                       │
│  PNG o JPG · máx. 2 MB · fondo transparente     │
│  recomendado                                    │
└─────────────────────────────────────────────────┘
```

- Si `clinica.logo_url` existe: mostrar `<img>` con el logo actual, botones "Cambiar" y "Eliminar"
- Si no existe: mostrar placeholder con ícono de imagen y solo botón "Subir logo"
- Click en "Subir logo" / "Cambiar" → `<input type="file" accept="image/png,image/jpeg">` oculto, disparado por click
- Al seleccionar archivo: validar tamaño (≤ 2 MB) y tipo en cliente; si válido, llamar `POST /clinicas/mi-clinica/logo/` con `FormData`
- Mostrar spinner sobre el preview durante la subida
- Al recibir respuesta: invalidar query `['mi-clinica']` y mostrar nuevo logo
- "Eliminar" → confirmar con dialog; llamar `DELETE /clinicas/mi-clinica/logo/`; mostrar placeholder

**Archivos que se tocan:**
- `src/app/(authenticated)/configuracion/clinica/page.tsx` — agregar sección logo
- `src/lib/api/clinicas.ts` — agregar `miClinica.subirLogo(file)` y `miClinica.eliminarLogo()`
- `src/types/clinicas.ts` — agregar `logo_url?: string | null` a `Clinica`

**Definition of done:**
- [ ] La sección logo es visible en `/configuracion/clinica/`
- [ ] Se puede subir un PNG/JPG y ver el preview actualizado sin recargar la página
- [ ] Error visible si el archivo supera 2 MB o no es imagen
- [ ] Se puede eliminar el logo con confirmación
- [ ] El logo subido aparece en el siguiente PDF de cotización generado

---

### Fase F16 — Módulo de Ingresos (unificación cobros + cartera)

Depende de backend (H23):
- `GET /cobros/cobros/?origen=` — nuevo filtro
- `GET /cobros/cobros/?cotizacion=` — nuevo filtro
- `GET /cobros/resumen/` — totales del día y mes por origen
- `PATCH /cartera/cuotas/{id}/registrar_pago/` — ahora devuelve `cobro_id`

**Motivación:** el módulo de `Cobros` registra pagos por citas pero no tiene visibilidad de abonos a cotizaciones. Con H23, el backend unifica todo en el modelo `Cobro` usando un campo `origen`. El frontend debe reflejar ese cambio: renombrar la ruta y el label, añadir filtros por origen, y conectar el flujo de pago de cartera al módulo de ingresos.

---

**Cambio 1 — Renombrar `/cobros` → `/ingresos`**

- Crear `/ingresos` como nueva ruta que reemplaza `/cobros`
- Añadir redirect permanente de `/cobros` → `/ingresos`
- Actualizar sidebar: "Cobros" → "Ingresos", ícono `TrendingUp` o `DollarSign`
- Actualizar todos los `Link href="/cobros"` en el codebase

**Cambio 2 — Filtro por origen en la página de Ingresos**

La página `/ingresos` añade un selector de origen sobre la tabla:

```
[Todos]  [Por cita]  [Por cotización]  [Libre]
```

Implementado como tabs o como select, según el espacio disponible. El filtro pasa `?origen=` al API.

La columna "Origen" se añade a la tabla:
- `cita` → badge gris "Cita" + nombre del servicio o de la cita
- `cotizacion` → badge azul "Cotización" + link a `/cotizaciones/{cotizacion_id}`
- `libre` → badge neutro "Libre"

**Cambio 3 — Tarjetas de resumen del día en `/ingresos`**

Usando `GET /cobros/resumen/`, añadir en la parte superior de la página:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Total hoy    │  │ Por citas    │  │ Por cotiz.   │
│ $1.050.000   │  │  $700.000    │  │  $350.000    │
└──────────────┘  └──────────────┘  └──────────────┘
```

**Cambio 4 — Flujo de registro de pago en Cartera**

En `/cartera/[id]`, el botón "Registrar pago" de una cuota:
- Sigue llamando a `PATCH /cartera/cuotas/{id}/registrar_pago/`
- La respuesta ahora incluye `cobro_id`
- Al recibir la respuesta, mostrar un enlace "Ver ingreso registrado →" que navega a `/ingresos/{cobro_id}`
- Invalidar queries de `['cartera']` y `['ingresos']`

**Cambio 5 — Vista de ingresos desde la ficha del paciente**

En `/pacientes/[id]`, agregar (junto a la sección de cotizaciones existente) una mini-sección "Ingresos" que filtra `GET /cobros/cobros/?paciente={id}` y muestra los últimos 5 registros con fecha, origen (badge) y total.

---

**Archivos que se tocan:**
- `src/app/(authenticated)/cobros/` → renombrar a `src/app/(authenticated)/ingresos/`
- `src/app/(authenticated)/ingresos/page.tsx` — añadir filtro origen + tarjetas resumen
- `src/app/(authenticated)/cartera/[id]/page.tsx` — enlace al ingreso después de registrar pago
- `src/app/(authenticated)/pacientes/[id]/page.tsx` — mini-sección ingresos del paciente
- `src/lib/api/cobros.ts` — agregar `resumen()` y parámetro `origen` en `list()`
- `src/types/cobros.ts` — agregar `origen`, `cotizacion`, `cotizacion_numero` a `Cobro`
- `src/components/shared/AppShell.tsx` — "Cobros" → "Ingresos", actualizar href y permisos

**Definition of done:**
- [ ] La ruta `/cobros` redirige a `/ingresos` sin romper nada
- [ ] Sidebar muestra "Ingresos" con el nuevo ícono
- [ ] Filtro por origen funciona en el listado
- [ ] Columna Origen visible en la tabla con badge y link a cotización si aplica
- [ ] Tarjetas de resumen del día muestran datos reales
- [ ] Al registrar pago en cartera, aparece enlace al ingreso generado
- [ ] Mini-sección en ficha del paciente muestra sus últimos ingresos

---

**Nota sobre F14 (Cartera):** la Definition of done de F14 sigue siendo válida. El único cambio es que el botón "Registrar pago" en `/cartera/[id]` invoca el mismo endpoint de antes (`/cartera/cuotas/{id}/registrar_pago/`) — el backend es quien crea el `Cobro` internamente. El frontend de cartera no llama directamente a `/cobros/`.

---

### Fase F17 — Envíos y historial de comunicación en cotizaciones

Depende de backend (H24):
- `POST /cotizaciones/{id}/enviar_whatsapp/`
- `POST /cotizaciones/{id}/enviar_email/`
- `POST /cotizaciones/{id}/registrar_envio/`
- `GET /cotizaciones/{id}/envios/`

**Motivación:** en lugar de marcar una cotización como "enviada" (estado), el sistema debe registrar cada acción de comunicación en un historial y permitir elegir el canal. El profesional puede enviar la cotización múltiples veces por distintos canales sin cambiar el estado del documento.

**Definition of done:**
- [ ] Botón "Enviar" en cotización `borrador` abre `EnviarCotizacionModal`
- [ ] Modal muestra 3 opciones: WhatsApp, Correo, Descargar PDF
- [ ] WhatsApp: llama `enviar_whatsapp`, muestra resultado (éxito/error) y cierra modal
- [ ] Correo: muestra campo de email (pre-llenado con email del paciente si existe), llama `enviar_email`
- [ ] PDF: descarga el PDF y registra el evento con `registrar_envio`
- [ ] Sección "Historial de envíos" visible en el detalle de cotización (cualquier estado)
- [ ] Historial muestra: canal (ícono + label), destinatario, quién envió, fecha/hora
- [ ] Si no hay envíos registrados, muestra mensaje vacío discreto
- [ ] Badge de estado no incluye `enviada` ni `rechazada`
- [ ] Tabs de la lista `/cotizaciones` solo muestran: Todas / Borrador / Aceptadas / Vencidas

**Construir:**

`src/types/cotizaciones.ts` — agregar:
```typescript
export type CanalEnvio = 'whatsapp' | 'email' | 'pdf'

export interface CotizacionEnvio {
  id: string
  canal: CanalEnvio
  destinatario: string
  enviado_por_nombre: string
  notas: string
  created_at: string
}
```

`src/lib/api/cotizaciones.ts` — agregar:
```typescript
enviarWhatsapp: (id) =>
  POST /cotizaciones/{id}/enviar_whatsapp/
  → { enviado: true, envio_id: string }

enviarEmail: (id, body: { destinatario?: string; notas?: string }) =>
  POST /cotizaciones/{id}/enviar_email/
  → { enviado: true, envio_id: string }

registrarEnvioPdf: (id) =>
  POST /cotizaciones/{id}/registrar_envio/  { canal: 'pdf' }
  → CotizacionEnvio

getEnvios: (id) =>
  GET /cotizaciones/{id}/envios/
  → CotizacionEnvio[]
```

`src/components/cotizaciones/EnviarCotizacionModal.tsx`:
- Dialog con 3 opciones en cards clicables:
  ```
  ┌──────────────────────────────────────────────────────┐
  │  Enviar cotización                                    │
  ├──────────────────────────────────────────────────────┤
  │  [📱 WhatsApp]  [✉ Correo]  [⬇ Descargar PDF]      │
  │                                                      │
  │  ── Si elige Correo: ──                              │
  │  Email: [__________________________]                  │
  │                                                      │
  │  [Cancelar]  [Enviar]                                │
  └──────────────────────────────────────────────────────┘
  ```
- Muestra spinner y resultado inline (éxito con ícono verde, error con mensaje)
- Al éxito: invalida query `['cotizacion', id]` para refrescar historial

`src/components/cotizaciones/HistorialEnvios.tsx`:
- Componente de lista de `CotizacionEnvio`
- Íconos por canal: `MessageCircle` (WhatsApp), `Mail` (email), `FileDown` (PDF)
- Formato: `"WhatsApp → +573001234567 · Dr. García · hace 2 horas"`
- Usado en `CotizacionForm` como sección al final del panel derecho

**Cambios en `CotizacionForm.tsx`:**
- Reemplazar botón "Enviar" (que antes hacía `cambiar_estado: enviada`) por botón que abre `EnviarCotizacionModal`
- Eliminar botón "Rechazar"
- Eliminar estado `enviada` de los guards de solo-lectura
- Mantener solo guard: `estado === 'aceptada' || estado === 'vencida'` → solo lectura
- Agregar sección `<HistorialEnvios cotizacionId={id} />` visible siempre (no solo en borrador)

**Cambios en `CotizacionEstadoBadge.tsx`:**
- Eliminar casos `enviada` y `rechazada`
- Mantener: `borrador` (gris), `aceptada` (verde), `vencida` (ámbar)

---

---

### Fase F18 — Protocolos de tratamiento y check-in de presencia

> ⚠️ **Nomenclatura actualizada (H26/H27).** "Servicio" → "Procedimiento". Las rutas de configuración son `/configuracion/procedimientos/[id]/` (ya implementado). Los endpoints del backend pasarán a ser `/clinicas/procedimientos/` cuando H26 esté listo; hasta entonces siguen en `/clinicas/servicios/`.

Depende de backend (H25 + H26):
- `GET/POST /clinicas/procedimientos/{id}/pasos/` (antes `/servicios/{id}/pasos/`)
- `PATCH/DELETE /clinicas/procedimientos/{id}/pasos/{paso_id}/`
- `POST /clinicas/procedimientos/{id}/pasos/reordenar/`
- `GET /protocolos/tratamientos/?paciente=`
- `GET /protocolos/tratamientos/{id}/`
- `GET /protocolos/tratamientos/{id}/pdf/`
- `POST /protocolos/sesiones/{id}/marcar_completado/`
- `POST /protocolos/sesiones/{id}/marcar_inasistencia/`
- `POST /protocolos/sesiones/{id}/iniciar_checkin/`
- `POST /protocolos/sesiones/{id}/verificar_otp/`
- `POST /protocolos/sesiones/{id}/checkin_foto/`

---

#### F18.1 — Configuración de protocolo y consentimientos por procedimiento

**Motivación:** la configuración de un procedimiento tiene dos partes: los pasos que lo componen (texto libre, ordenado, con cantidad de sesiones) y los consentimientos que el paciente debe firmar antes de recibirlo. Ambas secciones ya existen en `/configuracion/procedimientos/[id]/` bajo el tab "Protocolo".

> **Depende de:** H25.0 (M2M consentimientos) y H25.1 (PasoProtocolo).
> Los campos `requiere_consentimiento`, `documenso_template_token` y `documenso_template_nombre` ya no existen en `Procedimiento` (eliminados con H26 — reemplazados por la tabla M2M de consentimientos).

**Definition of done:**
- [x] Tab "Protocolo" con dos cards en `/configuracion/procedimientos/[id]/`
- [x] **Card 1 — Pasos:** tabla editable inline con drag-to-reorder, campo "Ses." (cantidad), semana, control
- [ ] **Card 2 — Consentimientos requeridos:** lista de templates Documenso vinculados; combobox para agregar (requiere H25.0)
- [ ] Cambios en Card 2 se guardan con `POST` / `DELETE` en `consentimientos/`
- [ ] Badge en la tabla de procedimientos: "X pasos · Y consentimientos"
- [ ] El semáforo de consentimientos en la pantalla de atención muestra la lista completa

**Tipos nuevos — `src/types/clinicas.ts`:**
```typescript
export interface PasoProtocolo {
  id:         string
  servicio:   string
  orden:      number
  nombre:     string      // texto libre, ej: "LASER IPL + TERAPIA FOTODINAMICA"
  semana:     number | null
  es_control: boolean
  activo:     boolean
  created_at: string
}

export interface ServicioConsentimientoRequerido {
  id:               string
  template_token:   string
  template_nombre:  string
  activo:           boolean
}

// Extender Servicio:
export interface Servicio {
  // ... campos existentes (sin requiere_consentimiento, documenso_template_token) ...
  tiene_protocolo:           boolean
  pasos_protocolo:           PasoProtocolo[]
  consentimientos_requeridos: ServicioConsentimientoRequerido[]
}
```

**API client — `src/lib/api/clinicas.ts` (agregar):**
```typescript
pasosProtocolo: {
  list:      (servicioId: string) =>
    apiClient.get(`/clinicas/servicios/${servicioId}/pasos/`),
  create:    (servicioId: string, data: { nombre: string; semana?: number; es_control?: boolean }) =>
    apiClient.post(`/clinicas/servicios/${servicioId}/pasos/`, data),
  patch:     (servicioId: string, pasoId: string, data: Partial<PasoProtocolo>) =>
    apiClient.patch(`/clinicas/servicios/${servicioId}/pasos/${pasoId}/`, data),
  delete:    (servicioId: string, pasoId: string) =>
    apiClient.delete(`/clinicas/servicios/${servicioId}/pasos/${pasoId}/`),
  reordenar: (servicioId: string, orden: { id: string; orden: number }[]) =>
    apiClient.post(`/clinicas/servicios/${servicioId}/pasos/reordenar/`, orden),
},
consentimientosServicio: {
  list:      (servicioId: string) =>
    apiClient.get(`/clinicas/servicios/${servicioId}/consentimientos/`),
  add:       (servicioId: string, templateId: string, orden?: number) =>
    apiClient.post(`/clinicas/servicios/${servicioId}/consentimientos/`, { template_id: templateId, orden: orden ?? 1 }),
  remove:    (servicioId: string, templateId: string) =>
    apiClient.delete(`/clinicas/servicios/${servicioId}/consentimientos/${templateId}/`),
  reordenar: (servicioId: string, orden: { template_id: string; orden: number }[]) =>
    apiClient.post(`/clinicas/servicios/${servicioId}/consentimientos/reordenar/`, orden),
},
```

**Layout del tab "Protocolo":**

```
/configuracion/servicios/[id]/  →  Tab "Protocolo"

┌─────────────────────────────────────────────────────────────────────┐
│  Pasos del protocolo                              [+ Agregar paso]  │
├─────────────────────────────────────────────────────────────────────┤
│  ⠿  1  CONSULTA DRA.                                  [ ]Ctrl  🗑   │
│  ⠿  2  LIMPIEZA + TOMA DE FOTOGRAFÍA                  [ ]Ctrl  🗑   │
│  ⠿  3  LASER IPL + TERAPIA FOTODINAMICA    Sem 1      [ ]Ctrl  🗑   │
│  ⠿  4  LASER CO2+ EXOSOMAS + MESOTERAPIA   Sem 1      [ ]Ctrl  🗑   │
│  ⠿  5  CONTROL Y REVISION                             [✓]Ctrl  🗑   │
│  [input nuevo paso — Enter para guardar]                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  Consentimientos requeridos                    [+ Agregar]          │
├─────────────────────────────────────────────────────────────────────┤
│  ⠿  Consentimiento Láser IPL        abc123...   ✓ Activo   🗑       │
│  ⠿  Consentimiento Mesoterapia      xyz789...   ✓ Activo   🗑       │
│                                                                     │
│  [Combobox: buscar template configurado en la clínica]              │
└─────────────────────────────────────────────────────────────────────┘
```

**Card 1 — `ProtocoloPasos`** (`src/components/configuracion/ProtocoloPasos.tsx`):
- `@dnd-kit/sortable` para drag-to-reorder. Al soltar → `reordenar/`.
- Cada fila: handle de arrastre `⠿`, input de nombre (editable inline, `onBlur` guarda con `PATCH`), input numérico de semana (pequeño, vacío = null), checkbox "Control", botón eliminar.
- Botón "+ Agregar paso": añade fila vacía al final con input enfocado; `Enter` o `onBlur` confirma con `POST`.
- Eliminar: Dialog de confirmación. Si el paso tiene sesiones completadas → texto "Este paso tiene sesiones registradas y se desactivará, no se borrará."

**Card 2 — `ConsentimientosServicio`** (`src/components/configuracion/ConsentimientosServicio.tsx`):
- Lista los templates ya vinculados con drag-to-reorder.
- Cada fila: handle de arrastre, nombre del template, token parcial (primeros 8 chars + "..."), badge activo/inactivo, botón eliminar (sin confirmación — solo desvincula, no borra el template).
- Combobox "+ Agregar": carga la lista de `DocumensoConsentimientoTemplate` configurados en la clínica (`GET /configuracion/documenso-templates/`) y permite seleccionar los que aún no están vinculados. Al seleccionar → `POST consentimientos/`.

**Actualización del semáforo en pantalla de atención (`PanelPaciente`):**

`consentimiento_info` ahora es una lista. Reemplazar el badge único por un mini-listado:
```
Consentimientos
  ✓ Consentimiento General         (verde)
  ✓ Consentimiento Láser IPL       (verde)
  ⚠ Consentimiento Mesoterapia     (naranja — firmado pero vencido)
  ✗ Consentimiento Toxina Botulín. (rojo — no firmado)
```
- Si `todos_firmados: true` → mostrar solo un badge verde "Consentimientos al día"
- Si `todos_firmados: false` → mostrar la lista completa con estado individual
- Click en un consentimiento no firmado/vencido → abre el sheet de firma de Documenso para ese template

**Tipos a actualizar — `src/types/agenda.ts`:**
```typescript
export interface ConsentimientoInfo {
  todos_firmados:   boolean
  consentimientos:  {
    template_token:   string
    template_nombre:  string
    vigente:          boolean
    consentimiento_id: string | null
  }[]
}

// Reemplaza el campo anterior ConsentimientoInfo de un solo objeto
export interface Cita {
  // ...
  consentimiento_info: ConsentimientoInfo
}
```

---

#### F18.2 — Vista de tratamiento activo en ficha del paciente

**Motivación:** en la ficha del paciente (`/pacientes/[id]`), una sección "Tratamientos" muestra los protocolos activos con su progreso, y permite ver el detalle de cada sesión.

**Definition of done:**
- [ ] Tab o sección "Tratamientos" en `/pacientes/[id]`
- [ ] Card por tratamiento: nombre del servicio, barra de progreso (`pasos_completados / total_pasos`), estado (badge activo/completado/abandonado)
- [ ] Click en tratamiento despliega la lista completa de sesiones con estado por fila
- [ ] Sesiones completadas muestran fecha, hora, profesional y badge de check-in (OTP ✓ o Foto ✓)
- [ ] Sesiones de inasistencia muestran badge rojo "No asistió"
- [ ] Botón "Descargar PDF" llama a `GET /protocolos/tratamientos/{id}/pdf/`
- [ ] Tratamientos completados o abandonados aparecen colapsados por defecto

**Tipos nuevos — `src/types/protocolos.ts` (nuevo archivo):**
```typescript
export type EstadoTratamiento = 'activo' | 'completado' | 'abandonado'
export type EstadoSesion      = 'pendiente' | 'completado' | 'inasistencia'
export type CheckinMetodo     = 'otp_whatsapp' | 'foto_presencial'

export interface SesionProcedimiento {
  id:                 string
  tratamiento:        string
  paso:               string
  paso_nombre:        string
  paso_orden:         number
  paso_semana:        number | null
  paso_es_control:    boolean
  cita:               string | null
  estado:             EstadoSesion
  fecha:              string | null
  hora:               string | null
  profesional:        string | null
  profesional_nombre: string | null
  observaciones:      string
  checkin_verificado: boolean
  checkin_metodo:     CheckinMetodo | null
  checkin_en:         string | null
  foto_presencia_url: string | null
}

export interface TratamientoPaciente {
  id:                string
  paciente:          string
  paciente_nombre:   string
  servicio:          string
  servicio_nombre:   string
  cotizacion_item:   string | null
  estado:            EstadoTratamiento
  fecha_inicio:      string
  total_pasos:       number
  pasos_completados: number
  progreso_pct:      number
  sesiones?:         SesionProcedimiento[]
}
```

**API client — `src/lib/api/protocolos.ts` (nuevo archivo):**
```typescript
export const protocolosApi = {
  tratamientos: {
    list:    (params: { paciente?: string; servicio?: string; estado?: string }) =>
      apiClient.get('/protocolos/tratamientos/', { params }),
    get:     (id: string) =>
      apiClient.get(`/protocolos/tratamientos/${id}/`),
    create:  (data: Partial<TratamientoPaciente>) =>
      apiClient.post('/protocolos/tratamientos/', data),
    pdf:     (id: string) =>
      apiClient.get(`/protocolos/tratamientos/${id}/pdf/`, { responseType: 'blob' }),
  },
  sesiones: {
    marcarCompletado:   (id: string, data?: { cita_id?: string; observaciones?: string }) =>
      apiClient.post(`/protocolos/sesiones/${id}/marcar_completado/`, data ?? {}),
    marcarInasistencia: (id: string, data?: { observaciones?: string }) =>
      apiClient.post(`/protocolos/sesiones/${id}/marcar_inasistencia/`, data ?? {}),
    iniciarCheckin:     (id: string) =>
      apiClient.post(`/protocolos/sesiones/${id}/iniciar_checkin/`),
    verificarOtp:       (id: string, codigo: string) =>
      apiClient.post(`/protocolos/sesiones/${id}/verificar_otp/`, { codigo }),
    checkinFoto:        (id: string, foto: File) => {
      const fd = new FormData(); fd.append('foto', foto)
      return apiClient.post(`/protocolos/sesiones/${id}/checkin_foto/`, fd)
    },
  },
}
```

**Componente `TratamientoCard`** (`src/components/protocolos/TratamientoCard.tsx`):
- Muestra nombre del servicio, badge de estado, barra de progreso con texto "3 de 13 completados"
- Expandible: al hacer click muestra la lista `SesionesTimeline`
- Botón "PDF" esquina superior derecha

**Componente `SesionesTimeline`** (`src/components/protocolos/SesionesTimeline.tsx`):
- Si `paso_semana` no es null en ninguna sesión: agrupa por semana con header "Semana 1", "Semana 2", etc.
- Si no hay semanas: lista plana ordenada por `paso_orden`
- Cada fila:
  ```
  [badge estado]  Orden · NOMBRE DEL PASO        Fecha  Profesional  [CheckinBadge]
  ```
- `EstadoBadge`: verde "Completado", rojo "Inasistencia", gris "Pendiente"
- `CheckinBadge`: solo visible si `checkin_verificado=true`:
  - OTP: `<Badge variant="outline">✓ OTP</Badge>`
  - Foto: `<Badge variant="outline">📷 Foto</Badge>`

---

#### F18.3 — Flujo del profesional: registrar paso del protocolo en la cita

**Motivación:** en la pantalla de atención `/atenciones/[citaId]`, cuando la cita está vinculada a una cotización cuyo servicio tiene protocolo, el profesional debe ver los pasos pendientes y seleccionar cuál está ejecutando en esa sesión.

**Definition of done:**
- [ ] Panel "Protocolo del tratamiento" visible en `/atenciones/[citaId]` si `cita.item_cotizacion_id` existe y el servicio tiene protocolo
- [ ] Lista de pasos pendientes con nombre y orden; pasos ya completados aparecen con check gris no seleccionable
- [ ] Al seleccionar un paso y pulsar "Marcar como realizado" → llama `marcar_completado` con `cita_id`
- [ ] La sesión queda vinculada a la cita; badge de progreso se actualiza en tiempo real
- [ ] Si el checkin aún no está verificado, el botón "Marcar como realizado" muestra aviso pero no bloquea (el check-in es informativo, no obligatorio para cerrar el paso)

**Componente `ProtocoloPanelAtencion`** (`src/components/atenciones/ProtocoloPanelAtencion.tsx`):

```
┌────────────────────────────────────────────────────┐
│  Manchas Plus  ████░░░░░░  3 / 13                  │
├────────────────────────────────────────────────────┤
│  ✓  1 · CONSULTA DRA.            01 May  Dra. G    │
│  ✓  2 · LIMPIEZA + FOTOGRAFÍA    08 May  Dra. G    │
│  ●  3 · LASER IPL + TERAPIA FOT.     ← seleccionar │
│  ○  4 · CONTROL Y REVISION                         │
│  ○  5 · LASER CO2 + EXOSOMAS                       │
├────────────────────────────────────────────────────┤
│          [Marcar paso 3 como realizado]             │
└────────────────────────────────────────────────────┘
```

- Carga el tratamiento con `GET /protocolos/tratamientos/?paciente=&servicio=` al montar
- Si no hay tratamiento activo para ese paciente+servicio pero la cita tiene `item_cotizacion_id`, mostrar botón "Iniciar seguimiento de protocolo" → `POST /protocolos/tratamientos/`
- El paso seleccionado se resalta; solo uno a la vez
- Tras marcar: llama `useMutation` con `marcar_completado(sesion.id, { cita_id: citaId })` + `invalidateQueries`

---

#### F18.4 — Pantalla de check-in (OTP WhatsApp + foto de respaldo)

**Motivación:** recepción verifica la presencia física del paciente antes de iniciar el paso del protocolo. La pantalla de check-in puede abrirse como Sheet desde la lista de sesiones o desde la cola de espera.

**Definition of done:**
- [ ] Botón "Verificar presencia" visible en cada sesión pendiente del tratamiento (desde `/pacientes/[id]` y desde la cola de espera)
- [ ] Abre `CheckinSheet` con dos modos: OTP y Foto
- [ ] Modo OTP: botón "Enviar código por WhatsApp" → llama `iniciar_checkin`; muestra countdown de 10 min; input de 6 dígitos; botón "Verificar"
- [ ] Si OTP ya activo (respuesta `otp_activo: true`): mostrar countdown sin reenviar
- [ ] Si OTP inválido: mostrar error con intentos restantes
- [ ] Si OTP correcto: badge "✓ Verificado por OTP" aparece en la sesión; sheet se cierra
- [ ] Modo Foto: botón "Tomar foto ahora" → abre `<input type="file" accept="image/*" capture="user">` → preview inmediato → botón "Confirmar foto" → llama `checkin_foto`
- [ ] Tras verificación exitosa (cualquier método): invalidar query del tratamiento

**Componente `CheckinSheet`** (`src/components/protocolos/CheckinSheet.tsx`):

```
┌──────────────────────────────────────────────────┐
│  Verificar presencia — LASER IPL + TERAPIA FOT.  │
├──────────────────────────────────────────────────┤
│  [📱 Código WhatsApp]  [📷 Foto de respaldo]      │
├──────────────────────────────────────────────────┤
│  MODO OTP:                                        │
│  Se enviará un código de 6 dígitos al WhatsApp   │
│  del paciente (+57 300 *** 4567)                  │
│                                                  │
│  [Enviar código]                                  │
│                                                  │
│  ── Tras enviar: ──                              │
│  Código:  [_ _ _ _ _ _]   Válido por 8:32        │
│  [Verificar código]                               │
├──────────────────────────────────────────────────┤
│  MODO FOTO:                                       │
│  [📷 Abrir cámara]                                │
│  [preview si ya tomada]                           │
│  [Confirmar y registrar presencia]                │
└──────────────────────────────────────────────────┘
```

**Lógica del OTP input:**
- 6 inputs individuales de 1 dígito con auto-advance (igual al patrón de `InputOTP` de shadcn/ui)
- Al completar los 6 dígitos, llamar `verificarOtp` automáticamente sin botón manual
- Countdown: hook `useCountdown(expiresAt)` que muestra "Válido por M:SS"
- Si `expira_en` llegó a 0: mostrar "Código expirado — envía uno nuevo" y rehabilitar el botón

**Estado del componente:**
```typescript
type CheckinMode   = 'otp' | 'foto'
type OtpUIState    = 'idle' | 'enviando' | 'esperando_codigo' | 'verificando' | 'expirado' | 'bloqueado'
type FotoUIState   = 'idle' | 'preview' | 'subiendo' | 'ok'
```

---

#### F18.5 — Integración en rutas y sidebar

**Rutas nuevas:**
- `/configuracion/servicios/[id]/` → Tab "Protocolo" con `ProtocoloPasos`
- `/pacientes/[id]/` → Tab o sección "Tratamientos" con `TratamientoCard` + `SesionesTimeline`

**Sidebar:**
```
Configuración
├── Clínica
├── Sedes
├── Servicios          ← gestión de pasos de protocolo desde aquí
├── Consentimientos
├── Historia Clínica
├── Plantillas de órdenes
└── Roles
```

**Actualización en `/atenciones/[citaId]`:**
- `ProtocoloPanelAtencion` se añade como cuarto panel (o sección colapsable debajo del formulario de nota)
- Solo se renderiza si `cita.item_cotizacion_id != null && servicio.tiene_protocolo == true`

**Definition of done global F18:**
- [ ] Admin configura pasos de un procedimiento desde la UI sin tocar código
- [ ] Al aceptar cotización, el tratamiento aparece automáticamente en la ficha del paciente
- [ ] Profesional selecciona el paso que ejecuta en cada cita y lo marca desde la pantalla de atención
- [ ] Recepción verifica presencia con OTP (primario) o foto (fallback) desde la sesión del paciente
- [ ] PDF de la historia del protocolo descargable con el historial completo de pasos

---

### Fase F19 — Catálogo de Tratamientos y conexión con cotizaciones

> ⚠️ **Modelo actualizado (H27 revisado).** El ítem del tratamiento ya no es `(procedimiento, cantidad)` sino `TipoSesion` — una unidad de cita con uno o más Procedimientos. Esto permite sesiones combinadas (ej. Tensamax + Nutrición) dentro del mismo plan.

Depende de backend (H26 + H27):
- `GET/POST /clinicas/tratamientos/`
- `GET/PATCH/DELETE /clinicas/tratamientos/{id}/`
- `POST /clinicas/tratamientos/{id}/tipos/`
- `PATCH/DELETE /clinicas/tratamientos/{id}/tipos/{tipo_id}/`
- `GET /clinicas/procedimientos/activos/`

**Motivación:** los ítems de cotización se seleccionan del catálogo de tratamientos. Cada tratamiento define tipos de sesión que pueden combinar varios procedimientos. En la cita, el profesional ve qué tipos de sesión le quedan disponibles y elige cuál ejecutar hoy.

---

#### F19.1 — Página de configuración de Tratamientos

**Ruta:** `/configuracion/tratamientos`

**Tipos actualizados — `src/types/clinicas.ts`:**
```typescript
export interface TipoSesionProcedimiento {
  id: string
  procedimiento: string
  procedimiento_nombre: string
  procedimiento_duracion_min: number
  requiere_consentimiento: boolean
  orden: number
}

export interface TipoSesion {
  id: string
  nombre: string          // ej: "Sesión Tensamax + Nutrición"
  cantidad: number        // cuántas veces aparece en el plan
  orden: number
  es_compromiso: boolean  // si genera sesión trackeable
  procedimientos: TipoSesionProcedimiento[]
}

export interface TratamientoCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  precio_estimado: string | null
  total_sesiones: number          // sum(tipo.cantidad) donde es_compromiso=true
  activo: boolean
  tipos_sesion: TipoSesion[]
  created_at: string
  updated_at: string
}

export interface CreateTratamientoCatalogoRequest {
  nombre: string
  descripcion?: string
  precio_estimado?: number | null
  tipos_sesion: {
    nombre: string
    cantidad: number
    orden: number
    es_compromiso?: boolean
    procedimientos: string[]    // UUIDs de Procedimiento
  }[]
}
```

**API — `src/lib/api/clinicas.ts`:**
```typescript
tratamientos: {
  list:        (params?)   => GET  /clinicas/tratamientos/
  activos:     ()          => GET  /clinicas/tratamientos/activos/
  get:         (id)        => GET  /clinicas/tratamientos/{id}/
  create:      (data)      => POST /clinicas/tratamientos/
  update:      (id, data)  => PATCH /clinicas/tratamientos/{id}/
  delete:      (id)        => DELETE /clinicas/tratamientos/{id}/
  addTipo:     (id, data)  => POST /clinicas/tratamientos/{id}/tipos/
  updateTipo:  (id, tipo_id, data) => PATCH /clinicas/tratamientos/{id}/tipos/{tipo_id}/
  removeTipo:  (id, tipo_id)       => DELETE /clinicas/tratamientos/{id}/tipos/{tipo_id}/
}
```

**`/configuracion/tratamientos` — tabla:**
- Columnas: Nombre | Tipos de sesión (pills expandibles) | Total sesiones | Precio est. | Estado
- Pills: "Sesión Tensamax ×7", "Sesión combinada ×2"...

**Dialog de creación/edición — 2 tabs:**

Tab **Datos**: nombre, descripción, precio estimado

Tab **Tipos de sesión**:
```
┌──────────────────────────────────────────────────────────────────┐
│  Tipos de sesión       [+ Agregar tipo de sesión]                │
├──────────────────────────────────────────────────────────────────┤
│  ↕  Evaluación nutricional         Cant: [1]  Proced: [Nutrición]│
│  ↕  Sesión Tensamax                Cant: [7]  Proced: [Tensamax] │
│  ↕  Sesión combinada               Cant: [2]  Proced: [Tensamax] │
│                                               [Nutrición]  [+ Add]│
└──────────────────────────────────────────────────────────────────┘
```

Cada fila de tipo tiene:
- `nombre` (input)
- `cantidad` (input número)
- `es_compromiso` (toggle — si es solo informativo)
- Lista de procedimientos vinculados (chips removibles + selector para añadir)
- Botón "**+ Nuevo procedimiento**" abre `ProcedimientoDialog` inline

**Definition of done F19.1:**
- [ ] `/configuracion/tratamientos` lista tratamientos con pills de tipos de sesión
- [ ] Dialog crea/edita con tab Datos + tab Tipos de sesión
- [ ] Cada tipo puede tener múltiples procedimientos (M2M)
- [ ] Toggle `es_compromiso` visible por tipo
- [ ] Quick-create de procedimiento desde el selector de procedimientos del tipo
- [ ] Reordenar tipos (drag o ↑↓)

---

#### F19.2 — Selector de Tratamiento en cotizaciones

**Modifica:** `src/components/cotizaciones/CotizacionForm.tsx`

El selector actual ya está implementado (TratamientoSelector). Cuando H27 esté disponible:
- Al seleccionar tratamiento: `num_citas` ← `total_sesiones`, `valor_unitario` ← `precio_estimado`
- El campo de citas refleja las sesiones reales del plan (ya no es libre)
- Tooltip en el campo de citas: "8 sesiones: 1 evaluación + 7 Tensamax + 2 combinadas"

**Definition of done F19.2:**
- [x] Selector `TratamientoSelector` implementado en `CotizacionForm`
- [x] Quick-create `TratamientoQuickCreate` desde el selector
- [ ] Auto-relleno de `num_citas` desde `total_sesiones` (requiere H27)
- [ ] `ItemCotizacion.tratamiento_id` enviado al backend (requiere H27)

---

### Fase F20 — Ejecución de sesiones con consentimientos

Depende de backend (H27 + H28):
- `GET  /protocolos/sesiones/{id}/consentimientos/`
- `POST /protocolos/sesiones/{id}/marcar_completada/`
- `GET  /pacientes/{id}/consentimientos/`
- `POST /pacientes/{id}/consentimientos/`
- `GET  /pacientes/{id}/consentimientos/verificar/?tratamiento=uuid`

**Motivación:** con sesiones combinadas (H27), el profesional necesita ver en la pantalla de atención exactamente qué tipos de sesión del plan están disponibles hoy, elegir cuál ejecuta, y confirmar los procedimientos. El sistema verifica automáticamente los consentimientos de todos los procedimientos de la sesión antes de permitir marcarla como completada.

---

#### F20.1 — Panel del profesional en la cita (actualizado)

**Modifica:** `src/components/protocolos/ProtocoloPanelAtencion.tsx`

El panel actual muestra una lista plana de sesiones. Con H27 debe mostrar los tipos de sesión disponibles del plan:

```
┌──────────────────────────────────────────────────────────┐
│  Plan Tensamax 10 sesiones        4/10  ████░░░░░░  40%  │
├──────────────────────────────────────────────────────────┤
│  ¿Qué sesión es hoy?                                     │
│                                                           │
│  ○ Sesión Tensamax          (4 restantes)                │
│    └ Tensamax (60 min)                                    │
│                                                           │
│  ○ Sesión combinada         (2 restantes)                │
│    └ Tensamax (60 min) + Nutrición (30 min)               │
│                                                           │
│  [Seleccionar tipo] → [Ver consentimientos] → [Iniciar]  │
└──────────────────────────────────────────────────────────┘
```

Flujo del profesional:
1. Selecciona el tipo de sesión a ejecutar hoy
2. Sistema consulta `GET /protocolos/sesiones/{id}/consentimientos/`
3. Si hay consentimientos faltantes/vencidos: muestra alerta con acción
4. Si todo ok: botón "Iniciar sesión" disponible
5. Al marcar como completada: `POST /protocolos/sesiones/{id}/marcar_completada/`

---

#### F20.2 — Semáforo de consentimientos en sesión

Componente `ConsentimientosSesionCheck`:

```
✅ Corrientes estéticas      firmado 10 ene 2026 · vence 10 ene 2027
⚠️  Plan nutricional         VENCIDO desde 10 jul 2026
    [Enviar Documenso al paciente]  [Registrar firma presencial]
```

Estados:
- `vigente` → verde, fecha de vencimiento
- `vencido` → amarillo, fecha en que venció + acción de renovación
- `faltante` → rojo, nunca firmado + acción de solicitud

El profesional puede disparar Documenso o registrar firma presencial sin salir de la pantalla.

---

#### F20.3 — Historial de consentimientos en ficha del paciente

**Modifica:** `src/app/(authenticated)/pacientes/[id]/page.tsx`

Nueva sección "Consentimientos" en la ficha del paciente:

```
Consentimientos
  ✅ Corrientes estéticas     firmado 10 ene 2026  vence 10 ene 2027
  ✅ Plan nutricional          firmado 15 ene 2026  VENCIDO
  ── Sin consentimiento de: [Laser CO2]
  [+ Registrar consentimiento]
```

**Types — `src/types/protocolos.ts`:**
```typescript
export type MetodoConsentimiento = 'documenso' | 'presencial_pdf' | 'presencial_confirmado'
export type EstadoConsentimiento = 'vigente' | 'vencido' | 'faltante'

export interface ConsentimientoPaciente {
  id: string
  template_token: string
  template_nombre: string
  procedimiento_nombre: string | null
  fecha_firma: string
  vigencia_hasta: string
  metodo: MetodoConsentimiento
  archivo_url: string | null
  registrado_por_nombre: string
  created_at: string
}
```

**Definition of done F20:**
- [ ] Panel de atención muestra tipos de sesión disponibles del plan (no lista plana)
- [ ] Profesional selecciona tipo antes de marcar sesión
- [ ] Semáforo de consentimientos por procedimiento visible antes de ejecutar
- [ ] Acciones de renovación (Documenso / presencial) desde el panel
- [ ] Sección de consentimientos en ficha del paciente
- [ ] `POST /protocolos/sesiones/{id}/marcar_completada/` maneja el bloqueo por consentimiento faltante con mensaje claro

---

---

### Fase F19.2 — `duracion_min` en tipos de sesión del catálogo de tratamientos

**Depende de backend:** H27.2 — campo `duracion_min` en `TipoSesion`.

**Motivación:** al agendar una cita vinculada a un ítem de tratamiento (cotización aceptada), el sistema necesita saber cuántos minutos ocupa esa sesión para calcular slots disponibles. La duración se define en el catálogo de tratamientos, por tipo de sesión. Si el tipo tiene procedimientos vinculados, la duración puede sugerirse como suma de sus `duracion_min`; si no tiene procedimientos, debe ingresarse manualmente.

---

**Cambios en `src/types/clinicas.ts`:**

```typescript
export interface TipoSesion {
  id: string
  nombre: string
  cantidad: number
  orden: number
  es_compromiso: boolean
  duracion_min: number        // ← nuevo
  procedimientos: TipoSesionProcedimiento[]
}

export interface CreateTipoSesionRequest {
  nombre: string
  cantidad: number
  orden: number
  es_compromiso?: boolean
  duracion_min: number        // ← nuevo, requerido
  procedimientos: TipoSesionProcedimientoInput[]
}
```

---

**Cambios en `src/app/(authenticated)/configuracion/tratamientos/page.tsx`:**

**1. `TipoSesionDraft` — agregar `duracion_min`:**
```typescript
interface TipoSesionDraft {
  key: string
  id?: string
  nombre: string
  cantidad: number
  es_compromiso: boolean
  duracion_min: number       // ← nuevo
  procedimientos: { tipoProc_id?: string; id: string; nombre: string; duracion_min: number }[]
}
```

**2. `buildDraftFromTipo` — mapear `duracion_min`:**
```typescript
function buildDraftFromTipo(t: TipoSesion): TipoSesionDraft {
  return {
    key: t.id,
    id: t.id,
    nombre: t.nombre,
    cantidad: t.cantidad,
    es_compromiso: t.es_compromiso,
    duracion_min: t.duracion_min,   // ← nuevo
    procedimientos: t.procedimientos.map((p) => ({
      tipoProc_id: p.id,
      id: p.procedimiento,
      nombre: p.procedimiento_nombre,
      duracion_min: p.procedimiento_duracion_min,
    })),
  }
}
```

**3. `TipoSesionRow` — campo de duración con auto-sugerencia:**

El campo `duracion_min` aparece como input numérico en la cabecera del tipo, junto al campo de cantidad. Cuando el tipo tiene procedimientos, el valor se auto-sugiere como la **suma** de sus `duracion_min`, pero el usuario puede sobreescribir:

```typescript
// En el header de TipoSesionRow, después del campo de cantidad:
<div className="flex items-center gap-1 shrink-0">
  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
  <Input
    type="number" min={5} step={5}
    className="h-7 w-16 text-sm text-center"
    value={tipo.duracion_min || ''}
    onChange={(e) => onChange({ ...tipo, duracion_min: Math.max(0, Number(e.target.value) || 0) })}
    placeholder="min"
  />
  <span className="text-xs text-muted-foreground">min</span>
</div>
```

Cuando el usuario agrega o quita procedimientos de un tipo, recalcular la sugerencia:

```typescript
function addProcedimiento(s: Procedimiento) {
  if (tipo.procedimientos.some((p) => p.id === s.id)) return
  const nuevos = [...tipo.procedimientos, { id: s.id, nombre: s.nombre, duracion_min: s.duracion_min }]
  const sumaDuracion = nuevos.reduce((acc, p) => acc + p.duracion_min, 0)
  onChange({
    ...tipo,
    procedimientos: nuevos,
    duracion_min: sumaDuracion,   // auto-sugerir suma, el usuario puede editar
  })
  setShowProc(false)
}
```

Si el tipo tiene `duracion_min = 0` y `es_compromiso = true`, mostrar aviso de alerta en el row:

```typescript
{tipo.es_compromiso && tipo.duracion_min === 0 && (
  <p className="text-[10px] text-amber-600 pl-8">
    ⚠ Ingresa la duración para poder calcular slots de agenda
  </p>
)}
```

**4. Payload de la mutación — incluir `duracion_min`:**
```typescript
tipos_sesion: tipos.map((t, idx) => ({
  nombre: t.nombre,
  cantidad: t.cantidad,
  orden: idx + 1,
  es_compromiso: t.es_compromiso,
  duracion_min: t.duracion_min,   // ← nuevo
  procedimientos: t.procedimientos.map((p, pIdx) => ({
    ...(p.tipoProc_id ? { id: p.tipoProc_id } : {}),
    procedimiento: p.id,
    orden: pIdx + 1,
  })),
}))
```

**5. Inicializar `duracion_min` al crear nuevo tipo:**
```typescript
function addTipo() {
  setTipos((prev) => [...prev, {
    key: `new-${Date.now()}`,
    nombre: '',
    cantidad: 1,
    es_compromiso: true,
    duracion_min: 0,   // ← nuevo
    procedimientos: [],
  }])
}
```

**Definition of done — F19.2:**
- [ ] `TipoSesion` y `CreateTipoSesionRequest` tienen `duracion_min`
- [ ] `TipoSesionDraft` incluye `duracion_min`
- [ ] `buildDraftFromTipo` mapea `duracion_min` desde el backend
- [ ] `TipoSesionRow` muestra input de duración con icono de reloj, junto al campo cantidad
- [ ] Al agregar un procedimiento, la duración se auto-sugiere como suma de procedimientos
- [ ] Al quitar un procedimiento, la suma se recalcula y actualiza el campo
- [ ] Aviso ámbar visible si `es_compromiso=true` y `duracion_min=0`
- [ ] La mutación envía `duracion_min` por tipo al backend
- [ ] Los tipos existentes al editar un tratamiento muestran su `duracion_min` precargado

---

### Fase F3.1 — Modal de agendamiento en 3 modos (cotización / servicio / consulta libre)

**Depende de backend:** H6.3 (slots flexible, `servicio` opcional) + H27.2 (`duracion_min` en `TipoSesion`).

**Motivación:** el modal actual fuerza siempre a seleccionar un servicio del catálogo para calcular slots, lo que no tiene sentido cuando la cita ya está vinculada a un ítem de tratamiento contratado (el servicio ya está implícito). Además, deben poder agendarse "consultas libres" donde el recepcionista solo define cuánto tiempo necesita.

---

**Cambios en `src/types/agenda.ts`:**

```typescript
export interface CreateCitaRequest {
  paciente:         string
  sede:             string
  profesional:      string
  fecha_inicio:     string
  canal_origen:     CanalOrigen
  notas_internas?:  string
  // Exactamente uno de los tres:
  servicio?:            string | null
  item_cotizacion?:     string | null
  duracion_min?:        number | null
  motivo?:              string       // texto libre para consulta sin servicio
}

export interface Cita {
  // ... campos existentes ...
  servicio:       string | null     // ahora nullable
  servicio_nombre: string
  duracion_min:   number | null
  motivo:         string | null
}
```

---

**Cambios en `src/lib/api/agenda.ts`:**

```typescript
slotsDisponibles: async (params: SlotParams): Promise<string[]> => {
  const res = await apiClient.get<string[]>('/agenda/citas/slots_disponibles/', { params })
  return res.data
}

type SlotParams = { profesional_id: string; sede_id: string; fecha: string } & (
  | { servicio_id: string }
  | { item_cotizacion_id: string }
  | { duracion_min: number }
)
```

---

**Cambios en `src/components/agenda/SlotPicker.tsx`:**

Aceptar `duracionMin` como alternativa a `servicioId`:

```typescript
interface SlotPickerProps {
  profesionalId: string
  sedeId: string
  fecha: string
  value: string
  onSelect: (slot: string) => void
  // Una de las dos:
  servicioId?: string
  itemCotizacionId?: string
  duracionMin?: number
}

// enabled solo si hay al menos una fuente de duración
const enabled = Boolean(
  profesionalId && sedeId && fecha &&
  (servicioId || itemCotizacionId || duracionMin)
)

// Params dinámicos para la query
const slotParams = {
  profesional_id: profesionalId,
  sede_id: sedeId,
  fecha,
  ...(itemCotizacionId ? { item_cotizacion_id: itemCotizacionId }
    : servicioId ? { servicio_id: servicioId }
    : { duracion_min: duracionMin! }),
}
```

El placeholder cuando `!enabled` cambia según el modo:
```typescript
if (!enabled) {
  const falta = !profesionalId ? 'profesional' : !sedeId ? 'sede' : !fecha ? 'fecha'
    : !servicioId && !itemCotizacionId && !duracionMin ? 'servicio o duración' : ''
  return <p>Selecciona {falta} para ver horarios disponibles</p>
}
```

---

**Cambios en `src/components/agenda/NuevaCitaModal.tsx`:**

El modal se reorganiza con un selector de modo al inicio (radio group), y el resto del formulario se adapta según el modo seleccionado.

**Schema Zod — por modo:**

```typescript
// Modo 1: cotización
const schemaCotizacion = z.object({
  sede: z.string().min(1),
  profesional: z.string().min(1),
  fecha: z.string().min(1),
  slot: z.string().min(1),
  canal_origen: z.enum(['presencial', 'telefono', 'web', 'redes']),
  notas_internas: z.string().optional(),
  item_cotizacion: z.string().min(1, 'Selecciona un ítem de cotización'),
})

// Modo 2: servicio
const schemaServicio = z.object({
  sede: z.string().min(1),
  profesional: z.string().min(1),
  servicio: z.string().min(1, 'Selecciona un servicio'),
  fecha: z.string().min(1),
  slot: z.string().min(1),
  canal_origen: z.enum(['presencial', 'telefono', 'web', 'redes']),
  notas_internas: z.string().optional(),
})

// Modo 3: consulta libre
const schemaLibre = z.object({
  sede: z.string().min(1),
  profesional: z.string().min(1),
  duracion_min: z.number().min(5, 'Mínimo 5 minutos'),
  fecha: z.string().min(1),
  slot: z.string().min(1),
  canal_origen: z.enum(['presencial', 'telefono', 'web', 'redes']),
  motivo: z.string().optional(),
  notas_internas: z.string().optional(),
})
```

**Selector de modo (radio group):**

```tsx
type ModoCita = 'cotizacion' | 'servicio' | 'libre'
const [modo, setModo] = useState<ModoCita>('cotizacion')
// si el paciente no tiene cotizaciones aceptadas, default a 'servicio'

<div className="grid grid-cols-3 gap-2">
  <button onClick={() => setModo('cotizacion')} className={...}>
    <FileCheck className="h-4 w-4" />
    <span className="text-xs font-medium">Sesión de cotización</span>
  </button>
  <button onClick={() => setModo('servicio')} className={...}>
    <Stethoscope className="h-4 w-4" />
    <span className="text-xs font-medium">Por servicio</span>
  </button>
  <button onClick={() => setModo('libre')} className={...}>
    <Clock className="h-4 w-4" />
    <span className="text-xs font-medium">Consulta libre</span>
  </button>
</div>
```

**Contenido condicional por modo:**

| Campo | Modo cotización | Modo servicio | Modo libre |
|---|---|---|---|
| Selector de ítem (cotización) | ✅ requerido | ❌ oculto | ❌ oculto |
| `ServicioSelect` | ❌ oculto | ✅ requerido | ❌ oculto |
| Selector de duración | ❌ oculto | ❌ oculto | ✅ requerido |
| Campo motivo (texto) | ❌ oculto | ❌ oculto | ✅ opcional |
| `SlotPicker` | `itemCotizacionId` | `servicioId` | `duracionMin` |

**Selector de duración para modo libre:**

```tsx
const DURACIONES = [15, 30, 45, 60, 90, 120]

<div className="space-y-1.5">
  <Label>Duración *</Label>
  <div className="flex gap-2 flex-wrap">
    {DURACIONES.map((d) => (
      <button key={d} type="button"
        onClick={() => { setDuracionLibre(d); setValue('slot', '') }}
        className={cn('px-3 py-1.5 rounded-md border text-sm font-medium transition-colors',
          duracionLibre === d ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-accent'
        )}>
        {d} min
      </button>
    ))}
  </div>
</div>
```

**`onSubmit` por modo:**

```typescript
// Modo cotización
await mutateAsync({
  paciente: paciente.id, sede, profesional, fecha_inicio: slot,
  canal_origen, notas_internas,
  item_cotizacion: itemCotizacion,
})

// Modo servicio (actual)
await mutateAsync({
  paciente: paciente.id, sede, profesional, servicio, fecha_inicio: slot,
  canal_origen, notas_internas,
})

// Modo libre
await mutateAsync({
  paciente: paciente.id, sede, profesional, fecha_inicio: slot,
  canal_origen, notas_internas, duracion_min: duracionLibre, motivo,
})
```

**Al cambiar de modo:** limpiar `slot`, `servicio`, `item_cotizacion`, `duracion_min`.

**Definition of done — F3.1:**
- [ ] `CreateCitaRequest` y `Cita` types actualizados con `servicio` nullable, `duracion_min`, `motivo`
- [ ] `agendaApi.citas.slotsDisponibles` acepta `SlotParams` tipado con las 3 alternativas
- [ ] `SlotPicker` acepta `servicioId`, `itemCotizacionId` o `duracionMin` (uno de los tres)
- [ ] `NuevaCitaModal` muestra selector de modo (3 opciones) debajo del selector de paciente
- [ ] Modo "Sesión de cotización": muestra el selector de ítems ya implementado; oculta `ServicioSelect`; slots calculados con `item_cotizacion_id`
- [ ] Modo "Por servicio": flujo actual sin cambios; `ServicioSelect` visible; slots con `servicio_id`
- [ ] Modo "Consulta libre": oculta `ServicioSelect`; muestra botones de duración (15/30/45/60/90/120 min) + campo motivo; slots con `duracion_min`
- [ ] Cambiar de modo limpia el slot seleccionado y los campos del modo anterior
- [ ] Si el paciente no tiene cotizaciones aceptadas, el modo "Sesión de cotización" se deshabilita y el default es "Por servicio"
- [ ] Validación y errores correctos para cada modo

---

### Fase F21 — Pantalla de atención: tabs como secciones de nota clínica

**Depende de backend:** H26 (completo)

**Motivación:** cada atención genera una única `NotaClinica` que agrega todo lo que el profesional llena en los tabs durante esa sesión. No existe un tab separado de "Nota de atención" ni campos del `FormularioProcedimiento`. Los tabs operan en dos modos: en `/atenciones/[citaId]` escriben a la nota en curso; en `/pacientes/[id]/historia` muestran el historial de notas completas.

#### Flujo de la atención

1. Al entrar a `/atenciones/[citaId]`, el frontend crea automáticamente una `NotaClinica` en estado `borrador` (`POST /historia-clinica/notas/` con `{historia, cita}`)
2. Cada tab hace auto-save con `PATCH /historia-clinica/notas/{id}/` al perder foco o al cambiar de tab
3. `TabExamenes` y `TabOrdenesMedicas` crean registros con `nota` FK apuntando al borrador
4. `TabFotos` sube fotos con `nota` FK (ya funciona)
5. "Completar atención" llama `POST /historia-clinica/notas/{id}/completar/` y luego cambia estado de cita

#### Contexto compartido `NotaEnProgreso`

```typescript
// src/store/notaEnProgresoStore.ts
interface NotaEnProgreso {
  notaId: string | null         // ID del borrador creado al entrar
  citaId: string
  historiaId: string
}
```

No almacena los campos del formulario — cada tab maneja su propio estado y hace `PATCH` directamente.

#### Cambios por tab (modo atención)

| Tab | Cambio |
|---|---|
| `TabMotivoConsulta` | En modo atención: `PATCH /notas/{id}/` con `{motivo_consulta}` en lugar de `PATCH /historias/{id}/` con `{motivo_consulta}` |
| `TabPlanManejo` | En modo atención: `PATCH /notas/{id}/` con `{plan_manejo}` en lugar de `PATCH /historias/{id}/` |
| `TabExamenes` | En modo atención: `POST /resultados-examenes/` con `nota: notaId` además de `historia` |
| `TabOrdenesMedicas` | En modo atención: `POST /ordenes-medicas/` con `nota: notaId` además de `historia` |
| `TabFotos` | Ya funciona con FK a nota; sin cambios |
| `TabAntecedentes` | Sin cambios — sigue siendo persistente por paciente |
| `TabDatosGenerales` | Sin cambios — solo lectura |

#### Historial en `/pacientes/[id]/historia`

El tab `TabMotivoConsulta` y `TabPlanManejo` en modo historia pasan a ser **solo lectura**: muestran un timeline de las notas completadas con su `motivo_consulta` y `plan_manejo` respectivamente, en lugar de un textarea editable. La edición ya no existe a nivel de `HistoriaClinica`.

El `HistorialPanel` existente se expande para mostrar cada `NotaClinica` con todos sus campos embebidos: `motivo_consulta`, `plan_manejo`, `examenes[]`, `ordenes[]`, `fotos[]`.

#### Eliminaciones

- Componente `FormularioProcedimiento` — eliminar
- Tab "Nota de atención" — ya eliminado
- `atencionConfigStore` — quitar las opciones de tabs que no aplican
- Llamadas a `PATCH /historias/{id}/` con `motivo_consulta`/`plan_manejo` — reemplazar

#### Types actualizados

```typescript
// src/types/historia.ts

export interface NotaClinica {
  id: string
  historia: string
  cita: string | null
  estado: 'borrador' | 'completada'
  motivo_consulta: string | null
  plan_manejo: string | null
  examenes: ResultadoExamen[]
  ordenes: OrdenMedica[]
  fotos: FotoClinica[]
  created_at: string
  updated_at: string
}

// Campos eliminados de NotaClinica:
// tipo, anamnesis, diagnostico, zona_tratada, productos_usados,
// tecnica, reacciones_adversas, cuidados_post, proxima_cita_sugerida,
// observaciones, nota_aclarada
```

**Definition of done F21:**
- [ ] Al entrar a `/atenciones/[citaId]` se crea automáticamente una `NotaClinica` borrador
- [ ] `TabMotivoConsulta` en modo atención hace `PATCH /notas/{id}/` con `motivo_consulta`
- [ ] `TabPlanManejo` en modo atención hace `PATCH /notas/{id}/` con `plan_manejo`
- [ ] `TabExamenes` en modo atención incluye `nota` FK al crear examen
- [ ] `TabOrdenesMedicas` en modo atención incluye `nota` FK al crear orden
- [ ] "Completar atención" llama `POST /notas/{id}/completar/` antes de cambiar estado de cita
- [ ] `FormularioProcedimiento` eliminado del codebase
- [ ] Historial en historia del paciente muestra notas completas con exámenes, órdenes y fotos embebidas
- [ ] `TabMotivoConsulta` y `TabPlanManejo` en modo historia son read-only (timeline, no textarea editable)
- [ ] `types/historia.ts` actualizado con el nuevo shape de `NotaClinica`
- [ ] No hay llamadas a `PATCH /historias/{id}/` con `motivo_consulta` o `plan_manejo`

---

### Fase H30-F — Selección de sesión al agendar + chequeo de consentimiento en ColaEspera

**Motivación:** ver `asks.md` §1, §2, §3 y hito H30 en `plan-backend.md`. El scheduler debe poder elegir qué sesión del protocolo se consume al crear la cita (en lugar del profesional durante la atención). El frontend se prepara completo; los campos se ignoran en el backend hasta que H30 aterrice.

#### Cambios en tipos

`src/types/agenda.ts`:
- `Cita` recibe `sesion_ejecutada_id?: string | null`
- `CreateCitaRequest` recibe `sesion_ejecutada?: string | null`

#### NuevaCitaModal — selector de sesión (modo cotización)

Después de seleccionar `item_cotizacion`:
1. Se guarda también el `tipo` del ítem seleccionado (`tratamiento` | `procedimiento` | `libre`).
2. Si `tipo === 'tratamiento'`, se disparan dos queries:
   - `GET /protocolos/tratamientos/?paciente=<id>&estado=activo` → filtrar en cliente por `cotizacion_item === itemCotizacion`
   - `GET /protocolos/tratamientos/{id}/` → leer `grupos[].sesiones` (H27) o `sesiones` (legacy), filtrar `estado === 'pendiente'`
3. Se muestra un `<Select>` con las sesiones pendientes: `"Sesión N/total · tipo_sesion_nombre"`.
4. La selección se envía como `sesion_ejecutada: uuid` en el `POST /agenda/citas/`. El backend lo ignora hasta H30.
5. El selector no bloquea el submit si no hay sesiones disponibles (campo opcional).

Estados nuevos: `sesionEjecutada`, `itemCotizacionTipo`. Se resetean al cambiar modo o ítem.

#### ColaEspera — workaround de consentimiento por sesión

Cuando la cita vinculada tiene `sesion_ejecutada_id` (campo que llega una vez H30 esté activo):
- Se llama `GET /protocolos/sesiones/{id}/consentimientos/` para la primera cita `en_espera`.
- `puede_ejecutar: false` bloquea el botón Iniciar igual que el flujo actual de `consentimiento_info`.
- Si `sesion_ejecutada_id` es `null` (backend anterior a H30), se usa el flujo existente sin cambios.

**Definition of done H30-F:**
- [ ] `Cita.sesion_ejecutada_id` y `CreateCitaRequest.sesion_ejecutada` tipados
- [ ] `NuevaCitaModal` muestra selector de sesión para ítems de tipo `tratamiento`
- [ ] El selector deriva las sesiones pendientes vía dos queries (lista + detalle)
- [ ] `sesion_ejecutada` se incluye en el payload de creación de cita
- [ ] `ColaEspera` llama `GET /protocolos/sesiones/{id}/consentimientos/` cuando existe `sesion_ejecutada_id`
- [ ] Comportamiento sin cambios cuando `sesion_ejecutada_id` es `null`

---

## Rutas frontend prioritarias

- `/login`
- `/dashboard`
- `/pacientes`
- `/pacientes/[id]`
- `/pacientes/[id]/historia`
- `/agenda`
- `/atenciones`
- `/atenciones/[citaId]` — pantalla dedicada de atención (nueva)
- `/consentimientos`
- `/confirmar/[token]`
- `/firmar-consentimiento/[token]`
- `/cotizaciones` — listado de cotizaciones (F10)
- `/cotizaciones/nueva` — nueva cotización (F10)
- `/cotizaciones/[id]` — detalle/edición de cotización (F10)
- `/cotizaciones/[id]/sesiones` — timeline de sesiones por ítem (F12)
- `/cartera` — listado de cartera con saldos (F14)
- `/cartera/[id]` — detalle de cartera con cuotas y registro de pagos (F14)
- `/ingresos` — libro de caja unificado: citas + cotizaciones (F16, reemplaza /cobros)
- `/configuracion/plantillas-ordenes` — gestión de plantillas (F9)
- `/configuracion/historia-clinica` — configuración de tabs activos (F11)
- `/configuracion/procedimientos` — catálogo de procedimientos (F18.1, renombrado de /servicios)
- `/configuracion/procedimientos/[id]/` → tab Protocolo — configurar pasos (F18.1)
- `/configuracion/tratamientos` — catálogo de tratamientos, grupos de procedimientos (F19.1)
- `/pacientes/[id]/` → sección Tratamientos — progreso de protocolos (F18.2)
- `/pacientes/[id]/historia?tab=datos-generales` — historia en tabs (F8); incluye signos vitales
- `/pacientes/[id]/historia?tab=antecedentes` — antecedentes estructurados (F8)
- `/pacientes/[id]/historia?tab=ordenes` — órdenes médicas (F8)
- `/pacientes/[id]/historia?tab=examenes` — resultados de exámenes (F8)

## Contratos que deben validarse siempre

Antes de cerrar una pantalla, revisar:
- nombres exactos de campos
- enums y estados permitidos
- campos opcionales vs obligatorios
- formato de fechas
- errores de validación
- reglas de permisos por `permissions[]`

## Riesgos frontend a vigilar

- No asumir que una URL firmada dura toda la sesión.
- No persistir tokens sensibles en `localStorage`.
- No construir componentes dependientes de campos que backend todavía no expone.
- No esconder incoherencias de negocio con lógica temporal en cliente.
- No marcar como “listo” un módulo si el flujo real completo todavía falla.

## Checklist de recepción desde backend

Antes de empezar una pantalla, pedir o validar:
- endpoint
- método HTTP
- payload de request
- payload de response
- errores posibles
- permisos requeridos y claves de `permissions[]`
- dataset o ejemplos reales

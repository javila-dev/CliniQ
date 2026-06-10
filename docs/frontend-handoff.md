# Frontend Handoff

Documento para el agente AI del frontend.
Está pensado para arrancar el frontend sin perder tiempo interpretando el estado del backend.

Complementa a [api.md](/app/api.md), que contiene los endpoints y contratos más técnicos.

## Objetivo inmediato

El mejor objetivo del frontend ahora no es cubrir todo el sistema, sino dejar operativos los flujos críticos del MVP:

1. login
2. pacientes
3. agenda
4. historia clínica
5. consentimientos

Con esos cinco módulos ya se puede probar el corazón de la operación diaria.

## Flujo MVP recomendado

Construir y probar este recorrido:

1. usuario inicia sesión
2. entra al dashboard
3. busca o crea paciente
4. agenda una cita
5. cambia estado o confirma cita
6. abre historia clínica del paciente
7. crea una nota clínica
8. sube fotos
9. genera consentimiento
10. firma consentimiento por link/token

Si ese flujo se siente sólido, el frontend ya tendrá una base muy útil para detectar huecos reales.

## Orden recomendado de implementación

### Fase 1

- login
- layout protegido
- cliente HTTP base
- store/auth hook

### Fase 2

- módulo de pacientes
- búsqueda rápida de pacientes

### Fase 3

- agenda
- selector de profesional
- selector de servicio
- slots disponibles
- detalle de cita

### Fase 4

- historia clínica
- timeline de notas
- formulario de nota
- carga de fotos

### Fase 5

- plantillas de consentimiento
- generación de consentimiento
- pantalla o vista para firmar por token

## Rutas frontend sugeridas

### Auth

- `/login`

### Dashboard

- `/dashboard`
- `/pacientes`
- `/pacientes/[id]`
- `/pacientes/[id]/historia`
- `/agenda`
- `/consentimientos`

### Pública

- `/confirmar/[token]`
- `/firmar-consentimiento/[token]`

Nota:
La ruta pública de confirmación ya tiene backend.
La firma pública del consentimiento también ya tiene backend.

## Páginas que ya valen la pena construir

### Login

Debe consumir:

- `POST /auth/login/`
- `GET /auth/me/`
- `POST /auth/refresh/`
- `POST /auth/logout/`

Recomendación:

- manejar `access` y `refresh` de forma centralizada
- si el frontend empieza rápido, Bearer token está bien
- no hace falta esperar el esquema final de cookies para desarrollar la UI

### Dashboard base

No hace falta un dashboard analítico aún.
Basta con un layout protegido con navegación clara hacia:

- pacientes
- agenda
- historia clínica
- consentimientos

### Pacientes

Pantallas mínimas:

- listado
- creación
- edición
- detalle

Capacidades importantes:

- búsqueda por nombre/documento
- filtros simples
- formulario con validaciones alineadas al backend
- botón visible para entrar a historia clínica

### Agenda

Pantallas mínimas:

- vista diaria o semanal
- formulario de nueva cita
- panel de detalle

Capacidades importantes:

- búsqueda rápida de paciente
- selector de profesional desde `/colaboradores/profesionales/`
- selector de servicio desde `/clinicas/servicios/activos/`
- consulta de slots desde `/agenda/citas/slots_disponibles/`
- cambio de estado
- confirmación manual

### Historia clínica

Pantallas mínimas:

- resumen de historia
- timeline/listado de notas
- nueva nota
- carga de fotos

Capacidades importantes:

- mostrar contenido cronológico
- bloquear UX de edición de notas ya guardadas
- mostrar `url_firmada` de fotos sin asumir persistencia larga

### Consentimientos

Pantallas mínimas:

- listado de plantillas
- generación desde cita
- listado de consentimientos
- vista pública de firma

Capacidades importantes:

- mostrar estado: `pendiente`, `firmado`, `revocado`
- exponer `pdf_url` cuando exista
- permitir revocación solo en vistas administrativas

## Componentes compartidos que conviene construir temprano

- `AuthGuard`
- `AppShell`
- `PageHeader`
- `DataTable`
- `SearchInput` con debounce
- `StatusBadge`
- `EmptyState`
- `ErrorState`
- `LoadingState`
- `PacienteSearchInput`
- `ProfesionalSelect`
- `ServicioSelect`

## Tipos que conviene definir pronto

- `AuthUser`
- `LoginResponse`
- `Paciente`
- `BusquedaPaciente`
- `ColaboradorProfesional`
- `Servicio`
- `Sede`
- `Cita`
- `HistoriaClinica`
- `NotaClinica`
- `FotoClinica`
- `PlantillaConsentimiento`
- `Consentimiento`

## Qué no hace falta esperar

No necesitas esperar estos módulos para arrancar frontend:

- inventario
- proveedores
- caja
- cobros
- comisiones
- reportes

Es mejor comenzar ya con front sobre los módulos clínicos y operativos que ya están listos.

## Qué sí conviene respetar desde el inicio

- App Router
- TypeScript estricto
- API abstraída en `/src/lib/api`
- formularios con React Hook Form + Zod
- no hacer `fetch` en componentes
- no hardcodear base URL

## Estrategia de consumo API

### Recomendado

- un cliente `axios` central
- interceptor para `Authorization`
- refresco de token centralizado
- helpers por módulo:
  - `auth.ts`
  - `pacientes.ts`
  - `agenda.ts`
  - `historiaClinica.ts`
  - `consentimientos.ts`
  - `clinicas.ts`
  - `colaboradores.ts`

### Paginación

Para listados estándar, asumir forma DRF:

```ts
type Paginated<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
```

Pero no todos los endpoints usan paginación.
Por ejemplo:

- `pacientes/buscar/`
- `agenda/citas/hoy/`
- `agenda/citas/slots_disponibles/`
- `colaboradores/profesionales/`

devuelven arrays simples.

## Comportamientos de UX importantes

### Pacientes

- si `autoriza_datos` no está marcado, no enviar formulario
- para `CC` y `TI`, ayuda visual de documento numérico

### Agenda

- el backend ya bloquea solapamientos, pero el frontend debe anticiparlo con slots
- si cambia profesional, sede o servicio, recargar slots
- si cambia la fecha, limpiar slot seleccionado

### Historia clínica

- una nota guardada no se edita
- si el usuario quiere “corregir”, la UI debe empujar hacia una nota aclaratoria

### Consentimientos

- mostrar estado visible y fácil de leer
- si el consentimiento está firmado, mostrar acceso al PDF
- si está revocado, dejarlo visualmente bloqueado

## Riesgos o zonas aún provisionales

- algunos mensajes de error aún no están 100% uniformes
- el auth sigue temporalmente en Bearer
- las URLs firmadas dependen de MinIO disponible
- la firma de consentimiento depende de storage configurado
- la confirmación automática de citas depende de `n8n`

## Qué probar manualmente apenas exista UI

- login correcto / login inválido
- crear paciente válido
- crear paciente sin autorización de datos
- búsqueda rápida de paciente
- crear cita válida
- crear cita solapada
- cambiar estado de cita
- confirmar cita manualmente
- crear nota clínica con profesional correcto
- intentar editar una nota desde UI y verificar que no exista esa opción
- crear consentimiento
- firmar consentimiento por token
- ver PDF firmado

## Criterio práctico para pedir más backend

Si durante el frontend aparece una necesidad, vale la pena pedir ajuste backend cuando:

- la UI necesita datos agregados que hoy requieren 3 o más requests
- una validación del negocio no se puede inferir bien desde cliente
- una pantalla necesita joins anidados que hoy el serializer no expone
- hay que ejecutar un flujo transaccional y hoy estaría repartido en varias llamadas

No vale la pena pedir backend todavía cuando:

- es solo una diferencia visual
- se puede resolver con composición en frontend
- el dato ya existe pero hay que mapearlo mejor en types

## Recomendación final al agente del frontend

Empieza ya.

El backend ya tiene suficiente superficie para construir pantallas reales y descubrir faltantes de forma útil.
La mejor inversión ahora es hacer visible el flujo clínico principal y usar esa UI para tensar el sistema antes de pasar a inventario, caja o reportes.

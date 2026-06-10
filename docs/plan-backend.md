# Plan Backend — Sistema de gestión clínica estética
> Derivado de `Plan.md`. Este documento organiza solo el carril backend y deja claros los contratos que debe entregar al frontend.

---

## Cómo usar este documento

Trabaja este plan en orden. Cada hito backend debe cerrar con tres salidas:
- modelo de datos o lógica lista
- endpoints o servicios estables
- contrato documentado para frontend

No marques un hito como completo si el contrato aún cambia de forma frecuente.

## Reglas de coordinación con frontend

- Backend siempre va primero en cada módulo funcional.
- Todo endpoint nuevo debe tener payload de entrada, payload de salida, errores esperados y reglas de permisos.
- Si un módulo todavía no tiene UI, igual debe dejar su contrato listo para consumo posterior.
- Cuando haya una decisión que impacta frontend, documentarla aquí y reflejarla luego en `plan-frontend.md`.

## Convenciones clave

- Soft delete con `activo` en modelos funcionales; evitar `DELETE` físico salvo tokens efímeros o tablas técnicas.
- Historia clínica, notas clínicas y consentimientos son inmutables.
- Errores API en formato `{"error": "mensaje", "code": "ERROR_CODE"}`.
- JWT definido desde el inicio con refresh rotation y blacklist.
- URLs de MinIO siempre firmadas; nunca públicas.

## Orden backend recomendado

### Fase B1 — Base técnica

1. H1 infraestructura, settings, Docker, MinIO, n8n, Traefik.
2. H1.2 apps Django vacías y routing base.
3. H2.1 modelo `User` custom.
4. H2.2 auth JWT.
5. H2.3 permisos y mixins de scoping por clínica/sede.

**Contrato que se entrega al frontend**
- `/api/v1/auth/login/`
- `/api/v1/auth/refresh/`
- `/api/v1/auth/logout/`
- `/api/v1/auth/me/`

### Fase B2 — Maestros operativos

1. H3 clínicas, sedes y servicios.
2. H4 colaboradores.
3. H4.5 multi-sede y horarios por colaborador.
4. H5 pacientes.

**Contrato que se entrega al frontend**
- CRUD de sedes y servicios.
- `GET /clinicas/servicios/activos/`
- `GET /colaboradores/profesionales/`
- CRUD de pacientes.
- `GET /pacientes/buscar/`
- `GET /colaboradores/horarios/`
- `POST /colaboradores/horarios/`
- `PATCH /colaboradores/horarios/{id}/`
- `DELETE /colaboradores/horarios/{id}/`
- `GET /pacientes/{id}/` — incluye todos los campos extendidos de H5.2

---

#### H5.2 — Campos demográficos, clínicos y de seguridad social en Paciente

**Motivación:** el modelo actual de `Paciente` solo captura datos básicos de identidad y contacto. Para una clínica de salud estética en Colombia se necesita: dirección de residencia, perfil socioeconómico (estado civil, ocupación, escolaridad, grupo étnico), datos de salud elementales (grupo sanguíneo) y afiliación al SGSSS (EPS, tipo de afiliado, régimen). También se requiere un contacto de responsable/acompañante. Actualmente varios de estos campos se almacenan temporalmente en `localStorage` del frontend (datos_comp_*) como puente hasta este hito.

**Archivos que se tocan:** `apps/pacientes/models.py`, `apps/pacientes/serializers.py`, nueva migración.

**Nuevos campos en el modelo `Paciente`** (todos opcionales, `blank=True`):

```python
# ── Residencia ─────────────────────────────────────────────────────────────────
direccion              = CharField(max_length=255, blank=True)
ciudad                 = CharField(max_length=100, blank=True)
barrio                 = CharField(max_length=100, blank=True)

# ── Perfil socioeconómico ──────────────────────────────────────────────────────
ESTADO_CIVIL_CHOICES = [
    ('soltero','Soltero/a'), ('casado','Casado/a'), ('union_libre','Unión libre'),
    ('separado','Separado/a'), ('divorciado','Divorciado/a'), ('viudo','Viudo/a'),
]
estado_civil           = CharField(max_length=20, choices=ESTADO_CIVIL_CHOICES, blank=True)
ocupacion              = CharField(max_length=100, blank=True)

ESCOLARIDAD_CHOICES = [
    ('ninguna','Sin escolaridad'), ('primaria','Primaria'), ('secundaria','Secundaria'),
    ('tecnico','Técnico/Tecnólogo'), ('universitario','Universitario'), ('posgrado','Posgrado'),
]
escolaridad            = CharField(max_length=20, choices=ESCOLARIDAD_CHOICES, blank=True)

ETNIA_CHOICES = [
    ('mestizo','Mestizo'), ('blanco','Blanco'), ('afrocolombiano','Afrocolombiano/Afrodescendiente'),
    ('indigena','Indígena'), ('raizal','Raizal'), ('rom','ROM/Gitano'), ('otro','Otro'),
]
grupo_etnico           = CharField(max_length=20, choices=ETNIA_CHOICES, blank=True)

# ── Datos de salud elementales ─────────────────────────────────────────────────
SANGRE_CHOICES = [
    ('A+','A+'), ('A-','A-'), ('B+','B+'), ('B-','B-'),
    ('AB+','AB+'), ('AB-','AB-'), ('O+','O+'), ('O-','O-'),
]
grupo_sanguineo        = CharField(max_length=5, choices=SANGRE_CHOICES, blank=True)

# ── Seguridad social — SGSSS Colombia ─────────────────────────────────────────
eps                    = CharField(max_length=100, blank=True)

TIPO_AFILIADO_CHOICES = [
    ('cotizante','Cotizante'), ('beneficiario','Beneficiario'),
    ('independiente','Independiente'), ('subsidiado','Subsidiado'), ('vinculado','Vinculado'),
]
tipo_afiliado          = CharField(max_length=20, choices=TIPO_AFILIADO_CHOICES, blank=True)

REGIMEN_CHOICES = [
    ('contributivo','Contributivo'), ('subsidiado','Subsidiado'),
    ('vinculado','Vinculado'), ('especial','Especial/Excepción'), ('pensionado','Pensionado'),
]
regimen                = CharField(max_length=20, choices=REGIMEN_CHOICES, blank=True)

# ── Contacto de responsable/acompañante ───────────────────────────────────────
nombre_responsable     = CharField(max_length=200, blank=True)
parentesco_responsable = CharField(max_length=50, blank=True)
telefono_responsable   = CharField(max_length=20, blank=True)
```

**Cambios en el serializador `PacienteSerializer`:**
- Incluir todos los campos nuevos como `required=False`.
- El endpoint `GET /pacientes/buscar/` **no** expone estos campos (solo `id`, `nombre_completo`, `numero_documento`, `tipo_documento`, `telefono`, `canal_confirmacion`).
- `PATCH /pacientes/{id}/` acepta cualquier subconjunto de campos nuevos.
- `POST /pacientes/` ignora los campos nuevos si no vienen (default `''`).

**Definition of done:**
- [ ] Migración `0005_paciente_campos_extendidos.py` aplicada sin romper datos existentes
- [ ] `GET /pacientes/{id}/` devuelve todos los campos nuevos (vacíos si no completados)
- [ ] `PATCH /pacientes/{id}/` acepta y persiste cualquier subconjunto de los nuevos campos
- [ ] No hay campos requeridos nuevos: `POST /pacientes/` sigue funcionando con el payload mínimo actual
- [ ] Scoping por clínica preservado

**Contrato que se entrega al frontend — H5.2:**
```json
// GET /pacientes/{id}/
{
  "id": "uuid",
  "nombres": "...", "apellidos": "...", "nombre_completo": "...",
  "tipo_documento": "CC", "numero_documento": "...",
  "sexo": "F", "fecha_nacimiento": "1990-05-15",
  "telefono": "3001234567", "email": "...",
  "canal_confirmacion": "whatsapp", "autoriza_datos": true,
  // Nuevos campos H5.2 — todos opcionales, string vacío si no completados
  "direccion": "", "ciudad": "", "barrio": "",
  "estado_civil": "soltero", "ocupacion": "", "escolaridad": "universitario", "grupo_etnico": "",
  "grupo_sanguineo": "O+",
  "eps": "Sura", "tipo_afiliado": "cotizante", "regimen": "contributivo",
  "nombre_responsable": "", "parentesco_responsable": "", "telefono_responsable": ""
}
```

---

#### H4.5 — Multi-sede y horarios recurrentes por colaborador

**Motivación:** un profesional puede atender en más de una sede con horarios distintos (ej. mañana en Sede A, tarde en Sede B). El modelo actual solo soporta `sede_principal` (FK única). Este hito extiende la relación y agrega un modelo de disponibilidad semanal por colaborador × sede.

**Archivos que se tocan:** `apps/colaboradores/models.py`, `apps/colaboradores/serializers.py`, `apps/colaboradores/views.py`, `apps/colaboradores/urls.py`, nueva migración.

**Cambios en el modelo Colaborador:**
- Agregar relación M2M: `sedes = ManyToManyField(Sede, blank=True, related_name='colaboradores')`.
- `sede_principal` se mantiene como FK obligatoria (compatibilidad).
- El backend debe incluir `sede_principal` en `sedes` automáticamente al guardar.

**Nuevo modelo HorarioColaborador:**
```python
class HorarioColaborador(models.Model):
    DIA_CHOICES = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']
    colaborador  = ForeignKey(Colaborador, on_delete=CASCADE, related_name='horarios')
    sede         = ForeignKey(Sede, on_delete=CASCADE)
    dia_semana   = CharField(max_length=10, choices=DIA_CHOICES)
    hora_inicio  = TimeField()
    hora_fin     = TimeField()

    class Meta:
        unique_together = ('colaborador', 'sede', 'dia_semana')
        ordering = ['dia_semana', 'hora_inicio']
```

**Serializer ColaboradorSerializer — campos nuevos:**
- `sedes: list[uuid]` — IDs del M2M (escritura: acepta `sedes_ids`)
- `sedes_detalle: [{id, nombre}]` — lectura expandida
- `horarios: [HorarioColaboradorSerializer]` — read-only nested en GET detail

**Endpoints nuevos:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/colaboradores/horarios/` | Lista horarios; filtra por `?colaborador=<uuid>` |
| POST   | `/colaboradores/horarios/` | Crea horario |
| PATCH  | `/colaboradores/horarios/{id}/` | Edita hora_inicio / hora_fin |
| DELETE | `/colaboradores/horarios/{id}/` | Elimina horario |

**Serializer HorarioColaboradorSerializer:**
```
id, colaborador (uuid), sede (uuid), sede_nombre (read), dia_semana, hora_inicio, hora_fin
```

**Validaciones:**
- `hora_fin > hora_inicio`
- La `sede` debe estar en `colaborador.sedes` (no se puede asignar horario en una sede a la que no pertenece)
- Unique constraint: `(colaborador, sede, dia_semana)` — un solo bloque horario por día × sede

**Cambio en `slots_disponibles`:**
- Si el colaborador tiene `HorarioColaborador`, el cálculo de slots debe intersectar el horario de la sede con el horario del colaborador en esa sede ese día.
- Si no tiene horarios definidos, el comportamiento actual (solo horario de la sede) se mantiene como fallback.

**Actualización en `PATCH /colaboradores/{id}/`:**
- Acepta `sedes_ids: [uuid]` — reemplaza el M2M completo.
- Si `sede_principal_id` cambia, garantizar que también esté en `sedes`.

**Definition of done:**
- [ ] Migración aplicada sin romper datos existentes
- [ ] `GET /colaboradores/{id}/` incluye `sedes`, `sedes_detalle`, `horarios`
- [ ] `PATCH /colaboradores/{id}/` acepta `sedes_ids`
- [ ] CRUD de `/colaboradores/horarios/` operativo con filtro `?colaborador=`
- [ ] `slots_disponibles` usa horario del colaborador cuando existe
- [ ] Permisos: `IsAdmin` para escritura; profesional puede leer sus propios horarios

**Prompt para AI:**
```
Implementa el hito H4.5 en apps/colaboradores/ siguiendo las convenciones del proyecto.

1. En models.py:
   - Agrega `sedes = ManyToManyField('clinicas.Sede', blank=True, related_name='colaboradores')` a Colaborador.
   - Crea modelo HorarioColaborador con campos: colaborador (FK), sede (FK), dia_semana (CharField choices), hora_inicio (TimeField), hora_fin (TimeField). Meta: unique_together=(colaborador, sede, dia_semana).

2. En serializers.py:
   - Actualiza ColaboradorSerializer: expone `sedes` (PrimaryKeyRelatedField many=True), `sedes_detalle` (SerializerMethodField → [{id, nombre}]), y `horarios` (nested HorarioColaboradorSerializer many=True, read_only).
   - En update(): si llega `sedes_ids`, usar set() en el M2M; siempre incluir sede_principal en el conjunto.
   - Crea HorarioColaboradorSerializer: id, colaborador, sede, sede_nombre (read), dia_semana, hora_inicio, hora_fin. Valida hora_fin > hora_inicio y que sede ∈ colaborador.sedes.

3. En views.py:
   - Agrega HorarioColaboradorViewSet (ModelViewSet sin list paginado — devuelve list plano). Filtro obligatorio: colaborador. Sin él, retorna [].
   - Permisos: IsAuthenticated + (IsAdmin OR es el propio colaborador en GET).

4. En apps/agenda/views.py (slots_disponibles):
   - Si el colaborador tiene HorarioColaborador para esa sede y ese día, reemplazar ventana horaria por [hora_inicio, hora_fin] del horario del colaborador en vez del horario completo de la sede.
   - Si no hay HorarioColaborador, mantener comportamiento actual.

5. Registrar HorarioColaboradorViewSet en urls.py bajo colaboradores/horarios/.
```

**Contrato que se entrega al frontend:**
- `GET /colaboradores/{id}/` → ahora incluye `sedes`, `sedes_detalle`, `horarios`
- `PATCH /colaboradores/{id}/` → acepta `sedes_ids`
- `GET /colaboradores/horarios/?colaborador=<uuid>`
- `POST /colaboradores/horarios/`
- `PATCH /colaboradores/horarios/{id}/`
- `DELETE /colaboradores/horarios/{id}/`

---

---

#### H4.6 — Colaboradores con roles dinámicos y flujo de tenant

**Motivación:** el modelo actual de `/colaboradores/` acepta `rol` como slug hardcodeado (`profesional` | `recepcion`). Con el nuevo RBAC dinámico, el frontend necesita asignar un `role_id` (UUID) al crear/editar colaboradores, y recibir `role_id` / `role_nombre` de vuelta. Además, el frontend necesita saber si un rol tiene perfil profesional (para mostrar el picker de especialidades). Por último, cuando se registra un nuevo tenant, el admin propietario debe existir tanto como `User` como `Colaborador` para que la gestión sea unificada.

**Archivos que se tocan:** `apps/colaboradores/models.py`, `apps/colaboradores/serializers.py`, `apps/colaboradores/views.py`, `apps/users/models.py` (Rol), nueva migración.

**Cambio 1 — Modelo `Rol`: agregar `es_profesional`**
```python
class Rol(models.Model):
    # ... campos existentes ...
    es_profesional = BooleanField(default=False)
    # True en roles que tienen perfil profesional (atienden citas, tienen especialidades, horarios)
    # El rol "profesional" built-in debe tener es_profesional=True en la migración de datos
```

**Cambio 2 — `ColaboradorSerializer`: aceptar y devolver `role_id`**
- `POST /colaboradores/` acepta `role_id` (UUID, obligatorio). Si viene `role_id`, asignar el rol al `User` vinculado usando el nuevo RBAC. El campo `rol` (slug) queda como alias de compatibilidad — si solo llega `rol` sin `role_id`, buscar el `Rol` por slug y asignar.
- `GET /colaboradores/` devuelve `role_id` y `role_nombre` del usuario vinculado (además del `rol` slug existente).
- `PATCH /colaboradores/{id}/` acepta `role_id` para cambiar el rol del usuario vinculado.

**Cambio 3 — `RolSerializer`: exponer `es_profesional`**
- `GET /usuarios/roles/` incluye `es_profesional: bool` en cada rol.

**Cambio 4 — Creación de tenant: admin con colaborador**
Cuando se registra un nuevo tenant/clínica, el backend debe:
1. Crear el `User` administrador (rol `admin`).
2. Crear automáticamente un `Colaborador` vinculado a ese usuario con datos mínimos (nombre, email, sede principal si ya existe).
Esto elimina la necesidad de un flujo separado de creación de admin desde el frontend.

**Definition of done:**
- [ ] `Rol.es_profesional` en modelo, migración y serializer
- [ ] `POST /colaboradores/` acepta `role_id`; asigna rol al User; devuelve `role_id` + `role_nombre`
- [ ] `PATCH /colaboradores/{id}/` acepta `role_id`
- [ ] `GET /colaboradores/` y `GET /colaboradores/{id}/` incluyen `role_id`, `role_nombre`
- [ ] `GET /usuarios/roles/` incluye `es_profesional`
- [ ] Al crear tenant, se crea `Colaborador` para el admin automáticamente

**Prompt para AI:**
```
Implementa el hito H4.6 en apps/colaboradores/ y apps/users/ siguiendo las convenciones del proyecto.

1. En apps/users/models.py — agrega a Rol:
   - es_profesional = BooleanField(default=False)
   Crea migración de datos: el Rol con slug='profesional' debe tener es_profesional=True.

2. En apps/users/serializers.py — RolSerializer:
   - Añade es_profesional al serializer (lectura y escritura).

3. En apps/colaboradores/serializers.py — ColaboradorSerializer:
   - Añade role_id (SerializerMethodField read → colaborador.user.role_id o None)
   - Añade role_nombre (SerializerMethodField read → colaborador.user.role_nombre o None)
   - En create() y update(): si llega role_id en validated_data, asignar el Rol al User vinculado
     (user.role = Rol.objects.get(id=role_id, clinica=request.user.clinica); user.save())
   - Si llega rol (slug) sin role_id, buscar Rol por slug como fallback.

4. En la señal o vista de registro de tenant (donde se crea la Clinica y el User admin):
   - Después de crear el User admin, crear Colaborador(user=admin_user, tipo_contrato='empleado',
     sede_principal=primera_sede, fecha_ingreso=today, activo=True, especialidades=[])
   - Si no hay sede aún, dejar sede_principal=None y actualizar cuando se cree la primera sede.

5. Crea la migración para es_profesional.
```

**Contrato que se entrega al frontend — H4.6:**
```json
// GET /colaboradores/{id}/
{
  "id": "uuid",
  "user": "uuid",
  "nombre_completo": "Ana García",
  "email": "ana@clinica.com",
  "rol": "profesional",
  "role_id": "uuid-del-rol",
  "role_nombre": "Profesional",
  "activo": true,
  "tipo_contrato": "empleado",
  ...
}

// GET /usuarios/roles/
[
  { "id": "uuid", "nombre": "Profesional", "slug": "profesional", "es_profesional": true, "activo": true, ... },
  { "id": "uuid", "nombre": "Recepción",   "slug": "recepcion",   "es_profesional": false, "activo": true, ... },
  { "id": "uuid", "nombre": "Admin",       "slug": "admin",       "es_profesional": false, "activo": true, ... }
]
```

---

### Fase B3 — Agenda y confirmación

1. H6 modelos de agenda, disponibilidad, slots y flujo de estados.
2. H7 confirmación multicanal.
3. H6.1 trazabilidad de confirmaciones.

**Contrato que se entrega al frontend**
- CRUD de citas.
- `GET /agenda/citas/slots_disponibles/`
- `POST /agenda/citas/{id}/cambiar_estado/`
- `GET /agenda/citas/{id}/registros_confirmacion/`
- `GET /agenda/citas/hoy/`
- `GET /api/v1/agenda/confirmar/{token}/detalle/`
- `POST /api/v1/agenda/confirmar/{token}/`
- `PATCH /api/v1/agenda/{id}/confirmar_manual/`

---

#### H6.1 — Trazabilidad de confirmaciones y cambios de estado

**Motivación:** hoy no hay forma de saber quién confirmó una cita, por qué medio habló con el paciente, cuándo exactamente lo hizo, ni qué dijo el cliente. Esta información es crítica para auditoría y para que el profesional sepa el contexto antes de atender.

**Archivos que se tocan:** `apps/agenda/models.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, `apps/agenda/urls.py`, nueva migración.

**Nuevo modelo `RegistroConfirmacion`:**
```python
class RegistroConfirmacion(models.Model):
    MEDIO_CHOICES = [
        ('whatsapp',   'WhatsApp'),
        ('llamada',    'Llamada telefónica'),
        ('sms',        'SMS'),
        ('presencial', 'Presencial'),
        ('link',       'Link de confirmación'),
        ('email',      'Email'),
    ]
    cita             = ForeignKey(Cita, on_delete=CASCADE, related_name='registros_confirmacion')
    estado_resultante = CharField(max_length=20)   # confirmada | cancelada | no_asistio | en_curso
    usuario          = ForeignKey(User, on_delete=SET_NULL, null=True, blank=True)
    usuario_nombre   = CharField(max_length=200, blank=True)  # snapshot del nombre al momento
    medio            = CharField(max_length=20, choices=MEDIO_CHOICES, blank=True)
    nota             = TextField(blank=True)        # "paciente confirmó pero llega 10 min tarde"
    created_at       = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
```

**Cambios en `cambiar_estado`:**
- `POST /agenda/citas/{id}/cambiar_estado/` acepta dos campos opcionales nuevos:
  ```json
  {
    "estado": "confirmada",
    "motivo_cancelacion": "",
    "medio": "llamada",
    "nota": "Paciente llamó, confirma pero llega 10 min tarde"
  }
  ```
- Al ejecutar el cambio de estado, si `estado` ∈ `{confirmada, cancelada, no_asistio, en_curso}`, crear automáticamente un `RegistroConfirmacion` con los datos del request + `usuario=request.user` + `usuario_nombre=request.user.nombre_completo`.
- Si el cambio lo hace el paciente vía link (endpoint público), `usuario=null` y `usuario_nombre="Paciente (autoconfirmación)"`.

**Cambios en `confirmar_manual`:**
- `PATCH /agenda/citas/{id}/confirmar_manual/` acepta también `medio` y `nota`.
- Igualmente crea `RegistroConfirmacion`.

**Nuevo endpoint:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/agenda/citas/{id}/registros_confirmacion/` | Lista cronológica de registros de la cita |

Response (lista simple, sin paginación):
```json
[
  {
    "id": "uuid",
    "estado_resultante": "confirmada",
    "usuario_nombre": "María López",
    "medio": "llamada",
    "nota": "Paciente llamó, confirma pero llega 10 min tarde",
    "created_at": "2026-05-08T10:32:00Z"
  },
  {
    "id": "uuid",
    "estado_resultante": "confirmada",
    "usuario_nombre": "Paciente (autoconfirmación)",
    "medio": "link",
    "nota": "",
    "created_at": "2026-05-07T18:00:00Z"
  }
]
```

**`CitaSerializer` — campo nuevo (lectura):**
- `ultimo_registro_confirmacion`: objeto con el registro más reciente (o `null`). Permite al frontend mostrar el último estado de contacto en la tarjeta de la cita sin una llamada adicional.

**Definition of done:**
- [ ] Modelo y migración aplicados
- [ ] `POST cambiar_estado/` acepta `medio` y `nota`; crea `RegistroConfirmacion` automáticamente para estados relevantes
- [ ] `PATCH confirmar_manual/` ídem
- [ ] `GET registros_confirmacion/` devuelve lista ordenada por `created_at desc`
- [ ] `CitaSerializer` expone `ultimo_registro_confirmacion`
- [ ] Autoconfirmación pública (link) crea registro con `usuario=null`
- [ ] Scoping: solo usuarios de la misma clínica pueden ver registros

**Prompt para AI:**
```
Implementa el hito H6.1 en apps/agenda/ siguiendo las convenciones del proyecto.

1. En apps/agenda/models.py — crea RegistroConfirmacion:
   - cita = ForeignKey(Cita, CASCADE, related_name='registros_confirmacion')
   - estado_resultante = CharField(max_length=20)
   - usuario = ForeignKey(settings.AUTH_USER_MODEL, SET_NULL, null=True, blank=True)
   - usuario_nombre = CharField(max_length=200, blank=True)
   - medio = CharField(max_length=20, choices=MEDIO_CHOICES, blank=True)
     MEDIO_CHOICES: whatsapp, llamada, sms, presencial, link, email
   - nota = TextField(blank=True)
   - created_at = DateTimeField(auto_now_add=True)
   - Meta: ordering=['-created_at']

2. En apps/agenda/serializers.py:
   - Crea RegistroConfirmacionSerializer: id, estado_resultante, usuario_nombre, medio, nota, created_at (todos read-only en lectura)
   - En CitaSerializer añade ultimo_registro_confirmacion = SerializerMethodField →
     obj.registros_confirmacion.first() serializado, o None

3. En apps/agenda/views.py — en CitaViewSet:
   - Modifica cambiar_estado(): extraer medio y nota del request.data (opcionales, default '').
     Si nuevo estado ∈ {confirmada, cancelada, no_asistio, en_curso}, crear RegistroConfirmacion con:
     cita=cita, estado_resultante=nuevo_estado, usuario=request.user,
     usuario_nombre=request.user.nombre_completo or request.user.get_full_name(),
     medio=medio, nota=nota
   - Modifica confirmar_manual(): ídem, estado_resultante='confirmada'
   - Agrega @action GET 'registros_confirmacion/': retorna RegistroConfirmacionSerializer(many=True) de la cita
   - En el endpoint público de firma de consentimiento (si aplica), crear registro con usuario=None,
     usuario_nombre='Paciente (autoconfirmación)', medio='link'

4. En apps/agenda/urls.py: registrar la action registros_confirmacion/

5. Crear migración.
```

**Contrato que se entrega al frontend — H6.1:**
- `POST /agenda/citas/{id}/cambiar_estado/` — ahora acepta `medio` y `nota` opcionales
- `PATCH /agenda/citas/{id}/confirmar_manual/` — ídem
- `GET /agenda/citas/{id}/registros_confirmacion/` — historial de contacto
- `GET /agenda/citas/{id}/` — ahora incluye `ultimo_registro_confirmacion`

#### H6.2 — Estado `en_espera`: registro de llegada del paciente y separación del flujo recepción/profesional

**Motivación:** el flujo actual salta de `confirmada` directo a `en_curso`, mezclando dos responsabilidades distintas: recepción registra que el paciente llegó, y el profesional inicia la atención. Eso obliga a verificar el consentimiento justo al inicio de la atención, cuando ya no hay tiempo para corregirlo. El nuevo estado `en_espera` separa ambas etapas:

- **Recepción**: registra la llegada → `confirmada → en_espera`. En este momento se verifica y firma el consentimiento si es necesario.
- **Profesional**: inicia la atención cuando el paciente ya está listo → `en_espera → en_curso`.

**Archivos que se tocan:** `apps/agenda/models.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, nueva migración.

**Cambio en el modelo `Cita` — nuevo estado:**
```python
ESTADO_CHOICES = [
    ('pendiente',   'Pendiente'),
    ('confirmada',  'Confirmada'),
    ('en_espera',   'En espera'),   # ← NUEVO: paciente llegó, esperando al profesional
    ('en_curso',    'En curso'),
    ('completada',  'Completada'),
    ('cancelada',   'Cancelada'),
    ('no_asistio',  'No asistió'),
]
```

**Transiciones válidas:**
```
pendiente   → confirmada
confirmada  → en_espera     ← nueva (recepción registra llegada)
confirmada  → cancelada
confirmada  → no_asistio
en_espera   → en_curso      ← antes era confirmada → en_curso
en_espera   → cancelada
en_curso    → completada
en_curso    → cancelada
```

La transición `confirmada → en_curso` **queda eliminada**. El backend debe rechazarla con `400 Bad Request`:
```json
{"error": "La cita debe pasar primero por en_espera antes de iniciar la atención.", "code": "INVALID_TRANSITION"}
```

**Cambio en `cambiar_estado`:**
- `POST /agenda/citas/{id}/cambiar_estado/` con `{"estado": "en_espera"}` registra la llegada.
- Crea `RegistroConfirmacion` con `estado_resultante="en_espera"` (reutiliza la lógica de H6.1).
- Responde con la cita actualizada incluyendo `consentimiento_info` para que el frontend decida si abre el sheet de firma.

**Validación de consentimiento — movida a `en_espera → en_curso`:**
- La validación de consentimiento firmado y vigente se realiza al intentar pasar a `en_curso`, no al pasar a `en_espera`.
- Esto permite que recepción registre la llegada aunque el consentimiento no esté listo aún, y lo gestione en ese momento.

**`CitaSerializer` — campo `consentimiento_info`:**
El campo ya existe (H9.1/H9.4). No requiere cambios — sigue devolviendo `requerido`, `vigente`, `token`, `template_nombre` y `consentimiento_id`.

**Definition of done:**
- [ ] Migración aplicada con el nuevo valor `en_espera` en `ESTADO_CHOICES`
- [ ] `cambiar_estado` acepta `confirmada → en_espera`
- [ ] `cambiar_estado` acepta `en_espera → en_curso` y valida consentimiento en esa transición
- [ ] `cambiar_estado` rechaza `confirmada → en_curso` con error claro
- [ ] `RegistroConfirmacion` se crea al pasar a `en_espera` (igual que otros estados)
- [ ] `GET /agenda/citas/?estado=en_espera` filtra correctamente
- [ ] `GET /agenda/citas/hoy/` incluye citas en `en_espera`
- [ ] Scoping por clínica respetado

**Prompt para AI:**
```
Implementa el hito H6.2 en apps/agenda/ siguiendo las convenciones del proyecto.

1. En apps/agenda/models.py — agrega 'en_espera' a ESTADO_CHOICES de Cita, entre 'confirmada' y 'en_curso'. Crea la migración correspondiente.

2. En la lógica de cambiar_estado (view o service según la estructura actual):
   - Permite la transición confirmada → en_espera.
   - Permite la transición en_espera → en_curso (con validación de consentimiento vigente si el servicio lo requiere — misma lógica que hoy existe para confirmada → en_curso).
   - Rechaza la transición confirmada → en_curso con 400 y {"error": "...", "code": "INVALID_TRANSITION"}.
   - Al pasar a en_espera, crea RegistroConfirmacion con estado_resultante="en_espera" (igual que los demás estados).

3. Asegúrate de que GET /agenda/citas/?estado=en_espera funcione.

4. Incluye tests básicos de las transiciones válidas e inválidas.
```

**Contrato que se entrega al frontend — H6.2:**

`EstadoCita` actualizado:
```typescript
export type EstadoCita = 'pendiente' | 'confirmada' | 'en_espera' | 'en_curso' | 'completada' | 'cancelada' | 'no_asistio'
```

Nuevo flujo de botones:
- Recepción (agenda / CitaDetailSheet): cita `confirmada` → botón **"Registrar llegada"** → `POST cambiar_estado { estado: "en_espera" }` → si `consentimiento_info.requerido && !consentimiento_info.vigente` → abrir sheet de firma → después cita queda en `en_espera`
- Profesional (atenciones / ColaEspera): cita `en_espera` → botón **"Iniciar atención"** → `POST cambiar_estado { estado: "en_curso" }` (el backend valida el consentimiento en esta transición)
- La cola del profesional (`/atenciones`) incluye citas `en_espera` además de `confirmada` y `pendiente`

---

### Fase B4 — Historia clínica y consentimientos

1. H8 historia clínica inmutable + campos estéticos + antecedentes del paciente.
2. H9 consentimientos informados.

**Contrato que se entrega al frontend**
- `GET /historia-clinica/historias/?paciente=<uuid>` — historia del paciente
- `GET /historia-clinica/historias/{id}/notas/` — notas de la historia
- `POST /historia-clinica/notas/` — crear nota (con campos estéticos nuevos)
- `POST /historia-clinica/fotos/` — subir foto con `url_firmada` en respuesta
- `GET /pacientes/{id}/antecedentes/` — antecedentes médicos del paciente
- `PUT /pacientes/{id}/antecedentes/` — upsert de antecedentes
- `GET /historia-clinica/consentimientos/?paciente=<uuid>` — lista consentimientos
- `POST /historia-clinica/consentimientos/` — crear consentimiento
- `PATCH /historia-clinica/consentimientos/{id}/` — actualizar (marcar firmado, subir archivo)
- `DELETE /historia-clinica/consentimientos/{id}/` — eliminar

---

#### H8 — Historia clínica con campos estéticos y antecedentes del paciente

**Motivación:** el modelo actual de `NotaClinica` es genérico (anamnesis, diagnóstico, plan de manejo). Para una clínica estética el profesional necesita registrar zonas tratadas, productos con lote, técnica, dosis, cuidados post y reacciones adversas. Además, el paciente requiere un perfil de antecedentes (alergias, tipo de piel, contraindicaciones) visible durante la atención.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, `apps/pacientes/models.py`, `apps/pacientes/serializers.py`, `apps/pacientes/views.py`, `apps/pacientes/urls.py`, nueva migración en ambas apps.

**Cambios en `NotaClinica` — campos nuevos:**
```python
# Campos estéticos — todos opcionales para no romper notas genéricas
zona_tratada        = JSONField(blank=True, null=True)
# Estructura: [{"zona": "frente", "descripcion": "líneas horizontales", "unidades": "20"}]

productos_usados    = JSONField(blank=True, null=True)
# Estructura: [{"nombre": "Dysport", "marca": "Ipsen", "lote": "DY2024A", "cantidad": "100", "unidad": "UI"}]

tecnica             = CharField(max_length=255, blank=True, null=True)
reacciones_adversas = TextField(blank=True, null=True)
cuidados_post       = TextField(blank=True, null=True)
proxima_cita_sugerida = CharField(max_length=255, blank=True, null=True)
```

**Nuevo modelo `AntecedentePaciente`** en `apps/pacientes/models.py`:
```python
class AntecedentePaciente(models.Model):
    FITZPATRICK_CHOICES = [
        ('I', 'Tipo I — Muy clara, siempre se quema'),
        ('II', 'Tipo II — Clara, generalmente se quema'),
        ('III', 'Tipo III — Intermedia, a veces se quema'),
        ('IV', 'Tipo IV — Morena clara, raramente se quema'),
        ('V', 'Tipo V — Morena oscura, muy raramente se quema'),
        ('VI', 'Tipo VI — Muy oscura, nunca se quema'),
    ]
    paciente              = OneToOneField('Paciente', on_delete=CASCADE, related_name='antecedentes')
    alergias              = TextField(blank=True)
    medicamentos_actuales = TextField(blank=True)
    condiciones_medicas   = TextField(blank=True)   # HTA, diabetes, embarazo, etc.
    contraindicaciones    = TextField(blank=True)   # texto libre para alertas al profesional
    tipo_piel             = CharField(max_length=3, choices=FITZPATRICK_CHOICES, blank=True)
    antecedentes_esteticos = TextField(blank=True)  # cirugías previas, rellenos permanentes, etc.
    updated_at            = DateTimeField(auto_now=True)
    created_at            = DateTimeField(auto_now_add=True)
```

**Serializer `NotaClinicaSerializer` — campos nuevos** (añadir junto a los existentes):
```
zona_tratada, productos_usados, tecnica, reacciones_adversas, cuidados_post, proxima_cita_sugerida
```
Todos opcionales. `zona_tratada` y `productos_usados` son JSONField — validar que sean listas si vienen presentes.

**Serializer `AntecedentePacienteSerializer`:**
```
paciente (uuid, read-only), alergias, medicamentos_actuales, condiciones_medicas,
contraindicaciones, tipo_piel, antecedentes_esteticos, updated_at
```

**Endpoints nuevos en `apps/pacientes/`:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/pacientes/{id}/antecedentes/` | Retorna antecedentes; 404 si no existen aún |
| PUT    | `/pacientes/{id}/antecedentes/` | Upsert completo — crea si no existe, reemplaza si existe |
| PATCH  | `/pacientes/{id}/antecedentes/` | Actualización parcial |

Implementar como `@action(detail=True, methods=['get', 'put', 'patch'])` en `PacienteViewSet`.

**Serializer `PacienteSerializer` — lectura** (añadir campo):
- `tiene_antecedentes: bool` (SerializerMethodField → `hasattr(obj, 'antecedentes')`)

Esto permite al frontend saber si debe mostrar el formulario de antecedentes vacío o con datos.

**Validaciones:**
- `zona_tratada` y `productos_usados`: si presentes, deben ser listas de objetos; rechazar con 400 si vienen como string.
- `tipo_piel`: debe ser uno de los valores Fitzpatrick o vacío.
- Antecedentes: solo el profesional asignado a la cita o un admin puede hacer `PUT/PATCH`.

**Definition of done:**
- [ ] Migración aplicada sin romper notas existentes (todos los campos nuevos son nullable)
- [ ] `GET /historia-clinica/notas/{id}/` incluye todos los campos nuevos
- [ ] `POST /historia-clinica/notas/` acepta los nuevos campos opcionalmente
- [ ] `GET /pacientes/{id}/antecedentes/` devuelve 404 con `{"error": "Sin antecedentes registrados"}` si no existen
- [ ] `PUT /pacientes/{id}/antecedentes/` crea o reemplaza antecedentes
- [ ] `PATCH /pacientes/{id}/antecedentes/` actualización parcial
- [ ] `PacienteSerializer` expone `tiene_antecedentes`
- [ ] Permisos: profesional ve antecedentes de sus pacientes; admin ve todos; paciente no accede

**Prompt para AI:**
```
Implementa el hito H8 en apps/historia_clinica/ y apps/pacientes/ siguiendo las convenciones del proyecto.

1. En apps/historia_clinica/models.py — agrega a NotaClinica:
   - zona_tratada = JSONField(blank=True, null=True)
   - productos_usados = JSONField(blank=True, null=True)
   - tecnica = CharField(max_length=255, blank=True, null=True)
   - reacciones_adversas = TextField(blank=True, null=True)
   - cuidados_post = TextField(blank=True, null=True)
   - proxima_cita_sugerida = CharField(max_length=255, blank=True, null=True)

2. En apps/pacientes/models.py — crea AntecedentePaciente:
   - OneToOneField a Paciente (related_name='antecedentes')
   - Campos: alergias, medicamentos_actuales, condiciones_medicas, contraindicaciones (todos TextField blank=True)
   - tipo_piel = CharField(max_length=3, choices=FITZPATRICK_CHOICES, blank=True)
   - antecedentes_esteticos = TextField(blank=True)
   - updated_at = DateTimeField(auto_now=True), created_at = DateTimeField(auto_now_add=True)
   - FITZPATRICK_CHOICES: ('I','II','III','IV','V','VI')

3. En apps/historia_clinica/serializers.py — añade los 6 campos nuevos a NotaClinicaSerializer.
   En validate(): si zona_tratada o productos_usados vienen presentes, verificar que sean list; si no, raise ValidationError.

4. En apps/pacientes/serializers.py:
   - Crea AntecedentePacienteSerializer con todos los campos de AntecedentePaciente.
   - En PacienteSerializer añade tiene_antecedentes = SerializerMethodField → hasattr(obj, 'antecedentes').

5. En apps/pacientes/views.py — en PacienteViewSet:
   - Agrega @action(detail=True, methods=['get','put','patch'], url_path='antecedentes')
   - GET: retorna antecedentes o 404 con {"error": "Sin antecedentes registrados", "code": "NOT_FOUND"}
   - PUT: AntecedentePaciente.objects.update_or_create(paciente=paciente, defaults={...datos...})
   - PATCH: igual pero partial=True en el serializer
   - Permisos: IsAuthenticated; scoping por clínica

6. Crea las migraciones para ambas apps.
```

**Contrato que se entrega al frontend — H8:**
```json
// GET /historia-clinica/notas/{id}/
{
  "id": "uuid",
  "historia": "uuid",
  "cita": "uuid",
  "servicio": "uuid",
  "servicio_nombre": "Toxina Botulínica",
  "profesional_nombre": "Dra. López",
  "tipo": "procedimiento",
  "anamnesis": "...",
  "diagnostico": "...",
  "plan_manejo": "...",
  "observaciones": "...",
  "zona_tratada": [{"zona": "frente", "descripcion": "3 líneas horizontales", "unidades": "20"}],
  "productos_usados": [{"nombre": "Dysport", "marca": "Ipsen", "lote": "DY2024A", "cantidad": "100", "unidad": "UI"}],
  "tecnica": "4 puntos por zona, microcánula 25G",
  "reacciones_adversas": null,
  "cuidados_post": "No acostarse 4h, no hacer ejercicio 24h",
  "proxima_cita_sugerida": "3 meses",
  "nota_aclarada": null,
  "fotos": [],
  "created_at": "2025-05-08T10:30:00Z"
}

// GET /pacientes/{id}/antecedentes/
{
  "paciente": "uuid",
  "alergias": "Penicilina, látex",
  "medicamentos_actuales": "Atorvastatina 20mg",
  "condiciones_medicas": "Hipertensión controlada",
  "contraindicaciones": "No aplicar toxina botulínica cerca de ojos por ptosis previa",
  "tipo_piel": "II",
  "antecedentes_esteticos": "Rinoplastia 2018. Rellenos de ácido hialurónico en labios (2022)",
  "updated_at": "2025-04-15T09:00:00Z"
}
```

---

#### H9 — Consentimientos informados

**Motivación:** las estéticas necesitan consentimiento firmado antes de cada procedimiento. Algunos tienen vigencia temporal (6-12 meses). El profesional debe poder ver en la pantalla de atención si el paciente tiene los consentimientos requeridos firmados y vigentes.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, `apps/historia_clinica/urls.py`, nueva migración.

**Nuevo modelo `ConsentimientoInformado`:**
```python
class ConsentimientoInformado(models.Model):
    TIPO_CHOICES = [
        ('general', 'Consentimiento General'),
        ('toxina_botulinica', 'Toxina Botulínica'),
        ('rellenos', 'Rellenos Dérmicos'),
        ('laser', 'Láser y Luz Pulsada'),
        ('peelings', 'Peelings y Exfoliaciones'),
        ('mesoterapia', 'Mesoterapia'),
        ('otros', 'Otros procedimientos'),
    ]
    paciente         = ForeignKey(Paciente, on_delete=CASCADE, related_name='consentimientos')
    clinica          = ForeignKey(Clinica, on_delete=CASCADE)
    tipo             = CharField(max_length=30, choices=TIPO_CHOICES)
    fecha_firma      = DateField(null=True, blank=True)
    firmado          = BooleanField(default=False)
    archivo          = FileField(upload_to='consentimientos/', null=True, blank=True)
    url_firmada      = CharField(max_length=2048, blank=True, editable=False)  # generada por MinIO
    vigencia_meses   = PositiveIntegerField(default=12)
    fecha_vencimiento = DateField(null=True, blank=True, editable=False)  # auto: fecha_firma + vigencia_meses
    notas            = TextField(blank=True)
    created_at       = DateTimeField(auto_now_add=True)
    updated_at       = DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('paciente', 'tipo')
        ordering = ['tipo']
```

**Lógica de negocio:**
- Al hacer `PATCH` con `firmado=true` y `fecha_firma`, calcular automáticamente `fecha_vencimiento = fecha_firma + relativedelta(months=vigencia_meses)`.
- `url_firmada` se genera al guardar `archivo` (igual que con `FotoClinica`).
- `vigente` es un `SerializerMethodField`: `firmado=True AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= today)`.

**Serializer `ConsentimientoInformadoSerializer`:**
```
id, paciente (uuid, write), tipo, fecha_firma, firmado, url_firmada (read-only),
vigencia_meses, fecha_vencimiento (read-only), vigente (SerializerMethodField, read-only),
notas, created_at
```
En `create()`: asignar `clinica = request.user.clinica` automáticamente.

**Endpoints:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/historia-clinica/consentimientos/` | Lista; filtro obligatorio `?paciente=<uuid>` |
| POST   | `/historia-clinica/consentimientos/` | Crear consentimiento (pendiente de firma) |
| PATCH  | `/historia-clinica/consentimientos/{id}/` | Marcar firmado, subir archivo, editar notas |
| DELETE | `/historia-clinica/consentimientos/{id}/` | Eliminar (solo si `firmado=False`) |

**Endpoint especial — resumen de consentimientos del paciente:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/historia-clinica/consentimientos/resumen/?paciente=<uuid>` | Devuelve estado de todos los tipos posibles |

Respuesta del resumen:
```json
[
  {"tipo": "general", "label": "Consentimiento General", "firmado": true, "vigente": true, "fecha_vencimiento": "2026-03-01"},
  {"tipo": "toxina_botulinica", "label": "Toxina Botulínica", "firmado": true, "vigente": false, "fecha_vencimiento": "2025-03-01"},
  {"tipo": "rellenos", "label": "Rellenos Dérmicos", "firmado": false, "vigente": false, "fecha_vencimiento": null},
  {"tipo": "laser", "label": "Láser y Luz Pulsada", "firmado": false, "vigente": false, "fecha_vencimiento": null}
]
```
Este endpoint siempre devuelve los 7 tipos aunque no existan registros (llenando con `firmado: false`). Es el que el frontend usa para mostrar el semáforo de consentimientos en la pantalla de atención.

**Manejo de archivos:** igual que `FotoClinica` — multipart/form-data al hacer `PATCH` con el campo `archivo`. Generar URL firmada de MinIO con TTL de 24h y almacenar en `url_firmada`.

**Validaciones:**
- `DELETE` solo si `firmado=False`; si está firmado retornar 400 con `{"error": "No se puede eliminar un consentimiento firmado", "code": "CONSENT_SIGNED"}`.
- `PATCH` con `firmado=True` requiere `fecha_firma` presente.
- `unique_together (paciente, tipo)` — si ya existe uno del mismo tipo, usar el endpoint de actualización.

**Definition of done:**
- [ ] Modelo y migración aplicados
- [ ] `GET /historia-clinica/consentimientos/?paciente=<uuid>` devuelve lista con `vigente` calculado
- [ ] `GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>` devuelve los 7 tipos siempre
- [ ] `POST` crea consentimiento; `unique_together` retorna 400 claro si duplicado
- [ ] `PATCH` acepta `archivo` como multipart, genera `url_firmada`, calcula `fecha_vencimiento`
- [ ] `DELETE` bloqueado si `firmado=True`
- [ ] Scoping por clínica en todos los endpoints

**Prompt para AI:**
```
Implementa el hito H9 en apps/historia_clinica/ siguiendo las convenciones del proyecto.

1. En apps/historia_clinica/models.py — crea ConsentimientoInformado:
   - paciente = ForeignKey(Paciente, on_delete=CASCADE, related_name='consentimientos')
   - clinica = ForeignKey(Clinica, on_delete=CASCADE)
   - tipo = CharField(max_length=30, choices=TIPO_CHOICES) con 7 opciones: general, toxina_botulinica, rellenos, laser, peelings, mesoterapia, otros
   - fecha_firma = DateField(null=True, blank=True)
   - firmado = BooleanField(default=False)
   - archivo = FileField(upload_to='consentimientos/', null=True, blank=True)
   - url_firmada = CharField(max_length=2048, blank=True, editable=False)
   - vigencia_meses = PositiveIntegerField(default=12)
   - fecha_vencimiento = DateField(null=True, blank=True, editable=False)
   - notas = TextField(blank=True)
   - created_at, updated_at auto
   - Meta: unique_together=('paciente','tipo'), ordering=['tipo']
   - Método save(): si firmado=True y fecha_firma, calcular fecha_vencimiento = fecha_firma + relativedelta(months=vigencia_meses); si archivo, generar url_firmada con MinIO (igual que FotoClinica)

2. En apps/historia_clinica/serializers.py — crea ConsentimientoInformadoSerializer:
   - Todos los campos del modelo
   - vigente = SerializerMethodField → True si firmado=True AND (fecha_vencimiento is None OR fecha_vencimiento >= date.today())
   - url_firmada y fecha_vencimiento son read-only
   - En create(): asignar clinica = self.context['request'].user.clinica

3. En apps/historia_clinica/views.py — crea ConsentimientoInformadoViewSet:
   - list(): filtro obligatorio paciente; si no viene, retornar []
   - create(): POST normal
   - partial_update(): acepta archivo como multipart/form-data
   - destroy(): bloquear si firmado=True con 400 {"error": "No se puede eliminar un consentimiento firmado", "code": "CONSENT_SIGNED"}
   - @action GET 'resumen/': recibe ?paciente=<uuid>, retorna los 7 tipos siempre.
     Para cada tipo: buscar si existe registro → exponer firmado, vigente, fecha_vencimiento.
     Si no existe: {"tipo": tipo, "label": label, "firmado": false, "vigente": false, "fecha_vencimiento": null, "id": null}
   - Scoping: filtrar siempre por clinica=request.user.clinica

4. Registrar en apps/historia_clinica/urls.py bajo consentimientos/.
```

**Contrato que se entrega al frontend — H9:**
```json
// GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>
[
  {"id": "uuid", "tipo": "general", "label": "Consentimiento General", "firmado": true, "vigente": true, "fecha_firma": "2025-01-10", "fecha_vencimiento": "2026-01-10"},
  {"id": null, "tipo": "toxina_botulinica", "label": "Toxina Botulínica", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null},
  {"id": null, "tipo": "rellenos", "label": "Rellenos Dérmicos", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null},
  {"id": null, "tipo": "laser", "label": "Láser y Luz Pulsada", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null},
  {"id": null, "tipo": "peelings", "label": "Peelings y Exfoliaciones", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null},
  {"id": null, "tipo": "mesoterapia", "label": "Mesoterapia", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null},
  {"id": null, "tipo": "otros", "label": "Otros procedimientos", "firmado": false, "vigente": false, "fecha_firma": null, "fecha_vencimiento": null}
]
```

---

#### H9.3 — Integración operacional con Documenso: firma, webhook y descarga de PDF

**Motivación:** los hitos H9.1 y H9.2 establecen el vínculo servicio-consentimiento y la configuración de templates. Este hito implementa el lado operacional: recibir la notificación de firma completada (tanto desde el frontend como desde el webhook de Documenso), descargar el PDF firmado, y almacenarlo en MinIO vinculado al registro `ConsentimientoInformado`.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, `apps/historia_clinica/urls.py`, `config/settings.py`, nueva migración.

---

**Cambio 1 — Settings: variables de entorno**

```python
# config/settings.py
DOCUMENSO_API_URL    = env('DOCUMENSO_API_URL', default='')
DOCUMENSO_API_KEY    = env('DOCUMENSO_API_KEY', default='')
DOCUMENSO_WEBHOOK_SECRET = env('DOCUMENSO_WEBHOOK_SECRET', default='')
```

```env
# .env
DOCUMENSO_API_URL=https://tu-documenso.dominio.com
DOCUMENSO_API_KEY=<api-key-generada-en-documenso>
DOCUMENSO_WEBHOOK_SECRET=<secreto-para-verificar-webhooks>
```

El `DOCUMENSO_API_KEY` se obtiene desde Documenso → Settings → API Tokens.
El `DOCUMENSO_WEBHOOK_SECRET` se define al crear el webhook en Documenso → Settings → Webhooks.

---

**Cambio 2 — Modelo `ConsentimientoInformado`: campo nuevo**

```python
documenso_document_id = CharField(max_length=255, null=True, blank=True)
# ID del documento en Documenso post-firma. Permite descargar el PDF y hacer auditoría.
```

Añadir al serializer como campo de solo lectura en GET; aceptarlo en escritura solo desde los endpoints internos (no desde el frontend general).

---

**Cambio 3 — Endpoint: completar firma desde el frontend**

`PATCH /historia-clinica/consentimientos/{id}/completar_firma/`

**Request:**
```json
{ "documenso_document_id": "abc123xyz" }
```

**Lógica:**
1. Verificar que el `ConsentimientoInformado` pertenece al paciente de la clínica del usuario autenticado.
2. Verificar que `firmado=False` (idempotencia: si ya está firmado, retornar 200 sin cambios).
3. Actualizar: `firmado=True`, `fecha_firma=date.today()`, `documenso_document_id=valor`.
4. Calcular `fecha_vencimiento = fecha_firma + relativedelta(months=vigencia_meses)`.
5. Retornar el registro actualizado con `ConsentimientoInformadoSerializer`.

**Response (200):**
```json
{
  "id": "uuid",
  "tipo": "toxina_botulinica",
  "firmado": true,
  "fecha_firma": "2026-05-13",
  "fecha_vencimiento": "2027-05-13",
  "vigente": true,
  "documenso_document_id": "abc123xyz",
  "url_firmada": null
}
```

El PDF aún no está disponible en este punto (llega después via webhook). `url_firmada` queda `null` hasta que el webhook lo procese.

**Permisos:** `IsAuthenticated` + mismo scoping de clínica que el resto del módulo. No requiere ser admin — recepción y profesionales pueden llamarlo.

---

**Cambio 4 — Webhook de Documenso**

`POST /webhooks/documenso/`

Este endpoint es **público** (sin JWT) pero protegido por verificación de firma HMAC.

**Verificación de autenticidad implementada:**
El webhook compara el header `X-Documenso-Secret` contra `DOCUMENSO_WEBHOOK_SECRET` usando `hmac.compare_digest`.

Si la verificación falla → retornar `401` inmediatamente.

**Eventos manejados:**

El backend procesa `document.completed` (formato real de Documenso) y también acepta `DOCUMENT_COMPLETED` por compatibilidad. Los demás eventos se ignoran con `200 {"ok": true, "skipped": true}`.

**Payload esperado (Documenso DOCUMENT_COMPLETED):**
```json
{
    "event": "document.completed",
  "payload": {
    "id": "documenso-document-id",
    "externalId": "uuid-del-consentimiento-informado",
    "status": "COMPLETED",
    "recipients": [...]
  }
}
```

**Lógica al recibir `DOCUMENT_COMPLETED`:**
1. Verificar firma HMAC → 401 si falla.
2. Extraer `payload.externalId` (= `ConsentimientoInformado.id`).
3. Buscar el registro. Si no existe → log de warning + retornar 200 (no reintentar).
4. Si `firmado=False` → marcar `firmado=True`, `fecha_firma`, `documenso_document_id` (idempotente: si ya está firmado, saltar al paso 5).
5. Descargar el PDF firmado desde Documenso API:
   ```
   GET {DOCUMENSO_API_URL}/api/v2/documents/{document_id}/download
   Authorization: {DOCUMENSO_API_KEY}
   ```
6. Subir el PDF a MinIO (igual que `FotoClinica` — usar el helper existente para generar URL firmada).
7. Actualizar `archivo` y generar `url_firmada` en el registro.
8. Retornar `200 {"ok": true}`.

**Manejo de errores en la descarga del PDF:**
- Si la descarga de Documenso falla: registrar el error en log, retornar `200` de todas formas (el webhook no debe reintentar por un error de descarga — el `documenso_document_id` ya quedó guardado y se puede reintentarr manualmente).
- El consentimiento queda `firmado=True` aunque `archivo` sea null — la firma es válida, el PDF es accesorio.

**Registro en `urls.py`:**
```python
# Fuera del router principal de DRF, a nivel de configuración de URLs
path('webhooks/documenso/', DocumensoWebhookView.as_view(), name='webhook-documenso'),
```

Sin prefijo `api/v1/` — es un webhook externo, no una API de la app.

---

**Servicio auxiliar: descarga de PDF desde Documenso**

Encapsular la llamada a Documenso en un servicio reutilizable:

```python
# apps/historia_clinica/services.py

import requests
from django.conf import settings

def descargar_pdf_documenso(document_id: str) -> bytes | None:
    """
    Descarga el PDF firmado de Documenso por document_id.
    Retorna los bytes del PDF o None si falla.
    """
    if not settings.DOCUMENSO_API_URL or not settings.DOCUMENSO_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{settings.DOCUMENSO_API_URL}/api/v2/documents/{document_id}/download",
            headers={"Authorization": f"Bearer {settings.DOCUMENSO_API_KEY}"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.content
    except Exception:
        return None
```

Este servicio lo usan tanto el webhook como cualquier tarea manual de re-descarga futura.

---

**Estado implementado:**
- [x] `ConsentimientoInformado.documenso_document_id` en modelo, serializer y migración
- [x] Variables de entorno documentadas en `.env.example`
- [x] `PATCH /historia-clinica/consentimientos/{id}/completar_firma/` operativo e idempotente
- [x] `POST /webhooks/documenso/` verifica `X-Documenso-Secret`, procesa `document.completed` y acepta `DOCUMENT_COMPLETED` por compatibilidad
- [x] Webhook descarga PDF y lo sube a MinIO si la descarga tiene éxito
- [x] Webhook retorna `200` para eventos válidos aunque falle la descarga del PDF
- [x] Consentimiento queda `firmado=True` aunque `url_firmada` sea null (firma válida sin PDF)
- [x] Servicio `descargar_pdf_documenso()` encapsulado y reutilizable
- [x] El webhook vive fuera del prefijo `api/v1/`

**Prompt para AI:**
```
Implementa el hito H9.3 en apps/historia_clinica/ y la configuración global.

1. En config/settings.py:
   - Añade DOCUMENSO_API_URL, DOCUMENSO_API_KEY, DOCUMENSO_WEBHOOK_SECRET desde env().

2. En apps/historia_clinica/models.py — añade a ConsentimientoInformado:
   - documenso_document_id = CharField(max_length=255, null=True, blank=True)
   Crea la migración.

3. En apps/historia_clinica/serializers.py:
   - Añade documenso_document_id como campo read-only en ConsentimientoInformadoSerializer.

4. En apps/historia_clinica/services.py — crea descargar_pdf_documenso(document_id) como se describe.

5. En apps/historia_clinica/views.py — en ConsentimientoInformadoViewSet:
   - Añade @action PATCH 'completar_firma/':
     - Recibe { documenso_document_id }
     - Idempotente: si ya firmado, retornar 200 sin cambios
     - Actualiza firmado, fecha_firma, fecha_vencimiento, documenso_document_id
     - Retorna el registro serializado

6. Crea apps/historia_clinica/webhooks.py con DocumensoWebhookView(APIView):
   - permission_classes = [AllowAny]
   - Método POST:
     - Verificar HMAC con DOCUMENSO_WEBHOOK_SECRET
     - Si falla → 401
     - Si event != DOCUMENT_COMPLETED → 200 {"ok": true, "skipped": true}
     - Extraer externalId → buscar ConsentimientoInformado
     - Si no existe → log warning + 200
     - Marcar firmado (idempotente)
     - Llamar descargar_pdf_documenso() → si tiene bytes, subir a MinIO (igual que FotoClinica)
     - Actualizar archivo y generar url_firmada
     - Retornar 200 {"ok": true}

7. En config/urls.py — registrar fuera de api/v1/:
   path('webhooks/documenso/', DocumensoWebhookView.as_view())
```

**Contrato que se entrega al frontend — H9.3:**
```json
// PATCH /historia-clinica/consentimientos/{id}/completar_firma/
// Request: { "documenso_document_id": "abc123" }
// Response 200:
{
  "id": "uuid",
  "tipo": "toxina_botulinica",
  "firmado": true,
  "fecha_firma": "2026-05-13",
  "fecha_vencimiento": "2027-05-13",
  "vigente": true,
  "documenso_document_id": "abc123",
  "url_firmada": null
}
```

---

#### H9.2 — Configuración dinámica de templates Documenso por tipo de consentimiento

**Motivación:** cada tipo de consentimiento (`toxina_botulinica`, `rellenos`, etc.) debe poder vincularse a un template de Documenso self-hosted sin tocar código ni hacer redeploys. El admin configura el token desde la UI de la app. El frontend consulta este mapa en tiempo de ejecución para saber qué template embed al pedir una firma.

**Archivos que se tocan:** nueva app `apps/configuracion/` (o extender `apps/clinicas/`), nueva migración.

**Nuevo modelo `DocumensoConsentimientoTemplate`:**
```python
class DocumensoConsentimientoTemplate(models.Model):
    TIPO_CHOICES = [
        ('general',           'Consentimiento General'),
        ('toxina_botulinica', 'Toxina Botulínica'),
        ('rellenos',          'Rellenos Dérmicos'),
        ('laser',             'Láser y Luz Pulsada'),
        ('peelings',          'Peelings y Exfoliaciones'),
        ('mesoterapia',       'Mesoterapia'),
        ('otros',             'Otros procedimientos'),
    ]
    clinica          = ForeignKey(Clinica, on_delete=CASCADE, related_name='documenso_templates')
    tipo             = CharField(max_length=30, choices=TIPO_CHOICES)
    template_token   = CharField(max_length=500)          # token del Direct Link en Documenso
    activo           = BooleanField(default=True)
    updated_at       = DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('clinica', 'tipo')
        ordering = ['tipo']
```

**Serializer `DocumensoConsentimientoTemplateSerializer`:**
```
id, tipo, label (read-only SerializerMethodField → dict de TIPO_CHOICES), 
template_token, activo, updated_at
```
En `create()`: asignar `clinica = request.user.clinica` automáticamente.

**Endpoints:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/configuracion/documenso-templates/` | Lista todos los tipos con su token (o vacío si no configurado) |
| PUT    | `/configuracion/documenso-templates/{tipo}/` | Upsert — crea o actualiza el token para ese tipo |
| DELETE | `/configuracion/documenso-templates/{tipo}/` | Elimina la configuración del tipo (no borra el template en Documenso) |

**Comportamiento del `GET`:**
Devuelve siempre los 7 tipos posibles, estén configurados o no — igual al patrón del resumen de consentimientos. Los no configurados tienen `template_token: null` y `activo: false`.

```json
[
  { "tipo": "general",           "label": "Consentimiento General",   "template_token": "abc123", "activo": true,  "updated_at": "2026-05-13T..." },
  { "tipo": "toxina_botulinica", "label": "Toxina Botulínica",        "template_token": null,     "activo": false, "updated_at": null },
  { "tipo": "rellenos",          "label": "Rellenos Dérmicos",        "template_token": null,     "activo": false, "updated_at": null },
  { "tipo": "laser",             "label": "Láser y Luz Pulsada",      "template_token": null,     "activo": false, "updated_at": null },
  { "tipo": "peelings",          "label": "Peelings y Exfoliaciones", "template_token": null,     "activo": false, "updated_at": null },
  { "tipo": "mesoterapia",       "label": "Mesoterapia",              "template_token": null,     "activo": false, "updated_at": null },
  { "tipo": "otros",             "label": "Otros procedimientos",     "template_token": null,     "activo": false, "updated_at": null }
]
```

**Comportamiento del `PUT /configuracion/documenso-templates/{tipo}/`:**
```json
// Request
{ "template_token": "abc123xyz...", "activo": true }

// Response — el registro creado o actualizado
{ "tipo": "toxina_botulinica", "label": "Toxina Botulínica", "template_token": "abc123xyz...", "activo": true, "updated_at": "2026-05-13T..." }
```

**Permisos:** solo `admin` y `superadmin` pueden escribir. Lectura: cualquier usuario autenticado de la clínica (el frontend la necesita en el flujo de recepción).

**Nota de implementación actual:** el módulo quedó en `apps/configuracion/`. Para `superadmin`, si el usuario no tiene clínica asociada debe enviar `?clinica=<uuid>` para listar, actualizar o eliminar configuraciones.

**Extensibilidad:** los `TIPO_CHOICES` del modelo deben coincidir con los de `ConsentimientoInformado`. Cuando se agregue un nuevo tipo en el futuro, se añade a ambas listas en una sola migración — sin tocar la lógica de endpoints.

**Estado implementado:**
- [x] Modelo y migración aplicados con unicidad por `clinica + tipo`
- [x] `GET /configuracion/documenso-templates/` devuelve siempre los 7 tipos, configurados o no
- [x] `PUT /configuracion/documenso-templates/{tipo}/` hace upsert correcto
- [x] `DELETE /configuracion/documenso-templates/{tipo}/` elimina sin error si no existe
- [x] Scoping por clínica en todos los endpoints
- [x] Permisos: escritura solo admin; lectura autenticados de la clínica

**Prompt para AI:**
```
Implementa el hito H9.2. Puede vivir en apps/clinicas/ como extensión o en una nueva app apps/configuracion/ — elige la opción más consistente con la estructura actual del proyecto.

1. Crea el modelo DocumensoConsentimientoTemplate con los campos descritos.
   TIPO_CHOICES debe ser idéntico al de ConsentimientoInformado en apps/historia_clinica/models.py.
   Extráelo a una constante compartida si es posible (ej. apps/historia_clinica/constants.py).

2. Crea DocumensoConsentimientoTemplateSerializer:
   - Campos: id, tipo, label, template_token, activo, updated_at
   - label = SerializerMethodField → dict(TIPO_CHOICES).get(obj.tipo, obj.tipo)
   - En create(): clinica = request.user.clinica

3. Crea DocumensoConsentimientoTemplateViewSet con:
   - list(): siempre devuelve los 7 tipos. Para los que no tienen registro en BD, devuelve
     {"tipo": tipo, "label": label, "template_token": null, "activo": false, "updated_at": null, "id": null}
   - update() con lookup_field='tipo': upsert usando get_or_create(clinica, tipo), luego actualiza campos.
     Usa PUT (no PATCH) — siempre reemplaza template_token y activo juntos.
   - destroy() con lookup_field='tipo': elimina si existe, devuelve 204 silencioso si no existe.
   - Permisos: IsAuthenticated para GET; IsAdmin para PUT y DELETE.
   - Scoping: siempre filtrar por clinica=request.user.clinica.

4. Registrar en urls.py bajo /configuracion/documenso-templates/.

5. Crear migración.
```

**Contrato que se entrega al frontend — H9.2:**
```json
// GET /configuracion/documenso-templates/
[
  { "id": "uuid",  "tipo": "general",  "label": "Consentimiento General",  "template_token": "abc123", "activo": true,  "updated_at": "2026-05-13T10:00:00Z" },
  { "id": null,    "tipo": "rellenos", "label": "Rellenos Dérmicos",       "template_token": null,     "activo": false, "updated_at": null }
]

// PUT /configuracion/documenso-templates/toxina_botulinica/
// Request: { "template_token": "xyz789", "activo": true }
// Response: { "id": "uuid", "tipo": "toxina_botulinica", "label": "Toxina Botulínica", "template_token": "xyz789", "activo": true, "updated_at": "..." }
```

---

#### H9.1 — Vínculo servicio-tipo de consentimiento + integración con flujo de atención

**Motivación:** hoy `Servicio.requiere_consentimiento` indica si un servicio requiere consentimiento, pero no qué *tipo* de consentimiento. Sin esa información, el frontend no puede verificar si el paciente tiene el consentimiento vigente correcto antes de iniciar la atención, y el backend no puede enforcearlo. Este hito cierra ese vínculo.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, nueva migración en clinicas.

**Cambio 1 — Modelo `Servicio`: campo `tipo_consentimiento`**
```python
TIPO_CONSENTIMIENTO_CHOICES = [
    ('general',           'Consentimiento General'),
    ('toxina_botulinica', 'Toxina Botulínica'),
    ('rellenos',          'Rellenos Dérmicos'),
    ('laser',             'Láser y Luz Pulsada'),
    ('peelings',          'Peelings y Exfoliaciones'),
    ('mesoterapia',       'Mesoterapia'),
    ('otros',             'Otros procedimientos'),
]

class Servicio(models.Model):
    # ... campos existentes ...
    tipo_consentimiento = CharField(
        max_length=30,
        choices=TIPO_CONSENTIMIENTO_CHOICES,
        null=True, blank=True,
        help_text="Tipo de ConsentimientoInformado requerido. Obligatorio si requiere_consentimiento=True."
    )
```

Validación: si `requiere_consentimiento=True`, `tipo_consentimiento` no puede ser null.

**Cambio 2 — `ServicioSerializer`: exponer `tipo_consentimiento`**
- Añadir `tipo_consentimiento` a los campos de lectura y escritura.
- Validar en `validate()`: si `requiere_consentimiento=True` y `tipo_consentimiento` es null → `ValidationError`.

**Cambio 3 — `CitaSerializer`: campo `consentimiento_info` (read-only)**

Añadir `consentimiento_info = SerializerMethodField()` con la siguiente lógica:

```python
def get_consentimiento_info(self, cita):
    servicio = cita.servicio_obj  # select_related en el queryset
    if not servicio.requiere_consentimiento or not servicio.tipo_consentimiento:
        return {"requerido": False, "tipo": None, "vigente": False, "consentimiento_id": None}
    
    from apps.historia_clinica.models import ConsentimientoInformado
    from django.utils import timezone
    hoy = timezone.now().date()
    
    consent = ConsentimientoInformado.objects.filter(
        paciente_id=cita.paciente_id,
        tipo=servicio.tipo_consentimiento,
        firmado=True,
    ).filter(
        models.Q(fecha_vencimiento__isnull=True) | models.Q(fecha_vencimiento__gte=hoy)
    ).first()
    
    return {
        "requerido": True,
        "tipo": servicio.tipo_consentimiento,
        "vigente": consent is not None,
        "consentimiento_id": str(consent.id) if consent else None,
    }
```

El queryset base de `CitaViewSet` debe incluir `select_related('servicio_obj')` (o el nombre del campo FK al modelo Servicio).

Payload de salida (campo nuevo en cada `Cita`):
```json
{
  "consentimiento_info": {
    "requerido": true,
    "tipo": "toxina_botulinica",
    "vigente": false,
    "consentimiento_id": null
  }
}
```

**Cambio 4 — Guard en `cambiar_estado → en_curso`**

En `CitaViewSet.cambiar_estado()`, antes de ejecutar la transición a `en_curso`:

```python
if nuevo_estado == 'en_curso':
    servicio = cita.servicio_obj
    if servicio.requiere_consentimiento and servicio.tipo_consentimiento:
        hoy = timezone.now().date()
        tiene_consentimiento = ConsentimientoInformado.objects.filter(
            paciente_id=cita.paciente_id,
            tipo=servicio.tipo_consentimiento,
            firmado=True,
        ).filter(
            Q(fecha_vencimiento__isnull=True) | Q(fecha_vencimiento__gte=hoy)
        ).exists()
        
        if not tiene_consentimiento:
            return Response(
                {
                    "error": "El paciente no tiene el consentimiento firmado y vigente requerido para este procedimiento.",
                    "code": "CONSENTIMIENTO_REQUERIDO",
                    "tipo_consentimiento": servicio.tipo_consentimiento,
                },
                status=400
            )
```

**Definition of done:**
- [ ] `Servicio.tipo_consentimiento` en modelo, migración y serializer
- [ ] Validación: `requiere_consentimiento=True` implica `tipo_consentimiento` no nulo
- [ ] `GET /agenda/citas/` y `GET /agenda/citas/{id}/` incluyen `consentimiento_info`
- [ ] `POST /agenda/citas/{id}/cambiar_estado/` con `estado=en_curso` retorna 400 `CONSENTIMIENTO_REQUERIDO` si no hay consentimiento vigente
- [ ] El guard NO aplica si `requiere_consentimiento=False` o `tipo_consentimiento` es null
- [ ] Permisos: igual que el resto del módulo agenda

**Prompt para AI:**
```
Implementa el hito H9.1 en apps/clinicas/ y apps/agenda/ siguiendo las convenciones del proyecto.

1. En apps/clinicas/models.py — agrega a Servicio:
   - tipo_consentimiento = CharField(max_length=30, choices=TIPO_CONSENTIMIENTO_CHOICES, null=True, blank=True)
   - TIPO_CONSENTIMIENTO_CHOICES debe coincidir exactamente con los tipos de ConsentimientoInformado en apps/historia_clinica/models.py
   - Crea la migración.

2. En apps/clinicas/serializers.py — ServicioSerializer:
   - Añade tipo_consentimiento a los campos.
   - En validate(): si requiere_consentimiento=True y tipo_consentimiento es None → raise ValidationError({"tipo_consentimiento": "Requerido cuando requiere_consentimiento es True."})

3. En apps/agenda/serializers.py — CitaSerializer:
   - Añade consentimiento_info = SerializerMethodField() (read-only).
   - Implementa get_consentimiento_info(self, cita) con la lógica descrita arriba.
   - El queryset en CitaViewSet debe incluir select_related al modelo Servicio para evitar N+1.

4. En apps/agenda/views.py — CitaViewSet.cambiar_estado():
   - Antes de ejecutar la transición a en_curso, verificar ConsentimientoInformado vigente.
   - Retornar 400 con code=CONSENTIMIENTO_REQUERIDO si no existe.
   - Importar ConsentimientoInformado desde apps.historia_clinica.models.
```

**Contrato que se entrega al frontend — H9.1:**
```json
// GET /agenda/citas/{id}/ — campo nuevo
{
  "consentimiento_info": {
    "requerido": true,
    "tipo": "toxina_botulinica",
    "vigente": false,
    "consentimiento_id": null
  }
}

// GET /clinicas/servicios/{id}/ — campo nuevo
{
  "tipo_consentimiento": "toxina_botulinica"
}

// POST /agenda/citas/{id}/cambiar_estado/ con estado=en_curso — error posible
{
  "error": "El paciente no tiene el consentimiento firmado y vigente requerido para este procedimiento.",
  "code": "CONSENTIMIENTO_REQUERIDO",
  "tipo_consentimiento": "toxina_botulinica"
}
```

---

#### H9.4 — Consentimientos ligados directamente a templates de Documenso (eliminar enum hardcodeado)

**Motivación:** los hitos H9.1 y H9.2 establecieron la relación servicio-consentimiento usando un enum fijo de 7 tipos (`toxina_botulinica`, `rellenos`, etc.). Ese enum obliga a que cada clínica adapte sus servicios a categorías predefinidas y requiere una pantalla de configuración intermedia para mapear tipos a tokens de Documenso. El objetivo de este hito es que el servicio referencie directamente el template de Documenso por su `publicId`, eliminando el enum y el mapa de configuración.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración en clinicas e historia_clinica.

---

**Cambio 1 — Modelo `Servicio`: reemplazar `tipo_consentimiento` por token directo**

Eliminar `tipo_consentimiento` (CharField con TIPO_CHOICES).
Agregar dos campos:

```python
documenso_template_token  = CharField(max_length=500, null=True, blank=True)
# publicId del template en Documenso — usado por EmbedDirectTemplate en el frontend

documenso_template_nombre = CharField(max_length=255, null=True, blank=True)
# title del template guardado al momento de la asignación, para mostrarlo sin re-fetch
```

Regla: si `requiere_consentimiento=True`, `documenso_template_token` es obligatorio.

Migración de datos: copiar `tipo_consentimiento` al nuevo campo solo si existe un `DocumensoConsentimientoTemplate` activo para ese tipo en la clínica — en ese caso usar su `template_token` como `documenso_template_token` y el label del tipo como `documenso_template_nombre`.

---

**Cambio 2 — `ServicioSerializer`: exponer los campos nuevos**

- Añadir `documenso_template_token` y `documenso_template_nombre` a lectura y escritura.
- En `validate()`: si `requiere_consentimiento=True` y `documenso_template_token` es null → `ValidationError`.
- Eliminar `tipo_consentimiento` del serializer (o mantenerlo como alias deprecated read-only durante el período de transición).

Request actualizado:
```json
{
  "nombre": "Toxina Botulínica Frente",
  "duracion_min": 30,
  "requiere_consentimiento": true,
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica"
}
```

---

**Cambio 3 — `ConsentimientoInfo` en `CitaSerializer`**

El campo `consentimiento_info` actualmente usa `tipo` (enum) para buscar el `ConsentimientoInformado`.
Actualizar para usar `documenso_template_token` del servicio:

```python
def get_consentimiento_info(self, cita):
    servicio = cita.servicio_obj
    if not servicio.requiere_consentimiento or not servicio.documenso_template_token:
        return {"requerido": False, "token": None, "template_nombre": None, "vigente": False, "consentimiento_id": None}

    hoy = timezone.now().date()
    consent = ConsentimientoInformado.objects.filter(
        paciente_id=cita.paciente_id,
        documenso_template_token=servicio.documenso_template_token,
        firmado=True,
    ).filter(
        Q(fecha_vencimiento__isnull=True) | Q(fecha_vencimiento__gte=hoy)
    ).first()

    return {
        "requerido": True,
        "token": servicio.documenso_template_token,
        "template_nombre": servicio.documenso_template_nombre,
        "vigente": consent is not None,
        "consentimiento_id": str(consent.id) if consent else None,
    }
```

Response actualizado:
```json
{
  "consentimiento_info": {
    "requerido": true,
    "token": "abc123xyz",
    "template_nombre": "Consentimiento Toxina Botulínica",
    "vigente": false,
    "consentimiento_id": null
  }
}
```

---

**Cambio 4 — Modelo `ConsentimientoInformado`: reemplazar `tipo` por token directo**

Eliminar `tipo` (CharField con TIPO_CHOICES).
Agregar:

```python
documenso_template_token  = CharField(max_length=500)
documenso_template_nombre = CharField(max_length=255, blank=True)
```

Eliminar `unique_together = ('paciente', 'tipo')`.
Reemplazar por: `unique_together = ('paciente', 'documenso_template_token')` — un paciente no puede tener dos consentimientos vigentes del mismo template.

Migración de datos: para los registros existentes, copiar `tipo` como `documenso_template_token` temporalmente (o dejar null y migrar manualmente).

---

**Cambio 5 — `POST /historia-clinica/consentimientos/`: aceptar token en lugar de tipo**

Request actualizado:
```json
{
  "paciente": "uuid",
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica",
  "notas": ""
}
```

Response actualizado:
```json
{
  "id": "uuid",
  "paciente": "uuid",
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica",
  "firmado": false,
  "vigencia_meses": 12,
  "fecha_vencimiento": null,
  "vigente": false,
  "documenso_document_id": null,
  "created_at": "2026-05-13T10:00:00Z"
}
```

---

**Cambio 6 — `GET /historia-clinica/consentimientos/resumen/`: respuesta dinámica**

Hoy devuelve siempre los 7 tipos hardcodeados. Pasa a devolver solo los consentimientos que existen para ese paciente más los que las citas futuras activas del paciente requieran y no estén cubiertos.

Response actualizado:
```json
[
  {
    "id": "uuid",
    "documenso_template_token": "abc123xyz",
    "template_nombre": "Consentimiento Toxina Botulínica",
    "firmado": true,
    "vigente": true,
    "fecha_firma": "2026-05-01",
    "fecha_vencimiento": "2027-05-01"
  },
  {
    "id": null,
    "documenso_template_token": "xyz789abc",
    "template_nombre": "Consentimiento Rellenos",
    "firmado": false,
    "vigente": false,
    "fecha_firma": null,
    "fecha_vencimiento": null
  }
]
```

---

**Cambio 7 — Guard `en_curso`: comparar por token**

En `cambiar_estado → en_curso`, reemplazar la búsqueda por `tipo` por búsqueda por `documenso_template_token`:

```python
if not tiene_consentimiento:
    return Response({
        "error": "El paciente no tiene el consentimiento firmado y vigente requerido para este procedimiento.",
        "code": "CONSENTIMIENTO_REQUERIDO",
        "documenso_template_token": servicio.documenso_template_token,
        "template_nombre": servicio.documenso_template_nombre,
    }, status=400)
```

---

**Cambio 8 — Deprecar `DocumensoConsentimientoTemplate` y sus endpoints**

El modelo `DocumensoConsentimientoTemplate` (H9.2) y los endpoints `GET/PUT/DELETE /configuracion/documenso-templates/{tipo}/` quedan deprecados.

El único endpoint de configuración que se mantiene es:
```
GET /configuracion/documenso-templates/disponibles/
```
que ya existe (H9.3) y es el que alimenta el dropdown del formulario de servicios en el frontend.

La tabla `DocumensoConsentimientoTemplate` puede mantenerse en BD durante el período de transición pero ya no se lee en ningún flujo operacional.

---

**Definition of done:**
- [ ] Migración: `Servicio` tiene `documenso_template_token` + `documenso_template_nombre`; `tipo_consentimiento` deprecado
- [ ] Migración: `ConsentimientoInformado` tiene `documenso_template_token` + `documenso_template_nombre`; `tipo` deprecado
- [ ] `GET/POST /clinicas/servicios/` acepta y devuelve los campos nuevos; valida token obligatorio cuando `requiere_consentimiento=True`
- [ ] `consentimiento_info` en `Cita` usa `token` + `template_nombre` en lugar de `tipo`
- [ ] `POST /historia-clinica/consentimientos/` acepta `documenso_template_token`
- [ ] `GET /historia-clinica/consentimientos/resumen/` devuelve lista dinámica
- [ ] Guard `en_curso` compara por `documenso_template_token`
- [ ] `GET /configuracion/documenso-templates/disponibles/` sigue operativo
- [ ] Endpoints `PUT/DELETE /configuracion/documenso-templates/{tipo}/` retornan 410 Gone o se eliminan

**Prompt para AI:**
```
Implementa el hito H9.4 en apps/clinicas/, apps/agenda/ y apps/historia_clinica/ siguiendo las convenciones del proyecto.

1. En apps/clinicas/models.py — modifica Servicio:
   - Agrega documenso_template_token = CharField(max_length=500, null=True, blank=True)
   - Agrega documenso_template_nombre = CharField(max_length=255, null=True, blank=True)
   - Mantén tipo_consentimiento existente por compatibilidad (no lo elimines en esta migración)
   - Crea la migración con migración de datos: para cada Servicio con tipo_consentimiento no nulo,
     buscar DocumensoConsentimientoTemplate activo de esa clínica y ese tipo;
     si existe, copiar template_token → documenso_template_token y label → documenso_template_nombre.

2. En apps/clinicas/serializers.py — ServicioSerializer:
   - Añade documenso_template_token y documenso_template_nombre.
   - En validate(): si requiere_consentimiento=True y documenso_template_token es None → ValidationError.

3. En apps/historia_clinica/models.py — modifica ConsentimientoInformado:
   - Agrega documenso_template_token = CharField(max_length=500, default='')
   - Agrega documenso_template_nombre = CharField(max_length=255, blank=True)
   - Cambia unique_together a ('paciente', 'documenso_template_token')
   - Mantén tipo existente por compatibilidad.
   - Crea la migración.

4. En apps/historia_clinica/serializers.py — ConsentimientoInformadoSerializer:
   - Añade documenso_template_token y documenso_template_nombre.
   - Acepta ambos campos en create().

5. En apps/historia_clinica/views.py — ConsentimientoInformadoViewSet:
   - resumen(): en lugar de iterar los 7 tipos fijos, devolver:
     a) todos los ConsentimientoInformado existentes del paciente
     b) más los templates requeridos por citas futuras (estado pendiente/confirmada)
        del paciente que no tengan consentimiento vigente — para cada una obtener
        documenso_template_token y documenso_template_nombre del servicio de la cita

6. En apps/agenda/serializers.py — CitaSerializer:
   - Actualiza get_consentimiento_info() para usar documenso_template_token del servicio.
   - Devuelve token y template_nombre en lugar de tipo.

7. En apps/agenda/views.py — CitaViewSet.cambiar_estado():
   - Actualiza el guard en_curso para buscar ConsentimientoInformado por documenso_template_token.
   - Actualiza el error response para incluir documenso_template_token y template_nombre.
```

**Contrato que se entrega al frontend — H9.4:**
```json
// GET /clinicas/servicios/{id}/
{
  "id": "uuid",
  "nombre": "Toxina Botulínica Frente",
  "requiere_consentimiento": true,
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica"
}

// GET /agenda/citas/{id}/ — consentimiento_info actualizado
{
  "consentimiento_info": {
    "requerido": true,
    "token": "abc123xyz",
    "template_nombre": "Consentimiento Toxina Botulínica",
    "vigente": false,
    "consentimiento_id": null
  }
}

// POST /historia-clinica/consentimientos/
// Request: { "paciente": "uuid", "documenso_template_token": "abc123xyz", "documenso_template_nombre": "Consentimiento Toxina Botulínica" }
// Response: { "id": "uuid", "documenso_template_token": "abc123xyz", "documenso_template_nombre": "...", "firmado": false, ... }

// POST /agenda/citas/{id}/cambiar_estado/ — error en_curso
{
  "error": "El paciente no tiene el consentimiento firmado y vigente requerido para este procedimiento.",
  "code": "CONSENTIMIENTO_REQUERIDO",
  "documenso_template_token": "abc123xyz",
  "template_nombre": "Consentimiento Toxina Botulínica"
}
```

---

#### H9.5 — Vigencia configurable del consentimiento por servicio

**Motivación:** hoy `ConsentimientoInformado.vigencia_meses` es un campo editable pero el frontend no puede configurarlo por servicio — queda siempre en el default del modelo (12). Lo correcto es que cada servicio defina su propia vigencia (p.ej. Botox = 12 meses, procedimiento invasivo = 6 meses) y que esa vigencia se propague automáticamente al crear el consentimiento.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, nueva migración, `apps/historia_clinica/serializers.py` (serializer de cita), `apps/historia_clinica/views.py`.

**Cambio 1 — Modelo `Servicio`:**
```python
vigencia_meses = PositiveIntegerField(default=12)
```
- Exponer en serializer (lectura y escritura).
- Validación: mínimo 1.

**Cambio 2 — `consentimiento_info` en `Cita`:**
Agregar `vigencia_meses` al objeto `consentimiento_info` que ya devuelve la cita, tomándolo del servicio asociado:
```json
"consentimiento_info": {
  "requerido": true,
  "token": "abc123",
  "template_nombre": "...",
  "vigente": false,
  "consentimiento_id": null,
  "vigencia_meses": 6
}
```

**Cambio 3 — `POST /historia-clinica/consentimientos/`:**
El endpoint ya acepta `vigencia_meses` (es campo del modelo). El frontend lo envía explícitamente. No se requiere cambio de lógica, solo verificar que no está siendo ignorado en el serializer.

**Definition of done:**
- [ ] `Servicio.vigencia_meses` en modelo, migración y serializer
- [ ] `GET/POST /clinicas/servicios/` devuelve y acepta `vigencia_meses`
- [ ] `consentimiento_info` en cita incluye `vigencia_meses` del servicio
- [ ] `POST /historia-clinica/consentimientos/` respeta el `vigencia_meses` enviado por el cliente

**Contrato que se entrega al frontend — H9.5:**
```json
// GET /clinicas/servicios/{id}/
{
  "id": "uuid",
  "nombre": "Toxina Botulínica",
  "requiere_consentimiento": true,
  "documenso_template_token": "abc123",
  "vigencia_meses": 12
}

// GET /agenda/citas/{id}/  →  consentimiento_info
{
  "requerido": true,
  "token": "abc123",
  "template_nombre": "Consentimiento Toxina",
  "vigente": false,
  "consentimiento_id": null,
  "vigencia_meses": 12
}
```

---

#### H9.6 — Firma de consentimiento con destinatario nombrado (reemplazar Direct Link)

**Motivación:** Los Direct Links de Documenso son anónimos por diseño — el firmante siempre escribe su propio nombre y correo, no se pueden pre-llenar. Para una clínica donde el paciente ya está registrado, esto genera fricción innecesaria y reduce la trazabilidad legal (el PDF queda con cualquier nombre que el paciente escriba, no el nombre oficial del expediente). La solución es crear el documento Documenso con el paciente como destinatario nombrado y usar el token de firma individual (`EmbedSignDocument`).

**Flujo nuevo:**
1. Frontend llama `POST /historia-clinica/consentimientos/{id}/iniciar_firma/`
2. Backend llama a la API de Documenso para crear el documento desde la plantilla, con el paciente como destinatario (nombre + email del perfil)
3. Documenso devuelve el documento creado con un `signingUrl` o `token` por destinatario
4. Backend guarda el `documenso_document_id` en el consentimiento y devuelve el `signing_token` al frontend
5. Frontend usa `EmbedSignDocument` con ese token — campos pre-llenados y bloqueados, sin formulario inicial

**Endpoint nuevo:**

`POST /historia-clinica/consentimientos/{id}/iniciar_firma/`

Request: vacío (usa datos del consentimiento y del paciente ya guardados)

Response:
```json
{
  "signing_token": "abc123xyz",
  "documenso_document_id": "456"
}
```

**Errores posibles:**
```json
{ "error": "Error al crear el documento en Documenso.", "code": "DOCUMENSO_ERROR" }
```

**Email del destinatario:**
Los pacientes pueden no tener correo registrado. El email es requerido por Documenso para identificar al destinatario, pero no se usa para notificaciones (la firma es presencial). Regla:
- Si `paciente.email` existe → usarlo
- Si no → generar `paciente-{paciente.id}@noreply.clinica` como identificador sintético

El email sintético nunca se muestra al paciente ni recibe correos; solo permite crear el destinatario en Documenso.

**Cambios en modelo `ConsentimientoInformado`:**
- `documenso_signing_token` = CharField(max_length=500, null=True, blank=True) — token del destinatario para `EmbedSignDocument`

**Lógica del endpoint:**
1. Verificar que el consentimiento existe y pertenece a la clínica
2. Si ya tiene `documenso_document_id`, reusar (idempotente)
3. Llamar `POST /api/v1/templates/{template_id}/generate-document` de Documenso con el nombre y email del paciente
4. Guardar `documenso_document_id` y `documenso_signing_token` en el consentimiento
5. Devolver `signing_token`

**Cambio en frontend (`ConsentimientoFirmaSheet`):**
- En lugar de `EmbedDirectTemplate`, usar `EmbedSignDocument` con el `signing_token` devuelto
- Llama `iniciar_firma/` al abrir el modal
- El embed muestra el documento con nombre y email ya fijados, sin formulario inicial

**Definition of done:**
- [ ] Endpoint `POST /historia-clinica/consentimientos/{id}/iniciar_firma/` operativo
- [ ] `ConsentimientoInformado.documenso_signing_token` en modelo y migración
- [ ] El PDF resultante queda registrado con nombre oficial del paciente
- [ ] Frontend usa `EmbedSignDocument` con el token devuelto

---

#### H8.1 — Fotos clínicas: campo `zona` y endpoint de galería del paciente

**Motivación:** `FotoClinica` ya existe con tipos `antes/durante/despues`, pero las fotos no tienen un campo que indique a qué zona corresponden (frente, labios, patas de gallo, etc.). Sin ese campo no se puede construir una comparación antes/después por zona. Además, no hay un endpoint de galería del paciente que devuelva todas sus fotos agrupadas — hoy solo se obtienen como parte de cada nota individual.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración.

**Cambio en `FotoClinica` — campo nuevo:**
```python
zona = CharField(max_length=100, blank=True)
# Ejemplos: "frente", "entrecejo", "patas_de_gallo", "labios", "surco_nasogeniano", "zona_ocular", "cuello", etc.
# Campo libre — no enum, porque las zonas dependen del catálogo de servicios de cada clínica
```

**Cambio en `FotoClinicalSerializer`** — añadir `zona` al serializer existente (lectura y escritura).

**Cambio en el endpoint `POST /historia-clinica/fotos/`** — acepta `zona` como campo opcional en el multipart.

**Endpoint nuevo — galería del paciente:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/historia-clinica/historias/{id}/galeria/` | Todas las fotos del paciente agrupadas |

Parámetros opcionales: `?zona=frente`, `?tipo=antes|durante|despues`, `?cita=<uuid>`

Respuesta:
```json
{
  "total": 24,
  "por_tipo": {
    "antes": 8,
    "durante": 6,
    "despues": 10
  },
  "fotos": [
    {
      "id": "uuid",
      "nota": "uuid",
      "cita": "uuid",
      "cita_fecha": "2026-02-10T10:00:00Z",
      "servicio_nombre": "Toxina Botulínica",
      "tipo": "antes",
      "zona": "frente",
      "descripcion": "3 líneas horizontales",
      "url_firmada": "https://...",
      "created_at": "2026-02-10T10:05:00Z"
    }
  ]
}
```

La respuesta incluye `cita` y `cita_fecha` (del `nota.cita`) para que el frontend pueda agrupar visualmente por sesión.

**Implementación en vista:**
- `HistoriaClinicaViewSet` → nuevo `@action(detail=True, methods=['get'], url_path='galeria')`
- Query: `FotoClinica.objects.filter(nota__historia=historia).select_related('nota__cita')`
- Ordenar por `created_at desc` por defecto
- Aplicar filtros opcionales de `zona`, `tipo`, `cita` si vienen como query params
- Generar `url_firmada` para cada foto (igual que en `FotoClinicalSerializer` existente)

**Definition of done:**
- [ ] Migración aplicada — campo `zona` nullable, sin valor por defecto para no romper fotos existentes
- [ ] `POST /historia-clinica/fotos/` acepta `zona` opcionalmente
- [ ] `GET /historia-clinica/historias/{id}/galeria/` devuelve fotos con `cita`, `cita_fecha`, `zona`
- [ ] Filtros `?zona=`, `?tipo=`, `?cita=` funcionan individualmente y combinados
- [ ] Scoping: solo fotos de la historia indicada; permisos igual que el resto del módulo

**Prompt para AI:**
```
Implementa el hito H8.1 en apps/historia_clinica/ siguiendo las convenciones del proyecto.

1. En apps/historia_clinica/models.py — agrega a FotoClinica:
   - zona = CharField(max_length=100, blank=True)

2. En apps/historia_clinica/serializers.py — añade `zona` a FotoClinicalSerializer (lectura y escritura).

3. En apps/historia_clinica/views.py — en HistoriaClinicaViewSet:
   - Agrega @action(detail=True, methods=['get'], url_path='galeria')
   - Query base: FotoClinica.objects.filter(nota__historia=historia).select_related('nota', 'nota__cita').order_by('-created_at')
   - Filtros opcionales por query param: zona (icontains), tipo (exact), cita (exact UUID del nota.cita)
   - Para cada foto calcular url_firmada igual que el serializer de fotos existente
   - Respuesta: {"total": int, "por_tipo": {"antes": int, "durante": int, "despues": int}, "fotos": [...]}
   - Cada foto incluye: id, nota, cita (nota.cita_id), cita_fecha (nota.cita.fecha_inicio si disponible), servicio_nombre (nota.cita.servicio_nombre), tipo, zona, descripcion, url_firmada, created_at

4. Crea la migración.
```

**Contrato que se entrega al frontend — H8.1:**
- `POST /historia-clinica/fotos/` — ahora acepta `zona` opcional
- `GET /historia-clinica/historias/{id}/galeria/` — galería completa del paciente con agrupación y filtros

---

### Fase B5 — Operación financiera y de inventario

1. H10 inventario base.
2. H11 proveedores y compras.
3. H12 movimientos/kardex.
4. H13 cobros.
5. H14 caja.
6. H15 comisiones.
7. H16 asistencia.

**Contrato que se entrega al frontend**
- alertas de stock
- recepción de órdenes
- cobros, ítems y pagos
- resumen de caja del día
- liquidaciones y estados
- pacientes sin asistir

### Fase B2.5 — Gestión de usuarios y permisos

#### H2.5 — API de administración de usuarios

**Archivos que se tocan:** `apps/users/views.py`, `apps/users/serializers.py`, `apps/users/urls.py`

**Definition of done:**
- [x] `GET /api/v1/usuarios/` lista usuarios de la clínica con filtros por `rol` y `activo`
- [x] `POST /api/v1/usuarios/` crea usuario con rol `admin` o `recepcion` sin perfil de colaborador
- [x] `PATCH /api/v1/usuarios/{id}/` permite cambiar `rol`, `activo`, nombre, teléfono — no email ni password
- [x] `DELETE /api/v1/usuarios/{id}/` elimina usuarios sin relaciones protegidas
- [x] `POST /api/v1/usuarios/{id}/cambiar_password/` solo admin o el propio usuario
- [x] `POST /api/v1/usuarios/{id}/activar/` y `desactivar/` — toggle de `activo`
- [x] Admin solo ve usuarios de su clínica; superadmin ve todos
- [x] Admin no puede escalar rol a admin ni superadmin de otro usuario
- [x] El borrado bloquea autoeliminación y responde error claro cuando hay relaciones protegidas

**Prompt para AI:**
```
Implementa el ViewSet de gestión de usuarios en apps/users/ usando las convenciones globales.

UserViewSet:
- Queryset base: User.objects.select_related('colaborador__sede_principal')
- Scoping: si request.user.rol != superadmin → filtrar por clinica=request.user.clinica
- Permisos: list/retrieve/create/update → IsAdmin
- HTTP methods: GET, POST, PATCH, DELETE — sin PUT

Filtros (django-filter):
- rol (exact)
- activo (boolean)
- search: first_name, last_name, email

Serializers:

1. UserAdminSerializer (lectura):
   Campos: id, email, first_name, last_name, nombre_completo, rol, telefono,
   foto_perfil, activo, created_at, tiene_colaborador (SerializerMethodField →
   hasattr(obj, 'colaborador')), sede_principal_nombre (SerializerMethodField →
   obj.colaborador.sede_principal.nombre si existe, else None)

2. UserCreateSerializer (POST):
   Campos: email, first_name, last_name, password (write_only), rol, telefono
   Validaciones:
   - rol solo puede ser admin o recepcion (no superadmin, no profesional — para
     profesional usar el endpoint de colaboradores)
   - email único en la clínica
   - password mínimo 8 caracteres
   En create(): hashear password con set_password(), asignar clinica=request.user.clinica

3. UserUpdateSerializer (PATCH):
   Campos permitidos: first_name, last_name, telefono, rol, activo
   Validación: no permitir cambiar rol a superadmin ni cambiar rol de un superadmin

Acciones extra:

@action POST 'cambiar_password/'
- Recibe: { nueva_password: str }
- Permiso: IsAdmin OR request.user == obj
- Valida mínimo 8 caracteres
- Llama set_password() y save()

@action POST 'activar/'
- Setea activo=True, guarda, retorna UserAdminSerializer

@action POST 'desactivar/'
- Setea activo=False, guarda
- Validación: no se puede desactivar a sí mismo
- Retorna UserAdminSerializer

DELETE /{id}/
- Elimina el usuario si no tiene relaciones protegidas
- Validación: no se puede eliminar a sí mismo
- Si existe relación protegida, responder 400 con detalle legible

Rutas en urls.py con DefaultRouter, prefijo: usuarios/
Registrar en config/urls.py bajo api/v1/usuarios/
```

**Contrato que se entrega al frontend:**
- `GET /api/v1/usuarios/`
- `POST /api/v1/usuarios/`
- `GET /api/v1/usuarios/{id}/`
- `PATCH /api/v1/usuarios/{id}/`
- `DELETE /api/v1/usuarios/{id}/`
- `POST /api/v1/usuarios/{id}/cambiar_password/`
- `POST /api/v1/usuarios/{id}/activar/`
- `POST /api/v1/usuarios/{id}/desactivar/`

---

### Fase B6 — Reportes y salida a producción

1. H17 reportes agregados para dashboard.
2. H18 QA, seguridad y go-live.

---

#### H17.1 — API de reportes y dashboard

**Archivos que se tocan:** `apps/reportes/views.py`, `apps/reportes/urls.py`

Sin modelos propios. Solo queries sobre modelos existentes de agenda, cobros, inventario y caja.

**Definition of done:**
- [x] `GET /api/v1/reportes/dashboard/` responde en < 500 ms
- [x] `GET /api/v1/reportes/ingresos/` agrupable por día, semana o mes
- [x] `GET /api/v1/reportes/servicios/` incluye margen real con costo de insumos
- [x] `GET /api/v1/reportes/ocupacion/` por profesional con tasa de completadas
- [x] Todos los endpoints scopeados por clínica del usuario autenticado
- [x] Superadmin puede pasar `?sede_id=` o ver todo si no filtra

**Prompt para AI:**
```
Implementa la API de reportes en apps/reportes/views.py. Solo lógica de queries — no crear modelos propios.
Usa las convenciones globales del proyecto.

Todos los endpoints requieren IsAuthenticated.
Scopear siempre por clinica del usuario (si no es superadmin: filter(sede__clinica=request.user.clinica) o equivalente según el modelo).

──────────────────────────────────────────
1. GET /api/v1/reportes/dashboard/
──────────────────────────────────────────
Parámetros opcionales: ?sede_id=<uuid> &fecha=YYYY-MM-DD (default hoy)

Respuesta:
{
  "citas_hoy": {
    "total": int,
    "pendientes": int,
    "confirmadas": int,
    "en_curso": int,
    "completadas": int,
    "canceladas": int,
    "no_asistio": int
  },
  "cobros_hoy": {
    "total_cop": "Decimal",          // sum de Cobro.total donde fecha__date=hoy y estado != anulado
    "pagados": int,
    "pendientes": int,
    "por_medio_pago": [{"medio": str, "total": "Decimal"}]   // from PagoRecibido agrupado por medio_pago
  },
  "stock_alertas": int,              // count de Insumo donde stock_actual <= stock_minimo y activo=True
  "ingresos_semana": [               // últimos 7 días incluyendo hoy
    {"fecha": "YYYY-MM-DD", "total": "Decimal"}
  ]
}

──────────────────────────────────────────
2. GET /api/v1/reportes/ingresos/
──────────────────────────────────────────
Parámetros: ?sede_id= &fecha_inicio=YYYY-MM-DD &fecha_fin=YYYY-MM-DD &agrupar_por=dia|semana|mes
Default: últimos 30 días, agrupado por día.

Respuesta: lista ordenada por periodo asc
[
  {
    "periodo": "YYYY-MM-DD",         // o "YYYY-Www" o "YYYY-MM" según agrupar_por
    "total_cobros": "Decimal",
    "total_gastos": "Decimal"        // sum de GastoCaja.valor donde estado=aprobado (si el módulo caja no existe aún, retornar 0)
  }
]

Fuente: Cobro.total donde estado != anulado, agrupado por Cobro.fecha__date (o truncado por semana/mes con TruncWeek, TruncMonth de django.db.models.functions).

──────────────────────────────────────────
3. GET /api/v1/reportes/servicios/
──────────────────────────────────────────
Parámetros: ?sede_id= &fecha_inicio=YYYY-MM-DD &fecha_fin=YYYY-MM-DD
Default: mes en curso.

Fuente: ItemCobro join Cobro join Cita join Servicio donde Cobro.estado != anulado y ItemCobro.tipo=servicio.

Respuesta: ordenado por ingresos desc
[
  {
    "servicio_nombre": str,
    "cantidad_citas": int,
    "ingresos": "Decimal",           // sum(ItemCobro.subtotal)
    "costo_insumos": "Decimal",      // sum(ItemCobro.costo_unitario * ItemCobro.cantidad) para items tipo insumo_consumo de los mismos cobros
    "margen": "Decimal",             // ingresos - costo_insumos
    "margen_pct": "Decimal"          // margen / ingresos * 100, 0 si ingresos=0
  }
]

──────────────────────────────────────────
4. GET /api/v1/reportes/ocupacion/
──────────────────────────────────────────
Parámetros: ?sede_id= &fecha_inicio=YYYY-MM-DD &fecha_fin=YYYY-MM-DD
Default: mes en curso.

Fuente: Cita agrupada por profesional.

Respuesta: ordenado por total_citas desc
[
  {
    "profesional_id": "uuid",
    "profesional_nombre": str,
    "total_citas": int,
    "completadas": int,
    "canceladas": int,
    "no_asistio": int,
    "tasa_completadas_pct": "Decimal"   // completadas / total_citas * 100, 0 si total=0
  }
]

──────────────────────────────────────────
Reglas de implementación:
──────────────────────────────────────────
- Usar Sum, Count, F, ExpressionWrapper, Case/When, TruncDate/TruncWeek/TruncMonth de django.db.models.
- select_related y prefetch_related en todos los querysets con joins.
- No calcular nada en Python si puede resolverse en SQL.
- Si un módulo dependiente (caja, comisiones) aún no existe, retornar 0 o lista vacía sin lanzar error — el frontend lo manejará como dato vacío.
- Rutas en apps/reportes/urls.py con APIView o @api_view, no ViewSet (son endpoints de solo lectura sin CRUD).
- Registrar en config/urls.py bajo el prefijo api/v1/reportes/.
```

**Contrato que se entrega al frontend:**
- `GET /api/v1/reportes/dashboard/`
- `GET /api/v1/reportes/ingresos/`
- `GET /api/v1/reportes/servicios/`
- `GET /api/v1/reportes/ocupacion/`

---

### Fase B4.2 — Historia clínica estructurada, órdenes médicas y cotizaciones

#### H8.2 — Historia clínica extendida: motivo de consulta y plan de manejo persistentes

**Motivación:** la historia clínica actual almacena `anamnesis` y `plan_manejo` únicamente dentro de cada `NotaClinica` (inmutable). Se requieren campos editables y persistentes en `HistoriaClinica` para que el profesional pueda mantener un resumen acumulado del paciente independiente de las notas puntuales.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración.

**Cambios en el modelo `HistoriaClinica`:**
```python
motivo_consulta = models.TextField(blank=True, default='')
plan_manejo     = models.TextField(blank=True, default='')
```

**Definition of done:**
- [x] `PATCH /historia-clinica/historias/{id}/` acepta `motivo_consulta` y `plan_manejo`
- [x] El serializer de detalle incluye los dos campos nuevos en `GET`
- [x] Solo profesionales y admin de la misma clínica pueden editar
- [x] Migración aplicada sin romper datos existentes

**Contrato que se entrega al frontend — H8.2:**
- `PATCH /historia-clinica/historias/{id}/` con body `{ "motivo_consulta": "...", "plan_manejo": "..." }`
- `GET /historia-clinica/historias/{id}/` devuelve ambos campos

---

#### H8.3 — Resultados de exámenes y laboratorio

**Motivación:** el profesional necesita adjuntar resultados de laboratorio o exámenes complementarios a la historia del paciente, con fecha y descripción.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración.

**Nuevo modelo `ResultadoExamen`:**
```python
class ResultadoExamen(models.Model):
    historia    = models.ForeignKey(HistoriaClinica, on_delete=models.CASCADE, related_name='resultados')
    titulo      = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True, default='')
    archivo     = models.FileField(upload_to='examenes/', null=True, blank=True)
    fecha       = models.DateField()
    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at  = models.DateTimeField(auto_now_add=True)
```

**Definition of done:**
- [x] `GET /historia-clinica/resultados-examenes/?historia=<id>` lista resultados del paciente
- [x] `POST /historia-clinica/resultados-examenes/` acepta `multipart/form-data` para subir archivo
- [x] `GET /historia-clinica/resultados-examenes/{id}/` detalle con URL firmada del archivo
- [x] `PATCH /historia-clinica/resultados-examenes/{id}/` permite editar título, descripción, fecha
- [x] `DELETE /historia-clinica/resultados-examenes/{id}/` elimina registro y archivo de MinIO
- [x] Scoping por clínica vía `historia.paciente.clinica`
- [x] URL del archivo siempre firmada (MinIO presigned), nunca pública

**Contrato que se entrega al frontend — H8.3:**
```json
{
  "id": "uuid",
  "historia": "uuid",
  "titulo": "Hemograma completo",
  "descripcion": "...",
  "archivo_url": "https://minio.../presigned",
  "fecha": "2026-05-01",
  "created_by_nombre": "Dr. García",
  "created_at": "2026-05-01T10:00:00Z"
}
```

---

#### H8.4 — Plantillas de órdenes médicas

**Motivación:** los profesionales necesitan reutilizar texto de prescripciones/órdenes frecuentes sin tener que reescribirlas cada vez. Las plantillas son texto libre (no ítems estructurados, ya que en estética las combinaciones son muy variables). Un parámetro de configuración controla si el profesional puede editar el texto al momento de usar la plantilla.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración.

**Nuevo modelo `PlantillaOrden`:**
```python
class PlantillaOrden(models.Model):
    clinica                    = models.ForeignKey(Clinica, on_delete=models.CASCADE)
    nombre                     = models.CharField(max_length=200)
    contenido                  = models.TextField()
    permite_edicion_profesional = models.BooleanField(default=True)
    activa                     = models.BooleanField(default=True)
    created_by                 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at                 = models.DateTimeField(auto_now_add=True)
    updated_at                 = models.DateTimeField(auto_now=True)
```

**Definition of done:**
- [x] `GET /historia-clinica/plantillas-ordenes/` lista plantillas activas de la clínica
- [x] `POST /historia-clinica/plantillas-ordenes/` crea plantilla — solo admin/coordinador
- [x] `GET /historia-clinica/plantillas-ordenes/{id}/` detalle
- [x] `PATCH /historia-clinica/plantillas-ordenes/{id}/` edita — solo admin/coordinador
- [x] `DELETE /historia-clinica/plantillas-ordenes/{id}/` soft-delete (`activa=False`) — solo admin/coordinador
- [x] Profesionales solo tienen acceso de lectura (`GET`)
- [x] Filtro `?activa=true` por defecto en el listado

**Contrato que se entrega al frontend — H8.4:**
```json
{
  "id": "uuid",
  "nombre": "Receta toxina botulínica estándar",
  "contenido": "Dysport 300 UI\nDisolver en 2.5ml SSN...",
  "permite_edicion_profesional": true,
  "activa": true,
  "created_at": "2026-05-01T10:00:00Z"
}
```

---

#### H8.5 — Órdenes médicas

**Motivación:** el profesional emite órdenes médicas durante o después de la atención. Pueden basarse en una plantilla (con o sin edición) o crearse desde cero. Si se usa una plantilla con `permite_edicion_profesional=False` y el contenido difiere, el backend rechaza la petición. Si se edita una plantilla con edición permitida, queda rastro en el historial de acciones.

**Archivos que se tocan:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, nueva migración.

**Nuevo modelo `OrdenMedica`:**
```python
class OrdenMedica(models.Model):
    historia           = models.ForeignKey(HistoriaClinica, on_delete=models.CASCADE, related_name='ordenes')
    cita               = models.ForeignKey(Cita, on_delete=models.SET_NULL, null=True, blank=True)
    plantilla_origen   = models.ForeignKey(PlantillaOrden, on_delete=models.SET_NULL, null=True, blank=True)
    contenido          = models.TextField()
    contenido_original = models.TextField(blank=True, default='')  # snapshot de la plantilla al crear
    fue_editada        = models.BooleanField(default=False)
    profesional        = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at         = models.DateTimeField(auto_now_add=True)
```

**Reglas de negocio:**
- Si `plantilla_origen` tiene `permite_edicion_profesional=False` y `contenido != plantilla_origen.contenido` → responder `400 {"error": "Esta plantilla no permite modificaciones", "code": "PLANTILLA_NO_EDITABLE"}`
- Si `plantilla_origen` tiene `permite_edicion_profesional=True` y `contenido != contenido_original` → marcar `fue_editada=True` y registrar en historial de acciones: `"OrdenMedica #{id} editada por {profesional} (plantilla: {nombre})"`
- `contenido_original` siempre es el snapshot del contenido de la plantilla en el momento de crear la orden (no el contenido actual de la plantilla, que puede cambiar)

**Definition of done:**
- [x] `GET /historia-clinica/ordenes-medicas/?historia=<id>` lista órdenes del paciente
- [x] `POST /historia-clinica/ordenes-medicas/` crea orden con las reglas de edición aplicadas
- [x] `GET /historia-clinica/ordenes-medicas/{id}/` detalle completo
- [x] Historial de acciones registra edición si `fue_editada=True`
- [x] Scoping por clínica
- [x] Las órdenes son inmutables post-creación (no hay PATCH)

**Contrato que se entrega al frontend — H8.5:**
```json
{
  "id": "uuid",
  "historia": "uuid",
  "cita": "uuid | null",
  "plantilla_origen": "uuid | null",
  "plantilla_nombre": "Receta toxina botulínica estándar",
  "contenido": "...",
  "fue_editada": false,
  "profesional_nombre": "Dr. García",
  "created_at": "2026-05-01T10:00:00Z"
}
```

---

#### H8.6 — Envío de orden médica por WhatsApp vía n8n

**Motivación:** el profesional debe poder enviar la orden al paciente por WhatsApp desde la app. El backend genera un PDF de la orden y lo envía a un webhook de n8n que maneja la entrega. La URL del webhook se almacena como variable de entorno en el servidor.

**Archivos que se tocan:** `apps/historia_clinica/views.py`, `settings.py`, nueva dependencia PDF (ej. `weasyprint` o `reportlab`).

**Variable de entorno:**
```
ORDEN_WEBHOOK_URL=https://n8n.tudominio.com/webhook/ordenes-medicas
```

**Acción `enviar_whatsapp` en `OrdenMedicaViewSet`:**
```
POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/
```

**Flujo:**
1. Obtener la `OrdenMedica` con sus relaciones (paciente, profesional, historia)
2. Generar PDF con: nombre clínica, paciente, profesional, fecha, contenido de la orden
3. Codificar PDF en base64
4. `POST` a `ORDEN_WEBHOOK_URL` con payload:
```json
{
  "paciente_nombre": "...",
  "paciente_telefono": "...",
  "profesional_nombre": "...",
  "fecha": "2026-05-01",
  "contenido": "...",
  "pdf_base64": "JVBERi0x..."
}
```
5. Responder `200 { "enviado": true }` o `502 { "error": "No se pudo contactar el webhook", "code": "WEBHOOK_ERROR" }`

**Definition of done:**
- [x] `POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/` funciona end-to-end
- [x] PDF generado con datos mínimos: clínica, paciente, profesional, fecha, contenido
- [x] Si `ORDEN_WEBHOOK_URL` no está configurada → `503 {"error": "Webhook no configurado", "code": "WEBHOOK_NOT_CONFIGURED"}`
- [x] Si el webhook externo responde error → `502` con mensaje descriptivo
- [x] Sin autenticación saliente al webhook por ahora (se agrega en hito posterior)

**Contrato que se entrega al frontend — H8.6:**
- `POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/` → `{ "enviado": true }` o error

---

### Fase B7 — Cotizaciones

#### H19 — Módulo de cotizaciones

> ⚠️ **Estados actualizados por H24.** La máquina de estados original incluía `enviada` y `rechazada`; H24 los elimina. Ver H24 para los detalles del cambio y el modelo `CotizacionEnvio`.

**Motivación:** el flujo comercial requiere que los profesionales generen cotizaciones formales para los pacientes antes de iniciar un plan de tratamiento, con ítems, duración estimada, valores y formas de pago. Las cotizaciones tienen un ciclo de vida simplificado: `borrador → aceptada / vencida`. El envío al paciente (WhatsApp, email, PDF) es un evento de comunicación registrado en `CotizacionEnvio`, no un cambio de estado.

**Archivos que se tocan:** nueva app `apps/cotizaciones/`, `config/urls.py`.

**Modelos:**
```python
class Cotizacion(models.Model):
    ESTADOS = ['borrador', 'aceptada', 'vencida']  # ver H24 — 'enviada' y 'rechazada' eliminados
    clinica       = models.ForeignKey(Clinica, on_delete=models.CASCADE)
    paciente      = models.ForeignKey(Paciente, on_delete=models.CASCADE)
    profesional   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    sede          = models.ForeignKey(Sede, on_delete=models.SET_NULL, null=True, blank=True)
    estado        = models.CharField(max_length=20, default='borrador')
    validez_dias  = models.PositiveIntegerField(default=30)
    notas         = models.TextField(blank=True, default='')
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

class ItemCotizacion(models.Model):
    cotizacion         = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='items')
    descripcion        = models.CharField(max_length=300)
    num_citas          = models.PositiveIntegerField(default=1)
    duracion_estimada  = models.CharField(max_length=100, blank=True)  # ej. "3 meses"
    valor_unitario     = models.DecimalField(max_digits=12, decimal_places=2)
    descuento_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, default=0)

class FormaPagoCotizacion(models.Model):
    TIPOS = ['efectivo', 'transferencia', 'cuotas', 'financiamiento']
    cotizacion  = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='formas_pago')
    tipo        = models.CharField(max_length=30)
    descripcion = models.CharField(max_length=200, blank=True)
    valor       = models.DecimalField(max_digits=12, decimal_places=2)
```

**Definition of done:**
- [x] `GET /cotizaciones/` lista cotizaciones de la clínica con filtros por `estado`, `paciente`, `profesional`
- [x] `POST /cotizaciones/` crea cotizacion con items y formas de pago anidados
- [x] `GET /cotizaciones/{id}/` detalle completo con items y formas de pago
- [x] `PATCH /cotizaciones/{id}/` edita — solo si `estado=borrador`
- [x] `DELETE /cotizaciones/{id}/` soft-delete — solo si `estado=borrador`
- [x] `POST /cotizaciones/{id}/cambiar_estado/` con body `{ "estado": "aceptada" }` — ver H24 para transiciones actualizadas
- [x] `GET /cotizaciones/{id}/pdf/` genera y devuelve PDF descargable con: letterhead clínica, datos paciente, tabla de ítems con subtotales y totales, formas de pago, fecha de validez
- [x] Transiciones de estado actualizadas (H24): `borrador→aceptada`, cualquier estado→`vencida` (tarea programada por `validez_dias`)
- [x] Scoping por clínica

**Contrato que se entrega al frontend — H19:**
```json
{
  "id": "uuid",
  "paciente": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "profesional_nombre": "Dr. García",
  "estado": "borrador",
  "validez_dias": 30,
  "fecha_vencimiento": "2026-06-25",
  "notas": "",
  "items": [
    {
      "id": "uuid",
      "descripcion": "Toxina botulínica - frente + entrecejo",
      "num_citas": 1,
      "duracion_estimada": "45 min",
      "valor_unitario": "350000.00",
      "descuento_porcentaje": "0.00",
      "subtotal": "350000.00"
    }
  ],
  "formas_pago": [
    { "id": "uuid", "tipo": "transferencia", "descripcion": "Banco XYZ", "valor": "350000.00" }
  ],
  "total": "350000.00",
  "created_at": "2026-05-26T10:00:00Z"
}
```

---

#### H19.1 — Periodicidad sugerida en ítems de cotización

**Motivación:** el profesional necesita indicar la frecuencia de repetición recomendada para cada servicio cotizado (ej. "Mensual", "Cada 15 días"), de modo que el paciente reciba una propuesta completa con el plan de tratamiento sugerido. El campo es de texto libre para máxima flexibilidad.

**Archivos que se tocan:** `apps/cotizaciones/models.py`, `apps/cotizaciones/serializers.py`, `apps/cotizaciones/pdf.py`, nueva migración.

**Cambio en modelo:**
```python
class ItemCotizacion(models.Model):
    cotizacion           = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='items')
    descripcion          = models.CharField(max_length=300)
    num_citas            = models.PositiveIntegerField(default=1)
    duracion_estimada    = models.CharField(max_length=100, blank=True)
    periodicidad         = models.CharField(max_length=100, blank=True)   # nuevo
    valor_unitario       = models.DecimalField(max_digits=12, decimal_places=2)
    descuento_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, default=0)
```

**Cambio en serializer** — agregar `'periodicidad'` a `fields` de `ItemCotizacionSerializer`.

**Cambio en PDF** — agregar columna "Periodicidad" en la tabla de ítems, entre "Duración" y "Precio".

**Definition of done:**
- [ ] Campo `periodicidad` en modelo con migración aplicada
- [ ] Serializer expone y acepta `periodicidad` en lectura y escritura
- [ ] `POST /cotizaciones/` y `PATCH /cotizaciones/{id}/` persisten el campo correctamente
- [ ] PDF incluye la columna Periodicidad cuando el valor no es vacío
- [ ] Campo opcional — cotizaciones existentes no se ven afectadas (`blank=True`)

**Contrato actualizado — ítem:**
```json
{
  "id": "uuid",
  "descripcion": "Toxina botulínica - frente + entrecejo",
  "num_citas": 1,
  "duracion_estimada": "45 min",
  "periodicidad": "Cada 4 meses",
  "valor_unitario": "350000.00",
  "descuento_porcentaje": "0.00",
  "subtotal": "350000.00"
}
```

---

#### H19.2 — Logo de clínica y PDF de cotizaciones con WeasyPrint

**Motivación:** el PDF actual de cotizaciones carece de identidad visual de la clínica (sin logo, sin datos de contacto formateados). Para que las cotizaciones sean documentos comerciales profesionales se necesita: (1) un campo `logo` en `Clinica` que el admin pueda subir; (2) reescribir el endpoint `GET /cotizaciones/{id}/pdf/` usando WeasyPrint con una plantilla HTML/CSS que incluya el logo, la cabecera de la clínica, los datos del paciente y una tabla de ítems con tipografía cuidada. El mismo patrón servirá de base para PDFs futuros (órdenes médicas, reportes).

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, `apps/cotizaciones/views.py`, `apps/cotizaciones/pdf.py` (reemplazar implementación actual), nueva migración, `requirements.txt` (agregar `weasyprint`).

**Paso 1 — Campo `logo` en `Clinica`:**
```python
class Clinica(models.Model):
    # ... campos existentes ...
    logo = models.ImageField(
        upload_to='clinicas/logos/',
        null=True, blank=True,
        help_text='Logo de la clínica en formato PNG o JPG. Se usa en PDFs y documentos.'
    )
    logo_url = models.URLField(blank=True)   # URL firmada MinIO, regenerada en save()
```

En `save()`: si `logo` ha cambiado, subir a MinIO con `upload_public_file()` (el logo se sirve como URL pública dentro del PDF, no firmada, para que WeasyPrint pueda descargarlo en el momento de renderizar; el bucket debe tener el prefix `clinicas/logos/` con política de lectura pública, o descargarlo in-process como bytes).

**Endpoints nuevos en `apps/clinicas/views.py`:**
```
POST /clinicas/mi-clinica/logo/   — sube el logo (multipart, campo: logo). Devuelve { logo_url }
DELETE /clinicas/mi-clinica/logo/ — elimina el logo. Devuelve { logo_url: null }
```

Ambos requieren permiso `clinicas.editar`. El `PATCH /clinicas/mi-clinica/` existente no acepta `logo` (archivo binario requiere su propio endpoint multipart).

**Paso 2 — Plantilla WeasyPrint para cotizaciones (`apps/cotizaciones/templates/cotizaciones/pdf_cotizacion.html`):**

Estructura HTML + CSS inline (WeasyPrint lee CSS in-document o via `<style>`):

```
┌──────────────────────────────────────────────────┐
│  [LOGO]   Nombre clínica                          │
│           NIT: xxx   Tel: xxx   Ciudad            │
├──────────────────────────────────────────────────┤
│  COTIZACIÓN                     N°: {id[:8]}     │
│  Fecha: {created_at}  Válida hasta: {vencimiento}│
├──────────────────────────────────────────────────┤
│  PACIENTE                    PROFESIONAL          │
│  Nombre completo             Nombre profesional   │
│  Doc: CC 123456789                                │
│  Tel: 3001234567                                  │
├──────────────────────────────────────────────────┤
│  Servicio | Sesiones | Duración | Periodicidad | Precio unit. | Desc % | Subtotal │
│  ──────────────────────────────────────────────  │
│  Toxina botulínica…    1        45 min    …       │
├──────────────────────────────────────────────────┤
│                              Subtotal: $xxx       │
│                              Descuentos: -$xxx    │
│                              TOTAL:  $xxx         │
├──────────────────────────────────────────────────┤
│  FORMAS DE PAGO                                   │
│  Efectivo     $xxx   Fecha: dd/mm/yyyy            │
│  Transferencia $xxx                               │
├──────────────────────────────────────────────────┤
│  Notas: ...                                       │
├──────────────────────────────────────────────────┤
│  Este documento tiene validez comercial por       │
│  {validez_dias} días a partir de su emisión.      │
└──────────────────────────────────────────────────┘
```

CSS: fuente `Helvetica`/`sans-serif`, colores neutros (header con fondo gris oscuro o color de marca si se parametriza en el futuro), tabla con bordes finos, total en negrita grande, footer con número de página (`counter(page)`).

**Paso 3 — Vista `GET /cotizaciones/{id}/pdf/`:**
```python
from weasyprint import HTML
from django.template.loader import render_to_string

def generar_pdf_cotizacion(cotizacion):
    clinica = cotizacion.clinica
    context = {
        'cotizacion': cotizacion,
        'clinica': clinica,
        'items': cotizacion.items.all(),
        'formas_pago': cotizacion.formas_pago.all(),
        'subtotal_bruto': sum(i.valor_unitario * i.num_citas for i in cotizacion.items.all()),
        'total_descuentos': sum(i.valor_unitario * i.num_citas * i.descuento_porcentaje / 100 for i in cotizacion.items.all()),
    }
    html_string = render_to_string('cotizaciones/pdf_cotizacion.html', context)
    pdf_bytes = HTML(string=html_string, base_url=settings.BASE_URL).write_pdf()
    return pdf_bytes
```

La vista devuelve `HttpResponse(pdf_bytes, content_type='application/pdf')` con header `Content-Disposition: attachment; filename="cotizacion-{id[:8]}.pdf"`.

**Formato de moneda en la plantilla:** usar filtro de template Django o `humanize` para separador de miles colombiano (`$350.000`). Si no está disponible, formatear en el context con Python: `f"${value:,.0f}".replace(",", ".")`.

**Definition of done:**
- [ ] Campo `logo` en `Clinica` con migración aplicada
- [ ] `POST /clinicas/mi-clinica/logo/` sube logo a MinIO y devuelve URL
- [ ] `DELETE /clinicas/mi-clinica/logo/` elimina el logo
- [ ] `GET /clinicas/mi-clinica/` incluye `logo_url` en la respuesta
- [ ] WeasyPrint instalado en `requirements.txt` y en el Docker image
- [ ] Plantilla HTML genera PDF con: logo (si existe), nombre/NIT/teléfono/ciudad de la clínica, número y fecha de cotización, fecha de vencimiento, datos de paciente y profesional, tabla de ítems con periodicidad, subtotal/descuentos/total formateados en COP, formas de pago, notas, pie de página con validez
- [ ] PDF se ve correctamente en Chrome PDF viewer e impresión
- [ ] Si `clinica.logo_url` es null, el espacio del logo queda vacío sin romper el layout

**Contrato nuevo en `GET /clinicas/mi-clinica/`:**
```json
{
  "id": "uuid",
  "nombre": "Clínica Estética La Bella",
  "nit": "900123456-1",
  "telefono": "6011234567",
  "ciudad": "Bogotá",
  "direccion": "Calle 100 #15-20",
  "logo_url": "https://minio.../clinicas/logos/uuid.png"
}
```

---

---

### Fase B8 — Integración cotización → agenda → cartera

> Esta fase cierra el flujo comercial completo: una cotización aprobada genera un plan de sesiones agendables y una cartera de cobro por cobrar. Los tres hitos son secuenciales: H20 debe cerrarse antes de H21, y H22 puede correr en paralelo a H21.

---

#### H20 — Cotización editable hasta aprobación + vinculación cita-ítem

> ⚠️ **H24 elimina el estado `enviada`.** El único estado editable sigue siendo `borrador` (la cotización permanece en borrador hasta que el usuario la aprueba explícitamente). Actualizar la validación si se modificó para incluir `enviada`.

**Motivación:** la cotización es editable mientras está en `borrador`. Una vez `aceptada` o `vencida`, queda bloqueada. Adicionalmente, al crear una cita se puede indicar que corresponde a un ítem de una cotización aprobada para descontar sesiones.

**Archivos que se tocan:** `apps/cotizaciones/views.py`, `apps/agenda/models.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, nueva migración.

**Cambio 1 — regla de edición de cotización:**

En `CotizacionViewSet.partial_update` (PATCH) y `destroy` (DELETE), la validación es:
```python
if cotizacion.estado != 'borrador':
    raise ValidationError({'error': 'Solo se pueden editar cotizaciones en borrador.', 'code': 'COTIZACION_NO_EDITABLE'})
```

**Cambio 2 — FK en `Cita`:**
```python
class Cita(models.Model):
    ...
    item_cotizacion = models.ForeignKey(
        'cotizaciones.ItemCotizacion',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='citas',
    )
```

**Cambio 3 — serializer de `Cita`:**
- `CreateCitaSerializer`: acepta `item_cotizacion` (UUID, opcional).
- Validación al crear: si se envía `item_cotizacion`, verificar que la cotización padre esté en estado `aceptada`. Si no → `400 {"error": "Solo se pueden consumir ítems de cotizaciones aceptadas.", "code": "COTIZACION_NO_ACEPTADA"}`.
- Validación de sesiones: si `item.citas_no_canceladas() >= item.num_citas` → `400 {"error": "Este ítem no tiene sesiones disponibles.", "code": "SIN_SESIONES_DISPONIBLES"}`.
- `CitaDetailSerializer` (lectura): incluir `item_cotizacion_id` y `cotizacion_resumen` (objeto con `id`, `descripcion`, `num_citas`, `citas_usadas`, `citas_restantes`).

**Método helper en `ItemCotizacion`:**
```python
def citas_no_canceladas(self):
    return self.citas.exclude(estado='cancelada').count()

def citas_restantes(self):
    return max(0, self.num_citas - self.citas_no_canceladas())
```

**Cambio 4 — `GET /cotizaciones/{id}/` incluir estado de sesiones por ítem:**
```json
"items": [
  {
    "id": "uuid",
    "descripcion": "Toxina botulínica",
    "num_citas": 4,
    "citas_agendadas": 2,
    "citas_completadas": 1,
    "citas_restantes": 2,
    ...
  }
]
```

Implementar con `SerializerMethodField` que hace `.citas.exclude(estado='cancelada').count()` y `.citas.filter(estado='completada').count()`.

**Definition of done:**
- [ ] `PATCH /cotizaciones/{id}/` permite edición en estado `borrador` y `enviada`; bloquea en `aceptada`, `rechazada`, `vencida`
- [ ] `DELETE /cotizaciones/{id}/` sigue restringido solo a `borrador`
- [ ] Campo `item_cotizacion` en `Cita` con migración aplicada
- [ ] `POST /agenda/citas/` acepta y valida `item_cotizacion` opcional
- [ ] `GET /agenda/citas/{id}/` expone `item_cotizacion_id` y `cotizacion_resumen`
- [ ] `GET /cotizaciones/{id}/` expone `citas_agendadas`, `citas_completadas`, `citas_restantes` por ítem
- [ ] Scoping: el ítem debe pertenecer a una cotización de la misma clínica que la cita

**Contrato — `GET /cotizaciones/{id}/` (ítem actualizado):**
```json
{
  "id": "uuid",
  "descripcion": "Toxina botulínica - frente + entrecejo",
  "num_citas": 4,
  "citas_agendadas": 2,
  "citas_completadas": 1,
  "citas_restantes": 2,
  "periodicidad": "Cada 4 meses",
  "valor_unitario": "350000.00",
  "descuento_porcentaje": "0.00",
  "subtotal": "1400000.00"
}
```

**Contrato — `GET /agenda/citas/{id}/` (campos nuevos):**
```json
{
  "id": "uuid",
  ...
  "item_cotizacion_id": "uuid | null",
  "cotizacion_resumen": {
    "cotizacion_id": "uuid",
    "descripcion": "Toxina botulínica - frente + entrecejo",
    "num_citas": 4,
    "citas_agendadas": 2,
    "citas_restantes": 2
  }
}
```

---

#### H21 — Panel de sesiones por cotización

**Motivación:** la clínica necesita ver de un vistazo cuántas sesiones de un plan se han consumido, cuáles están próximas y cuáles están atrasadas, sin tener que buscar cita por cita en la agenda.

**Archivos que se tocan:** `apps/cotizaciones/views.py`, `apps/cotizaciones/serializers.py`.

**Endpoint nuevo:**

`GET /cotizaciones/{id}/sesiones/`

Respuesta: por cada ítem, lista las citas vinculadas con detalle suficiente para mostrar un timeline.

```json
{
  "cotizacion_id": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "items": [
    {
      "item_id": "uuid",
      "descripcion": "Toxina botulínica - frente + entrecejo",
      "num_citas": 4,
      "periodicidad": "Cada 4 meses",
      "citas_agendadas": 2,
      "citas_completadas": 1,
      "citas_restantes": 2,
      "citas": [
        {
          "cita_id": "uuid",
          "fecha_inicio": "2026-03-10T10:00:00Z",
          "estado": "completada",
          "profesional_nombre": "Dr. García",
          "sede_nombre": "Sede Norte"
        },
        {
          "cita_id": "uuid",
          "fecha_inicio": "2026-07-10T10:00:00Z",
          "estado": "confirmada",
          "profesional_nombre": "Dr. García",
          "sede_nombre": "Sede Norte"
        }
      ]
    }
  ]
}
```

**Implementación:**
- `CotizacionViewSet` → `@action(detail=True, methods=['get'], url_path='sesiones')`
- Query: `ItemCotizacion.objects.filter(cotizacion=obj).prefetch_related(Prefetch('citas', queryset=Cita.objects.exclude(estado='cancelada').order_by('fecha_inicio')))`

**Definition of done:**
- [ ] `GET /cotizaciones/{id}/sesiones/` devuelve el resumen completo por ítem
- [ ] Las citas canceladas no se cuentan como consumidas
- [ ] El endpoint respeta scoping por clínica
- [ ] Incluye citas en cualquier estado no-cancelado (pendiente, confirmada, en_curso, completada)

---

#### H22 — Módulo de cartera

**Motivación:** al aceptar una cotización se crea automáticamente una cartera con las cuotas esperadas según las `formas_pago` de la cotización. La clínica puede registrar pagos contra esas cuotas y consultar el saldo pendiente por paciente.

**Archivos que se tocan:** nueva app `apps/cartera/` o extensión de `apps/cotizaciones/`, `config/urls.py`.

**Modelos:**
```python
class Cartera(models.Model):
    cotizacion    = models.OneToOneField('cotizaciones.Cotizacion', on_delete=models.CASCADE, related_name='cartera')
    paciente      = models.ForeignKey('pacientes.Paciente', on_delete=models.CASCADE, related_name='cartera')  # desnormalizado
    total         = models.DecimalField(max_digits=14, decimal_places=2)  # snapshot de cotizacion.total
    created_at    = models.DateTimeField(auto_now_add=True)

    @property
    def total_pagado(self):
        return self.cuotas.filter(pagada=True).aggregate(s=Sum('valor_pagado'))['s'] or Decimal('0')

    @property
    def saldo_pendiente(self):
        return self.total - self.total_pagado


class CuotaCartera(models.Model):
    TIPOS = ['efectivo', 'transferencia', 'cuotas', 'financiamiento']
    cartera          = models.ForeignKey(Cartera, on_delete=models.CASCADE, related_name='cuotas')
    tipo             = models.CharField(max_length=30)
    descripcion      = models.CharField(max_length=200, blank=True)
    valor_esperado   = models.DecimalField(max_digits=14, decimal_places=2)
    fecha_esperada   = models.DateField(null=True, blank=True)
    pagada           = models.BooleanField(default=False)
    valor_pagado     = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    fecha_pago       = models.DateField(null=True, blank=True)
    medio_pago       = models.CharField(max_length=50, blank=True)
    observaciones    = models.CharField(max_length=300, blank=True)
    registrado_por   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at       = models.DateTimeField(auto_now=True)
```

**Creación automática de `Cartera`:**
En `CotizacionViewSet.cambiar_estado`, cuando `estado → aceptada`:
```python
if nuevo_estado == 'aceptada':
    cartera = Cartera.objects.create(
        cotizacion=cotizacion,
        paciente=cotizacion.paciente,
        total=cotizacion.total,
    )
    for fp in cotizacion.formas_pago.all():
        CuotaCartera.objects.create(
            cartera=cartera,
            tipo=fp.tipo,
            descripcion=fp.descripcion,
            valor_esperado=fp.valor,
            fecha_esperada=fp.fecha,
        )
```

**Endpoints:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/cartera/` | Listado de carteras de la clínica |
| GET    | `/cartera/{id}/` | Detalle con cuotas y saldos |
| GET    | `/cartera/?paciente=<uuid>` | Cartera de un paciente específico |
| PATCH  | `/cartera/cuotas/{id}/registrar_pago/` | Registrar pago contra una cuota |
| GET    | `/cartera/resumen/` | Totales de cartera por estado |

**Body `registrar_pago`:**
```json
{
  "valor_pagado": 350000,
  "fecha_pago": "2026-06-01",
  "medio_pago": "transferencia",
  "observaciones": "Nequi - ref 123456"
}
```

Validación: `valor_pagado` no puede superar `valor_esperado`. Si supera → `400 {"error": "El valor pagado supera el valor esperado de la cuota.", "code": "PAGO_EXCEDE_CUOTA"}`.

**Definition of done:**
- [ ] `Cartera` + `CuotaCartera` con migración aplicada
- [ ] Al transicionar cotización a `aceptada` se crea `Cartera` y sus `CuotaCartera` automáticamente
- [ ] `GET /cartera/` lista con `total`, `total_pagado`, `saldo_pendiente`, filtro por `paciente` y `estado` (pendiente/pagada/vencida)
- [ ] `GET /cartera/{id}/` detalle completo con cuotas
- [ ] `PATCH /cartera/cuotas/{id}/registrar_pago/` registra pago y marca `pagada=True`
- [ ] `GET /cartera/resumen/` devuelve totales agregados para el dashboard
- [ ] Scoping por clínica

**Contrato — `GET /cartera/`:**
```json
[
  {
    "id": "uuid",
    "cotizacion_id": "uuid",
    "paciente_id": "uuid",
    "paciente_nombre": "Kelly Atencia",
    "total": "1400000.00",
    "total_pagado": "350000.00",
    "saldo_pendiente": "1050000.00",
    "cuotas_total": 4,
    "cuotas_pagadas": 1,
    "proxima_cuota_fecha": "2026-07-01",
    "proxima_cuota_valor": "350000.00",
    "created_at": "2026-05-26T10:00:00Z"
  }
]
```

**Contrato — `GET /cartera/{id}/`:**
```json
{
  "id": "uuid",
  "cotizacion_id": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "total": "1400000.00",
  "total_pagado": "350000.00",
  "saldo_pendiente": "1050000.00",
  "cuotas": [
    {
      "id": "uuid",
      "tipo": "transferencia",
      "descripcion": "Cuota 1",
      "valor_esperado": "350000.00",
      "fecha_esperada": "2026-06-01",
      "pagada": true,
      "valor_pagado": "350000.00",
      "fecha_pago": "2026-05-30",
      "medio_pago": "transferencia",
      "observaciones": "Nequi ref 123456"
    },
    {
      "id": "uuid",
      "tipo": "transferencia",
      "descripcion": "Cuota 2",
      "valor_esperado": "350000.00",
      "fecha_esperada": "2026-07-01",
      "pagada": false,
      "valor_pagado": null,
      "fecha_pago": null,
      "medio_pago": "",
      "observaciones": ""
    }
  ]
}
```

**Contrato — `GET /cartera/resumen/`:**
```json
{
  "total_cartera": "15400000.00",
  "total_cobrado": "6200000.00",
  "saldo_pendiente": "9200000.00",
  "cuotas_vencidas": 3,
  "cuotas_vencidas_valor": "1050000.00"
}
```
Una cuota está **vencida** cuando `pagada=False` y `fecha_esperada < hoy`.

---

#### H23 — Módulo de Ingresos: unificación de cobros y pagos de cartera

**Motivación:** el módulo de `Cobros` registra pagos por citas pero no tiene visibilidad de abonos a cotizaciones. El módulo de `Cartera` marca cuotas como pagadas pero no genera ningún registro financiero trazable. El resultado es que no existe un libro de caja unificado. Este hito transforma `Cobros` en el módulo de **Ingresos**, capaz de registrar todo el dinero que entra a la clínica independientemente de su origen.

**Estrategia:** extender el modelo `Cobro` con un campo `origen` y una FK nullable a `Cotizacion`. Cuando se registra el pago de una cuota de cartera, el backend crea automáticamente un `Cobro` de `origen=cotizacion` como efecto secundario, de modo que todos los ingresos quedan en un solo modelo y un solo listado.

**Archivos que se tocan:** `apps/cobros/models.py`, `apps/cobros/serializers.py`, `apps/cobros/views.py`, `apps/cartera/views.py`, nueva migración.

---

**Paso 1 — Extender el modelo `Cobro`:**

```python
class Cobro(models.Model):
    ORIGEN_CITA        = 'cita'
    ORIGEN_COTIZACION  = 'cotizacion'
    ORIGEN_LIBRE       = 'libre'
    ORIGEN_CHOICES = [
        (ORIGEN_CITA,       'Por cita'),
        (ORIGEN_COTIZACION, 'Por cotización / plan'),
        (ORIGEN_LIBRE,      'Ingreso libre'),
    ]

    # Campo nuevo
    origen      = models.CharField(max_length=20, choices=ORIGEN_CHOICES, default='cita')
    cotizacion  = models.ForeignKey(
        'cotizaciones.Cotizacion',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='cobros',
    )

    # Campos existentes (sin cambios)
    cita        = models.ForeignKey('agenda.Cita', on_delete=models.SET_NULL, null=True, blank=True)
    paciente    = models.ForeignKey('pacientes.Paciente', on_delete=models.CASCADE)
    profesional = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    sede        = models.ForeignKey('clinicas.Sede', on_delete=models.SET_NULL, null=True, blank=True)
    fecha       = models.DateField(default=date.today)
    subtotal    = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento   = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total       = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    saldo_pendiente = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    estado      = models.CharField(max_length=20, default='pendiente')
    notas       = models.TextField(blank=True)
```

Reglas de validación en el serializer:
- Si `origen=cita`: `cita` requerido, `cotizacion` debe ser null.
- Si `origen=cotizacion`: `cotizacion` requerido, `cita` debe ser null. No se validan `ItemCobro` (pueden estar vacíos).
- Si `origen=libre`: `cita` y `cotizacion` opcionales.

El campo `total` para `origen=cotizacion` es la suma de `PagoRecibido.valor` registrados en ese cobro (ya que no hay ítems).

---

**Paso 2 — Nuevo endpoint en `Cobro`:**

```
GET  /cobros/cobros/?origen=cita|cotizacion|libre   — filtro por origen
GET  /cobros/cobros/?fecha_desde=&fecha_hasta=       — rango de fechas
GET  /cobros/cobros/?paciente=<uuid>
GET  /cobros/cobros/?cotizacion=<uuid>               — nuevo filtro
```

El `CobroSerializer` expone además:
```json
"origen": "cotizacion",
"cotizacion": "uuid",
"cotizacion_numero": "COT-0043"
```

---

**Paso 3 — Modificar `PATCH /cartera/cuotas/{id}/registrar_pago/`:**

Cuando se registra el pago de una cuota, además de marcar `pagada=True` en la cuota, el endpoint ahora:

1. Busca o crea un `Cobro` asociado a esa cotización con `origen=cotizacion`:
   - Si ya existe un `Cobro` abierto para esa cotización → agrega un `PagoRecibido` a ese cobro.
   - Si no existe → crea uno nuevo con `origen=cotizacion`, `cotizacion=cuota.cartera.cotizacion`, `paciente`, `sede`.
2. Crea el `PagoRecibido` con `valor`, `medio_pago`, `referencia`, `fecha` recibidos.
3. Actualiza `total` y `saldo_pendiente` del `Cobro`.
4. Actualiza `total_pagado` y `saldo_pendiente` de la `Cartera`.

La respuesta devuelve tanto la cuota actualizada como el cobro generado:
```json
{
  "cuota": { ...CuotaCartera... },
  "cobro_id": "uuid-del-cobro-generado"
}
```

---

**Paso 4 — Nuevo endpoint de resumen de ingresos:**

```
GET /cobros/resumen/
```

```json
{
  "hoy": {
    "total": "850000.00",
    "por_cita": "500000.00",
    "por_cotizacion": "350000.00",
    "por_libre": "0.00"
  },
  "mes_actual": {
    "total": "12400000.00",
    "por_cita": "8200000.00",
    "por_cotizacion": "4200000.00",
    "por_libre": "0.00"
  }
}
```

---

**Migración de datos:** los `Cobro` existentes (que no tienen `origen`) deben migrarse con `origen='cita'` y `cotizacion=None`. Escribir una migración de datos que haga `Cobro.objects.update(origen='cita')` antes de añadir el constraint.

---

**Definition of done:**
- [ ] Campo `origen` + FK `cotizacion` en `Cobro` con migración aplicada
- [ ] Migración de datos: todos los cobros existentes quedan con `origen='cita'`
- [ ] `CobroSerializer` expone `origen`, `cotizacion`, `cotizacion_numero`
- [ ] `GET /cobros/cobros/` acepta filtro `origen` y `cotizacion`
- [ ] `PATCH /cartera/cuotas/{id}/registrar_pago/` crea/actualiza un `Cobro` de `origen=cotizacion`
- [ ] La respuesta de `registrarPago` incluye `cobro_id`
- [ ] `GET /cobros/resumen/` devuelve totales del día y del mes por origen
- [ ] Los cobros existentes por cita no se ven afectados

**Contrato — `GET /cobros/cobros/` (ítem actualizado):**
```json
{
  "id": "uuid",
  "origen": "cotizacion",
  "cotizacion": "uuid",
  "cotizacion_numero": "COT-0043",
  "cita": null,
  "paciente": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "profesional_nombre": null,
  "sede_nombre": "Sede Norte",
  "fecha": "2026-05-27",
  "total": "700000.00",
  "saldo_pendiente": "0.00",
  "estado": "pagado",
  "pagos": [
    {
      "id": "uuid",
      "medio_pago": "transferencia",
      "valor": "700000.00",
      "referencia": "TXN-8821",
      "fecha": "2026-05-27"
    }
  ]
}
```

---

#### H24 — Historial de envíos y simplificación de estados de cotización

**Motivación:** el estado `enviada` mezcla una acción de comunicación (se mandó al paciente) con el ciclo de vida del documento. El negocio solo necesita saber si la cotización fue aprobada o venció; el historial de "cuándo y cómo se compartió" es un log operativo separado. Además, `rechazada` se elimina porque en la práctica las cotizaciones se descartan simplemente venciendo o borrando el borrador — no hay un flujo formal de rechazo.

**Resultado final:** estados `borrador | aceptada | vencida`. El envío (WhatsApp, email, PDF descargado) queda registrado en `CotizacionEnvio` sin alterar el estado de la cotización.

**Archivos que se tocan:** `apps/cotizaciones/models.py`, `apps/cotizaciones/views.py`, `apps/cotizaciones/serializers.py`, `config/urls.py`, nueva migración.

---

**Paso 1 — Nuevo modelo `CotizacionEnvio`:**

```python
class CotizacionEnvio(models.Model):
    CANALES = [
        ('whatsapp', 'WhatsApp'),
        ('email',    'Correo electrónico'),
        ('pdf',      'PDF descargado'),
    ]
    cotizacion   = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='envios')
    canal        = models.CharField(max_length=20, choices=CANALES)
    destinatario = models.CharField(max_length=200, blank=True)  # teléfono o email
    enviado_por  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    notas        = models.CharField(max_length=300, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
```

---

**Paso 2 — Cambios en `Cotizacion`:**

```python
# Antes:
ESTADOS = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']

# Después:
ESTADOS = ['borrador', 'aceptada', 'vencida']
```

- Migración de datos: registros existentes con `estado='enviada'` → `estado='borrador'`; `estado='rechazada'` → `estado='vencida'` (o borrado lógico según criterio de negocio).
- `cambiar_estado` acepta solo: `borrador → aceptada`, cualquier estado → `vencida` (tarea periódica).

---

**Paso 3 — Refactorizar `POST /cotizaciones/{id}/enviar_whatsapp/`:**

- Ya no cambia `estado` a `enviada`.
- Envía el PDF al webhook de n8n igual que antes.
- Al éxito: crea `CotizacionEnvio(canal='whatsapp', destinatario=paciente.telefono, enviado_por=request.user)`.
- Response: `{ "enviado": true, "envio_id": "<uuid>" }`.

---

**Paso 4 — Nuevo endpoint `POST /cotizaciones/{id}/enviar_email/`:**

```json
// Request body
{
  "destinatario": "paciente@email.com",   // opcional; fallback: paciente.email
  "notas": "Adjunto cotización #123"       // opcional
}
```

Lógica:
1. Genera PDF de la cotización (reutiliza lógica de `GET /cotizaciones/{id}/pdf/`).
2. Adjunta el PDF y envía vía `POST /notificaciones/emails/enviar/` con asunto "Cotización [N] — [Clínica]".
3. Crea `CotizacionEnvio(canal='email', destinatario=..., enviado_por=request.user)`.
4. Response: `{ "enviado": true, "envio_id": "<uuid>" }`.
5. Error si la clínica no tiene email configurado: `400 {"error": "...", "code": "EMAIL_NO_CONFIGURADO"}`.

---

**Paso 5 — Nuevo endpoint `POST /cotizaciones/{id}/registrar_envio/`** (PDF descargado desde frontend):

```json
// Request body
{
  "canal": "pdf",
  "notas": ""   // opcional
}
```

Crea `CotizacionEnvio` con `canal='pdf'` y `enviado_por=request.user`. Útil para mantener el log cuando el usuario descarga el PDF manualmente.

---

**Paso 6 — Nuevo endpoint `GET /cotizaciones/{id}/envios/`:**

Devuelve lista de `CotizacionEnvio` ordenados por `created_at` desc:

```json
[
  {
    "id": "uuid",
    "canal": "whatsapp",
    "destinatario": "+573001234567",
    "enviado_por_nombre": "Dr. García",
    "notas": "",
    "created_at": "2026-05-27T10:30:00Z"
  }
]
```

---

**Definition of done — H24:**

- [ ] Migración crea tabla `cotizaciones_cotizacionenvio`
- [ ] Migración de datos convierte estados `enviada` → `borrador` y `rechazada` → `vencida`
- [ ] `cambiar_estado` solo acepta `borrador→aceptada`; rechaza intentos de `enviada` o `rechazada` con `400`
- [ ] `POST /cotizaciones/{id}/enviar_whatsapp/` ya no cambia estado; crea `CotizacionEnvio`
- [ ] `POST /cotizaciones/{id}/enviar_email/` implementado con adjunto PDF
- [ ] `POST /cotizaciones/{id}/registrar_envio/` implementado
- [ ] `GET /cotizaciones/{id}/envios/` expone historial ordenado
- [ ] `GET /cotizaciones/{id}/` incluye campo `envios` (o `ultimo_envio`) en el serializer detalle
- [ ] Serializer de `Cotizacion` expone solo estados válidos en choices

**Contrato que se entrega al frontend — H24:**

```
POST /cotizaciones/{id}/enviar_whatsapp/
  → { "enviado": true, "envio_id": "uuid" }

POST /cotizaciones/{id}/enviar_email/
  body: { "destinatario"?: string, "notas"?: string }
  → { "enviado": true, "envio_id": "uuid" }

POST /cotizaciones/{id}/registrar_envio/
  body: { "canal": "pdf", "notas"?: string }
  → { "id": "uuid", "canal": "pdf", "created_at": "..." }

GET /cotizaciones/{id}/envios/
  → CotizacionEnvio[]

EstadoCotizacion: 'borrador' | 'aceptada' | 'vencida'
cambiar_estado solo acepta: { "estado": "aceptada" }
```

---

---

### Fase B4.3 — Historia clínica enriquecida: signos vitales, antecedentes estructurados, datos de atención y configuración de tabs

> Esta fase nace del análisis de sistemas clínicos especializados. Los 4 hitos son independientes entre sí y pueden implementarse en paralelo.

---

#### H8.7 — Signos vitales con campos configurables por clínica

**Motivación:** el profesional necesita registrar parámetros fisiológicos en cada atención y visualizar su evolución temporal en la historia del paciente. Adicionalmente, cada clínica puede tener campos propios (p.ej. una estética puede registrar "Porcentaje de grasa corporal"). Los signos vitales son inmutables post-registro (igual que las notas clínicas).

**Archivos:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, `apps/historia_clinica/views.py`, `apps/configuracion/models.py`, nuevas migraciones.

**Nuevo modelo `SignosVitales`:**
```python
class SignosVitales(models.Model):
    historia             = ForeignKey(HistoriaClinica, on_delete=CASCADE, related_name='signos_vitales')
    cita                 = ForeignKey('agenda.Cita', on_delete=SET_NULL, null=True, blank=True)
    peso_kg              = DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    altura_cm            = DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    imc                  = DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, editable=False)
    tension_sistolica    = SmallIntegerField(null=True, blank=True)   # mmHg
    tension_diastolica   = SmallIntegerField(null=True, blank=True)
    frecuencia_cardiaca  = SmallIntegerField(null=True, blank=True)   # ppm
    frecuencia_respiratoria = SmallIntegerField(null=True, blank=True)  # rpm
    temperatura_c        = DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    saturacion_oxigeno   = DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)  # %
    campos_adicionales   = JSONField(default=list, blank=True)
    # Estructura: [{"nombre": "Grasa corporal", "valor": "22", "unidad": "%"}]
    registrado_por       = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL, null=True)
    created_at           = DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if self.peso_kg and self.altura_cm and self.altura_cm > 0:
            self.imc = round(float(self.peso_kg) / (float(self.altura_cm) / 100) ** 2, 2)
        super().save(*args, **kwargs)
```

**Nuevo modelo `ConfiguracionSignosVitales`** (en `apps/configuracion/`):
```python
class ConfiguracionSignosVitales(models.Model):
    clinica          = OneToOneField(Clinica, on_delete=CASCADE, related_name='config_signos')
    campos_extra     = JSONField(default=list, blank=True)
    # Estructura: [{"nombre": "Grasa corporal", "unidad": "%", "orden": 1}]
```

**Endpoints:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/historia-clinica/signos-vitales/?historia=<id>` | Lista registros (desc por fecha) |
| POST   | `/historia-clinica/signos-vitales/` | Registra signo vital |
| DELETE | `/historia-clinica/signos-vitales/{id}/` | Elimina (solo admin) |
| GET    | `/historia-clinica/historias/{id}/evolucion-signos/` | Serie temporal por campo |
| GET    | `/configuracion/signos-vitales/` | Campos extra configurados |
| PATCH  | `/configuracion/signos-vitales/` | Actualiza campos extra (solo admin) |

**Respuesta `/evolucion-signos/`:**
```json
{
  "campos": ["peso_kg", "tension_sistolica", "tension_diastolica", "imc"],
  "series": [
    {
      "fecha": "2026-01-10T10:00:00Z",
      "peso_kg": 62.5,
      "tension_sistolica": 120,
      "tension_diastolica": 70,
      "imc": 23.1
    }
  ]
}
```

**Definition of done:**
- [ ] Modelo y migración aplicados; IMC calculado automáticamente en `save()`
- [ ] `POST /signos-vitales/` registra con `registrado_por=request.user`
- [ ] `GET /signos-vitales/?historia=` lista con paginación
- [ ] `GET /historias/{id}/evolucion-signos/` devuelve series temporales para los campos con datos
- [ ] `campos_adicionales` persiste y se devuelve en el serializer
- [ ] `ConfiguracionSignosVitales` CRUD operativo; `GET /configuracion/signos-vitales/` devuelve lista de campos extra (vacía si no configurados)
- [ ] Scoping por clínica

**Contrato que se entrega al frontend — H8.7:**
```json
// POST /historia-clinica/signos-vitales/
// Request:
{ "historia": "uuid", "cita": "uuid|null", "peso_kg": 62.5, "altura_cm": 165, "tension_sistolica": 120, "tension_diastolica": 70, "campos_adicionales": [] }
// Response:
{ "id": "uuid", "peso_kg": "62.50", "imc": "22.97", "tension_sistolica": 120, "created_at": "..." }

// GET /historia-clinica/historias/{id}/evolucion-signos/
{ "campos": ["peso_kg", "imc"], "series": [{"fecha": "...", "peso_kg": 62.5, "imc": 22.97}] }

// GET /configuracion/signos-vitales/
{ "campos_extra": [{"nombre": "Grasa corporal", "unidad": "%", "orden": 1}] }
```

---

#### H8.8 — Antecedentes clínicos estructurados con sub-categorías y sub-tabs

**Motivación:** el modelo actual de `AntecedentePaciente` usa campos de texto libre genéricos. Los sistemas clínicos especializados organizan los antecedentes en categorías (toxicológicos, patológicos, quirúrgicos, farmacológicos, alérgicos) y sub-tabs (personales, ginecoobstétricos, familiares). Esta estructura mejora la usabilidad del profesional y la integridad del dato.

**Archivos:** `apps/pacientes/models.py`, `apps/pacientes/serializers.py`, nueva migración.

**Cambios en `AntecedentePaciente` — nuevos campos (todos opcionales para no romper datos):**
```python
# ── Toxicológicos ──────────────────────────────────────────────────
toxicologicos_tabaquismo  = BooleanField(default=False)
toxicologicos_alcohol     = BooleanField(default=False)
toxicologicos_drogas      = BooleanField(default=False)
toxicologicos_otros       = TextField(blank=True, default='')

# ── Patológicos (renombrado; mantener condiciones_medicas como alias) ─
patologicos               = TextField(blank=True, default='')  # HTA, DM, etc.

# ── Quirúrgicos ────────────────────────────────────────────────────
quirurgicos               = TextField(blank=True, default='')  # cirugías previas con año

# ── Farmacológicos (renombrado; mantener medicamentos_actuales) ───
# medicamentos_actuales ya existe → se mantiene por compatibilidad

# ── Ginecoobstétricos (solo mujeres) ──────────────────────────────
ginecoobstetricos        = JSONField(null=True, blank=True)
# Estructura: {"formula_obstetrica": "G2P1A1", "fecha_ultima_menstruacion": "2026-04-01",
#              "metodo_anticonceptivo": "DIU", "menopausia": false, "observaciones": ""}

# ── Familiares ─────────────────────────────────────────────────────
familiares               = TextField(blank=True, default='')   # antecedentes heredofamiliares
```

**Migración de datos:** los campos existentes `condiciones_medicas` y `medicamentos_actuales` se mantienen y quedan como aliases. En el serializer se exponen bajo el nombre nuevo (`patologicos`, `farmacologicos`) pero se persisten en el campo original por compatibilidad.

**Serializer actualizado** — expone todos los campos organizados en secciones:
```json
{
  "paciente": "uuid",
  "personales": {
    "toxicologicos": { "tabaquismo": false, "alcohol": true, "drogas": false, "otros": "Cannabis ocasional" },
    "patologicos": "Hipertensión arterial controlada",
    "quirurgicos": "Rinoplastia 2018",
    "farmacologicos": "Losartán 50mg/día",
    "alergicos": "Penicilina, látex",
    "contraindicaciones": "No aplicar toxina en área periocular",
    "tipo_piel": "II",
    "antecedentes_esteticos": "Rellenos labiales 2023"
  },
  "ginecoobstetricos": {
    "formula_obstetrica": "G2P1A1",
    "fecha_ultima_menstruacion": "2026-04-01",
    "metodo_anticonceptivo": "DIU",
    "menopausia": false,
    "observaciones": ""
  },
  "familiares": "Madre: HTA, DM tipo 2. Padre: cardiopatía.",
  "updated_at": "2026-05-01T10:00:00Z"
}
```

El endpoint existente `PUT/PATCH /pacientes/{id}/antecedentes/` acepta este formato anidado.

**Definition of done:**
- [ ] Migración aplicada; todos los campos nuevos `blank=True`/`default=''` para no romper datos existentes
- [ ] `GET/PUT/PATCH /pacientes/{id}/antecedentes/` devuelve y acepta el formato anidado nuevo
- [ ] Campos `condiciones_medicas` y `medicamentos_actuales` mantienen compatibilidad hacia atrás
- [ ] `ginecoobstetricos` puede ser `null` (para pacientes masculinos o no configurados)
- [ ] Scoping por clínica

**Contrato que se entrega al frontend — H8.8:**
```json
// GET /pacientes/{id}/antecedentes/
{
  "paciente": "uuid",
  "personales": {
    "toxicologicos": { "tabaquismo": true, "alcohol": false, "drogas": false, "otros": "" },
    "patologicos": "HTA",
    "quirurgicos": "",
    "farmacologicos": "Losartán 50mg",
    "alergicos": "Penicilina",
    "contraindicaciones": "",
    "tipo_piel": "II",
    "antecedentes_esteticos": ""
  },
  "ginecoobstetricos": null,
  "familiares": "",
  "updated_at": "2026-05-01T10:00:00Z"
}
```

---

#### H8.9 — Campos administrativos de atención en NotaClinica (RIPS Colombia)

**Motivación:** los sistemas de historia clínica en Colombia requieren registrar datos administrativos de cada atención (modalidad, causa externa, vía de ingreso, etc.) que forman parte de los reportes RIPS obligatorios. Estos campos permiten además una mejor clasificación de las atenciones (primera vez vs. control, consulta externa vs. domicilio).

**Archivos:** `apps/historia_clinica/models.py`, `apps/historia_clinica/serializers.py`, nueva migración.

**Cambios en `NotaClinica` — nuevos campos (todos opcionales):**
```python
MODALIDAD_CHOICES = [
    ('intramural',   'Intramural'),
    ('extramural',   'Extramural'),
    ('telemedicina', 'Telemedicina'),
    ('domiciliaria', 'Domiciliaria'),
]
TIPO_CONSULTA_CHOICES = [
    ('primera_vez', 'Primera Vez'),
    ('control',     'Control'),
    ('urgencia',    'Urgencia'),
    ('otro',        'Otro'),
]
CAUSA_EXTERNA_CHOICES = [
    ('enfermedad_general',    'Enfermedad General'),
    ('accidente_trabajo',     'Accidente de Trabajo'),
    ('accidente_transito',    'Accidente de Tránsito'),
    ('lesion_fisica',         'Lesión Física'),
    ('otro',                  'Otro'),
]
VIA_INGRESO_CHOICES = [
    ('espontaneo',              'Espontáneo'),
    ('remitido',                'Remitido'),
    ('derivado_consulta',       'Derivado de Consulta Externa'),
    ('otro',                    'Otro'),
]
LUGAR_ATENCION_CHOICES = [
    ('institucional', 'Institucional'),
    ('domicilio',     'Domicilio'),
    ('via_publica',   'Vía Pública'),
    ('otro',          'Otro'),
]

modalidad_consulta  = CharField(max_length=20, choices=MODALIDAD_CHOICES, blank=True, null=True)
tipo_consulta       = CharField(max_length=20, choices=TIPO_CONSULTA_CHOICES, blank=True, null=True)
causa_externa       = CharField(max_length=30, choices=CAUSA_EXTERNA_CHOICES, blank=True, null=True)
via_ingreso         = CharField(max_length=30, choices=VIA_INGRESO_CHOICES, blank=True, null=True)
lugar_atencion      = CharField(max_length=20, choices=LUGAR_ATENCION_CHOICES, blank=True, null=True)
consecutivo_consulta = PositiveIntegerField(null=True, blank=True)
# Auto-calculado al crear: count de notas previas del paciente + 1
```

El campo `consecutivo_consulta` se calcula automáticamente en `create()` del serializer (no acepta valor del cliente).

**Definition of done:**
- [ ] Migración aplicada; todos los campos `null=True, blank=True` para no romper notas existentes
- [ ] `POST /historia-clinica/notas/` acepta los nuevos campos opcionalmente
- [ ] `GET /historia-clinica/notas/{id}/` los incluye en la respuesta
- [ ] `consecutivo_consulta` se calcula en `create()` del serializer
- [ ] Las choices son validadas por DRF

**Contrato que se entrega al frontend — H8.9:**
```json
// POST /historia-clinica/notas/ — campos nuevos opcionales
{
  "historia": "uuid",
  "tipo": "procedimiento",
  "modalidad_consulta": "intramural",
  "tipo_consulta": "control",
  "causa_externa": "enfermedad_general",
  "via_ingreso": "espontaneo",
  "lugar_atencion": "institucional",
  "anamnesis": "..."
}

// GET /historia-clinica/notas/{id}/ — respuesta
{
  "modalidad_consulta": "intramural",
  "tipo_consulta": "primera_vez",
  "causa_externa": "enfermedad_general",
  "via_ingreso": "espontaneo",
  "lugar_atencion": "institucional",
  "consecutivo_consulta": 3
}

// Choices disponibles (para el frontend):
// GET /historia-clinica/notas/choices/ → { "modalidad_consulta": [...], "tipo_consulta": [...], ... }
```

---

#### H8.10 — Configuración de historia clínica: tabs activos por clínica

**Motivación:** cada clínica usa la historia clínica de forma distinta. Una clínica de estética puede no necesitar el tab de "Órdenes Médicas". Un centro de rehabilitación puede no necesitar "Fotos". El admin de la clínica debe poder activar/desactivar tabs sin tocar código.

**Archivos:** `apps/configuracion/models.py`, `apps/configuracion/serializers.py`, `apps/configuracion/views.py`, nueva migración.

**Nuevo modelo `ConfiguracionHistoria`:**
```python
TABS_DISPONIBLES = [
    'datos-generales',
    'motivo-consulta',
    'antecedentes',
    'examenes',
    'plan-manejo',
    'ordenes',
    'fotos',
]

class ConfiguracionHistoria(models.Model):
    clinica      = OneToOneField(Clinica, on_delete=CASCADE, related_name='config_historia')
    tabs_activos = JSONField(default=list, blank=True)
    # Lista de slugs activos. Lista vacía = todos activos (comportamiento por defecto).
    updated_at   = DateTimeField(auto_now=True)
```

**Endpoints:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/configuracion/historia/` | Devuelve config actual (crea defaults si no existe) |
| PATCH  | `/configuracion/historia/` | Actualiza `tabs_activos` |

**Respuesta `GET /configuracion/historia/`:**
```json
{
  "tabs_activos": ["datos-generales", "motivo-consulta", "antecedentes", "examenes", "plan-manejo", "ordenes", "fotos"],
  "tabs_disponibles": [
    { "slug": "datos-generales",  "label": "Datos Generales",     "activo": true,  "obligatorio": true  },
    { "slug": "motivo-consulta",  "label": "Motivo de Consulta",  "activo": true,  "obligatorio": false },
    { "slug": "antecedentes",     "label": "Antecedentes",        "activo": true,  "obligatorio": false },
    { "slug": "examenes",         "label": "Exámenes",            "activo": true,  "obligatorio": false },
    { "slug": "plan-manejo",      "label": "Plan de Manejo",      "activo": true,  "obligatorio": false },
    { "slug": "ordenes",          "label": "Órdenes Médicas",     "activo": true,  "obligatorio": false },
    { "slug": "fotos",            "label": "Fotos",               "activo": true,  "obligatorio": false }
  ],
  "updated_at": "2026-05-26T10:00:00Z"
}
```

El tab `datos-generales` es `obligatorio: true` — no puede desactivarse.

**Request `PATCH /configuracion/historia/`:**
```json
{ "tabs_activos": ["datos-generales", "antecedentes", "fotos"] }
```

**Validaciones:**
- `datos-generales` siempre debe estar en `tabs_activos`; si no viene, se añade automáticamente.
- Solo slugs de `TABS_DISPONIBLES` son aceptados; ignorar valores inválidos con warning.
- Solo `admin` puede hacer `PATCH`.

**Definition of done:**
- [ ] Modelo y migración aplicados
- [ ] `GET /configuracion/historia/` crea el objeto con todos los tabs si no existe y devuelve la lista completa
- [ ] `PATCH /configuracion/historia/` valida slugs; fuerza `datos-generales`
- [ ] Cualquier usuario autenticado puede hacer `GET`; solo admin puede hacer `PATCH`
- [ ] Scoping por clínica

**Contrato que se entrega al frontend — H8.10:**
```json
// PATCH /configuracion/historia/
// Request: { "tabs_activos": ["datos-generales", "antecedentes", "fotos"] }
// Response: { "tabs_activos": [...], "tabs_disponibles": [...], "updated_at": "..." }
```

---

---

## H25 — Protocolos de tratamiento y check-in de presencia

### Contexto

Cada servicio puede tener una secuencia de pasos nombrados y ordenados (el "protocolo"). Cuando una cotización se acepta, el sistema crea automáticamente una instancia de ese protocolo para el paciente. El profesional, durante la cita, selecciona qué paso del protocolo está ejecutando. La asistencia del paciente se verifica con OTP por WhatsApp (primario) o foto en tiempo real (fallback).

Módulo nuevo: `apps/protocolos/`. Extensión al modelo `Servicio` en `apps/clinicas/`.

### Corrección de diseño — Consentimientos por servicio (no por tratamiento)

> **Este sub-hito reemplaza y anula la lógica de `Servicio.requiere_consentimiento`, `Servicio.documenso_template_token` y `Servicio.documenso_template_nombre` definida en H9.1 y H9.4.**

Un tratamiento puede requerir uno o más consentimientos según los procedimientos que incluya. El vínculo no es 1-a-1 (un servicio → un template) sino M2M (un servicio → varios templates Documenso). Los pasos del protocolo son texto libre; los consentimientos son una lista configurable independiente.

---

### H25.0 — M2M consentimientos requeridos por servicio

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, nueva migración en clinicas.

**Modelo intermedio `ServicioConsentimiento`** en `apps/clinicas/models.py`:

```python
class ServicioConsentimiento(models.Model):
    servicio  = ForeignKey('Servicio',  on_delete=CASCADE, related_name='consentimientos_requeridos_set')
    template  = ForeignKey('configuracion.DocumensoConsentimientoTemplate',
                           on_delete=PROTECT, related_name='servicios_que_lo_requieren')
    orden     = PositiveIntegerField(default=1)

    class Meta:
        db_table        = 'servicios_consentimientos'
        unique_together = [['servicio', 'template']]
        ordering        = ['orden']
```

**Cambios en `Servicio`:**
```python
# Eliminar:
requiere_consentimiento   = BooleanField(...)       # reemplazado por: consentimientos_requeridos.exists()
documenso_template_token  = CharField(...)           # reemplazado por M2M
documenso_template_nombre = CharField(...)           # reemplazado por M2M

# Agregar:
consentimientos_requeridos = ManyToManyField(
    'configuracion.DocumensoConsentimientoTemplate',
    through='ServicioConsentimiento',
    blank=True,
    related_name='servicios',
)
```

> Migración de datos: si `Servicio.documenso_template_token` tiene valor, buscar el `DocumensoConsentimientoTemplate` correspondiente y crear el registro M2M.

**`ServicioSerializer` — campos actualizados:**
```python
# Eliminar: requiere_consentimiento, documenso_template_token, documenso_template_nombre

# Agregar (read):
consentimientos_requeridos = SerializerMethodField()
# → lista de {id, tipo, label, template_token, activo} de cada template asociado

# Para escribir: endpoint dedicado de gestión (ver abajo)
```

**Endpoints de gestión de consentimientos del servicio:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/clinicas/servicios/{id}/consentimientos/` | Lista los templates requeridos con orden |
| POST   | `/clinicas/servicios/{id}/consentimientos/` | Vincula un template al servicio `{template_id, orden}` |
| DELETE | `/clinicas/servicios/{id}/consentimientos/{template_id}/` | Desvincula el template |
| POST   | `/clinicas/servicios/{id}/consentimientos/reordenar/` | Recibe `[{template_id, orden}]` |

Permisos: GET → IsAuthenticated; resto → IsAdmin.

**`consentimiento_info` en `CitaSerializer` — nuevo formato (reemplaza el de H9.4):**

```python
def get_consentimiento_info(self, cita):
    templates = cita.servicio.consentimientos_requeridos.filter(activo=True)
    if not templates.exists():
        return {"todos_firmados": True, "consentimientos": []}

    hoy  = timezone.now().date()
    resultado = []
    todos_firmados = True

    for tmpl in templates:
        consent = ConsentimientoInformado.objects.filter(
            paciente_id=cita.paciente_id,
            documenso_template_token=tmpl.template_token,
            firmado=True,
        ).filter(
            Q(fecha_vencimiento__isnull=True) | Q(fecha_vencimiento__gte=hoy)
        ).first()

        vigente = consent is not None
        if not vigente:
            todos_firmados = False

        resultado.append({
            "template_token":  tmpl.template_token,
            "template_nombre": tmpl.documenso_template_nombre,
            "vigente":         vigente,
            "consentimiento_id": str(consent.id) if consent else None,
        })

    return {"todos_firmados": todos_firmados, "consentimientos": resultado}
```

**Guard en `cambiar_estado → en_curso` — actualizado:**
```python
# Antes: verificaba UN solo tipo de consentimiento
# Ahora: falla si consentimiento_info.todos_firmados == False

info = get_consentimiento_info(cita)
if not info["todos_firmados"]:
    pendientes = [c["template_nombre"] for c in info["consentimientos"] if not c["vigente"]]
    return Response({
        "error": "El paciente tiene consentimientos pendientes de firma.",
        "code": "CONSENTIMIENTO_REQUERIDO",
        "pendientes": pendientes,
    }, status=400)
```

**Definition of done:**
- [ ] `ServicioConsentimiento` y migración aplicados
- [ ] `Servicio.requiere_consentimiento`, `documenso_template_token` y `documenso_template_nombre` eliminados (migración de datos preserva la relación existente)
- [ ] `GET /clinicas/servicios/{id}/` expone `consentimientos_requeridos` como lista
- [ ] CRUD `/clinicas/servicios/{id}/consentimientos/` operativo
- [ ] `CitaSerializer.consentimiento_info` devuelve lista con `todos_firmados`
- [ ] Guard en `en_curso` verifica todos los consentimientos pendientes y lista sus nombres
- [ ] Un servicio con 0 consentimientos requeridos pasa el guard sin error

**Prompt para AI:**
```
Implementa el hito H25.0 en apps/clinicas/ y apps/agenda/ siguiendo las convenciones del proyecto.

1. En apps/clinicas/models.py:
   - Crea ServicioConsentimiento(servicio FK, template FK a DocumensoConsentimientoTemplate,
     orden PositiveIntegerField). Meta: unique_together, ordering=['orden'].
   - En Servicio: agrega consentimientos_requeridos ManyToManyField through=ServicioConsentimiento.
   - Elimina (o depreca con alias) requiere_consentimiento, documenso_template_token,
     documenso_template_nombre.
   - Migración de datos: si documenso_template_token tiene valor, crear registro
     ServicioConsentimiento correspondiente.

2. En apps/clinicas/serializers.py — ServicioSerializer:
   - Elimina los tres campos antiguos.
   - Añade consentimientos_requeridos = SerializerMethodField →
     [{id, template_token, template_nombre: tmpl.documenso_template_nombre, activo}]
     usando obj.consentimientos_requeridos_set.select_related('template').

3. En apps/clinicas/views.py — ServicioViewSet:
   - @action GET 'consentimientos/': lista ServicioConsentimiento del servicio.
   - @action POST 'consentimientos/': crea ServicioConsentimiento {template_id, orden}.
   - @action DELETE 'consentimientos/{template_id}/': elimina el registro.
   - @action POST 'consentimientos/reordenar/': [{template_id, orden}] en transacción atómica.

4. En apps/agenda/serializers.py — CitaSerializer:
   - Reemplaza get_consentimiento_info() con la nueva implementación de lista descrita arriba.
   - El queryset de CitaViewSet debe usar select_related y prefetch_related para
     servicio.consentimientos_requeridos para evitar N+1.

5. En apps/agenda/views.py — CitaViewSet.cambiar_estado():
   - Reemplaza el guard de consentimiento único con el guard de lista descrito.
   - El error 400 ahora incluye "pendientes": [lista de nombres de templates sin firmar].

6. Crea la migración.
```

**Contrato actualizado que se entrega al frontend — H25.0:**
```json
// GET /clinicas/servicios/{id}/
{
  "id": "uuid",
  "nombre": "Manchas Plus",
  "tiene_protocolo": true,
  "consentimientos_requeridos": [
    { "id": "uuid", "template_token": "abc123", "template_nombre": "Consentimiento Láser IPL",  "activo": true },
    { "id": "uuid", "template_token": "xyz789", "template_nombre": "Consentimiento Mesoterapia", "activo": true }
  ]
}

// GET /agenda/citas/{id}/ — campo consentimiento_info actualizado
{
  "consentimiento_info": {
    "todos_firmados": false,
    "consentimientos": [
      { "template_token": "abc123", "template_nombre": "Consentimiento Láser IPL",  "vigente": true,  "consentimiento_id": "uuid" },
      { "template_token": "xyz789", "template_nombre": "Consentimiento Mesoterapia", "vigente": false, "consentimiento_id": null  }
    ]
  }
}

// POST /agenda/citas/{id}/cambiar_estado/ con estado=en_curso — error posible
{
  "error": "El paciente tiene consentimientos pendientes de firma.",
  "code": "CONSENTIMIENTO_REQUERIDO",
  "pendientes": ["Consentimiento Mesoterapia"]
}
```

---

### H25.1 — Modelo PasoProtocolo (configuración de pasos por servicio)

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, nueva migración en clinicas.

**Nuevo modelo `PasoProtocolo`** en `apps/clinicas/models.py`:

```python
class PasoProtocolo(models.Model):
    servicio    = ForeignKey('Servicio', on_delete=CASCADE, related_name='pasos_protocolo')
    orden       = PositiveIntegerField()
    nombre      = CharField(max_length=255)
    semana      = PositiveIntegerField(null=True, blank=True)
    # Agrupa pasos por semana para protocolos como "Piernas de Impacto" (semanas 1-6).
    # Si es null, el protocolo no usa agrupación semanal.
    es_control  = BooleanField(default=False)
    activo      = BooleanField(default=True)
    created_at  = DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'pasos_protocolo'
        ordering        = ['orden']
        unique_together = [['servicio', 'orden']]
```

**Campo nuevo en `Servicio`:**
```python
tiene_protocolo = BooleanField(default=False)
# True automáticamente cuando el servicio tiene al menos un PasoProtocolo activo.
# Actualizado por signal post_save/post_delete en PasoProtocolo.
```

**Serializer `PasoProtocoloSerializer`:**
```
id, servicio (uuid, write-only en create), orden, nombre, semana, es_control, activo, created_at
```
Validación: `orden` debe ser único por servicio (el serializer reordena si se recibe un orden ya ocupado).

**Endpoints (nested bajo servicio):**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET    | `/clinicas/servicios/{id}/pasos/` | Lista pasos del servicio en orden |
| POST   | `/clinicas/servicios/{id}/pasos/` | Crea paso |
| PATCH  | `/clinicas/servicios/{id}/pasos/{paso_id}/` | Edita nombre, orden, semana, es_control, activo |
| DELETE | `/clinicas/servicios/{id}/pasos/{paso_id}/` | Soft-delete (`activo=False`); no borra físico si existen sesiones vinculadas |
| POST   | `/clinicas/servicios/{id}/pasos/reordenar/` | Recibe `[{id, orden}]` y aplica el nuevo orden en una transacción atómica |

**Permisos:** GET → IsAuthenticated; POST/PATCH/DELETE → IsAdmin.

**Definition of done:**
- [ ] Modelo y migración aplicados
- [ ] `GET /clinicas/servicios/{id}/` expone `tiene_protocolo` y `pasos_protocolo` (lista anidada, read-only)
- [ ] CRUD de pasos operativo con unique_together validado
- [ ] `reordenar/` aplica el orden atómicamente
- [ ] Soft-delete bloquea si el paso tiene sesiones vinculadas con `estado != pendiente`
- [ ] Signal actualiza `Servicio.tiene_protocolo` al crear o desactivar pasos

**Prompt para AI:**
```
Implementa el hito H25.1 en apps/clinicas/ siguiendo las convenciones del proyecto.

1. En apps/clinicas/models.py — crea PasoProtocolo:
   - servicio = ForeignKey(Servicio, on_delete=CASCADE, related_name='pasos_protocolo')
   - orden = PositiveIntegerField()
   - nombre = CharField(max_length=255)
   - semana = PositiveIntegerField(null=True, blank=True)
   - es_control = BooleanField(default=False)
   - activo = BooleanField(default=True)
   - created_at = DateTimeField(auto_now_add=True)
   - Meta: db_table='pasos_protocolo', ordering=['orden'], unique_together=[['servicio','orden']]
   Agrega tiene_protocolo = BooleanField(default=False) a Servicio.
   Signal post_save y post_delete en PasoProtocolo: actualizar Servicio.tiene_protocolo=True si existe
   algún PasoProtocolo activo para ese servicio, False si no hay ninguno.

2. En apps/clinicas/serializers.py:
   - Crea PasoProtocoloSerializer con todos los campos. Valida que orden >= 1.
   - En ServicioSerializer: añade tiene_protocolo (read-only) y pasos_protocolo (SerializerMethodField
     → PasoProtocoloSerializer(many=True, read_only=True) filtrando activo=True, ordenados por orden).

3. En apps/clinicas/views.py — agrega en ServicioViewSet:
   - @action GET 'pasos/' y POST 'pasos/' para listar y crear pasos del servicio.
   - @action PATCH y DELETE 'pasos/{paso_id}/' para editar y desactivar.
   - @action POST 'pasos/reordenar/': recibe [{id, orden}]; aplica en transacción atómica.
   - Permisos: GET IsAuthenticated; resto IsAdmin.

4. Registra las nuevas actions en urls.py.

5. Crea la migración.
```

**Contrato que se entrega al frontend — H25.1:**
```json
// GET /clinicas/servicios/{id}/
{
  "id": "uuid",
  "nombre": "Manchas Plus",
  "tiene_protocolo": true,
  "pasos_protocolo": [
    {"id": "uuid", "orden": 1,  "nombre": "CONSULTA DRA.",                          "semana": null, "es_control": false, "activo": true},
    {"id": "uuid", "orden": 2,  "nombre": "LIMPIEZA + TOMA DE FOTOGRAFÍA",          "semana": null, "es_control": false, "activo": true},
    {"id": "uuid", "orden": 3,  "nombre": "LASER IPL + TERAPIA FOTODINAMICA",       "semana": null, "es_control": false, "activo": true},
    {"id": "uuid", "orden": 4,  "nombre": "CONTROL Y REVISION",                     "semana": null, "es_control": true,  "activo": true}
  ]
}

// POST /clinicas/servicios/{id}/pasos/reordenar/
// Request: [{"id": "uuid-paso-3", "orden": 2}, {"id": "uuid-paso-2", "orden": 3}]
// Response: 200 {"ok": true}
```

---

### H25.2 — Modelos TratamientoPaciente y SesionProcedimiento

**Archivos que se crean:** `apps/protocolos/models.py`, `apps/protocolos/apps.py`, migración.

**Nueva app `apps/protocolos/`**.

```python
# apps/protocolos/models.py

class TratamientoPaciente(models.Model):
    ESTADO_CHOICES = [
        ('activo',      'Activo'),
        ('completado',  'Completado'),
        ('abandonado',  'Abandonado'),
    ]
    paciente         = ForeignKey('pacientes.Paciente',     on_delete=PROTECT, related_name='tratamientos')
    servicio         = ForeignKey('clinicas.Servicio',      on_delete=PROTECT)
    cotizacion_item  = ForeignKey('cotizaciones.ItemCotizacion', on_delete=SET_NULL,
                                  null=True, blank=True, related_name='tratamiento')
    estado           = CharField(max_length=20, choices=ESTADO_CHOICES, default='activo')
    fecha_inicio     = DateField()
    activo           = BooleanField(default=True)
    created_at       = DateTimeField(auto_now_add=True)
    updated_at       = DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tratamientos_paciente'
        ordering = ['-fecha_inicio']

    @property
    def total_pasos(self):
        return self.sesiones.count()

    @property
    def pasos_completados(self):
        return self.sesiones.filter(estado='completado').count()

    @property
    def progreso_pct(self):
        if self.total_pasos == 0:
            return 0
        return round((self.pasos_completados / self.total_pasos) * 100)


class SesionProcedimiento(models.Model):
    ESTADO_CHOICES = [
        ('pendiente',     'Pendiente'),
        ('completado',    'Completado'),
        ('inasistencia',  'Inasistencia'),
    ]
    CHECKIN_METODO_CHOICES = [
        ('otp_whatsapp',   'OTP WhatsApp'),
        ('foto_presencial', 'Foto presencial'),
    ]
    tratamiento      = ForeignKey(TratamientoPaciente, on_delete=CASCADE, related_name='sesiones')
    paso             = ForeignKey('clinicas.PasoProtocolo', on_delete=PROTECT)
    cita             = ForeignKey('agenda.Cita', on_delete=SET_NULL, null=True, blank=True,
                                  related_name='sesiones_protocolo')
    estado           = CharField(max_length=20, choices=ESTADO_CHOICES, default='pendiente')
    fecha            = DateField(null=True, blank=True)
    hora             = TimeField(null=True, blank=True)
    profesional      = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL,
                                  null=True, blank=True, related_name='sesiones_ejecutadas')
    observaciones    = TextField(blank=True)
    # Check-in de presencia
    checkin_metodo   = CharField(max_length=20, choices=CHECKIN_METODO_CHOICES, null=True, blank=True)
    checkin_en       = DateTimeField(null=True, blank=True)
    checkin_ip       = GenericIPAddressField(null=True, blank=True)
    foto_presencia   = ImageField(upload_to='checkin/%Y/%m/', null=True, blank=True)
    foto_presencia_url = CharField(max_length=2048, blank=True)  # URL firmada MinIO
    created_at       = DateTimeField(auto_now_add=True)
    updated_at       = DateTimeField(auto_now=True)

    class Meta:
        db_table = 'sesiones_procedimiento'
        ordering = ['paso__orden']

    @property
    def checkin_verificado(self):
        return self.checkin_metodo is not None


class CheckinOTP(models.Model):
    """Tabla efímera — se purga al verificar o al vencer. DELETE físico permitido."""
    sesion    = OneToOneField(SesionProcedimiento, on_delete=CASCADE, related_name='otp')
    codigo    = CharField(max_length=6)
    expira_en = DateTimeField()
    usado     = BooleanField(default=False)
    intentos  = PositiveIntegerField(default=0)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'checkin_otps'

    def esta_vigente(self):
        return not self.usado and self.expira_en > now() and self.intentos < 3
```

**Definition of done:**
- [ ] App `protocolos` registrada en `INSTALLED_APPS`
- [ ] Modelos y migración aplicados
- [ ] `TratamientoPaciente.progreso_pct` correcto en edge cases (0 pasos, 0 completados)
- [ ] `SesionProcedimiento.checkin_verificado` es una property calculada, no un campo almacenado
- [ ] `CheckinOTP` se bloquea con `esta_vigente()` tras 3 intentos fallidos
- [ ] `foto_presencia_url` se genera con MinIO igual que `FotoClinica`

**Prompt para AI:**
```
Implementa el hito H25.2: crea la app apps/protocolos/ con los modelos descritos.

1. Crea la estructura base de la app: __init__.py, apps.py, models.py, serializers.py, views.py, urls.py, admin.py.

2. En apps/protocolos/models.py — crea TratamientoPaciente, SesionProcedimiento y CheckinOTP
   exactamente como se describen en el plan.
   - TratamientoPaciente: FK a Paciente, Servicio, ItemCotizacion (null). estado, fecha_inicio, activo.
     Properties: total_pasos, pasos_completados, progreso_pct.
   - SesionProcedimiento: FK a TratamientoPaciente, PasoProtocolo, Cita (null), User (profesional, null).
     estado (pendiente/completado/inasistencia). Campos de check-in: checkin_metodo, checkin_en,
     checkin_ip, foto_presencia, foto_presencia_url. Property: checkin_verificado.
   - CheckinOTP: OneToOneField a SesionProcedimiento. codigo (6 chars), expira_en, usado, intentos.
     Método esta_vigente(): not usado and expira_en > now() and intentos < 3.

3. En apps/protocolos/admin.py: registra los tres modelos con campos descriptivos en list_display.

4. Registra la app en config/settings.py INSTALLED_APPS.

5. Genera la migración 0001_initial.
```

---

### H25.3 — API REST de protocolos y check-in

**Archivos que se tocan:** `apps/protocolos/serializers.py`, `apps/protocolos/views.py`, `apps/protocolos/urls.py`, `apps/protocolos/services.py`.

**Serializers:**

`TratamientoPacienteSerializer`:
```
id, paciente (uuid), paciente_nombre (read), servicio (uuid), servicio_nombre (read),
cotizacion_item (uuid|null), estado, fecha_inicio, activo,
total_pasos, pasos_completados, progreso_pct,
sesiones: [SesionProcedimientoSerializer] (nested, read-only)
```

`SesionProcedimientoSerializer`:
```
id, tratamiento (uuid), paso (uuid), paso_nombre (read: paso.nombre), paso_orden (read: paso.orden),
paso_semana (read: paso.semana), paso_es_control (read: paso.es_control),
cita (uuid|null), estado, fecha, hora, profesional (uuid|null), profesional_nombre (read),
observaciones, checkin_verificado (read), checkin_metodo (read), checkin_en (read),
foto_presencia_url (read — URL firmada MinIO o null)
```

**ViewSets y endpoints:**

`TratamientoPacienteViewSet` (ModelViewSet):
- Permisos: list/retrieve → IsAuthenticated; create/update → IsAdminOrRecepcion; destroy → IsAdmin
- Filtros: `paciente`, `servicio`, `estado`, `activo`
- Scoping por clínica: `filter(paciente__clinica=request.user.clinica)`
- `retrieve`: incluye `sesiones` anidadas completas
- `list`: excluye `sesiones` (solo totales) para performance

`SesionProcedimientoViewSet` (acciones únicamente, sin list/retrieve propio):

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/protocolos/sesiones/{id}/marcar_completado/` | Marca sesión como completada |
| POST | `/protocolos/sesiones/{id}/marcar_inasistencia/` | Registra inasistencia |
| POST | `/protocolos/sesiones/{id}/iniciar_checkin/` | Genera OTP y lo envía por WhatsApp vía n8n |
| POST | `/protocolos/sesiones/{id}/verificar_otp/` | Valida el código de 6 dígitos |
| POST | `/protocolos/sesiones/{id}/checkin_foto/` | Sube foto de presencia (multipart) |

**Lógica de `marcar_completado`:**
```
Recibe: { cita_id?, profesional_id?, observaciones?, fecha?, hora? }
- Si no vienen fecha/hora, usar now()
- Actualiza SesionProcedimiento.estado = 'completado'
- Vincula cita y profesional si se proveen
- Si TratamientoPaciente.cotizacion_item existe → actualizar citas_completadas en ItemCotizacion
  (ItemCotizacion.citas_completadas = sesiones completadas en este tratamiento)
- Si pasos_completados == total_pasos → actualizar TratamientoPaciente.estado = 'completado'
- Retorna la sesión serializada
```

**Lógica de `iniciar_checkin`** en `apps/protocolos/services.py`:
```python
def iniciar_checkin_otp(sesion: SesionProcedimiento, request_ip: str) -> CheckinOTP:
    """
    Genera un OTP de 6 dígitos, invalida el anterior si existe, y lo envía
    por WhatsApp al paciente via n8n. Expira en 10 minutos.
    """
    # Borrar OTP anterior si existe y no está usado
    CheckinOTP.objects.filter(sesion=sesion, usado=False).delete()
    
    codigo = f"{random.randint(0, 999999):06d}"
    otp = CheckinOTP.objects.create(
        sesion=sesion,
        codigo=codigo,
        expira_en=now() + timedelta(minutes=10),
    )
    # Dispatch a n8n webhook — igual que enviar_recordatorio en apps/notificaciones/services.py
    # Mensaje: "Tu código de entrada a {clinica} es: {codigo} (válido 10 min)"
    enviar_otp_whatsapp(sesion.tratamiento.paciente, codigo)
    return otp
```

**Lógica de `verificar_otp`:**
```
Recibe: { codigo: "472183" }
- Busca CheckinOTP activo para la sesión
- Si no existe → 400 {"error": "No hay código activo", "code": "OTP_NOT_FOUND"}
- Si esta_vigente() == False → 400 {"error": "Código expirado o bloqueado", "code": "OTP_EXPIRED"}
- Si codigo != otp.codigo → incrementar intentos; 400 {"error": "Código incorrecto", "code": "OTP_INVALID"}
- Si coincide → marcar otp.usado=True; actualizar sesion.checkin_metodo='otp_whatsapp',
  checkin_en=now(), checkin_ip=request_ip; borrar registro OTP; retornar sesión actualizada
```

**Lógica de `checkin_foto`:**
```
Recibe: multipart con campo 'foto'
- Validar que sea imagen (jpeg/png, máx 5MB)
- Subir a MinIO en ruta 'checkin/{año}/{mes}/{uuid}.jpg'
- Generar URL firmada (expiración 24h) → guardar en foto_presencia_url
- Actualizar sesion.checkin_metodo='foto_presencial', checkin_en=now(), checkin_ip
- Retornar sesión actualizada
```

**services.py — helpers adicionales:**
```python
def crear_tratamiento_desde_cotizacion(cotizacion_item) -> TratamientoPaciente | None:
    """
    Llamado cuando una cotización pasa a estado 'aceptada'.
    Si el servicio del ítem tiene pasos de protocolo, crea TratamientoPaciente
    con SesionProcedimiento para cada PasoProtocolo activo.
    Retorna el tratamiento o None si el servicio no tiene protocolo.
    """
```

**Definition of done:**
- [ ] `GET /protocolos/tratamientos/?paciente=<uuid>` devuelve tratamientos con `progreso_pct`
- [ ] `GET /protocolos/tratamientos/{id}/` incluye `sesiones` anidadas
- [ ] `marcar_completado` actualiza `citas_completadas` en `ItemCotizacion` si corresponde
- [ ] `iniciar_checkin` envía WhatsApp vía n8n y retorna `{"otp_enviado": true, "expira_en": "..."}`
- [ ] `verificar_otp` bloquea tras 3 intentos; borra el OTP al verificar exitosamente
- [ ] `checkin_foto` sube a MinIO y genera URL firmada con TTL 24h
- [ ] Rate limit: `iniciar_checkin` no permite enviar nuevo OTP si el anterior aún es vigente (retorna `{"otp_activo": true, "expira_en": "..."}` con 200)
- [ ] Scoping: solo sesiones de pacientes de la clínica del usuario

**Prompt para AI:**
```
Implementa el hito H25.3 en apps/protocolos/ siguiendo las convenciones del proyecto.

1. En apps/protocolos/serializers.py — crea:
   - SesionProcedimientoSerializer: campos descritos. foto_presencia_url es read-only.
     checkin_verificado = SerializerMethodField → bool(obj.checkin_metodo is not None).
   - TratamientoPacienteSerializer: campos del modelo + total_pasos, pasos_completados, progreso_pct
     como SerializerMethodFields. sesiones = SesionProcedimientoSerializer(many=True, read_only=True).
   - TratamientoPacienteListSerializer: igual pero sin sesiones (para list endpoint).

2. En apps/protocolos/services.py — implementa:
   - iniciar_checkin_otp(sesion, request_ip): genera OTP de 6 dígitos con random.randint,
     crea CheckinOTP con expira_en=now()+10min, llama a servicio de notificaciones para WhatsApp.
   - verificar_otp(sesion, codigo, request_ip): lógica de validación descrita.
   - registrar_checkin_foto(sesion, archivo, request_ip): sube a MinIO, genera URL firmada, actualiza sesión.
   - marcar_sesion_completada(sesion, cita=None, profesional=None, observaciones='', fecha=None, hora=None).
   - crear_tratamiento_desde_cotizacion(cotizacion_item): crea TratamientoPaciente + N SesionProcedimiento.

3. En apps/protocolos/views.py — implementa:
   - TratamientoPacienteViewSet (ModelViewSet): list usa ListSerializer sin sesiones;
     retrieve usa Serializer con sesiones; filtros paciente/servicio/estado/activo.
   - SesionProcedimientoViewSet: solo acciones, no list/retrieve propias.
     marcar_completado: POST, llama services.marcar_sesion_completada.
     marcar_inasistencia: POST {observaciones?}, actualiza estado='inasistencia'.
     iniciar_checkin: POST, llama services.iniciar_checkin_otp; si OTP aún vigente retorna 200 con otp_activo=true.
     verificar_otp: POST {codigo}, llama services.verificar_otp.
     checkin_foto: POST multipart {foto}, llama services.registrar_checkin_foto.

4. En apps/protocolos/urls.py — registra ambos ViewSets con DefaultRouter.
   Prefijos: tratamientos/, sesiones/

5. En config/urls.py — incluye apps/protocolos/urls.py bajo api/v1/protocolos/.
```

**Contrato que se entrega al frontend — H25.3:**
```json
// GET /protocolos/tratamientos/?paciente=<uuid>
[
  {
    "id": "uuid",
    "paciente": "uuid",
    "paciente_nombre": "María García",
    "servicio": "uuid",
    "servicio_nombre": "Manchas Plus",
    "cotizacion_item": "uuid",
    "estado": "activo",
    "fecha_inicio": "2026-05-01",
    "total_pasos": 13,
    "pasos_completados": 3,
    "progreso_pct": 23
  }
]

// GET /protocolos/tratamientos/{id}/
{
  "id": "uuid",
  ...campos anteriores...,
  "sesiones": [
    {
      "id": "uuid",
      "paso": "uuid",
      "paso_nombre": "CONSULTA DRA.",
      "paso_orden": 1,
      "paso_semana": null,
      "paso_es_control": false,
      "cita": "uuid",
      "estado": "completado",
      "fecha": "2026-05-01",
      "hora": "10:00:00",
      "profesional_nombre": "Dra. González",
      "observaciones": "",
      "checkin_verificado": true,
      "checkin_metodo": "otp_whatsapp",
      "checkin_en": "2026-05-01T10:02:00Z",
      "foto_presencia_url": null
    },
    {
      "id": "uuid",
      "paso_nombre": "LASER IPL + TERAPIA FOTODINAMICA",
      "paso_orden": 3,
      "estado": "pendiente",
      "checkin_verificado": false,
      "checkin_metodo": null
    }
  ]
}

// POST /protocolos/sesiones/{id}/iniciar_checkin/
// Response si OTP enviado exitosamente:
{ "otp_enviado": true, "expira_en": "2026-05-28T11:15:00Z" }
// Response si OTP anterior aún vigente:
{ "otp_activo": true, "expira_en": "2026-05-28T11:15:00Z" }

// POST /protocolos/sesiones/{id}/verificar_otp/
// Request: { "codigo": "472183" }
// Response 200: SesionProcedimientoSerializer (estado actualizado)
// Response 400: { "error": "Código incorrecto", "code": "OTP_INVALID", "intentos_restantes": 2 }

// POST /protocolos/sesiones/{id}/checkin_foto/
// Request: multipart { "foto": <archivo> }
// Response 200: SesionProcedimientoSerializer con foto_presencia_url
```

---

### H25.4 — Auto-creación de tratamiento al aceptar cotización

**Archivos que se tocan:** `apps/cotizaciones/signals.py` (o `apps/cotizaciones/views.py`), `apps/protocolos/services.py`.

**Motivación:** al aceptar una cotización, si algún ítem tiene un servicio con protocolo configurado (`Servicio.tiene_protocolo=True`), el sistema debe crear automáticamente el `TratamientoPaciente` y todas sus `SesionProcedimiento` en estado `pendiente`.

**Lógica (signal `post_save` en `Cotizacion`):**
```python
@receiver(post_save, sender=Cotizacion)
def crear_tratamientos_al_aceptar(sender, instance, **kwargs):
    if instance.estado != 'aceptada':
        return
    # Solo ejecutar cuando cambia a aceptada (no en cada save)
    if instance._estado_anterior == 'aceptada':
        return
    from apps.protocolos.services import crear_tratamiento_desde_cotizacion
    for item in instance.items.select_related('servicio__pasos_protocolo').all():
        if item.servicio.tiene_protocolo:
            crear_tratamiento_desde_cotizacion(item)
```

La función `crear_tratamiento_desde_cotizacion` en `apps/protocolos/services.py`:
1. Verifica que no exista ya un `TratamientoPaciente` para ese `cotizacion_item` (idempotente).
2. Crea `TratamientoPaciente(paciente=cotizacion.paciente, servicio=item.servicio, cotizacion_item=item, fecha_inicio=today)`.
3. Para cada `PasoProtocolo` activo del servicio (ordenado por `orden`): crea `SesionProcedimiento(tratamiento=t, paso=paso, estado='pendiente')`.
4. Retorna el tratamiento creado.

**Definition of done:**
- [ ] Al aceptar una cotización con servicios con protocolo, se crean `TratamientoPaciente` + `SesionProcedimiento`
- [ ] La operación es idempotente: llamarla dos veces no duplica el tratamiento
- [ ] Si el servicio no tiene protocolo, no se crea nada (sin error)
- [ ] Los tratamientos creados son visibles inmediatamente en `GET /protocolos/tratamientos/?paciente=`

**Prompt para AI:**
```
Implementa el hito H25.4: auto-creación de tratamientos al aceptar cotización.

1. En apps/cotizaciones/models.py (o signals.py):
   - Sobrescribe save() en Cotizacion para capturar el estado anterior:
     def __init__(self, *args, **kwargs): super().__init__(*args, **kwargs); self._estado_anterior = self.estado
   - Agrega signal post_save: si estado=='aceptada' y _estado_anterior != 'aceptada',
     itera los ítems de la cotización y llama crear_tratamiento_desde_cotizacion(item) para cada uno
     cuyo servicio tenga tiene_protocolo=True.

2. En apps/protocolos/services.py — implementa crear_tratamiento_desde_cotizacion(cotizacion_item):
   - Guard: si TratamientoPaciente.objects.filter(cotizacion_item=cotizacion_item).exists() → return None
   - cotizacion = cotizacion_item.cotizacion
   - Crea TratamientoPaciente(paciente=cotizacion.paciente, servicio=cotizacion_item.servicio,
     cotizacion_item=cotizacion_item, fecha_inicio=date.today())
   - Para cada PasoProtocolo activo del servicio (orden ascendente):
     crea SesionProcedimiento(tratamiento=tratamiento, paso=paso, estado='pendiente')
   - Retorna el tratamiento creado.
   Toda la operación en transaction.atomic().
```

---

### H25.5 — PDF exportable de historia del protocolo

**Archivos que se tocan:** `apps/protocolos/views.py`, templates WeasyPrint nuevos.

**Endpoint:**

| Método | URL | Descripción |
|--------|-----|-------------|
| GET | `/protocolos/tratamientos/{id}/pdf/` | Genera y descarga el PDF de la historia del protocolo |

**Formato del PDF** (igual al diseño de los formularios adjuntos por el cliente):
- Header: logo de la clínica, "HISTORIA CLÍNICA", nombre de la Dra.
- Título del tratamiento: nombre del servicio
- Tabla de sesiones: columnas Procedimiento · Fecha · Hora · Firma Profesional · Firma Paciente
  - Cada fila es un `SesionProcedimiento`. Si está completado: fecha, hora, nombre del profesional.
  - Si tiene check-in: indica método (OTP ✓ o Foto ✓) en la columna de firma del paciente.
  - Si está pendiente: celdas vacías.
- Pie: sección "Inasistencias" solo si existen sesiones con `estado='inasistencia'`

**Implementación:** WeasyPrint con template HTML en `templates/protocolos/historia_protocolo.html`.

**Definition of done:**
- [ ] `GET /protocolos/tratamientos/{id}/pdf/` devuelve `Content-Type: application/pdf`
- [ ] PDF incluye todos los pasos con estado (completado / pendiente / inasistencia)
- [ ] Logo de la clínica aparece si está configurado
- [ ] Inasistencias agrupadas al final si existen
- [ ] Solo usuarios de la misma clínica pueden descargar el PDF

---

**Contrato final que se entrega al frontend — H25:**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/clinicas/servicios/{id}/pasos/` | GET, POST | Pasos del protocolo del servicio |
| `/clinicas/servicios/{id}/pasos/{paso_id}/` | PATCH, DELETE | Editar / desactivar paso |
| `/clinicas/servicios/{id}/pasos/reordenar/` | POST | Reordenar pasos |
| `/protocolos/tratamientos/` | GET, POST | Tratamientos activos; crear manual |
| `/protocolos/tratamientos/{id}/` | GET, PATCH | Detalle con sesiones anidadas |
| `/protocolos/tratamientos/{id}/pdf/` | GET | PDF descargable de historia |
| `/protocolos/sesiones/{id}/marcar_completado/` | POST | Marcar paso como ejecutado |
| `/protocolos/sesiones/{id}/marcar_inasistencia/` | POST | Registrar inasistencia |
| `/protocolos/sesiones/{id}/iniciar_checkin/` | POST | Generar y enviar OTP WhatsApp |
| `/protocolos/sesiones/{id}/verificar_otp/` | POST | Validar código OTP |
| `/protocolos/sesiones/{id}/checkin_foto/` | POST | Subir foto de presencia |

---

---

#### H2.4 — Impersonación de usuarios (solo superadmin)

**Motivación:** el superadmin necesita poder acceder al sistema como si fuera un usuario específico de una clínica para diagnosticar problemas, verificar configuraciones y dar soporte sin pedir credenciales al cliente. La sesión impersonada es completamente transparente (mismos tokens, mismos permisos del usuario objetivo) y queda registrada en auditoría.

**Archivos que se tocan:** `apps/users/views.py` (o `apps/auth_/views.py`), `apps/users/urls.py`, nueva tabla de auditoría opcional.

**Endpoint:**

| Método | URL | Descripción |
|--------|-----|-------------|
| POST | `/auth/impersonate/{user_id}/` | Genera tokens JWT para el usuario objetivo; solo superadmin |

**Request:** sin body (el `user_id` va en la URL).

**Response (200):**
```json
{
  "access": "<jwt-access-token-del-usuario-objetivo>",
  "refresh": "<jwt-refresh-token-del-usuario-objetivo>",
  "user": {
    "id": "uuid",
    "email": "usuario@clinica.com",
    "nombre_completo": "Ana García",
    "rol": "profesional",
    "clinica_id": "uuid",
    "clinica_nombre": "Clínica XYZ",
    ...
  }
}
```

**Lógica:**
1. Verificar que `request.user.rol == 'superadmin'` → 403 si no.
2. Buscar el `User` objetivo por `user_id` → 404 si no existe.
3. Generar un par de tokens JWT para el usuario objetivo usando `RefreshToken.for_user(target_user)`.
4. Serializar el usuario objetivo con el mismo serializador que usa `/auth/me/`.
5. Retornar `{ access, refresh, user }`.
6. (Opcional) Registrar en tabla de auditoría: `{ impersonador: request.user, objetivo: target_user, timestamp }`.

**Errores:**

| Código HTTP | `code` | Cuándo |
|-------------|--------|--------|
| 403 | `SUPERADMIN_REQUIRED` | El usuario autenticado no es superadmin |
| 404 | `USER_NOT_FOUND` | No existe usuario con ese `user_id` |
| 400 | `CANNOT_IMPERSONATE_SELF` | El superadmin intenta impersonarse a sí mismo |

**Permisos:** `IsAuthenticated`. La guarda de superadmin se hace dentro de la vista, no con una permission class genérica, para devolver el código de error correcto.

**Definition of done:**
- [ ] `POST /auth/impersonate/{user_id}/` responde con `{ access, refresh, user }` válidos para el usuario objetivo
- [ ] Retorna 403 si el caller no es superadmin
- [ ] Retorna 404 si el `user_id` no existe
- [ ] Retorna 400 si el superadmin intenta impersonarse a sí mismo
- [ ] Los tokens generados pasan por el flujo normal de refresh (`/auth/refresh/`) sin errores
- [ ] El endpoint no está disponible desde el cliente web para usuarios no-superadmin (la validación es solo del lado backend)

**Prompt para AI:**
```
Implementa el hito H2.4 en la app de autenticación/usuarios del proyecto Django.

1. En la view (apps/users/views.py o donde viva el resto del auth):
   - Crea ImpersonateUserView(APIView) con permission_classes = [IsAuthenticated].
   - En post(self, request, user_id):
     a. Si request.user.rol != 'superadmin' → 403 {"error": "...", "code": "SUPERADMIN_REQUIRED"}
     b. Si str(request.user.id) == str(user_id) → 400 {"error": "...", "code": "CANNOT_IMPERSONATE_SELF"}
     c. target = get_object_or_404(User, id=user_id)
     d. refresh = RefreshToken.for_user(target)
     e. user_data = AuthUserSerializer(target, context={'request': request}).data
     f. Retornar Response({"access": str(refresh.access_token), "refresh": str(refresh), "user": user_data})
   - Usar el mismo AuthUserSerializer que usa /auth/me/.

2. En urls.py — registrar:
   path('auth/impersonate/<uuid:user_id>/', ImpersonateUserView.as_view())

3. No hay cambios en modelos ni migraciones (opcional: tabla de auditoría si el proyecto ya tiene patrón de audit log).
```

**Contrato que se entrega al frontend — H2.4:**
```
POST /auth/impersonate/{user_id}/
Authorization: Bearer <superadmin-token>

Response 200:
{
  "access": "eyJ...",
  "refresh": "eyJ...",
  "user": { ...mismo shape que /auth/me/... }
}
```

---

#### H25 — Cantidad de sesiones por paso de protocolo

**Motivación:** algunos tratamientos repiten el mismo procedimiento N veces (ej. "Aplicación de láser × 6 sesiones"). Hoy cada `PasoProtocolo` genera exactamente 1 `SesionProcedimiento` al iniciar un tratamiento. Este hito agrega el campo `cantidad` al paso para que genere N sesiones, y expone `sesion_numero` en cada sesión para que el frontend pueda agruparlas y mostrar progreso por paso.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/protocolos/models.py`, `apps/protocolos/serializers.py`, `apps/protocolos/views.py`, nueva migración.

---

**Paso 1 — Campo `cantidad` en `PasoProtocolo`:**

```python
class PasoProtocolo(models.Model):
    ...
    cantidad = models.PositiveIntegerField(default=1)
    # Impacto: al iniciar un TratamientoPaciente se crean `cantidad` instancias
    # de SesionProcedimiento para este paso.
```

Migración: `cantidad` con `default=1` — retrocompatible, ningún dato existente cambia.

---

**Paso 2 — Campo `sesion_numero` en `SesionProcedimiento`:**

```python
class SesionProcedimiento(models.Model):
    ...
    sesion_numero = models.PositiveIntegerField(default=1)
    # 1-indexed: si el paso tiene cantidad=4, se crean sesiones con
    # sesion_numero=1,2,3,4. Si cantidad=1, siempre 1.
```

---

**Paso 3 — Lógica de creación de sesiones al iniciar tratamiento:**

```python
# En TratamientoPacienteViewSet o señal post_save del Tratamiento:
def crear_sesiones(tratamiento):
    pasos = PasoProtocolo.objects.filter(
        servicio=tratamiento.servicio, activo=True
    ).order_by('orden')
    
    sesiones = []
    for paso in pasos:
        for i in range(1, paso.cantidad + 1):
            sesiones.append(SesionProcedimiento(
                tratamiento=tratamiento,
                paso=paso,
                sesion_numero=i,
            ))
    SesionProcedimiento.objects.bulk_create(sesiones)
```

---

**Paso 4 — Campo `total_pasos` en `TratamientoPaciente`:**

```python
# Antes:
total_pasos = pasos.count()

# Después:
total_pasos = pasos.aggregate(total=Sum('cantidad'))['total'] or 0
```

El campo `pasos_completados` y `progreso_pct` siguen contando sesiones completadas (no pasos), lo que ahora corresponde a `total_pasos`.

---

**Paso 5 — Serializer `SesionProcedimiento`:**

Exponer los nuevos campos en el serializer de detalle:
```python
fields = [..., 'sesion_numero', 'paso_cantidad']  # paso_cantidad = read_only desde paso.cantidad
```

`paso_cantidad` es un campo derivado (read_only) del `paso` relacionado, para que el frontend sepa cuántas sesiones tiene el paso sin necesidad de cargar el protocolo.

---

**Definition of done — H25:**

- [ ] Migración agrega `PasoProtocolo.cantidad` (default 1) y `SesionProcedimiento.sesion_numero` (default 1)
- [ ] `POST /clinicas/servicios/{id}/pasos/` acepta `cantidad`
- [ ] `PATCH /clinicas/servicios/{id}/pasos/{pasoId}/` acepta `cantidad`
- [ ] Al iniciar tratamiento se generan `paso.cantidad` sesiones por paso, con `sesion_numero` 1..N
- [ ] `TratamientoPaciente.total_pasos` = suma de `cantidad` de todos los pasos
- [ ] `SesionProcedimiento` serializer expone `sesion_numero` y `paso_cantidad`
- [ ] Tratamientos existentes no se rompen (cantidad default 1 = mismo comportamiento actual)

**Contrato que se entrega al frontend — H25:**

```
GET /clinicas/servicios/{id}/pasos/
  PasoProtocolo += { "cantidad": 3 }

GET /protocolos/tratamientos/{id}/
  TratamientoPaciente.total_pasos = suma(paso.cantidad)
  SesionProcedimiento += { "sesion_numero": 2, "paso_cantidad": 3 }
```

---

#### H26 — Rename Servicio → Procedimiento

**Motivación:** el modelo `Servicio` es la unidad mínima de trabajo clínico que se realiza en una cita. El negocio lo llama **Procedimiento**. El precio comercial NO vive en el Procedimiento (vive en el `TratamientoCatalogo`, H27). El Procedimiento define *cómo* se hace algo (duración, protocolo, consentimiento); el Tratamiento define *qué se vende* y a *qué precio*.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, `config/urls.py`, nueva migración.

---

**Paso 1 — Renombrar modelo y tabla:**

```python
class Procedimiento(models.Model):  # antes: Servicio
    clinica        = ForeignKey('clinicas.Clinica', on_delete=CASCADE)
    nombre         = CharField(max_length=200)
    descripcion    = TextField(blank=True)
    duracion_min   = PositiveIntegerField()
    # precio se mantiene como referencia interna (no comercial); el precio real va en TratamientoCatalogo
    precio_referencia = DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    requiere_consentimiento = BooleanField(default=False)
    documenso_template_token  = CharField(max_length=200, blank=True, null=True)
    documenso_template_nombre = CharField(max_length=200, blank=True, null=True)
    vigencia_meses = PositiveSmallIntegerField(default=12)
    tiene_protocolo = BooleanField(default=False)  # computed
    activo = BooleanField(default=True)

    class Meta:
        db_table = 'clinicas_procedimiento'  # migración RenameModel desde clinicas_servicio
```

Migración: `RenameModel('Servicio', 'Procedimiento')` + renombrar tabla + actualizar `related_name` en todos los FKs (Cita, PasoProtocolo, consentimientos).

**Paso 2 — Renombrar endpoint:**

```python
# config/urls.py
router.register(r'clinicas/procedimientos', ProcedimientoViewSet, basename='procedimiento')
# Mantener /clinicas/servicios/ como alias deprecated (responde igual) hasta que todos los clientes migren
```

**Paso 3 — Actualizar PasoProtocolo:**

```python
class PasoProtocolo(models.Model):
    procedimiento = ForeignKey('clinicas.Procedimiento', ...)  # antes: servicio
```

**Definition of done — H26:**

- [ ] `RenameModel` migration ejecutada, tabla renombrada a `clinicas_procedimiento`
- [ ] `GET/POST /clinicas/procedimientos/` activo; `/clinicas/servicios/` redirige con 301
- [ ] `PasoProtocolo.servicio` → `PasoProtocolo.procedimiento`
- [ ] `ConsentimientoServicio` → `ConsentimientoProcedimiento` (rename model)
- [ ] Todos los serializers actualizados

**Contrato que se entrega al frontend — H26:**
```
GET  /clinicas/procedimientos/
GET  /clinicas/procedimientos/{id}/
POST /clinicas/procedimientos/
PATCH /clinicas/procedimientos/{id}/
GET  /clinicas/procedimientos/{id}/pasos/          (antes /servicios/{id}/pasos/)
POST /clinicas/procedimientos/{id}/pasos/
GET  /clinicas/procedimientos/{id}/consentimientos/
```
Response shape idéntico al anterior, solo cambia el path.

---

#### H27 — Modelo TratamientoCatalogo con tipos de sesión y sesiones combinadas

**Motivación:** un Tratamiento es la unidad comercial que se vende en una cotización. La versión anterior asumía que cada ítem del tratamiento correspondía a un único Procedimiento repetido N veces. La realidad clínica es distinta: una sesión puede combinar múltiples Procedimientos en la misma cita (ej. "Tensamax + Nutrición"), y distintas sesiones del mismo plan pueden tener combinaciones diferentes. El modelo correcto es **TipoSesion** — cada ítem del tratamiento define un *tipo de cita* con uno o más Procedimientos, y el plan es una secuencia de esos tipos.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, `apps/clinicas/views.py`, `apps/cotizaciones/models.py`, `apps/cotizaciones/serializers.py`, `apps/protocolos/models.py`, `config/urls.py`, nuevas migraciones.

---

**Concepto central — TipoSesion:**

```
TratamientoCatalogo "Tensamax 10 sesiones"
  ├── TipoSesion "Evaluación nutricional"   cantidad=1  → [Nutrición]
  ├── TipoSesion "Sesión Tensamax"          cantidad=7  → [Tensamax]
  └── TipoSesion "Sesión combinada"         cantidad=2  → [Tensamax, Nutrición]
```

Cuando el paciente tiene una cita, el profesional ve qué tipos de sesión le quedan disponibles del plan y elige cuál ejecutar hoy.

---

**Modelos:**

```python
# apps/clinicas/models.py

class TratamientoCatalogo(models.Model):
    clinica         = ForeignKey('clinicas.Clinica', on_delete=CASCADE)
    nombre          = CharField(max_length=200)
    descripcion     = TextField(blank=True)
    precio_estimado = DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    activo          = BooleanField(default=True)
    created_at      = DateTimeField(auto_now_add=True)
    updated_at      = DateTimeField(auto_now=True)

    class Meta:
        db_table = 'clinicas_tratamiento_catalogo'
        ordering = ['nombre']

    @property
    def total_sesiones(self):
        return sum(t.cantidad for t in self.tipos_sesion.all())


class TipoSesion(models.Model):
    """
    Define un 'tipo de cita' dentro del tratamiento.
    Puede combinar uno o varios Procedimientos.
    """
    tratamiento = ForeignKey(TratamientoCatalogo, on_delete=CASCADE, related_name='tipos_sesion')
    nombre      = CharField(max_length=200)        # ej: "Sesión Tensamax + Nutrición"
    cantidad    = PositiveIntegerField(default=1)  # cuántas veces aparece este tipo en el plan
    orden       = PositiveIntegerField(default=1)
    # es_compromiso: si False, es solo informativo (no genera SesionEjecutada)
    es_compromiso = BooleanField(default=True)

    class Meta:
        db_table = 'clinicas_tipo_sesion'
        ordering = ['orden']


class TipoSesionProcedimiento(models.Model):
    """
    Procedimientos que se ejecutan en un TipoSesion.
    Un tipo puede tener 1..N procedimientos (sesión combinada).
    """
    tipo_sesion   = ForeignKey(TipoSesion, on_delete=CASCADE, related_name='procedimientos')
    procedimiento = ForeignKey('clinicas.Procedimiento', on_delete=PROTECT)
    # orden dentro de la sesión (para guiar al profesional)
    orden         = PositiveSmallIntegerField(default=1)

    class Meta:
        db_table     = 'clinicas_tipo_sesion_procedimiento'
        ordering     = ['orden']
        unique_together = [('tipo_sesion', 'procedimiento')]
```

---

**Sesión ejecutada (reemplaza `SesionProcedimiento`):**

```python
# apps/protocolos/models.py

class SesionEjecutada(models.Model):
    """
    Instancia de ejecución de un TipoSesion para un paciente concreto.
    Creada automáticamente al iniciar TratamientoPaciente (cantidad por tipo).
    """
    ESTADO = [('pendiente', 'Pendiente'), ('completada', 'Completada'), ('inasistencia', 'Inasistencia')]

    tratamiento_paciente = ForeignKey('TratamientoPaciente', on_delete=CASCADE, related_name='sesiones')
    tipo_sesion          = ForeignKey('clinicas.TipoSesion', on_delete=PROTECT)
    numero               = PositiveSmallIntegerField()   # 1..tipo_sesion.cantidad
    estado               = CharField(max_length=20, choices=ESTADO, default='pendiente')
    cita                 = ForeignKey('agenda.Cita', on_delete=SET_NULL, null=True, blank=True)
    fecha                = DateField(null=True, blank=True)
    profesional          = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL, null=True)
    observaciones        = TextField(blank=True)

    # Qué procedimientos se ejecutaron REALMENTE (puede diferir del tipo_sesion.procedimientos)
    # Esto permite que el profesional ajuste en el momento sin romper el plan
    procedimientos_ejecutados = ManyToManyField(
        'clinicas.Procedimiento',
        blank=True,
        related_name='sesiones_ejecutadas',
    )

    # Snapshot de consentimientos vigentes al ejecutar (para auditoría)
    # Poblado automáticamente al marcar como completada
    consentimientos_verificados = ManyToManyField(
        'ConsentimientoPaciente',
        blank=True,
        related_name='sesiones',
    )

    checkin_verificado = BooleanField(default=False)
    checkin_metodo     = CharField(max_length=20, null=True, blank=True)
    checkin_en         = DateTimeField(null=True, blank=True)
    foto_presencia_url = CharField(max_length=500, null=True, blank=True)
    created_at         = DateTimeField(auto_now_add=True)

    class Meta:
        db_table    = 'protocolos_sesion_ejecutada'
        ordering    = ['tipo_sesion__orden', 'numero']
        unique_together = [('tratamiento_paciente', 'tipo_sesion', 'numero')]
```

---

**Actualización de `TratamientoPaciente`:**

```python
class TratamientoPaciente(models.Model):
    paciente             = ForeignKey('pacientes.Paciente', on_delete=PROTECT)
    tratamiento_catalogo = ForeignKey('clinicas.TratamientoCatalogo', on_delete=PROTECT,
                                      null=True, blank=True, related_name='ejecuciones')
    cotizacion_item      = ForeignKey('cotizaciones.ItemCotizacion', on_delete=SET_NULL,
                                      null=True, blank=True)
    estado               = CharField(max_length=20, choices=[...], default='activo')
    fecha_inicio         = DateField()

    @property
    def total_sesiones(self):
        return self.sesiones.filter(tipo_sesion__es_compromiso=True).count()

    @property
    def sesiones_completadas(self):
        return self.sesiones.filter(estado='completada').count()

    @property
    def progreso_pct(self):
        total = self.total_sesiones
        return round(self.sesiones_completadas / total * 100) if total else 0
```

Al crear `TratamientoPaciente`, se generan las `SesionEjecutada` automáticamente:

```python
def crear_sesiones(tratamiento_paciente):
    catalogo = tratamiento_paciente.tratamiento_catalogo
    sesiones = []
    for tipo in catalogo.tipos_sesion.filter(es_compromiso=True).order_by('orden'):
        for n in range(1, tipo.cantidad + 1):
            sesiones.append(SesionEjecutada(
                tratamiento_paciente=tratamiento_paciente,
                tipo_sesion=tipo,
                numero=n,
            ))
    SesionEjecutada.objects.bulk_create(sesiones)
```

---

**Cambio en `ItemCotizacion`:**

```python
class ItemCotizacion(models.Model):
    ...
    tratamiento = ForeignKey('clinicas.TratamientoCatalogo', on_delete=SET_NULL,
                             null=True, blank=True, related_name='items_cotizacion')
```

Al crear con `tratamiento`:
- `descripcion` ← `tratamiento.nombre`
- `valor_unitario` ← `tratamiento.precio_estimado`
- `num_citas` ← `tratamiento.total_sesiones`

---

**Endpoints:**

```
# Catálogo
GET    /clinicas/tratamientos/
POST   /clinicas/tratamientos/                         body: { nombre, precio_estimado?, tipos_sesion: [{nombre, cantidad, orden, es_compromiso, procedimientos: [uuid]}] }
GET    /clinicas/tratamientos/{id}/
PATCH  /clinicas/tratamientos/{id}/
DELETE /clinicas/tratamientos/{id}/                    soft-delete

# Tipos de sesión
POST   /clinicas/tratamientos/{id}/tipos/              agregar tipo de sesión
PATCH  /clinicas/tratamientos/{id}/tipos/{tipo_id}/    editar tipo
DELETE /clinicas/tratamientos/{id}/tipos/{tipo_id}/    eliminar tipo

# Ejecución
POST   /protocolos/tratamientos/                       iniciar TratamientoPaciente (genera sesiones)
GET    /protocolos/tratamientos/{id}/                  detalle con sesiones agrupadas por tipo
POST   /protocolos/sesiones/{id}/marcar_completada/    body: { procedimientos_ejecutados: [uuid], cita?, observaciones? }
POST   /protocolos/sesiones/{id}/marcar_inasistencia/
POST   /protocolos/sesiones/{id}/iniciar_checkin/
POST   /protocolos/sesiones/{id}/verificar_otp/
```

---

**Serializer `GET /protocolos/tratamientos/{id}/` (detalle con sesiones agrupadas):**

```json
{
  "id": "uuid",
  "paciente_nombre": "María López",
  "tratamiento_catalogo_nombre": "Tensamax 10 sesiones",
  "estado": "activo",
  "progreso_pct": 40,
  "sesiones_completadas": 4,
  "total_sesiones": 10,
  "grupos": [
    {
      "tipo_sesion_id": "uuid",
      "tipo_sesion_nombre": "Evaluación nutricional",
      "procedimientos": ["Nutrición"],
      "total": 1,
      "completadas": 1,
      "sesiones": [
        { "id": "uuid", "numero": 1, "estado": "completada", "fecha": "2026-01-10",
          "procedimientos_ejecutados": ["Nutrición"], "checkin_verificado": true }
      ]
    },
    {
      "tipo_sesion_id": "uuid",
      "tipo_sesion_nombre": "Sesión Tensamax",
      "procedimientos": ["Tensamax"],
      "total": 7,
      "completadas": 3,
      "pendientes": 4,
      "sesiones": [...]
    },
    {
      "tipo_sesion_id": "uuid",
      "tipo_sesion_nombre": "Sesión combinada",
      "procedimientos": ["Tensamax", "Nutrición"],
      "total": 2,
      "completadas": 0,
      "sesiones": [
        { "id": "uuid", "numero": 1, "estado": "pendiente",
          "consentimientos": [
            { "procedimiento": "Tensamax",  "estado": "vigente",  "vence": "2027-01-10" },
            { "procedimiento": "Nutrición", "estado": "vencido",  "vencio": "2026-07-10" }
          ]
        }
      ]
    }
  ]
}
```

---

**Serializer `GET /clinicas/tratamientos/{id}/` (catálogo):**

```json
{
  "id": "uuid",
  "nombre": "Tensamax 10 sesiones",
  "precio_estimado": "1200000.00",
  "total_sesiones": 10,
  "tipos_sesion": [
    {
      "id": "uuid",
      "nombre": "Evaluación nutricional",
      "cantidad": 1,
      "orden": 1,
      "es_compromiso": true,
      "procedimientos": [
        { "id": "uuid", "nombre": "Nutrición", "duracion_min": 30, "requiere_consentimiento": true }
      ]
    },
    {
      "id": "uuid",
      "nombre": "Sesión Tensamax",
      "cantidad": 7,
      "orden": 2,
      "es_compromiso": true,
      "procedimientos": [
        { "id": "uuid", "nombre": "Tensamax", "duracion_min": 60, "requiere_consentimiento": true }
      ]
    },
    {
      "id": "uuid",
      "nombre": "Sesión combinada",
      "cantidad": 2,
      "orden": 3,
      "es_compromiso": true,
      "procedimientos": [
        { "id": "uuid", "nombre": "Tensamax",  "duracion_min": 60 },
        { "id": "uuid", "nombre": "Nutrición", "duracion_min": 30 }
      ]
    }
  ]
}
```

---

**Definition of done — H27:**

- [ ] Migración crea tablas: `clinicas_tratamiento_catalogo`, `clinicas_tipo_sesion`, `clinicas_tipo_sesion_procedimiento`, `protocolos_sesion_ejecutada`
- [ ] `TratamientoPaciente.servicio` eliminado; reemplazado por `tratamiento_catalogo`
- [ ] Al crear `TratamientoPaciente`, se generan `SesionEjecutada` por cada tipo × cantidad (solo `es_compromiso=True`)
- [ ] `POST /protocolos/sesiones/{id}/marcar_completada/` guarda `procedimientos_ejecutados` y hace snapshot de consentimientos (H28)
- [ ] `ItemCotizacion` acepta `tratamiento` FK con auto-población
- [ ] Serializer de `TratamientoPaciente` devuelve `grupos` (sesiones agrupadas por tipo)
- [ ] `GET /clinicas/tratamientos/activos/` disponible para frontend (selector en cotizaciones)
- [ ] Datos de consentimiento por sesión expuestos (requiere H28 completado)

**Contrato frontend — H27:**

```
GET  /clinicas/tratamientos/activos/
  → TratamientoCatalogo[] (id, nombre, precio_estimado, total_sesiones)

GET  /clinicas/tratamientos/{id}/
  → detalle con tipos_sesion[] y procedimientos[] por tipo

POST /clinicas/tratamientos/
  body: { nombre, descripcion?, precio_estimado?, tipos_sesion: [{nombre, cantidad, orden, es_compromiso, procedimientos: [uuid]}] }

POST /protocolos/sesiones/{id}/marcar_completada/
  body: { procedimientos_ejecutados: [uuid], cita?: uuid, observaciones?: string }

GET  /protocolos/tratamientos/{id}/
  → grupos[] con sesiones[] por tipo_sesion
  → cada sesión pendiente incluye estado de consentimientos (H28)
```

---

#### H27.1 — Ítems de cotización con tipo semántico: Tratamiento, Procedimiento o Libre

**Motivación:** el modelo actual de `ItemCotizacion` acepta opcionalmente un FK a `TratamientoCatalogo` (H27), pero no distingue si un ítem proviene de un Procedimiento del catálogo o es texto libre. El profesional debe poder cotizar tres tipos de ítems semánticamente distintos:
- **Tratamiento** — paquete del catálogo (`TratamientoCatalogo`), con sesiones combinadas y precio estimado. FK persiste.
- **Procedimiento** — servicio individual del catálogo (`Procedimiento`), con precio de referencia. FK persiste.
- **Libre** — texto libre con los mismos campos (descripción, citas, precio, descuento, periodicidad). Sin FK.

La distinción debe persistir en el backend para que el tracking en citas y el panel de sesiones puedan etiquetar correctamente cada ítem, y para que el PDF de la cotización refleje la naturaleza de cada línea.

**Archivos que se tocan:** `apps/cotizaciones/models.py`, `apps/cotizaciones/serializers.py`, nueva migración.

---

**Cambio en el modelo `ItemCotizacion`:**

```python
class ItemCotizacion(models.Model):
    TIPO_CHOICES = [
        ('tratamiento',   'Tratamiento del catálogo'),
        ('procedimiento', 'Procedimiento individual'),
        ('libre',         'Ítem libre'),
    ]

    cotizacion        = ForeignKey(Cotizacion, on_delete=CASCADE, related_name='items')

    # ── Tipo y FKs de catálogo ─────────────────────────────────────────────────
    tipo              = CharField(max_length=20, choices=TIPO_CHOICES, default='libre')
    tratamiento       = ForeignKey(
                          'clinicas.TratamientoCatalogo', on_delete=SET_NULL,
                          null=True, blank=True, related_name='items_cotizacion')
    procedimiento     = ForeignKey(
                          'clinicas.Procedimiento', on_delete=SET_NULL,
                          null=True, blank=True, related_name='items_cotizacion')

    # ── Campos de línea (todos editables independientemente del FK) ────────────
    descripcion           = CharField(max_length=500)
    num_citas             = PositiveIntegerField(default=1)
    duracion_estimada     = CharField(max_length=100, blank=True)
    periodicidad          = CharField(max_length=100, blank=True)
    valor_unitario        = DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento_porcentaje  = DecimalField(max_digits=5, decimal_places=2, default=0)

    # ── Calculado / de sesiones ────────────────────────────────────────────────
    # subtotal calculado por el backend en el serializer
    # citas_agendadas / citas_completadas / citas_restantes: anotados por la vista
```

**Reglas de negocio:**
- Si `tipo='tratamiento'`, `tratamiento` es obligatorio; `procedimiento` debe ser null.
- Si `tipo='procedimiento'`, `procedimiento` es obligatorio; `tratamiento` debe ser null.
- Si `tipo='libre'`, ambos FK son null.
- Al pre-llenar desde catálogo, los campos de línea (`descripcion`, `valor_unitario`, `num_citas`) se copian del catálogo pero el profesional puede editarlos libremente. El FK queda como referencia de origen, no como constraint.

**Validación en el serializer:**
```python
def validate(self, data):
    tipo = data.get('tipo', 'libre')
    if tipo == 'tratamiento' and not data.get('tratamiento'):
        raise ValidationError({'tratamiento': 'Requerido para tipo tratamiento.'})
    if tipo == 'procedimiento' and not data.get('procedimiento'):
        raise ValidationError({'procedimiento': 'Requerido para tipo procedimiento.'})
    if tipo == 'libre':
        data['tratamiento'] = None
        data['procedimiento'] = None
    return data
```

**Serializer `ItemCotizacionSerializer` — campos nuevos (lectura y escritura):**
```
tipo                   CharField (default 'libre')
tratamiento            PrimaryKeyRelatedField(allow_null=True)
procedimiento          PrimaryKeyRelatedField(allow_null=True)
tratamiento_nombre     SerializerMethodField → tratamiento.nombre si existe
procedimiento_nombre   SerializerMethodField → procedimiento.nombre si existe
```

**Endpoint `GET /cotizaciones/{id}/sesiones/` — respuesta actualizada:**
Añadir `tipo` a cada ítem en `ItemSesiones`:
```json
{
  "items": [
    {
      "item_id": "uuid",
      "tipo": "tratamiento",
      "descripcion": "Plan Tensamax 10 sesiones",
      "num_citas": 10,
      "citas_agendadas": 3,
      "citas_completadas": 2,
      "citas_restantes": 7,
      "citas": [...]
    },
    {
      "item_id": "uuid",
      "tipo": "procedimiento",
      "descripcion": "Botox frente",
      "num_citas": 2,
      "citas_agendadas": 1,
      "citas_completadas": 0,
      "citas_restantes": 1,
      "citas": [...]
    }
  ]
}
```

**Migración:**
- Agregar `tipo` con `default='libre'` — todos los ítems existentes quedan como `libre`. No rompe datos existentes.
- Agregar `procedimiento` FK con `null=True, blank=True`.
- `tratamiento` ya existe desde H27; solo verificar que está presente.

**Nota de implementación:** en el backend actual `Procedimiento` sigue siendo un alias público de `clinicas.Servicio`; por eso el FK físico `procedimiento` apunta a `clinicas.Servicio`.

**Definition of done — H27.1:**
- [ ] Migración: campo `tipo` + FK `procedimiento` en `ItemCotizacion`
- [ ] `POST /cotizaciones/` y `PATCH /cotizaciones/{id}/` aceptan `tipo`, `tratamiento`, `procedimiento`
- [ ] Validación: `tipo='tratamiento'` exige `tratamiento` no null; `tipo='procedimiento'` exige `procedimiento` no null
- [ ] `GET /cotizaciones/{id}/` devuelve `tipo`, `tratamiento_nombre`, `procedimiento_nombre`
- [ ] `GET /cotizaciones/{id}/sesiones/` devuelve `tipo` por ítem
- [ ] Ítems existentes no se ven afectados (quedan como `tipo='libre'`)
- [ ] Scoping por clínica respetado en FKs
- [ ] **`CotizacionSerializer.update()` implementa replace semántico para ítems:** elimina los ítems existentes que no aparezcan en el payload (por `id`), actualiza los que sí vienen con `id`, y crea los nuevos (sin `id`). El frontend envía `id` en ítems existentes y omite `id` en ítems nuevos.

**Contrato que se entrega al frontend — H27.1:**
```json
// POST/PATCH /cotizaciones/ — item con tratamiento
{
  "items": [
    {
      "tipo": "tratamiento",
      "tratamiento": "uuid-del-tratamiento",
      "descripcion": "Plan Tensamax 10 sesiones",
      "num_citas": 10,
      "valor_unitario": 1200000,
      "descuento_porcentaje": 0,
      "duracion_estimada": "60 min",
      "periodicidad": "Semanal"
    },
    {
      "tipo": "procedimiento",
      "procedimiento": "uuid-del-procedimiento",
      "descripcion": "Botox frente",
      "num_citas": 2,
      "valor_unitario": 350000,
      "descuento_porcentaje": 10,
      "duracion_estimada": "30 min",
      "periodicidad": "Cada 6 meses"
    },
    {
      "tipo": "libre",
      "descripcion": "Consulta de valoración",
      "num_citas": 1,
      "valor_unitario": 80000,
      "descuento_porcentaje": 0,
      "duracion_estimada": "45 min",
      "periodicidad": ""
    }
  ]
}

// GET /cotizaciones/{id}/ — respuesta de ítem
{
  "id": "uuid",
  "tipo": "tratamiento",
  "tratamiento": "uuid",
  "tratamiento_nombre": "Plan Tensamax 10 sesiones",
  "procedimiento": null,
  "procedimiento_nombre": null,
  "descripcion": "Plan Tensamax 10 sesiones",
  "num_citas": 10,
  "valor_unitario": "1200000.00",
  "descuento_porcentaje": "0.00",
  "subtotal": "1200000.00",
  "citas_agendadas": 3,
  "citas_completadas": 2,
  "citas_restantes": 7
}
```

**Prompt para AI:**
```
Implementa el hito H27.1 en apps/cotizaciones/ siguiendo las convenciones del proyecto.

1. En apps/cotizaciones/models.py — modifica ItemCotizacion:
   - Agrega tipo = CharField(max_length=20, choices=TIPO_CHOICES, default='libre')
     TIPO_CHOICES: ('tratamiento', ...), ('procedimiento', ...), ('libre', ...)
   - Agrega procedimiento = ForeignKey('clinicas.Procedimiento', on_delete=SET_NULL, null=True, blank=True, related_name='items_cotizacion')
   - El campo tratamiento ya existe desde H27; si no, agregarlo: ForeignKey('clinicas.TratamientoCatalogo', SET_NULL, null=True, blank=True)
   - Crea la migración.

2. En apps/cotizaciones/serializers.py — ItemCotizacionSerializer:
   - Agrega tipo, tratamiento (PrimaryKeyRelatedField allow_null=True), procedimiento (PrimaryKeyRelatedField allow_null=True) como campos de escritura.
   - Agrega tratamiento_nombre = SerializerMethodField → obj.tratamiento.nombre if obj.tratamiento else None
   - Agrega procedimiento_nombre = SerializerMethodField → obj.procedimiento.nombre if obj.procedimiento else None
   - En validate(): forzar que tratamiento y procedimiento sean None cuando tipo='libre';
     validar que tratamiento no es None cuando tipo='tratamiento';
     validar que procedimiento no es None cuando tipo='procedimiento'.

3. En apps/cotizaciones/serializers.py — ItemSesionesSerializer (el que usa el endpoint /sesiones/):
   - Agrega tipo = CharField(read_only=True) al serializer de ítems del panel de sesiones.

4. Verificar que la vista GET /cotizaciones/{id}/sesiones/ selecciona el campo tipo de los ítems.
```

---

#### H28 — ConsentimientoPaciente y verificación por sesión

**Motivación:** el consentimiento informado en Colombia es un documento legal obligatorio. El sistema debe garantizar que antes de ejecutar cualquier Procedimiento que lo requiera, el paciente haya firmado el consentimiento correspondiente y esté vigente. Con sesiones combinadas (H27), una sola sesión puede requerir múltiples consentimientos. Se necesita un registro histórico por paciente, verificación automática en dos momentos clave, y un snapshot en la sesión para auditoría.

**Archivos que se tocan:** `apps/protocolos/models.py`, `apps/protocolos/views.py`, `apps/protocolos/serializers.py`, `apps/cotizaciones/views.py`, `config/urls.py`, nuevas migraciones.

---

**Modelo `ConsentimientoPaciente`:**

```python
class ConsentimientoPaciente(models.Model):
    METODO = [
        ('documenso',              'Firma digital Documenso'),
        ('presencial_pdf',         'Documento físico escaneado'),
        ('presencial_confirmado',  'Confirmación del profesional'),
    ]

    paciente              = ForeignKey('pacientes.Paciente', on_delete=PROTECT, related_name='consentimientos')
    # Referencia al template de consentimiento (igual que ServicioConsentimientoRequerido)
    template_token        = CharField(max_length=200)
    template_nombre       = CharField(max_length=200)
    # Procedimiento al que aplica (puede ser null si el consentimiento es genérico)
    procedimiento         = ForeignKey('clinicas.Procedimiento', on_delete=SET_NULL,
                                       null=True, blank=True, related_name='consentimientos_pacientes')
    fecha_firma           = DateField()
    vigencia_hasta        = DateField()     # calculado: fecha_firma + procedimiento.vigencia_meses
    metodo                = CharField(max_length=30, choices=METODO)
    archivo_url           = CharField(max_length=500, blank=True)  # PDF subido o URL Documenso
    documenso_envelope_id = CharField(max_length=200, blank=True)
    registrado_por        = ForeignKey(settings.AUTH_USER_MODEL, on_delete=SET_NULL, null=True)
    notas                 = TextField(blank=True)
    created_at            = DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'protocolos_consentimiento_paciente'
        ordering = ['-fecha_firma']

    @property
    def vigente(self):
        return self.vigencia_hasta >= date.today()
```

---

**Verificación en dos momentos:**

**Momento 1 — Al aceptar cotización** (`POST /cotizaciones/{id}/cambiar_estado/ { "estado": "aceptada" }`):

```python
def verificar_consentimientos_plan(cotizacion):
    """Devuelve lista de consentimientos faltantes o vencidos."""
    faltantes = []
    procedimientos_unicos = set()

    for item in cotizacion.items.all():
        if item.tratamiento:
            for tipo in item.tratamiento.tipos_sesion.filter(es_compromiso=True):
                for tp in tipo.procedimientos.all():
                    procedimientos_unicos.add(tp.procedimiento)

    for proc in procedimientos_unicos:
        for consent_req in proc.consentimientos_requeridos.filter(activo=True):
            tiene_vigente = ConsentimientoPaciente.objects.filter(
                paciente=cotizacion.paciente,
                template_token=consent_req.template_token,
                vigencia_hasta__gte=date.today(),
            ).exists()
            if not tiene_vigente:
                faltantes.append({
                    'procedimiento': proc.nombre,
                    'template_token': consent_req.template_token,
                    'template_nombre': consent_req.template_nombre,
                })
    return faltantes
```

Si hay faltantes:
- La cotización SÍ se acepta (no bloquear el flujo comercial)
- Pero se devuelve la lista con `consentimientos_pendientes` en la respuesta
- El frontend muestra alerta y botón para enviar consentimientos vía Documenso

**Momento 2 — Al marcar sesión como completada** (`POST /protocolos/sesiones/{id}/marcar_completada/`):

```python
def verificar_consentimientos_sesion(sesion, usuario):
    """Verifica consentimientos de todos los procedimientos de la sesión.
    Devuelve lista de faltantes o vencidos."""
    faltantes = []
    procedimientos = sesion.tipo_sesion.procedimientos.all()

    for tp in procedimientos:
        proc = tp.procedimiento
        for consent_req in proc.consentimientos_requeridos.filter(activo=True):
            consent = ConsentimientoPaciente.objects.filter(
                paciente=sesion.tratamiento_paciente.paciente,
                template_token=consent_req.template_token,
                vigencia_hasta__gte=date.today(),
            ).order_by('-fecha_firma').first()

            if not consent:
                faltantes.append({ 'estado': 'faltante', 'procedimiento': proc.nombre,
                                   'template_token': consent_req.template_token })
            elif not consent.vigente:
                faltantes.append({ 'estado': 'vencido',  'procedimiento': proc.nombre,
                                   'template_token': consent_req.template_token,
                                   'vencio': consent.vigencia_hasta })

    return faltantes
```

Si hay faltantes: `400 { "error": "Consentimientos requeridos faltantes o vencidos", "faltantes": [...] }`

El profesional puede forzar con `{ "forzar_sin_consentimiento": true, "motivo": "..." }` — queda registrado en el log de auditoría.

**Snapshot al completar:**

```python
# Al marcar sesión completada sin forzar:
sesion.consentimientos_verificados.set(
    ConsentimientoPaciente.objects.filter(
        paciente=sesion.tratamiento_paciente.paciente,
        template_token__in=[r.template_token for r in consentimientos_requeridos],
        vigencia_hasta__gte=date.today(),
    )
)
```

---

**Endpoints:**

```
# Registro de consentimientos del paciente
GET    /pacientes/{id}/consentimientos/
  → ConsentimientoPaciente[] del paciente, con estado (vigente/vencido)

POST   /pacientes/{id}/consentimientos/
  body: { template_token, procedimiento?, fecha_firma, metodo, archivo? }

GET    /pacientes/{id}/consentimientos/verificar/
  query: ?tratamiento=uuid
  → lista de consentimientos requeridos por el tratamiento y su estado por paciente

# Upload de consentimiento presencial
POST   /pacientes/{id}/consentimientos/{id}/subir_pdf/
  multipart: archivo PDF

# Estado de consentimientos en sesión (para mostrar semáforo al profesional)
GET    /protocolos/sesiones/{id}/consentimientos/
  → por cada procedimiento del tipo de sesión: estado del consentimiento del paciente
```

---

**Respuesta `GET /protocolos/sesiones/{id}/consentimientos/`:**

```json
{
  "sesion_id": "uuid",
  "tipo_sesion_nombre": "Sesión combinada",
  "puede_ejecutar": false,
  "consentimientos": [
    {
      "procedimiento": "Tensamax",
      "template_nombre": "Consentimiento corrientes estéticas",
      "estado": "vigente",
      "fecha_firma": "2026-01-10",
      "vence": "2027-01-10"
    },
    {
      "procedimiento": "Nutrición",
      "template_nombre": "Consentimiento plan nutricional",
      "estado": "vencido",
      "fecha_firma": "2025-07-10",
      "vencio": "2026-01-10",
      "accion": "renovar"
    }
  ]
}
```

---

**Definition of done — H28:**

- [ ] Migración crea `protocolos_consentimiento_paciente`
- [ ] `POST /cotizaciones/{id}/cambiar_estado/` → devuelve `consentimientos_pendientes[]` (no bloquea)
- [ ] `GET /pacientes/{id}/consentimientos/` lista historial con estado vigente/vencido
- [ ] `POST /pacientes/{id}/consentimientos/` registra nuevo consentimiento (cualquier método)
- [ ] `GET /pacientes/{id}/consentimientos/verificar/?tratamiento=uuid` devuelve requeridos vs. estado
- [ ] `GET /protocolos/sesiones/{id}/consentimientos/` devuelve semáforo por procedimiento
- [ ] `POST /protocolos/sesiones/{id}/marcar_completada/` bloquea si hay consentimientos faltantes (salvo `forzar_sin_consentimiento`)
- [ ] `SesionEjecutada.consentimientos_verificados` se puebla como snapshot al completar
- [ ] Sesiones con consentimiento forzado quedan marcadas con `forzado=True` y `motivo` en log de auditoría

**Contrato frontend — H28:**

```
GET  /protocolos/sesiones/{id}/consentimientos/
  → { puede_ejecutar: bool, consentimientos: [{ procedimiento, estado, vence?, accion? }] }

POST /protocolos/sesiones/{id}/marcar_completada/
  → 400 si faltan consentimientos (lista en body)
  → 200 si todo ok (o si se pasa forzar_sin_consentimiento=true)

GET  /pacientes/{id}/consentimientos/verificar/?tratamiento=uuid
  → [{ template_nombre, procedimiento, estado: 'vigente'|'vencido'|'faltante' }]
```

---

#### H29 — Arquitectura de dos buckets MinIO: privado y público

**Motivación:** el bucket único actual (`clinica`, PRIVATE) obliga a generar URLs presignadas para todo, incluyendo assets que deberían ser públicos como logos de clínica y fotos de perfil. Esto añade complejidad innecesaria: las presigned URLs tienen TTL, no se pueden usar en WeasyPrint sin descargar los bytes internamente, y el frontend necesita un proxy para mostrar imágenes. La solución es separar en dos buckets con políticas diferentes.

**Regla general:**
- `clinica-media` (PRIVADO) → archivos de pacientes, consentimientos firmados, fotos clínicas, check-ins, exámenes. Acceso solo vía URL presignada, TTL configurable.
- `clinica-static` (PÚBLICO) → logos de clínica, fotos de perfil, imágenes de productos, assets que no contienen datos sensibles. Acceso directo sin firma.

---

**Paso 1 — Crear y configurar los buckets en MinIO:**

```bash
# MinIO bucket privado (ya existe, renombrar o crear nuevo)
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb local/clinica-media
mc policy set none local/clinica-media   # ya es privado por defecto

# MinIO bucket público
mc mb local/clinica-static
mc policy set download local/clinica-static   # lectura pública anónima
```

Política JSON para `clinica-static`:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": ["*"] },
    "Action": ["s3:GetObject"],
    "Resource": ["arn:aws:s3:::clinica-static/*"]
  }]
}
```

---

**Paso 2 — Variables de entorno:**

```env
# Bucket privado (media sensible)
MINIO_ENDPOINT=http://minio:9000           # hostname interno Docker
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_PRIVATE_BUCKET=clinica-media

# Bucket público (assets)
MINIO_PUBLIC_BUCKET=clinica-static
MINIO_PUBLIC_BASE_URL=http://localhost:9000   # hostname que el BROWSER puede resolver
```

La diferencia clave: `MINIO_ENDPOINT` es el hostname interno (usado por Django para uploads/operaciones), `MINIO_PUBLIC_BASE_URL` es el hostname público que se embebe en las URLs que se devuelven al frontend.

---

**Paso 3 — Helpers de storage en Django (`apps/core/storage.py`):**

```python
import boto3
from django.conf import settings
import uuid, os

def _s3_client():
    return boto3.client(
        's3',
        endpoint_url=settings.MINIO_ENDPOINT,
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
    )

# ── Bucket PRIVADO ────────────────────────────────────────────

def upload_private_file(file_bytes: bytes, path: str, content_type: str = 'application/octet-stream') -> str:
    """Sube a clinica-media. Devuelve el path (no la URL — se genera on-demand con get_signed_url)."""
    client = _s3_client()
    client.put_object(
        Bucket=settings.MINIO_PRIVATE_BUCKET,
        Key=path,
        Body=file_bytes,
        ContentType=content_type,
    )
    return path   # guardar solo el path en la DB, no la URL firmada

def get_signed_url(path: str, expires_in: int = 86400) -> str:
    """Genera URL firmada de un archivo privado. TTL por defecto: 24h."""
    client = _s3_client()
    return client.generate_presigned_url(
        'get_object',
        Params={'Bucket': settings.MINIO_PRIVATE_BUCKET, 'Key': path},
        ExpiresIn=expires_in,
    )

def delete_private_file(path: str) -> None:
    _s3_client().delete_object(Bucket=settings.MINIO_PRIVATE_BUCKET, Key=path)

# ── Bucket PÚBLICO ────────────────────────────────────────────

def upload_public_file(file_bytes: bytes, path: str, content_type: str = 'image/png') -> str:
    """Sube a clinica-static. Devuelve la URL DIRECTA (sin firma) usando MINIO_PUBLIC_BASE_URL."""
    client = _s3_client()
    client.put_object(
        Bucket=settings.MINIO_PUBLIC_BUCKET,
        Key=path,
        Body=file_bytes,
        ContentType=content_type,
        ACL='public-read',
    )
    base = settings.MINIO_PUBLIC_BASE_URL.rstrip('/')
    bucket = settings.MINIO_PUBLIC_BUCKET
    return f"{base}/{bucket}/{path}"   # URL directa, sin parámetros de firma

def delete_public_file(path: str) -> None:
    _s3_client().delete_object(Bucket=settings.MINIO_PUBLIC_BUCKET, Key=path)
```

---

**Paso 4 — Cambios en modelos:**

Los modelos que guardan rutas privadas NO almacenan la URL firmada en la DB (el TTL expira). Almacenan solo el `path` y generan la URL on-demand:

```python
# ANTES (problemático — la URL firmada en DB expira):
class FotoClinica(models.Model):
    url_firmada = CharField(max_length=2048)   # ← expira, se desincroniza

# DESPUÉS (correcto):
class FotoClinica(models.Model):
    archivo_path = CharField(max_length=500)    # solo el path en MinIO

    @property
    def url(self) -> str:
        """Genera URL firmada fresca en cada acceso."""
        return get_signed_url(self.archivo_path, expires_in=3600)
```

Los serializers exponen `url` (no `archivo_path`) al frontend.

Para archivos públicos (logos, fotos de perfil), la URL directa SÍ se puede guardar en la DB porque no expira:
```python
class Clinica(models.Model):
    logo_path = CharField(max_length=500, blank=True)  # path en MinIO
    logo_url  = URLField(max_length=1000, blank=True)  # URL directa (público)
```

---

**Paso 5 — Migrar campos existentes:**

| Modelo | Campo actual | Bucket destino | Cambio |
|---|---|---|---|
| `Clinica.logo` | URL firmada (privado) | `clinica-static` | Mover a público; guardar URL directa |
| `FotoClinica.url_firmada` | URL firmada | `clinica-media` | Cambiar a `archivo_path`; URL generada on-demand |
| `ResultadoExamen.archivo_url` | URL firmada | `clinica-media` | Igual que FotoClinica |
| `ConsentimientoInformado.archivo_pdf` | URL firmada | `clinica-media` | Igual que FotoClinica |
| `SesionEjecutada.foto_presencia_url` | URL firmada | `clinica-media` | Igual que FotoClinica |
| `User.foto_perfil` | URL firmada (si aplica) | `clinica-static` | Mover a público |

---

**Paso 6 — Serializers:**

Los serializers de modelos privados calculan la URL al serializar:

```python
class FotoClinicaSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    def get_url(self, obj):
        if obj.archivo_path:
            return get_signed_url(obj.archivo_path, expires_in=3600)
        return None

    class Meta:
        fields = ['id', 'url', 'descripcion', 'created_at']
        # archivo_path NO se expone al frontend
```

Los serializers de modelos públicos devuelven la URL directamente:

```python
class ClinicaSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ['id', 'nombre', 'logo_url', ...]
        # logo_url ya es una URL directa de MinIO público
```

---

**Paso 7 — WeasyPrint y logos:**

Antes, el logo necesitaba ser descargado como bytes porque la URL firmada no es accesible en el contenedor de WeasyPrint. Con el bucket público, WeasyPrint puede cargar el logo directamente desde `MINIO_PUBLIC_BASE_URL` (que sí es accesible desde dentro de Docker via el hostname interno):

```python
# En el contexto de WeasyPrint, usar el ENDPOINT interno de MinIO (no el público)
# porque WeasyPrint corre dentro de Docker
def get_logo_for_pdf(clinica) -> str:
    """Devuelve la URL del logo accesible desde dentro del contenedor Docker."""
    if not clinica.logo_path:
        return ''
    # Reemplazar el hostname público por el interno para acceso desde Docker
    internal_url = f"{settings.MINIO_ENDPOINT}/{settings.MINIO_PUBLIC_BUCKET}/{clinica.logo_path}"
    return internal_url
```

---

**Definition of done — H29:**

- [ ] Bucket `clinica-static` creado en MinIO con política de lectura pública
- [ ] Bucket `clinica-media` (o renombrado desde `clinica`) permanece privado
- [ ] Variables de entorno `MINIO_PRIVATE_BUCKET`, `MINIO_PUBLIC_BUCKET`, `MINIO_PUBLIC_BASE_URL` configuradas
- [ ] `upload_private_file()`, `get_signed_url()`, `upload_public_file()` implementados en `apps/core/storage.py`
- [ ] `Clinica.logo` migrado a `clinica-static`: `logo_url` devuelve URL directa (sin firma)
- [ ] `FotoClinica`, `ResultadoExamen`, `ConsentimientoInformado`, `SesionEjecutada.foto_presencia_url` almacenan solo `archivo_path`; URL generada on-demand en el serializer
- [ ] `User.foto_perfil` migrado a `clinica-static`
- [ ] WeasyPrint usa hostname interno de MinIO para logos
- [ ] Tests: verificar que URL firmada expira y se regenera; logo público accesible sin autenticación

**Contrato que se entrega al frontend — H29:**

```
# Archivos PÚBLICOS (logos, fotos de perfil)
Clinica.logo_url: "http://localhost:9000/clinica-static/clinicas/logos/uuid.png"
  → URL directa, sin parámetros X-Amz-*, no expira, browser la carga directamente

# Archivos PRIVADOS (fotos clínicas, consentimientos, check-ins)
FotoClinica.url: "http://minio:9000/clinica-media/...?X-Amz-Algorithm=...&X-Amz-Expires=3600"
  → URL firmada, TTL 1h, frontend necesita proxy para mostrarla en browser
```

El frontend distingue por la presencia de `X-Amz-` en la URL:
- Sin `X-Amz-` → asset público, mostrar directo
- Con `X-Amz-` → asset privado, usar `/api/media-proxy`

---

---

#### H27.2 — `duracion_min` en `TipoSesion` (soporte para agendamiento sin servicio)

**Motivación:** un `TipoSesion` puede tener procedimientos vinculados (que traen `procedimiento_duracion_min`) o no. Cuando no hay procedimientos, no existe ningún dato de duración y es imposible calcular slots para agendar una sesión de ese tipo. Este hito agrega `duracion_min` como campo explícito en `TipoSesion`, resolviendo la ambigüedad y habilitando el agendamiento sin requerir un `servicio` del catálogo.

**Archivos que se tocan:** `apps/clinicas/models.py`, `apps/clinicas/serializers.py`, nueva migración.

**Cambio en el modelo `TipoSesion`:**
```python
class TipoSesion(models.Model):
    # ... campos existentes: nombre, cantidad, orden, es_compromiso ...
    duracion_min = PositiveIntegerField(
        default=0,
        help_text="Duración de la sesión en minutos. Si tiene procedimientos vinculados puede derivarse de ellos, pero se guarda explícitamente."
    )
```

El campo es `PositiveIntegerField` con `default=0`. El valor `0` indica "no configurado" y el backend devuelve advertencia en el serializer si un tipo `es_compromiso=True` tiene `duracion_min=0`.

**Serializer `TipoSesionSerializer` — cambios:**
- Aceptar `duracion_min` en `create` y `update` (viene del frontend).
- Incluir `duracion_min` en la respuesta de `GET /clinicas/tratamientos/`.

**Serializer `ItemSesiones` (endpoint `/cotizaciones/{id}/sesiones/`) — cambio:**
- Agregar `duracion_min` derivado del `TipoSesion` al que pertenece el ítem de cotización, para que el frontend lo pueda usar al calcular slots.

```json
// GET /cotizaciones/{id}/sesiones/
{
  "items": [
    {
      "item_id": "uuid",
      "tipo": "tratamiento",
      "descripcion": "Radiofrecuencia Monopolar (Tensamax)",
      "num_citas": 11,
      "citas_restantes": 8,
      "duracion_min": 60,   // ← nuevo
      ...
    }
  ]
}
```

**Definition of done:**
- [ ] Migración aplicada con `duracion_min` en `TipoSesion` (default 0, sin romper registros existentes)
- [ ] `POST /clinicas/tratamientos/` y `PATCH /clinicas/tratamientos/{id}/` aceptan `duracion_min` por tipo de sesión
- [ ] `GET /clinicas/tratamientos/` expone `duracion_min` por tipo de sesión
- [ ] `GET /cotizaciones/{id}/sesiones/` expone `duracion_min` por ítem
- [ ] Validación no bloqueante: si `es_compromiso=True` y `duracion_min=0`, el serializer incluye `{"warning": "tipo_sin_duracion"}` en la respuesta (no error)

**Contrato que se entrega al frontend — H27.2:**
```json
// GET /clinicas/tratamientos/{id}/
{
  "tipos_sesion": [
    {
      "id": "uuid",
      "nombre": "Sesión Tensamax",
      "cantidad": 10,
      "es_compromiso": true,
      "duracion_min": 60,
      "procedimientos": [...]
    },
    {
      "id": "uuid",
      "nombre": "Evaluación final",
      "cantidad": 1,
      "es_compromiso": true,
      "duracion_min": 30,
      "procedimientos": []   // sin procedimientos — duración manual
    }
  ]
}
```

---

#### H6.3 — Agendamiento flexible: slots por `item_cotizacion` o `duracion_min`; `servicio` opcional en citas

**Motivación:** el modelo actual obliga a especificar un `servicio` al crear una cita y al calcular slots disponibles. Cuando la cita está vinculada a un ítem de cotización (tratamiento contratado), el servicio ya está implícito y pedirlo al usuario es redundante. Además, debe existir un modo de "consulta libre" donde la duración se define directamente, sin asociar ningún servicio del catálogo.

**Archivos que se tocan:** `apps/agenda/models.py`, `apps/agenda/serializers.py`, `apps/agenda/views.py`, nueva migración.

---

**Cambio 1 — Modelo `Cita`: `servicio` pasa a opcional**

```python
class Cita(models.Model):
    servicio = ForeignKey(
        'clinicas.Servicio',
        on_delete=SET_NULL,
        null=True, blank=True,    # ← cambia de requerido a opcional
        related_name='citas',
    )
    servicio_nombre = CharField(max_length=200, blank=True)  # snapshot del nombre al crear
    duracion_min    = PositiveIntegerField(null=True, blank=True)
    # Cuando servicio=None, duracion_min es la fuente de verdad para la duración de la cita
```

**Reglas de negocio al crear cita:**
- Si viene `servicio_id` → usar su `duracion_min`; guardar `servicio_nombre` como snapshot.
- Si viene `item_cotizacion_id` y no viene `servicio_id` → derivar `duracion_min` del `TipoSesion` vinculado al ítem; `servicio_nombre` queda vacío o toma el `descripcion` del ítem.
- Si viene `duracion_min` explícito y ni `servicio_id` ni `item_cotizacion_id` → cita libre; usar `duracion_min` tal cual.
- Al menos uno de `{servicio_id, item_cotizacion_id, duracion_min}` debe estar presente; si ninguno → `400 {"error": "Se requiere servicio, item_cotizacion o duracion_min", "code": "MISSING_DURATION"}`.

**Cambio 2 — `slots_disponibles`: aceptar alternativas a `servicio_id`**

El endpoint `GET /agenda/citas/slots_disponibles/` actualmente exige `servicio_id`. Se extiende para aceptar una de tres formas mutuamente excluyentes:

```
# Forma A — actual (sin cotización)
?profesional_id=X&sede_id=Y&fecha=F&servicio_id=Z

# Forma B — cita vinculada a cotización
?profesional_id=X&sede_id=Y&fecha=F&item_cotizacion_id=I
# El backend resuelve duracion_min desde TipoSesion del ítem

# Forma C — consulta libre
?profesional_id=X&sede_id=Y&fecha=F&duracion_min=30
```

Si ninguna de las tres formas tiene duración resoluble → `400 {"error": "...", "code": "MISSING_DURATION"}`.

**Cambio 3 — `CreateCitaRequest` serializer: campos nuevos opcionales**

```python
class CreateCitaSerializer(serializers.ModelSerializer):
    servicio         = PrimaryKeyRelatedField(queryset=Servicio.objects.all(), required=False, allow_null=True)
    item_cotizacion  = PrimaryKeyRelatedField(queryset=ItemCotizacion.objects.all(), required=False, allow_null=True)
    duracion_min     = IntegerField(required=False, allow_null=True, min_value=5)
    motivo           = CharField(max_length=500, required=False, allow_blank=True)
    # motivo: texto libre para consultas sin servicio definido
```

**Cambio 4 — `CitaSerializer` (lectura): exponer campos nuevos**

```json
// GET /agenda/citas/{id}/
{
  "servicio": "uuid-o-null",
  "servicio_nombre": "Radiofrecuencia Monopolar",
  "duracion_min": 60,
  "motivo": ""
}
```

**Definition of done:**
- [ ] Migración: `servicio` nullable en `Cita`; nuevos campos `duracion_min` y `motivo`
- [ ] `POST /agenda/citas/` acepta `{servicio}`, `{item_cotizacion}` o `{duracion_min}` como formas válidas de definir duración
- [ ] `POST /agenda/citas/` retorna 400 `MISSING_DURATION` si ninguna forma está presente
- [ ] `GET /agenda/citas/slots_disponibles/` acepta `servicio_id`, `item_cotizacion_id` o `duracion_min`
- [ ] `CitaSerializer` expone `servicio` (nullable), `servicio_nombre`, `duracion_min`, `motivo`
- [ ] Citas existentes no se rompen (el campo `servicio` se vuelve nullable, los registros previos mantienen su FK)
- [ ] Scoping por clínica respetado en todos los caminos

**Contrato que se entrega al frontend — H6.3:**

```typescript
// CreateCitaRequest actualizado
interface CreateCitaRequest {
  paciente:        string
  sede:            string
  profesional:     string
  fecha_inicio:    string
  canal_origen:    CanalOrigen
  notas_internas?: string
  // Exactamente uno de los tres siguientes:
  servicio?:           string | null
  item_cotizacion?:    string | null
  duracion_min?:       number | null
  motivo?:             string   // para consulta libre
}

// slots_disponibles — nuevo contrato
type SlotParams =
  | { profesional_id: string; sede_id: string; fecha: string; servicio_id: string }
  | { profesional_id: string; sede_id: string; fecha: string; item_cotizacion_id: string }
  | { profesional_id: string; sede_id: string; fecha: string; duracion_min: number }
```

```json
// GET /agenda/citas/{id}/ — campos nuevos
{
  "servicio": null,
  "servicio_nombre": "Radiofrecuencia Monopolar (desde cotización)",
  "duracion_min": 60,
  "motivo": ""
}
```

---

### H26 — Rediseño NotaClinica: atención = nota completa

**Motivación:** el modelo anterior separaba datos de la atención en dos lugares: campos persistentes de `HistoriaClinica` (`motivo_consulta`, `plan_manejo`) y la `NotaClinica` por cita. Con el rediseño, cada atención genera una única `NotaClinica` que contiene todo lo que el profesional llenó en los tabs durante esa sesión. `HistoriaClinica.motivo_consulta` y `HistoriaClinica.plan_manejo` se deprecan como campos editables.

#### H26.1 — Migración del modelo `NotaClinica`

**Cambios en el modelo:**

```python
class NotaClinica(models.Model):
    historia     = FK(HistoriaClinica)
    cita         = FK(Cita, null=True, blank=True)
    estado       = CharField(choices=['borrador','completada'], default='borrador')  # NUEVO
    motivo_consulta = TextField(blank=True, null=True)   # antes en HistoriaClinica
    plan_manejo     = TextField(blank=True, null=True)   # antes en HistoriaClinica
    created_at   = DateTimeField(auto_now_add=True)
    updated_at   = DateTimeField(auto_now=True)          # NUEVO

    # Campos eliminados (migración):
    # tipo, anamnesis, diagnostico, zona_tratada, productos_usados,
    # tecnica, reacciones_adversas, cuidados_post, proxima_cita_sugerida,
    # observaciones, nota_aclarada
```

**Campos que se eliminan:** `tipo`, `anamnesis`, `diagnostico`, `zona_tratada`, `productos_usados`, `tecnica`, `reacciones_adversas`, `cuidados_post`, `proxima_cita_sugerida`, `observaciones`, `nota_aclarada`.

> ⚠️ La migración debe preservar datos existentes: mapear `anamnesis` → `motivo_consulta` y `plan_manejo` → `plan_manejo` en registros ya existentes antes de eliminar columnas.

#### H26.2 — FK `nota` en `ResultadoExamen` y `OrdenMedica`

```python
class ResultadoExamen(models.Model):
    historia = FK(HistoriaClinica)
    nota     = FK(NotaClinica, null=True, blank=True, related_name='examenes')  # NUEVO
    titulo   = CharField(...)
    fecha    = DateField(...)
    descripcion = TextField(blank=True)
    archivo  = FileField(null=True, blank=True)

class OrdenMedica(models.Model):
    historia  = FK(HistoriaClinica)
    cita      = FK(Cita, null=True, blank=True)
    nota      = FK(NotaClinica, null=True, blank=True, related_name='ordenes')  # NUEVO
    contenido = TextField(...)
    plantilla_origen = FK(PlantillaOrden, null=True, blank=True)
```

Ambas FKs son `null=True` para retrocompatibilidad con registros existentes.

#### H26.3 — Endpoints actualizados

**`GET /historia-clinica/historias/{id}/notas/`** — cada nota devuelve:
```json
{
  "id": "uuid",
  "cita": "uuid",
  "estado": "completada",
  "motivo_consulta": "...",
  "plan_manejo": "...",
  "examenes": [{ "id": "uuid", "titulo": "...", "fecha": "...", "archivo_url": "..." }],
  "ordenes": [{ "id": "uuid", "contenido": "...", "plantilla_origen": "uuid|null" }],
  "fotos": [{ "id": "uuid", "tipo": "antes", "url_firmada": "..." }],
  "created_at": "..."
}
```

**`POST /historia-clinica/notas/`** — crea borrador al iniciar atención:
```json
{ "historia": "uuid", "cita": "uuid" }
→ { "id": "uuid", "estado": "borrador", ... }
```

**`PATCH /historia-clinica/notas/{id}/`** — auto-save por tab:
```json
{ "motivo_consulta": "..." }   // desde TabMotivoConsulta
{ "plan_manejo": "..." }       // desde TabPlanManejo
```

**`POST /historia-clinica/notas/{id}/completar/`** — al hacer "Completar atención":
```json
{}  → { "estado": "completada", ... }
```

**`POST /historia-clinica/resultados-examenes/`** — ahora acepta `nota`:
```json
{ "historia": "uuid", "nota": "uuid", "titulo": "...", "fecha": "..." }
```

**`POST /historia-clinica/ordenes-medicas/`** — ahora acepta `nota`:
```json
{ "historia": "uuid", "nota": "uuid", "contenido": "..." }
```

#### H26.4 — Deprecar edición de `HistoriaClinica.motivo_consulta` / `plan_manejo`

`PATCH /historia-clinica/historias/{id}/` deja de aceptar `motivo_consulta` y `plan_manejo`. Estos campos se vuelven read-only en el serializer (devuelven el valor de la última nota completada para retrocompatibilidad de lectura).

**Definition of done H26:**
- [ ] Migración: campos eliminados de `NotaClinica`, datos históricos mapeados a nuevos campos
- [ ] `NotaClinica` tiene `estado`, `motivo_consulta`, `plan_manejo`, `updated_at`
- [ ] `ResultadoExamen` y `OrdenMedica` tienen FK `nota` nullable
- [ ] `GET /notas/{id}/` devuelve `examenes[]`, `ordenes[]`, `fotos[]` embebidos (o como URLs de detalle)
- [ ] `POST /notas/` crea borrador; `POST /notas/{id}/completar/` lo finaliza
- [ ] `PATCH /notas/{id}/` acepta auto-save parcial por tab
- [ ] `POST /resultados-examenes/` y `POST /ordenes-medicas/` aceptan `nota` FK
- [ ] `PATCH /historias/{id}/` rechaza `motivo_consulta` y `plan_manejo` con 400
- [ ] Scoping por clínica respetado
- [ ] Tests: crear nota borrador → auto-save → completar → verificar que historial devuelve nota con todos los datos

---

#### H30 — Pre-vinculación de `SesionProcedimiento` al crear cita (asks #1 y #2)

**Motivación:** en el flujo de agendamiento en modo cotización la recepción quiere elegir explícitamente qué sesión del protocolo se consumirá (ej. "Sesión 3 de 11 de Radiofrecuencia Monopolar") al crear la cita, en lugar de que el profesional lo marque durante la atención. Esto requiere que el backend acepte `sesion_ejecutada` en `POST /agenda/citas/` y reserve la sesión para que no pueda ser reclamada por otra cita.

**Cambios en `POST /agenda/citas/`:**
- Acepta campo opcional `sesion_ejecutada: uuid` (UUID de una `SesionProcedimiento`).
- Validaciones:
  - La sesión debe pertenecer al mismo paciente de la cita.
  - La sesión debe estar en `estado = "pendiente"`.
  - La sesión NO debe tener ya una cita asignada (`cita` is null).
- Al crear la cita, el backend persiste `sesion.cita = <nueva_cita>`.
- Tanto `GET /agenda/citas/` (listado) como `GET /agenda/citas/{id}/` (detalle) devuelven `sesion_ejecutada: "uuid|null"`. El listado lo necesita porque `ColaEspera` trabaja sobre la colección paginada y usa el campo para llamar `GET /protocolos/sesiones/{id}/consentimientos/` al verificar el estado del paciente en espera.

**Nuevos errores:**
```json
{ "error": "La sesión no pertenece al paciente indicado.", "code": "SESION_PACIENTE_MISMATCH" }
{ "error": "La sesión no está en estado pendiente.", "code": "SESION_NO_PENDIENTE" }
{ "error": "La sesión ya tiene una cita asignada.", "code": "SESION_YA_VINCULADA" }
```

**Cambios en `consentimiento_info` (asks #2):**
- Si la cita tiene `sesion_ejecutada` pre-vinculada, `consentimiento_info` se calcula a partir de los procedimientos de esa sesión (`sesion.tipo_sesion.procedimientos`) en lugar del servicio genérico.
- Si no hay sesión pre-vinculada, el comportamiento actual (basado en `servicio.consentimientos_requeridos`) se mantiene.

**Contrato provisional de request:**
```json
{
  "paciente": "uuid",
  "sede": "uuid",
  "servicio": "uuid|null",
  "profesional": "uuid",
  "fecha_inicio": "2026-04-13T10:30:00-05:00",
  "canal_origen": "telefono",
  "notas_internas": "Sesión 3 de protocolo facial",
  "sesion_ejecutada": "uuid"
}
```

**Definition of done H30:**
- [ ] `POST /agenda/citas/` acepta y valida `sesion_ejecutada` opcional
- [ ] Al crear la cita el backend persiste `sesion.cita`
- [ ] Validaciones de pertenencia, estado y unicidad implementadas
- [ ] `consentimiento_info` usa procedimientos de la sesión cuando hay sesión vinculada
- [ ] `GET /agenda/citas/` (listado) y `GET /agenda/citas/{id}/` (detalle) devuelven `sesion_ejecutada: uuid|null`
- [ ] `api.md` actualizado con los cambios
- [ ] `asks.md` §1 y §2 marcadas como respondidas y estables

---

#### H30.1 — Filtro `cotizacion_item` en `GET /protocolos/tratamientos/` (asks #3)

**Motivación:** el frontend necesita obtener el `TratamientoPaciente` asociado a un `ItemCotizacion` concreto para mostrar el selector de sesiones en `NuevaCitaModal`. El campo `cotizacion_item` ya existe en el modelo pero no está expuesto como filtro de query param.

**Cambio:** agregar `cotizacion_item=<uuid>` como filtro en `GET /protocolos/tratamientos/`.

**Comportamiento esperado:**
- Devuelve 0 o 1 resultado (un `item_cotizacion` vincula a lo sumo un tratamiento).
- La respuesta del listado sigue sin incluir sesiones anidadas (volumen). El frontend siempre necesita el paso adicional de `GET /protocolos/tratamientos/{id}/` para obtener `grupos[].sesiones`.

**Definition of done H30.1:**
- [ ] Filtro `cotizacion_item=<uuid>` operativo en el listado
- [ ] `api.md` §Protocolos actualizado con el nuevo filtro
- [ ] `asks.md` §3 marcada como respondida y estable

---

## Riesgos backend a vigilar

- No introducir reglas de borrado que contradigan trazabilidad clínica.
- No usar `GET` para mutaciones de negocio.
- No depender de `SELECT MAX` para numeración clínica si hay concurrencia.
- No modelar permisos con relaciones que no existan en `User` o `Colaborador`.
- No cambiar contratos sin reflejarlo en `plan-frontend.md`.

## Checklist de handoff hacia frontend

Antes de pasar un módulo al frontend, confirmar:
- endpoint estable
- serializer estable
- ejemplo real de request/response
- permisos validados
- casos de error documentados
- nombres de campos definitivos

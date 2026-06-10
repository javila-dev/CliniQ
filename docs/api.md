# API Backend Guide

Documento de apoyo para el agente AI del frontend.
Describe cómo consumir el backend actual del sistema de gestión clínica estética y qué partes ya están disponibles hoy.

## Estado actual

El backend ya tiene implementados estos módulos:

- `H2` autenticación y usuarios
- `H3` clínicas, sedes y procedimientos
- `H4` colaboradores
- `H5` pacientes
- `H6` agenda y citas
- `H7` confirmación de citas
- `H8` historia clínica
- `H9` consentimientos
- `H10` inventario base
- `H11` proveedores y órdenes de compra
- `H12` kardex y movimientos de inventario
- `H13` cobros
- `H19` cotizaciones
- `H25` protocolos, pasos y check-in
- `H26` rename público `Servicio` -> `Procedimiento`
- `H26` rediseño `NotaClinica`: flujo borrador → completada, auto-save por tab
- `H27` catálogo comercial de tratamientos
- `H27.1` ítems de cotización con tipo semántico (`tratamiento`, `procedimiento`, `libre`)
- `H29` storage MinIO con bucket público y privado

Todo cuelga de `api/v1/`.

Base URL esperada en frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

## Convenciones generales

- Autenticación actual: `Bearer <access_token>`
- Refresh token: endpoint separado
- Respuestas paginadas DRF:

```json
{
  "count": 0,
  "next": null,
  "previous": null,
  "results": []
}
```

- Paginación por defecto: `25`
- Filtros y búsqueda vienen por query params
- UUIDs en todos los recursos
- Soft delete de negocio vía `activo`; algunos endpoints `DELETE` marcan estados o desactivan en vez de borrar físicamente
- las URLs con `X-Amz-` son efímeras; no las caches largo tiempo

## Storage H29

El backend ahora separa assets públicos y archivos clínicos privados:

- públicos: `logo_url` de clínica y `foto_perfil` de usuario
- privados: `url_firmada`, `archivo_url`, `foto_presencia_url`

Regla práctica para frontend:

- sin `X-Amz-` en la URL: asset público, puede mostrarse directo
- con `X-Amz-` en la URL: asset privado, es temporal y conviene pasarlo por proxy si el browser no alcanza el host interno

## Auth

Prefijo: `/auth`

### Endpoints

- `POST /auth/login/`
- `POST /auth/refresh/`
- `POST /auth/logout/`
- `GET /auth/me/`
- `PATCH /auth/me/`
- `POST /auth/recuperar-password/`
- `GET /auth/recuperar-password/{token}/`
- `POST /auth/restablecer-password/`

### Login

Request:

```json
{
  "email": "admin@demo.com",
  "password": "Admin123!"
}
```

Response:

```json
{
  "refresh": "jwt",
  "access": "jwt",
  "user": {
    "id": "uuid",
    "email": "admin@demo.com",
    "first_name": "Admin",
    "last_name": "Demo",
    "nombre_completo": "Admin Demo",
    "rol": "admin",
    "role_id": "uuid|null",
    "role_nombre": "Administrador",
    "permissions": ["agenda.citas.ver", "usuarios.ver"],
    "clinica_id": "uuid|null",
    "sede_id": "uuid|null",
    "clinica_nombre": "Clinica Demo"
  }
}
```

### Me

`GET /auth/me/` devuelve:

- `id`
- `email`
- `first_name`
- `last_name`
- `nombre_completo`
- `rol`
- `role_id`
- `role_nombre`
- `permissions`
- `clinica_id`
- `sede_id`
- `clinica`
- `clinica_nombre`
- `telefono`
- `foto_perfil`
- `activo`
- `created_at`
- `updated_at`

Response ejemplo:

```json
{
  "id": "uuid",
  "email": "admin@demo.com",
  "first_name": "Admin",
  "last_name": "Demo",
  "nombre_completo": "Admin Demo",
  "rol": "admin",
  "role_id": "uuid|null",
  "role_nombre": "Administrador",
  "permissions": ["agenda.citas.ver", "usuarios.ver"],
  "clinica_id": "uuid|null",
  "sede_id": "uuid|null",
  "clinica": "uuid|null",
  "clinica_nombre": "Clinica Demo|null",
  "telefono": "3001234567",
  "foto_perfil": null,
  "activo": true,
  "created_at": "2026-04-17T12:00:00Z",
  "updated_at": "2026-04-17T12:00:00Z"
}
```

Notas:

- `clinica_id` y `clinica` representan la misma relación; ambos pueden venir en `null`
- `sede_id` corresponde a `colaborador.sede_principal_id`; si el usuario no tiene colaborador o no tiene sede asignada, viene en `null`
- el frontend debería preferir `clinica_id` para consistencia con el login
- `foto_perfil`, cuando existe, ahora es URL pública directa y no expira

`PATCH /auth/me/` solo admite:

- `telefono`
- `foto_perfil`

Roles y permisos:

- `superadmin` existe solo como usuario técnico/developer-only; no es asignable desde la API tenant.
- El máximo rol asignable dentro de una clínica es `admin`.
- Los roles tenant son dinámicos por clínica y se administran desde `/usuarios/roles/`.
- `rol` en respuestas conserva compatibilidad y representa el slug del rol dinámico si existe.
- `permissions` es la lista de claves de permisos efectivas para el usuario autenticado.

### Recuperar contraseña

`POST /auth/recuperar-password/`

Request:

```json
{
  "email": "admin@demo.com"
}
```

Response:

```json
{
  "ok": true,
  "message": "Si el correo existe, enviaremos instrucciones para recuperar la contrasena."
}
```

Notas:

- este endpoint es público
- la respuesta no revela si el correo existe o no
- backend envía el email usando la configuración SMTP de Resend
- el enlace enviado apunta a `FRONTEND_URL + FRONTEND_PASSWORD_RESET_PATH`

### Validar token de recuperación

`GET /auth/recuperar-password/{token}/`

Response:

```json
{
  "ok": true,
  "email": "admin@demo.com",
  "expires_at": "2026-04-21T18:00:00Z"
}
```

Si el token no es válido o expiró:

```json
{
  "ok": false,
  "error": "El enlace de recuperacion ha expirado."
}
```

### Restablecer contraseña

`POST /auth/restablecer-password/`

Request:

```json
{
  "token": "token-recibido-por-email",
  "nueva_password": "NuevaClave123!",
  "confirmar_password": "NuevaClave123!"
}
```

Response:

```json
{
  "ok": true,
  "message": "La contrasena fue actualizada correctamente."
}
```

Si el token es inválido:

```json
{
  "error": "El enlace de recuperacion no es valido.",
  "code": "PASSWORD_RESET_INVALID_TOKEN"
}
```

## Notificaciones

Prefijo: `/notificaciones`

Estos endpoints permiten que el frontend consulte el estado del canal email y envíe correos administrativos usando SMTP con Resend.

Permisos:

- requieren `Bearer <access_token>`
- roles permitidos: `admin`, `superadmin`, `recepcion`

### Endpoints

- `GET /notificaciones/emails/config/`
- `POST /notificaciones/emails/enviar/`

### Leer configuración efectiva

`GET /notificaciones/emails/config/`

Response:

```json
{
  "provider": "resend",
  "backend": "django.core.mail.backends.smtp.EmailBackend",
  "host": "smtp.resend.com",
  "port": 465,
  "username": "resend",
  "use_tls": false,
  "use_ssl": true,
  "timeout": 10,
  "default_from_email": "CliniQ <no-reply@noreply.2asoft.tech>",
  "configured": true
}
```

Notas:

- `configured=true` significa que backend tiene host, usuario y password configurados
- el frontend debe usar este flag para habilitar o bloquear la UI de envío
- nunca se expone `EMAIL_HOST_PASSWORD`

### Enviar email

`POST /notificaciones/emails/enviar/`

Request:

```json
{
  "to": ["paciente@demo.com"],
  "subject": "Recordatorio de cita",
  "body": "Tu cita está agendada para mañana a las 10:00.",
  "html_body": "<p>Tu cita está agendada para mañana a las <strong>10:00</strong>.</p>",
  "from_email": "CliniQ <no-reply@noreply.2asoft.tech>",
  "cc": ["recepcion@2asoft.tech"],
  "bcc": ["auditoria@2asoft.tech"],
  "reply_to": ["soporte@2asoft.tech"]
}
```

Campos:

- `to`: obligatorio, lista de emails
- `subject`: obligatorio
- `body`: obligatorio, texto plano
- `html_body`: opcional
- `from_email`: opcional; si se omite, backend usa `DEFAULT_FROM_EMAIL`
- `cc`: opcional
- `bcc`: opcional
- `reply_to`: opcional

Response exitosa:

```json
{
  "ok": true,
  "sent": 1,
  "provider": "resend"
}
```

Response de error:

```json
{
  "ok": false,
  "error": "No fue posible enviar el email.",
  "code": "EMAIL_SEND_FAILED",
  "detail": "..."
}
```

Notas para frontend:

- enviar siempre `body`, aunque también se mande `html_body`
- si el remitente no es editable en UI, omitir `from_email`
- `sent` representa la cantidad de mensajes aceptados por el backend de Django

## Clínicas

Prefijo: `/clinicas`

### Endpoints

- `GET /clinicas/clinicas/`
- `GET /clinicas/clinicas/{id}/`
- `PATCH /clinicas/clinicas/{id}/`
- `GET /clinicas/clinicas/{id}/slot_interval/`
- `PATCH /clinicas/clinicas/{id}/slot_interval/`
- `GET /clinicas/sedes/`
- `POST /clinicas/sedes/`
- `GET /clinicas/sedes/{id}/`
- `PATCH /clinicas/sedes/{id}/`
- `DELETE /clinicas/sedes/{id}/`
- `GET /clinicas/procedimientos/`
- `POST /clinicas/procedimientos/`
- `GET /clinicas/procedimientos/{id}/`
- `PATCH /clinicas/procedimientos/{id}/`
- `DELETE /clinicas/procedimientos/{id}/`
- `GET /clinicas/procedimientos/activos/`
- `GET /clinicas/procedimientos/{id}/consentimientos/`
- `POST /clinicas/procedimientos/{id}/consentimientos/`
- `DELETE /clinicas/procedimientos/{id}/consentimientos/{template_id}/`
- `POST /clinicas/procedimientos/{id}/consentimientos/reordenar/`
- `GET /clinicas/procedimientos/{id}/pasos/`
- `POST /clinicas/procedimientos/{id}/pasos/`
- `PATCH /clinicas/procedimientos/{id}/pasos/{paso_id}/`
- `DELETE /clinicas/procedimientos/{id}/pasos/{paso_id}/`
- `POST /clinicas/procedimientos/{id}/pasos/reordenar/`
- `GET /clinicas/servicios/`
- `POST /clinicas/servicios/`
- `GET /clinicas/servicios/{id}/`
- `PATCH /clinicas/servicios/{id}/`
- `DELETE /clinicas/servicios/{id}/`
- `GET /clinicas/tratamientos/`
- `GET /clinicas/tratamientos/activos/`
- `POST /clinicas/tratamientos/`
- `GET /clinicas/tratamientos/{id}/`
- `PATCH /clinicas/tratamientos/{id}/`
- `DELETE /clinicas/tratamientos/{id}/`
- `POST /clinicas/tratamientos/{id}/items/`
- `DELETE /clinicas/tratamientos/{id}/items/{item_id}/`

### Filtros

`sedes`:

- `activa=true|false`
- `ciudad=...`
- `clinica=<uuid>` solo útil para `superadmin`

`procedimientos`:

- `activo=true|false`
- `clinica=<uuid>` solo útil para `superadmin`
- `tiene_protocolo=true|false`

### Búsqueda

`sedes`:

- `search=nombre|ciudad|direccion`

`procedimientos`:

- `search=nombre|descripcion`

Compatibilidad:

- `procedimientos` es el nombre público actual
- `servicios` sigue expuesto como alias legacy y responde el mismo shape

Campos relevantes en `procedimientos`:

- `precio`
- `precio_referencia`
- `vigencia_meses`
- `tiene_protocolo`
- `consentimientos_requeridos`
- `pasos_protocolo`

Reglas:

- `POST /clinicas/procedimientos/` toma la clínica desde el header `X-Clinica-Id`
- `clinica` ya no es obligatoria en el payload de creación; para clientes legacy todavía puede enviarse
- `precio_referencia` es alias de `precio`
- `precio_referencia` es opcional; si no se envía, `precio` queda en `null`
- si se envía `precio` o `precio_referencia`, debe ser mayor a `0`
- `vigencia_meses` debe ser al menos `1`
- los consentimientos requeridos ya no viajan en campos legacy del servicio; ahora viven en la relación `consentimientos_requeridos`
- `tiene_protocolo=true` se calcula automáticamente cuando el servicio tiene al menos un paso activo

Request ejemplo para crear procedimiento:

Headers:

- `X-Clinica-Id: <uuid>`

Body:

```json
{
  "nombre": "Manchas Plus",
  "descripcion": "Protocolo de ejemplo",
  "duracion_min": 45,
  "precio_referencia": "150000.00",
  "vigencia_meses": 12
}
```

Shape actual de un procedimiento:

```json
{
  "id": "uuid",
  "clinica": "uuid",
  "nombre": "Manchas Plus",
  "descripcion": "Protocolo de ejemplo",
  "duracion_min": 45,
  "precio": "150000.00",
  "precio_referencia": "150000.00",
  "vigencia_meses": 12,
  "tiene_protocolo": true,
  "consentimientos_requeridos": [
    {
      "id": "uuid-template",
      "template_id": "uuid-template",
      "template_token": "toxina-botulinica",
      "template_nombre": "Toxina Botulinica",
      "activo": true,
      "orden": 1,
      "tipo": "toxina_botulinica"
    }
  ],
  "pasos_protocolo": [
    {
      "id": "uuid-paso",
      "servicio": "uuid",
      "procedimiento": "uuid",
      "orden": 1,
      "nombre": "CONSULTA DRA.",
      "semana": null,
      "es_control": false,
      "activo": true,
      "created_at": "2026-05-28T00:00:00Z",
      "updated_at": "2026-05-28T00:00:00Z"
    }
  ]
}
```

Gestión nested de consentimientos:

- `GET /clinicas/procedimientos/{id}/consentimientos/`
- `POST /clinicas/procedimientos/{id}/consentimientos/` con `{ "template_id": "uuid", "orden": 1 }`
- `DELETE /clinicas/procedimientos/{id}/consentimientos/{template_id}/`
- `POST /clinicas/procedimientos/{id}/consentimientos/reordenar/` con `[{ "template_id": "uuid", "orden": 2 }]`

Gestión nested de pasos:

- `GET /clinicas/procedimientos/{id}/pasos/`
- `POST /clinicas/procedimientos/{id}/pasos/`
- `PATCH /clinicas/procedimientos/{id}/pasos/{paso_id}/`
- `DELETE /clinicas/procedimientos/{id}/pasos/{paso_id}/` hace soft-delete (`activo=false`)
- `POST /clinicas/procedimientos/{id}/pasos/reordenar/` con `[{ "id": "uuid-paso", "orden": 2 }]`

### Tratamientos

`GET /clinicas/tratamientos/` y `GET /clinicas/tratamientos/{id}/` devuelven:

```json
{
  "id": "uuid",
  "clinica": "uuid",
  "nombre_clinica": "Clinica Demo",
  "nombre": "Plan Rejuvenecimiento Facial",
  "descripcion": "Incluye varias sesiones",
  "precio_estimado": "850000.00",
  "activo": true,
  "total_sesiones": 8,
  "tipos_sesion": [
    {
      "id": "uuid",
      "nombre": "Sesion combinada",
      "cantidad": 3,
      "orden": 1,
      "es_compromiso": true,
      "procedimientos": [
        {
          "id": "uuid",
          "procedimiento": "uuid",
          "nombre": "Limpieza Facial",
          "duracion_min": 60,
          "orden": 1
        }
      ]
    }
  ]
}
```

`POST /clinicas/tratamientos/` acepta `tipos_sesion` anidados:

```json
{
  "clinica": "uuid",
  "nombre": "Plan Rejuvenecimiento Facial",
  "descripcion": "Incluye varias sesiones",
  "precio_estimado": "850000.00",
  "tipos_sesion": [
    {
      "nombre": "Sesion combinada",
      "cantidad": 3,
      "orden": 1,
      "es_compromiso": true,
      "procedimientos": [
        {
          "procedimiento": "uuid",
          "orden": 1
        }
      ]
    }
  ]
}
```

### Clínica

`GET /clinicas/clinicas/`

- `superadmin` ve todas las clínicas
- otros usuarios ven solo su clínica

Campos relevantes:

- `id`
- `nombre`
- `nit`
- `telefono`
- `logo`
- `logo_url`
- `slot_interval_min`
- `activo`
- `created_at`
- `updated_at`

`PATCH /clinicas/clinicas/{id}/`

Permite actualizar los campos editables de la clínica.

Request ejemplo:

```json
{
  "nombre": "Clinica Demo Norte",
  "nit": "901234567-8",
  "telefono": "3001234567",
  "slot_interval_min": 15,
  "activo": true
}
```

Notas:

- `logo` ya no se actualiza por `PATCH /clinicas/clinicas/{id}/`
- requiere rol `admin` o `superadmin`
- para usuarios no `superadmin`, solo aplica sobre su propia clínica

### Mi clínica y logo

`GET /clinicas/mi-clinica/`

Devuelve la clínica asociada al usuario autenticado. Para `superadmin`, puede enviarse `?clinica_id=<uuid>`.

Response ejemplo:

```json
{
  "id": "uuid",
  "nombre": "Clinica Demo Norte",
  "nit": "901234567-8",
  "telefono": "3001234567",
  "ciudad": "Bogota",
  "direccion": "Calle 100 #15-20",
  "logo_url": "http://localhost:9000/clinica-static/clinicas/logos/logo.png"
}
```

`POST /clinicas/mi-clinica/logo/`

Rutas soportadas para cargar o eliminar el logo:

- `POST /clinicas/mi-clinica/logo/`
- `DELETE /clinicas/mi-clinica/logo/`
- `POST /clinicas/clinicas/{id}/logo/`
- `DELETE /clinicas/clinicas/{id}/logo/`

Todas responden con el mismo shape.

- `multipart/form-data`
- campo requerido: `logo`
- tipos permitidos: `image/png`, `image/jpeg`
- la respuesta devuelve URL pública directa, sin firma y sin expiración
- response:

```json
{
  "logo_url": "http://localhost:9000/clinica-static/clinicas/logos/logo.png"
}
```

`DELETE /clinicas/mi-clinica/logo/`

Response:

```json
{
  "logo_url": null
}
```

### Configuración de slots

`GET /clinicas/clinicas/{id}/slot_interval/`

Devuelve la configuración actual de intervalo de slots de la clínica.

Response:

```json
{
  "id": "uuid",
  "nombre": "Clinica Demo",
  "slot_interval_min": 15
}
```

`PATCH /clinicas/clinicas/{id}/slot_interval/`

Permite actualizar el intervalo base con el que `agenda/citas/slots_disponibles/` genera opciones horarias.

Request:

```json
{
  "slot_interval_min": 15
}
```

Reglas:

- rango permitido: `5` a `60`
- requiere rol `admin` o `superadmin`
- para usuarios no `superadmin`, solo aplica sobre su propia clínica

## Colaboradores

Prefijo: `/colaboradores`

### Endpoints

- `GET /colaboradores/`
- `POST /colaboradores/`
- `GET /colaboradores/{id}/`
- `PATCH /colaboradores/{id}/`
- `DELETE /colaboradores/{id}/`
- `GET /colaboradores/profesionales/`
- `GET /colaboradores/horarios/`
- `POST /colaboradores/horarios/`
- `PATCH /colaboradores/horarios/{id}/`
- `DELETE /colaboradores/horarios/{id}/`

### Filtros

- `activo=true|false`
- `tipo_contrato=empleado|contratista|socio`
- `sede_principal=<uuid>`

### Campos de Colaborador (response)

Campos nuevos respecto a la versión anterior:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `rol` | `string` | Slug compatible del rol dinámico del usuario vinculado |
| `role_id` | `string \| null` | UUID del rol dinámico asignado al usuario |
| `role_nombre` | `string \| null` | Nombre legible del rol dinámico |
| `sedes` | `string[]` | IDs de todas las sedes asignadas al colaborador (M2M) |
| `sedes_detalle` | `{id, nombre}[]` | Sedes expandidas (solo lectura) |

`sede_principal` sigue existiendo por compatibilidad, pero ahora puede venir en `null` para colaboradores creados automáticamente en el flujo inicial del tenant cuando aún no existe una sede.
Cuando `sede_principal` existe, el backend garantiza que siempre esté incluida en `sedes`.

### Crear/Actualizar colaborador — campo nuevo

`POST /colaboradores/` y `PATCH /colaboradores/{id}/` aceptan:

```json
{
  "role_id": "uuid-del-rol",
  "sedes_ids": ["uuid-sede-a", "uuid-sede-b"]
}
```

- `role_id` es el mecanismo recomendado para asignar el rol dinámico del usuario vinculado.
- `rol` sigue aceptándose como fallback de compatibilidad; si llega sin `role_id`, el backend busca el rol por `slug`.
- En `POST`, debe enviarse `role_id` o `rol`.
- `superadmin` no es asignable desde este endpoint.
- En `POST`: lista de sedes adicionales a `sede_principal`. Si se omite, el colaborador queda solo en su sede principal.
- En `PATCH`: **reemplaza** completamente el conjunto M2M. Siempre incluir `sede_principal_id` en la lista si no quieres perderla como sede asignada.
- Si `sede_principal` es `null`, no se pueden enviar `sedes_ids`.
- El backend garantiza que `sede_principal` siempre esté en el conjunto `sedes` cuando exista.

Ejemplo de response de `GET /colaboradores/{id}/`:

```json
{
  "id": "uuid",
  "user": "uuid",
  "nombre_completo": "Ana García",
  "first_name": "Ana",
  "last_name": "García",
  "email": "ana@clinica.com",
  "telefono": "3001234567",
  "rol": "profesional",
  "role_id": "uuid-del-rol",
  "role_nombre": "Profesional",
  "es_profesional": true,
  "sede_principal": "uuid",
  "sede_principal_nombre": "Sede Norte",
  "sedes": ["uuid"],
  "sedes_detalle": [{ "id": "uuid", "nombre": "Sede Norte" }],
  "clinica_id": "uuid",
  "tipo_contrato": "empleado",
  "fecha_ingreso": "2026-05-11",
  "numero_documento": "123456789",
  "activo": true
}
```

### Endpoint especial

`GET /colaboradores/profesionales/`

Opcional:

- `sede_id=<uuid>`

Response:

```json
[
  {
    "id": "uuid",
    "colaborador_id": "uuid",
    "nombre_completo": "Paula Profesional",
    "first_name": "Paula",
    "last_name": "Profesional",
    "email": "paula@clinica.com",
    "telefono": "3001234567",
    "rol": "profesional",
    "role_id": "uuid-del-rol",
    "role_nombre": "Profesional",
    "sede_principal": "uuid",
    "sede_principal_nombre": "Sede Norte",
    "especialidades": [
      {
        "id": "uuid",
        "nombre": "Limpieza Facial",
        "duracion_min": 60
      }
    ]
  }
]
```

Notas:

- `id` corresponde al `user.id` del profesional
- `colaborador_id` corresponde al perfil laboral en `/colaboradores/{id}/`
- Este endpoint solo devuelve colaboradores `activo=true` y `user.es_profesional=true`
- `role_id` y `role_nombre` permiten al frontend resolver el rol dinámico sin depender del slug legacy

Nota de tenant:

- Cuando se crea el admin propietario de una clínica, el backend intenta mantener también un `Colaborador` vinculado para ese usuario.
- Si aún no existe sede en la clínica, ese colaborador puede quedar temporalmente con `sede_principal=null` hasta que exista la primera sede.

### Horarios de colaborador

`GET /colaboradores/horarios/?colaborador=<uuid>`

Devuelve los horarios de atención semanales del colaborador. Representa **cuándo** el profesional trabaja en cada sede durante la semana. Si no hay horarios definidos, el cálculo de slots usa el horario completo de la sede como fallback.

Response (lista plana, sin paginación):

```json
[
  {
    "id": "uuid",
    "colaborador": "uuid",
    "sede": "uuid",
    "sede_nombre": "Sede Norte",
    "dia_semana": "lunes",
    "hora_inicio": "08:00",
    "hora_fin": "12:00"
  },
  {
    "id": "uuid",
    "colaborador": "uuid",
    "sede": "uuid-sede-b",
    "sede_nombre": "Sede Sur",
    "dia_semana": "lunes",
    "hora_inicio": "14:00",
    "hora_fin": "18:00"
  }
]
```

`POST /colaboradores/horarios/`

```json
{
  "colaborador": "uuid",
  "sede": "uuid",
  "dia_semana": "lunes",
  "hora_inicio": "08:00",
  "hora_fin": "12:00"
}
```

Restricciones:
- `hora_fin` debe ser mayor que `hora_inicio`
- `sede` debe pertenecer al conjunto de sedes del colaborador
- Combinación `(colaborador, sede, dia_semana)` es única

`PATCH /colaboradores/horarios/{id}/`

Acepta: `hora_inicio`, `hora_fin` (no puede cambiar `colaborador`, `sede` ni `dia_semana`).

`DELETE /colaboradores/horarios/{id}/`

Elimina el horario. No afecta citas ya agendadas.

### `dia_semana` — valores válidos

`lunes | martes | miercoles | jueves | viernes | sabado | domingo`

### Impacto en slots disponibles

Cuando un colaborador tiene `HorarioColaborador` definido para la combinación `sede × dia_semana`, el endpoint `GET /agenda/citas/slots_disponibles/` usa ese rango como ventana horaria disponible en lugar del horario completo de la sede.

Si no hay horario definido para esa combinación, el comportamiento es el mismo que antes (ventana = horario de apertura de la sede).

## Pacientes

Prefijo: `/pacientes`

### Endpoints

- `GET /pacientes/`
- `POST /pacientes/`
- `GET /pacientes/{id}/`
- `PATCH /pacientes/{id}/`
- `DELETE /pacientes/{id}/`
- `GET /pacientes/buscar/`
- `GET /pacientes/{id}/consentimientos/`
- `POST /pacientes/{id}/consentimientos/`
- `GET /pacientes/{id}/consentimientos/verificar/?tratamiento={uuid}`
- `POST /pacientes/{id}/consentimientos/{consentimiento_id}/subir_pdf/`

### Filtros

- `activo=true|false`
- `sexo=M|F|O`
- `canal_confirmacion=whatsapp|sms|llamada`
- `tipo_documento=CC|CE|PA|TI|NIT`

### Búsqueda

Listado:

- `search=nombres|apellidos|numero_documento|telefono|email`

Búsqueda rápida:

- `GET /pacientes/buscar/?q=ana`
- mínimo `3` caracteres
- máximo `10` resultados

Response:

```json
[
  {
    "id": "uuid",
    "nombre_completo": "Ana Maria Gomez Ruiz",
    "numero_documento": "1020304050",
    "tipo_documento": "CC",
    "telefono": "3005551122",
    "canal_confirmacion": "whatsapp"
  }
]
```

### Validaciones importantes

- No se puede crear si `autoriza_datos=false`
- Para `CC` y `TI`, `numero_documento` debe ser numérico

### Consentimientos del paciente

`GET /pacientes/{id}/consentimientos/` devuelve el historial:

```json
[
  {
    "id": "uuid",
    "template_token": "consentimiento-tensamax",
    "template_nombre": "Otros procedimientos",
    "procedimiento": "uuid",
    "procedimiento_nombre": "Tensamax",
    "fecha_firma": "2026-06-01",
    "vigencia_hasta": "2027-05-27",
    "metodo": "presencial_confirmado",
    "archivo_url": "",
    "estado": "vigente"
  }
]
```

`POST /pacientes/{id}/consentimientos/`:

```json
{
  "template_token": "consentimiento-tensamax",
  "template_nombre": "Otros procedimientos",
  "procedimiento": "uuid|null",
  "fecha_firma": "2026-06-01",
  "metodo": "presencial_confirmado",
  "notas": "Firmado en sede"
}
```

`GET /pacientes/{id}/consentimientos/verificar/?tratamiento={uuid}`:

```json
[
  {
    "template_nombre": "Otros procedimientos",
    "template_token": "consentimiento-tensamax",
    "procedimiento": "Tensamax",
    "estado": "vigente"
  }
]
```

## Agenda

Prefijo: `/agenda`

### Citas

- `GET /agenda/citas/`
- `POST /agenda/citas/`
- `GET /agenda/citas/{id}/`
- `PATCH /agenda/citas/{id}/`
- `DELETE /agenda/citas/{id}/`
- `POST /agenda/citas/{id}/cambiar_estado/`
- `GET /agenda/citas/{id}/registros_confirmacion/`
- `PATCH /agenda/citas/{id}/confirmar_manual/`
- `GET /agenda/citas/slots_disponibles/`
- `GET /agenda/citas/hoy/`
- `GET /agenda/citas/recordatorios_pendientes/`
- `POST /agenda/citas/{id}/marcar_recordatorio_enviado/`
- `POST /agenda/citas/{id}/solicitar_recordatorio/`
- `POST /agenda/citas/{id}/enviar_recordatorio_inmediato/`
- `POST /agenda/citas/{id}/iniciar_checkin/`
- `POST /agenda/citas/{id}/verificar_otp/`
- `POST /agenda/citas/{id}/checkin_foto/`

### Bloqueos

- `GET /agenda/bloqueos/`
- `POST /agenda/bloqueos/`
- `GET /agenda/bloqueos/{id}/`
- `PATCH /agenda/bloqueos/{id}/`
- `DELETE /agenda/bloqueos/{id}/`

### Filtros de citas

- `estado=pendiente|confirmada|en_espera|en_curso|completada|cancelada|no_asistio`
- `estado_confirmacion=sin_enviar|enviado|confirmado|sin_respuesta`
- `profesional=<uuid>`
- `sede=<uuid>`
- `fecha_inicio__date=YYYY-MM-DD`
- `canal_origen=presencial|telefono|web|redes`
- `search=<paciente>`

### Crear cita

Request mínimo:

```json
{
  "paciente": "uuid",
  "sede": "uuid",
  "servicio": "uuid",
  "profesional": "uuid",
  "fecha_inicio": "2026-04-13T10:30:00-05:00",
  "canal_origen": "telefono",
  "notas_internas": "Primera cita"
}
```

**Campo `sesion_ejecutada` (opcional):** permite pre-vincular una `SesionProcedimiento` al crear la cita (flujo de agendamiento en modo cotización).

```json
{
  "paciente": "uuid",
  "sede": "uuid",
  "servicio": "uuid|null",
  "profesional": "uuid",
  "fecha_inicio": "2026-04-13T10:30:00-05:00",
  "canal_origen": "presencial",
  "notas_internas": "Sesión 3 de protocolo facial",
  "sesion_ejecutada": "uuid"
}
```

Reglas:
- La sesión debe pertenecer al mismo paciente de la cita.
- La sesión debe estar en `estado = "pendiente"`.
- La sesión no debe tener ya una cita asignada (`cita = null`).
- Si `sesion_ejecutada` provee duración (via `tipo_sesion.duracion_min` o `procedimiento.duracion_min`), el campo `servicio` puede omitirse.
- Al crear la cita, el backend persiste `sesion.cita = <nueva_cita>` como reserva.

Errores nuevos:
```json
{ "error": "La sesión no existe.", "sesion_ejecutada": "..." }
{ "error": "La sesión no pertenece al paciente indicado.", "code": "SESION_PACIENTE_MISMATCH" }
{ "error": "La sesión no está en estado pendiente.", "code": "SESION_NO_PENDIENTE" }
{ "error": "La sesión ya tiene una cita asignada.", "code": "SESION_YA_VINCULADA" }
```

El backend calcula:

- `fecha_fin`
- `canal_confirmacion` desde paciente

Response incluye además:

- `fecha_inicio_real`: datetime nullable, solo lectura
- `fecha_fin_real`: datetime nullable, solo lectura
- `ultimo_registro_confirmacion`: objeto nullable con el último contacto registrado
- `consentimiento_info`: estado del consentimiento informado requerido
- `sesion_ejecutada_id`: uuid nullable, solo lectura — ID de la `SesionProcedimiento` pendiente pre-vinculada a esta cita
- `item_cotizacion_id`: uuid nullable, solo lectura — ID del ítem de cotización vinculado a esta cita
- `cotizacion_resumen`: objeto nullable con resumen del ítem de cotización vinculado (`cotizacion_id`, `descripcion`, `num_citas`, `citas_agendadas`, `citas_restantes`)
- `servicio_precio`: decimal nullable — precio del servicio asociado (campo `precio` del modelo `Servicio`). Útil para pre-llenar el formulario de cobro sin un GET adicional al detalle del servicio. Es `null` si la cita no tiene servicio o si el servicio no tiene precio configurado.
- `checkin_metodo`: `"otp_whatsapp"` | `"foto_presencial"` | `null`
- `checkin_en`: datetime del check-in o `null`
- `checkin_foto_url`: URL firmada de la foto de check-in (solo si `checkin_metodo == "foto_presencial"`)

> **⚠️ `cotizacion_resumen.num_citas` para tratamientos:** este campo devuelve `1` cuando el ítem es de tipo `tratamiento` (representa la cantidad del paquete, no las sesiones). Para obtener el total real de sesiones contratadas, usar `GET /cotizaciones/{cotizacion_id}/sesiones/` y filtrar el ítem por `item_id === item_cotizacion_id`. El campo `num_citas` de ese endpoint sí refleja el total de sesiones calculado desde `tipos_sesion` con `es_compromiso = True`.

`consentimiento_info` incluye:

- `todos_firmados`
- `consentimientos[]`

Si la cita tiene una `SesionProcedimiento` pre-vinculada (`sesion_ejecutada_id` ≠ null), `consentimiento_info` se deriva de los procedimientos de esa sesión (`tipo_sesion.procedimientos` o `sesion.procedimiento`) en lugar del servicio genérico de la cita.

Ejemplo:

```json
{
  "todos_firmados": false,
  "consentimientos": [
    {
      "template_token": "toxina-botulinica",
      "template_nombre": "Toxina Botulinica",
      "vigente": false,
      "consentimiento_id": null
    }
  ]
}
```

Estos campos nunca se envían desde el cliente. El sistema los actualiza así:

- al pasar a `en_curso`, guarda `fecha_inicio_real` con el timestamp actual si aún está vacío
- al pasar a `completada`, guarda `fecha_fin_real` con el timestamp actual si aún está vacío
- al pasar a `cancelada` o `no_asistio`, ambos quedan en `null`

### Cambiar estado

Request:

```json
{
  "estado": "confirmada",
  "motivo_cancelacion": "",
  "medio": "llamada",
  "nota": "Paciente llamo, confirma pero llega 10 min tarde"
}
```

Flujos válidos:

- `pendiente -> confirmada | cancelada`
- `confirmada -> en_espera | cancelada | no_asistio`
- `en_espera -> en_curso | cancelada`
- `en_curso -> completada | cancelada`

Reglas automáticas:

- `en_curso` registra `fecha_inicio_real` si no existe
- `completada` registra `fecha_fin_real` si no existe
- `cancelada` y `no_asistio` limpian `fecha_inicio_real` y `fecha_fin_real`
- si `estado` es `confirmada`, `en_espera`, `cancelada`, `no_asistio` o `en_curso`, se crea un registro de trazabilidad con `medio` y `nota`
- si se intenta pasar de `confirmada` a `en_curso`, backend responde `INVALID_TRANSITION`
- al pasar a `en_curso`, backend valida que todos los consentimientos requeridos por el servicio estén firmados y vigentes

Error posible:

```json
{
  "error": "El paciente tiene consentimientos pendientes de firma.",
  "code": "CONSENTIMIENTO_REQUERIDO",
  "pendientes": ["Toxina Botulinica"]
}
```

### Confirmación manual

`PATCH /agenda/citas/{id}/confirmar_manual/`

Request opcional:

```json
{
  "medio": "whatsapp",
  "nota": "Paciente confirmo por WhatsApp"
}
```

Este endpoint marca `estado_confirmacion=confirmado`, guarda `confirmado_por` y `confirmado_en`, y crea un `RegistroConfirmacion` con `estado_resultante="confirmada"`.

### Registros de confirmación

`GET /agenda/citas/{id}/registros_confirmacion/`

Devuelve lista simple, sin paginación, ordenada por `created_at desc`.

Response:

```json
[
  {
    "id": "uuid",
    "estado_resultante": "confirmada",
    "usuario_nombre": "Maria Lopez",
    "medio": "llamada",
    "nota": "Paciente llamo, confirma pero llega 10 min tarde",
    "created_at": "2026-05-08T10:32:00Z"
  },
  {
    "id": "uuid",
    "estado_resultante": "confirmada",
    "usuario_nombre": "Paciente (autoconfirmacion)",
    "medio": "link",
    "nota": "",
    "created_at": "2026-05-07T18:00:00Z"
  }
]
```

### Slots disponibles

`GET /agenda/citas/slots_disponibles/?profesional_id=<uuid>&sede_id=<uuid>&fecha=YYYY-MM-DD&servicio_id=<uuid>`

Para citas en estado `en_curso`, el cálculo de ocupación usa el rango real:

- inicio ocupado = `fecha_inicio_real`
- fin ocupado = `fecha_inicio_real + servicio.duracion_min`

Si la cita empezó antes de lo programado, esto puede liberar el slot programado original.

Response:

```json
[
  "2026-04-13T08:00:00-05:00",
  "2026-04-13T10:15:00-05:00"
]
```

### Hoy

`GET /agenda/citas/hoy/`

Devuelve lista simple, sin paginación.

## Confirmación de citas

### Pública

Estado actual real del backend:

- `GET /agenda/confirmar/{token}/`

Importante:

- hoy ese `GET` confirma la cita y consume el token
- no hay endpoint separado de `detalle` todavía
- al confirmar por link también se crea un `RegistroConfirmacion` con `estado_resultante="confirmada"` y `medio="link"`

Response exitosa:

```json
{
  "ok": true,
  "paciente_nombre": "Ana Maria Gomez Ruiz",
  "servicio_nombre": "Botox",
  "fecha_inicio": "2026-04-14T16:58:02.763204Z",
  "profesional_nombre": "Paula Profesional"
}
```

### Integración con n8n

Los siguientes endpoints no usan JWT. Usan header:

```http
X-N8N-Secret: <valor de N8N_WEBHOOK_SECRET>
```

Endpoints:

- `GET /agenda/citas/recordatorios_pendientes/`
- `POST /agenda/citas/{id}/marcar_recordatorio_enviado/`

## Historia clínica

Prefijo: `/historia-clinica`

### Endpoints

- `GET /historia-clinica/historias/`
- `GET /historia-clinica/historias/{id}/`
- `PATCH /historia-clinica/historias/{id}/`
- `GET /historia-clinica/historias/{id}/notas/`
- `GET /historia-clinica/historias/{id}/galeria/`
- `GET /historia-clinica/notas/`
- `GET /historia-clinica/notas/{id}/`
- `POST /historia-clinica/notas/`
- `PATCH /historia-clinica/notas/{id}/`
- `POST /historia-clinica/notas/{id}/completar/`
- `POST /historia-clinica/fotos/`
- `DELETE /historia-clinica/fotos/{id}/`
- `GET /historia-clinica/resultados-examenes/?historia=<uuid>`
- `POST /historia-clinica/resultados-examenes/`
- `GET /historia-clinica/resultados-examenes/{id}/`
- `PATCH /historia-clinica/resultados-examenes/{id}/`
- `DELETE /historia-clinica/resultados-examenes/{id}/`
- `GET /historia-clinica/plantillas-ordenes/`
- `POST /historia-clinica/plantillas-ordenes/`
- `GET /historia-clinica/plantillas-ordenes/{id}/`
- `PATCH /historia-clinica/plantillas-ordenes/{id}/`
- `DELETE /historia-clinica/plantillas-ordenes/{id}/`
- `GET /historia-clinica/ordenes-medicas/?historia=<uuid>`
- `POST /historia-clinica/ordenes-medicas/`
- `GET /historia-clinica/ordenes-medicas/{id}/`
- `GET /historia-clinica/ordenes-medicas/{id}/pdf/`
- `POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/`
- `GET /historia-clinica/consentimientos/?paciente=<uuid>`
- `POST /historia-clinica/consentimientos/`
- `PATCH /historia-clinica/consentimientos/{id}/`
- `DELETE /historia-clinica/consentimientos/{id}/`
- `GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>`

### Reglas

- Historias: `PATCH /historias/{id}/` ya **no acepta** `motivo_consulta` ni `plan_manejo`; estos campos son read-only y reflejan la última nota completada
- Notas: flujo borrador → completada; `POST` crea borrador, `PATCH` auto-guarda, `POST completar/` finaliza
- Notas completadas son inmutables (`PATCH` devuelve `400 NOTA_YA_COMPLETADA`)
- Órdenes médicas: inmutables post-creación
- Fotos devuelven `url_firmada`
- Resultados de exámenes devuelven `archivo_url` firmado
- Un profesional solo puede crear nota si es el profesional asignado a la cita
- `DELETE /historia-clinica/fotos/{id}/` disponible para admin
- `GET /historia-clinica/historias/` acepta filtro `?paciente=<uuid>`

### Historia clínica persistente

`GET /historia-clinica/historias/{id}/`

Campos relevantes en respuesta:

- `motivo_consulta` — read-only; refleja `motivo_consulta` de la última nota completada
- `plan_manejo` — read-only; refleja `plan_manejo` de la última nota completada
- `updated_at`

`PATCH /historia-clinica/historias/{id}/`

No acepta `motivo_consulta` ni `plan_manejo`. Si se envían, devuelve:

```json
{
  "error": "Estos campos ya no son editables en la historia. Usa PATCH /notas/{id}/ para actualizar la nota activa.",
  "code": "CAMPOS_DEPRECADOS",
  "campos": ["motivo_consulta"]
}
```

### Notas clínicas (H26 — flujo borrador → completada)

Cada atención genera una `NotaClinica` con ciclo de vida: `borrador` → `completada`.

#### Crear borrador

`POST /historia-clinica/notas/`

Request mínimo:

```json
{ "historia": "uuid" }
```

Con cita:

```json
{ "historia": "uuid", "cita": "uuid" }
```

Response:

```json
{
  "id": "uuid",
  "historia": "uuid",
  "cita": "uuid",
  "estado": "borrador",
  "motivo_consulta": null,
  "plan_manejo": null,
  "profesional_nombre": "Dra. Lopez",
  "fotos": [],
  "examenes": [],
  "ordenes": [],
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T10:00:00Z"
}
```

#### Auto-guardado por tab

`PATCH /historia-clinica/notas/{id}/`

Solo acepta `motivo_consulta` y/o `plan_manejo`. Solo disponible cuando `estado=borrador`.

```json
{ "motivo_consulta": "Consulta por líneas de expresión en frente y entrecejo." }
```

```json
{ "plan_manejo": "Aplicar toxina botulínica y control en 15 días." }
```

Error si la nota ya está completada:

```json
{ "estado": ["No se puede editar una nota ya completada."] }
```

#### Completar atención

`POST /historia-clinica/notas/{id}/completar/`

Request: `{}`

Response: la nota completa con `estado=completada`.

Error si ya estaba completada:

```json
{ "error": "La nota ya está completada.", "code": "NOTA_YA_COMPLETADA" }
```

#### Shape de una nota (GET)

`GET /historia-clinica/notas/{id}/` y `GET /historia-clinica/historias/{id}/notas/`

```json
{
  "id": "uuid",
  "historia": "uuid",
  "cita": "uuid",
  "estado": "completada",
  "motivo_consulta": "Consulta por líneas de expresión en frente y entrecejo.",
  "plan_manejo": "Aplicar toxina botulínica y control en 15 días.",
  "profesional_nombre": "Dra. Lopez",
  "fotos": [
    { "id": "uuid", "tipo": "antes", "url_firmada": "...", "zona": "frente", "descripcion": "...", "created_at": "..." }
  ],
  "examenes": [
    { "id": "uuid", "titulo": "Hemograma", "fecha": "2026-06-01", "descripcion": "...", "archivo_url": "..." }
  ],
  "ordenes": [
    { "id": "uuid", "contenido": "Reposo 3 días.", "plantilla_origen": "uuid|null", "created_at": "..." }
  ],
  "created_at": "2026-06-05T10:00:00Z",
  "updated_at": "2026-06-05T10:30:00Z"
}
```

Notas:

- `examenes` y `ordenes` se asocian a la nota mediante el campo `nota` en sus respectivos endpoints
- `fotos` se asocian a través del campo `nota` en `POST /fotos/`
- campos eliminados respecto a versión anterior: `tipo`, `anamnesis`, `diagnostico`, `observaciones`, `zona_tratada`, `productos_usados`, `tecnica`, `reacciones_adversas`, `cuidados_post`, `proxima_cita_sugerida`, `servicio`, `nota_aclarada`

### Fotos

`POST /historia-clinica/fotos/` es multipart.

Campos:

- `nota`
- `tipo`
- `descripcion`
- `archivo`
- `zona` (opcional) — zona del cuerpo/cara: `frente`, `entrecejo`, `patas_de_gallo`, `labios`, etc. Campo libre.

Tipos:

- `antes`
- `durante`
- `despues`

### Galería del paciente

`GET /historia-clinica/historias/{id}/galeria/`

Parámetros opcionales: `?zona=frente`, `?tipo=antes|durante|despues`, `?cita=<uuid>`

Response:
```json
{
  "total": 24,
  "por_tipo": { "antes": 8, "durante": 6, "despues": 10 },
  "fotos": [
    {
      "id": "uuid",
      "nota": "uuid",
      "cita": "uuid",
      "cita_fecha": "2026-02-10T10:00:00Z",
      "servicio_nombre": "Toxina Botulínica",
      "tipo": "antes",
      "zona": "frente",
      "descripcion": "...",
      "url_firmada": "http://minio:9000/clinica-media/...?...X-Amz-Expires=3600",
      "created_at": "2026-02-10T10:05:00Z"
    }
  ]
}
```

## Resultados de exámenes

Prefijo: `/historia-clinica/resultados-examenes`

### Endpoints

- `GET /historia-clinica/resultados-examenes/?historia=<uuid>`
- `POST /historia-clinica/resultados-examenes/`
- `GET /historia-clinica/resultados-examenes/{id}/`
- `PATCH /historia-clinica/resultados-examenes/{id}/`
- `DELETE /historia-clinica/resultados-examenes/{id}/`

### Reglas

- `GET` listado requiere `?historia=<uuid>`; sin filtro devuelve `[]`
- `POST` acepta `multipart/form-data`
- `archivo_url` siempre es URL firmada temporal
- `DELETE` elimina el registro y el archivo almacenado
- el backend persiste el path del archivo y regenera la firma en cada respuesta
- `nota` es opcional: vincula el resultado a una nota clínica específica

Response ejemplo:

```json
{
  "id": "uuid",
  "historia": "uuid",
  "nota": "uuid|null",
  "titulo": "Hemograma completo",
  "descripcion": "Control preprocedimiento",
  "archivo": "examenes/2026/05/uuid.pdf",
  "archivo_url": "http://minio:9000/clinica-media/...?...X-Amz-Expires=3600",
  "fecha": "2026-05-01",
  "created_by": "uuid",
  "created_by_nombre": "Dr. García",
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-01T10:00:00Z"
}
```

## Plantillas de órdenes médicas

Prefijo: `/historia-clinica/plantillas-ordenes`

### Endpoints

- `GET /historia-clinica/plantillas-ordenes/`
- `POST /historia-clinica/plantillas-ordenes/`
- `GET /historia-clinica/plantillas-ordenes/{id}/`
- `PATCH /historia-clinica/plantillas-ordenes/{id}/`
- `DELETE /historia-clinica/plantillas-ordenes/{id}/`

### Reglas

- el listado filtra `activa=true` por defecto
- `DELETE` hace soft-delete con `activa=false`
- profesionales tienen acceso de lectura
- escritura reservada para `admin`, `superadmin` o rol dinámico `coordinador`

Response ejemplo:

```json
{
  "id": "uuid",
  "nombre": "Receta toxina botulínica estándar",
  "contenido": "Dysport 300 UI\nDisolver en 2.5ml SSN...",
  "permite_edicion_profesional": true,
  "activa": true,
  "created_by": "uuid",
  "created_by_nombre": "Admin Demo",
  "created_at": "2026-05-01T10:00:00Z",
  "updated_at": "2026-05-01T10:00:00Z"
}
```

## Órdenes médicas

Prefijo: `/historia-clinica/ordenes-medicas`

### Endpoints

- `GET /historia-clinica/ordenes-medicas/?historia=<uuid>`
- `POST /historia-clinica/ordenes-medicas/`
- `GET /historia-clinica/ordenes-medicas/{id}/`
- `GET /historia-clinica/ordenes-medicas/{id}/pdf/`
- `POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/`

### Crear orden médica

Request usando plantilla:

```json
{
  "historia": "uuid",
  "cita": "uuid|null",
  "nota": "uuid|null",
  "plantilla_origen": "uuid",
  "contenido": "Texto final de la orden"
}
```

Request sin plantilla:

```json
{
  "historia": "uuid",
  "cita": null,
  "contenido": "Reposo por 3 días. No ejercicio 24 horas."
}
```

### Reglas

- si la plantilla tiene `permite_edicion_profesional=false` y `contenido` difiere del original, responde:

```json
{
  "error": "Esta plantilla no permite modificaciones",
  "code": "PLANTILLA_NO_EDITABLE"
}
```

- si la plantilla sí permite edición y el contenido cambia, la orden queda con:
  - `contenido_original`
  - `fue_editada=true`
  - `auditorias` con el evento de edición

Response ejemplo:

```json
{
  "id": "uuid",
  "historia": "uuid",
  "cita": "uuid|null",
  "plantilla_origen": "uuid|null",
  "plantilla_nombre": "Receta toxina botulínica estándar",
  "contenido": "Texto final de la orden",
  "contenido_original": "Texto base de plantilla",
  "fue_editada": true,
  "profesional": "uuid",
  "profesional_nombre": "Dr. García",
  "auditorias": [
    {
      "id": "uuid",
      "accion": "plantilla_editada",
      "descripcion": "OrdenMedica #uuid editada por Dr. García (plantilla: Receta toxina botulínica estándar)",
      "usuario": "uuid",
      "usuario_nombre": "Dr. García",
      "created_at": "2026-05-01T10:00:00Z"
    }
  ],
  "created_at": "2026-05-01T10:00:00Z"
}
```

### Descargar PDF

`GET /historia-clinica/ordenes-medicas/{id}/pdf/`

Devuelve el PDF de la orden médica como `application/pdf` con `Content-Disposition: inline`.

Incluye: nombre de clínica, paciente, profesional, fecha y contenido de la orden.

### Envío por WhatsApp vía n8n

`POST /historia-clinica/ordenes-medicas/{id}/enviar_whatsapp/`

Response exitosa:

```json
{
  "enviado": true
}
```

Errores posibles:

```json
{
  "error": "Webhook no configurado",
  "code": "WEBHOOK_NOT_CONFIGURED"
}
```

```json
{
  "error": "No se pudo contactar el webhook",
  "code": "WEBHOOK_ERROR"
}
```

Notas:

- requiere `WHATSAPP_OUTBOUND_WEBHOOK_URL` o, por compatibilidad, `ORDEN_WEBHOOK_URL`
- el backend envía al webhook:

```json
{
  "nombre": "Kelly",
  "apellido": "Atencia",
  "telefono": "3010000000",
  "tipo_notificacion": "envio_formula",
  "pdf_base64": "JVBERi0x...",
  "pdf_nombre_archivo": "orden-medica-uuid.pdf",
  "mime_type": "application/pdf",
  "metadata": {
    "orden_id": "uuid",
    "historia_id": "uuid",
    "profesional_nombre": "Dr. Garcia",
    "fecha": "2026-05-26",
    "contenido": "Reposo por 3 dias"
  }
}
```

- no hay autenticación saliente adicional por ahora

## Antecedentes del paciente

Prefijo: `/pacientes`

### Endpoints

- `GET /pacientes/{id}/antecedentes/`
- `PUT /pacientes/{id}/antecedentes/`
- `PATCH /pacientes/{id}/antecedentes/`

### Reglas

- `GET` devuelve `404` si aún no existen antecedentes
- `PUT` hace upsert completo
- `PATCH` hace actualización parcial
- `Paciente` ahora incluye `tiene_antecedentes`
- Acceso: `admin` y `superadmin`; `profesional` solo si tiene citas del paciente

Respuesta ejemplo:

```json
{
  "paciente": "uuid",
  "alergias": "Penicilina, latex",
  "medicamentos_actuales": "Atorvastatina 20mg",
  "condiciones_medicas": "Hipertension controlada",
  "contraindicaciones": "No aplicar toxina botulinica cerca de ojos por ptosis previa",
  "tipo_piel": "II",
  "antecedentes_esteticos": "Rinoplastia 2018. Rellenos en labios 2022",
  "updated_at": "2026-05-08T10:30:00Z"
}
```

Si no existen:

```json
{
  "error": "Sin antecedentes registrados",
  "code": "NOT_FOUND"
}
```

## Consentimientos clínicos

Prefijo: `/historia-clinica/consentimientos`

Este flujo convive con el módulo administrativo existente bajo `/consentimientos`.
Se usa para el semáforo clínico de consentimientos del paciente.

### Endpoints

- `GET /historia-clinica/consentimientos/?paciente=<uuid>`
- `POST /historia-clinica/consentimientos/`
- `PATCH /historia-clinica/consentimientos/{id}/`
- `POST /historia-clinica/consentimientos/{id}/iniciar_firma/`
- `PATCH /historia-clinica/consentimientos/{id}/completar_firma/`
- `DELETE /historia-clinica/consentimientos/{id}/`
- `GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>`

### Reglas

- `GET` lista requiere `?paciente=<uuid>`; sin filtro devuelve `[]`
- `PATCH` permite marcar firmado, subir `archivo` y editar `notas`
- `POST /iniciar_firma/` crea o reutiliza el documento nominal en Documenso y devuelve `signing_token`
- `PATCH /completar_firma/` permite cerrar la firma de Documenso de forma idempotente
- Si `firmado=true`, `fecha_firma` es obligatoria
- `fecha_vencimiento` se calcula automáticamente
- `url_firmada` es temporal y se regenera on-demand
- `DELETE` solo si `firmado=false`
- `GET /resumen/` devuelve los consentimientos existentes y completa faltantes según citas futuras pendientes o confirmadas

### Iniciar firma embebida en Documenso

`POST /historia-clinica/consentimientos/{id}/iniciar_firma/`

Request:

```json
{}
```

Response:

```json
{
  "signing_token": "abc123xyz",
  "documenso_document_id": "envelope_456"
}
```

Errores posibles:

```json
{
  "error": "Error al crear el documento en Documenso.",
  "code": "DOCUMENSO_ERROR"
}
```

Notas:

- el backend crea el documento desde el template con el paciente como destinatario nominal
- si `paciente.email` existe, se usa ese correo; si no, usa `paciente-{paciente.id}@noreply.clinica`
- si el consentimiento ya tenía `documenso_document_id` y `documenso_signing_token`, el endpoint responde el mismo token de forma idempotente
- si el documento ya existía pero faltaba `documenso_signing_token`, el backend intenta recuperarlo desde Documenso
- este endpoint está pensado para que el frontend use `EmbedSignDocument` en lugar de `EmbedDirectTemplate`

### Completar firma desde Documenso

`PATCH /historia-clinica/consentimientos/{id}/completar_firma/`

Request:

```json
{
  "documenso_document_id": "abc123"
}
```

Response:

```json
{
  "id": "uuid",
  "paciente": "uuid",
  "tipo": "otros",
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulinica",
  "template_nombre": "Consentimiento Toxina Botulinica",
  "fecha_firma": "2026-05-13",
  "firmado": true,
  "archivo": null,
  "url_firmada": null,
  "documenso_document_id": "abc123",
  "vigencia_meses": 12,
  "fecha_vencimiento": "2027-05-13",
  "vigente": true,
  "notas": "",
  "created_at": "2026-05-13T10:00:00Z",
  "updated_at": "2026-05-13T10:05:00Z"
}
```

Notas:

- es idempotente; si el consentimiento ya estaba firmado, responde `200` con el registro actual
- este endpoint marca la firma aunque todavía no exista PDF descargado
- `documenso_document_id` queda almacenado para futuras re-descargas o auditoría
- el `documenso_signing_token` se persiste internamente y se obtiene desde `POST /iniciar_firma/`

### Webhook Documenso

`POST /webhooks/documenso/`

Importante:

- vive fuera de `/api/v1/`
- verifica `X-Documenso-Secret` contra `DOCUMENSO_WEBHOOK_SECRET`
- procesa `document.completed` de Documenso y también acepta `DOCUMENT_COMPLETED` por compatibilidad
- si logra descargar el PDF firmado, lo guarda en `archivo`
- si falla la descarga del PDF, el consentimiento igual queda `firmado=true`
- la descarga del PDF usa `DOCUMENSO_API_URL` + `DOCUMENSO_API_KEY`
- el header hacia Documenso es `Authorization: <api_token>` sin prefijo `Bearer`

### Crear consentimiento

Request:

```json
{
  "paciente": "uuid",
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulinica",
  "vigencia_meses": 12,
  "firmado": false,
  "notas": "Pendiente de firma"
}
```

### Resumen de consentimientos

`GET /historia-clinica/consentimientos/resumen/?paciente=<uuid>`

```json
[
  {
    "id": "uuid",
    "paciente": "uuid",
    "tipo": "otros",
    "documenso_template_token": "abc123xyz",
    "documenso_template_nombre": "Consentimiento Toxina Botulinica",
    "template_nombre": "Consentimiento Toxina Botulinica",
    "firmado": true,
    "vigente": true,
    "fecha_firma": "2026-05-01",
    "fecha_vencimiento": "2027-05-01"
  },
  {
    "id": null,
    "paciente": "uuid",
    "tipo": "toxina_botulinica",
    "documenso_template_token": "xyz789abc",
    "documenso_template_nombre": "Consentimiento Rellenos",
    "template_nombre": "Consentimiento Rellenos",
    "firmado": false,
    "vigente": false,
    "fecha_firma": null,
    "fecha_vencimiento": null,
    "documenso_document_id": null,
    "archivo": null,
    "url_firmada": "",
    "vigencia_meses": 12,
    "notas": "",
    "created_at": null,
    "updated_at": null
  }
]
```

## Consentimientos

Prefijo: `/consentimientos`

### Plantillas

- `GET /consentimientos/plantillas/`
- `POST /consentimientos/plantillas/`
- `GET /consentimientos/plantillas/{id}/`
- `PATCH /consentimientos/plantillas/{id}/`
- `DELETE /consentimientos/plantillas/{id}/`

### Consentimientos

- `GET /consentimientos/`
- `GET /consentimientos/{id}/`
- `POST /consentimientos/generar/`
- `POST /consentimientos/{id}/revocar/`
- `POST /consentimientos/firmar/{token}/`

### Generar consentimiento

Request:

```json
{
  "cita_id": "uuid",
  "plantilla_id": "uuid"
}
```

Response incluye:

- `token`
- `token_expira`
- `contenido_snapshot`
- `hash_contenido`
- `estado`

### Firmar consentimiento

`POST /consentimientos/firmar/{token}/`

No requiere JWT.

Response:

```json
{
  "ok": true,
  "consentimiento_id": "uuid",
  "estado": "firmado",
  "firmado_en": "2026-04-13T22:00:00Z",
  "pdf_url": "http://..."
}
```

## Configuración

Prefijo: `/configuracion`

### Templates de Documenso

- `GET /configuracion/documenso-templates/disponibles/`

### Listar templates disponibles en Documenso

`GET /configuracion/documenso-templates/disponibles/`

Llama a la API de Documenso y devuelve los templates de la cuenta mapeados para el frontend.

Request saliente a Documenso:

```http
GET https://documenso.2asoft.tech/api/v2/template
Authorization: {DOCUMENSO_API_KEY}
```

Solo se exponen estos campos:

- `id`: UUID interno del template configurado en la clínica; puede ser `null` si ese template de Documenso aún no está vinculado en la base local
- `documenso_id`: id entero original del template en Documenso
- `nombre`: `title` del template
- `token`: identificador del template usado por el embed de firma. En esta integración se obtiene de `externalId`; el backend también soporta variantes como `publicId` por compatibilidad

Response:

```json
[
  {
    "id": "uuid-local",
    "documenso_id": 1,
    "nombre": "Consentimiento_Informado_Toxina_Botulinica.pdf",
    "token": "toxina-botulinica"
  }
]
```

Notas:

- requiere JWT
- no depende de la clínica configurada en el sistema; consulta los templates de la cuenta Documenso configurada en el backend
- si `DOCUMENSO_API_URL` o `DOCUMENSO_API_KEY` no están configurados, responde `503`
- si Documenso falla o responde inválido, responde `502`

Notas:

- `GET /configuracion/documenso-templates/`, `PUT /configuracion/documenso-templates/{tipo}/` y `DELETE /configuracion/documenso-templates/{tipo}/` quedaron deprecados y responden `410 Gone`
- el frontend debe usar este endpoint para poblar el dropdown de templates al editar servicios

## Inventario

Prefijo: `/inventario`

## Cotizaciones

Prefijo: `/cotizaciones`

### Endpoints

- `GET /cotizaciones/`
- `POST /cotizaciones/`
- `GET /cotizaciones/{id}/`
- `PATCH /cotizaciones/{id}/`
- `DELETE /cotizaciones/{id}/`
- `POST /cotizaciones/{id}/cambiar_estado/`
- `GET /cotizaciones/{id}/pdf/`
- `POST /cotizaciones/{id}/enviar_whatsapp/`
- `POST /cotizaciones/{id}/enviar_email/`
- `POST /cotizaciones/{id}/registrar_envio/`
- `GET /cotizaciones/{id}/envios/`

### Filtros

- `estado=borrador|aceptada|vencida`
- `paciente=<uuid>`
- `profesional=<uuid>`
- `activo=true|false`

Por defecto el listado devuelve solo `activo=true` si no se envía el filtro.

### Crear cotización

Request:

```json
{
  "paciente": "uuid",
  "profesional": "uuid|null",
  "sede": "uuid|null",
  "validez_dias": 30,
  "notas": "Incluye control posterior.",
  "items": [
    {
      "tipo": "tratamiento",
      "tratamiento": "uuid|null",
      "procedimiento": "uuid|null",
      "servicio": "uuid|null",
      "descripcion": "Toxina botulínica - frente + entrecejo",
      "num_citas": 1,
      "duracion_estimada": "45 min",
      "periodicidad": "Cada 4 meses",
      "valor_unitario": "350000.00",
      "descuento_porcentaje": "0.00"
    }
  ],
  "formas_pago": [
    {
      "tipo": "transferencia",
      "descripcion": "Banco XYZ",
      "valor": "350000.00"
    }
  ]
}
```

### Response ejemplo

```json
{
  "id": "uuid",
  "paciente": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "profesional": "uuid",
  "profesional_nombre": "Dr. García",
  "sede": "uuid|null",
  "estado": "borrador",
  "validez_dias": 30,
  "fecha_vencimiento": "2026-06-25",
  "notas": "Incluye control posterior.",
  "items": [
    {
      "id": "uuid",
      "tipo": "procedimiento",
      "tratamiento": "uuid|null",
      "tratamiento_nombre": "Plan Toxina Premium|null",
      "procedimiento": "uuid|null",
      "procedimiento_nombre": "Toxina botulínica|null",
      "servicio": "uuid|null",
      "descripcion": "Toxina botulínica - frente + entrecejo",
      "num_citas": 1,
      "duracion_estimada": "45 min",
      "periodicidad": "Cada 4 meses",
      "valor_unitario": "350000.00",
      "descuento_porcentaje": "0.00",
      "subtotal": "350000.00",
      "citas_agendadas": 0,
      "citas_completadas": 0,
      "citas_restantes": 1
    }
  ],
  "formas_pago": [
    {
      "id": "uuid",
      "tipo": "transferencia",
      "descripcion": "Banco XYZ",
      "valor": "350000.00"
    }
  ],
  "total": "350000.00",
  "activo": true,
  "created_at": "2026-05-26T10:00:00Z",
  "updated_at": "2026-05-26T10:00:00Z"
}
```

### Editar cotización — `PATCH /cotizaciones/{id}/`

Solo permitido cuando `estado=borrador`. Cualquier otro estado devuelve `400 COTIZACION_NO_EDITABLE`.

**Los `items` funcionan con reemplazo completo (full replace):**

- Si el payload incluye `items`, el backend desactiva todos los ítems existentes y crea los del payload como nuevos.
- **No enviar `id` en los ítems** — el backend lo ignora. Cada PATCH genera nuevos ids de servidor.
- Si se omite `items` del payload, los ítems existentes no se tocan.

```json
// PATCH /cotizaciones/{id}/
{
  "notas": "Actualizado.",
  "items": [
    {
      "tipo": "procedimiento",
      "procedimiento": "uuid",
      "descripcion": "Toxina botulínica",
      "num_citas": 1,
      "valor_unitario": "350000.00",
      "descuento_porcentaje": "0.00"
    },
    {
      "tipo": "libre",
      "descripcion": "Consulta de valoración",
      "num_citas": 1,
      "valor_unitario": "80000.00",
      "descuento_porcentaje": "0.00"
    }
  ],
  "formas_pago": [
    {
      "tipo": "transferencia",
      "descripcion": "Banco XYZ",
      "valor": "430000.00"
    }
  ]
}
```

Las `formas_pago` también usan reemplazo completo con la misma lógica. Si viene `id` en una forma de pago y coincide con una existente, se actualiza; si no hay `id` o no coincide, se crea nueva.

### Reglas

- `items[].tipo` acepta `tratamiento`, `procedimiento` o `libre`.
- si `tipo=tratamiento`, `tratamiento` es obligatorio y `procedimiento` queda en `null`.
- si `tipo=procedimiento`, `procedimiento` es obligatorio y `tratamiento` queda en `null`.
- si `tipo=libre`, `tratamiento` y `procedimiento` quedan en `null`.
- `servicio` queda como alias legacy; el frontend nuevo debería preferir `procedimiento`.
- si un item incluye `tratamiento`, backend auto-completa:
  - `descripcion <- tratamiento.nombre` si viene vacía
  - `valor_unitario <- tratamiento.precio_estimado` si viene vacío
  - `num_citas <- suma(cantidad)` de los `tipos_sesion` del tratamiento si viene vacío
- si un item incluye `procedimiento`, backend auto-completa:
  - `descripcion <- procedimiento.nombre` si viene vacía
  - `valor_unitario <- procedimiento.precio` si viene vacío
  - `num_citas <- 1` si viene vacío
  - `duracion_estimada <- "{duracion_min} min"` si viene vacía
- `PATCH` solo permitido si `estado=borrador`
- `DELETE` hace soft-delete y solo está permitido si `estado=borrador`
- cambios de estado válidos:
  - `borrador -> aceptada`

Error de transición inválida:

```json
{
  "error": "Transicion de estado invalida.",
  "code": "INVALID_TRANSITION"
}
```

Error al editar fuera de estados editables:

```json
{
  "error": "Solo se pueden editar cotizaciones en borrador.",
  "code": "COTIZACION_NO_EDITABLE"
}
```

### Cambiar estado

`POST /cotizaciones/{id}/cambiar_estado/`

Request:

```json
{
  "estado": "aceptada"
}
```

Si la cotización queda `aceptada`, la respuesta también puede incluir:

```json
{
  "consentimientos_pendientes": [
    {
      "procedimiento": "Tensamax",
      "template_token": "consentimiento-tensamax",
      "template_nombre": "Otros procedimientos"
    }
  ]
}
```

### PDF

`GET /cotizaciones/{id}/pdf/`

Devuelve `application/pdf` descargable con:

- nombre de la clínica
- paciente
- profesional
- fecha de validez
- tabla de ítems
- total
- formas de pago
- notas

### Sesiones por cotización

`GET /cotizaciones/{id}/sesiones/` devuelve el resumen por ítem e incluye `tipo`.

**Cálculo de `num_citas` según tipo de ítem:**
- `tipo = "procedimiento"` o `tipo = "libre"` → usa `item.num_citas` (lo define el usuario al cotizar).
- `tipo = "tratamiento"` → ignora `item.num_citas` (siempre es 1, representa un paquete) y deriva el total de sesiones de `TratamientoCatalogo.tipos_sesion`, sumando solo los que tienen `es_compromiso = True`. Incluye además `sesiones_detalle` con el desglose por tipo de sesión.

```json
{
  "cotizacion_id": "uuid",
  "paciente_nombre": "Kelly Atencia",
  "items": [
    {
      "item_id": "uuid",
      "tipo": "tratamiento",
      "descripcion": "Plan Toxina Premium",
      "num_citas": 8,
      "periodicidad": "Semanal",
      "citas_agendadas": 1,
      "citas_completadas": 0,
      "citas_restantes": 7,
      "citas": [],
      "sesiones_detalle": [
        { "nombre": "Consulta inicial", "cantidad": 1 },
        { "nombre": "Aplicación", "cantidad": 6 },
        { "nombre": "Control final", "cantidad": 1 }
      ]
    },
    {
      "item_id": "uuid",
      "tipo": "procedimiento",
      "descripcion": "Limpieza facial",
      "num_citas": 3,
      "periodicidad": "Mensual",
      "citas_agendadas": 1,
      "citas_completadas": 1,
      "citas_restantes": 2,
      "citas": []
    }
  ]
}
```

> `sesiones_detalle` solo aparece en ítems de tipo `tratamiento`. Para `procedimiento` y `libre` el campo no se incluye.

### Envío por WhatsApp vía n8n

`POST /cotizaciones/{id}/enviar_whatsapp/`

Response exitosa:

```json
{
  "enviado": true
}
```

Payload saliente al webhook configurado:

```json
{
  "nombre": "Kelly",
  "apellido": "Atencia",
  "telefono": "3010000000",
  "tipo_notificacion": "envio_cotizacion",
  "pdf_base64": "JVBERi0x...",
  "pdf_nombre_archivo": "cotizacion-uuid.pdf",
  "mime_type": "application/pdf",
  "metadata": {
    "cotizacion_id": "uuid",
    "profesional_nombre": "Dr. Garcia",
    "estado": "enviada",
    "fecha_vencimiento": "2026-06-25",
    "total": "350000.00"
  }
}
```

### Categorías

- `GET /inventario/categorias/`
- `POST /inventario/categorias/`
- `GET /inventario/categorias/{id}/`
- `PATCH /inventario/categorias/{id}/`
- `DELETE /inventario/categorias/{id}/`

### Insumos

- `GET /inventario/insumos/`
- `POST /inventario/insumos/`
- `GET /inventario/insumos/{id}/`
- `PATCH /inventario/insumos/{id}/`
- `DELETE /inventario/insumos/{id}/`
- `GET /inventario/insumos/alertas_stock/`
- `POST /inventario/insumos/{id}/ajustar_stock/`

### Kardex

- `GET /inventario/kardex/`
- `GET /inventario/kardex/{id}/`

### Filtros útiles

`insumos`:

- `es_consumo_interno=true|false`
- `es_venta_retail=true|false`
- `categoria=<uuid>`
- `activo=true|false`
- `search=nombre|descripcion`

`kardex`:

- `insumo=<uuid>`
- `tipo=entrada|salida|ajuste_positivo|ajuste_negativo|baja`
- `origen=compra|consumo_cita|venta_retail|ajuste_manual|baja_vencimiento`

### Alertas de stock

`GET /inventario/insumos/alertas_stock/`

Devuelve una lista simple de insumos activos cuyo `stock_actual <= stock_minimo`.

### Ajustar stock

Request:

```json
{
  "cantidad_nueva": "12.500",
  "motivo": "Conteo fisico de cierre"
}
```

Response:

- movimiento creado
- stock resultante
- costo promedio resultante

## Proveedores y órdenes de compra

Prefijo: `/proveedores`

### Proveedores

- `GET /proveedores/proveedores/`
- `POST /proveedores/proveedores/`
- `GET /proveedores/proveedores/{id}/`
- `PATCH /proveedores/proveedores/{id}/`
- `DELETE /proveedores/proveedores/{id}/`

`DELETE` desactiva el proveedor (`activo=false`).

### Órdenes de compra

- `GET /proveedores/ordenes-compra/`
- `POST /proveedores/ordenes-compra/`
- `GET /proveedores/ordenes-compra/{id}/`
- `PATCH /proveedores/ordenes-compra/{id}/`
- `DELETE /proveedores/ordenes-compra/{id}/`
- `POST /proveedores/ordenes-compra/{id}/recibir/`

`DELETE` marca la orden como `cancelada` y `activo=false`.

### Filtros útiles

`proveedores`:

- `categoria=insumos_medicos|productos_belleza|equipos|papeleria|otro`
- `activo=true|false`
- `clinica=<uuid>`
- `search=nombre|nit|contacto|telefono|email`

`ordenes-compra`:

- `estado=borrador|enviada|recibida_parcial|recibida_total|cancelada`
- `proveedor=<uuid>`
- `sede=<uuid>`
- `fecha=YYYY-MM-DD`
- `activo=true|false`
- `search=numero|proveedor|notas`

### Crear orden de compra

Request ejemplo:

```json
{
  "proveedor": "uuid",
  "sede": "uuid",
  "fecha": "2026-04-15",
  "fecha_entrega_esperada": "2026-04-18",
  "estado": "enviada",
  "notas": "Pedido semanal",
  "items": [
    {
      "insumo": "uuid",
      "cantidad": "10.000",
      "precio_unitario": "25000.00"
    },
    {
      "insumo": "uuid",
      "cantidad": "5.000",
      "precio_unitario": "18000.00"
    }
  ]
}
```

Response incluye:

- `numero`
- `estado`
- `total`
- `items[]` con `cantidad_recibida`, `pendiente_recibir` y `subtotal`

### Actualizar orden en borrador o enviada

Se puede enviar `items` completos nuevamente.

Cada item puede incluir:

- `id` si ya existe
- `insumo`
- `cantidad`
- `precio_unitario`

Restricciones:

- no se puede editar una orden `recibida_parcial`, `recibida_total` o `cancelada`
- no se puede editar un item que ya tenga `cantidad_recibida > 0`
- si omites un item aún no recibido, se desactiva lógicamente

### Recibir orden

`POST /proveedores/ordenes-compra/{id}/recibir/`

Request:

```json
{
  "items_recibidos": [
    {
      "item_id": "uuid",
      "cantidad": "4.000"
    },
    {
      "item_id": "uuid",
      "cantidad": "5.000"
    }
  ]
}
```

Comportamiento:

- permite recepción parcial o total
- actualiza `cantidad_recibida` por item
- crea `MovimientoInventario` tipo `entrada` con origen `compra`
- recalcula `stock_actual` y `costo_promedio` del insumo
- cambia estado de la orden a `recibida_parcial` o `recibida_total`

Errores típicos:

- item no pertenece a la orden
- cantidad mayor a la pendiente
- orden cancelada
- orden ya recibida totalmente

## Cobros

> **Relación con cotizaciones:** `FormaPagoCotizacion` (dentro de la cotización) es informativa — declara cómo se acordó pagar. `Cobro` + `PagoRecibido` es el control real: registra la plata efectivamente recibida. Para cobrar una cotización aceptada se crea un `Cobro` con `origen=cotizacion` y `cotizacion=<uuid>`.

Prefijo: `/cobros`

### Endpoints

- `GET /cobros/cobros/`
- `POST /cobros/cobros/`
- `GET /cobros/cobros/{id}/`
- `PATCH /cobros/cobros/{id}/`
- `DELETE /cobros/cobros/{id}/`
- `POST /cobros/cobros/{id}/agregar_item/`
- `DELETE /cobros/cobros/{id}/items/{item_id}/`
- `POST /cobros/cobros/{id}/registrar_pago/`
- `GET /cobros/cobros/resumen/`

### Filtros útiles

- `estado=pendiente|pagado_parcial|pagado|anulado`
- `sede=<uuid>`
- `paciente=<uuid>`
- `profesional=<uuid>`
- `origen=cita|cotizacion|libre`
- `cotizacion=<uuid>`
- `fecha_desde=YYYY-MM-DD`
- `fecha_hasta=YYYY-MM-DD`

Campos nuevos relevantes en response:

- `origen`
- `cotizacion`
- `cotizacion_numero`
- `profesional_nombre`
- `sede_nombre`

### Crear cobro

Request mínimo típico (sin ítems):

```json
{
  "origen": "cita",
  "cita": "uuid",
  "paciente": "uuid",
  "sede": "uuid",
  "notas": "Cobro de cita estética"
}
```

Request con ítems incluidos (crea cobro + ítems en una sola llamada):

```json
{
  "origen": "cita",
  "cita": "uuid",
  "paciente": "uuid",
  "sede": "uuid",
  "items": [
    {
      "tipo": "servicio",
      "servicio": "uuid",
      "cantidad": "1.000",
      "precio_unitario": "150000.00"
    }
  ]
}
```

Si se envían `items`, se crean atómicamente junto con el cobro. El response es el serializer completo del cobro (con `items` y `pagos` anidados).

Si envías `cita` y no envías `profesional`, el backend usa `cita.profesional`.

Reglas por origen:

- `origen=cita`: `cita` requerida y `cotizacion=null`. `origen` default es `cita` — no es necesario enviarlo.
- `origen=cotizacion`: `cotizacion` requerida y `cita=null`
- `origen=libre`: `cita` y `cotizacion` son opcionales

### Agregar item

`POST /cobros/cobros/{id}/agregar_item/`

Request ejemplo para servicio:

```json
{
  "tipo": "servicio",
  "servicio": "uuid",
  "cantidad": "1.000",
  "precio_unitario": "150000.00"
}
```

Request ejemplo para insumo o producto:

```json
{
  "tipo": "producto_retail",
  "insumo": "uuid",
  "cantidad": "1.000",
  "precio_unitario": "90000.00"
}
```

Comportamiento:

- crea `ItemCobro`
- toma snapshot de descripción y costo unitario
- si no es servicio, registra salida de inventario
- recalcula totales y estado del cobro

### Registrar pago

`POST /cobros/cobros/{id}/registrar_pago/`

Request:

```json
{
  "medio_pago": "efectivo",
  "valor": "150000.00",
  "referencia": "Caja 1",
  "fecha": "2026-05-27T10:00:00Z"
}
```

Acepta `valor: "0.00"` para cortesías o registros de pago diferido. Estado resultante:

- `valor > 0` y cubre el total → `pagado`
- `valor > 0` pero no cubre el total → `pagado_parcial`
- `valor = 0` → estado queda `pendiente` si no hay otros pagos, `pagado_parcial` si ya había

Comportamiento:

- crea `PagoRecibido`
- actualiza estado del cobro a `pagado_parcial` o `pagado`

Response ejemplo de `GET /cobros/cobros/`:

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "uuid",
      "origen": "cotizacion",
      "cotizacion": "uuid",
      "cotizacion_numero": "COT-0043ABCD",
      "cita": null,
      "paciente": "uuid",
      "paciente_nombre": "Kelly Atencia",
      "profesional": "uuid",
      "profesional_nombre": "Ana Garcia",
      "sede": "uuid",
      "sede_nombre": "Sede Norte",
      "fecha": "2026-05-27T10:00:00Z",
      "subtotal": "700000.00",
      "descuento": "0.00",
      "total": "700000.00",
      "estado": "pagado",
      "notas": "Ingreso generado desde cuota de cartera.",
      "saldo_pendiente": "0.00",
      "items": [],
      "pagos": [
        {
          "id": "uuid",
          "cobro": "uuid",
          "medio_pago": "transferencia",
          "valor": "700000.00",
          "referencia": "TXN-8821",
          "fecha": "2026-05-27T10:00:00Z",
          "recibido_por": "uuid",
          "recibido_por_nombre": "Root Cobros",
          "created_at": "2026-05-27T10:00:00Z"
        }
      ],
      "created_by": "uuid",
      "created_at": "2026-05-27T10:00:00Z",
      "updated_at": "2026-05-27T10:00:00Z"
    }
  ]
}
```

### Resumen de ingresos

`GET /cobros/cobros/resumen/`

Devuelve ingresos reales registrados por `PagoRecibido`, agrupados por origen.

Response:

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

### Anular cobro

`DELETE /cobros/cobros/{id}/`

Comportamiento:

- no borra físicamente
- cambia estado a `anulado`
- falla si ya tiene pagos registrados

## Cartera

Prefijo: `/cartera`

### Endpoints

- `GET /cartera/`
- `GET /cartera/{id}/`
- `GET /cartera/resumen/`
- `PATCH /cartera/cuotas/{id}/registrar_pago/`

### Registrar pago de cuota

`PATCH /cartera/cuotas/{id}/registrar_pago/`

Request:

```json
{
  "valor_pagado": "350000.00",
  "fecha_pago": "2026-05-27",
  "medio_pago": "transferencia",
  "referencia": "TXN-8821",
  "observaciones": "Nequi"
}
```

Comportamiento:

- marca la cuota como pagada
- crea o reutiliza un `Cobro` con `origen=cotizacion`
- registra un `PagoRecibido` asociado a ese cobro
- permite trazar ingresos de cartera en el mismo libro de `cobros`

Response:

```json
{
  "cuota": {
    "id": "uuid",
    "tipo": "transferencia",
    "descripcion": "Cuota 1",
    "valor_esperado": "350000.00",
    "fecha_esperada": null,
    "pagada": true,
    "valor_pagado": "350000.00",
    "fecha_pago": "2026-05-27",
    "medio_pago": "transferencia",
    "observaciones": "Nequi"
  },
  "cobro_id": "uuid",
  "pago_id": "uuid"
}
```

## Campos y enums útiles para frontend

### Usuario

- `rol`: slug del rol dinámico de la clínica (`admin`, `recepcion`, `profesional` o roles personalizados como `auxiliar`)
- `role_id`: UUID del rol dinámico
- `permissions`: claves de permisos efectivas para el usuario

### Paciente

- `tipo_documento`: `CC | CE | PA | TI | NIT`
- `sexo`: `M | F | O`
- `canal_confirmacion`: `whatsapp | sms | llamada`

### Cita

- `estado`: `pendiente | confirmada | en_curso | completada | cancelada | no_asistio`
- `estado_confirmacion`: `sin_enviar | enviado | confirmado | sin_respuesta`
- `canal_origen`: `presencial | telefono | web | redes`

### Colaborador

- `tipo_contrato`: `empleado | contratista | socio`

### Nota clínica

- `tipo`: `consulta | procedimiento | evolucion | aclaratoria`

### Foto clínica

- `tipo`: `antes | durante | despues`
- `zona`: campo libre — ejemplos: `frente`, `entrecejo`, `patas_de_gallo`, `labios`, `surco_nasogeniano`, `zona_ocular`, `cuello`, `cara_completa`, `escote`, `manos`

### Consentimiento

- `estado`: `pendiente | firmado | revocado`

### Insumo

- `es_consumo_interno`: `true | false` (default `true`)
- `es_venta_retail`: `true | false` (default `false`)
- Al menos uno debe ser `true`
- `unidad_medida`: `unidad | ml | gr | cm | par | caja`

### Proveedor

- `categoria`: `insumos_medicos | productos_belleza | equipos | papeleria | otro`

### Orden de compra

- `estado`: `borrador | enviada | recibida_parcial | recibida_total | cancelada`

### Cobro

- `estado`: `pendiente | pagado_parcial | pagado | anulado`

### Pago recibido

- `medio_pago`: `efectivo | tarjeta_debito | tarjeta_credito | transferencia | otro`

## Recomendaciones para el agente del frontend

- Centraliza llamadas HTTP en `/src/lib/api/*.ts`
- No hagas `fetch` directo en componentes
- Asume Bearer token por ahora
- Usa `search` para listados y `buscar/` para autocompletes
- Trata `url_firmada` como efímera; no la caches mucho tiempo
- En recepción de órdenes, refresca también vistas de inventario si muestras stock en paralelo
- Varias pantallas ya pueden construirse con el backend actual:
  - login
  - pacientes
  - agenda
  - historia clínica
  - consentimientos
  - inventario básico
  - proveedores y órdenes de compra
  - cobros

## Usuarios, roles y permisos

Prefijo: `/usuarios`

> Gestión de usuarios, roles dinámicos y permisos por clínica. Distinto de `/auth/` (solo usuario autenticado) y de `/colaboradores/` (perfiles laborales de profesionales/recepción con sede y especialidades).

### Endpoints

- `GET /usuarios/`
- `POST /usuarios/`
- `GET /usuarios/{id}/`
- `PATCH /usuarios/{id}/`
- `DELETE /usuarios/{id}/`
- `POST /usuarios/{id}/cambiar_password/`
- `POST /usuarios/{id}/activar/`
- `POST /usuarios/{id}/desactivar/`
- `GET /usuarios/permisos/`
- `GET /usuarios/roles/`
- `POST /usuarios/roles/`
- `GET /usuarios/roles/{id}/`
- `PATCH /usuarios/roles/{id}/`
- `DELETE /usuarios/roles/{id}/`
- `PUT /usuarios/roles/{id}/permisos/`

### Filtros

- `rol=<slug del rol dinámico>`
- `activo=true|false`
- `search=first_name|last_name|email`

### Crear usuario

`POST /usuarios/`

Request:
```json
{
  "email": "nuevo@clinica.com",
  "first_name": "María",
  "last_name": "López",
  "password": "segura1234",
  "rol": "admin",
  "telefono": "3001234567"
}
```

También puede enviarse `role_id` en lugar de `rol`:

```json
{
  "email": "auxiliar@clinica.com",
  "first_name": "Ana",
  "last_name": "Operaciones",
  "password": "segura1234",
  "role_id": "uuid",
  "telefono": "3001234567"
}
```

Notas:

- `rol` es compatible con el flujo legacy y resuelve el slug del rol dinámico de la clínica.
- `role_id` y `rol` son excluyentes.
- No se puede asignar `superadmin`; es técnico/developer-only.
- Para crear profesionales con perfil laboral usar `/colaboradores/`.

### Response común (lectura)

```json
{
  "id": "uuid",
  "email": "nuevo@clinica.com",
  "first_name": "María",
  "last_name": "López",
  "nombre_completo": "María López",
  "rol": "admin",
  "role_id": "uuid",
  "role_nombre": "Administrador",
  "permissions": ["agenda.citas.ver", "usuarios.ver"],
  "telefono": "3001234567",
  "foto_perfil": null,
  "activo": true,
  "tiene_colaborador": false,
  "sede_principal_nombre": null,
  "created_at": "2026-04-16T10:00:00Z"
}
```

### Cambiar contraseña

`POST /usuarios/{id}/cambiar_password/`

```json
{ "nueva_password": "nuevaClave123" }
```

Permitido para el propio usuario o para admin.

### Eliminar usuario

`DELETE /usuarios/{id}/`

Sin body.

Response `204 No Content` si el usuario no tiene relaciones protegidas.

Errores posibles:

- `400` si intentas eliminarte a ti mismo
- `400` si el usuario tiene registros asociados (por ejemplo: colaborador, citas, cobros, inventario, historia clínica, órdenes de compra)

Ejemplo de error:

```json
{
  "error": "No se puede eliminar el usuario porque tiene registros asociados en: colaboradores, citas, cobros.",
  "code": "USER_DELETE_PROTECTED"
}
```

### Activar / Desactivar

`POST /usuarios/{id}/activar/`
`POST /usuarios/{id}/desactivar/`

Sin body. Retorna el usuario actualizado.
No se puede desactivar al propio usuario autenticado.

### Permisos

- Los endpoints de usuarios requieren permisos dinámicos `usuarios.*`.
- La administración de roles requiere permisos dinámicos `roles.*`.
- Admin queda scoped a su clínica; `superadmin` técnico conserva bypass interno.
- No se puede asignar ni escalar a `superadmin`.
- No se puede editar/eliminar el rol `admin`.
- No se puede eliminar un rol con usuarios asignados.
- No se pueden asignar permisos con `assignable=false` a roles editables.

### Permisos disponibles

`GET /usuarios/permisos/`

Devuelve permisos activos y asignables, agrupados por módulo:

```json
[
  {
    "modulo": "agenda",
    "permisos": [
      {
        "id": "uuid",
        "clave": "agenda.citas.crear",
        "modulo": "agenda",
        "accion": "citas.crear",
        "descripcion": "Crear citas"
      }
    ]
  }
]
```

### Roles

`GET /usuarios/roles/`

Response:

```json
[
  {
    "id": "uuid",
    "slug": "recepcion",
    "nombre": "Recepcion",
    "descripcion": "Rol operativo de recepcion.",
    "es_sistema": true,
    "editable": true,
    "es_profesional": false,
    "activo": true,
    "permission_keys": ["agenda.citas.ver", "agenda.citas.crear"],
    "usuarios_count": 2,
    "created_at": "2026-05-11T10:00:00Z",
    "updated_at": "2026-05-11T10:00:00Z"
  }
]
```

Crear rol:

```json
{
  "slug": "auxiliar",
  "nombre": "Auxiliar operativo",
  "descripcion": "Gestiona flujos operativos de atención.",
  "es_profesional": false
}
```

Actualizar permisos:

`PUT /usuarios/roles/{id}/permisos/`

```json
{
  "permission_keys": [
    "pacientes.ver",
    "agenda.citas.ver",
    "agenda.citas.crear"
  ]
}
```

Notas:

- `es_profesional=true` indica que el rol habilita perfil profesional, especialidades y flujos de atención.
- El rol built-in `profesional` sale con `es_profesional=true`.
- El frontend puede usar `es_profesional` para decidir si muestra campos como especialidades y horarios al editar un colaborador.

---

## Reportes ⚠️ pendiente de implementar en backend

Prefijo: `/reportes`

> Estos endpoints aún no están en producción. Se documentan aquí como contrato acordado para que el frontend pueda construir contra ellos en cuanto el backend los entregue.

### Endpoints

- `GET /reportes/dashboard/`
- `GET /reportes/ingresos/`
- `GET /reportes/servicios/`
- `GET /reportes/ocupacion/`

### Dashboard

`GET /reportes/dashboard/?sede_id=<uuid>&fecha=YYYY-MM-DD`

`sede_id` y `fecha` son opcionales. Default: sede del usuario y fecha de hoy.

Response:
```json
{
  "citas_hoy": {
    "total": 8,
    "pendientes": 2,
    "confirmadas": 3,
    "en_curso": 1,
    "completadas": 2,
    "canceladas": 0,
    "no_asistio": 0
  },
  "cobros_hoy": {
    "total_cop": "450000.00",
    "pagados": 3,
    "pendientes": 1,
    "por_medio_pago": [
      { "medio": "efectivo", "total": "200000.00" },
      { "medio": "transferencia", "total": "250000.00" }
    ]
  },
  "stock_alertas": 2,
  "ingresos_semana": [
    { "fecha": "2026-04-10", "total": "320000.00" },
    { "fecha": "2026-04-11", "total": "0.00" }
  ]
}
```

### Ingresos

`GET /reportes/ingresos/?sede_id=&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD&agrupar_por=dia|semana|mes`

Response:
```json
[
  { "periodo": "2026-04-10", "total_cobros": "450000.00", "total_gastos": "30000.00" }
]
```

### Servicios

`GET /reportes/servicios/?sede_id=&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`

Default: mes en curso.

Response:
```json
[
  {
    "servicio_nombre": "Botox",
    "cantidad_citas": 12,
    "ingresos": "1800000.00",
    "costo_insumos": "360000.00",
    "margen": "1440000.00",
    "margen_pct": "80.00"
  }
]
```

### Ocupación

`GET /reportes/ocupacion/?sede_id=&fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`

Default: mes en curso.

Response:
```json
[
  {
    "profesional_id": "uuid",
    "profesional_nombre": "Dra. Paula Ríos",
    "total_citas": 20,
    "completadas": 17,
    "canceladas": 2,
    "no_asistio": 1,
    "tasa_completadas_pct": "85.00"
  }
]
```

## Consentimientos ligados a templates de Documenso

### Contexto

El flujo operativo ahora usa directamente `documenso_template_token` y `documenso_template_nombre`.
El campo `tipo_consentimiento` queda solo como legado de transición y ya no participa en las validaciones principales.
Cada servicio también define `vigencia_meses`, que el frontend usa al crear consentimientos.

---

### 1. Cambio en `Servicio`

Reemplazar `tipo_consentimiento: TipoConsentimiento` por dos campos nuevos:

| campo | tipo | descripción |
|---|---|---|
| `documenso_template_token` | `string \| null` | identificador del template en Documenso usado por el embed; actualmente se resuelve desde `externalId` |
| `documenso_template_nombre` | `string \| null` | `title` del template, guardado en el momento de la asignación para mostrarlo sin re-fetch |
| `vigencia_meses` | `number` | vigencia configurada para el consentimiento requerido por ese servicio |

Regla: si `requiere_consentimiento=true`, `documenso_template_token` es obligatorio.

Request actualizado para `POST /clinicas/servicios/` y `PATCH /clinicas/servicios/{id}/`:

```json
{
  "nombre": "Toxina Botulínica Frente",
  "duracion_min": 30,
  "requiere_consentimiento": true,
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica",
  "vigencia_meses": 12
}
```

Response actualizado:

```json
{
  "id": "uuid",
  "nombre": "Toxina Botulínica Frente",
  "requiere_consentimiento": true,
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica",
  "vigencia_meses": 12,
  "activo": true
}
```

El campo `tipo_consentimiento` queda deprecado y se puede ignorar.

---

### 2. Cambio en `ConsentimientoInfo` dentro de `Cita`

El campo `tipo` pasa a ser el `documenso_template_token` del servicio asociado a la cita.
Se agrega `template_nombre` para mostrarlo en UI sin fetch adicional.

Response actualizado de `Cita`:

```json
{
  "consentimiento_info": {
    "requerido": true,
    "token": "abc123xyz",
    "template_nombre": "Consentimiento Toxina Botulínica",
    "vigente": false,
    "consentimiento_id": null,
    "vigencia_meses": 12
  }
}
```

El campo `tipo` (enum) desaparece de `consentimiento_info`.

---

### 3. Cambio en `POST /historia-clinica/consentimientos/`

El campo `tipo` (enum) se reemplaza por `documenso_template_token` y `documenso_template_nombre`.

Request actualizado:

```json
{
  "paciente": "uuid",
  "documenso_template_token": "abc123xyz",
  "documenso_template_nombre": "Consentimiento Toxina Botulínica",
  "notas": ""
}
```

Response actualizado — `tipo` desaparece, se reemplaza por los dos campos nuevos:

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

### 4. Cambio en `GET /historia-clinica/consentimientos/resumen/`

Hoy devuelve siempre los 7 tipos hardcodeados. Pasa a devolver solo los consentimientos
que existen para ese paciente, más los que el servicio de cada cita futura requiere y aún no están firmados.

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

### 5. Cambio en validación `en_curso`

La validación al pasar una cita a `en_curso` deja de comparar por `tipo_consentimiento` (enum)
y pasa a verificar que exista un `ConsentimientoInformado` firmado y vigente cuyo
`documenso_template_token` coincida con el del servicio de la cita.

Error response actualizado:

```json
{
  "error": "El paciente no tiene el consentimiento firmado y vigente requerido para este procedimiento.",
  "code": "CONSENTIMIENTO_REQUERIDO",
  "documenso_template_token": "abc123xyz",
  "template_nombre": "Consentimiento Toxina Botulínica"
}
```

---

### 6. Deprecar `/configuracion/documenso-templates/`

Los endpoints `GET /configuracion/documenso-templates/`, `PUT /configuracion/documenso-templates/{tipo}/`
y `DELETE /configuracion/documenso-templates/{tipo}/` quedan deprecados.

El único endpoint de configuración que se mantiene es:

```
GET /configuracion/documenso-templates/disponibles/
```

que ya existe y es el que alimenta el dropdown del formulario de servicios.

---

## Protocolos

Prefijo: `/protocolos`

### Endpoints

- `GET /protocolos/tratamientos/`
- `POST /protocolos/tratamientos/`
- `GET /protocolos/tratamientos/{id}/`
- `PATCH /protocolos/tratamientos/{id}/`
- `DELETE /protocolos/tratamientos/{id}/`
- `POST /protocolos/sesiones/{id}/marcar_completado/`
- `POST /protocolos/sesiones/{id}/marcar_completada/`
- `POST /protocolos/sesiones/{id}/marcar_inasistencia/`
- `GET /protocolos/sesiones/{id}/consentimientos/`
- `POST /protocolos/sesiones/{id}/iniciar_checkin/`
- `POST /protocolos/sesiones/{id}/verificar_otp/`
- `POST /protocolos/sesiones/{id}/checkin_foto/`

### Tratamientos

Filtros:

- `paciente=<uuid>`
- `servicio=<uuid>`
- `tratamiento_catalogo=<uuid>`
- `estado=activo|completado|abandonado`
- `activo=true|false`
- `cotizacion_item=<uuid>` ⚠️ pendiente de implementar (H30.1) — no usar hasta confirmación

`GET /protocolos/tratamientos/` devuelve resumen **sin** sesiones anidadas.

`GET /protocolos/tratamientos/{id}/` devuelve además `sesiones` y `grupos`.

> Flujo recomendado para obtener sesiones de un ítem de cotización (hasta H30.1): `GET /protocolos/tratamientos/?paciente=<id>` → filtrar cliente por `cotizacion_item` → `GET /protocolos/tratamientos/{id}/` para obtener `grupos[].sesiones` con `estado = "pendiente"`.

Shape de tratamiento:

```json
{
  "id": "uuid",
  "paciente": "uuid",
  "paciente_nombre": "Maria Garcia",
  "servicio": "uuid|null",
  "servicio_nombre": "Manchas Plus|null",
  "tratamiento_catalogo": "uuid|null",
  "tratamiento_catalogo_nombre": "Plan Rejuvenecimiento Facial|null",
  "cotizacion_item": "uuid|null",
  "estado": "activo",
  "fecha_inicio": "2026-05-28",
  "activo": true,
  "total_pasos": 4,
  "pasos_completados": 1,
  "total_sesiones": 10,
  "sesiones_completadas": 4,
  "grupos": [
    {
      "tipo_sesion_id": "uuid",
      "tipo_sesion_nombre": "Sesion Tensamax",
      "procedimientos": ["Tensamax"],
      "total": 7,
      "completadas": 3,
      "pendientes": 4,
      "sesiones": []
    }
  ],
  "progreso_pct": 25
}
```

Shape de sesión:

```json
{
  "id": "uuid",
  "tratamiento": "uuid",
  "tipo_sesion": "uuid|null",
  "numero": 1,
  "paso": "uuid|null",
  "procedimiento": "uuid|null",
  "paso_nombre": "LASER IPL",
  "paso_orden": 3,
  "paso_semana": null,
  "paso_es_control": false,
  "cita": "uuid|null",
  "estado": "pendiente",
  "fecha": null,
  "hora": null,
  "profesional": null,
  "profesional_nombre": null,
  "observaciones": "",
  "procedimientos_ejecutados": ["Tensamax"],
  "consentimientos": [],
  "forzado_sin_consentimiento": false,
  "motivo_forzado": "",
  "checkin_verificado": false,
  "checkin_metodo": null,
  "checkin_en": null,
  "foto_presencia_url": "http://minio:9000/clinica-media/...?...X-Amz-Expires=3600"
}
```

Notas:

- `foto_presencia_url` es privada y temporal
- el backend guarda el path interno y genera una firma nueva al serializar la sesión

### Consentimientos por sesión

`GET /protocolos/sesiones/{id}/consentimientos/`:

```json
{
  "sesion_id": "uuid",
  "tipo_sesion_nombre": "Sesion combinada",
  "puede_ejecutar": false,
  "consentimientos": [
    {
      "procedimiento": "Tensamax",
      "template_nombre": "Otros procedimientos",
      "estado": "faltante",
      "accion": "firmar"
    }
  ]
}
```

`POST /protocolos/sesiones/{id}/marcar_completada/` acepta:

```json
{
  "procedimientos_ejecutados": ["uuid"],
  "cita_id": "uuid|null",
  "observaciones": "",
  "forzar_sin_consentimiento": false,
  "motivo": ""
}
```

Si faltan consentimientos:

```json
{
  "error": "Consentimientos requeridos faltantes o vencidos",
  "code": "CONSENTIMIENTOS_FALTANTES",
  "faltantes": [
    {
      "estado": "faltante",
      "procedimiento": "Tensamax",
      "template_token": "consentimiento-tensamax",
      "template_nombre": "Otros procedimientos",
      "accion": "firmar"
    }
  ]
}
```

### Check-in

`POST /protocolos/sesiones/{id}/iniciar_checkin/`

Response si se envía OTP:

```json
{
  "otp_enviado": true,
  "expira_en": "2026-05-28T11:15:00Z"
}
```

Response si ya existe uno vigente:

```json
{
  "otp_activo": true,
  "expira_en": "2026-05-28T11:15:00Z"
}
```

`POST /protocolos/sesiones/{id}/verificar_otp/`

Request:

```json
{
  "codigo": "472183"
}
```

Error posible:

```json
{
  "error": "Codigo incorrecto",
  "code": "OTP_INVALID",
  "intentos_restantes": 2
}
```

`POST /protocolos/sesiones/{id}/checkin_foto/` recibe multipart con campo `foto`.

### Auto-creación desde cotización

- `ItemCotizacion` puede incluir `tratamiento`, `procedimiento` o `servicio` legacy
- si el item incluye `tratamiento`, al aceptar la cotización backend crea:
  - `TratamientoPaciente` con `tratamiento_catalogo`
  - una `SesionProcedimiento` por cada `TratamientoProcedimiento`, repetida según `cantidad`
- si el item incluye `procedimiento` y ese procedimiento tiene protocolo, backend conserva el flujo de procedimiento individual:
  - `TratamientoPaciente`
  - `SesionProcedimiento` por cada paso activo del procedimiento
- `servicio` sigue funcionando como alias legacy de `procedimiento` para clientes antiguos

---

## Recordatorios de Citas

El sistema de recordatorios tiene dos modos:

- **Pull (automático):** n8n consulta periódicamente el endpoint de la API y procesa las citas pendientes.
- **Push (inmediato):** el frontend llama a un endpoint del backend que notifica a n8n en el acto para envío puntual.

### Flujo general

1. **n8n** corre un trigger por tiempo (ej: cada 10 minutos)
2. n8n hace `GET /agenda/citas/recordatorios_pendientes/` con header `X-N8N-Secret`
3. El backend retorna las citas que cumplen las condiciones de recordatorio
4. n8n envía el mensaje (WhatsApp/SMS) con los datos de la respuesta
5. n8n llama `POST /agenda/citas/{id}/marcar_recordatorio_enviado/` para cerrar el ciclo

### Configuración por clínica

```
GET  /api/v1/clinicas/{id}/recordatorio_config/
PATCH /api/v1/clinicas/{id}/recordatorio_config/
```

Auth: `Authorization: Bearer <token>` — requiere permiso `clinicas.editar`

**Response / Request body (PATCH):**

```json
{
  "id": "uuid",
  "nombre": "Clínica Ejemplo",
  "recordatorios_automaticos": true,
  "intervalo_recordatorio_horas": 24
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `recordatorios_automaticos` | boolean | Si `false`, la clínica no aparece en el polling de n8n |
| `intervalo_recordatorio_horas` | integer (1-720) | Horas antes de la cita para enviar el recordatorio. Ej: `24` = 1 día antes, `1` = 1 hora antes |

---

### Endpoint para n8n: citas pendientes de recordatorio

```
GET /api/v1/agenda/citas/recordatorios_pendientes/
```

Auth: header `X-N8N-Secret: <valor_de_N8N_WEBHOOK_SECRET>` (sin JWT)

Retorna citas que necesitan recordatorio en la próxima ventana, incluyendo recordatorios manuales solicitados desde la UI.

**Response:**

```json
[
  {
    "id": "uuid-cita",
    "clinica_id": "uuid",
    "clinica_nombre": "Clínica Ejemplo",
    "sede_id": "uuid",
    "sede_nombre": "Sede Principal",
    "sede_telefono": "+573001234567",
    "paciente_nombre": "Juan Pérez",
    "paciente_telefono": "+573009876543",
    "paciente_email": "juan@email.com",
    "servicio_nombre": "Consulta General",
    "profesional_nombre": "Dra. Ana García",
    "fecha_inicio": "2026-06-08T10:00:00-05:00",
    "fecha_fin": "2026-06-08T10:30:00-05:00",
    "canal_confirmacion": "whatsapp",
    "tipo_recordatorio": "automatico",
    "estado": "pendiente",
    "estado_confirmacion": "sin_enviar",
    "recordatorio_enviado": false
  }
]
```

`tipo_recordatorio` puede ser `"automatico"` o `"manual"`. n8n puede usarlo para personalizar el mensaje o el canal de envío.

---

### Endpoint para n8n: marcar recordatorio como enviado

```
POST /api/v1/agenda/citas/{id}/marcar_recordatorio_enviado/
```

Auth: header `X-N8N-Secret: <valor_de_N8N_WEBHOOK_SECRET>` (sin JWT)

Llamar después de enviar el mensaje. Setea `recordatorio_enviado=true`, limpia `recordatorio_manual_pendiente` y actualiza `estado_confirmacion` a `enviado` si estaba en `sin_enviar`.

**Response:** serializer completo de la cita (`CitaSerializer`).

---

### Solicitar recordatorio manual (encola para n8n)

```
POST /api/v1/agenda/citas/{id}/solicitar_recordatorio/
```

Auth: `Authorization: Bearer <token>` — requiere permiso `agenda.citas.editar`

Marca la cita con `recordatorio_manual_pendiente=true` para que n8n la recoja en el próximo ciclo de polling como `tipo_recordatorio: "manual"`. Usar cuando no se necesita envío inmediato.

No acepta body. Retorna 400 si la cita está en estado `cancelada`, `completada` o `no_asistio`.

**Response:** serializer completo de la cita (`CitaSerializer`).

---

### Enviar recordatorio inmediato (desde el frontend)

```
POST /api/v1/agenda/citas/{id}/enviar_recordatorio_inmediato/
```

Auth: `Authorization: Bearer <token>` — requiere permiso `agenda.citas.editar`

Llama directamente al webhook de n8n configurado en `N8N_APPOINTMENT_REMINDERS_WEBHOOK` con los datos completos de la cita. Si n8n responde OK, la cita queda marcada como `recordatorio_enviado=true` de inmediato (sin esperar el ciclo de polling).

No acepta body. Retorna 400 si el estado de la cita no permite recordatorio, 502 si n8n no responde.

**Response:** serializer completo de la cita (`CitaSerializer`).

---

## Check-in OTP de cita (Registrar llegada)

Antes de transicionar una cita a `en_espera`, el front puede verificar la presencia del paciente con OTP por WhatsApp o foto presencial.

Los tres endpoints requieren permiso `agenda.citas.editar` y que la cita esté en estado `pendiente` o `confirmada`.

### Iniciar check-in OTP

```
POST /api/v1/agenda/citas/{id}/iniciar_checkin/
```

Genera un OTP de 6 dígitos (válido 5 min), lo almacena y lo envía al WhatsApp del paciente. Si ya existe un OTP vigente, lo reutiliza sin reenviar.

**Response exitosa:**

```json
{ "otp_enviado": true, "expira_en": "2026-06-09T14:32:00Z" }
```

Si el OTP ya existía y no se reenvió: `{ "otp_activo": true, "expira_en": "..." }`.

**Errores:**

| code | status | descripción |
|---|---|---|
| `ESTADO_INVALIDO` | 400 | La cita no está en `pendiente` o `confirmada` |
| `WEBHOOK_NOT_CONFIGURED` | 400 | Webhook de WhatsApp no configurado |
| `WEBHOOK_ERROR` | 502 | No se pudo contactar el webhook |

### Verificar OTP

```
POST /api/v1/agenda/citas/{id}/verificar_otp/
```

Body: `{ "codigo": "123456" }`

Solo verifica — no transiciona el estado. Después de recibir `ok: true` el frontend llama `cambiar_estado(en_espera)` por separado.

**Response exitosa:** `{ "ok": true }`

**Errores:**

| code | status | descripción |
|---|---|---|
| `OTP_NOT_FOUND` | 400 | No hay código activo para esta cita |
| `OTP_EXPIRED` | 400 | Código expirado o bloqueado (≥ 3 intentos) |
| `OTP_INVALID` | 400 | Código incorrecto — incluye `intentos_restantes` |

### Check-in por foto

```
POST /api/v1/agenda/citas/{id}/checkin_foto/
```

Body: `multipart/form-data` con campo `foto` (JPEG o PNG, máx 5 MB).

Alternativa al OTP cuando el paciente no tiene WhatsApp o el código no llega. Almacena la foto en MinIO.

**Response exitosa:** `{ "ok": true }`

**Error:** `ESTADO_INVALIDO` (400) si la cita no está en `pendiente` o `confirmada`.

### Campos de check-in en la cita

Después de un check-in exitoso, el serializer de `Cita` incluye:

```json
{
  "checkin_metodo": "otp_whatsapp",
  "checkin_en": "2026-06-09T14:33:12Z",
  "checkin_foto_url": "https://minio.../..."
}
```

- `checkin_metodo`: `"otp_whatsapp"` | `"foto_presencial"` | `null`
- `checkin_en`: timestamp del check-in o `null`
- `checkin_foto_url`: URL firmada de la foto (solo si `checkin_metodo == "foto_presencial"`)

---

## Puntos todavía provisionales

- No todos los errores custom están 100% homogeneizados todavía
- Auth sigue en esquema Bearer actual; si luego se migra a cookie segura, el frontend tendrá que ajustar interceptores
- La confirmación pública de citas hoy se hace con un `GET` que ya confirma; eso conviene refactorizar después
- `caja`, `comisiones`, `asistencia`, `reportes` y el dashboard administrativo siguen pendientes
- La firma de consentimientos depende de MinIO disponible
- Los recordatorios automáticos dependen de `n8n`

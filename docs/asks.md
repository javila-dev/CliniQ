# asks.md — Preguntas entre Frontend y Backend

Espacio compartido para resolver dudas técnicas entre equipos. Cada pregunta sigue el formato:
número · pregunta · quién pregunta · respuesta · quién responde.

---

## 1. ¿Soporta el backend pre-vincular una `SesionEjecutada` al crear una cita?

**Pregunta (Frontend):**
Al agendar una cita en modo cotización queremos que la persona que agenda elija explícitamente qué sesión del protocolo se va a consumir (ej. "Sesión 3 de 11 de Radiofrecuencia Monopolar"), en lugar de que el profesional la marque durante la atención.

Para eso necesitamos saber:
- ¿`POST /agenda/citas/` acepta (o puede aceptar) un campo `sesion_ejecutada: uuid` que pre-vincule la `SesionEjecutada` al crear la cita?
- Si se envía ese campo, ¿el backend reserva esa sesión (evita que otra cita la tome) y la marca con `cita = <nueva cita>`?
- ¿Hay alguna validación que debamos respetar (ej. la sesión debe estar en estado `pendiente`, pertenecer al mismo paciente, etc.)?

**Respuesta (Backend):**

**No soportado actualmente.** `POST /agenda/citas/` no acepta `sesion_ejecutada`.

El flujo actual liga la sesión a la cita en sentido inverso: cuando el profesional completa la atención llama `POST /protocolos/sesiones/{id}/marcar_completada/` con `cita_id`. Lo que pide el frontend —pre-vincular al crear la cita, con reserva de la sesión— es nuevo.

Se creó el hito **H30** en `plan-backend.md`. Hasta que esté implementado, no es posible pasar `sesion_ejecutada` al crear la cita.

Cuando H30 esté listo, el campo será opcional en `POST /agenda/citas/`:
```json
{ ..., "sesion_ejecutada": "uuid" }
```
El backend validará que la sesión: (a) pertenezca al mismo paciente, (b) esté en `estado = "pendiente"`, (c) no tenga ya una cita asignada. Si pasa, persiste `sesion.cita = <nueva_cita>` como reserva. Errores: `SESION_PACIENTE_MISMATCH`, `SESION_NO_PENDIENTE`, `SESION_YA_VINCULADA`.

---

## 2. ¿`consentimiento_info` puede calcularse a partir de los procedimientos de la sesión vinculada?

**Pregunta (Frontend):**
Hoy `consentimiento_info` en la cita se calcula con base en el **servicio** asociado (ver api.md §Crear cita). Cuando la cita tiene una `SesionEjecutada` pre-vinculada, esa sesión tiene procedimientos concretos (`procedimientos_ejecutados` / `tipos_sesion → procedimientos`), cada uno con su propio template de consentimiento.

Necesitamos saber:
- Si la cita tiene una `SesionEjecutada` vinculada, ¿el backend puede computar `consentimiento_info` a partir de los procedimientos de **esa sesión** en lugar del servicio genérico?
- ¿O hay que hacer una llamada separada a `GET /protocolos/sesiones/{id}/consentimientos/` para obtener el estado real antes de iniciar la atención?

Esto es clave para el flujo de llegada del paciente en `ColaEspera`: si `consentimiento_info` ya refleja la sesión correcta, el flujo existente funciona sin cambios en el frontend.

**Respuesta (Backend):**

**No aún.** `consentimiento_info` se calcula desde `servicio.consentimientos_requeridos` (ver `api.md` §Crear cita y §Consentimientos ligados a templates de Documenso). Cuando la cita tiene una sesión pre-vinculada (H30), el backend extenderá ese cálculo para usar los procedimientos de la sesión en lugar del servicio genérico.

**Mientras tanto (workaround para el flujo ColaEspera):** llamar `GET /protocolos/sesiones/{id}/consentimientos/` por separado antes de iniciar la atención. Ese endpoint ya existe y devuelve `puede_ejecutar`, más el detalle de consentimientos por procedimiento de esa sesión (ver `api.md` §Consentimientos por sesión). El flujo existente de ColaEspera puede usarlo como fuente de verdad hasta que H30 implemente el cálculo unificado en `consentimiento_info`.

---

## 3. ¿Qué sesiones del protocolo aplican para un `item_cotizacion` dado, al momento de agendar?

**Pregunta (Frontend):**
En `NuevaCitaModal` (modo cotización) el usuario elige un `item_cotizacion`. Para mostrar el selector de sesión necesitamos obtener las `SesionEjecutada` pendientes de ese ítem.

Flujo propuesto desde el frontend:
1. Con `item_cotizacion_id`, llamar `GET /protocolos/tratamientos/?paciente=<id>` y filtrar por `cotizacion_item === item_cotizacion_id`.
2. Del tratamiento encontrado, usar `grupos[].sesiones` (H27) o `sesiones` (legacy) y mostrar las que tienen `estado = "pendiente"`.

Preguntas:
- ¿Es correcto ese flujo o existe un endpoint más directo (ej. `GET /protocolos/tratamientos/?cotizacion_item=<uuid>`)?
- ¿El filtro `cotizacion_item` ya está disponible en el listado de tratamientos?
- ¿La respuesta de listado incluye las sesiones anidadas o hay que hacer `GET /protocolos/tratamientos/{id}/` para cada uno?

**Respuesta (Backend):**

Resumen de cada sub-pregunta:

**¿Existe `GET /protocolos/tratamientos/?cotizacion_item=<uuid>`?**
El campo `cotizacion_item` existe en el modelo `TratamientoPaciente` (se ve en el shape de la respuesta de `api.md` §Protocolos), pero **el filtro no está documentado ni garantizado**. Se creó el hito **H30.1** para añadirlo y documentarlo oficialmente. Hasta entonces, no confíes en él.

**¿La respuesta del listado incluye sesiones anidadas?**
No. `GET /protocolos/tratamientos/` devuelve resumen sin sesiones. Para obtenerlas hay que llamar `GET /protocolos/tratamientos/{id}/`, que sí incluye `grupos[].sesiones` (H27) y `sesiones` (legacy). Ver `api.md` §Tratamientos (Protocolos).

**Flujo recomendado mientras H30.1 no está listo:**
1. `GET /protocolos/tratamientos/?paciente=<id>` → filtrar en cliente por `cotizacion_item === item_cotizacion_id`.
2. Con el `id` del tratamiento → `GET /protocolos/tratamientos/{id}/` → leer `grupos[].sesiones` y mostrar las que tienen `estado = "pendiente"`.

**Flujo recomendado cuando H30.1 esté listo:**
1. `GET /protocolos/tratamientos/?cotizacion_item=<uuid>` → devuelve 0 o 1 tratamiento.
2. `GET /protocolos/tratamientos/{id}/` → sesiones pendientes del grupo correspondiente.

Nota: siempre se necesita el paso 2 (detalle) para obtener sesiones; el listado nunca las incluye.

---

## 4. ¿`consentimiento_info.consentimientos` incluye TODOS los pendientes o solo uno?

**Pregunta (Frontend):**
En `ColaEspera`, el botón "Firmar" llama a `primerConsentimientoPendiente(cita)`, que toma el primer ítem con `vigente === false` del array `consentimiento_info.consentimientos`. Después de que el paciente firma ese consentimiento, el frontend refresca las citas y re-evalúa.

Para que el flujo de firma encadenada funcione correctamente (varios consentimientos uno tras otro), necesitamos saber:
- ¿El array `consentimientos[]` devuelve **todos** los requeridos por el servicio/sesión en un solo response, o solo el primero pendiente?
- Tras firmar uno y refrescar, ¿el siguiente pendiente aparece en la misma posición del array o el backend reordena?

Esto afecta cómo el frontend itera y presenta los consentimientos pendientes al recepcionista.

**Respuesta (Backend):**

**El array devuelve todos los requeridos, no solo el primero pendiente.**

`consentimientos[]` itera todos los templates que el servicio (o la sesión pre-vinculada) exige y emite un ítem por cada uno, con `vigente: true` o `vigente: false`. Si el servicio requiere 3 consentimientos y el paciente tiene 1 firmado, el array tendrá 3 ítems: uno con `vigente: true` y dos con `vigente: false`. El campo `todos_firmados` resume si se puede continuar.

**El orden es estable entre refreshes.** La posición de cada ítem no cambia: depende del campo `orden` configurado en `ServicioConsentimiento` (path de servicio) o en `consentimientos_requeridos_set.order_by("orden")` (path de sesión pre-vinculada). Tras firmar un consentimiento y refrescar, ese ítem pasa a `vigente: true` en la misma posición; el siguiente pendiente sigue en su posición original.

**El flujo de firma encadenada funciona sin cambios en el frontend:** el patrón `primerConsentimientoPendiente(cita)` — tomar el primer ítem con `vigente === false` — es correcto. Tras cada firma + refresh, el siguiente pendiente pasa a ser el nuevo "primero con `vigente === false`" y el botón rota al siguiente template. No hay reordenamiento.

---

## 5. Resultados de exámenes duplicados en `GET /historia-clinica/resultados-examenes/?historia=<id>`

**Pregunta (Frontend):**
En la pestaña de Exámenes del detalle de atención (`/atenciones/[citaId]`) se dispara un error de React:

```
Encountered two children with the same key, `F7VX7vFIMPCw9RyPZkT3s`.
Keys should be unique so that components maintain their identity across updates.
```

El endpoint `GET /historia-clinica/resultados-examenes/?historia=<id>` está devolviendo el mismo registro más de una vez (mismo `id`). El frontend ya tiene un workaround que desduplicar por `id` antes de renderizar, pero el origen del problema está en el backend.

**Sospecha:** el queryset probablemente hace un `JOIN` (por ejemplo con `nota` u otra relación) que multiplica las filas. La solución sería agregar `.distinct()` al queryset del viewset correspondiente.

**Pedido:** revisar el viewset de `ResultadoExamen` y asegurarse de que el queryset filtre con `.distinct()`:
```python
queryset = ResultadoExamen.objects.filter(historia=historia_id).distinct()
```

**Respuesta (Backend):**

Confirmado y corregido. La causa: `select_related("historia__clinica")` + `filter(historia__clinica=user.clinica)` generan dos JOINs al mismo tabla bajo alias distintos, lo que duplica filas.

Fix aplicado en `ResultadoExamenViewSet` (`views.py:551`): `.all()` → `.distinct()`. El workaround del frontend puede quedarse como defensa, pero ya no es necesario.

---

## 6. ¿`iniciar_firma` crea el documento en estado PENDING en Documenso?

**Pregunta (Frontend):**
Estamos migrando `ConsentimientoFirmaSheet` de vuelta al flujo `EmbedSignDocument` (según api.md §Iniciar firma embebida). Para que el embed funcione, Documenso exige que el documento esté en estado **PENDING** (no DRAFT) — de lo contrario la URL `/embed/sign/{token}` devuelve 404.

En una iteración anterior vimos borradores (`DRAFT`) creándose en Documenso cuando se llamaba `POST /historia-clinica/consentimientos/{id}/iniciar_firma/`. Necesitamos confirmar:

1. ¿El endpoint envía el documento (DRAFT → PENDING) antes de devolver el `signing_token`?
2. ¿El `signing_token` devuelto es el token de destinatario que usa Documenso en la URL `/embed/sign/{token}`?
3. ¿El email del paciente queda bloqueado en el documento (destinatario nominal), de forma que el firmante no tenga que tipear su correo en el modal de confirmación de Documenso?

**Respuesta (Backend):**

**1. Estado PENDING — depende del paciente**

El endpoint llama `POST /api/v2/template/use` con `distributeDocument: true/false`. Con `true`, Documenso crea el documento directamente en **PENDING** y envía el email. Con `false`, queda en **DRAFT** y el embed devuelve 404.

El valor de `distributeDocument` hoy depende de si el paciente tiene email real:
- Paciente con email real → `distributeDocument: true` → **PENDING** → embed funciona ✅
- Paciente sin email (placeholder `@noreply.clinica`) → `distributeDocument: false` → **DRAFT** → embed devuelve 404 ❌

Esto es un problema conocido: la corrección aplicada para evitar `DOCUMENT_SEND_FAILED` (Documenso fallando al enviar a un email falso) introduce el problema de DRAFT para pacientes sin email. Pendiente de resolver — ver nota al final.

**2. ¿El `signing_token` es el correcto para `/embed/sign/{token}`?**

Sí. El token se extrae así (en orden):
1. `recipient.token` del response de Documenso (campo directo)
2. Si no viene, se parsea `recipient.signingUrl` y se extrae el último segmento del path

En ambos casos es el mismo token que Documenso espera en `/embed/sign/{token}`. El backend devuelve el token crudo; el frontend construye la URL.

**3. ¿El email queda bloqueado en el documento?**

Sí. Al llamar `template/use` se pasa el email del paciente en el array `recipients` reemplazando al signer de la plantilla. Documenso fija ese email como destinatario nominal, por lo que el modal de confirmación no debería pedirlo.

---

**Resuelto — pacientes sin email:**

Se configuró `DOCUMENSO_FALLBACK_EMAIL` en el `.env`. Si el paciente no tiene email, se usa ese email interno como destinatario nominal en Documenso. `distributeDocument` es siempre `true`, por lo que el documento siempre queda en **PENDING** y el embed funciona. El aviso de Documenso llega al email interno (la clínica), no al paciente.

---

## 7. El webhook de Documenso devuelve 200 pero `archivo_url` queda `null` — ¿falla la descarga del PDF?

**Pregunta (Frontend):**
Al completar una firma en el embed de Documenso:
1. El frontend llama `PATCH /completar_firma/` → el consentimiento queda `firmado=true`.
2. Los logs del servidor muestran `POST /webhooks/documenso/ 200`.
3. Sin embargo, `archivo_url` en `GET /historia-clinica/consentimientos/{id}/` sigue en `null`, y el campo `archivo` también está vacío.

El api.md dice: *"si falla la descarga del PDF, el consentimiento igual queda `firmado=true`"*, así que el 200 del webhook solo confirma que el evento fue recibido, no que el PDF fue guardado.

Necesitamos saber:
- ¿Hay un error interno en el webhook al intentar descargar el PDF de Documenso? ¿Qué responde Documenso?
- ¿El campo `archivo` del modelo queda `null` tras el webhook?
- ¿Hay algún endpoint o acción para reintentar la descarga del PDF de un consentimiento ya firmado?

**Respuesta (Backend):**

Hay tres causas posibles, en orden de probabilidad:

**1. `completar_firma` no descarga el PDF — es por diseño**

`PATCH /completar_firma/` solo marca `firmado=true` y guarda `documenso_document_id`. No descarga nada. La descarga del PDF ocurre **exclusivamente** vía el webhook de Documenso (`POST /webhooks/documenso/`). Si el webhook llegó y el PDF sigue null, pasó algo en la descarga.

**2. Documenso dispara el webhook antes de que el PDF esté disponible**

Es el caso más común. El evento `DOCUMENT_COMPLETED` puede llegar fracciones de segundo antes de que el PDF sea descargable en `/api/v2/documents/{id}/download`. El backend intenta descargarlo, Documenso responde 4xx o devuelve contenido vacío, `descargar_pdf_documenso` retorna `None` silenciosamente, `archivo` queda null, y el webhook igual retorna 200 (correcto — el evento fue recibido).

**3. Falla real de descarga**

Si Documenso responde un error distinto de timing, la excepción se loguea como `No fue posible descargar el PDF firmado desde Documenso | document_id=...` pero el webhook sigue devolviendo 200. Revisa los logs del servidor buscando esa línea junto al `document_id` del consentimiento.

**¿Hay endpoint para reintentar la descarga?**

No existía — se acaba de crear:

```
POST /api/v1/historia-clinica/consentimientos/{id}/reintentar_pdf/
Auth: Bearer <token> — requiere permiso historia_clinica.ver
```

Llama a Documenso, descarga el PDF y lo guarda. Retorna el serializer completo del consentimiento con `archivo_url` actualizado. Retorna 400 si el consentimiento no tiene `documenso_document_id`, 502 si Documenso falla.

---

## 8. ¿El modelo `AntecedentePaciente` puede recibir los campos extendidos del formulario?

**Pregunta (Frontend):**

El formulario de antecedentes tiene cuatro secciones. Hoy solo los campos de las dos primeras llegan al backend; el resto se guarda temporalmente en `localStorage` porque el modelo no los tiene:

**Campos que YA llegan al backend** (en `PUT /pacientes/{id}/antecedentes/`):
```
alergias, medicamentos_actuales, condiciones_medicas, contraindicaciones,
tipo_piel, antecedentes_esteticos
```

**Campos que hoy quedan en localStorage y necesitan persistirse:**

| Campo | Tipo sugerido | Sección del formulario |
|---|---|---|
| `ant_quirurgicos` | `TextField` (blank=True) | Personales — Quirúrgicos |
| `ant_traumaticos` | `TextField` (blank=True) | Personales — Traumáticos |
| `gestaciones` | `PositiveSmallIntegerField` (null=True, blank=True) | Ginecoobstétricos |
| `partos` | `PositiveSmallIntegerField` (null=True, blank=True) | Ginecoobstétricos |
| `abortos` | `PositiveSmallIntegerField` (null=True, blank=True) | Ginecoobstétricos |
| `cesareas` | `PositiveSmallIntegerField` (null=True, blank=True) | Ginecoobstétricos |
| `fum` | `DateField` (null=True, blank=True) | Ginecoobstétricos — Fecha última menstruación |
| `planificacion_familiar` | `TextField` (blank=True) | Ginecoobstétricos |
| `metodo_anticonceptivo` | `TextField` (blank=True) | Ginecoobstétricos |
| `ant_familiares` | `TextField` (blank=True) | Familiares |

**Pedido:** agregar esos campos al modelo `AntecedentePaciente`, generar la migración, y exponerlos en el serializer del endpoint `PUT /pacientes/{id}/antecedentes/`.

Una vez confirmado, el frontend actualiza `AntecedentePaciente` en `src/types/historia.ts`, mueve esos campos del `localStorage` al payload del `PUT`, y elimina la lógica temporal `AntExt`.

**Respuesta (Backend):**

Implementado. Migración `0005_antecedente_campos_extendidos` aplicada.

**Campos nuevos en el modelo:**

| Campo modelo | Campo PUT aceptado | Tipo |
|---|---|---|
| `ant_traumaticos` | `ant_traumaticos` | TextField |
| `gestaciones` | `gestaciones` | IntegerField nullable |
| `partos` | `partos` | IntegerField nullable |
| `abortos` | `abortos` | IntegerField nullable |
| `cesareas` | `cesareas` | IntegerField nullable |
| `fum` | `fum` | DateField nullable (`"YYYY-MM-DD"`) |
| `planificacion_familiar` | `planificacion_familiar` | TextField |
| `metodo_anticonceptivo` | `metodo_anticonceptivo` | TextField |

**Campos existentes mapeados (sin cambio en el modelo):**

| Campo modelo | Campo PUT aceptado |
|---|---|
| `quirurgicos` | `ant_quirurgicos` o `quirurgicos` |
| `familiares` | `ant_familiares` o `familiares` |

**Shape del PUT body (campos nuevos):**
```json
{
  "ant_quirurgicos": "Apendicectomía 2018",
  "ant_traumaticos": "Fractura tibia 2015",
  "ant_familiares": "Diabetes materna",
  "gestaciones": 2,
  "partos": 1,
  "abortos": 0,
  "cesareas": 1,
  "fum": "2026-05-10",
  "planificacion_familiar": "Condón",
  "metodo_anticonceptivo": "DIU"
}
```
El resto de los campos existentes (`alergias`, `condiciones_medicas`, etc.) no cambian.

**Shape del GET response (campos nuevos en su sección):**
```json
{
  "personales": {
    "quirurgicos": "Apendicectomía 2018",
    "traumaticos": "Fractura tibia 2015",
    ...
  },
  "ginecoobstetricos": {
    "gestaciones": 2,
    "partos": 1,
    "abortos": 0,
    "cesareas": 1,
    "fum": "2026-05-10",
    "planificacion_familiar": "Condón",
    "metodo_anticonceptivo": "DIU"
  },
  "familiares": "Diabetes materna"
}
```

`ginecoobstetricos` ahora es un objeto estructurado con los nuevos campos (ya no es un JSONField libre). El campo `personales.traumaticos` se agregó al objeto existente.

Ya pueden actualizar `AntecedentePaciente` en `src/types/historia.ts`, mover los campos del `localStorage` al payload del `PUT`, y eliminar la lógica temporal `AntExt`.

---

## 9. Necesitamos endpoints de check-in OTP para `Cita` (Registrar llegada)

**Pregunta (Frontend):**

El botón "Registrar llegada" en el detalle de cita ahora abre un sheet de verificación de presencia (igual al que ya existe en protocolos), antes de transicionar la cita a `en_espera`. Necesitamos tres endpoints análogos a los de `SesionProcedimiento` pero en el viewset de `Cita`:

### Endpoints requeridos

**1. `POST /agenda/citas/{id}/iniciar_checkin/`**
- Genera un OTP de 6 dígitos, lo almacena con expiración (sugerimos 5 min), lo envía al WhatsApp del paciente.
- Respuesta esperada:
```json
{ "otp_enviado": true, "expira_en": "2026-06-09T14:32:00Z" }
```

**2. `POST /agenda/citas/{id}/verificar_otp/`**
- Body: `{ "codigo": "123456" }`
- Valida el OTP. Si es correcto responde `{ "ok": true }`. Si no, retorna error con `intentos_restantes`.
- El frontend llama a `cambiar_estado(en_espera)` por separado tras recibir `ok: true` — el endpoint solo verifica, no transiciona el estado.
- Sugerimos reutilizar la misma lógica de bloqueo que en protocolos (máx 3 intentos).

**3. `POST /agenda/citas/{id}/checkin_foto/`**
- Body: `multipart/form-data` con campo `foto` (imagen).
- Alternativa al OTP cuando el paciente no tiene WhatsApp o el código no llega.
- Almacena la foto asociada a la cita (puede ir a MinIO como las fotos clínicas).
- Respuesta: `{ "ok": true }`.

### Notas
- Los tres endpoints deben validar que la cita esté en estado `pendiente` o `confirmada` (no tiene sentido hacer checkin de una cita ya en espera o completada).
- El número de WhatsApp a usar es el `telefono` del paciente vinculado a la cita.
- El OTP puede reutilizar la misma infraestructura de envío que ya existe en el módulo de protocolos.

**Respuesta (Backend):**

Implementado. Migración `0009_cita_checkin_fields` aplicada.

**Tres endpoints disponibles:**

| Endpoint | Método | Descripción |
|---|---|---|
| `/agenda/citas/{id}/iniciar_checkin/` | POST | Genera OTP de 6 dígitos (5 min), lo envía al WhatsApp del paciente |
| `/agenda/citas/{id}/verificar_otp/` | POST | Valida el OTP; solo verifica, no transiciona estado |
| `/agenda/citas/{id}/checkin_foto/` | POST | Alternativa foto presencial (`multipart/form-data`, campo `foto`) |

**Detalles de comportamiento:**

- Los 3 endpoints validan que la cita esté en `pendiente` o `confirmada`; devuelven `ESTADO_INVALIDO` (400) si no.
- OTP expira en **5 min** (según lo pedido). Bloqueo por intentos: máx 3, igual que en protocolos.
- `verificar_otp` devuelve `{ "ok": true }` — el frontend llama `cambiar_estado(en_espera)` por separado.
- `checkin_foto` acepta JPEG/PNG hasta 5 MB; la foto va a MinIO bajo `checkin_citas/YYYY/MM/{cita_id}.ext`.
- Si el OTP ya existe y está vigente, `iniciar_checkin` lo reutiliza (responde `otp_activo: true`) sin reenviar.

**Campos nuevos en el serializer de `Cita`:**

```json
{
  "checkin_metodo": "otp_whatsapp",
  "checkin_en": "2026-06-09T14:33:12Z",
  "checkin_foto_url": "https://minio.../..."
}
```

`checkin_metodo` es `"otp_whatsapp"` | `"foto_presencial"` | `null`. Ver `api.md` §Check-in OTP de cita para la documentación completa.

---

## 10. Requisitos para cobro al iniciar atención (cita sin cotización)

**Pregunta (Frontend):**

Queremos agregar un paso de registro de pago antes de transicionar una cita a `en_curso`. El flujo completo al presionar "Iniciar atención" quedaría:

1. Consentimientos firmados (ya funciona).
2. OTP / foto de respaldo (en progreso, ask #9).
3. **Registro de pago** — el profesional o recepcionista ingresa el medio de pago y el valor recibido (acepta `0`, pero no vacío/null) antes de que la cita pase a `en_curso`.

Para citas sin cotización no hay cobro previo, así que el frontend crearía el cobro en ese momento. El flujo propuesto desde el frontend sería:

```
POST /cobros/cobros/                      → crear cobro vinculado a la cita
POST /cobros/cobros/{id}/agregar_item/    → agregar el servicio de la cita como ítem
POST /cobros/cobros/{id}/registrar_pago/ → registrar pago (valor puede ser 0)
POST /agenda/citas/{id}/cambiar_estado/   → { estado: 'en_curso' }
```

Necesitamos confirmar lo siguiente:

### 1. ¿`POST /cobros/cobros/` funciona sin `cotizacion`?

El tipo `CreateCobroRequest` tiene `cita?: string`. ¿El endpoint crea el cobro correctamente con solo `{ cita, paciente, sede }` y sin `cotizacion`? ¿El campo `origen` se setea automáticamente a `'cita'` en ese caso, o debemos enviarlo nosotros?

### 2. ¿`registrar_pago` acepta `valor: "0.00"`?

Queremos permitir que el médico registre `valor: 0` para casos de cortesía o pago diferido, dejando el cobro en estado `pendiente`. ¿Hay alguna validación `> 0` en el backend que rechace ceros?

### 3. ¿La cita expone el precio del servicio?

Hoy `Cita` solo tiene `servicio` (uuid) y `servicio_nombre` (string). Para pre-llenar el campo de precio en el formulario de cobro, necesitamos el precio del servicio. ¿Puede el serializer de `Cita` exponer `servicio_precio` (o `precio_referencia`)? De no ser posible, ¿cuál endpoint conviene llamar para obtenerlo sin un GET adicional al detalle del servicio?

### 4. ¿Debería el backend validar que exista un cobro antes de permitir `en_curso`?

Por ahora proponemos manejar esto solo en el frontend (crear el cobro primero, luego cambiar estado). ¿Tiene sentido agregar una validación server-side en `cambiar_estado` que retorne un error si no hay cobro asociado a la cita? ¿O prefieren dejarlo sin validación en el back?

### 5. ¿Hay forma de crear cobro + ítem en un solo request?

Son mínimo 3 llamadas (crear cobro, agregar ítem, registrar pago) antes de cambiar estado. ¿Se puede extender `POST /cobros/cobros/` para aceptar `items` en el body de creación, o es preferible mantenerlo separado?

**Respuesta (Backend):**

### 1. `POST /cobros/cobros/` sin `cotizacion`

✅ **Funciona.** Enviar `{ cita, paciente, sede }` es suficiente. `origen` tiene default `"cita"` — no es necesario enviarlo. El backend infiere `profesional` desde `cita.profesional` si no se envía explícitamente.

### 2. `registrar_pago` con `valor: "0.00"`

✅ **Corregido.** `PagoCreateSerializer` tenía `min_value=0.01`; ahora acepta `0`. Un pago de `0` queda registrado — el estado del cobro resultante será `pagado_parcial` (si ya había otros pagos) o queda `pendiente` (si es el único pago). Para cortesía se recomienda `precio_unitario=0` en el ítem: el total queda en 0 y el cobro pasa a `pagado` automáticamente.

### 3. `servicio_precio` en `Cita`

✅ **Implementado.** El serializer de `Cita` ahora expone `servicio_precio` (decimal nullable). Mapea al campo `precio` del modelo `Servicio`. Es `null` si la cita no tiene servicio o si el servicio no tiene precio configurado.

### 4. Validación server-side de cobro antes de `en_curso`

🟡 **Sin validación por ahora.** El backend no valida la existencia de un cobro antes de permitir `cambiar_estado(en_curso)`. El flujo es responsabilidad del frontend. Si se necesita enforcement en el futuro, se puede agregar un gate en `cambiar_estado` similar al de consentimientos.

### 5. Crear cobro + ítem en un solo request

✅ **Implementado.** `POST /cobros/cobros/` ahora acepta `items` opcional en el body. Los ítems se crean atómicamente junto con el cobro. El flujo mínimo queda en 2 llamadas:

```
POST /cobros/cobros/                      → { cita, paciente, sede, items: [...] }
POST /cobros/cobros/{id}/registrar_pago/  → { medio_pago, valor }
```

Ver `api.md` §Crear cobro para el shape completo.

---

## 11. Agregar `telefono_enmascarado` a la respuesta de `iniciar_checkin`

**Pregunta (Frontend):**

Necesitamos que `POST /agenda/citas/{id}/iniciar_checkin/` incluya el número de WhatsApp del paciente enmascarado en la respuesta, para mostrárselo al recepcionista en pantalla (ej. `****1234`).

**Pedido:** agregar el campo `telefono_enmascarado` al response:

```json
{ "otp_enviado": true, "otp_activo": false, "expira_en": "...", "telefono_enmascarado": "****1234" }
```

Solo los últimos 4 dígitos del `telefono` del paciente, sin código de país. Si el paciente no tiene teléfono, enviar `null`.

**Respuesta (Backend):**

Implementado. El response de `iniciar_checkin` ahora incluye `telefono_enmascarado`:

```json
{ "otp_enviado": true, "expira_en": "...", "telefono_enmascarado": "***********1234" }
```

La máscara usa `*` para todos los caracteres menos los últimos 4 del campo `telefono` del paciente. Si el teléfono tiene menos de 4 caracteres o está vacío, devuelve `null`.

---

## 12. [BUG] `GET /cartera/` devuelve lista vacía aunque el resumen muestra saldo pendiente

**Pregunta (Frontend):**

En `/cartera`, el endpoint `/cartera/resumen/` devuelve valores correctos (`total_cartera: $7.375.000`, `saldo_pendiente: $7.375.000`), pero `GET /cartera/` devuelve `{ count: 0, results: [] }`. La página muestra "No hay registros de cartera aún" a pesar de que existen cotizaciones aceptadas con saldo pendiente.

**Sospecha:** los objetos `Cartera` no se están creando cuando una cotización cambia a estado `aceptada`. El endpoint de resumen probablemente calcula los totales directamente desde las cotizaciones, mientras que el listado consulta objetos `Cartera` del modelo que nunca se instanciaron.

**Qué revisar:**
1. En la acción `cambiar_estado` del `CotizacionViewSet` (o en la señal `post_save` de `Cotizacion`): confirmar que al pasar a `estado == 'aceptada'` se ejecute `Cartera.objects.get_or_create(cotizacion=cotizacion, ...)`. Si el trigger busca un estado distinto (ej. `'aprobada'`), hay un mismatch con el estado real.
2. **Backfill:** las cotizaciones ya aceptadas que no tienen `Cartera` asociada deben ser backfilleadas con un script de management.

**Impacto:** la página `/cartera` está completamente inutilizable — no muestra ningún paciente con saldo pendiente.

**Respuesta (Backend):**

Investigado. El backend está correcto — el problema casi con certeza está en el frontend.

**1. El trigger existe y es correcto**

`cambiar_estado` en `CotizacionViewSet` ya ejecuta `Cartera.objects.get_or_create(cotizacion=cotizacion, ...)` cuando `nuevo_estado == Cotizacion.Estado.ACEPTADA` (`apps/cotizaciones/views.py:116`). No hay mismatch de estado.

**2. Los objetos Cartera existen**

Se corrió `python manage.py backfill_carteras --dry-run` → "No hay cotizaciones aceptadas sin cartera." Todos los objetos `Cartera` están creados correctamente. El resumen y el listado usan el mismo queryset (`Cartera.objects`), por lo que si uno muestra datos, el otro también debería hacerlo.

**3. El endpoint lista correctamente**

Simulado con el test client autenticado: `GET /cartera/` devuelve los 3 registros esperados con status 200. Permisos también OK: todos los usuarios tienen `cartera.ver` vía su `rol_dinamico`.

**4. El bug está en el frontend — tres candidatos en orden de probabilidad**

**A. El response se parsea como si fuera paginado (más probable)**

`GET /cartera/` devuelve un array plano `[{...}, {...}, ...]` — no `{ count, results }`, porque `pagination_class = None` en el viewset. Si el frontend hace:

```ts
const data = response.data.results  // ← undefined → []
```

en vez de:

```ts
const data = response.data  // ← array correcto
```

obtendrá vacío aunque el backend responda bien.

**B. Filtro de estado activo que no devuelve resultados**

El endpoint acepta `?estado=pendiente|pagada|vencida`. Con `?estado=vencida` devolvería 0 porque ninguna cuota tiene `fecha_esperada` configurada (todas son `null`). Verificar que el filtro activo por defecto en la UI sea `pendiente` o ninguno.

**C. Token de autenticación no enviado**

Menos probable dado que `resumen` sí funciona, pero vale confirmar que la llamada al listado incluye `Authorization: Bearer <token>`.

**Acción recomendada para el frontend:** confirmar el punto A — cómo se lee `response.data` en el hook/query que alimenta la tabla de cartera.

---

## 13. Firma digital y registro profesional en perfil y PDF de orden médica

**Implementado (Backend):**

**Modelo:** dos campos nuevos en `User` (migración `0010` aplicada):
- `firma_digital` — imagen (`firmas_profesionales/`)
- `registro_profesional` — texto corto

**`PATCH /api/v1/users/me/`** (multipart/form-data) — misma URL de siempre, acepta dos campos nuevos:
```
firma_digital   → archivo de imagen (JPEG/PNG)
registro_profesional → string
```
Si el usuario no es profesional y envía alguno de estos campos, devuelve 400.

**`GET /api/v1/users/me/`** ahora incluye:
```json
{
  "firma_digital_url": "https://…/firmas_profesionales/…" | null,
  "registro_profesional": "TP-12345" | ""
}
```

**PDF de orden médica:** si el profesional tiene firma cargada, aparece embebida en la parte inferior derecha, con nombre completo y registro profesional debajo.

---

**Para el frontend:**

1. **Perfil de usuario** — mostrar los dos campos solo si `me.es_profesional === true`:
   - Input de imagen para `firma_digital` (accept="image/*") con preview y botón borrar.
   - Input de texto para `registro_profesional`.
   - Enviar con `multipart/form-data` en el `PATCH /me/` existente (igual que `foto_perfil`).

2. **Tipos** — actualizar `User` / `MeResponse` en `src/types/`:
   ```ts
   firma_digital_url: string | null
   registro_profesional: string
   ```

3. **No se necesita endpoint nuevo** — todo va por `PATCH /me/`.

---

## 14. Dos endpoints nuevos para métricas del dashboard

**Pregunta (Frontend):**

Implementamos tres secciones nuevas en el dashboard (cotizaciones del mes, ocupación diaria/mensual de profesionales, pacientes sin reagendar). La ocupación ya está cubierta por `GET /reportes/ocupacion/` con params de fecha. Los otros dos necesitan endpoints nuevos:

---

### 14.1 `GET /reportes/cotizaciones/` — métricas de cotizaciones del mes

Para la tarjeta "Cotizaciones del mes" (visible solo a usuarios con permiso `cotizaciones.ver`), necesitamos un endpoint que devuelva el conteo del mes filtrado por rango de fechas.

**Params de query string:**
```
fecha_inicio   YYYY-MM-DD   (requerido)
fecha_fin      YYYY-MM-DD   (requerido)
sede_id        uuid         (opcional)
```

**Response esperado:**
```json
{
  "total_mes": 28,
  "aceptadas_mes": 12,
  "tasa_conversion_pct": "42.86"
}
```

- `total_mes`: cotizaciones creadas en el rango (cualquier estado).
- `aceptadas_mes`: cotizaciones en estado `aceptada` cuya fecha de creación cae en el rango.
- `tasa_conversion_pct`: `(aceptadas_mes / total_mes * 100)` con 2 decimales, como string. `"0.00"` si `total_mes == 0`.
- Permisos: mismo guard que el resto de `/reportes/` (requiere `reportes.ver`).

---

### 14.2 `GET /reportes/pacientes-sin-reagendar/` — pacientes con sesiones pendientes > 1 mes

Para el banner de alerta y el Sheet de detalle. Un paciente aparece aquí si tiene al menos un `ItemCotizacion` con `citas_restantes > 0` y su última cita completada (o agendada) fue hace más de 30 días (o nunca tuvo cita).

**Params de query string:**
```
sede_id        uuid    (opcional)
dias_minimos   int     (opcional, default 30)
```

**Response esperado — array de objetos:**
```json
[
  {
    "paciente_id": "uuid",
    "paciente_nombre": "Ana García",
    "ultima_cita": "2026-04-20",
    "dias_sin_agendar": 51,
    "cotizacion_id": "uuid",
    "tratamiento": "Radiofrecuencia Monopolar",
    "sesiones_pendientes": 3
  }
]
```

- Si el paciente tiene varias cotizaciones activas sin reagendar, devolver una fila por cada combinación `(paciente, cotizacion)`.
- `ultima_cita`: fecha de la última cita agendada/completada para ese ítem. `null` si nunca tuvo cita.
- `dias_sin_agendar`: días transcurridos desde `ultima_cita` (o desde `cotizacion.created_at` si `ultima_cita` es null).
- `tratamiento`: campo `descripcion` del `ItemCotizacion`.
- `sesiones_pendientes`: `citas_restantes` del `ItemCotizacion`.
- Ordenar por `dias_sin_agendar DESC`.
- Permisos: requiere `reportes.ver`.

**Respuesta (Backend):**

Implementado. Dos endpoints nuevos disponibles bajo `/reportes/`.

### 14.1 `GET /reportes/cotizaciones/`

| Param | Tipo | Descripción |
|---|---|---|
| `fecha_inicio` | YYYY-MM-DD | Requerido |
| `fecha_fin` | YYYY-MM-DD | Requerido |
| `sede_id` | uuid | Opcional |

**Response:**
```json
{
  "total_mes": 28,
  "aceptadas_mes": 12,
  "tasa_conversion_pct": "42.86"
}
```

- `total_mes`: cotizaciones activas creadas en el rango (cualquier estado).
- `aceptadas_mes`: cotizaciones en estado `aceptada` dentro del rango.
- `tasa_conversion_pct`: `(aceptadas_mes / total_mes * 100)`, 2 decimales como string. `"0.00"` si `total_mes == 0`.
- Permiso: `reportes.ver`.

### 14.2 `GET /reportes/pacientes-sin-reagendar/`

| Param | Tipo | Descripción |
|---|---|---|
| `sede_id` | uuid | Opcional |
| `dias_minimos` | int | Opcional, default 30 |

**Response — array ordenado por `dias_sin_agendar DESC`:**
```json
[
  {
    "paciente_id": "uuid",
    "paciente_nombre": "Ana García",
    "ultima_cita": "2026-04-20",
    "dias_sin_agendar": 51,
    "cotizacion_id": "uuid",
    "tratamiento": "Radiofrecuencia Monopolar",
    "sesiones_pendientes": 3
  }
]
```

- Un ítem aparece cuando `citas_restantes > 0` y la última cita (no cancelada) fue hace más de `dias_minimos` días (o la cotización fue creada hace más de `dias_minimos` días si nunca tuvo cita).
- `ultima_cita`: `null` si el ítem nunca tuvo cita.
- `dias_sin_agendar`: días desde `ultima_cita`, o desde `cotizacion.created_at` si `ultima_cita` es `null`.
- Una fila por cada combinación `(paciente, cotizacion_item)` activa.
- Permiso: `reportes.ver`.

---

## 15. Agregar `sede_id` a `GET /cartera/resumen/`

**Pregunta (Frontend):**

El dashboard tiene un filtro por sede que aplica a todos los endpoints de `/reportes/`. El único KPI que no puede filtrarse es **Cartera vencida**, porque `GET /cartera/resumen/` no acepta `sede_id`.

**Pedido:** aceptar `sede_id` como query param opcional en `GET /cartera/resumen/`. Si se omite, el comportamiento actual (toda la clínica) no cambia.

```
GET /cartera/resumen/?sede_id=<uuid>
```

El response no cambia de forma — solo filtra las cuotas/carteras cuya cotizacion/paciente pertenezca a esa sede.

**Respuesta (Backend):**

Implementado. `GET /cartera/resumen/?sede_id=<uuid>` ya filtra por `cotizacion__sede_id`. El filtro se aplicó en `get_queryset` del `CarteraViewSet`, por lo que también aplica al listado `GET /cartera/?sede_id=<uuid>`. Si se omite `sede_id`, el comportamiento es idéntico al anterior.

---

## 16. ¿`GET /reportes/cotizaciones/` puede filtrarse por `sede_id`?

**Pregunta (Frontend):**

El dashboard tiene filtro por sede. `GET /reportes/cotizaciones/` recibe `sede_id` pero devuelve 0 resultados cuando se filtra, aunque "Todas las sedes" muestra datos correctos.

El modelo `Cotizacion` no tiene campo `sede` directo (a diferencia de, por ejemplo, `Cobro`). Por eso desde el frontend deshabilitamos el param `sede_id` en esa query mientras se aclara.

**Pregunta concreta:** ¿las cotizaciones pueden asociarse a una sede? Si sí, ¿por qué campo — el profesional que la creó, la sede del paciente, otra relación? ¿El endpoint `/reportes/cotizaciones/` debería ignorar `sede_id`, filtrarlo por alguna relación indirecta, o simplemente no soportarlo?

**Respuesta (Backend):**

`Cotizacion` **sí tiene campo `sede`** — es una FK directa al modelo `Sede`, nullable (`null=True, blank=True`). No hay relación indirecta: es `cotizacion.sede_id`.

El filtro `sede_id` en `GET /reportes/cotizaciones/` ya estaba implementado correctamente (`filter(sede_id=sede_id)`). El "0 resultados" no es un bug — es que las cotizaciones creadas sin sede quedan con `sede=null` y no coinciden con ningún `sede_id`. La sede en una cotización es opcional; si el usuario que la creó no seleccionó sede, queda vacía.

**Acción para el frontend:** pueden habilitar el param `sede_id` — funciona. Si el resultado es 0 para una sede específica significa que las cotizaciones de ese rango se crearon sin sede asignada, no que el filtro esté roto. No hay cambios en el backend.

---

## 17. ¿`GET /consentimientos/` devuelve `servicio_nombre`?

**Pregunta (Frontend):**

El serializer de `Consentimiento` expone `plantilla_nombre` (nombre del template), pero la vista de la lista quiere mostrar el nombre del **servicio** asociado a la cita, no el nombre técnico de la plantilla.

¿El serializer ya incluye `servicio_nombre` (o `cita_servicio_nombre`) o hay que agregarlo? Confirmar el nombre exacto del campo para actualizar el tipo en el frontend.

**Respuesta (Backend):**

`servicio_nombre` **no existe y no se puede agregar** al serializer de `ConsentimientoInformado`. La razón es estructural: el modelo no tiene FK a `Cita` ni a `Servicio`. Un consentimiento pertenece al **paciente**, no a una cita específica — el mismo registro puede cubrir múltiples citas del mismo paciente mientras esté vigente.

**Lo que ya existe en el serializer:**

| Campo | Descripción |
|---|---|
| `template_nombre` | Alias de `documenso_template_nombre` — el nombre del template de Documenso (ej. "Toxina Botulinica") |
| `documenso_template_nombre` | Mismo valor, campo original |

Esos dos campos exponen el nombre del template, no del servicio. Un mismo template puede ser requerido por múltiples servicios, así que incluso si rastreáramos la relación inversa, podría devolver más de un servicio.

**Cómo obtener el nombre del servicio en la lista de consentimientos:**

Si la lista se muestra en el contexto de una cita concreta, el campo correcto es `consentimiento_info.consentimientos[].plantilla_nombre` del serializer de `Cita` (`GET /agenda/citas/{id}/`). Ese array ya incluye el contexto del servicio porque se construye desde `cita.servicio.consentimientos_requeridos`.

Si la lista es independiente de una cita (historial del paciente), el campo a mostrar es `template_nombre` — es el identificador semántico del consentimiento. No hay campo `servicio_nombre` disponible en ese contexto y no aplica agregarlo.

**Acción para el frontend:** usar `template_nombre` (ya presente) en la vista de lista independiente. Para la vista en contexto de cita, leer el nombre desde `consentimiento_info` de la cita, que ya tiene el servicio resuelto.

---

## 18. Endpoints y campos necesarios para la vista Admin (tenants + planes)

**Pregunta (Frontend):**

Se va a construir una sección `/admin` accesible solo a usuarios con `rol === 'superadmin'` (o `is_staff`, ver punto 18.1). Necesitamos confirmar la existencia y forma de varios endpoints antes de arrancar.

---

### 18.1 ¿Existe o se va a agregar `is_staff` en `/auth/me/`?

El tipo `AuthUser` tiene `rol: string`. La condición de acceso hoy es `rol === 'superadmin'`.

¿Hay usuarios que deban acceder al panel admin sin ser `superadmin`? Si sí, confirmar el nombre exacto del campo (¿`is_staff: boolean`?) para agregarlo a `AuthUser`. Si no, seguimos con `rol === 'superadmin'` como único guard.

---

### 18.2 Listado de todos los tenants

El endpoint actual `/clinicas/clinicas/` está scoped al tenant activo vía `X-Clinica-Id`. Para el panel admin necesitamos ver **todos** los tenants.

¿Existe o se puede agregar `GET /admin/tenants/` (o similar) que ignore `X-Clinica-Id` y devuelva todos los tenants paginado?

Campos mínimos por ítem:
```json
{
  "id": "uuid",
  "nombre": "Clínica Ejemplo",
  "nit": "900123456-1",
  "telefono": "3001234567",
  "email": "admin@clinica.com",
  "activo": true,
  "plan": { "id": "uuid", "nombre": "Pro", "precio": "299000.00" },
  "total_usuarios": 5,
  "total_sedes": 2,
  "created_at": "2024-01-01T00:00:00Z"
}
```

Preguntas:
- ¿Existe el campo `email` en el modelo `Clinica`? Si no, ¿se puede agregar?
- ¿Se devuelven `total_usuarios` y `total_sedes` inline o hay que pedirlos por separado?
- ¿Qué prefijo de ruta prefieren para el panel admin: `/admin/`, `/superadmin/`, u otro?

---

### 18.3 Crear / editar / inactivar tenant

¿Los endpoints para crear (`POST`) y editar (`PATCH`) tenants estarán en la misma ruta admin (`/admin/tenants/`) o se reutiliza algún endpoint existente con permisos extendidos?

Para inactivar: ¿`PATCH /admin/tenants/{id}/` con `{ "activo": false }` es suficiente, o hay un endpoint dedicado? ¿Inactivar bloquea el login de los usuarios de ese tenant?

Al crear un tenant, ¿el backend crea automáticamente un usuario `admin` inicial? Si sí, ¿qué campos se necesitan en el body (email, password temporal)?

---

### 18.4 Modelo y CRUD de Planes

Recurso completamente nuevo. ¿Existe algún modelo de Plan/Suscripción en el backend?

Modelo esperado:
```json
{
  "id": "uuid",
  "nombre": "Starter",
  "descripcion": "Ideal para clínicas pequeñas",
  "max_usuarios": 5,
  "max_sedes": 1,
  "precio": "99000.00",
  "activo": true,
  "created_at": "...",
  "updated_at": "..."
}
```

Endpoints necesarios:
```
GET    /admin/planes/        — listar planes
POST   /admin/planes/        — crear plan
PATCH  /admin/planes/{id}/   — editar plan
DELETE /admin/planes/{id}/   — eliminar o inactivar plan
```

Preguntas:
- ¿`max_usuarios` y `max_sedes` son límites que el backend valida (hard limits) o solo descriptivos para la UI?
- ¿`precio` tiene soporte de intervalos (mensual/anual) o es un número libre?
- ¿Se puede eliminar un plan que ya tiene tenants asignados, o solo inactivarlo?

---

### 18.5 Asociar un plan a un tenant

¿Cómo se asigna un plan a un tenant? Opciones:
- **A)** `PATCH /admin/tenants/{id}/` acepta `plan_id` en el body.
- **B)** Endpoint dedicado: `POST /admin/tenants/{id}/assign-plan/` con `{ "plan_id": "uuid" }`.

¿Cuál implementarán?

---

### 18.6 Auth en endpoints admin

Los usuarios `superadmin` no tienen `clinica_id`, por lo que no envían `X-Clinica-Id`. ¿Los endpoints `/admin/*` autorizan exclusivamente por JWT (ignorando ese header) y están protegidos con un guard de `is_superadmin` o `is_staff`?

**Respuesta (Backend):**

### 18.1 `is_staff`

No se agrega `is_staff`. El único guard es `rol === 'superadmin'`. Los endpoints `/api/v1/admin/*` rechazan cualquier petición que no tenga ese rol con HTTP 403. No hay otro tipo de usuario con acceso al panel admin.

### 18.2 Listado de tenants

`GET /api/v1/admin/tenants/`

Se agregó el campo `email` al modelo `Clinica`. Los campos `total_usuarios`, `usuarios_activos` y `total_sedes` se calculan por anotación y vienen inline. No hay llamadas adicionales.

Shape de cada ítem:
```json
{
  "id": "uuid",
  "nombre": "Clínica Ejemplo",
  "nit": "900123456-1",
  "email": "admin@clinica.com",
  "telefono": "3001234567",
  "activo": true,
  "plan": {
    "id": "uuid",
    "nombre": "Pro",
    "descripcion": "...",
    "max_usuarios": 10,
    "max_sedes": 3,
    "precio": "299000.00",
    "activo": true
  },
  "total_usuarios": 5,
  "usuarios_activos": 4,
  "total_sedes": 2,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

Soporta `?search=` (nombre, nit, email) y `?ordering=nombre|-nombre|created_at|-created_at`.

### 18.3 Crear / editar / inactivar tenant

**Crear:** `POST /api/v1/admin/tenants/`

```json
{
  "nombre": "Clínica Nueva",
  "nit": "900987654-3",
  "telefono": "3009876543",
  "email": "contacto@clinicanueva.com",
  "plan": "uuid-del-plan",
  "admin_email": "admin@clinicanueva.com"
}
```

- `plan` y `admin_email` son opcionales.
- Si se envía `admin_email`, se crea automáticamente un usuario `admin` y se le envía invitación por email para definir contraseña. Si el email ya existe → `ADMIN_EMAIL_DUPLICATE` 400.
- Los roles por defecto (admin, recepcion, profesional) se crean automáticamente.

**Editar:** `PATCH /api/v1/admin/tenants/{id}/` — acepta `nombre`, `nit`, `email`, `telefono`, `activo`, `plan`.

**Inactivar:** `PATCH /api/v1/admin/tenants/{id}/` con `{ "activo": false }`. Los usuarios existentes no se tocan, pero **no pueden hacer login** mientras la clínica esté inactiva (devuelve `CLINICA_INACTIVA` HTTP 403).

### 18.4 Modelo y CRUD de Planes

El modelo `Plan` existe desde H30. Campos:

| Campo | Notas |
|---|---|
| `max_usuarios` | Hard limit — validado al crear/activar usuarios |
| `max_sedes` | Hard limit — validado al crear nuevas sedes |
| `precio` | Solo descriptivo, no afecta cobros |

CRUD (escritura solo superadmin): `GET/POST/PATCH/DELETE /api/v1/admin/planes/`. También disponibles en `/api/v1/clinicas/planes/`.

### 18.5 Asociar plan a tenant

Incluido en `PATCH /api/v1/admin/tenants/{id}/` con `{ "plan": "uuid" }` o `{ "plan": null }`.

### 18.6 Auth en endpoints admin

Todos los endpoints `/api/v1/admin/*` autorizan exclusivamente por JWT con `rol === 'superadmin'`. El header `X-Clinica-Id` es ignorado. Ver `api.md` §Panel Admin (superadmin).

---

## 19. `GET /clinicas/mi-clinica/plan/` no devuelve campos de sedes

**Pregunta (Frontend):**

En la página `/configuracion/sedes` mostramos una barra de progreso "Sedes del plan: N / máx" que indica cuántas sedes activas tiene la clínica y cuál es su límite según el plan. Para calcularlo llamamos `GET /clinicas/mi-clinica/plan/`, pero el response documentado en `api.md` solo contiene campos de **usuarios**:

```json
{
  "plan": { "max_usuarios": 10 },
  "usuarios_activos": 7,
  "puede_agregar": true,
  "slots_disponibles": 3,
  "sin_limite": false
}
```

El frontend espera también:
- `plan.max_sedes` — límite de sedes del plan (o `null` / `0` si sin límite)
- `sedes_activas` — cantidad de sedes activas actualmente
- `puede_agregar_sede` — si se puede crear una sede más
- `sin_limite_sedes` — equivalente a `sin_limite` pero para sedes

Sin esos campos, `sedes_activas` queda `undefined` y la barra muestra `0 / N`. Como workaround temporal calculamos `sedes_activas` contando desde la lista de sedes ya cargada en la UI, pero `max_sedes` sigue sin llegar (la barra de progreso no se muestra).

**Dos opciones posibles — necesitamos saber cuál van a implementar:**

**A)** Extender `GET /clinicas/mi-clinica/plan/` para que incluya los campos de sedes junto a los de usuarios:
```json
{
  "plan": { "max_usuarios": 10, "max_sedes": 3 },
  "usuarios_activos": 7,
  "puede_agregar": true,
  "slots_disponibles": 3,
  "sin_limite": false,
  "sedes_activas": 2,
  "puede_agregar_sede": true,
  "sin_limite_sedes": false
}
```

**B)** Crear un endpoint separado `GET /clinicas/mi-clinica/sedes-limite/` con solo los campos de sedes.

Cualquiera de las dos nos sirve. Necesitamos el `max_sedes` sobre todo — sin él no podemos mostrar el denominador de la barra.

**Respuesta (Backend):**

Implementada la opción A. `GET /clinicas/mi-clinica/plan/` ahora incluye los campos de sedes junto a los de usuarios:

```json
{
  "plan": { "id": "...", "nombre": "Pro", "max_usuarios": 10, "max_sedes": 3, ... },
  "usuarios_activos": 7,
  "puede_agregar": true,
  "slots_disponibles": 3,
  "sin_limite": false,
  "sedes_activas": 2,
  "puede_agregar_sede": true,
  "slots_disponibles_sedes": 1,
  "sin_limite_sedes": false
}
```

`sin_limite_sedes: true` (y `slots_disponibles_sedes: null`) cuando el plan no tiene `max_sedes` configurado (`max_sedes = 0`) o la clínica no tiene plan asignado.

---

## 20. Idempotencia de `iniciar_registro_asistencia` cuando ya hay un documento `enviada` pendiente

**Pregunta (Frontend):**
Confirmamos junto con `docs/api.md` §"Cómo se expone el resultado de la firma al frontend" que `firma_asistencia_estado` solo lo escribe el webhook de Documenso (`firmada`/`rechazada`); ni `iniciar_registro_asistencia` ni `enviar_firma_asistencia` lo tocan, y el evento client-side del SDK embed no es fuente de verdad.

Esto deja un hueco: si el paciente firma en el widget pero el usuario (recepción) refresca la página, cierra el wizard, o lo reabre desde otra sesión/dispositivo **antes de que llegue el webhook**, el frontend pierde por completo la señal de "ya firmó, falta confirmación" — porque esa señal hoy solo vive en estado local de React, no en el backend. La cita sigue reportando `firma_asistencia_estado = "enviada"`, indistinguible de "todavía no firmó".

En ese escenario, el wizard vuelve a mostrar el botón "Generar y firmar". Si el usuario hace clic:
- ¿`iniciar_registro_asistencia` detecta que ya existe un documento `enviada` pendiente (`firma_asistencia_documento_id`) para esa cita y reutiliza el mismo envelope/`signing_token` (idempotente), igual que `iniciar_firma` lo hace para consentimientos (ver `api.md` §Iniciar firma embebida en Documenso)?
- ¿O genera un envelope nuevo en Documenso cada vez, dejando el anterior huérfano (y potencialmente dos documentos firmables para la misma cita)?

Si no es idempotente hoy, ¿se puede agregar ese chequeo (reutilizar `firma_asistencia_documento_id` si su estado en Documenso sigue pendiente, en vez de crear uno nuevo)?

**Respuesta (Backend):**

Implementado. `iniciar_registro_asistencia` es ahora idempotente — mismo patrón que `iniciar_firma` para consentimientos.

**Nuevo campo:** `firma_asistencia_signing_token` (CharField, blank=True) en el modelo `Cita`. Migración `0013_cita_firma_asistencia_signing_token` aplicada. El token ahora se persiste junto con `firma_asistencia_documento_id` al crear el envelope.

**Tres ramas en la función** (`apps/consentimientos/services.py` → `iniciar_registro_asistencia_documenso`):

| Situación | Comportamiento |
|---|---|
| `firma_asistencia_documento_id` + `firma_asistencia_signing_token` presentes | Devuelve los valores guardados directamente — **sin llamar a Documenso** |
| `firma_asistencia_documento_id` presente pero sin token | Llama `GET /api/v2/envelope/{id}` en Documenso para recuperar el token, lo persiste y lo devuelve |
| Ninguno presente | Flujo normal: crea el envelope, lo distribuye, guarda `documento_id` + `signing_token` + `estado = "enviada"` |

**Caso del frontend** (refresh / re-apertura del wizard antes del webhook): el botón "Generar y firmar" llama de nuevo a `POST /agenda/citas/{id}/iniciar_registro_asistencia/`. Como `firma_asistencia_documento_id` y `firma_asistencia_signing_token` ya están persistidos, el backend los devuelve inmediatamente sin crear un envelope nuevo. El wizard puede re-inicializar el embed con el mismo `signing_token` que el paciente ya tenía abierto.

**No hay cambio de interfaz** — el response sigue siendo `{ "signing_token": "...", "document_id": "..." }`.

---

## 21. ¿El webhook de asistencia descarga y guarda el PDF firmado, igual que consentimientos?

**Pregunta (Frontend):**
`docs/api.md` §Webhook Documenso documenta, para consentimientos, que al recibir `document.completed` el backend intenta descargar el PDF firmado y lo guarda en el campo `archivo` (y que si la descarga falla, el consentimiento igual queda `firmado=true`).

Para asistencia no encontramos el mismo detalle documentado, ni un campo equivalente a `archivo` en `CitaSerializer` (solo existe `firma_asistencia_documento_id`, que es el id del envelope en Documenso, no un PDF).

Necesitamos saber:
- ¿`_handle_firma_asistencia` (el handler de asistencia dentro del webhook) también descarga el PDF firmado de Documenso y lo persiste en algún lado recuperable por el frontend? Si sí, ¿en qué campo/endpoint se expone (ej. una URL firmada de S3/MinIO, un campo nuevo en `CitaSerializer`, o hay que pedirlo a Documenso directamente con `firma_asistencia_documento_id`)?
- Si hoy no se guarda, ¿está planeado, o el PDF firmado de asistencia solo queda disponible dentro de Documenso (consultable vía su API con el `documento_id`)?

Esto nos importa para poder mostrar/descargar el comprobante de asistencia firmado desde el detalle de la atención, igual que ya se hace con los consentimientos.

**Respuesta (Backend):**

Implementado. El webhook de asistencia ahora descarga y persiste el PDF firmado, igual que hace con los consentimientos.

**Antes:** `_handle_firma_asistencia` solo actualizaba `firma_asistencia_estado`. El campo `firma_asistencia_archivo` existía en el modelo (migración 0012) pero nunca se poblaba.

**Ahora:** cuando el evento es `DOCUMENT_COMPLETED`, el handler llama `descargar_pdf_documenso(document_id)` y guarda el resultado en `cita.firma_asistencia_archivo` (bajo `firma_asistencia/<año>/<mes>/<cita_id>.pdf` en MinIO). Si la descarga falla, el estado igual queda `"firmada"` y se loguea la excepción — mismo comportamiento defensivo que consentimientos.

**Campo nuevo en `CitaSerializer`:**

```json
{
  "firma_asistencia_archivo_url": "https://minio.../firma_asistencia/2026/06/<cita_id>.pdf"
}
```

`firma_asistencia_archivo_url` es una URL firmada de MinIO (TTL 1 hora), o `null` si el PDF no se ha guardado aún. Aparece junto a `firma_asistencia_estado` y `firma_asistencia_documento_id` en el serializer de `Cita`.

**Para el frontend:** usar `firma_asistencia_archivo_url` para mostrar/descargar el comprobante. Si es `null` (aún no llegó el webhook o falló la descarga), puede ofrecerse reintentar vía `firma_asistencia_documento_id` consultando Documenso directamente.

---

## 22. Dos bugs en el flujo de firma de asistencia — externalId y serializer

**Reporte (Frontend):**

Se detectaron dos bugs al probar el flujo completo de firma de asistencia en producción.

---

### 22.1 El webhook de Documenso se ignora por falta de `externalId`

Los logs del servidor muestran:

```
Webhook Documenso sin externalId | payload={'id': 323, 'externalId': None, ...}
```

El handler del webhook usa `externalId` para enrutar el evento a `_handle_firma_asistencia`. Como el documento se crea sin `externalId`, el webhook llega con `None` y es descartado. Consecuencia: `firma_asistencia_estado` nunca pasa a `"firmada"`, el frontend hace polling indefinidamente y el wizard no avanza.

**Pedido:** al llamar a la API de Documenso en `iniciar_registro_asistencia_documenso` (o donde se cree el documento), incluir `externalId = str(cita.id)` (o el prefijo que el webhook handler ya espera). El handler podrá así enrutar el evento correctamente al llegar.

---

### 22.2 `firma_asistencia_signing_token` no está en `CitaSerializer`

El campo `firma_asistencia_signing_token` fue agregado al modelo `Cita` en P20 (migración `0013`), pero **no aparece en la respuesta de `GET /agenda/citas/{id}/`**. Se puede verificar por el tamaño de la respuesta (≈1960 bytes), que no varía al nivel esperado si el token de ~21 caracteres estuviera presente.

Sin este campo en el serializer, el frontend no puede recuperar el token al re-abrir el wizard y la prop `initialSigningToken` siempre llega como `null`.

**Pedido:** exponer `firma_asistencia_signing_token` en `CitaSerializer` (junto a `firma_asistencia_estado` y `firma_asistencia_documento_id`).

**Workaround actual en el frontend:** cuando `firma_asistencia_estado === "enviada"`, el wizard auto-llama `iniciarRegistroAsistencia` al montar (que es idempotente y devuelve el token persistido). Esto funciona pero hace una llamada extra innecesaria que se evitaría si el token viniera en el serializer.

**Respuesta (Backend):**

### 22.1 — `externalId` ausente en el envelope

Corregido. `_crear_envelope_documenso` ahora acepta el kwarg opcional `external_id` y lo incluye en el payload de `POST /api/v2/envelope/create`. La llamada en `iniciar_registro_asistencia_documenso` pasa `external_id=f"asistencia:{cita.id}"`, que es exactamente el prefijo que el webhook handler espera para enrutar a `_handle_firma_asistencia`.

Flujo corregido:
```
iniciar_registro_asistencia  →  crea envelope con externalId="asistencia:<uuid>"
                                          ↓ (paciente firma)
webhook DOCUMENT_COMPLETED   →  externalId="asistencia:<uuid>" → _handle_firma_asistencia
                                          ↓
                               cita.firma_asistencia_estado = "firmada"  ✅
```

### 22.2 — `firma_asistencia_signing_token` en `CitaSerializer`

Corregido. El campo se agregó a `fields` y `read_only_fields` de `CitaSerializer`. `GET /agenda/citas/{id}/` ahora incluye:

```json
{
  "firma_asistencia_estado": "enviada",
  "firma_asistencia_documento_id": "323",
  "firma_asistencia_signing_token": "eyJ...",
  "firma_asistencia_archivo_url": null
}
```

Con el token disponible en el serializer, el wizard puede inicializarse con `initialSigningToken` directamente desde el response de `GET /citas/{id}/` sin necesidad de llamar a `iniciarRegistroAsistencia` de nuevo.

---

## 24. ¿`GET /agenda/citas/` soporta filtrar por `estado` y/o `firma_asistencia_estado`?

**Pregunta (Frontend):**

En la página de detalle de paciente (`/pacientes/[id]`) agregamos una sección "Asistencias firmadas" que muestra las citas cuyo documento de asistencia fue firmado en el paso 4 del wizard. Para cargar esos datos usamos:

```ts
agendaApi.citas.list({ paciente: id, estado: 'completada', page_size: 50 })
```

y luego filtramos en cliente las que tienen `firma_asistencia_estado === 'firmada'`.

Necesitamos confirmar:
- ¿El param `?estado=completada` está soportado como filtro en `GET /agenda/citas/`? Ya aparece en la interfaz `CitasFilter` del frontend, pero no está documentado explícitamente.
- ¿Existe o puede existir un filtro `?firma_asistencia_estado=firmada` para que el backend devuelva directamente solo las citas firmadas, evitando el filtrado en cliente y el `page_size` alto?

Si `firma_asistencia_estado` no está soportado como filtro, ¿es seguro usar `?estado=completada&page_size=50` como aproximación, o hay casos donde una cita firmada pueda tener otro estado?

**Respuesta (Backend):**

- **`?estado=completada`** — sí está soportado y siempre lo estuvo.
- **`?paciente=<uuid>`** — **no estaba soportado**; acaba de agregarse. Úsalo para traer solo las citas del paciente.
- **`?firma_asistencia_estado=firmada`** — **no estaba soportado**; acaba de agregarse.

**`?estado=completada` NO es una aproximación segura.** Una cita puede tener `firma_asistencia_estado=firmada` con `estado=en_curso` (el paciente firma al inicio de la sesión, antes de que el profesional la complete). Usando ese filtro se perderían esas citas.

**Query recomendada:**

```ts
agendaApi.citas.list({ paciente: id, firma_asistencia_estado: 'firmada' })
```

No necesitas `page_size` alto ni filtrado en cliente.

---

## 23. [BUG] `POST /auth/impersonate/` devuelve `USER_NOT_FOUND` — el frontend pasa `Colaborador.id` en vez de `User.id`

**Reporte (Backend):**

Al llamar `POST /api/v1/auth/impersonate/<uuid>/` se recibe `USER_NOT_FOUND` (HTTP 404) aunque el usuario existe en la UI. Investigado en base de datos: el UUID enviado (`c54ebf49-318c-4a93-8120-53df098dcbbb`) no corresponde a ningún `User` — corresponde al registro `Colaborador` del mismo usuario (`pro1@demo.com`).

El endpoint espera el `User.id`, no el `Colaborador.id`. Son dos tablas distintas con UUIDs distintos:

| Campo | UUID |
|---|---|
| `User.id` (correcto) | `2334f298-6926-4810-ac3a-18574bdedaa8` |
| `Colaborador.id` (incorrecto — lo que envía el frontend) | `c54ebf49-318c-4a93-8120-53df098dcbbb` |

**El backend no requiere cambios.** El endpoint `/auth/impersonate/<user_id>/` busca por `User.id` y eso es correcto.

**Acción para el frontend:** en el listado de usuarios del panel admin, usar el campo `id` del objeto `User` (que viene de `GET /api/v1/usuarios/` o de la respuesta de tenant), no el `id` del `Colaborador`. Si la tabla muestra colaboradores y se construye el UUID desde ese modelo, hay que hacer join/lookup al `user_id` del colaborador antes de llamar al endpoint de impersonación.

---

## 24. Wizard de inicio de atención configurable por clínica — ¿qué tan complejo es en el backend?

**Pregunta (Frontend):**

Hoy el wizard de inicio de atención tiene 4 pasos fijos para todas las clínicas: Llegada (OTP/foto), Consentimientos, Pago y Firma de asistencia. Queremos que cada clínica pueda activar o desactivar cada paso según su operación — por ejemplo, una clínica que no maneja firma digital de asistencia no debería ver ese paso, y una que cobra por adelantado no necesita el paso de pago en el wizard.

La pregunta es de **estimación de complejidad**, no de implementación inmediata. Antes de diseñar el frontend queremos entender qué tanto implica esto en el backend.

**Lo que necesitaríamos del backend:**

1. **Almacenar la config por clínica** — algún lugar donde persistan las preferencias del wizard de esa clínica (qué pasos están habilitados). No tenemos opinión sobre si es un modelo nuevo, un JSONField en `Clinica`, o algo más.

2. **Exponer la config al frontend** — que el frontend pueda leer la config al cargar (idealmente en un endpoint que ya consulta, como `GET /clinicas/mi-clinica/`, para no agregar una llamada extra).

3. **Respetar la config en el backend** — esto es la parte que nos genera duda. Si un paso está deshabilitado para una clínica (ej. el paso de Pago), ¿necesitaría el backend relajar alguna validación que hoy asume que el cobro siempre existe antes de `en_curso`? O dicho de otro modo: ¿hay lógica server-side que dependa de que esos pasos se cumplan, o toda la orquestación del wizard es responsabilidad del frontend?

**Preguntas concretas:**

- ¿Cuánto peso tiene esto en el backend? ¿Es principalmente un cambio de datos (nuevo campo en `Clinica` + exponerlo) o implica tocar lógica de negocio?
- ¿Hay validaciones en `cambiar_estado` u otros endpoints que asuman que ciertos pasos del wizard ya ocurrieron (cobro, firma, consentimiento) y que habría que volver condicionales?
- ¿Existe ya algún mecanismo de feature flags o configuración por clínica que podamos reutilizar, o habría que crearlo desde cero?

**Respuesta (Backend):**

### 1. Peso en el backend — principalmente datos, con una excepción puntual

Agregar la config es mínimo: un nuevo modelo `ConfiguracionWizard` (OneToOne a `Clinica`, igual al patrón existente de `ConfiguracionSignosVitales` y `ConfiguracionHistoria` en `apps/configuracion/models.py`) con cuatro BooleanField, uno por paso:

```python
class ConfiguracionWizard(BaseModel):
    clinica = models.OneToOneField("clinicas.Clinica", on_delete=models.CASCADE, related_name="config_wizard")
    paso_checkin = models.BooleanField(default=True)
    paso_consentimientos = models.BooleanField(default=True)
    paso_pago = models.BooleanField(default=True)
    paso_firma_asistencia = models.BooleanField(default=True)
```

Una migración, un serializer, un viewset GET/PATCH — exactamente como `ConfiguracionHistoriaViewSet` ya funciona. El frontend lo lee en `GET /configuracion/wizard/` y decide qué pasos renderizar.

**La excepción:** hay una validación server-side que sí necesita volverse condicional (ver punto 2).

---

### 2. Validaciones en `cambiar_estado` que asumen pasos cumplidos

Solo hay **una** validación relevante, y es la de consentimientos (`apps/agenda/views.py`, acción `cambiar_estado`, líneas 251–269):

```python
if nuevo_estado == Cita.Estado.EN_CURSO:
    info = build_consentimiento_info(cita)
    if not info["todos_firmados"]:
        return Response({"code": "CONSENTIMIENTO_REQUERIDO", ...}, 400)
```

Si una clínica deshabilita el paso de consentimientos, esta validación la bloqueará igual. Hay que condicionarla a `clinica.config_wizard.paso_consentimientos`.

Los otros tres pasos **no tienen enforcement server-side**:

| Paso | ¿Validación en el backend? |
|---|---|
| OTP / Check-in | No enforcement directo. Sí hay una restricción indirecta: `FLUJOS_ESTADO` prohíbe `CONFIRMADA → EN_CURSO` directamente — la cita debe pasar por `EN_ESPERA` primero. Pero el check-in (OTP/foto) en sí no es validado; se puede transicionar a `EN_ESPERA` sin haberlo hecho. |
| Cobro | No. Confirmado en P10 §4: el backend no valida existencia de cobro antes de `en_curso`. |
| Firma de asistencia | No. `firma_asistencia_estado` no se verifica en ninguna transición de estado. |

En resumen: **un único `if` en `cambiar_estado`** que saltee la validación de consentimientos cuando el paso está deshabilitado para la clínica. Todo lo demás ya es responsabilidad del frontend.

---

### 3. Mecanismo de feature flags por clínica — ya existe, hay que extenderlo

El patrón está en `apps/configuracion/`. Hay dos modelos OneToOne con config por clínica:

- `ConfiguracionSignosVitales` — campos extra de signos vitales (JSONField)
- `ConfiguracionHistoria` — tabs activos en la historia clínica (JSONField con lista de slugs)

Ambos usan `get_or_create` con defaults razonables para que las clínicas que no lo configuran funcionen igual que hoy. El nuevo `ConfiguracionWizard` seguiría el mismo patrón: todos los pasos en `True` por defecto, por lo que el comportamiento actual no cambia para nadie hasta que un admin lo toque.

**Ruta propuesta:** `GET / PATCH /configuracion/wizard/` — misma estructura que `GET/PATCH /configuracion/historia/`.

**Para exponerlo en el arranque del frontend** sin una llamada extra: se puede incluir el objeto `config_wizard` directamente dentro de la respuesta de `GET /clinicas/mi-clinica/`. El `MiClinicaSerializer` actualmente solo devuelve `id`, `nombre`, `nit`, `telefono`, `ciudad`, `direccion` y `logo_url`; agregar un campo anidado `wizard` con los cuatro flags es trivial y evita el roundtrip adicional.

---

## 24.1 Contrato frontend ↔ backend para `ConfiguracionWizard`

**Reporte (Frontend):**

Con base en la respuesta del backend en P24, documentamos el contrato exacto que el frontend va a consumir. Por favor confirmar que la implementación respeta estos shapes antes de hacer merge, para que el frontend pueda avanzar en paralelo sin riesgo de rotura.

---

### Shape esperado en `GET /clinicas/mi-clinica/`

El frontend leerá la config del wizard desde el campo `wizard` embebido en la respuesta de `mi-clinica` (como confirmó el backend en P24). El shape que esperamos:

```json
{
  "id": "uuid",
  "nombre": "Clínica Ejemplo",
  "wizard": {
    "paso_checkin":           true,
    "paso_consentimientos":   true,
    "paso_pago":              true,
    "paso_firma_asistencia":  true
  }
}
```

**Contratos que el frontend necesita respetar:**

- El campo `wizard` **siempre debe estar presente** en la respuesta (no `null`, no ausente), incluso si la clínica no tiene `ConfiguracionWizard` creada aún. En ese caso el backend debe devolver los defaults `true` via `get_or_create`. Si `wizard` puede llegar como `null` o ausente, el frontend lo tratará como todos los pasos en `true`, pero preferimos que el backend lo garantice.
- Los nombres de los campos son exactamente `paso_checkin`, `paso_consentimientos`, `paso_pago`, `paso_firma_asistencia` — el frontend usará estos nombres directamente en los tipos TypeScript. Si cambian, hay que coordinarlo.

---

### Shape esperado en `GET /configuracion/wizard/` y `PATCH /configuracion/wizard/`

Para la futura pantalla de configuración en el panel admin.

**GET** devuelve:
```json
{
  "paso_checkin":           true,
  "paso_consentimientos":   true,
  "paso_pago":              true,
  "paso_firma_asistencia":  true
}
```

**PATCH** acepta cualquier subconjunto de los campos (partial update):
```json
{ "paso_firma_asistencia": false }
```

Y devuelve el objeto completo actualizado.

---

### Validación de consentimientos en `cambiar_estado`

Confirmar que el `if` condicional se implementa **antes** de que el frontend active la posibilidad de deshabilitar `paso_consentimientos` en la UI. Hasta que esa validación no sea condicional, una clínica que desactive el paso quedaría bloqueada por el backend al intentar pasar a `en_curso`. El frontend no expondrá el toggle de consentimientos en la UI de config hasta recibir confirmación de que el backend ya es condicional.

Los otros tres pasos no tienen enforcement server-side (confirmado en P24), por lo que el frontend puede habilitarlos/deshabilitarlos libremente desde el día 1.

**Respuesta (Backend):**

Implementado. Migración `0004_configuracionwizard` aplicada. `python manage.py check` sin errores.

**`GET /clinicas/mi-clinica/`** — campo `wizard` siempre presente, nunca `null`. Se crea via `get_or_create` al primer acceso, todos los defaults en `true`. El shape es exactamente el documentado por el frontend.

**`GET / PATCH /configuracion/wizard/`** — disponible. `PATCH` acepta partial update de cualquier subconjunto de los cuatro campos. Solo usuarios con rol `admin` pueden hacer `PATCH`; cualquier usuario autenticado puede hacer `GET`.

**Validación condicional de consentimientos** — implementada en `apps/agenda/views.py`. La lógica es:

```python
config_wizard, _ = ConfiguracionWizard.objects.get_or_create(clinica_id=cita.clinica_id)
if config_wizard.paso_consentimientos:
    # validación de todos_firmados (comportamiento anterior)
```

Si `paso_consentimientos = false`, el backend omite la validación y la cita puede pasar a `en_curso` sin consentimientos firmados. El frontend puede activar el toggle en la UI desde ahora.

---

### 24.1 Corrección — `paso_consentimientos` excluido del wizard configurable

**Actualización (Frontend):**

Después de revisar el flujo, decidimos que **el paso de consentimientos informados NO debe ser configurable** — es siempre obligatorio para todas las clínicas. El frontend no mostrará un toggle para ese paso en la UI de configuración.

**Contratos corregidos (reemplaza los shapes originales):**

**`GET /clinicas/mi-clinica/` — campo `wizard`:**
```json
{
  "wizard": {
    "paso_checkin":          true,
    "paso_pago":             true,
    "paso_firma_asistencia": true
  }
}
```

**`GET / PATCH /configuracion/wizard/`:**
```json
{
  "paso_checkin":          true,
  "paso_pago":             true,
  "paso_firma_asistencia": true
}
```

**Pedido al backend:**
- Remover `paso_consentimientos` de `ConfiguracionWizard` (modelo, migración, serializer y endpoint).
- La validación de consentimientos en `cambiar_estado` debe mantenerse **siempre activa** (no condicional), ya que el paso no puede deshabilitarse.
- Si ya está en producción la implementación con `paso_consentimientos`, puede dejarse en el modelo sin exponerlo en el serializer — el frontend lo ignorará por completo.

**Respuesta (Backend):**

Ajustado. El campo `paso_consentimientos` se dejó en el modelo/DB (sin nueva migración) pero se removió de todos los contratos expuestos:

- `ConfiguracionWizardSerializer` — `paso_consentimientos` eliminado de `fields`. `GET/PATCH /configuracion/wizard/` expone solo `paso_checkin`, `paso_pago`, `paso_firma_asistencia`.
- `MiClinicaSerializer.get_wizard()` — idem, el dict retornado tiene solo los tres campos.
- `cambiar_estado` — revertido a validación siempre activa (se eliminó el `if config_wizard.paso_consentimientos`). El comportamiento es idéntico al que existía antes de P24.

`python manage.py check` sin errores.

---

## 25. Exponer `cobro_id` en `CitaSerializer` para detectar cobro previo en el wizard

**Pregunta (Frontend):**

El wizard de inicio de atención tiene un paso de pago que registra un cobro (`POST /cobros/cobros/` + `POST /cobros/cobros/{id}/registrar_pago/`). El wizard ya **no llama `cambiarEstado(en_curso)`** — su único rol es hacer los pre-checks y dejar la cita lista para que recepción la inicie desde la agenda.

Esto genera un problema al reabrir el wizard: no tenemos cómo saber desde `GET /agenda/citas/{id}/` si ya se registró un cobro para esa cita. Actualmente usamos un booleano local (`pagoRegistrado`) que se pierde al cerrar el modal. Si el usuario cierra el wizard después de pagar pero antes de la firma y lo reabre, el paso de pago aparece de nuevo y podría crear un cobro duplicado.

**Pedido:** agregar `cobro_id: string | null` al `CitaSerializer`. El valor debe reflejar si ya existe al menos un `Cobro` activo vinculado a esa cita.

Shape esperado en `GET /agenda/citas/{id}/`:
```json
{
  "cobro_id": "uuid-del-cobro" | null
}
```

- `cobro_id` es el `id` del cobro más reciente vinculado a la cita (o el único, si siempre hay máximo uno por cita).
- Si no existe ningún cobro, devuelve `null`.
- No necesitamos el cobro completo — solo saber si existe para saltar el paso de pago en el wizard.

Con este campo, el frontend puede derivar `pagoDone = cita.cobro_id !== null` de forma fiable, sin llamadas adicionales ni estado local.

**Respuesta (Backend):**

Implementado. `cobro_id` agregado a `CitaSerializer` como `SerializerMethodField` (read-only). Usa la relación inversa `cita.cobro` del `OneToOneField` existente — sin query adicional cuando la cita ya va con `select_related("cobro")`.

`GET /agenda/citas/{id}/` ahora incluye:
```json
{
  "cobro_id": "uuid-del-cobro" | null
}
```

`null` cuando no existe cobro asociado. No se necesita ninguna migración.

---

## 26. Campo `sedes` en campañas — ¿se guarda y devuelve correctamente?

**Pregunta (Frontend):**

En la página `/configuracion/campanas`, los checkboxes de sedes no se muestran como seleccionados al editar una campaña que fue creada con sedes específicas. Hemos descartado problemas en el formulario (react-hook-form, watch, reset) y ahora sospechamos que el problema está en el backend.

Necesitamos confirmar:

**1. ¿`GET /clinicas/campanas/{id}/` devuelve `sedes` como array de UUIDs?**

El tipo en el frontend espera:
```json
{
  "id": "uuid",
  "nombre": "Campaña Verano",
  "sedes": ["uuid-sede-1", "uuid-sede-2"],
  "sedes_nombres": ["Sede Norte", "Sede Sur"],
  ...
}
```
¿El endpoint de detalle incluye el campo `sedes`? ¿Siempre es un array (nunca `null`)?

**2. ¿`GET /clinicas/campanas/` (listado) también incluye `sedes` en cada ítem?**

El listado ya nos daba `sedes: undefined` en producción (de ahí el crash original con `.length`). Si el listado no incluye `sedes`, ¿el detalle sí lo incluye?

**3. Al hacer `PATCH /clinicas/campanas/{id}/` con `sedes: ["uuid-sede-1"]`, ¿el backend guarda esas sedes y las devuelve en el GET siguiente?**

Queremos confirmar el round-trip completo: guardamos con sedes → hacemos GET → `sedes` contiene los UUIDs correctos.

**4. Si `sedes: []` (array vacío) significa "todas las sedes", ¿el backend lo almacena como vacío o lo convierte a `null`?**

El frontend envía `sedes: []` para "todas las sedes". Necesitamos saber cómo viene de vuelta en el GET.

**Respuesta (Backend):**

Tenían razón: **el bug estaba en el backend**, no en react-hook-form.

**Causa raíz**

`CampanaSerializer` solo exponía `sedes_ids` como campo **write-only** y `sedes_nombres` en lectura. **No existía `sedes` en la respuesta JSON** de `GET /clinicas/campanas/` ni `GET /clinicas/campanas/{id}/`. Por eso el listado llegaba con `sedes: undefined` y, al editar, los checkboxes no tenían UUIDs para marcar.

Además, **`PATCH` con clave `sedes` no persistía nada** si el payload no incluía `sedes_ids` (el serializer ignoraba silenciosamente el campo).

**Corrección aplicada**

Se añadió `sedes` como array de UUIDs en **lectura y escritura**. `sedes_ids` se mantiene como alias write-only por compatibilidad.

**Respuestas puntuales**

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | ¿Detalle devuelve `sedes` como array de UUIDs? | **Sí, ahora sí.** Siempre array; si no hay sedes específicas, `[]`. Nunca `null`. |
| 2 | ¿Listado incluye `sedes`? | **Sí, ahora sí** en cada ítem del listado y en `activas/`. |
| 3 | ¿Round-trip `PATCH sedes` → `GET sedes`? | **Sí.** Enviar `sedes: ["uuid-sede-1"]` o `sedes_ids: ["uuid-sede-1"]` persiste y el GET siguiente devuelve esos UUIDs en `sedes`. |
| 4 | ¿`[]` = todas las sedes? | **Sí.** M2M vacío en BD. El GET devuelve `"sedes": []` y `"sedes_nombres": []` (no `null`). Semántica: campaña global a la clínica. |

**Contrato actualizado (detalle y listado)**

```json
{
  "id": "uuid",
  "nombre": "Campaña Verano",
  "sedes": ["uuid-sede-1", "uuid-sede-2"],
  "sedes_nombres": ["Sede Norte", "Sede Sur"],
  "fecha_inicio": "2026-06-01",
  "fecha_fin": "2026-08-31",
  "items": [],
  "activo": true
}
```

**Escritura (`POST` / `PATCH`)**

Preferido:
```json
{ "sedes": ["uuid-sede-1", "uuid-sede-2"] }
```

También válido (alias legacy):
```json
{ "sedes_ids": ["uuid-sede-1"] }
```

Para “todas las sedes”: `{ "sedes": [] }`.

**Frontend:** pueden seguir usando `sedes` en el formulario; al hacer `reset(campana)` los checkboxes deberían marcarse con los UUIDs del GET. Defensivamente, traten `sedes ?? []` por si hay cache de respuestas antiguas.

---

## Q27 — Aplicar precio de campaña en ítem con `precio_bloqueado=true`

**Contexto**

Al revisar la api.md, notamos que **no existe `PATCH /cotizaciones/{id}/items/{itemId}/`** — el único endpoint de edición es `PATCH /cotizaciones/{id}/` con reemplazo completo de ítems.

El frontend actualmente aplica el precio de campaña actualizando el estado local del formulario y luego el usuario guarda con el `PATCH /cotizaciones/{id}/` habitual. El payload incluye `valor_unitario: <precio_campana>` para el ítem afectado.

**Pregunta principal**

Cuando un ítem es `tipo=procedimiento` con un `procedimiento` que tiene `precio_base` configurado, y el usuario envía `valor_unitario: <precio_campana>` (distinto del `precio_base`) en el `PATCH /cotizaciones/{id}/`, ¿el backend:

**a)** Ignora el `valor_unitario` enviado y lo sobreescribe con `precio_base` silenciosamente (el ítem se guarda con precio de catálogo, no de campaña)?
**b)** Devuelve `400 PRECIO_BLOQUEADO` (rechaza el cambio)?
**c)** Acepta el `valor_unitario` enviado si está asociado a una campaña activa (hace excepciones)?

La api.md dice "auto-completa `valor_unitario <- procedimiento.precio_base` (si configurado)" — no queda claro si "auto-completa" significa "override siempre" o "solo si vacío".

**Para tratamientos** la api.md dice "si viene vacío" explícitamente, por lo que asumimos que para tratamientos el frontend SÍ puede enviar el precio de campaña y el backend lo respetará. ¿Es correcto?

**Pedido**

Si la respuesta a la pregunta principal es **a)** o **b)** para procedimientos, ¿podría el backend aceptar `valor_unitario = precio_campana_disponible` sin bloquear, dado que el precio de campaña fue configurado por un administrador (no es modificación arbitraria del usuario)?

**Workaround actual en el frontend**

El `PATCH /cotizaciones/{id}/items/{itemId}/` fue eliminado del frontend (no existe en la API). "Aplicar" ahora solo actualiza el estado local del formulario y el usuario guarda con "Guardar".

**Respuesta (Backend):**

| Opción | ¿Aplica? | Detalle |
|--------|----------|---------|
| **a)** Override silencioso con `precio_base` | **No** | `_hydrate_from_procedimiento` solo autocompleta `valor_unitario` si viene **vacío**. Si el frontend envía un valor explícito, el backend lo respeta (sujeto a validación de bloqueo). |
| **b)** `400 PRECIO_BLOQUEADO` | **Parcial** | Era el comportamiento anterior para **cualquier** `valor_unitario` distinto al catálogo sin permiso `cotizaciones.cambiar_precio`, incluido procedimientos **y** tratamientos. |
| **c)** Acepta precio de campaña activa | **Sí (implementado)** | Si `valor_unitario` coincide con el `precio_campana` de una campaña **activa** para la sede de la cotización y el procedimiento/tratamiento del ítem, se acepta **sin** `cotizaciones.cambiar_precio`. |

**Aclaraciones**

1. **Auto-completado vs override:** "Auto-completa" significa **solo si vacío** (procedimientos y tratamientos). No reemplaza un `valor_unitario` enviado explícitamente en el payload.

2. **Tratamientos:** La suposición del frontend era **incorrecta**. Los tratamientos con `precio_estimado` también tienen `precio_bloqueado=true` y la misma regla de bloqueo (con la misma excepción de campaña).

3. **Pedido del frontend:** Implementado. En `PATCH /cotizaciones/{id}/` con reemplazo de ítems, enviar `valor_unitario` igual a `precio_campana_disponible` del GET es válido para usuarios con `cotizaciones.gestionar` aunque no tengan `cotizaciones.cambiar_precio`.

**Condiciones para la excepción de campaña**

- Campaña con fechas vigentes (`fecha_inicio` ≤ hoy ≤ `fecha_fin`) y `activo=true`.
- La sede de la cotización está en `campana.sedes`, **o** `campana.sedes` está vacío (todas las sedes).
- El ítem referencia el mismo `procedimiento` o `tratamiento` que el `CampanaItem`.
- `valor_unitario` enviado **igual** al `precio_campana` configurado (comparación exacta de decimal).

**Flujo recomendado en frontend**

1. Leer `precio_campana_disponible` (y opcionalmente `campana_id`) del ítem en el GET de la cotización.
2. Al "Aplicar campaña", actualizar el estado local con ese valor.
3. Guardar con `PATCH /cotizaciones/{id}/` incluyendo `valor_unitario: "<precio_campana_disponible>"` en el ítem.
4. No hace falta permiso `cotizaciones.cambiar_precio` si el valor coincide con campaña activa.

**Errores**

Precio distinto al catálogo **y** distinto a campaña activa, sin permiso:

```json
{
  "items": {
    "valor_unitario": "No tienes permiso para modificar el precio de un item con precio bloqueado.",
    "code": "PRECIO_BLOQUEADO"
  }
}
```

(Con un solo ítem en el payload, `normalize_error_response` aplana el array de errores anidados a ese objeto.)

---

## Q28 — Métricas de ventas por campaña

**Contexto**

Queremos mostrar en la página de administración de campañas cuántas ventas se han generado gracias a cada campaña. Un "venta" = cotización en `estado=aceptada` que tiene al menos un ítem con `campana_id` igual al ID de esa campaña.

**Pedido**

¿Podría el backend incluir estadísticas de ventas en la respuesta de `GET /clinicas/campanas/` y `GET /clinicas/campanas/{id}/`? Idealmente campos de solo lectura en cada campaña:

```json
{
  "id": "uuid",
  "nombre": "Campaña Verano",
  ...campos actuales...,
  "stats": {
    "cotizaciones_aceptadas": 12,
    "items_vendidos": 15,
    "monto_total": "4200000.00"
  }
}
```

- `cotizaciones_aceptadas`: número de cotizaciones únicas en `estado=aceptada` con al menos un ítem de esta campaña.
- `items_vendidos`: número total de ítems (de cotizaciones `aceptada`) que referencian esta campaña.
- `monto_total`: suma de `subtotal` de esos ítems.

Si el campo `campana_id` en `ItemCotizacion` es suficiente para hacer la join, debería ser straightforward.

**Alternativa aceptable**

Si prefieren no incluirlo en el listado (por performance), un endpoint separado `GET /clinicas/campanas/{id}/stats/` también está bien.

**Respuesta (Backend):**

Implementado en **`GET /clinicas/campanas/`**, **`GET /clinicas/campanas/{id}/`** y **`GET /clinicas/campanas/activas/`** — no hace falta endpoint separado.

**Nota técnica:** `campana_id` en la respuesta de cotizaciones era un campo calculado (campaña activa al momento del GET). Para métricas históricas fiables se añadió **`campana` FK en `ItemCotizacion`**, que se persiste al guardar un ítem cuyo `valor_unitario` coincide con el `precio_campana` de una campaña activa para la sede (misma regla que Q27).

**Contrato `stats` (solo lectura):**

```json
{
  "stats": {
    "cotizaciones_aceptadas": 12,
    "items_vendidos": 15,
    "monto_total": "4200000.00"
  }
}
```

| Campo | Definición |
|-------|------------|
| `cotizaciones_aceptadas` | Cotizaciones únicas con `estado=aceptada` y ≥1 ítem con `campana_id` = esta campaña |
| `items_vendidos` | Cantidad de ítems activos en cotizaciones `aceptada` con esa FK |
| `monto_total` | Suma de `subtotal` de esos ítems (incluye `num_citas` y `descuento_porcentaje`) |

Solo cuentan cotizaciones **`aceptada`**. Borradores u otros estados no entran en las métricas aunque el ítem tenga precio de campaña.

**Frontend:** pueden leer `stats` directamente del listado o detalle de campañas; no requiere llamadas adicionales.

---

## Q29 — Autoregistro público de pacientes

**Feature**

Queremos que el recepcionista pueda enviarle a un paciente un link público (WhatsApp, QR en recepción, etc.) para que se registre él mismo, sin necesitar login. El link sería único por clínica.

**Comportamiento esperado**

1. **Registro directo:** el paciente completa el formulario y queda creado inmediatamente (sin cola de aprobación).
2. **Único por clínica:** el link identifica la clínica, no la sede. El paciente se crea asociado a esa clínica.
3. **Duplicados rechazados:** si ya existe un paciente con el mismo número de teléfono (o email), el backend devuelve un error descriptivo para que el frontend notifique al paciente que ya está registrado.
4. **Campos:** los mismos que el formulario actual de creación de paciente para recepcionistas (nombre, apellido, teléfono, email, fecha de nacimiento, etc.). ¿Cuáles son obligatorios en este flujo público?

**Preguntas al backend**

1. **Endpoint público:** ¿pueden exponer un `POST /registro-publico/pacientes/` (sin `Authorization` header) que reciba un token o slug de clínica en el body o query param? ¿O prefieren otro esquema (ej. header `X-Clinica-Token`)?

2. **Identificador de clínica:** ¿cómo identifica el frontend la clínica en este endpoint? El `X-Clinica-Id` actual requiere que el usuario esté autenticado. ¿Hay un token público o slug que podamos usar como param en el link? Ej: `/registro?token=abc123`

3. **Detección de duplicados:** ¿el backend valida duplicidad por teléfono? ¿Por email? ¿Devuelve `400` con un code específico (ej. `PACIENTE_YA_EXISTE`) para que el frontend lo maneje distinto a otros errores?

4. **Protección anti-spam:** actualmente el `POST /pacientes/` requiere auth, que ya actúa como barrera. El endpoint público no tendría esa barrera. ¿El backend implementa rate limiting por IP? ¿O esperan que el frontend agregue un captcha (ej. Cloudflare Turnstile, hCaptcha)?

5. **¿El link tiene expiración o es permanente?** Asumimos permanente (mientras la clínica esté activa), pero lo confirmamos.

**Lo que haría el frontend**

- Página en ruta pública `/registro/:token` (fuera del layout autenticado)
- Formulario igual al de creación de paciente por recepcionistas
- Al enviar: `POST` al endpoint público con los datos + token de clínica
- Si duplicado → mensaje "Ya estás registrado en nuestra clínica. Comunícate con nosotros."
- Si éxito → pantalla de confirmación
- El recepcionista ve en configuración el link de su clínica con botón "Copiar" para compartir

**Respuesta (Backend):**

Implementado. No requiere `Authorization` ni `X-Clinica-Id`.

| # | Pregunta | Respuesta |
|---|----------|-----------|
| 1 | Endpoint público | **`POST /api/v1/registro-publico/pacientes/`** sin auth. El token va en el **body** junto con los datos del paciente. |
| 2 | Identificador de clínica | Cada clínica tiene **`token_registro_publico`** (generado automáticamente, único, permanente). El frontend lo obtiene de `GET /clinicas/mi-clinica/` → `registro_publico_token` y arma el link `/registro/:token`. Para branding previo al formulario: **`GET /registro-publico/clinica/?token=...`**. |
| 3 | Duplicados | Valida por **`numero_documento`**, **`telefono`** y **`email`** (si viene) dentro de la misma clínica. Devuelve **`400`** con `code: "PACIENTE_YA_EXISTE"` y `campo` indicando cuál coincidió. |
| 4 | Anti-spam | **Rate limit por IP: 20 req/hora** en los endpoints públicos. No hay captcha en backend; el frontend puede agregar Turnstile/hCaptcha si lo desean. |
| 5 | Expiración del link | **Permanente** mientras la clínica esté `activo=true`. Si la clínica se desactiva, el token deja de funcionar (`TOKEN_INVALIDO`). |

**Campos obligatorios en el flujo público** (mismo mínimo que `POST /pacientes/` para recepción):

- `token`
- `tipo_documento`, `numero_documento`, `nombres`, `apellidos`
- `fecha_nacimiento`, `sexo`, `telefono`, `canal_confirmacion`
- `autoriza_datos: true`

Opcionales: `email`, `direccion`, `ciudad`, `barrio`, `ocupacion`, campos demográficos/ EPS, responsable, etc.

**Respuesta éxito (`201`):**

```json
{
  "id": "uuid",
  "nombre_completo": "Pedro Publico",
  "clinica_nombre": "Beauty Clinic"
}
```

**Duplicado (`400`):**

```json
{
  "error": "Ya existe un paciente registrado con ese telefono en esta clinica.",
  "code": "PACIENTE_YA_EXISTE",
  "campo": "telefono"
}
```

**Frontend:** construir URL como `{FRONTEND_BASE}/registro/{registro_publico_token}`. Documentación completa en `api.md` § Autoregistro público.

---

## Q30 — Tabs de autoregistro requeridos por clínica

**Contexto**

La página pública `/registro/:token` usa el mismo formulario de creación de paciente, que tiene tres tabs: Identificación y contacto (tab 1, siempre requerido), Datos personales (tab 2) y Salud y afiliación (tab 3). Queremos que cada clínica pueda marcar los tabs 2 y/o 3 como requeridos: si están marcados, el submit no pasa a menos que el paciente haya llenado al menos un campo en esa sección.

**Pedido**

Agregar dos booleans a la configuración de la clínica (con default `false`):

- `tab_personal_requerido` — si `true`, el tab "Datos personales" (dirección, ciudad, estado civil, etc.) es obligatorio en el autoregistro público.
- `tab_salud_requerido` — si `true`, el tab "Salud y afiliación" (EPS, tipo afiliado, régimen, grupo sanguíneo) es obligatorio.

**Puntos concretos a confirmar**

1. **Dónde almacenarlo:** ¿en el modelo `Clinica` directamente (dos BooleanField), en un modelo de configuración existente (ej. `ConfiguracionWizard` u otro JSONField), o uno nuevo? El frontend no tiene preferencia mientras esté disponible públicamente.

2. **Exponerlo en `GET /registro-publico/clinica/?token=...`:** agregar los dos campos al response para que el frontend los lea sin auth antes de renderizar el formulario.

   Shape esperado:
   ```json
   {
     "clinica_id": "uuid",
     "clinica_nombre": "Clínica Ejemplo",
     "logo_url": "...",
     "tab_personal_requerido": false,
     "tab_salud_requerido": false
   }
   ```

3. **Editable vía `PATCH /clinicas/mi-clinica/`** (o donde corresponda): el admin de la clínica debería poder cambiar estos booleans desde la configuración.

**Lo que haría el frontend**

- Leer `tab_personal_requerido` y `tab_salud_requerido` del response de `GET /registro-publico/clinica/`.
- Si `true`, mostrar indicador "Requerido" en el tab.
- En el submit: si el tab es requerido y todos sus campos están vacíos → navegar a ese tab y mostrar mensaje informativo (sin bloquear con errores de campo individuales).
- En la configuración de la clínica (autenticada): toggles para activar/desactivar cada tab.

**Respuesta (Backend):**

| # | Punto | Decisión |
|---|-------|----------|
| 1 | Almacenamiento | Modelo **`ConfiguracionRegistroPublico`** (OneToOne a `Clinica`, patrón `ConfiguracionWizard`). Campos `tab_personal_requerido`, `tab_salud_requerido` (default `false`). |
| 2 | Lectura pública | **`GET /registro-publico/clinica/?token=...`** incluye ambos campos (siempre presentes, `false` por default vía `get_or_create`). |
| 3 | Edición admin | **`GET/PATCH /configuracion/registro-publico/`** (permiso admin). Los mismos campos en **`GET /clinicas/mi-clinica/`** → objeto `registro_publico`. |
| 4 | Validación POST | **`POST /registro-publico/pacientes/`** valida en backend. Tab personal: al menos uno de `direccion`, `ciudad`, `barrio`, `estado_civil`, `ocupacion`, `escolaridad`, `grupo_etnico`. Tab salud: al menos uno de `eps`, `tipo_afiliado`, `regimen`, `grupo_sanguineo`. Error `400` con `code: "TAB_PERSONAL_REQUERIDO"` o `"TAB_SALUD_REQUERIDO"`. |
| 5 | Alcance | Solo aplica al flujo **`/registro-publico/`**. `POST /pacientes/` (staff) no cambia. |

Documentación en `api.md` § Autoregistro público.

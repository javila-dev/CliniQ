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


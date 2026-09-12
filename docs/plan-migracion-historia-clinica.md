# Plan — Wizard de migración de paciente completo

> Stack: mismo del core (Django + DRF + Next.js 15 App Router + PostgreSQL + MinIO)
> App: se extiende `apps.migracion` (no se crea app nueva).
> Gate: `Clinica.modo_puesta_en_marcha` + permiso `migracion.gestionar` (o `superadmin`).

---

## Objetivo

Unificar en un solo asistente la carga de un paciente que llega desde otro software: sus
datos personales, un **resumen de su historia clínica previa** y **un** tratamiento en
curso (cotización, pagos, sesiones, saldo). Hoy solo existe el último tramo
(`cargar_paciente_en_curso`); este plan antepone la creación del paciente y la historia, y
permite dejar la carga a medias en **borrador** para retomarla después.

---

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dónde vive | Se extiende `apps.migracion`. Un solo modelo: `LoteMigracion` gana `estado` + `data` + `paso_actual`. No hay modelo `BorradorMigracion` separado. |
| Paciente | Se crea **de verdad** en el paso 1 (o se vincula uno existente). Un paciente sin nada colgando es inofensivo y el resto del wizard necesita un UUID real. |
| Antecedentes / datos generales | Se persisten **en vivo** (nivel paciente/historia). Reusan `PUT /pacientes/{id}/antecedentes/`. No se revierten nunca (documento vivo). |
| **Historia previa = una sola nota** | Se descarta el modo "detallado" (N visitas con sub-navegador). Un paciente que llega de otro software entra con **una** nota resumen — como si fuera una sola atención virtual. Si más adelante se necesita registrar visitas puntuales adicionales, es la acción suelta "nota externa" (`origen=externo`, sin lote) que ya queda anotada como trabajo futuro, fuera de este wizard. |
| **Cotización = un solo ítem, como hoy** | No se agrega soporte multi-ítem. El caso raro de dos tratamientos activos simultáneos se resuelve corriendo el wizard dos veces para el mismo paciente (cada corrida es un lote independiente); nada en el modelo lo impide. |
| **Tramo financiero opcional** | No todo paciente migrado tiene un tratamiento en curso con saldo — puede llegar con historia "cerrada" (todo terminado y pagado en el otro sistema) y nada pendiente. El paso 4 arranca con una pregunta Sí/No; si es "No", el wizard confirma con paciente + historia únicamente, sin cotización/cobro/cartera. `sede` deja de ser obligatoria en el paso 1 (solo la usa el tramo financiero; `HistoriaClinica`/`NotaClinica` no tienen `sede`). |
| Profesional en la cotización migrada | Se agrega como campo **opcional** en el paso de tratamiento (hoy siempre queda `None`). Costo bajo, mejora trazabilidad en reportes. |
| Fechas históricas en cotización/cobro | Fuera de alcance. `es_migracion=True` ya excluye estos registros de caja/reportes; backdatear `created_at` no aporta y agrega complejidad. |
| **Adjunto de historia previa** | Modelo propio `ArchivoHistoriaPrevia` (no se reusa `ResultadoExamen`, que está pensado para resultados de laboratorio estructurados con auditoría). Multi-archivo, pensado para el PDF/export que trae el otro sistema. |
| Tabs de la historia | Los mismos que la pantalla de atención, leídos del mismo store `atencion-config`, **salvo** que la pestaña "Exámenes" se reemplaza por el widget de adjunto dedicado en el contexto de migración. |
| Firma / legal | Una nota migrada no exige firma digital (`firmada_por` ya es nullable). La responsabilidad del contenido migrado es de la clínica. |
| Congelar | Al confirmar el lote, la nota migrada queda inmutable (`NotaClinica.save()` lo bloquea si `origen != "normal"` y el lote está `confirmado`). Mientras el lote está en `borrador`, es editable. |
| Historia externa fuera de puesta en marcha | Fuera de alcance de este wizard. Queda anotado como acción permanente futura (`origen=externo`, sin lote). |

---

## Lo que ya existe y se reutiliza

| Necesidad | Componente existente |
|---|---|
| Tramo cotización/cobro/pagos/citas/cartera + revert | `apps/migracion/services.py` → `cargar_paciente_en_curso`, `revertir_lote` |
| Lote reversible + manifest | `LoteMigracion` |
| Validaciones cruzadas (pagado ≤ total, plan cuadra saldo, sesiones ≤ total) | `PacienteEnCursoSerializer.validate` |
| Wizard de pasos 4–6 (tratamiento, pagos, saldo, revisión) | `frontend/src/components/puesta-en-marcha/PacienteEnCursoWizard.tsx` |
| Tabs de historia (`datos-generales`, `motivo-consulta`, `antecedentes`, `mediciones`, `plan-manejo`, `ordenes`, `fotos`, `zonas`) | `frontend/src/components/historia/Tab*.tsx` |
| Config de qué tabs ve la clínica | `frontend/src/store/atencionConfigStore.ts` (`useAtencionConfig`) |
| Alta de paciente | `PacienteForm` + `POST /pacientes/` |
| Antecedentes sin atención | `PUT /pacientes/{id}/antecedentes/` |
| Nota borrador + hijos | `historiaClinicaApi.notas.createBorrador`, tabs que escriben solos |
| Tabs obesidad (condicionales) | `TabMediciones`, `TabLaboratorios`, `TabFarmacologico` bajo `modulo_obesidad_habilitado` |
| Subida de archivos a bucket privado | `apps/core/storage.py` (mismo patrón que `FotoClinica`/`ResultadoExamen`) |

---

## Modelo de datos

### `LoteMigracion` — campos nuevos

| Campo | Tipo | Nota |
|---|---|---|
| `estado` | `CharField` choices `borrador` / `confirmado` / `revertido` | default `borrador`. Se crea en `borrador` al arrancar el wizard. |
| `data` | `JSONField(default=dict)` | Payload del paso financiero + progreso del wizard (lo que aún no se materializó). |
| `paso_actual` | `PositiveSmallIntegerField(default=1)` | Para rehidratar el wizard al reabrir. |

`manifest` (ya existe) suma claves: `nota_clinica`, `historia_clinica` (solo si el lote la
creó). Los antecedentes **no** se revierten (documento vivo).

`Tipo` gana un choice: `HISTORIA_PREVIA` — se usa cuando el lote se confirma **sin**
tramo financiero (paciente con historia cerrada, sin tratamiento activo). `PACIENTE_EN_CURSO`
sigue siendo el tipo cuando sí hay cotización/cobro/cartera. `confirmar` decide el `tipo`
según si vino payload de tratamiento o no.

### `NotaClinica` — campos nuevos

| Campo | Tipo | Nota |
|---|---|---|
| `origen` | `CharField` choices `normal` / `migracion` / `externo` | default `normal`. |
| `fecha_registro` | `DateField(null=True, blank=True)` | Fecha de corte de la historia previa (`created_at` sería hoy). |
| `profesional_externo` | `CharField(max_length=200, blank=True)` | Médico del otro sistema, no es `User` de CliniQ. |
| `fuente` | `CharField(max_length=120, blank=True)` | Nombre del software de origen. |
| `es_migracion` | `BooleanField(default=False)` | Igual que en cotización/cobro/cita. |
| `lote_migracion` | `UUIDField(null=True, blank=True)` | Id del `LoteMigracion` (plano, sin FK — mismo patrón que el resto). |

`NotaClinica.save()`: si `origen != "normal"` y el lote asociado está `confirmado`, bloquear
cambios (misma idea que `HistoriaClinica.save()`).

Como el wizard produce **una sola** nota por lote, `LoteMigracion` puede exponer
`nota_clinica_id` directo en el manifest sin lista.

### `ArchivoHistoriaPrevia` — modelo nuevo (en `historia_clinica/models.py`)

```python
class ArchivoHistoriaPrevia(BaseModel):
    nota = models.ForeignKey(
        NotaClinica, on_delete=models.CASCADE, related_name="archivos_historia_previa",
    )
    archivo = models.FileField(upload_to=archivo_historia_previa_upload_path)
    descripcion = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "archivos_historia_previa"
        ordering = ["created_at"]
```

- `on_delete=CASCADE` (a diferencia de `FotoClinica`, que usa `PROTECT`): son adjuntos
  disponibles, no fotografía clínica protegida — borrar la nota migrada limpia sus
  adjuntos sin pasos extra en el revert.
- Acepta PDF/JPG/PNG, tamaño mayor al de una foto clínica (puede ser un export completo
  multi-página) — sugerido hasta 15 MB.
- Solo tiene sentido en notas con `origen != "normal"`; no se expone en el flujo de
  atención normal.

### Migraciones

- `migracion/00XX_lote_estado_data_paso`.
- `historia_clinica/00XX_nota_origen_migracion_y_archivo_historia_previa`.

---

## Backend — endpoints

Prefijo `/api/v1/migracion/`. Todos pasan por el guard `_guard(request)` ya existente
(clínica activa + `modo_puesta_en_marcha` + `migracion.gestionar`).

### `POST /migracion/borradores/`

Arranca un wizard. Body: `{ paciente?: uuid, paciente_nuevo?: {...campos PacienteForm}, sede?: uuid }`.

`sede` es opcional acá — solo hace falta si más adelante el paso 4 confirma que hay
tramo financiero. Si se llega a `confirmar` con tratamiento y sin `sede` guardada, el
endpoint la exige recién en ese momento (`400` con `code: "SEDE_REQUERIDA"`).

- Si viene `paciente_nuevo`, crea el `Paciente` (reusa el serializer de `POST /pacientes/`).
- Crea `LoteMigracion(estado="borrador", tipo=PACIENTE_EN_CURSO, paciente=..., paso_actual=1)`.
- `get_or_create` de `HistoriaClinica` para ese paciente.
- Respuesta: `LoteMigracionSerializer` + `historia_id`.

### `PATCH /migracion/borradores/{id}/`

Guarda avance de un paso. Body: `{ paso_actual: int, data: {...} }`. Merge sobre `data`.
Solo si `estado == "borrador"`.

### `POST /migracion/borradores/{id}/nota/`

Crea (una única vez, idempotente como `createBorrador`) la nota resumen de historia
previa. Body: `{ fecha_registro: date, profesional_externo?, fuente?, motivo_consulta?, plan_manejo? }`.

- `NotaClinica(historia=..., cita=null, estado="borrador", origen="migracion", es_migracion=True, lote_migracion=id, ...)`.
- A partir de acá los tabs reusados (`TabPlanManejo`, `TabMotivoConsulta`, opcionalmente
  `TabFotos`/`TabOrdenesMedicas`/`TabZonas`/`TabMediciones`) escriben contra esa nota con
  los mismos endpoints que usan en la atención.
- Respuesta: `NotaClinicaSerializer`.

### `POST /migracion/borradores/{id}/nota/archivos/`  ·  `DELETE .../archivos/{archivo_id}/`

Sube/borra un `ArchivoHistoriaPrevia` de la nota del lote. `multipart/form-data`, campo
`archivo` + `descripcion?`.

### `POST /migracion/borradores/{id}/confirmar/`

Cierra el wizard. Body: `{ tiene_tratamiento: bool, ...payload financiero si aplica }`.
El payload financiero es el mismo shape que `PacienteEnCursoSerializer` menos
`paciente`/`sede` (ya están en el lote), + `profesional?` opcional en `tratamiento`.

**Si `tiene_tratamiento` es `false`:**
1. No corre nada de `cargar_paciente_en_curso`. No exige `sede`.
2. Marca la `NotaClinica` del lote como `completada`.
3. `tipo = HISTORIA_PREVIA`, `estado = "confirmado"`.
4. Respuesta: `LoteMigracionSerializer` con `manifest = {nota_clinica, historia_clinica?}`.

**Si `tiene_tratamiento` es `true`:**
1. Exige `sede` (guardada en el lote o enviada acá); si falta, `400 SEDE_REQUERIDA`.
2. Valida el payload financiero con `PacienteEnCursoSerializer`.
3. Transacción: corre la lógica de `cargar_paciente_en_curso` (cotización ACEPTADA + ítem +
   protocolo + cobro + pagos + citas + cartera), agregando los ids al `manifest` del lote
   existente (no crea un lote nuevo).
4. Marca la `NotaClinica` del lote como `completada` — **salteando** los gates de
   consentimiento / sesión de tratamiento / nota vacía que aplican en la atención normal.
5. `tipo = PACIENTE_EN_CURSO`, `estado = "confirmado"`.
6. Respuesta: `LoteMigracionSerializer` con `manifest` completo.

### `POST /migracion/lotes/{id}/revertir/`  *(ya existe, se extiende)*

`revertir_lote` suma, antes de borrar cotización/cobro/etc.:
- `NotaClinica` del lote (con `on_delete=CASCADE` en `ArchivoHistoriaPrevia`, sus adjuntos
  se van solos; `FotoClinica`/`ResultadoExamen`/`OrdenMedica`/`AnotacionZona`/
  `MedicionAntropometrica` de esa nota se borran explícitamente por sus `PROTECT`).
- `HistoriaClinica` **solo** si `manifest["historia_clinica"]` la incluye (la creó el lote).
- Nunca borra el `Paciente` ni los `AntecedentePaciente`.
- `estado = "revertido"`.

### `GET /migracion/borradores/`  ·  `GET /migracion/borradores/{id}/`

Lista y detalle de lotes en `estado="borrador"` de la clínica activa ("migraciones sin
terminar"). El listado de `estado != "borrador"` sigue en `GET /migracion/lotes/`.

### Errores

`{"error": "...", "code": "..."}`. Códigos: `LOTE_NO_BORRADOR`, `LOTE_YA_CONFIRMADO`,
`LOTE_YA_REVERTIDO`, más los que ya devuelve `PacienteEnCursoSerializer`
(`PAGADO_MAYOR_QUE_TOTAL`, `PLAN_NO_CUADRA`, `SIN_SALDO`, `SESIONES_EXCEDEN_TOTAL`).

---

## Frontend

Ruta: `/configuracion/puesta-en-marcha` (ya existe). El botón "Empezar" abre el wizard
nuevo; el listado de abajo separa **"Sin terminar"** (borradores, con botón *Continuar* /
*Descartar*) de **"Cargas hechas"** (confirmadas, con *Revertir*).

### Pasos del wizard

| # | Paso | Qué hace | Persistencia |
|---|---|---|---|
| 1 | **Paciente** | `PacienteForm` embebido o buscador de paciente existente + selector de sede (**opcional**, se completa solo si hay tramo financiero) | `POST /borradores/` → nace el lote |
| 2 | **Historia — basal** | Tabs `datos-generales` + `antecedentes` (nivel paciente) | En vivo (`PUT antecedentes`) |
| 3 | **Historia previa** | Una sola nota: `motivo-consulta` + `plan-manejo` (texto libre) + widget de **adjunto dedicado** (`ArchivoHistoriaPrevia`) + opcionalmente `fotos`/`ordenes`/`zonas`/`mediciones` si el caso lo amerita | `POST /borradores/{id}/nota/` + tabs/adjunto escriben en vivo |
| 4 | **¿Tiene tratamiento en curso?** | Pregunta Sí/No. **No** → salta directo al paso 6 (confirmar solo con paciente + historia). **Sí** → sigue a tipo, descripción, precio pactado, sesiones realizadas, **profesional (opcional, nuevo)** — pide `sede` si aún no se cargó | `PATCH /borradores/{id}/` (`data`) |
| 5 | **Pagos y saldo** *(solo si hay tratamiento)* | `PacienteEnCursoWizard` actual — pagos previos, plan del saldo | `PATCH /borradores/{id}/` (`data`) |
| 6 | **Revisión y confirmar** | Resumen de todo (financiero si aplica) + validaciones cruzadas | `POST /borradores/{id}/confirmar/` con `tiene_tratamiento` |

"Guardar y salir" visible en todos los pasos: hace `PATCH` de `paso_actual` y cierra.

Un paciente con historia "cerrada" (todo terminado y pagado en el otro sistema, o
simplemente sin nada pendiente) recorre 1 → 2 → 3 → 4 (responde "No") → 6. Nunca se le
pide sede ni datos financieros.

Si el caso real necesita más de un tratamiento en curso, se corre el wizard otra vez para
el mismo paciente (paso 1 permite vincular un paciente existente) — nace un segundo lote,
sin tocar el primero.

### Reglas de reuso de tabs

- Los tabs se renderizan según `useAtencionConfig().isTabActivo(slug)` — misma config que
  la atención. Lo que la clínica apagó en Configuración → Atención queda apagado acá.
- `datos-generales` y `antecedentes`: paso 2, nivel paciente.
- `motivo-consulta`, `plan-manejo`: siempre visibles en el paso 3, es donde va el resumen
  de la historia previa.
- `fotos`, `ordenes`, `zonas`, `mediciones`: disponibles en el paso 3 pero opcionales — se
  muestran solo si el usuario decide usarlos (ej. tiene fotos de antes/después reales que
  migrar).
- `examenes` **no se ofrece** en migración — se reemplaza por el widget de
  `ArchivoHistoriaPrevia` (multi-archivo, sin los campos de auditoría de `ResultadoExamen`).
- Tabs de obesidad: solo si `modulo_obesidad_habilitado`.
- Los componentes `Tab*` reciben `historia` + `notaId` como en la atención. No se
  modifican; a lo sumo aceptan un flag `modoMigracion` para ocultar textos que hablan de
  "esta sesión".

### Tipos

`frontend/src/types/migracion.ts` suma `BorradorMigracion` (= `LoteMigracion` +
`estado`, `data`, `paso_actual`, `historia_id`, `nota_clinica_id`) y
`ArchivoHistoriaPreviaInput`.

---

## Hitos

| Hito | Alcance | Salida |
|---|---|---|
| M1 | Modelo: `LoteMigracion.estado/data/paso_actual`, `NotaClinica.origen/...`, `ArchivoHistoriaPrevia`, migraciones, `save()` de congelado | Modelo + migraciones aplicadas |
| M2 | Endpoints `POST/PATCH /borradores/`, `POST /borradores/{id}/nota/`, `.../nota/archivos/` | Contrato documentado en `asks.md` / `api.md` |
| M3 | `confirmar` (reusa `cargar_paciente_en_curso` sobre el lote existente, incluye `profesional` opcional) + `revertir_lote` extendido | Endpoints estables |
| M4 | Frontend: pasos 1–3 del wizard (paciente + historia previa con tabs reusados + adjunto) | Wizard hasta historia |
| M5 | Frontend: integrar pasos 4–6 (`PacienteEnCursoWizard` actual + campo profesional) + confirmar + listado "Sin terminar" | Wizard completo |
| M6 | QA: crear → salir → retomar → confirmar → revertir; verificar que nada de migración cuenta en caja / reportes | — |

---

## Fuera de alcance (a propósito)

- Migración de múltiples tratamientos activos en un solo lote — se resuelve corriendo el
  wizard más de una vez.
- Registro visita por visita de la historia previa — la migración entra como un único
  resumen; el detalle histórico completo, si algún día se necesita, es la acción suelta
  "nota externa" fuera de este wizard.
- Backdatear fechas de creación de cotización/cobro — innecesario porque `es_migracion`
  ya los excluye de reportes.

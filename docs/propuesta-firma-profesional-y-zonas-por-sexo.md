# Propuesta — Firma del médico tratante + Diagramas de zonas por sexo

> **Estado:** PROPUESTA. Pendiente de confirmación del cliente sobre qué se quiere en la app.
> **No implementar hasta aprobación explícita.**
> Fecha de análisis: 2026-08-27.

Dos cambios independientes, analizados sobre el código actual. Se pueden ejecutar por separado.

---

## A. Diagramas de zonas por sexo (Masculino / Femenino)

**Complejidad: baja.**

### Situación actual

- Modelo `clinicas.DiagramaCorporal`: `nombre`, `imagen` (ImageField subida), `orden`. **Sin dimensión de sexo.**
- Los diagramas se agrupan en `clinicas.GrupoZonas` (vía `GrupoZonasDiagrama`) y se asignan a un servicio en `clinicas.ServicioGrupoZonas`.
- El endpoint que carga la pestaña de zonas — `NotaClinicaViewSet.zonas` en `backend/apps/historia_clinica/views.py:431` — arma la lista `diagramas` recorriendo `servicio → grupo → diagramas → diagrama`. Devuelve `{ diagramas: [{id, nombre, imagen_url, orden}], anotaciones: [...] }`.
- El frontend `frontend/src/components/historia/TabZonas.tsx` (`DiagramaPanel`, línea ~387) solo pinta `diagrama.imagen_url` y deja poner pines (`AnotacionZona` con `x`, `y`, `radio` relativos a la imagen).
- La `nota` alcanza el sexo del paciente por `nota.historia.paciente.sexo` (choices `M` / `F` / `O`).

### Cambio propuesto

| Capa | Trabajo |
|---|---|
| Modelo | `DiagramaCorporal.sexo = CharField(max_length=1, choices=[("A","Ambos"),("M","Masculino"),("F","Femenino")], default="A")` + migración. Todos los diagramas existentes quedan `"A"` → nada se rompe. |
| Endpoint `NotaClinicaViewSet.zonas` | Obtener `sexo_pac = nota.historia.paciente.sexo`. Incluir un diagrama si `d.sexo == "A"` **o** `d.sexo == sexo_pac`. Si el paciente es `"O"` o sin dato → **no filtrar** (mostrar todos y que el profesional elija). |
| Serializer de diagrama | Exponer `sexo` en `DiagramaCorporalSerializer` (para la pantalla de configuración). |
| Config UI | Un `<select>` de sexo al crear/editar un diagrama, en la pantalla de configuración de historia clínica / zonas. |
| Historial de zonas (solo lectura) | Sin cambios. El endpoint `HistoriaClinicaViewSet.zonas` (`views.py:325`) itera sobre anotaciones ya hechas; no filtra diagramas. |
| `TabZonas.tsx` | Sin cambios si el backend filtra: solo pinta `data.diagramas`. |

### Coste real

~1 campo + migración + un filtro de 3–4 líneas + un campo de serializer + un `<select>` en config. El resto es **contenido de cada clínica**: subir la silueta M y la F, etiquetarlas y meterlas al grupo. Mientras no lo hagan, la silueta única sigue como `"Ambos"` y funciona igual.

### Riesgo / mitigación

Un grupo que solo tenga diagramas `M` mostraría 0 diagramas para una paciente `F`. Mitigar con un aviso en la config: *"Este grupo no tiene diagramas para sexo femenino"*.

---

## B. Firma del médico tratante en consentimientos

### Problema

Hoy solo se captura la **firma del paciente** (vía Documenso embed). Falta la firma del **médico tratante** en los consentimientos informados (y, opcionalmente, órdenes médicas / plan de manejo / nota de evolución).

Contexto legal (Colombia, medicina estética — orientativo, **confirmar con abogado de salud**):
- El deber de informar y obtener el consentimiento es **personal e indelegable del médico** que realiza el procedimiento (Ley 23 de 1981 y Decreto 3380 de 1981, arts. 10–16).
- El consentimiento informado es anexo obligatorio de la historia clínica (Res. 1995 de 1999; Res. 3100 de 2019).
- Ley 1799 de 2016 refuerza el consentimiento informado para procedimientos estéticos; la jurisprudencia trata la estética como cercana a **obligación de resultado** → mayor carga probatoria sobre el médico.
- No hay un artículo único que declare "nulo sin firma del médico", pero un consentimiento firmado **solo por el paciente** es prueba débil ("¿quién informó y qué informó?"). La firma del médico + `registro profesional` cierra esa brecha.
- **Conclusión de trabajo:** asumir que **sí se requiere** la firma del médico en consentimientos informados de procedimiento.

### Diseño aprobado a analizar (propuesta del cliente)

El ciclo de firma del consentimiento se parte en **dos momentos**:

```
Momento 1 — check-in (recepción)              Momento 2 — "Iniciar atención" (profesional)
IniciarAtencionWizard, paso "consentimiento"      ColaEspera / /atenciones/[citaId]
  → el paciente firma (Documenso, como hoy)         → ANTES de pasar a en_curso: se le pide al
  → ConsentimientoInformado.firmado = true            profesional firmar los consentimientos pendientes
                                                     → recién ahí la cita pasa a en_curso
```

La firma del profesional se vuelve un **gate del paso `en_espera → en_curso`**, que ya existe y ya valida consentimientos del paciente.

**Por qué es buen diseño:**
- *Forcing function*: el profesional no puede empezar el procedimiento sin firmar → no se olvida.
- *Momento legalmente correcto*: `en_curso` = "voy a hacer el procedimiento". La atestación del médico va justo antes.
- El flujo del paciente no cambia.

### Modelo de datos backend

Un solo modelo afectado: **`historia_clinica.ConsentimientoInformado`** (confirmado: es el que respalda los consentimientos de cita, vía `documenso_template_token` ↔ `configuracion.DocumensoConsentimientoTemplate` ↔ `clinicas.ServicioConsentimiento`; el gate actual `CONSENTIMIENTO_REQUERIDO` ya lo usa).

```python
# historia_clinica.ConsentimientoInformado
firmado_profesional_por = models.ForeignKey("users.User", null=True, blank=True, on_delete=models.PROTECT,
                                            related_name="consentimientos_firmados_profesional")
firmado_profesional_en  = models.DateTimeField(null=True, blank=True)
firma_profesional_hash  = models.CharField(max_length=64, blank=True)   # sha256(contenido_snapshot + user_id + timestamp ISO)

# configuracion.DocumensoConsentimientoTemplate
requiere_firma_profesional = models.BooleanField(default=True)

# users.User (opcional — imagen de firma capturada UNA vez y reutilizada)
firma_imagen = models.ImageField(upload_to="firmas_profesionales/", null=True, blank=True)
#   `registro_profesional` YA existe (se usa en historia_clinica/views.py:111)
```

Documento "completo" = `firmado` (paciente) **Y** (`not template.requiere_firma_profesional` **O** `firmado_profesional_en is not None`).

### Gate de transición backend

En `backend/apps/agenda/views.py:256` (`if nuevo_estado == Cita.Estado.EN_CURSO:`), **después** del check `CONSENTIMIENTO_REQUERIDO` existente:

```python
pendientes_medico = [
    c for c in consentimientos_de_la_cita
    if c.template.requiere_firma_profesional and c.firmado and not c.firmado_profesional_en
]
if pendientes_medico:
    return Response(
        {"error": "Hay consentimientos pendientes de tu firma.",
         "code": "FIRMA_PROFESIONAL_REQUERIDA",
         "documentos": [{"id": str(c.id), "nombre": c.documenso_template_nombre} for c in pendientes_medico]},
        status=status.HTTP_400_BAD_REQUEST,
    )
```

### Endpoint nuevo

`POST /agenda/citas/{id}/firmar-consentimientos-profesional/`
- Firma en lote todos los `ConsentimientoInformado` pendientes de firma profesional de esa cita, con `request.user`.
- Calcula `firma_profesional_hash`.
- Re-renderiza / estampa el PDF con el bloque del profesional: nombre + `registro_profesional` + fecha/hora + `firma_imagen` si existe.
- Devuelve `consentimiento_info` actualizado.
- Permiso: el profesional asignado a la cita (`cita.profesional`) o admin. Registrar quién firmó realmente.

### Serializer

`build_consentimiento_info` (`backend/apps/agenda/serializers.py`, importado en `agenda/views.py:28`): agregar por ítem `requiere_firma_profesional: bool` y `firmado_profesional: bool`.

### Frontend

**Componente nuevo `FirmaProfesionalModal`.**

En `frontend/src/components/atenciones/ColaEspera.tsx` y `frontend/src/app/(authenticated)/atenciones/[citaId]/page.tsx`, el botón **"Iniciar atención"**:
- Si `cita.consentimiento_info` tiene ítems con `requiere_firma_profesional && !firmado_profesional` → abre `FirmaProfesionalModal`:
  - Lista cada documento pendiente (con "ver documento").
  - Texto de atestación: *"Confirmo que informé al paciente sobre los riesgos, beneficios y alternativas del procedimiento …"*.
  - Pad de firma **o** botón de 1 clic si `user.firma_imagen` ya existe.
  - "Firmar y continuar" → llama al endpoint batch → al éxito, auto-procede con `cambiarEstado('en_curso')`.
- Si no hay pendientes → procede directo (como hoy).
- *Fallback*: si el 400 `FIRMA_PROFESIONAL_REQUERIDA` llega igual (carrera), abre el mismo modal.

Captura de `firma_imagen`: una sola vez en el perfil / configuración del usuario (canvas). Reutilizable en todos los documentos.

### PDF final

El consentimiento final lleva **ambas firmas**: la firma Documenso del paciente + el bloque de atestación del profesional (nombre, `registro_profesional`, fecha, imagen si hay). Opciones: (a) re-render server-side del PDF con bloque de firma; (b) estampar overlay sobre el PDF de Documenso. (a) es más limpio si controlamos la plantilla.

### Casos borde / decisiones abiertas

1. **Mecanismo de firma del médico**: atestación in-app (1 clic; firma electrónica, Ley 527 de 1999) **vs** Documenso certificado (más fricción, firma digital certificada). → depende del abogado. **Recomendación: in-app.**
2. **Paciente que se saltó el check-in**: si al Momento 2 el paciente tampoco firmó, ¿el mismo modal permite pasarle la tablet para su firma ahí? **Recomendación: sí.**
3. **Bloqueo**: duro (no hay `en_curso` sin firma) **vs** permitir con confirmación forzada + flag de auditoría para excepciones. En estética electiva no hay urgencias → **bloqueo duro está bien**.
4. `requiere_firma_profesional` default `true` para todas las plantillas de consentimiento informado. Compromiso de pago y firma de asistencia son **otros modelos** (`consentimientos.Consentimiento`), no les aplica.
5. ¿Reactivar la firma del profesional en la **nota de evolución** al cerrar la atención? `NotaClinica.firmada_por` + `firmada_en` ya existen (hoy marcados legacy). Se puede hacer en el mismo esfuerzo.
6. ¿La firma del profesional debe poder hacerse también **después** (desde la historia clínica, Plan de Manejo / Órdenes Médicas) por si no la hizo al iniciar? Recomendable como acceso secundario.

### Esfuerzo estimado

- **Backend**: 3 campos en `ConsentimientoInformado` + 1 flag en template + migración; gate en `agenda/views.py` (~10 líneas); endpoint batch; estampado/re-render del PDF; ampliar `build_consentimiento_info`. **~2 días.**
- **Frontend**: `FirmaProfesionalModal` + wiring en `ColaEspera` y `/atenciones/[citaId]` + manejo del 400 + captura de `firma_imagen` en perfil. **~1.5 días.**
- **Sin tocar** el flujo del paciente / check-in.

### Para confirmar con el cliente antes de ejecutar

- ¿Firma in-app o Documenso certificado para el médico? (afecta fricción y esfuerzo)
- ¿Bloqueo duro de "Iniciar atención"?
- ¿Se firma también la nota de evolución al cerrar?
- ¿Qué plantillas de consentimiento requieren firma del médico? (default: todas las de procedimiento)
- ¿Necesitan el `registro_profesional` visible en el PDF? (ya está el dato)

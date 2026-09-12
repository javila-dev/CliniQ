# Plan — Módulo de Obesidad (add-on)

> Flag de activación: `modulo_obesidad_habilitado` en `Clinica`
> Stack: mismo del core (Django + DRF + Next.js 15 + PostgreSQL + MinIO)

---

## Contexto clínico y de mercado

Las clínicas de obesidad en Colombia y Latinoamérica operan bajo un modelo de **programa de largo plazo** (12–24 semanas típico) con múltiples disciplinas: médico internista o endocrinólogo, nutricionista, psicólogo y en algunos casos cirujano bariátrico. El software del mercado (Nutrium, Dietbox, Nutrilog, LifeBase, Mednax) cubre principalmente la parte nutricional pero falla en:

- Integración de agenda + cobros + historia en un solo flujo
- Seguimiento longitudinal de métricas corporales con gráficas
- Gestión de programas multi-sesión con tipos de cita heterogéneos
- Adjuntar y rastrear resultados de laboratorio en el tiempo

CliniQ ya tiene el **core operacional** que estos sistemas no tienen bien resuelto (agenda, cobros, consentimientos, historia). El módulo de obesidad agrega la capa clínica especializada encima.

---

## Lo que ya existe y se reutiliza sin cambios

| Funcionalidad | Componente existente |
|---|---|
| Registro de pacientes | `Paciente` + ficha completa |
| Agenda de citas | `Cita` + disponibilidad + estados |
| Historia clínica base | `HistoriaClinica` + `NotaClinica` |
| Fotografías clínicas | `FotoClinica` (antes/durante/después) |
| Tratamientos multi-sesión | `TratamientoCatalogo` + `TipoSesion` |
| Cotizaciones de programas | `Cotizacion` + sesiones |
| Cobros y cartera | `Cobro` + `PagoRecibido` + `Cartera` |
| Consentimientos informados | `PlantillaConsentimiento` + firma digital |

Lo único que se crea es lo que **no tiene análogo** en el módulo estético.

---

## Lo que es nuevo y por qué

### 1. Mediciones antropométricas — `MedicionAntropometrica`

**Por qué:** el seguimiento de peso, IMC y circunferencias es el KPI central de cualquier programa de obesidad. No existe en el sistema. Se registra en cada consulta de control.

**Campos:**
- `paciente` FK — a quién pertenece
- `nota` FK (null) — si se tomó durante una consulta (link opcional a `NotaClinica`)
- `fecha` DateTimeField — timestamp de la toma
- `peso_kg` Decimal(5,2) — peso corporal
- `talla_cm` Decimal(5,1) — altura (se puede omitir si ya se registró antes)
- `imc` Decimal(4,2) — calculado automáticamente en `save()`
- `cintura_cm` / `cadera_cm` / `brazo_cm` / `muslo_cm` — Decimal(5,1) null
- `icc` Decimal(4,3) — índice cintura/cadera, calculado si ambos presentes
- `grasa_corporal_pct` / `masa_muscular_kg` / `grasa_visceral` — Decimal null (datos de bioimpedancia, opcionales)
- `presion_sistolica` / `presion_diastolica` — PositiveIntegerField null
- `tomado_por` FK User

**Uso:** gráficas de evolución de peso + IMC + circunferencias a lo largo del programa.

---

### 2. Resultados de laboratorio — `ResultadoLaboratorio`

**Por qué:** los programas de obesidad requieren seguimiento de glicemia, HbA1c, perfil lipídico, TSH, función hepática. Sin esto el médico no puede evaluar progresión de comorbilidades ni ajustar tratamiento.

**Campos:**
- `paciente` FK
- `fecha` DateField — fecha del examen
- `archivo` FileField — PDF del laboratorio (subido a MinIO, privado, con URL firmada)
- `tipo` CharField choices: `glucosa`, `hba1c`, `lipidos`, `hepatico`, `tiroideo`, `hemograma`, `otro`
- `valores` JSONField — pares clave/valor para los marcadores que se quieran rastrear:
  ```json
  { "glucosa_mg_dl": 95, "hba1c_pct": 5.8, "trigliceridos": 142, "colesterol_total": 188 }
  ```
- `observaciones` TextField blank
- `registrado_por` FK User

**Uso:** tabla de histórico por paciente + alertas visuales si valores están fuera de rango.

---

### 3. Tratamiento farmacológico — `TratamientoFarmacologico`

**Por qué:** ozempic, saxenda, orlistat, metformina, topamax son habituales en programas de obesidad. El médico necesita registrar qué se recetó, cuándo, a qué dosis, y poder hacer trazabilidad si hay un evento adverso.

**Campos:**
- `paciente` FK
- `medicamento` CharField 200 — nombre comercial o genérico
- `principio_activo` CharField 200 blank
- `dosis` CharField 100 — ej: "0.5mg semana 1, 1mg semana 2"
- `via` CharField choices: `oral`, `subcutanea`, `intramuscular`
- `frecuencia` CharField 100 — ej: "1 vez por semana"
- `fecha_inicio` DateField
- `fecha_fin` DateField null — null = activo
- `indicado_por` FK User
- `nota` FK `NotaClinica` null — nota en la que se prescribió
- `motivo_suspension` TextField blank
- `activo` BooleanField

**Uso:** historial farmacológico activo del paciente, visible en la consulta.

---

### 4. Objetivo de peso — `ObjetivoObesidad`

**Por qué:** cada programa tiene un punto de partida y una meta. Sin esto no se puede calcular el % de progreso ni mostrar la gráfica con la línea objetivo.

**Campos:**
- `paciente` FK — one-to-one por período/programa (puede haber varios si el paciente hace múltiples programas)
- `cotizacion` FK null — el programa que originó este objetivo (link a `Cotizacion`)
- `peso_inicial_kg` Decimal(5,2) — peso al inicio del programa
- `peso_objetivo_kg` Decimal(5,2) — meta
- `fecha_inicio` DateField
- `fecha_objetivo` DateField null — fecha esperada de alcanzar la meta
- `activo` BooleanField — solo uno activo por paciente a la vez

**Uso:** calcular `% perdido / % por perder` y dibujar la línea de meta en la gráfica de evolución.

---

### 5. Antecedentes de obesidad — sección extendida en `HistoriaClinica`

**Por qué:** la valoración inicial de un paciente de obesidad requiere datos que no están en la historia estética ni en la ficha de paciente estándar. Se modela como **sección separada** ligada a `HistoriaClinica` para no contaminar el modelo base.

**Modelo: `AntecedentesObesidad`** (one-to-one con `HistoriaClinica`)
- `historia` OneToOneField `HistoriaClinica`
- `peso_maximo_kg` / `peso_minimo_adulto_kg` Decimal null
- `intentos_previos` TextField blank — descripción de intentos anteriores
- `comorbilidades` ArrayField o JSONField — lista: `diabetes_t2`, `hipertension`, `dislipidemia`, `apnea_sueno`, `higado_graso`, `sop`, `artrosis`, `otro`
- `medicamentos_actuales` TextField blank — medicamentos que ya tomaba antes del programa
- `antecedente_familiar_obesidad` BooleanField null
- `actividad_fisica_actual` CharField choices: `sedentario`, `leve`, `moderado`, `intenso`
- `patron_alimentario` TextField blank — descripción libre del patrón alimentario
- `factores_emocionales` TextField blank — comer emocional, episodios de atracones

---

## Cómo se acoplan los flujos existentes

### Flujo de primera consulta (obesidad)
```
Nueva cita (Agenda)
  → Checkin
  → Abrir atención → NotaClinica
  → Tab "Mediciones" (nuevo) → registra MedicionAntropometrica (peso inicial)
  → Tab "Antecedentes obesidad" (nuevo) → llena AntecedentesObesidad
  → Tab "Laboratorios" (nuevo) → adjunta ResultadoLaboratorio inicial
  → Tab "Tratamiento farmacológico" (nuevo) → prescribe TratamientoFarmacologico
  → Cobros + Consentimiento (existente)
  → Se crea ObjetivoObesidad con peso_inicial + meta
```

### Flujo de control (consulta de seguimiento)
```
Cita de control
  → Abrir atención → NotaClinica
  → Tab "Mediciones" → nueva MedicionAntropometrica (el sistema muestra el delta vs anterior)
  → Tab "Laboratorios" → adjunta nuevos resultados si los hay
  → Tab "Farmacológico" → actualiza dosis / suspende / agrega medicamento
  → Cobro (existente)
```

### Gráfica de progreso (vista en perfil del paciente)
```
GET /obesidad/pacientes/{paciente_id}/progreso/
→ Retorna: series de peso, IMC, cintura + línea objetivo
→ Frontend: Recharts LineChart (ya tienen Recharts en el proyecto)
```

---

## Estructura de apps

Todo vive en una nueva app Django: **`apps/obesidad/`**

No se mezcla con `historia_clinica` ni `clinicas` — queda completamente aislada y desactivable con el flag.

```
apps/obesidad/
  models.py        → MedicionAntropometrica, ResultadoLaboratorio,
                     TratamientoFarmacologico, ObjetivoObesidad, AntecedentesObesidad
  serializers.py
  views.py
  urls.py
  admin.py
  migrations/
```

Registro en `config/urls.py` con prefijo `api/v1/obesidad/`.

---

## Endpoints nuevos

| Método | Endpoint | Descripción |
|---|---|---|
| GET/POST | `/obesidad/mediciones/` | Listar/crear mediciones |
| GET | `/obesidad/mediciones/?paciente={id}` | Historial de mediciones de un paciente |
| GET | `/obesidad/pacientes/{id}/progreso/` | Series temporales para gráficas |
| GET/POST | `/obesidad/laboratorios/` | Listar/adjuntar resultados |
| GET | `/obesidad/laboratorios/{id}/archivo/` | URL firmada del PDF |
| GET/POST/PATCH | `/obesidad/farmacologico/` | CRUD de prescripciones activas |
| GET/PATCH | `/obesidad/antecedentes/{historia_id}/` | Antecedentes de obesidad (get o create-or-update) |
| GET/POST | `/obesidad/objetivos/` | Objetivo de peso activo |

---

## Fases de implementación

### Fase 1 — Datos y API (backend)
1. Crear `apps/obesidad/` con los 5 modelos
2. Migraciones
3. Serializers + ViewSets + URLs
4. Admin básico para inspección

### Fase 2 — Flujo de consulta (frontend)
1. Nuevos tabs en `/atenciones/[citaId]` (solo visibles con `modulo_obesidad_habilitado`)
   - "Mediciones" — formulario de toma de medidas + tabla comparativa con cita anterior
   - "Laboratorios" — upload PDF + captura de valores clave
   - "Farmacológico" — lista de medicamentos activos + agregar/suspender
2. Sección "Antecedentes obesidad" en primera consulta

### Fase 3 — Dashboard de progreso (frontend)
1. Pestaña "Progreso obesidad" en `/pacientes/[id]`
   - Gráfica de peso vs tiempo con línea de objetivo
   - Gráfica de IMC
   - Gráfica de circunferencias
   - Tabla de laboratorios histórica con semáforo por valor
   - Lista de medicamentos activos

### Fase 4 — Reportes (opcional)
- Dashboard clínica: pacientes activos en programa, % que van en meta, promedio de pérdida semanal
- Reporte por paciente exportable a PDF

---

## Decisiones de diseño

| Decisión | Razonamiento |
|---|---|
| App separada `apps/obesidad/` | Permite desactivar el módulo sin tocar nada del core |
| `valores` como JSONField en `ResultadoLaboratorio` | Los marcadores varían por tipo de examen; no tiene sentido un campo por marcador |
| `MedicionAntropometrica` no obligatoria en `NotaClinica` | Puede tomarse fuera de consulta (enfermería), o la consulta puede ser solo de ajuste farmacológico |
| Compartir `TratamientoCatalogo` existente | Los tratamientos de obesidad (programa 12 semanas, etc.) usan la misma estructura de tipos de sesión; no se duplica |
| No crear app de nutrición | Fuera del alcance; la nota clínica libre + el patrón alimentario en antecedentes es suficiente para el MVP |

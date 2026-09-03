export interface WizardConfig {
  paso_checkin:             boolean
  paso_pago:                boolean
  paso_firma_asistencia:    boolean
  paso_verificacion_facial: boolean
  /** Si true, la foto de control al registrar un paciente no se puede omitir. */
  foto_control_obligatoria: boolean
}

export interface ConfiguracionCartera {
  requiere_consentimiento_promocional: boolean
  updated_at: string
}

export interface Clinica {
  id: string
  nombre: string
  nit: string | null
  email: string | null
  telefono: string | null
  logo: string | null          // valor crudo del ImageField (no confiable para <img>)
  logo_url: string | null      // URL pública del bucket estático — usar esta para renderizar
  slot_interval_min: number
  activo: boolean
  wizard?: WizardConfig
  registro_publico_token?: string | null
  tab_personal_requerido?: boolean
  tab_salud_requerido?: boolean
  trial_expires_at: string | null
  trial_days_remaining: number | null
  onboarding_completado: boolean
  facial_verificacion_habilitada?: boolean
  modulo_estetico_habilitado?: boolean
  modulo_obesidad_habilitado?: boolean
  modo_puesta_en_marcha?: boolean
  created_at: string
  updated_at: string
}

export interface UpdateClinicaRequest {
  nombre?: string
  nit?: string
  telefono?: string
  slot_interval_min?: number
  activo?: boolean
  tab_personal_requerido?: boolean
  tab_salud_requerido?: boolean
}

export interface SlotIntervalResponse {
  id: string
  nombre: string
  slot_interval_min: number
}

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'
export type HorarioSede = Partial<Record<DiaSemana, [string, string]>>

export interface SedesLimite {
  max_sedes: number | null
  sedes_activas?: number
  puede_agregar: boolean
  sin_limite: boolean
}

export interface Sede {
  id: string
  nombre: string
  ciudad: string
  direccion: string
  telefono: string | null
  horario: HorarioSede
  activo: boolean
  clinica: string
  nombre_clinica?: string
}

export interface CreateSedeRequest {
  nombre: string
  ciudad: string
  direccion: string
  telefono?: string
  horario?: HorarioSede
}

export type UpdateSedeRequest = Partial<CreateSedeRequest> & { activo?: boolean }

export interface DocumensoTemplateDisponible {
  id: number | string | null
  nombre: string
  token: string
}

export interface PasoProtocolo {
  id: string
  servicio: string
  orden: number
  nombre: string
  semana: number | null
  es_control: boolean
  cantidad: number        // cuántas sesiones genera este paso al iniciar un tratamiento (default 1)
  activo: boolean
  created_at: string
}

export interface ServicioDiagrama {
  id: string
  diagrama: string
  diagrama_nombre: string
  imagen_url: string | null
  orden: number
  activo: boolean
}

export interface ServicioGrupoZonas {
  id: string
  grupo: string
  grupo_nombre: string
  grupo_diagramas: { id: string; diagrama: string; diagrama_nombre: string; imagen_url: string | null; orden: number }[]
  orden: number
  activo: boolean
}

export interface ServicioConsentimientoRequerido {
  id: string
  template_id: string
  template_token: string
  template_nombre: string
  orden: number
  activo: boolean
}

export interface Servicio {
  id: string
  nombre: string
  nombre_clinica?: string
  descripcion: string | null
  duracion_min: number
  precio?: string | null               // deprecated; usar precio_referencia (H26)
  precio_referencia?: string | null    // H26: referencia interna, no comercial
  precio_base?: string | null          // H31: precio fijo del catálogo
  descuento_maximo_pct?: string | null // tope de descuento en cotizaciones sobre precio_base
  requiere_consentimiento?: boolean        // legacy; derivar de consentimientos_requeridos
  documenso_template_token?: string | null // legacy
  documenso_template_nombre?: string | null // legacy
  vigencia_meses: number
  activo: boolean
  clinica: string
  tiene_protocolo?: boolean
  pasos_protocolo?: PasoProtocolo[]
  consentimientos_requeridos?: ServicioConsentimientoRequerido[]
  diagramas?: { id: string; nombre: string; imagen_url: string | null }[]
  profesionales_detalle?: { id: string; nombre: string }[]  // solo procedimientos: profesionales que lo realizan
}

/** Alias semántico post-H26 */
export type Procedimiento = Servicio

export interface CreateServicioRequest {
  nombre: string
  descripcion?: string
  duracion_min: number
  precio?: number | null
  requiere_consentimiento: boolean
  documenso_template_token?: string | null
  documenso_template_nombre?: string | null
  vigencia_meses?: number
}

/** POST/PATCH /clinicas/procedimientos/ — usa precio_referencia (H26) */
export interface CreateProcedimientoRequest {
  nombre: string
  descripcion?: string
  duracion_min: number
  precio_referencia?: number | null
  precio_base?: number | null           // precio de lista para cotizaciones (bloquea el precio)
  descuento_maximo_pct?: number | null  // tope de descuento sobre precio_base (0 = sin descuento)
  vigencia_meses?: number
  profesionales?: string[]   // ids de Colaborador que realizan el procedimiento
}
export type UpdateProcedimientoRequest = Partial<CreateProcedimientoRequest> & { activo?: boolean }

// ── Catálogo de Tratamientos (H27) ────────────────────────────

export interface TipoSesionProcedimiento {
  id: string
  procedimiento: string                // UUID
  nombre: string                       // procedimiento.nombre (read-only)
  duracion_min: number                 // procedimiento.duracion_min (read-only)
  orden: number
}

export interface TipoSesion {
  id: string
  nombre: string               // ej: "Sesión Tensamax + Nutrición"
  cantidad: number             // cuántas veces aparece en el plan
  orden: number
  es_compromiso: boolean       // si genera sesión trackeable (default true)
  duracion_min: number
  procedimientos: TipoSesionProcedimiento[]
}

export interface TratamientoCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  precio_estimado: string | null  // Decimal como string (DRF)
  descuento_maximo_pct?: string | null // tope de descuento en cotizaciones sobre precio_estimado
  total_sesiones: number          // sum(tipo.cantidad) donde es_compromiso=true
  activo: boolean
  tipos_sesion: TipoSesion[]
  created_at: string
  updated_at: string
}

export interface TipoSesionProcedimientoInput {
  id?: string          // UUID del TipoSesionProcedimiento — solo al editar uno existente
  procedimiento: string  // UUID del procedimiento
  orden: number
}

export interface CreateTipoSesionRequest {
  nombre: string
  cantidad: number
  orden: number
  es_compromiso?: boolean
  duracion_min: number
  procedimientos: TipoSesionProcedimientoInput[]
}

export interface CreateTratamientoCatalogoRequest {
  nombre: string
  descripcion?: string
  precio_estimado?: number | null
  descuento_maximo_pct?: number | null  // tope de descuento sobre precio_estimado (0 = sin descuento)
  tipos_sesion: CreateTipoSesionRequest[]
}

/** @deprecated — usar TipoSesion (H27) */
export interface TratamientoProcedimientoItem {
  id: string
  procedimiento: string
  procedimiento_nombre: string
  procedimiento_duracion_min: number
  cantidad: number
  orden: number
}

export type UpdateServicioRequest = Partial<CreateServicioRequest> & { activo?: boolean }

// ── Recordatorios de citas ─────────────────────────────────────

export interface RecordatorioConfig {
  id: string
  nombre: string
  recordatorios_automaticos: boolean
  intervalo_recordatorio_horas: number
}

export interface UpdateRecordatorioConfigRequest {
  recordatorios_automaticos?: boolean
  intervalo_recordatorio_horas?: number
}

export interface ConfiguracionFacial {
  umbral_alta: number
  umbral_media: number
  checkin_automatico: boolean
  min_det_score: number
  min_blur_score: number
  min_brightness: number
  max_brightness: number
  max_yaw: number
  max_pitch: number
  max_roll: number
  min_face_area_pct: number
  updated_at: string
}

export type UpdateConfiguracionFacialRequest = Partial<Omit<ConfiguracionFacial, 'updated_at'>>

// ── Plantillas de asistencia (Documenso) ────────────────────────

export interface PlantillaAsistencia {
  id: string
  nombre: string
  documenso_template_token: string
  activo: boolean
}

export interface CreatePlantillaAsistenciaRequest {
  nombre: string
  documenso_template_token: string
  activo?: boolean
}

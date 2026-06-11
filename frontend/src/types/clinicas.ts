export interface Clinica {
  id: string
  nombre: string
  nit: string | null
  email: string | null
  telefono: string | null
  logo: string | null
  slot_interval_min: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface UpdateClinicaRequest {
  nombre?: string
  nit?: string
  telefono?: string
  slot_interval_min?: number
  activo?: boolean
}

export interface SlotIntervalResponse {
  id: string
  nombre: string
  slot_interval_min: number
}

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'
export type HorarioSede = Partial<Record<DiaSemana, [string, string]>>

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

export interface ServicioConsentimientoRequerido {
  id: string
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
  requiere_consentimiento?: boolean        // legacy; derivar de consentimientos_requeridos
  documenso_template_token?: string | null // legacy
  documenso_template_nombre?: string | null // legacy
  vigencia_meses: number
  activo: boolean
  clinica: string
  tiene_protocolo?: boolean
  pasos_protocolo?: PasoProtocolo[]
  consentimientos_requeridos?: ServicioConsentimientoRequerido[]
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
  vigencia_meses?: number
}
export type UpdateProcedimientoRequest = Partial<CreateProcedimientoRequest> & { activo?: boolean }

// ── Catálogo de Tratamientos (H27) ────────────────────────────

export interface TipoSesionProcedimiento {
  id: string
  procedimiento: string                // UUID
  procedimiento_nombre: string
  procedimiento_duracion_min: number
  requiere_consentimiento: boolean
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

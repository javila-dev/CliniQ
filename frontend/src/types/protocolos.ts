// ── Tipos legacy (H25, compatibilidad con backend actual) ─────

export type EstadoTratamiento = 'activo' | 'completado' | 'abandonado'
export type EstadoSesion      = 'pendiente' | 'completado' | 'inasistencia'
export type CheckinMetodo     = 'otp_whatsapp' | 'foto_presencial'

/** @deprecated — usar SesionEjecutada (H27) */
export interface SesionProcedimiento {
  id:                  string
  tratamiento:         string
  paso:                string
  paso_nombre:         string
  paso_orden:          number
  paso_semana:         number | null
  paso_es_control:     boolean
  paso_cantidad:       number
  sesion_numero:       number
  cita:                string | null
  estado:              EstadoSesion
  fecha:               string | null
  hora:                string | null
  profesional:         string | null
  profesional_nombre:  string | null
  observaciones:       string
  checkin_verificado:  boolean
  checkin_metodo:      CheckinMetodo | null
  checkin_en:          string | null
  foto_presencia_url:  string | null
}

/** @deprecated — usar TratamientoPaciente actualizado (H27) */
export interface TratamientoPaciente {
  id:                        string
  paciente:                  string
  paciente_nombre:           string
  servicio:                  string        // deprecated; ver tratamiento_catalogo
  servicio_nombre:           string        // deprecated; ver tratamiento_catalogo_nombre
  tratamiento_catalogo?:     string | null // H27
  tratamiento_catalogo_nombre?: string | null
  cotizacion_item:           string | null
  estado:                    EstadoTratamiento
  fecha_inicio:              string
  total_pasos:               number        // deprecated; usar total_sesiones
  total_sesiones?:           number        // H27
  pasos_completados:         number        // deprecated; usar sesiones_completadas
  sesiones_completadas?:     number        // H27
  progreso_pct:              number
  sesiones?:                 SesionProcedimiento[]   // legacy
  grupos?:                   GrupoSesiones[]         // H27
}

export interface MarcarCompletadoRequest {
  cita?:          string | null
  observaciones?: string
  fecha?:         string
  hora?:          string
}

export interface IniciarCheckinResponse {
  otp_enviado:  boolean
  otp_activo?:  boolean
  expira_en?:   string
}

export interface VerificarOtpRequest {
  codigo: string
}

// ── Nuevos modelos H27 ────────────────────────────────────────

export type EstadoSesionEjecutada = 'pendiente' | 'completada' | 'inasistencia'

export interface SesionEjecutada {
  id:                          string
  tratamiento_paciente:        string
  tipo_sesion_id:              string
  tipo_sesion_nombre:          string
  numero:                      number        // 1..tipo_sesion.cantidad
  estado:                      EstadoSesionEjecutada
  cita:                        string | null
  fecha:                       string | null
  profesional_nombre:          string | null
  observaciones:               string
  procedimientos_ejecutados:   string[]      // UUIDs de Procedimiento
  procedimientos_ejecutados_nombres: string[]
  checkin_verificado:          boolean
  checkin_metodo:              CheckinMetodo | null
  checkin_en:                  string | null
  consentimientos?:            ConsentimientoSesionEstado[]
}

export interface GrupoSesiones {
  tipo_sesion_id:    string
  tipo_sesion_nombre: string
  procedimientos:    string[]    // nombres
  total:             number
  completadas:       number
  pendientes:        number
  sesiones:          SesionEjecutada[]
}

export interface MarcarCompletadaRequest {
  procedimientos_ejecutados: string[]   // UUIDs
  cita?:          string | null
  observaciones?: string
  forzar_sin_consentimiento?: boolean
  motivo_forzar?: string
}

// ── Consentimientos (H28) ─────────────────────────────────────

export type MetodoConsentimiento = 'documenso' | 'presencial_pdf' | 'presencial_confirmado'
export type EstadoConsentimiento  = 'vigente' | 'vencido' | 'faltante'

export interface ConsentimientoPaciente {
  id:                   string
  template_token:       string
  template_nombre:      string
  procedimiento:        string | null   // UUID
  procedimiento_nombre: string | null
  fecha_firma:          string
  vigencia_hasta:       string
  metodo:               MetodoConsentimiento
  archivo_url:          string | null
  registrado_por_nombre: string
  created_at:           string
}

export interface ConsentimientoSesionEstado {
  procedimiento:    string
  template_nombre:  string
  estado:           EstadoConsentimiento
  fecha_firma?:     string
  vence?:           string
  vencio?:          string
}

export interface ConsentimientosSesionResponse {
  sesion_id:        string
  tipo_sesion_nombre: string
  puede_ejecutar:   boolean
  consentimientos:  ConsentimientoSesionEstado[]
}

export interface RegistrarConsentimientoRequest {
  template_token:  string
  procedimiento?:  string
  fecha_firma:     string
  metodo:          MetodoConsentimiento
  notas?:          string
}

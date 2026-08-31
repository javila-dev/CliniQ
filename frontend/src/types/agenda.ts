export type EstadoCita = 'pendiente' | 'confirmada' | 'en_espera' | 'en_curso' | 'completada' | 'cancelada' | 'no_asistio'
export type FirmaAsistenciaEstado = 'sin_firma' | 'enviada' | 'firmada' | 'rechazada'
export type EstadoConfirmacion = 'sin_enviar' | 'enviado' | 'confirmado' | 'sin_respuesta'
export type CanalOrigen = 'presencial' | 'telefono' | 'web' | 'redes'

export interface ConsentimientoInfoItem {
  template_token: string
  template_nombre: string
  vigente: boolean
  consentimiento_id: string | null
  archivo_url: string | null
}

export interface ConsentimientoInfo {
  todos_firmados: boolean
  consentimientos: ConsentimientoInfoItem[]
}

export interface CotizacionResumenCita {
  cotizacion_id: string
  descripcion: string
  num_citas: number
  citas_agendadas: number
  citas_restantes: number
}

export interface SesionTratamientoProc {
  id: string
  nombre: string
  duracion_min: number
}

export interface SesionTratamientoContexto {
  sesion_id: string
  tratamiento_id: string
  tratamiento_nombre: string
  tipo_sesion_id: string
  tipo_sesion_nombre: string
  numero: number
  total: number
  estado: 'pendiente' | 'completado' | 'inasistencia'
  procedimientos: SesionTratamientoProc[]
  tiene_zonas: boolean
}

export interface Cita {
  id: string
  paciente: string
  paciente_nombre: string
  sede: string
  sede_nombre: string
  servicio: string | null
  servicio_nombre: string
  profesional: string
  profesional_nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: EstadoCita
  estado_confirmacion: EstadoConfirmacion
  canal_origen: CanalOrigen
  notas_internas: string | null
  motivo_cancelacion: string | null
  motivo: string | null
  duracion_min: number | null
  fecha_inicio_real: string | null
  fecha_fin_real: string | null
  consentimiento_info?: ConsentimientoInfo
  item_cotizacion_id?: string | null
  sesion_ejecutada_id?: string | null
  sesion_tratamiento?: SesionTratamientoContexto | null
  cotizacion_resumen?: CotizacionResumenCita | null
  servicio_precio?: string | null
  servicio_precio_base?: string | null
  checkin_metodo?: 'otp_whatsapp' | 'foto_presencial' | null
  checkin_en?: string | null
  checkin_foto_url?: string | null
  firma_asistencia_estado?: FirmaAsistenciaEstado
  firma_asistencia_documento_id?: string | null
  firma_asistencia_signing_token?: string | null
  firma_asistencia_archivo_url?: string | null
  cobro_id?: string | null
  created_at: string
}

export interface CreateCitaRequest {
  paciente: string
  sede: string
  profesional: string
  fecha_inicio: string
  canal_origen: CanalOrigen
  notas_internas?: string
  // Exactamente uno de los tres (backend valida):
  servicio?: string | null
  item_cotizacion?: string | null
  duracion_min?: number | null
  motivo?: string
  // H30: pre-vincula la SesionEjecutada al crear la cita (ignorado hasta que H30 aterrice)
  sesion_ejecutada?: string | null
}

export type MedioConfirmacion = 'whatsapp' | 'llamada' | 'sms' | 'presencial' | 'link' | 'email'

export interface CambiarEstadoRequest {
  estado: EstadoCita
  motivo_cancelacion?: string
  medio?: MedioConfirmacion | ''
  nota?: string
}

export interface RegistroConfirmacion {
  id: string
  estado_resultante: EstadoCita
  usuario_nombre: string
  medio: MedioConfirmacion | ''
  nota: string
  created_at: string
}

export interface RecordatorioPendiente {
  id: string
  clinica_id: string
  clinica_nombre: string
  sede_id: string
  sede_nombre: string
  sede_telefono: string
  paciente_nombre: string
  paciente_telefono: string
  paciente_email: string
  servicio_nombre: string
  profesional_nombre: string
  fecha_inicio: string
  fecha_fin: string
  canal_confirmacion: string
  tipo_recordatorio: 'automatico' | 'manual'
  estado: EstadoCita
  estado_confirmacion: EstadoConfirmacion
  recordatorio_enviado: boolean
}

export interface Bloqueo {
  id: string
  profesional: string
  sede: string | null
  fecha_inicio: string
  fecha_fin: string
  motivo: string | null
}

export type EstadoBloqueo = 'pendiente' | 'aprobado' | 'rechazado'

export interface BloqueoAgenda {
  id: string
  sede: string | null
  profesional: string | null
  profesional_nombre: string | null
  fecha_inicio: string
  fecha_fin: string
  motivo: string
  estado: EstadoBloqueo
  creado_por_nombre: string
  aprobado_por_nombre: string | null
  aprobado_en: string | null
}

export interface CreateBloqueoRequest {
  sede?: string | null
  profesional?: string | null
  fecha_inicio: string
  fecha_fin: string
  motivo?: string
}

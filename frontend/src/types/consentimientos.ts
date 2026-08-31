export type EstadoConsentimiento = 'pendiente' | 'firmado' | 'revocado'
export type AmbitoPlantillaConsentimiento = 'cita' | 'cotizacion'

export interface PlantillaConsentimiento {
  id: string
  clinica: string
  servicio: string | null
  ambito: AmbitoPlantillaConsentimiento
  nombre: string
  contenido_html: string
  version: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface PlantillaConsentimientoInput {
  clinica: string
  servicio?: string | null
  ambito: AmbitoPlantillaConsentimiento
  nombre: string
  contenido_html: string
}

export interface Consentimiento {
  id: string
  cita: string | null
  cita_fecha_inicio?: string | null
  cotizacion: string | null
  cotizacion_referencia?: string | null
  plantilla: string
  plantilla_nombre: string
  template_nombre?: string | null
  paciente_nombre: string
  estado: EstadoConsentimiento
  token: string
  token_expira: string
  contenido_snapshot: string
  hash_contenido: string
  firmado_en: string | null
  documenso_signing_token?: string
  pdf_url: string | null
  created_at: string
}

export interface GenerarConsentimientoRequest {
  cita_id?: string
  cotizacion_id?: string
  plantilla_id: string
}

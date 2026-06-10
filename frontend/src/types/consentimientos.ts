export type EstadoConsentimiento = 'pendiente' | 'firmado' | 'revocado'

export interface PlantillaConsentimiento {
  id: string
  nombre: string
  contenido: string
  activa: boolean
  created_at: string
}

export interface Consentimiento {
  id: string
  cita: string
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
  pdf_url: string | null
  created_at: string
}

export interface GenerarConsentimientoRequest {
  cita_id: string
  plantilla_id: string
}

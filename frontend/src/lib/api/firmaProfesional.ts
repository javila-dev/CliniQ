import { apiClient } from './client'
import type { ConsentimientoInfo } from '@/types/agenda'

export type EstadoCapturaFirma = 'pendiente' | 'completado' | 'vencido'

export interface CapturaFirma {
  token: string
  expira_en: string
  /** Ruta del frontend que abre el celular: /firma-movil/{token} */
  ruta: string
}

export type MotivoNoPuedeFirmar = 'PROFESIONAL_NO_ASIGNADO' | 'SIN_FIRMA' | 'SIN_TP'

export interface DocumentoPendienteFirma {
  id: string
  nombre: string
  fecha_firma_paciente: string | null
  /** El documento lleva el campo de tarjeta profesional. */
  requiere_tp?: boolean
}

export interface FirmaProfesionalCita {
  documentos: DocumentoPendienteFirma[]
  puede_firmar: boolean
  motivo: { code: MotivoNoPuedeFirmar; error: string } | null
  profesional: {
    nombre: string
    registro_profesional: string
    firma_url: string | null
  }
}

export interface ResultadoFirmaProfesional {
  resultados: (DocumentoPendienteFirma & { ok: boolean; error: string | null })[]
  consentimiento_info: ConsentimientoInfo
  error?: string
  code?: string
}

export const firmaProfesionalApi = {
  /** Enlace temporal (QR) para dibujar la firma desde el celular. */
  crearCaptura: async (): Promise<CapturaFirma> => {
    const res = await apiClient.post<CapturaFirma>('/auth/me/captura-firma/')
    return res.data
  },

  estadoCaptura: async (token: string): Promise<{ estado: EstadoCapturaFirma; expira_en: string; firma_url: string | null }> => {
    const res = await apiClient.get(`/auth/me/captura-firma/${token}/estado/`)
    return res.data
  },

  /** Página pública del celular (sin sesión). */
  captura: async (token: string): Promise<{ nombre: string; expira_en: string }> => {
    const res = await apiClient.get(`/auth/firma-movil/${token}/`)
    return res.data
  },

  enviarCaptura: async (token: string, imagen: string): Promise<void> => {
    await apiClient.post(`/auth/firma-movil/${token}/`, { imagen })
  },

  /** Consentimientos de la cita pendientes de la firma del profesional. */
  pendientesCita: async (citaId: string): Promise<FirmaProfesionalCita> => {
    const res = await apiClient.get<FirmaProfesionalCita>(`/agenda/citas/${citaId}/firma_profesional/`)
    return res.data
  },

  /** PDF del documento para leerlo antes de firmar. */
  documentoPendiente: async (citaId: string, consentimientoId: string): Promise<Blob> => {
    const res = await apiClient.get(`/agenda/citas/${citaId}/firma_profesional/documento/${consentimientoId}/`, {
      responseType: 'blob',
    })
    return res.data
  },

  firmarCita: async (citaId: string): Promise<ResultadoFirmaProfesional> => {
    const res = await apiClient.post<ResultadoFirmaProfesional>(`/agenda/citas/${citaId}/firma_profesional/`)
    return res.data
  },
}

import { apiClient } from './client'
import type {
  PlantillaConsentimiento,
  Consentimiento,
  GenerarConsentimientoRequest,
} from '@/types/consentimientos'
import type { Paginated } from '@/types/common'

export const consentimientosApi = {
  plantillas: {
    list: async (): Promise<Paginated<PlantillaConsentimiento>> => {
      const res = await apiClient.get<Paginated<PlantillaConsentimiento>>('/consentimientos/plantillas/')
      return res.data
    },
    get: async (id: string): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.get<PlantillaConsentimiento>(`/consentimientos/plantillas/${id}/`)
      return res.data
    },
  },

  list: async (): Promise<Paginated<Consentimiento>> => {
    const res = await apiClient.get<Paginated<Consentimiento>>('/consentimientos/')
    return res.data
  },

  get: async (id: string): Promise<Consentimiento> => {
    const res = await apiClient.get<Consentimiento>(`/consentimientos/${id}/`)
    return res.data
  },

  generar: async (data: GenerarConsentimientoRequest): Promise<Consentimiento> => {
    const res = await apiClient.post<Consentimiento>('/consentimientos/generar/', data)
    return res.data
  },

  revocar: async (id: string): Promise<Consentimiento> => {
    const res = await apiClient.post<Consentimiento>(`/consentimientos/${id}/revocar/`)
    return res.data
  },

  // Pública — no requiere JWT
  firmarPorToken: async (
    token: string,
    firma: string
  ): Promise<{ ok: boolean; consentimiento_id: string; estado: string; firmado_en: string; pdf_url: string }> => {
    const res = await apiClient.post(`/consentimientos/firmar/${token}/`, { firma })
    return res.data
  },

  // Pública — no requiere JWT
  getPublicoPorToken: async (token: string): Promise<Consentimiento> => {
    const res = await apiClient.get<Consentimiento>(`/consentimientos/firmar/${token}/`)
    return res.data
  },
}

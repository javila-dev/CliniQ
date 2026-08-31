import { apiClient } from './client'
import type {
  PlantillaConsentimiento,
  PlantillaConsentimientoInput,
  AmbitoPlantillaConsentimiento,
  Consentimiento,
  GenerarConsentimientoRequest,
} from '@/types/consentimientos'
import type { Paginated } from '@/types/common'

export const consentimientosApi = {
  plantillas: {
    list: async (params?: { ambito?: AmbitoPlantillaConsentimiento; servicio?: string; activa?: boolean }): Promise<Paginated<PlantillaConsentimiento>> => {
      const res = await apiClient.get<Paginated<PlantillaConsentimiento>>('/consentimientos/plantillas/', { params })
      return res.data
    },
    get: async (id: string): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.get<PlantillaConsentimiento>(`/consentimientos/plantillas/${id}/`)
      return res.data
    },
    create: async (data: PlantillaConsentimientoInput): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.post<PlantillaConsentimiento>('/consentimientos/plantillas/', data)
      return res.data
    },
    update: async (id: string, data: Partial<PlantillaConsentimientoInput>): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.patch<PlantillaConsentimiento>(`/consentimientos/plantillas/${id}/`, data)
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

  iniciarFirmaDocumenso: async (id: string): Promise<{ signing_token: string; document_id: string }> => {
    const res = await apiClient.post<{ signing_token: string; document_id: string }>(`/consentimientos/${id}/iniciar_firma_documenso/`)
    return res.data
  },

  confirmarFirmaDocumenso: async (id: string): Promise<Consentimiento> => {
    const res = await apiClient.post<Consentimiento>(`/consentimientos/${id}/confirmar_firma_documenso/`)
    return res.data
  },

  verificarFirmaDocumenso: async (id: string): Promise<Consentimiento> => {
    const res = await apiClient.post<Consentimiento>(`/consentimientos/${id}/verificar_firma_documenso/`)
    return res.data
  },

  enviarLinkDocumenso: async (id: string): Promise<{ enviado: boolean; signing_url: string; telefono: string }> => {
    const res = await apiClient.post<{ enviado: boolean; signing_url: string; telefono: string }>(`/consentimientos/${id}/enviar_link_documenso/`)
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

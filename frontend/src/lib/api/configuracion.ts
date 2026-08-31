import { apiClient } from './client'
import type { DocumensoTemplateDisponible } from '@/types/clinicas'

export interface PlantillaConsentimiento {
  id: string
  nombre: string
  tipo: string
  label: string
  template_token: string
  tiene_pdf: boolean
  tiene_campos: boolean
  campos?: CampoPlantilla[]
  activo: boolean
  created_at: string
  updated_at: string
}

export interface CampoPlantilla {
  id: string
  type: 'SIGNATURE' | 'NAME' | 'EMAIL' | 'DATE' | 'TEXT' | 'NUMBER' | 'CHECKBOX'
  page: number
  positionX: number
  positionY: number
  width: number
  height: number
  label?: string
  required?: boolean
}

export const configuracionApi = {
  documensoTemplates: {
    disponibles: async (): Promise<DocumensoTemplateDisponible[]> => {
      const res = await apiClient.get<DocumensoTemplateDisponible[]>('/configuracion/documenso-templates/disponibles/')
      return res.data
    },
  },

  plantillasConsentimiento: {
    list: async (): Promise<PlantillaConsentimiento[]> => {
      const res = await apiClient.get<PlantillaConsentimiento[]>('/configuracion/plantillas-consentimiento/')
      return res.data
    },

    upload: async (nombre: string, pdf: File): Promise<PlantillaConsentimiento> => {
      const form = new FormData()
      form.append('nombre', nombre)
      form.append('pdf', pdf)
      const res = await apiClient.post<PlantillaConsentimiento>('/configuracion/plantillas-consentimiento/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },

    guardarCampos: async (id: string, campos: CampoPlantilla[]): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.patch<PlantillaConsentimiento>(
        `/configuracion/plantillas-consentimiento/${id}/campos/`,
        { campos },
      )
      return res.data
    },

    pdfUrl: (id: string) => `/configuracion/plantillas-consentimiento/${id}/pdf/`,

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/configuracion/plantillas-consentimiento/${id}/`)
    },
  },
}

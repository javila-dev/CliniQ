import { apiClient } from './client'
import type { DocumensoTemplateDisponible } from '@/types/clinicas'

export const configuracionApi = {
  documensoTemplates: {
    disponibles: async (): Promise<DocumensoTemplateDisponible[]> => {
      const res = await apiClient.get<DocumensoTemplateDisponible[]>('/configuracion/documenso-templates/disponibles/')
      return res.data
    },
  },
}

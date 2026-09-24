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
  /** El documento lo firma también el profesional que atiende la primera cita. */
  requiere_firma_profesional: boolean
  campos_profesional_completos: boolean
  /** Requiere la firma del profesional pero faltan sus campos: se usa solo con el paciente. */
  incompleta: boolean
  activo: boolean
  created_at: string
  updated_at: string
}

export type FirmanteCampo = 'paciente' | 'profesional'
/** Campos fijos del profesional; se llenan solos con su firma, nombre y tarjeta profesional. */
export type RolCampoProfesional = 'firma' | 'nombre' | 'tp'

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
  /** Sin valor = paciente (plantillas anteriores a la firma del profesional). */
  firmante?: FirmanteCampo
  rol?: RolCampoProfesional
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

    guardarCampos: async (
      id: string,
      campos: CampoPlantilla[],
      requiereFirmaProfesional?: boolean,
    ): Promise<PlantillaConsentimiento> => {
      const res = await apiClient.patch<PlantillaConsentimiento>(
        `/configuracion/plantillas-consentimiento/${id}/campos/`,
        {
          campos,
          ...(requiereFirmaProfesional !== undefined && { requiere_firma_profesional: requiereFirmaProfesional }),
        },
      )
      return res.data
    },

    pdfUrl: (id: string) => `/configuracion/plantillas-consentimiento/${id}/pdf/`,

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/configuracion/plantillas-consentimiento/${id}/`)
    },
  },
}

import { apiClient } from './client'
import type {
  AccionNumeroWhatsappResponse,
  ConectarWhatsappRequest,
  ConfigurarWhatsappPropioRequest,
  WhatsappPropioDetalleAdmin,
  WhatsappPropioEstado,
} from '@/types/whatsappPropio'

export const whatsappPropioApi = {
  estado: async (): Promise<WhatsappPropioEstado> => {
    const res = await apiClient.get<WhatsappPropioEstado>('/notificaciones/whatsapp-propio/')
    return res.data
  },

  configurar: async (data: ConfigurarWhatsappPropioRequest): Promise<WhatsappPropioEstado> => {
    const res = await apiClient.patch<WhatsappPropioEstado>('/notificaciones/whatsapp-propio/', data)
    return res.data
  },

  conectar: async (data: ConectarWhatsappRequest): Promise<WhatsappPropioEstado> => {
    const res = await apiClient.post<WhatsappPropioEstado>('/notificaciones/whatsapp-propio/conectar/', data)
    return res.data
  },
}

/** Operaciones del superadmin en /console/clinicas/[id]. */
export const whatsappPropioAdminApi = {
  detalle: async (clinicaId: string): Promise<WhatsappPropioDetalleAdmin> => {
    const res = await apiClient.get<WhatsappPropioDetalleAdmin>(`/admin/tenants/${clinicaId}/whatsapp-propio/`)
    return res.data
  },

  accion: async (
    numeroId: string,
    accion: 'crear-plantillas' | 'actualizar-plantillas' | 'revisar-salud',
  ): Promise<AccionNumeroWhatsappResponse> => {
    const res = await apiClient.post<AccionNumeroWhatsappResponse>(`/admin/whatsapp-numeros/${numeroId}/${accion}/`)
    return res.data
  },
}

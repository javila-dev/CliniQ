import { apiClient } from './client'
import type { Paginated } from '@/types/common'

export type TipoNotificacionFallida =
  | 'recordatorio_cita'
  | 'checkin_otp'
  | 'envio_cotizacion'
  | 'envio_formula'
  | 'firma_documento'

export interface NotificacionFallida {
  id: string
  tipo_notificacion: TipoNotificacionFallida
  tipo_notificacion_display: string
  telefono: string
  paciente: string | null
  paciente_nombre: string
  motivo: string
  resuelta: boolean
  resuelta_en: string | null
  created_at: string
}

export const notificacionesFallidasApi = {
  list: async (params?: { resuelta?: false }): Promise<Paginated<NotificacionFallida>> => {
    const res = await apiClient.get<Paginated<NotificacionFallida>>('/notificaciones/fallidas/', {
      params: params?.resuelta === false ? { resuelta: 'false' } : undefined,
    })
    return res.data
  },

  resolver: async (id: string): Promise<NotificacionFallida> => {
    const res = await apiClient.post<NotificacionFallida>(`/notificaciones/fallidas/${id}/resolver/`)
    return res.data
  },
}

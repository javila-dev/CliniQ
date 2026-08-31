import { apiClient } from './client'
import type { LogAccion } from '@/types/core'
import type { Paginated } from '@/types/common'

export const coreApi = {
  logAcciones: {
    list: async (params?: {
      accion?: string
      usuario?: string
      fecha_desde?: string
      fecha_hasta?: string
      page?: number
      page_size?: number
    }): Promise<Paginated<LogAccion>> => {
      const res = await apiClient.get<Paginated<LogAccion>>('/core/log-acciones/', { params })
      return res.data
    },
  },
}

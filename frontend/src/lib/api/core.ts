import { apiClient } from './client'
import type { ConfiguracionGlobal, LogAccion } from '@/types/core'
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

  // Flags de plataforma (fila única). Ver/activar el centro de ayuda para todas las clínicas.
  configuracionGlobal: {
    get: async (): Promise<ConfiguracionGlobal> => {
      const res = await apiClient.get<ConfiguracionGlobal>('/core/configuracion-global/')
      return res.data
    },
    update: async (data: Partial<Pick<ConfiguracionGlobal, 'centro_ayuda_habilitado'>>): Promise<ConfiguracionGlobal> => {
      const res = await apiClient.patch<ConfiguracionGlobal>('/core/configuracion-global/', data)
      return res.data
    },
  },
}

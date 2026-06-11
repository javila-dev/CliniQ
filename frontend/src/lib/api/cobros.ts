import { apiClient } from './client'
import type {
  Cobro, CreateCobroRequest, AgregarItemRequest, RegistrarPagoRequest, ResumenIngresos,
} from '@/types/cobros'
import type { Paginated } from '@/types/common'

export interface CobrosFilter {
  estado?: string
  sede?: string
  paciente?: string
  profesional?: string
  origen?: string
  cotizacion?: string
  fecha_desde?: string
  fecha_hasta?: string
  page?: number
  page_size?: number
}

export const cobrosApi = {
  list: async (params?: CobrosFilter): Promise<Paginated<Cobro>> => {
    const res = await apiClient.get<Paginated<Cobro>>('/cobros/cobros/', { params })
    return res.data
  },

  get: async (id: string): Promise<Cobro> => {
    const res = await apiClient.get<Cobro>(`/cobros/cobros/${id}/`)
    return res.data
  },

  create: async (data: CreateCobroRequest): Promise<Cobro> => {
    const res = await apiClient.post<Cobro>('/cobros/cobros/', data)
    return res.data
  },

  update: async (id: string, data: Partial<CreateCobroRequest>): Promise<Cobro> => {
    const res = await apiClient.patch<Cobro>(`/cobros/cobros/${id}/`, data)
    return res.data
  },

  anular: async (id: string): Promise<void> => {
    await apiClient.delete(`/cobros/cobros/${id}/`)
  },

  agregarItem: async (id: string, data: AgregarItemRequest): Promise<Cobro> => {
    const res = await apiClient.post<Cobro>(`/cobros/cobros/${id}/agregar_item/`, data)
    return res.data
  },

  eliminarItem: async (cobroId: string, itemId: string): Promise<Cobro> => {
    const res = await apiClient.delete<Cobro>(`/cobros/cobros/${cobroId}/items/${itemId}/`)
    return res.data
  },

  registrarPago: async (id: string, data: RegistrarPagoRequest): Promise<Cobro> => {
    const res = await apiClient.post<Cobro>(`/cobros/cobros/${id}/registrar_pago/`, data)
    return res.data
  },

  resumen: async (params?: Pick<CobrosFilter, 'sede' | 'origen' | 'fecha_desde' | 'fecha_hasta'>): Promise<ResumenIngresos> => {
    const res = await apiClient.get<ResumenIngresos>('/cobros/cobros/resumen/', { params })
    return res.data
  },
}

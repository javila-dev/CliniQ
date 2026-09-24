import { apiClient } from './client'
import type { CreateFormaDePagoRequest, FormaDePago, UpdateFormaDePagoRequest } from '@/types/formasPago'
import type { Paginated } from '@/types/common'

export const formasPagoApi = {
  list: async (params?: { activo?: boolean }): Promise<Paginated<FormaDePago>> => {
    const res = await apiClient.get<Paginated<FormaDePago>>('/clinicas/formas-pago/', { params: { ...params, page_size: 100 } })
    return res.data
  },

  create: async (data: CreateFormaDePagoRequest): Promise<FormaDePago> => {
    const res = await apiClient.post<FormaDePago>('/clinicas/formas-pago/', data)
    return res.data
  },

  patch: async (id: string, data: UpdateFormaDePagoRequest): Promise<FormaDePago> => {
    const res = await apiClient.patch<FormaDePago>(`/clinicas/formas-pago/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/clinicas/formas-pago/${id}/`)
  },
}

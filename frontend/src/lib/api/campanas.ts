import { apiClient } from './client'
import type { Campana, CreateCampanaRequest, CreateCampanaItemRequest, CampanaItem } from '@/types/campanas'
import type { Paginated } from '@/types/common'

export const campanasApi = {
  list: async (params?: { activo?: boolean; search?: string }): Promise<Paginated<Campana>> => {
    const res = await apiClient.get<Paginated<Campana>>('/clinicas/campanas/', { params })
    return res.data
  },

  activas: async (sedeId?: string): Promise<Campana[]> => {
    const res = await apiClient.get<Campana[]>('/clinicas/campanas/activas/', {
      params: sedeId ? { sede_id: sedeId } : undefined,
    })
    return res.data
  },

  get: async (id: string): Promise<Campana> => {
    const res = await apiClient.get<Campana>(`/clinicas/campanas/${id}/`)
    return res.data
  },

  create: async (data: CreateCampanaRequest): Promise<Campana> => {
    const res = await apiClient.post<Campana>('/clinicas/campanas/', data)
    return res.data
  },

  update: async (id: string, data: Partial<CreateCampanaRequest>): Promise<Campana> => {
    const res = await apiClient.patch<Campana>(`/clinicas/campanas/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/clinicas/campanas/${id}/`)
  },

  addItem: async (id: string, data: CreateCampanaItemRequest): Promise<CampanaItem> => {
    const res = await apiClient.post<CampanaItem>(`/clinicas/campanas/${id}/items/`, data)
    return res.data
  },

  updateItem: async (id: string, itemId: string, data: Partial<CreateCampanaItemRequest>): Promise<CampanaItem> => {
    const res = await apiClient.patch<CampanaItem>(`/clinicas/campanas/${id}/items/${itemId}/`, data)
    return res.data
  },

  removeItem: async (id: string, itemId: string): Promise<void> => {
    await apiClient.delete(`/clinicas/campanas/${id}/items/${itemId}/`)
  },
}

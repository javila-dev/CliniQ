import { apiClient } from './client'
import type {
  AdminTenant, CreateTenantRequest, UpdateTenantRequest,
  DiagramaCorporal,
  Plan, CreatePlanRequest, UpdatePlanRequest,
} from '@/types/admin'
import type { Paginated } from '@/types/common'

export const adminApi = {
  tenants: {
    list: async (params?: {
      search?: string
      activo?: boolean
      ordering?: string
    }): Promise<Paginated<AdminTenant>> => {
      const res = await apiClient.get<Paginated<AdminTenant>>('/admin/tenants/', { params })
      return res.data
    },

    get: async (id: string): Promise<AdminTenant> => {
      const res = await apiClient.get<AdminTenant>(`/admin/tenants/${id}/`)
      return res.data
    },

    create: async (data: CreateTenantRequest): Promise<AdminTenant> => {
      const res = await apiClient.post<AdminTenant>('/admin/tenants/', data)
      return res.data
    },

    update: async (id: string, data: UpdateTenantRequest): Promise<AdminTenant> => {
      const res = await apiClient.patch<AdminTenant>(`/admin/tenants/${id}/`, data)
      return res.data
    },
  },

  planes: {
    list: async (): Promise<Paginated<Plan>> => {
      const res = await apiClient.get<Paginated<Plan>>('/admin/planes/')
      return res.data
    },

    create: async (data: CreatePlanRequest): Promise<Plan> => {
      const res = await apiClient.post<Plan>('/admin/planes/', data)
      return res.data
    },

    update: async (id: string, data: UpdatePlanRequest): Promise<Plan> => {
      const res = await apiClient.patch<Plan>(`/admin/planes/${id}/`, data)
      return res.data
    },

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/admin/planes/${id}/`)
    },
  },

  diagramas: {
    list: async (): Promise<DiagramaCorporal[]> => {
      const res = await apiClient.get<Paginated<DiagramaCorporal> | DiagramaCorporal[]>(
        '/clinicas/diagramas-corporales/',
        { params: { activo: 'false', page_size: 200 } },
      )
      return Array.isArray(res.data) ? res.data : (res.data as Paginated<DiagramaCorporal>).results
    },

    create: async (data: { nombre: string; orden: number; imagen: File }): Promise<DiagramaCorporal> => {
      const form = new FormData()
      form.append('nombre', data.nombre)
      form.append('orden', String(data.orden))
      form.append('imagen', data.imagen)
      const res = await apiClient.post<DiagramaCorporal>('/clinicas/diagramas-corporales/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },

    update: async (
      id: string,
      data: { nombre?: string; orden?: number; activo?: boolean; imagen?: File },
    ): Promise<DiagramaCorporal> => {
      const form = new FormData()
      if (data.nombre !== undefined) form.append('nombre', data.nombre)
      if (data.orden !== undefined) form.append('orden', String(data.orden))
      if (data.activo !== undefined) form.append('activo', String(data.activo))
      if (data.imagen) form.append('imagen', data.imagen)
      const res = await apiClient.patch<DiagramaCorporal>(`/clinicas/diagramas-corporales/${id}/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/diagramas-corporales/${id}/`)
    },
  },
}

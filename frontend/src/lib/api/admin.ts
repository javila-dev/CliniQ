import { apiClient } from './client'
import type {
  AdminTenant, CreateTenantRequest, UpdateTenantRequest,
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
}

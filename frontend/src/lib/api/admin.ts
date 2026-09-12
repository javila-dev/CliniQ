import { apiClient } from './client'
import type {
  AdminTenant, AdminTenantUsuario, AdminTenantLogAccion, AdminTenantHistorialGrupo,
  CrearAdminResult,
  CreateTenantRequest, UpdateTenantRequest,
  DiagramaCorporal,
  Plan, CreatePlanRequest, UpdatePlanRequest,
  ConsoleUsuario, CreateConsoleUsuarioRequest,
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

    usuarios: async (id: string): Promise<AdminTenantUsuario[]> => {
      const res = await apiClient.get<AdminTenantUsuario[]>(`/admin/tenants/${id}/usuarios/`)
      return res.data
    },

    crearAdmin: async (id: string, email: string): Promise<CrearAdminResult> => {
      const res = await apiClient.post<CrearAdminResult>(`/admin/tenants/${id}/crear-admin/`, { email })
      return res.data
    },

    historial: async (
      id: string,
      params?: { grupo?: AdminTenantHistorialGrupo; page?: number },
    ): Promise<Paginated<AdminTenantLogAccion>> => {
      const res = await apiClient.get<Paginated<AdminTenantLogAccion>>(`/admin/tenants/${id}/historial/`, {
        params: {
          grupo: params?.grupo && params.grupo !== 'todo' ? params.grupo : undefined,
          page: params?.page,
        },
      })
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

  // Usuarios de plataforma (superadmin / equipo interno), sin clínica.
  usuarios: {
    list: async (params?: { search?: string }): Promise<Paginated<ConsoleUsuario>> => {
      const res = await apiClient.get<Paginated<ConsoleUsuario>>('/admin/usuarios/', { params })
      return res.data
    },

    create: async (data: CreateConsoleUsuarioRequest): Promise<ConsoleUsuario> => {
      const res = await apiClient.post<ConsoleUsuario>('/admin/usuarios/', data)
      return res.data
    },

    setActivo: async (id: string, activo: boolean): Promise<ConsoleUsuario> => {
      const res = await apiClient.patch<ConsoleUsuario>(`/admin/usuarios/${id}/`, { activo })
      return res.data
    },

    reenviarInvitacion: async (id: string): Promise<{ ok: boolean; email_enviado: boolean }> => {
      const res = await apiClient.post(`/admin/usuarios/${id}/reenviar_invitacion/`)
      return res.data
    },
  },
}

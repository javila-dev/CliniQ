import { apiClient } from './client'
import type { UsuarioAdmin, CreateUsuarioRequest, UpdateUsuarioRequest, PlanLimite } from '@/types/usuarios'
import type { Paginated } from '@/types/common'

export interface UsuariosFilter {
  rol?: string
  activo?: boolean
  search?: string
  page?: number
  page_size?: number
}

export const usuariosApi = {
  list: async (params?: UsuariosFilter): Promise<Paginated<UsuarioAdmin>> => {
    const res = await apiClient.get<Paginated<UsuarioAdmin>>('/usuarios/', { params })
    return res.data
  },

  get: async (id: string): Promise<UsuarioAdmin> => {
    const res = await apiClient.get<UsuarioAdmin>(`/usuarios/${id}/`)
    return res.data
  },

  create: async (data: CreateUsuarioRequest): Promise<UsuarioAdmin> => {
    const res = await apiClient.post<UsuarioAdmin>('/usuarios/', data)
    return res.data
  },

  update: async (id: string, data: UpdateUsuarioRequest): Promise<UsuarioAdmin> => {
    const res = await apiClient.patch<UsuarioAdmin>(`/usuarios/${id}/`, data)
    return res.data
  },

  cambiarPassword: async (id: string, nueva_password: string): Promise<void> => {
    await apiClient.post(`/usuarios/${id}/cambiar_password/`, { nueva_password })
  },

  activar: async (id: string): Promise<UsuarioAdmin> => {
    const res = await apiClient.post<UsuarioAdmin>(`/usuarios/${id}/activar/`)
    return res.data
  },

  desactivar: async (id: string): Promise<UsuarioAdmin> => {
    const res = await apiClient.post<UsuarioAdmin>(`/usuarios/${id}/desactivar/`)
    return res.data
  },

  eliminar: async (id: string): Promise<void> => {
    await apiClient.delete(`/usuarios/${id}/`)
  },

  getLimite: async (): Promise<PlanLimite> => {
    const res = await apiClient.get<PlanLimite>('/usuarios/limite/')
    return res.data
  },

  reenviarInvitacion: async (id: string): Promise<{ ok: boolean; url: string; email_enviado: boolean }> => {
    const res = await apiClient.post<{ ok: boolean; url: string; email_enviado: boolean }>(
      `/usuarios/${id}/reenviar_invitacion/`
    )
    return res.data
  },
}

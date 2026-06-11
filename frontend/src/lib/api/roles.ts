import { apiClient } from './client'
import type { Rol, CreateRolRequest, UpdateRolRequest, PermisoGrupo } from '@/types/usuarios'

export const rolesApi = {
  list: async (): Promise<Rol[]> => {
    const res = await apiClient.get<Rol[]>('/usuarios/roles/')
    return res.data
  },

  get: async (id: string): Promise<Rol> => {
    const res = await apiClient.get<Rol>(`/usuarios/roles/${id}/`)
    return res.data
  },

  create: async (data: CreateRolRequest): Promise<Rol> => {
    const res = await apiClient.post<Rol>('/usuarios/roles/', data)
    return res.data
  },

  update: async (id: string, data: UpdateRolRequest): Promise<Rol> => {
    const res = await apiClient.patch<Rol>(`/usuarios/roles/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/usuarios/roles/${id}/`)
  },

  updatePermisos: async (id: string, permission_keys: string[]): Promise<Rol> => {
    const res = await apiClient.put<Rol>(`/usuarios/roles/${id}/permisos/`, { permission_keys })
    return res.data
  },

  listarPermisos: async (): Promise<PermisoGrupo[]> => {
    const res = await apiClient.get<PermisoGrupo[]>('/usuarios/permisos/')
    return res.data
  },
}

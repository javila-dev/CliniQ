import { apiClient } from './client'
import type { AuthUser, LoginRequest, LoginResponse } from '@/types/auth'

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>('/auth/login/', data)
    return res.data
  },

  me: async (): Promise<AuthUser> => {
    const res = await apiClient.get<AuthUser>('/auth/me/')
    return res.data
  },

  updateMe: async (data: { telefono?: string; foto_perfil?: string }): Promise<AuthUser> => {
    const res = await apiClient.patch<AuthUser>('/auth/me/', data)
    return res.data
  },

  updateMeProfesional: async (data: {
    firma_digital?: File | null
    registro_profesional?: string
  }): Promise<AuthUser> => {
    const form = new FormData()
    if (data.firma_digital) form.append('firma_digital', data.firma_digital)
    if (data.firma_digital === null) form.append('firma_digital', '')
    if (data.registro_profesional !== undefined) form.append('registro_profesional', data.registro_profesional)
    const res = await apiClient.patch<AuthUser>('/auth/me/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  logout: async (): Promise<void> => {
    const refresh = localStorage.getItem('refresh_token')
    await apiClient.post('/auth/logout/', { refresh })
  },

  refresh: async (refresh: string): Promise<{ access: string }> => {
    const res = await apiClient.post<{ access: string }>('/auth/refresh/', { refresh })
    return res.data
  },

  recuperarPassword: async (email: string): Promise<void> => {
    await apiClient.post('/auth/recuperar-password/', { email })
  },

  validarTokenRecuperacion: async (token: string): Promise<{ ok: boolean; email?: string; expires_at?: string; error?: string }> => {
    const res = await apiClient.get(`/auth/recuperar-password/${token}/`)
    return res.data
  },

  restablecerPassword: async (token: string, nueva_password: string, confirmar_password: string): Promise<void> => {
    await apiClient.post('/auth/restablecer-password/', { token, nueva_password, confirmar_password })
  },

  invitar: async (email: string): Promise<void> => {
    await apiClient.post('/auth/invitar/', { email })
  },

  impersonate: async (userId: string): Promise<LoginResponse> => {
    const res = await apiClient.post<LoginResponse>(`/auth/impersonate/${userId}/`)
    return res.data
  },
}

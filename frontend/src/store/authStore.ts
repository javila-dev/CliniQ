'use client'

import { create } from 'zustand'
import type { AuthUser } from '@/types/auth'
import { authApi } from '@/lib/api/auth'
import {
  avisarOtrasPestanas,
  getAccessToken,
  limpiarTokensViejos,
  renovarSesion,
  setAccessToken,
  setSuplantando,
} from '@/lib/api/sesion'

// Los tokens ya no se guardan en localStorage (ver lib/api/sesion.ts): el de
// acceso vive en memoria y el de renovación en una cookie HttpOnly. Aquí solo
// queda la clínica, que no es secreta y viaja en la cabecera X-Clinica-Id.

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  hasCheckedAuth: boolean
  isAuthenticated: boolean
  isImpersonating: boolean
  /** No se pudo verificar la sesión por falta de conexión (no es sesión inválida). */
  errorConexion: boolean

  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  /** Sesión ya abierta por el backend (p. ej. al activar una invitación). */
  iniciarConToken: (access: string, clinicaId?: string | null) => Promise<void>
  logout: () => Promise<void>
  /** Otra pestaña cerró la sesión: se limpia esta sin llamar al backend. */
  cerrarLocal: () => void
  loadUser: () => Promise<void>
  setUser: (user: AuthUser) => void
  impersonate: (userId: string) => Promise<void>
  stopImpersonating: () => Promise<void>
}

function guardarClinica(clinicaId: string | null | undefined) {
  if (clinicaId) localStorage.setItem('clinica_id', clinicaId)
  else localStorage.removeItem('clinica_id')
}

const statusDe = (err: unknown) => (err as { response?: { status?: number } })?.response?.status

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  hasCheckedAuth: false,
  isAuthenticated: false,
  isImpersonating: false,
  errorConexion: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const data = await authApi.login({ email, password })
      setAccessToken(data.access)
      limpiarTokensViejos()
      guardarClinica(data.user.clinica_id)
      set({ user: data.user, isAuthenticated: true, hasCheckedAuth: true })
      avisarOtrasPestanas('login')
    } finally {
      set({ isLoading: false })
    }
  },

  loginWithGoogle: async (credential) => {
    set({ isLoading: true })
    try {
      const data = await authApi.loginWithGoogle(credential)
      setAccessToken(data.access)
      limpiarTokensViejos()
      guardarClinica(data.user.clinica_id)
      set({ user: data.user, isAuthenticated: true, hasCheckedAuth: true })
      avisarOtrasPestanas('login')
    } finally {
      set({ isLoading: false })
    }
  },

  iniciarConToken: async (access, clinicaId) => {
    setAccessToken(access)
    limpiarTokensViejos()
    guardarClinica(clinicaId)
    await get().loadUser()
    avisarOtrasPestanas('login')
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore — we logout locally regardless
    } finally {
      get().cerrarLocal()
      avisarOtrasPestanas('logout')
    }
  },

  cerrarLocal: () => {
    setAccessToken(null)
    setSuplantando(false)
    limpiarTokensViejos()
    localStorage.removeItem('clinica_id')
    set({ user: null, isAuthenticated: false, isImpersonating: false, hasCheckedAuth: true })
  },

  loadUser: async () => {
    set({ isLoading: true, errorConexion: false })
    try {
      // Al recargar la página el token de acceso no está (vivía en memoria): se
      // pide otro con la cookie. Sin cookie válida, no hay sesión.
      if (!getAccessToken()) {
        try {
          await renovarSesion()
        } catch (err) {
          if (statusDe(err) === 401) {
            set({ user: null, isAuthenticated: false, hasCheckedAuth: true })
            return
          }
          throw err
        }
      }
      const user = await authApi.me()
      guardarClinica(user.clinica_id)
      set({ user, isAuthenticated: true, hasCheckedAuth: true })
    } catch (err) {
      // Solo una sesión inválida cierra la sesión. Sin red o con el servidor caído
      // se conserva: antes recargar con mala conexión te sacaba.
      const status = statusDe(err)
      if (status === 401 || status === 403) {
        setAccessToken(null)
        set({ user: null, isAuthenticated: false, hasCheckedAuth: true })
      } else {
        set({ user: null, isAuthenticated: false, hasCheckedAuth: true, errorConexion: true })
      }
    } finally {
      set({ isLoading: false })
    }
  },

  setUser: (user) => set({ user }),

  // El superadmin entra con un token corto de la otra persona, solo en memoria.
  // Su propia sesión sigue en la cookie: al salir (o si recarga la página)
  // vuelve a ella. Antes sus tokens quedaban guardados en localStorage.
  impersonate: async (userId) => {
    const data = await authApi.impersonate(userId)
    setAccessToken(data.access)
    setSuplantando(true)
    guardarClinica(data.user.clinica_id)
    set({ user: data.user, isAuthenticated: true, isImpersonating: true, hasCheckedAuth: true })
  },

  stopImpersonating: async () => {
    try {
      await authApi.terminarSuplantacion()
    } catch {
      // Ya vencida o revocada: igual se vuelve a la sesión propia.
    }
    setSuplantando(false)
    setAccessToken(null)
    localStorage.removeItem('clinica_id')
    set({ isImpersonating: false })
    await get().loadUser()
  },
}))

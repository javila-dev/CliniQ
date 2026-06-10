'use client'

import { create } from 'zustand'
import type { AuthUser } from '@/types/auth'
import { authApi } from '@/lib/api/auth'

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  hasCheckedAuth: boolean
  isAuthenticated: boolean
  isImpersonating: boolean

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  loadUser: () => Promise<void>
  setUser: (user: AuthUser) => void
  impersonate: (userId: string) => Promise<void>
  stopImpersonating: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: false,
  hasCheckedAuth: false,
  isAuthenticated: false,
  isImpersonating: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const data = await authApi.login({ email, password })
      localStorage.setItem('access_token', data.access)
      localStorage.setItem('refresh_token', data.refresh)
      if (data.user.clinica_id) localStorage.setItem('clinica_id', data.user.clinica_id)
      set({ user: data.user, isAuthenticated: true, hasCheckedAuth: true })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore — we logout locally regardless
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('clinica_id')
      localStorage.removeItem('original_access_token')
      localStorage.removeItem('original_refresh_token')
      localStorage.removeItem('original_clinica_id')
      set({ user: null, isAuthenticated: false, isImpersonating: false, hasCheckedAuth: true })
    }
  },

  loadUser: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) {
      set({ isAuthenticated: false, isLoading: false, hasCheckedAuth: true })
      return
    }
    set({ isLoading: true })
    try {
      const user = await authApi.me()
      if (user.clinica_id) localStorage.setItem('clinica_id', user.clinica_id)
      const isImpersonating = !!localStorage.getItem('original_access_token')
      set({ user, isAuthenticated: true, isImpersonating, hasCheckedAuth: true })
    } catch {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('clinica_id')
      set({ user: null, isAuthenticated: false, hasCheckedAuth: true })
    } finally {
      set({ isLoading: false })
    }
  },

  setUser: (user) => set({ user }),

  impersonate: async (userId) => {
    const data = await authApi.impersonate(userId)

    // Preserve current session tokens before replacing them
    const currentAccess = localStorage.getItem('access_token')
    const currentRefresh = localStorage.getItem('refresh_token')
    const currentClinica = localStorage.getItem('clinica_id')
    if (currentAccess)  localStorage.setItem('original_access_token', currentAccess)
    if (currentRefresh) localStorage.setItem('original_refresh_token', currentRefresh)
    if (currentClinica) localStorage.setItem('original_clinica_id', currentClinica)
    else                localStorage.removeItem('original_clinica_id')

    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    if (data.user.clinica_id) localStorage.setItem('clinica_id', data.user.clinica_id)
    else                       localStorage.removeItem('clinica_id')

    set({ user: data.user, isAuthenticated: true, isImpersonating: true, hasCheckedAuth: true })
  },

  stopImpersonating: async () => {
    const originalAccess  = localStorage.getItem('original_access_token')
    const originalRefresh = localStorage.getItem('original_refresh_token')
    const originalClinica = localStorage.getItem('original_clinica_id')

    if (originalAccess)  localStorage.setItem('access_token', originalAccess)
    if (originalRefresh) localStorage.setItem('refresh_token', originalRefresh)
    if (originalClinica) localStorage.setItem('clinica_id', originalClinica)
    else                 localStorage.removeItem('clinica_id')

    localStorage.removeItem('original_access_token')
    localStorage.removeItem('original_refresh_token')
    localStorage.removeItem('original_clinica_id')

    set({ isLoading: true })
    try {
      const user = await authApi.me()
      if (user.clinica_id) localStorage.setItem('clinica_id', user.clinica_id)
      set({ user, isAuthenticated: true, isImpersonating: false, hasCheckedAuth: true })
    } finally {
      set({ isLoading: false })
    }
  },
}))

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { estaSuplantando, getAccessToken, renovarSesion, setAccessToken } from './sesion'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // La cookie HttpOnly con el token de renovación (en local el API está en otro puerto).
  withCredentials: true,
})

// Token de acceso (en memoria, ver sesion.ts) y clínica en cada petición.
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof window !== 'undefined') {
    const clinicaId = localStorage.getItem('clinica_id')
    if (clinicaId) config.headers['X-Clinica-Id'] = clinicaId

    // Superadmin clinic impersonation: send active clinic via X-Active-Clinica
    try {
      const raw = localStorage.getItem('superadmin-clinica-activa')
      if (raw) {
        const parsed = JSON.parse(raw) as { state?: { clinicaActiva?: { id: string } } }
        const activeId = parsed?.state?.clinicaActiva?.id
        if (activeId) config.headers['X-Active-Clinica'] = activeId
      }
    } catch {
      // ignore malformed state
    }
  }
  return config
})

// Ante un 401 se pide otro token de acceso con la cookie y se reintenta una vez.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Cuenta en solo lectura o suspendida: lo atiende un aviso global
    // (AvisoSuscripcion en AppShell), además del error de cada pantalla.
    if (error.response?.status === 403 && typeof window !== 'undefined') {
      const datos = error.response.data as { code?: string; error?: string } | undefined
      if (datos?.code === 'SUSCRIPCION_SOLO_LECTURA' || datos?.code === 'SUSCRIPCION_SUSPENDIDA') {
        window.dispatchEvent(new CustomEvent('cliniq:suscripcion-bloqueada', { detail: datos }))
      }
    }

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Suplantación vencida o terminada: no se renueva, porque la cookie es la
    // del superadmin y seguiría como él sin saberlo. Se vuelve a su sesión.
    if (estaSuplantando()) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('cliniq:suplantacion-terminada'))
      return Promise.reject(error)
    }

    // Sesion cerrada porque el usuario inicio sesion en otro dispositivo: no
    // tiene sentido intentar refrescar (el refresh token ya quedo invalidado
    // y de todas formas cargaria el mismo 'sid' viejo). Cerrar sesion directo
    // y avisar con el motivo especifico.
    const body = error.response?.data as { code?: string; error?: string } | undefined
    if (body?.code === 'SESION_CERRADA_OTRO_DISPOSITIVO') {
      setAccessToken(null)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cliniq:session-closed-elsewhere', { detail: body.error }))
      }
      return Promise.reject(error)
    }

    // Don't try to refresh on the login or refresh endpoints themselves
    if (['/auth/login', '/auth/refresh', '/auth/google'].some((ruta) => original.url?.includes(ruta))) {
      return Promise.reject(error)
    }

    original._retry = true
    try {
      const token = await renovarSesion()
      original.headers.Authorization = `Bearer ${token}`
      return apiClient(original)
    } catch (refreshError) {
      setAccessToken(null)
      // Soft logout: notify app instead of hard-navigating (preserves React state and next param)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cliniq:session-expired'))
      }
      return Promise.reject(refreshError)
    }
  }
)

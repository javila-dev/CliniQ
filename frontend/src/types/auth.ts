export type UserRole = 'superadmin' | 'admin' | 'profesional' | 'recepcion' | string

export interface AuthUser {
  id: string
  email: string
  first_name: string
  last_name: string
  nombre_completo: string
  rol: string          // slug del rol dinámico — no asumir catálogo fijo
  role_id: string | null
  role_nombre: string | null
  permissions: string[] // claves efectivas: ["agenda.citas.ver", ...]
  clinica_id: string | null
  clinica_nombre: string | null
  sede_id: string | null
  es_profesional: boolean
  es_admin: boolean
  is_staff: boolean
  /** Flag global (no por clínica): true cuando un superadmin activó el centro de ayuda. */
  centro_ayuda_habilitado: boolean
  telefono: string | null
  foto_perfil: string | null
  firma_digital_url: string | null
  registro_profesional: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface GoogleLoginRequest {
  credential: string // ID token de Google Identity Services
}

export interface LoginResponse {
  access: string
  refresh: string
  user: AuthUser
}

export interface TokenRefreshResponse {
  access: string
}

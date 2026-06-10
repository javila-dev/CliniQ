// ── Rol dinámico ──────────────────────────────────────────────────────────────

export interface Rol {
  id: string
  slug: string
  nombre: string
  descripcion: string
  es_sistema: boolean
  editable: boolean
  activo: boolean
  es_profesional: boolean   // si true → el colaborador con este rol tiene perfil profesional (especialidades, horarios)
  permission_keys: string[]
  usuarios_count: number
  created_at: string
  updated_at: string
}

export interface CreateRolRequest {
  slug: string
  nombre: string
  descripcion?: string
}

export interface UpdateRolRequest {
  nombre?: string
  descripcion?: string
  activo?: boolean
}

// ── Permisos ──────────────────────────────────────────────────────────────────

export interface Permiso {
  id: string
  clave: string
  modulo: string
  accion: string
  descripcion: string
}

export interface PermisoGrupo {
  modulo: string
  permisos: Permiso[]
}

// ── Usuario administrado ──────────────────────────────────────────────────────

export interface UsuarioAdmin {
  id: string
  email: string
  first_name: string
  last_name: string
  nombre_completo: string
  rol: string            // slug del rol dinámico
  role_id: string | null
  role_nombre: string | null
  permissions: string[]
  telefono: string | null
  foto_perfil: string | null
  activo: boolean
  tiene_colaborador: boolean
  sede_principal_nombre: string | null
  created_at: string
}

export interface CreateUsuarioRequest {
  email: string
  first_name: string
  last_name: string
  password: string
  role_id?: string  // preferido — UUID del rol dinámico
  rol?: string      // compatibilidad legacy (slug)
  telefono?: string
}

export interface UpdateUsuarioRequest {
  first_name?: string
  last_name?: string
  telefono?: string
  role_id?: string
  rol?: string
}

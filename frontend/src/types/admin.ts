export interface Plan {
  id: string
  nombre: string
  descripcion: string | null
  max_usuarios: number
  max_sedes: number
  precio: string  // decimal como string (DRF)
  activo: boolean
  created_at: string
  updated_at: string
}

export interface AdminTenant {
  id: string
  nombre: string
  nit: string | null
  email: string | null
  telefono: string | null
  activo: boolean
  plan: Plan | null
  facial_verificacion_habilitada: boolean
  modulo_estetico_habilitado: boolean
  modulo_obesidad_habilitado: boolean
  modo_puesta_en_marcha: boolean
  total_usuarios: number
  usuarios_activos: number
  total_sedes: number
  // usuario admin inicial creado con admin_email; null si no se creó o ya activó
  admin_usuario_pendiente: { id: string; email: string } | null
  created_at: string
  updated_at: string
}

export interface CreateTenantRequest {
  nombre: string
  nit?: string
  email?: string
  telefono?: string
  plan?: string        // uuid
  admin_email?: string // crea usuario admin inicial
}

export type UpdateTenantRequest = Partial<Omit<CreateTenantRequest, 'admin_email'>> & {
  activo?: boolean
  plan?: string | null
  facial_verificacion_habilitada?: boolean
  modulo_estetico_habilitado?: boolean
  modulo_obesidad_habilitado?: boolean
  modo_puesta_en_marcha?: boolean
}

export interface CreatePlanRequest {
  nombre: string
  descripcion?: string
  max_usuarios: number
  max_sedes: number
  precio: number
}

export type UpdatePlanRequest = Partial<CreatePlanRequest> & { activo?: boolean }

export interface DiagramaCorporal {
  id: string
  nombre: string
  imagen_url: string | null
  orden: number
  activo: boolean
}

export interface GrupoZonasDiagrama {
  id: string
  diagrama: string
  diagrama_nombre: string
  imagen_url: string | null
  orden: number
}

export interface GrupoZonas {
  id: string
  nombre: string
  activo: boolean
  diagramas: GrupoZonasDiagrama[]
  created_at: string
  updated_at: string
}

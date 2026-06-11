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
  total_usuarios: number
  usuarios_activos: number
  total_sedes: number
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
}

export interface CreatePlanRequest {
  nombre: string
  descripcion?: string
  max_usuarios: number
  max_sedes: number
  precio: number
}

export type UpdatePlanRequest = Partial<CreatePlanRequest> & { activo?: boolean }

import type { WhatsAppUso } from './clinicas'

export interface Plan {
  id: string
  nombre: string
  descripcion: string | null
  max_usuarios: number
  max_sedes: number
  precio: string | null  // decimal como string (DRF); null = cotización personalizada
  activo: boolean
  precio_usuario_adicional: string | null
  precio_sede_adicional: string | null
  facial_verificacion_habilitada: boolean
  modulo_estetico_habilitado: boolean
  modulo_obesidad_habilitado: boolean
  whatsapp_habilitado: boolean
  whatsapp_envios_incluidos: number  // 0 = sin límite
  mostrar_publico: boolean
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
  // Valores efectivos (override si existe, si no el default del plan)
  facial_verificacion_habilitada: boolean
  modulo_estetico_habilitado: boolean
  modulo_obesidad_habilitado: boolean
  whatsapp_habilitado: boolean
  whatsapp_envios_incluidos: number  // 0 = sin límite
  whatsapp_uso: WhatsAppUso
  // Anulación explícita por clínica. null = sigue al plan.
  facial_verificacion_override: boolean | null
  modulo_estetico_override: boolean | null
  modulo_obesidad_override: boolean | null
  whatsapp_override: boolean | null
  whatsapp_envios_incluidos_override: number | null
  modo_puesta_en_marcha: boolean
  total_usuarios: number
  usuarios_activos: number
  total_sedes: number
  // usuario admin inicial creado con admin_email; null si no se creó o ya activó
  admin_usuario_pendiente: { id: string; email: string } | null
  // true si la clínica no tiene ningún usuario con rol admin (tenant huérfano)
  sin_admin: boolean
  created_at: string
  updated_at: string
}

export interface CrearAdminResult {
  ok: boolean
  usuario: { id: string; email: string }
  url: string
  email_enviado: boolean
}

export type AdminTenantUsuarioEstado = 'activo' | 'pendiente' | 'inactivo'

export interface AdminTenantUsuario {
  id: string
  email: string
  nombre_completo: string
  rol: string
  rol_nombre: string
  activo: boolean
  last_login: string | null
  date_joined: string
  estado: AdminTenantUsuarioEstado
}

export interface AdminTenantLogAccion {
  id: string
  clinica: string | null
  clinica_nombre: string | null
  usuario: string | null
  usuario_email: string | null
  usuario_nombre: string
  accion: string
  objeto_tipo: string
  objeto_id: string
  detalle: Record<string, unknown> & { resumen?: string; cambios?: Record<string, { antes: unknown; despues: unknown }> }
  ip: string | null
  created_at: string
}

export type AdminTenantHistorialGrupo = 'todo' | 'gestion' | 'accesos'

export interface CreateTenantRequest {
  nombre: string
  nit?: string
  email?: string
  telefono?: string
  plan?: string       // uuid
  admin_email: string // obligatorio: el tenant siempre nace con su admin
}

export type UpdateTenantRequest = Partial<Omit<CreateTenantRequest, 'admin_email'>> & {
  activo?: boolean
  plan?: string | null
  facial_verificacion_override?: boolean | null
  modulo_estetico_override?: boolean | null
  modulo_obesidad_override?: boolean | null
  whatsapp_override?: boolean | null
  whatsapp_envios_incluidos_override?: number | null
  modo_puesta_en_marcha?: boolean
}

export interface CreatePlanRequest {
  nombre: string
  descripcion?: string
  max_usuarios: number
  max_sedes: number
  precio: number | null
  precio_usuario_adicional?: number | null
  precio_sede_adicional?: number | null
  facial_verificacion_habilitada?: boolean
  modulo_estetico_habilitado?: boolean
  modulo_obesidad_habilitado?: boolean
  whatsapp_habilitado?: boolean
  whatsapp_envios_incluidos?: number
  mostrar_publico?: boolean
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

// ── Usuarios de consola (superadmin / equipo interno, sin clínica) ──────────

export interface ConsoleUsuario {
  id: string
  email: string
  first_name: string
  last_name: string
  nombre_completo: string
  es_superadmin: boolean
  is_staff: boolean
  activo: boolean
  invitacion_pendiente: boolean
  last_login: string | null
  created_at: string
}

export interface CreateConsoleUsuarioRequest {
  email: string
  first_name: string
  last_name?: string
  es_superadmin: boolean
}

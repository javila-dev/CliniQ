import type { AuthUser } from '@/types/auth'

// ── Constantes de claves de permiso ───────────────────────────────────────────
// Fuente de verdad para el mapping feature → clave.
// Los nombres exactos los confirma GET /usuarios/permisos/.

export const PERM = {
  // Reportes / dashboard
  REPORTES_VER:              'reportes.ver',

  // Agenda
  AGENDA_VER:                'agenda.citas.ver',
  AGENDA_CREAR:              'agenda.citas.crear',
  AGENDA_EDITAR:             'agenda.citas.editar',
  AGENDA_CANCELAR:           'agenda.citas.cancelar',

  // Pacientes
  PACIENTES_VER:             'pacientes.ver',
  PACIENTES_CREAR:           'pacientes.crear',
  PACIENTES_EDITAR:          'pacientes.editar',

  // Historia clínica
  HISTORIA_VER:              'historia.ver',
  HISTORIA_ESCRIBIR:         'historia.escribir',

  // Cobros
  COBROS_VER:                'cobros.ver',
  COBROS_CREAR:              'cobros.crear',
  COBROS_ANULAR:             'cobros.anular',

  // Consentimientos
  CONSENTIMIENTOS_VER:       'consentimientos.ver',
  CONSENTIMIENTOS_GESTIONAR: 'consentimientos.gestionar',

  // Inventario
  INVENTARIO_VER:            'inventario.ver',
  INVENTARIO_GESTIONAR:      'inventario.gestionar',

  // Proveedores
  PROVEEDORES_VER:           'proveedores.ver',
  PROVEEDORES_GESTIONAR:     'proveedores.gestionar',

  // Usuarios / equipo
  USUARIOS_VER:              'usuarios.ver',
  USUARIOS_CREAR:            'usuarios.crear',
  USUARIOS_EDITAR:           'usuarios.editar',
  USUARIOS_ELIMINAR:         'usuarios.eliminar',

  // Roles
  ROLES_VER:                 'roles.ver',
  ROLES_CREAR:               'roles.crear',
  ROLES_EDITAR:              'roles.editar',
  ROLES_ELIMINAR:            'roles.eliminar',

  // Configuración de clínica
  CLINICAS_VER:              'clinicas.ver',
  CLINICAS_EDITAR:           'clinicas.editar',

  // Cotizaciones
  COTIZACIONES_VER:          'cotizaciones.ver',
  COTIZACIONES_GESTIONAR:    'cotizaciones.gestionar',
} as const

export type PermKey = typeof PERM[keyof typeof PERM]

// ── Helpers de permisos ───────────────────────────────────────────────────────

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return user?.rol === 'superadmin'
}

export function hasPermission(
  user: AuthUser | null | undefined,
  key: PermKey | string,
): boolean {
  if (isSuperAdmin(user)) return true
  return user?.permissions?.includes(key) ?? false
}

export function hasAnyPermission(
  user: AuthUser | null | undefined,
  keys: (PermKey | string)[],
): boolean {
  return keys.some((k) => hasPermission(user, k))
}

export function hasAllPermissions(
  user: AuthUser | null | undefined,
  keys: (PermKey | string)[],
): boolean {
  return keys.every((k) => hasPermission(user, k))
}

// ── Atributo de perfil — no es un rol, es si el usuario tiene perfil profesional ──

export function isProfesional(user: AuthUser | null | undefined): boolean {
  return user?.es_profesional === true
}

// Puede transicionar una cita a en_curso (iniciar atención clínica)
export function canIniciarAtencion(user: AuthUser | null | undefined): boolean {
  if (!user) return false
  if (['superadmin', 'admin'].includes(user.rol)) return true
  return user.es_profesional === true
}

// ── Acceso por feature ────────────────────────────────────────────────────────
// Cada entrada define si se puede acceder al feature/ruta correspondiente.

export const canAccess = {
  admin: (u: AuthUser | null | undefined) =>
    isSuperAdmin(u),

  dashboard: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.REPORTES_VER),

  atenciones: (u: AuthUser | null | undefined) =>
    isProfesional(u) || hasPermission(u, PERM.HISTORIA_ESCRIBIR),

  agenda: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.AGENDA_VER),

  pacientes: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.PACIENTES_VER),

  historiaClinica: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.HISTORIA_VER),

  cobros: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.COBROS_VER),

  consentimientos: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.CONSENTIMIENTOS_VER),

  inventario: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.INVENTARIO_VER),

  proveedores: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.PROVEEDORES_VER),

  equipo: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.USUARIOS_VER),

  configuracion: (u: AuthUser | null | undefined) =>
    hasAnyPermission(u, [
      PERM.CLINICAS_EDITAR,
      PERM.USUARIOS_VER,
      PERM.ROLES_VER,
    ]),

  gestionUsuarios: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.USUARIOS_VER),

  gestionRoles: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.ROLES_VER),
} as const

// ── Ruta de aterrizaje post-login ─────────────────────────────────────────────

export function defaultRoute(user: AuthUser): string {
  if (hasPermission(user, PERM.REPORTES_VER)) return '/dashboard'
  if (isProfesional(user) || hasPermission(user, PERM.HISTORIA_ESCRIBIR)) return '/atenciones'
  if (hasPermission(user, PERM.AGENDA_VER)) return '/agenda'
  if (hasPermission(user, PERM.PACIENTES_VER)) return '/pacientes'
  return '/perfil'
}

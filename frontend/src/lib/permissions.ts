import type { AuthUser } from '@/types/auth'

// ── Constantes de claves de permiso ───────────────────────────────────────────
// Fuente de verdad para el mapping feature → clave.
// Los nombres exactos los confirma GET /usuarios/permisos/.

export const PERM = {
  // Core / auditoría
  CORE_VER_LOG_ACCIONES:     'core.ver_log_acciones',

  // Reportes / dashboard
  REPORTES_VER:              'reportes.ver',
  REPORTES_VER_FINANCIEROS:  'reportes.ver_financieros',

  // Agenda
  AGENDA_VER:                'agenda.citas.ver',
  AGENDA_CREAR:              'agenda.citas.crear',
  AGENDA_EDITAR:             'agenda.citas.editar',
  AGENDA_CANCELAR:           'agenda.citas.cancelar',
  AGENDA_CREAR_BLOQUEO:      'agenda.crear_bloqueo',
  AGENDA_APROBAR_BLOQUEO:    'agenda.aprobar_bloqueo',

  // Pacientes
  PACIENTES_VER:             'pacientes.ver',
  PACIENTES_CREAR:           'pacientes.crear',
  PACIENTES_EDITAR:          'pacientes.editar',

  // Historia clínica
  HISTORIA_VER:              'historia.ver',
  HISTORIA_ESCRIBIR:         'historia.escribir',

  // Antecedentes del paciente (claves reales del catálogo backend)
  PACIENTES_ANTECEDENTES_VER:    'pacientes.antecedentes.ver',
  PACIENTES_ANTECEDENTES_EDITAR: 'pacientes.antecedentes.editar',

  // Cobros
  COBROS_VER:                'cobros.ver',
  COBROS_CREAR:              'cobros.crear',
  COBROS_ANULAR:             'cobros.anular',
  COBROS_CAMBIAR_PRECIO:     'cobros.cambiar_precio',

  // Consentimientos
  CONSENTIMIENTOS_VER:       'consentimientos.ver',
  CONSENTIMIENTOS_GESTIONAR: 'consentimientos.gestionar',
  CONSENTIMIENTOS_GENERAR:   'consentimientos.generar',
  CONSENTIMIENTOS_REVOCAR:   'consentimientos.revocar',

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

  // Campañas
  CAMPANAS_GESTIONAR:        'campanas.gestionar',

  // Cartera
  CARTERA_APROBAR_EXCEPCION: 'cartera.aprobar_excepcion',
  CARTERA_MODIFICAR_PLAZO:   'cartera.modificar_plazo',

  // Cotizaciones
  COTIZACIONES_VER:          'cotizaciones.ver',
  COTIZACIONES_GESTIONAR:    'cotizaciones.gestionar',
  COTIZACIONES_CAMBIAR_PRECIO: 'cotizaciones.cambiar_precio',

  // Caja / egresos
  CAJA_GASTOS_VER:           'caja.gastos.ver',
  CAJA_GASTOS_REGISTRAR:     'caja.gastos.registrar',
  CAJA_GASTOS_EDITAR:        'caja.gastos.editar',
  CAJA_GASTOS_APROBAR:       'caja.gastos.aprobar',
  CAJA_CAJAS_GESTIONAR:      'caja.cajas.gestionar',
  CAJA_CIERRE_VER:           'caja.cierre.ver',
  CAJA_CIERRE_REALIZAR:      'caja.cierre.realizar',
  CAJA_CATEGORIAS_VER:       'caja.categorias.ver',
  CAJA_CATEGORIAS_GESTIONAR: 'caja.categorias.gestionar',

  // Puesta en marcha / migración
  MIGRACION_GESTIONAR:       'migracion.gestionar',
} as const

export type PermKey = typeof PERM[keyof typeof PERM]

// ── Helpers de permisos ───────────────────────────────────────────────────────

export function isSuperAdmin(user: AuthUser | null | undefined): boolean {
  return user?.rol === 'superadmin'
}

export function isAdminOrSuperAdmin(user: AuthUser | null | undefined): boolean {
  return user?.rol === 'superadmin' || user?.rol === 'admin'
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

  dashboard: (_u: AuthUser | null | undefined) => true,

  atenciones: (u: AuthUser | null | undefined) =>
    isProfesional(u) || isAdminOrSuperAdmin(u) || hasPermission(u, PERM.HISTORIA_ESCRIBIR),

  agenda: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.AGENDA_VER),

  pacientes: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.PACIENTES_VER),

  historiaClinica: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.HISTORIA_VER),

  cobros: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.COBROS_VER),

  // Acceso al workspace de Resultados: basta con poder ver al menos una pestaña
  // (Ingresos, Egresos o Caja); el Resumen/P&L se restringe aparte.
  finanzas: (u: AuthUser | null | undefined) =>
    isAdminOrSuperAdmin(u)
    || hasPermission(u, PERM.COBROS_VER)
    || hasPermission(u, PERM.CAJA_GASTOS_VER)
    || hasPermission(u, PERM.CAJA_CIERRE_VER),

  // Pestaña Resumen (P&L consolidado): solo admin/superadmin.
  resultadosPyL: (u: AuthUser | null | undefined) =>
    isAdminOrSuperAdmin(u),

  egresos: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.CAJA_GASTOS_VER),

  cierreCaja: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.CAJA_CIERRE_VER),

  cajasConfig: (u: AuthUser | null | undefined) =>
    hasPermission(u, PERM.CAJA_CAJAS_GESTIONAR),

  // Rol/permiso para el asistente de puesta en marcha. La disponibilidad real
  // exige además que la clínica activa tenga `modo_puesta_en_marcha` (se chequea
  // aparte contra `miClinica`).
  puestaEnMarcha: (u: AuthUser | null | undefined) =>
    isSuperAdmin(u) || hasPermission(u, PERM.MIGRACION_GESTIONAR),

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
  if (isSuperAdmin(user)) return '/admin'
  return '/dashboard'
}

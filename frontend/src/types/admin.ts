import type { WhatsAppUso } from './clinicas'
import type { SuscripcionAdmin } from './suscripciones'

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
  descuento_anual_pct: number
  facial_verificacion_habilitada: boolean
  modulo_estetico_habilitado: boolean
  modulo_obesidad_habilitado: boolean
  whatsapp_habilitado: boolean
  whatsapp_envios_incluidos: number  // 0 = sin límite
  whatsapp_numero_propio_habilitado: boolean
  whatsapp_numeros_incluidos: number
  precio_por_numero_whatsapp: string | null
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
  whatsapp_numero_propio_habilitado: boolean
  whatsapp_numeros_incluidos: number  // 0 sin el add-on
  // Anulación explícita por clínica. null = sigue al plan.
  facial_verificacion_override: boolean | null
  modulo_estetico_override: boolean | null
  modulo_obesidad_override: boolean | null
  whatsapp_override: boolean | null
  whatsapp_envios_incluidos_override: number | null
  whatsapp_numero_propio_override: boolean | null
  whatsapp_numeros_incluidos_override: number | null
  modo_puesta_en_marcha: boolean
  total_usuarios: number
  usuarios_activos: number
  total_sedes: number
  // usuario admin inicial creado con admin_email; null si no se creó o ya activó
  admin_usuario_pendiente: { id: string; email: string } | null
  // true si la clínica no tiene ningún usuario con rol admin (tenant huérfano)
  sin_admin: boolean
  // null = clínica sin suscripción (sin restricción)
  suscripcion: SuscripcionAdmin | null
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
  // Cómo arranca la cuenta: prueba (vence) o activa con cobro manual
  inicio?: 'prueba' | 'manual'
  dias_prueba?: number
  pagado_hasta?: string | null
}

export type UpdateTenantRequest = Partial<Omit<CreateTenantRequest, 'admin_email' | 'inicio' | 'dias_prueba' | 'pagado_hasta'>> & {
  activo?: boolean
  plan?: string | null
  facial_verificacion_override?: boolean | null
  modulo_estetico_override?: boolean | null
  modulo_obesidad_override?: boolean | null
  whatsapp_override?: boolean | null
  whatsapp_envios_incluidos_override?: number | null
  whatsapp_numero_propio_override?: boolean | null
  whatsapp_numeros_incluidos_override?: number | null
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
  descuento_anual_pct?: number
  facial_verificacion_habilitada?: boolean
  modulo_estetico_habilitado?: boolean
  modulo_obesidad_habilitado?: boolean
  whatsapp_habilitado?: boolean
  whatsapp_envios_incluidos?: number
  whatsapp_numero_propio_habilitado?: boolean
  whatsapp_numeros_incluidos?: number
  precio_por_numero_whatsapp?: number | null
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

// ─── Soporte: trasladar una atención a otro paciente ──────────

export interface SoportePaciente {
  id: string
  nombre: string
  tipo_documento: string
  numero_documento: string
  telefono: string
}

export interface SoporteAtencion {
  id: string
  fecha_inicio: string
  estado: 'completada' | 'en_curso'
  servicio_nombre: string
  profesional_nombre: string | null
  sede_nombre: string
  paquete: string | null
  /** Esta atención llegó a este paciente por un traslado anterior. */
  recibida_por_traslado: boolean
}

export interface SoporteSesion {
  id: string
  nombre: string
  numero: number
  estado: string
  /** Mismo tipo de sesión que se le descontó a A: la opción sugerida. */
  misma_sesion?: boolean
  consentimientos_faltantes?: string[]
}

export interface SoportePaqueteDestino {
  id: string
  descripcion: string
  cotizacion_id: string
  aceptada_en: string | null
  sesiones_restantes: number
  /** Vacío en un paquete de procedimiento: no hay sesión de protocolo que elegir. */
  sesiones: SoporteSesion[]
}

export type AccionCobroTraslado = 'mover' | 'desligar' | 'anular'

export interface TrasladoPrevisualizacion {
  cita: {
    id: string
    fecha_inicio: string
    estado: string
    servicio_nombre: string
    profesional_nombre: string | null
    sede_nombre: string
  }
  origen: { id: string; nombre: string }
  destino: { id: string; nombre: string }
  contenido: Record<'notas' | 'fotos' | 'examenes' | 'ordenes' | 'zonas' | 'insumos' | 'mediciones' | 'tratamientos_farmacologicos', number>
  paquete_origen: string | null
  sesiones_origen: SoporteSesion[]
  paquetes_destino: SoportePaqueteDestino[]
  cobro: {
    id: string
    estado: string
    total: string
    pagado: string
    /** Abono al plan del paquete: moverlo o anularlo cambia lo pagado del plan. */
    cuenta_para_el_plan: boolean
  } | null
  avisos: { code: string; texto: string }[]
}

export interface TrasladarAtencionRequest {
  clinica: string
  cita: string
  paciente_destino: string
  item_destino?: string | null
  sesion_destino?: string | null
  accion_cobro?: AccionCobroTraslado | null
  motivo: string
}

export type AccionCobroEliminacion = 'mantener' | 'desligar' | 'anular'
export type EstadoCitaEliminacion = 'cancelada' | 'no_asistio' | 'pendiente'

export interface CupoPaquete {
  descripcion: string
  restantes_antes: number
  restantes_despues: number
}

export interface EliminacionPrevisualizacion {
  cita: TrasladoPrevisualizacion['cita']
  paciente: { id: string; nombre: string }
  contenido: TrasladoPrevisualizacion['contenido']
  sesiones: SoporteSesion[]
  /** Cupo del paquete según cómo quede la cita (cancelada o no asistió liberan; pendiente no). */
  paquete: { cancelada: CupoPaquete; pendiente: CupoPaquete } | null
  cobro: TrasladoPrevisualizacion['cobro']
  avisos: { code: string; texto: string }[]
}

export interface EliminarAtencionRequest {
  clinica: string
  cita: string
  estado_cita: EstadoCitaEliminacion
  accion_cobro?: AccionCobroEliminacion | null
  motivo: string
}

export type TipoCorreccionSoporte = 'trasladar_atencion' | 'eliminar_atencion'

export interface CorreccionSoporte {
  id: string
  tipo: TipoCorreccionSoporte
  cita_id: string
  fecha_atencion: string
  paciente: string
  /** Solo en un traslado. */
  paciente_destino: string | null
  accion_cobro: 'sin_cobro' | 'mover' | 'mantener' | 'desligar' | 'anular'
  /** Solo al eliminar: cómo quedó la cita. */
  estado_cita: EstadoCitaEliminacion | null
  motivo: string
  realizado_por: string | null
  created_at: string
}

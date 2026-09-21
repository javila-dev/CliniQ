import type { Consentimiento } from './consentimientos'

export type EstadoCotizacion = 'borrador' | 'aceptada' | 'vencida' | 'descartada'
export type TipoFormaPago = 'efectivo' | 'transferencia' | 'tarjeta_credito'
export type CanalEnvio = 'whatsapp' | 'email' | 'pdf'
export type TipoItemCotizacion = 'tratamiento' | 'procedimiento' | 'libre'
/** Un obsequio de producto usa `insumo`; solo existe como obsequio (es_obsequio = true). */
export type TipoItemApi = TipoItemCotizacion | 'insumo'

export interface CotizacionEnvio {
  id: string
  canal: CanalEnvio
  destinatario: string
  enviado_por_nombre: string
  notas: string
  created_at: string
}

export interface ItemCotizacion {
  id: string
  tipo: TipoItemApi
  tratamiento?: string | null         // UUID FK a TratamientoCatalogo (H27.1)
  tratamiento_nombre?: string | null
  procedimiento?: string | null       // UUID FK a Procedimiento (H27.1)
  procedimiento_nombre?: string | null
  descripcion: string
  num_citas: number
  duracion_estimada: string
  periodicidad: string
  valor_unitario: string        // Decimal como string (DRF)
  descuento_porcentaje: string  // Decimal como string (DRF)
  subtotal: string              // Calculado por el backend
  precio_bloqueado?: boolean            // H31: precio fijo del catálogo
  descuento_maximo_pct?: string | null  // tope de descuento del catálogo (null si no aplica)
  precio_lista?: string | null          // precio de lista del catálogo (precio_base / precio_estimado)
  precio_campana_disponible?: string | null  // H32: precio de campaña activa
  campana_id?: string | null            // H32: UUID de la campaña activa
  campana_nombre?: string | null        // H32: nombre de la campaña activa
  // Contadores de sesiones (H20)
  citas_agendadas?: number
  citas_completadas?: number
  citas_restantes?: number
  // Obsequios: valor cobrado 0 y valor de referencia solo informativo
  es_obsequio?: boolean
  agendable?: boolean                   // sesión obsequio que consume una sesión real
  valor_referencia?: string             // precio de lista del obsequio
  item_origen?: string | null           // ítem tratamiento del que se clona la sesión
  tipo_sesion_origen?: string | null    // UUID de la TipoSesion clonada
  tipo_sesion_origen_nombre?: string | null
  insumo?: string | null                // UUID del producto obsequiado
  insumo_nombre?: string | null
  insumo_unidad?: string | null
  cantidad_insumo?: string | null       // Decimal como string
  stock_disponible?: string | null      // stock en la sede de la cotización (aviso antes de entregar)
  entregado_at?: string | null
  entregado_por_nombre?: string | null
  sede_entrega?: string | null
  sede_entrega_nombre?: string | null
}

export interface CitaSesion {
  cita_id: string
  fecha_inicio: string
  estado: string
  profesional_nombre: string
  sede_nombre: string
}

export interface ItemSesiones {
  item_id: string
  tipo?: TipoItemCotizacion
  descripcion: string
  num_citas: number
  periodicidad: string
  citas_agendadas: number
  citas_completadas: number
  citas_restantes: number
  es_obsequio?: boolean         // sesión obsequio con cupo propio (procedimiento del catálogo)
  sesiones_obsequio?: number    // en un tratamiento: sesiones regaladas que suman a su cupo
  citas: CitaSesion[]
}

export interface SesionesCotizacion {
  cotizacion_id: string
  paciente_nombre: string
  items: ItemSesiones[]
}

export interface HistorialSesionEvento {
  tipo: string          // agendada | reagendada | confirmada | en_espera | en_curso | checkin | atendida | cancelada | no_asistio
  fecha: string
  usuario: string
  detalle: string
}

export interface HistorialSesion {
  item_id: string
  item_descripcion: string
  cita_id: string
  sesion_numero: number
  fecha_inicio: string
  estado_actual: string
  profesional_nombre: string
  sede_nombre: string
  eventos: HistorialSesionEvento[]
}

export interface HistorialSesionesCotizacion {
  cotizacion_id: string
  sesiones: HistorialSesion[]
}

export interface FormaPagoCotizacion {
  id: string
  tipo: TipoFormaPago
  descripcion: string
  valor: string                 // Decimal como string (DRF)
  fecha: string | null
}

export interface Cotizacion {
  id: string
  paciente: string
  paciente_nombre: string
  paciente_telefono?: string
  paciente_email?: string
  profesional_nombre: string | null
  sede: string | null
  sede_nombre?: string | null
  estado: EstadoCotizacion
  validez_dias: number
  fecha_vencimiento: string | null
  notas: string
  items: ItemCotizacion[]
  formas_pago: FormaPagoCotizacion[]
  total: string                 // Calculado por el backend
  total_pagado: string | null   // Abonado en cartera; null si aún no hay cartera (p. ej. borrador)
  es_migracion?: boolean
  saldo_pendiente: string | null // Saldo por cobrar; null si aún no hay cartera
  envios?: CotizacionEnvio[]
  compromiso_pago?: Consentimiento | null  // solo en el detalle (retrieve); consentimiento sin plantilla atado a esta cotización
  created_at: string
  updated_at: string
}

// H32: precio de campaña vigente por id de catálogo, para poblar el formulario
// antes de guardar (el backend solo lo calcula sobre ítems ya persistidos).
export interface PrecioCampanaEntry {
  precio_campana: string   // Decimal como string (DRF)
  campana_id: string
  campana_nombre: string
}

export interface PreciosCampanaMap {
  tratamientos: Record<string, PrecioCampanaEntry>
  procedimientos: Record<string, PrecioCampanaEntry>
}

export interface CreateItemCotizacion {
  tipo: TipoItemApi
  tratamiento?: string | null
  procedimiento?: string | null
  descripcion: string
  num_citas: number
  duracion_estimada: string
  periodicidad: string
  valor_unitario: number
  descuento_porcentaje: number
  // Obsequios (el backend fuerza valor_unitario = 0)
  es_obsequio?: boolean
  agendable?: boolean
  valor_referencia?: number
  tipo_sesion_origen?: string | null
  /** Posición (base 0) del ítem tratamiento del que se clona la sesión, dentro de `items`. */
  origen_indice?: number | null
  insumo?: string | null
  cantidad_insumo?: number | null
}

export interface EntregarObsequioRequest {
  sede: string
}

export interface CreateFormaPago {
  tipo: TipoFormaPago
  descripcion: string
  valor: number
  fecha?: string | null
}

export interface CreateCotizacionRequest {
  paciente: string
  sede?: string | null
  validez_dias: number
  notas: string
  items: CreateItemCotizacion[]
  formas_pago: CreateFormaPago[]
}

export type EstadoCotizacion = 'borrador' | 'aceptada' | 'vencida'
export type TipoFormaPago = 'efectivo' | 'transferencia' | 'tarjeta_credito'
export type CanalEnvio = 'whatsapp' | 'email' | 'pdf'
export type TipoItemCotizacion = 'tratamiento' | 'procedimiento' | 'libre'

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
  tipo: TipoItemCotizacion
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
  // Contadores de sesiones (H20)
  citas_agendadas?: number
  citas_completadas?: number
  citas_restantes?: number
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
  citas: CitaSesion[]
}

export interface SesionesCotizacion {
  cotizacion_id: string
  paciente_nombre: string
  items: ItemSesiones[]
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
  envios?: CotizacionEnvio[]
  created_at: string
  updated_at: string
}

export interface CreateItemCotizacion {
  tipo: TipoItemCotizacion
  tratamiento?: string | null
  procedimiento?: string | null
  descripcion: string
  num_citas: number
  duracion_estimada: string
  periodicidad: string
  valor_unitario: number
  descuento_porcentaje: number
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

export type EstadoCobro = 'pendiente' | 'pagado_parcial' | 'pagado' | 'anulado'
export type TipoItemCobro = 'servicio' | 'insumo_consumo' | 'producto_retail'
export type MedioPago = 'efectivo' | 'tarjeta_debito' | 'tarjeta_credito' | 'transferencia' | 'otro'
export type OrigenCobro = 'cita' | 'cotizacion' | 'libre'

export interface PagoRecibido {
  id: string
  cobro: string
  medio_pago: MedioPago
  valor: string
  referencia: string
  fecha: string
  recibido_por: string
  recibido_por_nombre?: string
  created_at: string
}

export interface ItemCobro {
  id: string
  cobro: string
  tipo: TipoItemCobro
  servicio: string | null
  insumo: string | null
  descripcion: string
  cantidad: string
  precio_unitario: string
  costo_unitario: string
  subtotal: string
  created_at: string
}

export interface Cobro {
  id: string
  cita: string | null
  cotizacion: string | null
  cotizacion_numero?: string | null
  origen?: OrigenCobro
  paciente: string
  paciente_nombre?: string
  profesional: string | null
  profesional_nombre?: string
  sede: string
  sede_nombre?: string
  fecha: string
  subtotal: string
  descuento: string
  total: string
  saldo_pendiente: string
  estado: EstadoCobro
  notas: string
  items: ItemCobro[]
  pagos: PagoRecibido[]
  created_by: string
  created_at: string
  updated_at: string
}

export interface ResumenIngresos {
  total_recaudado: string
  total_pendiente: string
  total_cobros: number
  total_pagados: number
  total_pendientes: number
}

export interface CreateCobroRequest {
  cita?: string
  paciente: string
  sede: string
  notas?: string
  items?: AgregarItemRequest[]
}

export interface AgregarItemRequest {
  tipo: TipoItemCobro
  servicio?: string
  insumo?: string
  cantidad?: string
  precio_unitario: string
}

export interface RegistrarPagoRequest {
  medio_pago: MedioPago
  valor: string
  referencia?: string
}

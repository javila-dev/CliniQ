export type TipoBaseFormaPago =
  | 'efectivo'
  | 'transferencia'
  | 'tarjeta_debito'
  | 'tarjeta_credito'
  | 'credito'
  | 'cuotas'
  | 'financiamiento'
  | 'otro'

export interface FormaDePago {
  id: string
  clinica: string
  nombre: string
  tipo_base: TipoBaseFormaPago
  tipo_base_display: string
  es_sistema: boolean
  activo: boolean
  orden: number
  created_at: string
}

export interface CreateFormaDePagoRequest {
  nombre: string
  tipo_base: TipoBaseFormaPago
  orden?: number
  activo?: boolean
}

export interface UpdateFormaDePagoRequest {
  nombre?: string
  orden?: number
  activo?: boolean
}

/** tipo_base que no son un medio real de cobro (son plan/estructura, no un pago recibido). */
export const TIPOS_BASE_NO_MEDIO_REAL: readonly TipoBaseFormaPago[] = ['cuotas', 'financiamiento']

export type EstadoCuota = 'pagada' | 'pendiente' | 'vencida'

export interface CuotaCartera {
  id: string
  tipo: string
  descripcion: string
  valor_esperado: string   // Decimal como string
  fecha_esperada: string | null
  pagada: boolean
  valor_pagado: string | null
  fecha_pago: string | null
  medio_pago: string
  observaciones: string
}

export interface Cartera {
  id: string
  cotizacion_id: string
  paciente_id: string
  paciente_nombre: string
  profesional_nombre?: string | null
  total: string
  total_pagado: string
  saldo_pendiente: string
  cuotas_total: number
  cuotas_pagadas: number
  proxima_cuota_fecha: string | null
  proxima_cuota_valor: string | null
  created_at: string
  cuotas?: CuotaCartera[]
}

export interface CuotaVencida {
  id: string
  cartera_id: string
  paciente_nombre: string
  cotizacion_id: string
  tipo: string
  descripcion: string
  valor_esperado: string
  fecha_esperada: string
  dias_vencida: number
  numero_cuota: number
  total_cuotas: number
}

export interface ResumenCartera {
  total_cartera: string
  total_cobrado: string
  saldo_pendiente: string
  cuotas_vencidas: number
  cuotas_vencidas_valor: string
}

export interface RegistrarPagoPayload {
  valor_pagado: number
  fecha_pago: string
  medio_pago: string
  observaciones?: string
}

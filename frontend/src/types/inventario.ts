export type UnidadMedida = 'unidad' | 'ml' | 'gr' | 'cm' | 'par' | 'caja'
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste_positivo' | 'ajuste_negativo' | 'baja'
export type OrigenMovimiento = 'compra' | 'consumo_cita' | 'venta_retail' | 'obsequio' | 'ajuste_manual' | 'baja_vencimiento'

export interface Insumo {
  id: string
  clinica: string
  categoria: string | null
  categoria_nombre: string | null
  nombre: string
  descripcion: string
  es_consumo_interno: boolean
  es_venta_retail: boolean
  unidad_medida: UnidadMedida
  stock_actual: string
  stock_minimo: string
  costo_promedio: string
  precio_venta: string | null
  requiere_lote: boolean
  permite_stock_negativo: boolean
  activo: boolean
  stock_bajo: boolean
  valor_stock: string
  created_at: string
  updated_at: string
}

export interface ContextoOrdenCompra {
  tipo: 'orden_compra'
  orden_id: string
  orden_numero: string
  proveedor_nombre: string
  numero_factura_proveedor: string | null
}

export interface ContextoNotaClinica {
  tipo: 'nota_clinica'
  paciente_id: string
  paciente_nombre: string
  cita_id: string | null
  cita_fecha: string | null
  servicio_nombre: string | null
}

export interface ContextoCobro {
  tipo: 'cobro'
  cobro_id: string
  paciente_id: string
  paciente_nombre: string
  origen: 'cita' | 'cotizacion' | 'libre'
  cotizacion_id: string | null
  cotizacion_numero: string | null
}

export interface ContextoObsequio {
  tipo: 'obsequio'
  cotizacion_id: string
  cotizacion_referencia: string
  paciente_id: string
  paciente_nombre: string
}

export type MovimientoContexto = ContextoOrdenCompra | ContextoNotaClinica | ContextoCobro | ContextoObsequio

export interface MovimientoInventario {
  id: string
  insumo: string
  insumo_nombre?: string
  sede: string
  sede_nombre?: string
  tipo: TipoMovimiento
  cantidad: string
  costo_unitario: string
  costo_promedio_resultante: string
  stock_resultante: string
  origen: OrigenMovimiento
  referencia_id: string | null
  referencia_tipo: string | null
  motivo: string
  realizado_por: string
  realizado_por_nombre?: string
  contexto: MovimientoContexto | null
  fecha: string
}

export interface CreateInsumoRequest {
  nombre: string
  descripcion?: string
  es_consumo_interno: boolean
  es_venta_retail: boolean
  unidad_medida: UnidadMedida
  stock_minimo?: string
  precio_venta?: string
  requiere_lote?: boolean
  permite_stock_negativo?: boolean
}

export interface AjusteStockRequest {
  sede: string
  cantidad_nueva: string
  motivo: string
}

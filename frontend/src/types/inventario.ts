export type UnidadMedida = 'unidad' | 'ml' | 'gr' | 'cm' | 'par' | 'caja'
export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste_positivo' | 'ajuste_negativo' | 'baja'
export type OrigenMovimiento = 'compra' | 'consumo_cita' | 'venta_retail' | 'ajuste_manual' | 'baja_vencimiento'

export interface CategoriaInsumo {
  id: string
  clinica: string
  nombre: string
  descripcion: string
  activa: boolean
  created_at: string
}

export interface Insumo {
  id: string
  clinica: string
  categoria: string
  categoria_nombre?: string
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
  activo: boolean
  stock_bajo: boolean
  valor_stock: string
  created_at: string
  updated_at: string
}

export interface MovimientoInventario {
  id: string
  insumo: string
  insumo_nombre?: string
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
  fecha: string
}

export interface CreateInsumoRequest {
  categoria: string
  nombre: string
  descripcion?: string
  es_consumo_interno: boolean
  es_venta_retail: boolean
  unidad_medida: UnidadMedida
  stock_minimo?: string
  costo_promedio?: string
  precio_venta?: string
  requiere_lote?: boolean
}

export interface AjusteStockRequest {
  cantidad_nueva: string
  motivo: string
}

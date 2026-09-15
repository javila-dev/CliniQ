import { apiClient } from './client'
import type {
  Insumo, MovimientoInventario,
  CreateInsumoRequest, AjusteStockRequest,
} from '@/types/inventario'
import type { Paginated } from '@/types/common'

export interface InsumosFilter {
  search?: string
  es_consumo_interno?: boolean
  es_venta_retail?: boolean
  activo?: boolean
  sede?: string
  page?: number
  page_size?: number
}

export interface KardexFilter {
  insumo?: string
  sede?: string
  tipo?: string
  origen?: string
  search?: string
  page?: number
  page_size?: number
}

export const inventarioApi = {
  listInsumos: async (params?: InsumosFilter): Promise<Paginated<Insumo>> => {
    const res = await apiClient.get<Paginated<Insumo>>('/inventario/insumos/', { params })
    return res.data
  },

  getInsumo: async (id: string, sede?: string): Promise<Insumo> => {
    const res = await apiClient.get<Insumo>(`/inventario/insumos/${id}/`, { params: { sede } })
    return res.data
  },

  createInsumo: async (data: CreateInsumoRequest): Promise<Insumo> => {
    const res = await apiClient.post<Insumo>('/inventario/insumos/', data)
    return res.data
  },

  updateInsumo: async (id: string, data: Partial<CreateInsumoRequest>): Promise<Insumo> => {
    const res = await apiClient.patch<Insumo>(`/inventario/insumos/${id}/`, data)
    return res.data
  },

  alertasStock: async (sede: string): Promise<Insumo[]> => {
    const res = await apiClient.get<Insumo[]>('/inventario/insumos/alertas_stock/', { params: { sede } })
    return res.data
  },

  ajustarStock: async (id: string, data: AjusteStockRequest): Promise<{ movimiento: MovimientoInventario; stock_resultante: string; costo_promedio_resultante: string }> => {
    const res = await apiClient.post(`/inventario/insumos/${id}/ajustar_stock/`, data)
    return res.data
  },

  listKardex: async (params?: KardexFilter): Promise<Paginated<MovimientoInventario>> => {
    const res = await apiClient.get<Paginated<MovimientoInventario>>('/inventario/kardex/', { params })
    return res.data
  },
}

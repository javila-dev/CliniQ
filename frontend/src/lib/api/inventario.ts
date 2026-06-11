import { apiClient } from './client'
import type {
  CategoriaInsumo, Insumo, MovimientoInventario,
  CreateInsumoRequest, AjusteStockRequest,
} from '@/types/inventario'
import type { Paginated } from '@/types/common'

export interface InsumosFilter {
  search?: string
  es_consumo_interno?: boolean
  es_venta_retail?: boolean
  categoria?: string
  activo?: boolean
  page?: number
  page_size?: number
}

export interface KardexFilter {
  insumo?: string
  tipo?: string
  origen?: string
  page?: number
  page_size?: number
}

export const inventarioApi = {
  listCategorias: async (): Promise<Paginated<CategoriaInsumo>> => {
    const res = await apiClient.get<Paginated<CategoriaInsumo>>('/inventario/categorias/')
    return res.data
  },

  listInsumos: async (params?: InsumosFilter): Promise<Paginated<Insumo>> => {
    const res = await apiClient.get<Paginated<Insumo>>('/inventario/insumos/', { params })
    return res.data
  },

  getInsumo: async (id: string): Promise<Insumo> => {
    const res = await apiClient.get<Insumo>(`/inventario/insumos/${id}/`)
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

  alertasStock: async (): Promise<Insumo[]> => {
    const res = await apiClient.get<Insumo[]>('/inventario/insumos/alertas_stock/')
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

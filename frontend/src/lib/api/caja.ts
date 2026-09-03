import { apiClient } from './client'
import type { Paginated } from '@/types/common'
import type {
  Caja, CategoriaGasto, CrearGastoPayload, EstadoCajaActual, GastoCaja, SesionCaja,
} from '@/types/caja'

export interface GastosFilter {
  categoria?: string
  sede?: string
  sesion?: string
  search?: string
  fecha__gte?: string
  fecha__lte?: string
  ordering?: string
  page?: number
  page_size?: number
}

export const cajaApi = {
  categorias: {
    list: async (params?: { activa?: boolean }): Promise<Paginated<CategoriaGasto>> => {
      const res = await apiClient.get<Paginated<CategoriaGasto>>('/caja/categorias/', { params })
      return res.data
    },
    create: async (data: { nombre: string }): Promise<CategoriaGasto> => {
      const res = await apiClient.post<CategoriaGasto>('/caja/categorias/', data)
      return res.data
    },
    update: async (id: string, data: Partial<{ nombre: string; activa: boolean }>): Promise<CategoriaGasto> => {
      const res = await apiClient.patch<CategoriaGasto>(`/caja/categorias/${id}/`, data)
      return res.data
    },
  },

  gastos: {
    list: async (params?: GastosFilter): Promise<Paginated<GastoCaja>> => {
      const res = await apiClient.get<Paginated<GastoCaja>>('/caja/gastos/', { params })
      return res.data
    },
    create: async (data: CrearGastoPayload): Promise<GastoCaja> => {
      const form = new FormData()
      form.append('sede', data.sede)
      form.append('categoria', data.categoria)
      form.append('descripcion', data.descripcion)
      form.append('valor', String(data.valor))
      form.append('fecha', data.fecha)
      if (data.soporte_foto) form.append('soporte_foto', data.soporte_foto)
      const res = await apiClient.post<GastoCaja>('/caja/gastos/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    update: async (id: string, data: Partial<{ descripcion: string; valor: number; categoria: string; fecha: string }>): Promise<GastoCaja> => {
      const res = await apiClient.patch<GastoCaja>(`/caja/gastos/${id}/`, data)
      return res.data
    },
    remove: async (id: string): Promise<void> => {
      await apiClient.delete(`/caja/gastos/${id}/`)
    },
  },

  /** Configuración de la caja de cada sede (admin). */
  cajas: {
    list: async (params?: { sede?: string; activa?: boolean }): Promise<Paginated<Caja>> => {
      const res = await apiClient.get<Paginated<Caja>>('/caja/cajas/', { params })
      return res.data
    },
    create: async (data: { sede: string; responsable?: string | null; saldo_inicial: number; activa?: boolean }): Promise<Caja> => {
      const res = await apiClient.post<Caja>('/caja/cajas/', data)
      return res.data
    },
    update: async (id: string, data: Partial<{ responsable: string | null; saldo_inicial: number; activa: boolean }>): Promise<Caja> => {
      const res = await apiClient.patch<Caja>(`/caja/cajas/${id}/`, data)
      return res.data
    },
  },

  /** Aperturas / cierres de caja. */
  sesiones: {
    list: async (params?: { caja?: string; sede?: string; estado?: string; ordering?: string; page?: number }): Promise<Paginated<SesionCaja>> => {
      const res = await apiClient.get<Paginated<SesionCaja>>('/caja/sesiones/', { params })
      return res.data
    },
    actual: async (sede: string): Promise<EstadoCajaActual> => {
      const res = await apiClient.get<EstadoCajaActual>('/caja/sesiones/actual/', { params: { sede } })
      return res.data
    },
    abrir: async (data: { caja: string; monto_apertura?: number }): Promise<SesionCaja> => {
      const res = await apiClient.post<SesionCaja>('/caja/sesiones/abrir/', data)
      return res.data
    },
    cerrar: async (id: string, data: { efectivo_contado: number; observaciones?: string }): Promise<SesionCaja> => {
      const res = await apiClient.post<SesionCaja>(`/caja/sesiones/${id}/cerrar/`, data)
      return res.data
    },
  },
}

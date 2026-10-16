import { apiClient } from './client'
import type {
  DashboardData, IngresosPeriodo, ServicioReporte,
  OcupacionReporte, ReportesParams, IngresosPorOrigen, CotizacionesMesMetrics, ComercialMetrics,
  PacienteSinReagendar, EstadoFinanciero, Vendedor,
} from '@/types/reportes'

export const reportesApi = {
  getDashboard: async (params?: Pick<ReportesParams, 'sede_id' | 'fecha' | 'fecha_inicio' | 'fecha_fin'>): Promise<DashboardData> => {
    const res = await apiClient.get<DashboardData>('/reportes/dashboard/', { params })
    return res.data
  },

  getIngresos: async (params?: ReportesParams): Promise<IngresosPeriodo[]> => {
    const res = await apiClient.get<IngresosPeriodo[]>('/reportes/ingresos/', { params })
    return res.data
  },

  getIngresosPorOrigen: async (params: {
    fecha_inicio: string
    fecha_fin: string
    comparar_inicio?: string
    comparar_fin?: string
    sede_id?: string
  }): Promise<IngresosPorOrigen> => {
    const res = await apiClient.get<IngresosPorOrigen>('/reportes/ingresos-por-origen/', { params })
    return res.data
  },

  getServicios: async (params?: ReportesParams): Promise<ServicioReporte[]> => {
    const res = await apiClient.get<ServicioReporte[]>('/reportes/servicios/', { params })
    return res.data
  },

  getOcupacion: async (params?: ReportesParams): Promise<OcupacionReporte[]> => {
    const res = await apiClient.get<OcupacionReporte[]>('/reportes/ocupacion/', { params })
    return res.data
  },

  getComercial: async (
    params?: Pick<ReportesParams, 'sede_id' | 'fecha_inicio' | 'fecha_fin'> & { vendedores?: string[] },
  ): Promise<ComercialMetrics> => {
    const { vendedores, ...rest } = params ?? {}
    const res = await apiClient.get<ComercialMetrics>('/reportes/comercial/', {
      params: { ...rest, ...(vendedores?.length ? { vendedores: vendedores.join(',') } : {}) },
    })
    return res.data
  },

  getCotizacionesMes: async (
    params?: Pick<ReportesParams, 'sede_id' | 'fecha_inicio' | 'fecha_fin'> & { vendedores?: string[] },
  ): Promise<CotizacionesMesMetrics> => {
    const { vendedores, ...rest } = params ?? {}
    const res = await apiClient.get<CotizacionesMesMetrics>('/reportes/cotizaciones/', {
      params: { ...rest, ...(vendedores?.length ? { vendedores: vendedores.join(',') } : {}) },
    })
    return res.data
  },

  getVendedores: async (): Promise<Vendedor[]> => {
    const res = await apiClient.get<Vendedor[]>('/reportes/vendedores/')
    return res.data
  },

  getPacientesSinReagendar: async (params?: Pick<ReportesParams, 'sede_id'>): Promise<PacienteSinReagendar[]> => {
    const res = await apiClient.get<PacienteSinReagendar[]>('/reportes/pacientes-sin-reagendar/', { params })
    return res.data
  },

  getPyL: async (params?: Pick<ReportesParams, 'sede_id' | 'fecha_inicio' | 'fecha_fin'>): Promise<EstadoFinanciero> => {
    const res = await apiClient.get<EstadoFinanciero>('/reportes/pyl/', { params })
    return res.data
  },
}

import { apiClient } from './client'
import type {
  DashboardData, IngresosPeriodo, ServicioReporte,
  OcupacionReporte, ReportesParams, CotizacionesMesMetrics,
  PacienteSinReagendar,
} from '@/types/reportes'

export const reportesApi = {
  getDashboard: async (params?: Pick<ReportesParams, 'sede_id' | 'fecha'>): Promise<DashboardData> => {
    const res = await apiClient.get<DashboardData>('/reportes/dashboard/', { params })
    return res.data
  },

  getIngresos: async (params?: ReportesParams): Promise<IngresosPeriodo[]> => {
    const res = await apiClient.get<IngresosPeriodo[]>('/reportes/ingresos/', { params })
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

  getCotizacionesMes: async (params?: Pick<ReportesParams, 'sede_id' | 'fecha_inicio' | 'fecha_fin'>): Promise<CotizacionesMesMetrics> => {
    const res = await apiClient.get<CotizacionesMesMetrics>('/reportes/cotizaciones/', { params })
    return res.data
  },

  getPacientesSinReagendar: async (params?: Pick<ReportesParams, 'sede_id'>): Promise<PacienteSinReagendar[]> => {
    const res = await apiClient.get<PacienteSinReagendar[]>('/reportes/pacientes-sin-reagendar/', { params })
    return res.data
  },
}

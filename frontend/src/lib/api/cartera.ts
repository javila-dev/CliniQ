import { apiClient } from './client'
import type {
  Cartera,
  CarteraPaciente,
  ResumenCartera,
  RegistrarPagoPayload,
  CuotaCartera,
  CuotaVencida,
  AcuerdoPago,
  CuotaPropuestaInput,
} from '@/types/cartera'
import type { Paginated } from '@/types/common'

export interface CrearAcuerdoPayload {
  cartera: string
  motivo: string
  cuotas: CuotaPropuestaInput[]
}

export interface CarteraFilter {
  paciente?: string
  estado?: string
  search?: string
  ordering?: string
  page?: number
  page_size?: number
}

export const carteraApi = {
  list: async (params?: CarteraFilter): Promise<Paginated<Cartera>> => {
    const res = await apiClient.get<Paginated<Cartera>>('/cartera/', { params })
    return res.data
  },

  /** Una fila por paciente; `ordering`: paciente | total | cobrado | saldo | prox (con - para descendente). */
  porPaciente: async (params?: Pick<CarteraFilter, 'search' | 'ordering' | 'page' | 'page_size'>): Promise<Paginated<CarteraPaciente>> => {
    const res = await apiClient.get<Paginated<CarteraPaciente>>('/cartera/por-paciente/', { params })
    return res.data
  },

  get: async (id: string): Promise<Cartera> => {
    const res = await apiClient.get<Cartera>(`/cartera/${id}/`)
    return res.data
  },

  resumen: async (params?: { sede_id?: string; desde?: string }): Promise<ResumenCartera> => {
    const res = await apiClient.get<ResumenCartera>('/cartera/resumen/', { params })
    return res.data
  },

  registrarPago: async (cuotaId: string, data: RegistrarPagoPayload): Promise<CuotaCartera> => {
    const res = await apiClient.patch<CuotaCartera>(`/cartera/cuotas/${cuotaId}/registrar_pago/`, data)
    return res.data
  },

  aprobarExcepcion: async (cuotaId: string): Promise<void> => {
    await apiClient.post(`/cartera/cuotas/${cuotaId}/aprobar_excepcion/`)
  },

  patchCuota: async (cuotaId: string, data: { fecha_vencimiento?: string; monto?: number }): Promise<CuotaCartera> => {
    const res = await apiClient.patch<CuotaCartera>(`/cartera/cuotas/${cuotaId}/`, data)
    return res.data
  },

  // ── Acuerdos de pago ────────────────────────────────────────────────────
  listAcuerdos: async (carteraId: string): Promise<AcuerdoPago[]> => {
    const res = await apiClient.get<AcuerdoPago[]>('/cartera/acuerdos/', { params: { cartera: carteraId } })
    return res.data
  },

  crearAcuerdo: async (data: CrearAcuerdoPayload): Promise<AcuerdoPago> => {
    const res = await apiClient.post<AcuerdoPago>('/cartera/acuerdos/', data)
    return res.data
  },

  anularAcuerdo: async (acuerdoId: string, motivo: string): Promise<AcuerdoPago> => {
    const res = await apiClient.post<AcuerdoPago>(`/cartera/acuerdos/${acuerdoId}/anular/`, { motivo })
    return res.data
  },

  verificarFirmaAcuerdo: async (acuerdoId: string): Promise<AcuerdoPago> => {
    const res = await apiClient.post<AcuerdoPago>(`/cartera/acuerdos/${acuerdoId}/verificar-firma/`)
    return res.data
  },

  /** Cuotas con saldo y fecha ya pasada, calculadas en el servidor (la que vence hoy no cuenta). */
  cuotasVencidas: async (desde?: string): Promise<CuotaVencida[]> => {
    const res = await apiClient.get<CuotaVencida[]>('/cartera/cuotas-vencidas/', { params: desde ? { desde } : undefined })
    return res.data
  },
}

import { apiClient } from './client'
import type { Paginated } from '@/types/common'
import type {
  ConfigSeguimiento,
  CrearInteresadoRequest,
  EmbudoResumen,
  GestionOportunidad,
  MotivoPerdida,
  Oportunidad,
  RegistrarGestionRequest,
} from '@/types/seguimiento'

const BASE = '/seguimiento/oportunidades/'

export const seguimientoApi = {
  config: async (): Promise<ConfigSeguimiento> => {
    const res = await apiClient.get<ConfigSeguimiento>('/seguimiento/config/')
    return res.data
  },
  guardarConfig: async (data: Partial<ConfigSeguimiento>): Promise<ConfigSeguimiento> => {
    const res = await apiClient.patch<ConfigSeguimiento>('/seguimiento/config/', data)
    return res.data
  },
  list: async (params?: {
    para_hoy?: '1'
    estado?: string
    etapa?: string
    tipo?: string
    mias?: '1'
    sede?: string
    paciente?: string
    q?: string
    page?: number
    page_size?: number
  }): Promise<Paginated<Oportunidad>> => {
    const res = await apiClient.get<Paginated<Oportunidad>>(BASE, { params })
    return res.data
  },

  obtener: async (id: string): Promise<Oportunidad> => {
    const res = await apiClient.get<Oportunidad>(`${BASE}${id}/`)
    return res.data
  },

  crear: async (data: CrearInteresadoRequest): Promise<Oportunidad> => {
    const res = await apiClient.post<Oportunidad>(BASE, data)
    return res.data
  },

  actualizar: async (id: string, data: Partial<Pick<Oportunidad,
    'etapa' | 'proximo_contacto' | 'origen' | 'interes' | 'valor_estimado' | 'responsable'>>): Promise<Oportunidad> => {
    const res = await apiClient.patch<Oportunidad>(`${BASE}${id}/`, data)
    return res.data
  },

  gestiones: async (id: string): Promise<GestionOportunidad[]> => {
    const res = await apiClient.get<GestionOportunidad[]>(`${BASE}${id}/gestiones/`)
    return res.data
  },

  registrarGestion: async (id: string, data: RegistrarGestionRequest): Promise<Oportunidad> => {
    const res = await apiClient.post<Oportunidad>(`${BASE}${id}/gestiones/`, data)
    return res.data
  },

  perder: async (id: string, data: { motivo?: MotivoPerdida; nota?: string }): Promise<Oportunidad> => {
    const res = await apiClient.post<Oportunidad>(`${BASE}${id}/perder/`, data)
    return res.data
  },

  reabrir: async (id: string): Promise<Oportunidad> => {
    const res = await apiClient.post<Oportunidad>(`${BASE}${id}/reabrir/`)
    return res.data
  },

  vincularPaciente: async (id: string, paciente: string): Promise<Oportunidad> => {
    const res = await apiClient.post<Oportunidad>(`${BASE}${id}/vincular_paciente/`, { paciente })
    return res.data
  },

  embudo: async (params?: { sede?: string; desde?: string }): Promise<EmbudoResumen> => {
    const res = await apiClient.get<EmbudoResumen>(`${BASE}embudo/`, { params })
    return res.data
  },
}

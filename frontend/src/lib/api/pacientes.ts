import { apiClient } from './client'
import type { Paciente, BusquedaPaciente, CreatePacienteRequest } from '@/types/pacientes'
import type { Paginated } from '@/types/common'

export interface PacientesFilter {
  search?: string
  activo?: boolean
  sexo?: string
  canal_confirmacion?: string
  tipo_documento?: string
  page?: number
}

export const pacientesApi = {
  list: async (params?: PacientesFilter): Promise<Paginated<Paciente>> => {
    const res = await apiClient.get<Paginated<Paciente>>('/pacientes/', { params })
    return res.data
  },

  get: async (id: string): Promise<Paciente> => {
    const res = await apiClient.get<Paciente>(`/pacientes/${id}/`)
    return res.data
  },

  create: async (data: CreatePacienteRequest): Promise<Paciente> => {
    const res = await apiClient.post<Paciente>('/pacientes/', data)
    return res.data
  },

  update: async (id: string, data: Partial<CreatePacienteRequest>): Promise<Paciente> => {
    const res = await apiClient.patch<Paciente>(`/pacientes/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/pacientes/${id}/`)
  },

  buscar: async (q: string): Promise<BusquedaPaciente[]> => {
    if (q.length < 3) return []
    const res = await apiClient.get<BusquedaPaciente[]>('/pacientes/buscar/', { params: { q } })
    return res.data
  },
}

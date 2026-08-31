import { apiClient } from './client'
import type { Paciente, BusquedaPaciente, CreatePacienteRequest } from '@/types/pacientes'
import type { Paginated } from '@/types/common'

export interface CargaMasivaError {
  fila: number
  documento: string | null
  mensaje: string
}

export interface CargaMasivaResultado {
  total_filas: number
  creados: number
  errores: CargaMasivaError[]
}

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

  cargaMasiva: async (archivo: File): Promise<CargaMasivaResultado> => {
    const formData = new FormData()
    formData.append('archivo', archivo)
    const res = await apiClient.post<CargaMasivaResultado>('/pacientes/carga_masiva/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  buscar: async (q: string): Promise<BusquedaPaciente[]> => {
    if (q.length < 3) return []
    const res = await apiClient.get<BusquedaPaciente[]>('/pacientes/buscar/', { params: { q } })
    return res.data
  },

  enrollment: async (id: string, photo: File): Promise<{ valid: boolean; warnings: string[]; errors?: string[] }> => {
    const form = new FormData()
    form.append('photo', photo)
    const res = await apiClient.post(`/pacientes/${id}/enrollment/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  checkins: async (id: string): Promise<CheckInRecord[]> => {
    const res = await apiClient.get<CheckInRecord[]>(`/pacientes/${id}/checkins/`)
    return res.data
  },
}

export interface CheckInRecord {
  id: string
  foto_live_url: string | null
  score: number
  confidence: 'alta' | 'media' | 'baja'
  match: boolean
  requiere_confirmacion: boolean
  det_score_live: number
  realizado_por_nombre: string | null
  cita_id: string | null
  cita_fecha: string | null
  created_at: string
}

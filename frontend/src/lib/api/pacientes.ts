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

export interface PosibleDuplicado {
  id: string
  nombre_completo: string
  coincide_telefono: boolean
  coincide_email: boolean
}

export interface ResumenPacientes {
  total: number
  activos: number
  inactivos: number
}

export interface CumpleanosPaciente {
  id: string
  nombre_completo: string
  nombres: string
  /** Fecha (aaaa-mm-dd) en que cae el cumpleaños dentro de la ventana. */
  fecha: string
  /** 0 = hoy. */
  dias_faltan: number
  edad_cumple: number
  /** Enmascarado ("••••4567") sin el permiso de datos sensibles. */
  telefono: string
}

export interface PacientesFilter {
  search?: string
  activo?: boolean
  sexo?: string
  canal_confirmacion?: string
  tipo_documento?: string
  /** Sede habitual (la de su última cita). */
  sede?: string
  page?: number
  page_size?: number
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

  update: async (id: string, data: Partial<CreatePacienteRequest> & { activo?: boolean }): Promise<Paciente> => {
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

  /** Pacientes con el mismo teléfono o correo: aviso no bloqueante (M2-20). */
  posiblesDuplicados: async (params: { telefono?: string; email?: string; excluir?: string }): Promise<PosibleDuplicado[]> => {
    const res = await apiClient.get<PosibleDuplicado[]>('/pacientes/posibles_duplicados/', { params })
    return res.data
  },

  /** Activos que cumplen años hoy o en los próximos `dias` (7 por defecto). */
  /** Con `sede`: registrados, atendidos o cotizados en esa sede. */
  cumpleanos: async (dias = 7, sede?: string): Promise<CumpleanosPaciente[]> => {
    const res = await apiClient.get<CumpleanosPaciente[]>('/pacientes/cumpleanos/', { params: { dias, sede } })
    return res.data
  },

  /** Con `sede`: cada paciente cuenta en su sede habitual. */
  resumen: async (sede?: string): Promise<ResumenPacientes> => {
    const res = await apiClient.get<ResumenPacientes>('/pacientes/resumen/', { params: { sede } })
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

  eliminarFotoControl: async (id: string): Promise<void> => {
    await apiClient.delete(`/pacientes/${id}/foto-control/`)
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

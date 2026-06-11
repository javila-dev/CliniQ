import { apiClient } from './client'
import type {
  Colaborador,
  ColaboradorProfesional,
  CreateColaboradorRequest,
  UpdateColaboradorRequest,
  HorarioColaborador,
  CreateHorarioColaboradorRequest,
} from '@/types/colaboradores'
import type { Paginated } from '@/types/common'

export interface ColaboradoresFilter {
  activo?: boolean
  sede_principal?: string
  tipo_contrato?: string
  search?: string
  user?: string
  page?: number
  page_size?: number
}

export const colaboradoresApi = {
  list: async (params?: ColaboradoresFilter): Promise<Paginated<Colaborador>> => {
    const res = await apiClient.get<Paginated<Colaborador>>('/colaboradores/', { params })
    return res.data
  },

  get: async (id: string): Promise<Colaborador> => {
    const res = await apiClient.get<Colaborador>(`/colaboradores/${id}/`)
    return res.data
  },

  create: async (data: CreateColaboradorRequest): Promise<Colaborador> => {
    const res = await apiClient.post<Colaborador>('/colaboradores/', data)
    return res.data
  },

  update: async (id: string, data: UpdateColaboradorRequest): Promise<Colaborador> => {
    const res = await apiClient.patch<Colaborador>(`/colaboradores/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/colaboradores/${id}/`)
  },

  profesionales: async (sede_id?: string): Promise<ColaboradorProfesional[]> => {
    const res = await apiClient.get<ColaboradorProfesional[]>('/colaboradores/profesionales/', {
      params: sede_id ? { sede_id } : undefined,
    })
    return res.data
  },

  // ─── Horarios de colaborador ────────────────────────────────────────────────
  // Endpoint: /colaboradores/horarios/
  // Represents recurring weekly availability per colaborador × sede × day.

  horarios: {
    list: async (colaboradorId: string): Promise<HorarioColaborador[]> => {
      const res = await apiClient.get<HorarioColaborador[]>('/colaboradores/horarios/', {
        params: { colaborador: colaboradorId },
      })
      return res.data
    },

    create: async (data: CreateHorarioColaboradorRequest): Promise<HorarioColaborador> => {
      const res = await apiClient.post<HorarioColaborador>('/colaboradores/horarios/', data)
      return res.data
    },

    update: async (
      id: string,
      data: Partial<Omit<CreateHorarioColaboradorRequest, 'colaborador'>>
    ): Promise<HorarioColaborador> => {
      const res = await apiClient.patch<HorarioColaborador>(`/colaboradores/horarios/${id}/`, data)
      return res.data
    },

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/colaboradores/horarios/${id}/`)
    },
  },
}

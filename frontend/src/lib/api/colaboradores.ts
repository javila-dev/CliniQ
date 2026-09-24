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

  /** Profesionales que se pueden elegir al agendar. El servidor solo filtra por
   *  procedimiento si la clínica activó ese parámetro; si no, ignora el filtro. */
  profesionales: async (
    sede_id?: string,
    filtro?: { servicioIds?: string[]; itemCotizacionId?: string | null; sesionEjecutadaId?: string | null },
  ): Promise<ColaboradorProfesional[]> => {
    const params: Record<string, string> = {}
    if (sede_id) params.sede_id = sede_id
    if (filtro?.servicioIds?.length) params.servicio_ids = filtro.servicioIds.join(',')
    if (filtro?.itemCotizacionId) params.item_cotizacion_id = filtro.itemCotizacionId
    if (filtro?.sesionEjecutadaId) params.sesion_ejecutada_id = filtro.sesionEjecutadaId
    const res = await apiClient.get<ColaboradorProfesional[]>('/colaboradores/profesionales/', {
      params: Object.keys(params).length ? params : undefined,
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

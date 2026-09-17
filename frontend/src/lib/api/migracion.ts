import { apiClient } from './client'
import type { Paginated } from '@/types/common'
import type { LoteMigracion, PacienteEnCursoPayload } from '@/types/migracion'

export interface LotesMigracionFilter {
  search?: string
  page?: number
}

export const migracionApi = {
  lotes: async (params?: LotesMigracionFilter): Promise<Paginated<LoteMigracion>> => {
    const res = await apiClient.get<Paginated<LoteMigracion>>('/migracion/lotes/', { params })
    return res.data
  },
  cargarPacienteEnCurso: async (data: PacienteEnCursoPayload): Promise<LoteMigracion> => {
    const res = await apiClient.post<LoteMigracion>('/migracion/paciente-en-curso/', data)
    return res.data
  },
  revertir: async (id: string): Promise<LoteMigracion> => {
    const res = await apiClient.post<LoteMigracion>(`/migracion/lotes/${id}/revertir/`)
    return res.data
  },
}

import { apiClient } from './client'
import type { MedicionAntropometrica, MedicionAntropometricaInput } from '@/types/obesidad'
import type { Paginated } from '@/types/common'

const BASE = '/obesidad'

export const obesidadApi = {
  mediciones: {
    list: async (pacienteId: string): Promise<Paginated<MedicionAntropometrica>> => {
      const res = await apiClient.get<Paginated<MedicionAntropometrica>>(`${BASE}/mediciones/`, { params: { paciente: pacienteId } })
      return res.data
    },
    create: async (data: MedicionAntropometricaInput): Promise<MedicionAntropometrica> => {
      const res = await apiClient.post<MedicionAntropometrica>(`${BASE}/mediciones/`, data)
      return res.data
    },
    update: async (id: string, data: Partial<MedicionAntropometricaInput>): Promise<MedicionAntropometrica> => {
      const res = await apiClient.patch<MedicionAntropometrica>(`${BASE}/mediciones/${id}/`, data)
      return res.data
    },
    remove: async (id: string): Promise<void> => {
      await apiClient.delete(`${BASE}/mediciones/${id}/`)
    },
  },
}

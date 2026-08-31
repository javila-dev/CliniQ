import { apiClient } from './client'
import type {
  AntecedentesObesidad,
  AntecedentesObesidadInput,
  MedicionAntropometrica,
  MedicionAntropometricaInput,
  ObjetivoObesidad,
  ObjetivoObesidadInput,
  ResultadoLaboratorio,
  ResultadoLaboratorioInput,
  TratamientoFarmacologico,
  TratamientoFarmacologicoInput,
  ProgresoObesidad,
  TipoLaboratorio,
} from '@/types/obesidad'
import type { Paginated } from '@/types/common'

const BASE = '/obesidad'

export const obesidadApi = {
  antecedentes: {
    get: async (historiaId: string): Promise<AntecedentesObesidad> => {
      const res = await apiClient.get<AntecedentesObesidad>(`${BASE}/antecedentes/${historiaId}/`)
      return res.data
    },
    create: async (data: AntecedentesObesidadInput): Promise<AntecedentesObesidad> => {
      const res = await apiClient.post<AntecedentesObesidad>(`${BASE}/antecedentes/`, data)
      return res.data
    },
    update: async (historiaId: string, data: Partial<AntecedentesObesidadInput>): Promise<AntecedentesObesidad> => {
      const res = await apiClient.patch<AntecedentesObesidad>(`${BASE}/antecedentes/${historiaId}/`, data)
      return res.data
    },
  },

  objetivos: {
    list: async (pacienteId: string): Promise<Paginated<ObjetivoObesidad>> => {
      const res = await apiClient.get<Paginated<ObjetivoObesidad>>(`${BASE}/objetivos/`, { params: { paciente: pacienteId } })
      return res.data
    },
    create: async (data: ObjetivoObesidadInput): Promise<ObjetivoObesidad> => {
      const res = await apiClient.post<ObjetivoObesidad>(`${BASE}/objetivos/`, data)
      return res.data
    },
    update: async (id: string, data: Partial<ObjetivoObesidadInput>): Promise<ObjetivoObesidad> => {
      const res = await apiClient.patch<ObjetivoObesidad>(`${BASE}/objetivos/${id}/`, data)
      return res.data
    },
  },

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
    progreso: async (pacienteId: string): Promise<ProgresoObesidad> => {
      const res = await apiClient.get<ProgresoObesidad>(`${BASE}/mediciones/progreso/`, { params: { paciente: pacienteId } })
      return res.data
    },
  },

  laboratorios: {
    list: async (pacienteId: string, tipo?: TipoLaboratorio): Promise<Paginated<ResultadoLaboratorio>> => {
      const params: Record<string, string> = { paciente: pacienteId }
      if (tipo) params.tipo = tipo
      const res = await apiClient.get<Paginated<ResultadoLaboratorio>>(`${BASE}/laboratorios/`, { params })
      return res.data
    },
    create: async (data: ResultadoLaboratorioInput): Promise<ResultadoLaboratorio> => {
      const form = new FormData()
      form.append('paciente', data.paciente)
      form.append('fecha', data.fecha)
      form.append('tipo', data.tipo)
      if (data.archivo) form.append('archivo', data.archivo)
      if (data.valores)      form.append('valores', JSON.stringify(data.valores))
      if (data.observaciones) form.append('observaciones', data.observaciones)
      const res = await apiClient.post<ResultadoLaboratorio>(`${BASE}/laboratorios/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    update: async (id: string, data: Partial<Omit<ResultadoLaboratorioInput, 'paciente'>>): Promise<ResultadoLaboratorio> => {
      const res = await apiClient.patch<ResultadoLaboratorio>(`${BASE}/laboratorios/${id}/`, data)
      return res.data
    },
  },

  farmacologico: {
    list: async (pacienteId: string, soloVigentes = false): Promise<Paginated<TratamientoFarmacologico>> => {
      const params: Record<string, string> = { paciente: pacienteId }
      if (soloVigentes) params.vigente = 'true'
      const res = await apiClient.get<Paginated<TratamientoFarmacologico>>(`${BASE}/farmacologico/`, { params })
      return res.data
    },
    create: async (data: TratamientoFarmacologicoInput): Promise<TratamientoFarmacologico> => {
      const res = await apiClient.post<TratamientoFarmacologico>(`${BASE}/farmacologico/`, data)
      return res.data
    },
    update: async (id: string, data: Partial<TratamientoFarmacologicoInput>): Promise<TratamientoFarmacologico> => {
      const res = await apiClient.patch<TratamientoFarmacologico>(`${BASE}/farmacologico/${id}/`, data)
      return res.data
    },
  },
}

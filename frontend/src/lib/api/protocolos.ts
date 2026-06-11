import { apiClient } from './client'
import type {
  TratamientoPaciente, SesionProcedimiento, SesionEjecutada,
  MarcarCompletadoRequest, MarcarCompletadaRequest,
  IniciarCheckinResponse, VerificarOtpRequest,
  ConsentimientoPaciente, ConsentimientosSesionResponse,
  RegistrarConsentimientoRequest,
} from '@/types/protocolos'
import type { Paginated } from '@/types/common'

export const protocolosApi = {
  tratamientos: {
    list: async (params?: { paciente?: string; estado?: string }): Promise<TratamientoPaciente[]> => {
      const res = await apiClient.get<Paginated<TratamientoPaciente> | TratamientoPaciente[]>('/protocolos/tratamientos/', { params })
      return Array.isArray(res.data) ? res.data : res.data.results
    },

    get: async (id: string): Promise<TratamientoPaciente> => {
      const res = await apiClient.get<TratamientoPaciente>(`/protocolos/tratamientos/${id}/`)
      return res.data
    },

    pdf: (id: string): string => `/protocolos/tratamientos/${id}/pdf/`,
  },

  /** @deprecated — usar sesionesEjecutadas (H27) */
  sesiones: {
    marcarCompletado: async (id: string, data?: MarcarCompletadoRequest): Promise<SesionProcedimiento> => {
      const res = await apiClient.post<SesionProcedimiento>(`/protocolos/sesiones/${id}/marcar_completado/`, data ?? {})
      return res.data
    },

    marcarInasistencia: async (id: string, observaciones?: string): Promise<SesionProcedimiento> => {
      const res = await apiClient.post<SesionProcedimiento>(`/protocolos/sesiones/${id}/marcar_inasistencia/`, { observaciones: observaciones ?? '' })
      return res.data
    },

    iniciarCheckin: async (id: string): Promise<IniciarCheckinResponse> => {
      const res = await apiClient.post<IniciarCheckinResponse>(`/protocolos/sesiones/${id}/iniciar_checkin/`)
      return res.data
    },

    verificarOtp: async (id: string, data: VerificarOtpRequest): Promise<SesionProcedimiento> => {
      const res = await apiClient.post<SesionProcedimiento>(`/protocolos/sesiones/${id}/verificar_otp/`, data)
      return res.data
    },

    checkinFoto: async (id: string, foto: File): Promise<SesionProcedimiento> => {
      const form = new FormData()
      form.append('foto', foto)
      const res = await apiClient.post<SesionProcedimiento>(`/protocolos/sesiones/${id}/checkin_foto/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
  },

  // ── H27: SesionesEjecutadas ───────────────────────────────────
  sesionesEjecutadas: {
    marcarCompletada: async (id: string, data: MarcarCompletadaRequest): Promise<SesionEjecutada> => {
      const res = await apiClient.post<SesionEjecutada>(`/protocolos/sesiones/${id}/marcar_completada/`, data)
      return res.data
    },

    marcarInasistencia: async (id: string, observaciones?: string): Promise<SesionEjecutada> => {
      const res = await apiClient.post<SesionEjecutada>(`/protocolos/sesiones/${id}/marcar_inasistencia/`, { observaciones: observaciones ?? '' })
      return res.data
    },

    iniciarCheckin: async (id: string): Promise<IniciarCheckinResponse> => {
      const res = await apiClient.post<IniciarCheckinResponse>(`/protocolos/sesiones/${id}/iniciar_checkin/`)
      return res.data
    },

    verificarOtp: async (id: string, data: VerificarOtpRequest): Promise<SesionEjecutada> => {
      const res = await apiClient.post<SesionEjecutada>(`/protocolos/sesiones/${id}/verificar_otp/`, data)
      return res.data
    },

    getConsentimientos: async (id: string): Promise<ConsentimientosSesionResponse> => {
      const res = await apiClient.get<ConsentimientosSesionResponse>(`/protocolos/sesiones/${id}/consentimientos/`)
      return res.data
    },
  },

  // ── H28: Consentimientos del paciente ─────────────────────────
  consentimientos: {
    list: async (pacienteId: string): Promise<ConsentimientoPaciente[]> => {
      const res = await apiClient.get<ConsentimientoPaciente[]>(`/pacientes/${pacienteId}/consentimientos/`)
      return res.data
    },

    verificar: async (pacienteId: string, tratamientoId: string): Promise<{ template_nombre: string; procedimiento: string; estado: string }[]> => {
      const res = await apiClient.get(`/pacientes/${pacienteId}/consentimientos/verificar/`, { params: { tratamiento: tratamientoId } })
      return res.data
    },

    registrar: async (pacienteId: string, data: RegistrarConsentimientoRequest): Promise<ConsentimientoPaciente> => {
      const res = await apiClient.post<ConsentimientoPaciente>(`/pacientes/${pacienteId}/consentimientos/`, data)
      return res.data
    },

    subirPdf: async (pacienteId: string, consentimientoId: string, archivo: File): Promise<ConsentimientoPaciente> => {
      const form = new FormData()
      form.append('archivo', archivo)
      const res = await apiClient.post<ConsentimientoPaciente>(
        `/pacientes/${pacienteId}/consentimientos/${consentimientoId}/subir_pdf/`, form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return res.data
    },
  },
}

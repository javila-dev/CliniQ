import { apiClient } from './client'
import type { Cita, CreateCitaRequest, CambiarEstadoRequest, Bloqueo, RegistroConfirmacion, RecordatorioPendiente } from '@/types/agenda'
import type { Paginated } from '@/types/common'

type SlotsBase = { profesional_id: string; sede_id: string; fecha: string }
export type SlotsParams =
  | (SlotsBase & { servicio_id: string })
  | (SlotsBase & { item_cotizacion_id: string })
  | (SlotsBase & { duracion_min: number })

export interface CitasFilter {
  estado?: string
  estado_confirmacion?: string
  profesional?: string
  sede?: string
  paciente?: string
  fecha_inicio__date?: string
  fecha_inicio__date__gte?: string
  fecha_inicio__date__lte?: string
  canal_origen?: string
  search?: string
  page?: number
  page_size?: number
}

export const agendaApi = {
  citas: {
    list: async (params?: CitasFilter): Promise<Paginated<Cita>> => {
      const res = await apiClient.get<Paginated<Cita>>('/agenda/citas/', { params })
      return res.data
    },
    get: async (id: string): Promise<Cita> => {
      const res = await apiClient.get<Cita>(`/agenda/citas/${id}/`)
      return res.data
    },
    hoy: async (): Promise<Cita[]> => {
      const res = await apiClient.get<Cita[]>('/agenda/citas/hoy/')
      return res.data
    },
    create: async (data: CreateCitaRequest): Promise<Cita> => {
      const res = await apiClient.post<Cita>('/agenda/citas/', data)
      return res.data
    },
    update: async (id: string, data: Partial<CreateCitaRequest>): Promise<Cita> => {
      const res = await apiClient.patch<Cita>(`/agenda/citas/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/agenda/citas/${id}/`)
    },
    cambiarEstado: async (id: string, data: CambiarEstadoRequest): Promise<Cita> => {
      const res = await apiClient.post<Cita>(`/agenda/citas/${id}/cambiar_estado/`, data)
      return res.data
    },
    confirmarManual: async (id: string, data?: { medio?: string; nota?: string }): Promise<Cita> => {
      const res = await apiClient.patch<Cita>(`/agenda/citas/${id}/confirmar_manual/`, data ?? {})
      return res.data
    },
    registrosConfirmacion: async (id: string): Promise<RegistroConfirmacion[]> => {
      const res = await apiClient.get<RegistroConfirmacion[]>(`/agenda/citas/${id}/registros_confirmacion/`)
      return res.data
    },
    slotsDisponibles: async (params: SlotsParams): Promise<string[]> => {
      const res = await apiClient.get<string[]>('/agenda/citas/slots_disponibles/', { params })
      return res.data
    },
    solicitarRecordatorio: async (id: string): Promise<Cita> => {
      const res = await apiClient.post<Cita>(`/agenda/citas/${id}/solicitar_recordatorio/`)
      return res.data
    },
    enviarRecordatorioInmediato: async (id: string): Promise<Cita> => {
      const res = await apiClient.post<Cita>(`/agenda/citas/${id}/enviar_recordatorio_inmediato/`)
      return res.data
    },
    recordatoriosPendientes: async (): Promise<RecordatorioPendiente[]> => {
      const res = await apiClient.get<RecordatorioPendiente[]>('/agenda/citas/recordatorios_pendientes/')
      return res.data
    },
    marcarRecordatorioEnviado: async (id: string): Promise<Cita> => {
      const res = await apiClient.post<Cita>(`/agenda/citas/${id}/marcar_recordatorio_enviado/`)
      return res.data
    },
    iniciarCheckin: async (id: string): Promise<{ otp_enviado: boolean; otp_activo?: boolean; expira_en?: string; telefono_enmascarado?: string }> => {
      const res = await apiClient.post<{ otp_enviado: boolean; otp_activo?: boolean; expira_en?: string; telefono_enmascarado?: string }>(`/agenda/citas/${id}/iniciar_checkin/`)
      return res.data
    },
    verificarOtp: async (id: string, data: { codigo: string }): Promise<{ ok: boolean }> => {
      const res = await apiClient.post<{ ok: boolean }>(`/agenda/citas/${id}/verificar_otp/`, data)
      return res.data
    },
    checkinFoto: async (id: string, foto: File): Promise<{ ok: boolean }> => {
      const form = new FormData()
      form.append('foto', foto)
      const res = await apiClient.post<{ ok: boolean }>(`/agenda/citas/${id}/checkin_foto/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
  },

  bloqueos: {
    list: async (): Promise<Paginated<Bloqueo>> => {
      const res = await apiClient.get<Paginated<Bloqueo>>('/agenda/bloqueos/')
      return res.data
    },
    create: async (data: Omit<Bloqueo, 'id'>): Promise<Bloqueo> => {
      const res = await apiClient.post<Bloqueo>('/agenda/bloqueos/', data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/agenda/bloqueos/${id}/`)
    },
  },
}

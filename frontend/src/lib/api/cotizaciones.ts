import { apiClient } from './client'
import type { Cotizacion, CotizacionEnvio, CreateCotizacionRequest, EstadoCotizacion, HistorialSesionesCotizacion, PreciosCampanaMap, SesionesCotizacion } from '@/types/cotizaciones'
import type { Consentimiento } from '@/types/consentimientos'
import type { Paginated } from '@/types/common'

export interface CambiarEstadoResponse extends Cotizacion {
  consentimientos_pendientes?: Array<{ procedimiento: string; template_token: string; template_nombre: string }>
  compromiso_pago?: Consentimiento | null
}

export const cotizacionesApi = {
  list: async (params?: {
    estado?: EstadoCotizacion
    paciente?: string
    search?: string
    fecha_desde?: string
    fecha_hasta?: string
    page?: number
  }): Promise<Paginated<Cotizacion>> => {
    const res = await apiClient.get<Paginated<Cotizacion>>('/cotizaciones/', { params })
    return res.data
  },

  get: async (id: string): Promise<Cotizacion> => {
    const res = await apiClient.get<Cotizacion>(`/cotizaciones/${id}/`)
    return res.data
  },

  // Precios de campaña vigentes indexados por id de catálogo, para el formulario
  // (el backend solo calcula precio_campana_disponible sobre ítems ya guardados).
  preciosCampana: async (sede?: string | null): Promise<PreciosCampanaMap> => {
    const res = await apiClient.get<PreciosCampanaMap>('/cotizaciones/precios_campana/', {
      params: sede ? { sede } : undefined,
    })
    return res.data
  },

  create: async (data: CreateCotizacionRequest): Promise<Cotizacion> => {
    const res = await apiClient.post<Cotizacion>('/cotizaciones/', data)
    return res.data
  },

  patch: async (id: string, data: Partial<CreateCotizacionRequest>): Promise<Cotizacion> => {
    const res = await apiClient.patch<Cotizacion>(`/cotizaciones/${id}/`, data)
    return res.data
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/cotizaciones/${id}/`)
  },

  cambiarEstado: async (id: string, estado: EstadoCotizacion): Promise<CambiarEstadoResponse> => {
    const res = await apiClient.post<CambiarEstadoResponse>(`/cotizaciones/${id}/cambiar_estado/`, { estado })
    return res.data
  },

  pdfUrl: (id: string): string => `/cotizaciones/${id}/pdf/`,

  descargarPdf: async (id: string): Promise<Blob> => {
    const res = await apiClient.get(`/cotizaciones/${id}/pdf/`, { responseType: 'blob' })
    return res.data as Blob
  },

  sesiones: async (id: string): Promise<SesionesCotizacion> => {
    const res = await apiClient.get<SesionesCotizacion>(`/cotizaciones/${id}/sesiones/`)
    return res.data
  },

  historialSesiones: async (id: string): Promise<HistorialSesionesCotizacion> => {
    const res = await apiClient.get<HistorialSesionesCotizacion>(`/cotizaciones/${id}/historial_sesiones/`)
    return res.data
  },

  descargarConsolidadoAsistencia: async (id: string): Promise<Blob> => {
    const res = await apiClient.get(`/cotizaciones/${id}/consolidado_asistencia/`, { responseType: 'blob' })
    return res.data as Blob
  },

  enviarWhatsapp: async (id: string): Promise<{ enviado: boolean; envio_id?: string }> => {
    const res = await apiClient.post<{ enviado: boolean; envio_id?: string }>(`/cotizaciones/${id}/enviar_whatsapp/`)
    return res.data
  },

  enviarEmail: async (id: string, body: { destinatario?: string; notas?: string }): Promise<{ enviado: boolean; envio_id?: string }> => {
    const res = await apiClient.post<{ enviado: boolean; envio_id?: string }>(`/cotizaciones/${id}/enviar_email/`, body)
    return res.data
  },

  registrarEnvioPdf: async (id: string): Promise<CotizacionEnvio> => {
    const res = await apiClient.post<CotizacionEnvio>(`/cotizaciones/${id}/registrar_envio/`, { canal: 'pdf' })
    return res.data
  },

  getEnvios: async (id: string): Promise<CotizacionEnvio[]> => {
    const res = await apiClient.get<CotizacionEnvio[]>(`/cotizaciones/${id}/envios/`)
    return res.data
  },

}

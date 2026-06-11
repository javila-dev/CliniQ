import { apiClient } from './client'
import type { Cotizacion, CotizacionEnvio, CreateCotizacionRequest, EstadoCotizacion, SesionesCotizacion } from '@/types/cotizaciones'
import type { Paginated } from '@/types/common'

export const cotizacionesApi = {
  list: async (params?: { estado?: EstadoCotizacion; paciente?: string; search?: string }): Promise<Paginated<Cotizacion>> => {
    const res = await apiClient.get<Paginated<Cotizacion>>('/cotizaciones/', { params })
    return res.data
  },

  get: async (id: string): Promise<Cotizacion> => {
    const res = await apiClient.get<Cotizacion>(`/cotizaciones/${id}/`)
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

  cambiarEstado: async (id: string, estado: EstadoCotizacion): Promise<Cotizacion> => {
    const res = await apiClient.post<Cotizacion>(`/cotizaciones/${id}/cambiar_estado/`, { estado })
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

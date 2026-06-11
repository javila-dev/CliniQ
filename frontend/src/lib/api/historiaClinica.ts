import { apiClient } from './client'
import type {
  HistoriaClinica,
  NotaClinica,
  FotoClinica,
  GaleriaResponse,
  AntecedentePaciente,
  AntecedentePacienteUpdate,
  ResumenConsentimiento,
  ConsentimientoInformado,
  ResultadoExamen,
  PlantillaOrden,
  OrdenMedica,
} from '@/types/historia'
import type { Paginated } from '@/types/common'

export const historiaClinicaApi = {
  historias: {
    list: async (params?: { search?: string; paciente?: string }): Promise<Paginated<HistoriaClinica>> => {
      const res = await apiClient.get<Paginated<HistoriaClinica>>('/historia-clinica/historias/', { params })
      return res.data
    },
    get: async (id: string): Promise<HistoriaClinica> => {
      const res = await apiClient.get<HistoriaClinica>(`/historia-clinica/historias/${id}/`)
      return res.data
    },
    patch: async (id: string, data: Partial<Pick<HistoriaClinica, 'motivo_consulta' | 'plan_manejo'>>): Promise<HistoriaClinica> => {
      const res = await apiClient.patch<HistoriaClinica>(`/historia-clinica/historias/${id}/`, data)
      return res.data
    },
    notas: async (id: string): Promise<NotaClinica[]> => {
      const res = await apiClient.get<NotaClinica[]>(`/historia-clinica/historias/${id}/notas/`)
      return res.data
    },
    galeria: async (id: string, params?: { zona?: string; tipo?: string; cita?: string }): Promise<GaleriaResponse> => {
      const res = await apiClient.get<GaleriaResponse>(`/historia-clinica/historias/${id}/galeria/`, { params })
      return res.data
    },
  },

  notas: {
    list: async (): Promise<Paginated<NotaClinica>> => {
      const res = await apiClient.get<Paginated<NotaClinica>>('/historia-clinica/notas/')
      return res.data
    },
    // Legacy: usado por NuevaNotaForm hasta migración completa a H26
    create: async (data: Record<string, unknown>): Promise<NotaClinica> => {
      const res = await apiClient.post<NotaClinica>('/historia-clinica/notas/', data)
      return res.data
    },
    // H26: retorna el borrador existente para la cita, o crea uno nuevo
    createBorrador: async (historiaId: string, citaId: string): Promise<NotaClinica> => {
      const notasRes = await apiClient.get<NotaClinica[]>(`/historia-clinica/historias/${historiaId}/notas/`)
      const existente = notasRes.data.find((n) => n.cita === citaId && n.estado === 'borrador')
      if (existente) return existente
      const res = await apiClient.post<NotaClinica>('/historia-clinica/notas/', {
        historia: historiaId,
        cita: citaId,
      })
      return res.data
    },
    // H26: auto-save parcial de campos de la nota
    patch: async (
      id: string,
      data: Partial<Pick<NotaClinica, 'motivo_consulta' | 'plan_manejo'>>,
    ): Promise<NotaClinica> => {
      const res = await apiClient.patch<NotaClinica>(`/historia-clinica/notas/${id}/`, data)
      return res.data
    },
    // H26: finaliza la nota al completar la atención
    completar: async (id: string): Promise<NotaClinica> => {
      const res = await apiClient.post<NotaClinica>(`/historia-clinica/notas/${id}/completar/`, {})
      return res.data
    },
  },

  fotos: {
    create: async (data: FormData): Promise<FotoClinica> => {
      const res = await apiClient.post<FotoClinica>('/historia-clinica/fotos/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/historia-clinica/fotos/${id}/`)
    },
  },

  antecedentes: {
    get: async (pacienteId: string): Promise<AntecedentePaciente | null> => {
      try {
        const res = await apiClient.get<AntecedentePaciente>(`/pacientes/${pacienteId}/antecedentes/`)
        return res.data
      } catch (err: any) {
        if (err?.response?.status === 404) return null
        throw err
      }
    },
    upsert: async (pacienteId: string, data: AntecedentePacienteUpdate): Promise<AntecedentePaciente> => {
      const res = await apiClient.put<AntecedentePaciente>(`/pacientes/${pacienteId}/antecedentes/`, data)
      return res.data
    },
    patch: async (pacienteId: string, data: Partial<AntecedentePacienteUpdate>): Promise<AntecedentePaciente> => {
      const res = await apiClient.patch<AntecedentePaciente>(`/pacientes/${pacienteId}/antecedentes/`, data)
      return res.data
    },
  },

  consentimientosInformados: {
    resumen: async (pacienteId: string): Promise<ResumenConsentimiento[]> => {
      const res = await apiClient.get<ResumenConsentimiento[]>(`/historia-clinica/consentimientos/resumen/`, {
        params: { paciente: pacienteId },
      })
      return res.data
    },
    list: async (pacienteId: string): Promise<ConsentimientoInformado[]> => {
      const res = await apiClient.get<ConsentimientoInformado[] | { results: ConsentimientoInformado[] }>(
        `/historia-clinica/consentimientos/`,
        { params: { paciente: pacienteId } }
      )
      return Array.isArray(res.data) ? res.data : res.data.results
    },
    create: async (data: { paciente: string; documenso_template_token: string; documenso_template_nombre: string; vigencia_meses?: number; notas?: string }): Promise<ConsentimientoInformado> => {
      const res = await apiClient.post<ConsentimientoInformado>(`/historia-clinica/consentimientos/`, data)
      return res.data
    },
    update: async (id: string, data: FormData | Record<string, unknown>): Promise<ConsentimientoInformado> => {
      const isFormData = data instanceof FormData
      const res = await apiClient.patch<ConsentimientoInformado>(`/historia-clinica/consentimientos/${id}/`, data, {
        headers: isFormData ? { 'Content-Type': 'multipart/form-data' } : {},
      })
      return res.data
    },
    iniciarFirma: async (id: string): Promise<{ signing_token: string; documenso_document_id: string }> => {
      const res = await apiClient.post<{ signing_token: string; documenso_document_id: string }>(
        `/historia-clinica/consentimientos/${id}/iniciar_firma/`,
        {}
      )
      return res.data
    },
    completarFirma: async (id: string, documenso_document_id: string): Promise<ConsentimientoInformado> => {
      const res = await apiClient.patch<ConsentimientoInformado>(
        `/historia-clinica/consentimientos/${id}/completar_firma/`,
        { documenso_document_id }
      )
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/historia-clinica/consentimientos/${id}/`)
    },
  },

  resultadosExamenes: {
    list: async (historiaId: string): Promise<ResultadoExamen[]> => {
      const res = await apiClient.get<ResultadoExamen[] | Paginated<ResultadoExamen>>('/historia-clinica/resultados-examenes/', {
        params: { historia: historiaId },
      })
      return Array.isArray(res.data) ? res.data : res.data.results
    },
    create: async (data: FormData, notaId?: string): Promise<ResultadoExamen> => {
      if (notaId) data.append('nota', notaId)
      const res = await apiClient.post<ResultadoExamen>('/historia-clinica/resultados-examenes/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    patch: async (id: string, data: Partial<Pick<ResultadoExamen, 'titulo' | 'descripcion' | 'fecha'>>): Promise<ResultadoExamen> => {
      const res = await apiClient.patch<ResultadoExamen>(`/historia-clinica/resultados-examenes/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/historia-clinica/resultados-examenes/${id}/`)
    },
  },

  plantillasOrdenes: {
    list: async (): Promise<PlantillaOrden[]> => {
      const res = await apiClient.get<PlantillaOrden[]>('/historia-clinica/plantillas-ordenes/', {
        params: { activa: true },
      })
      return Array.isArray(res.data) ? res.data : (res.data as any).results ?? []
    },
    listAll: async (): Promise<PlantillaOrden[]> => {
      const res = await apiClient.get<PlantillaOrden[]>('/historia-clinica/plantillas-ordenes/')
      return Array.isArray(res.data) ? res.data : (res.data as any).results ?? []
    },
    create: async (data: { nombre: string; contenido: string; permite_edicion_profesional: boolean }): Promise<PlantillaOrden> => {
      const res = await apiClient.post<PlantillaOrden>('/historia-clinica/plantillas-ordenes/', data)
      return res.data
    },
    patch: async (id: string, data: Partial<{ nombre: string; contenido: string; permite_edicion_profesional: boolean; activa: boolean }>): Promise<PlantillaOrden> => {
      const res = await apiClient.patch<PlantillaOrden>(`/historia-clinica/plantillas-ordenes/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.patch(`/historia-clinica/plantillas-ordenes/${id}/`, { activa: false })
    },
  },

  ordenesMedicas: {
    list: async (historiaId: string): Promise<OrdenMedica[]> => {
      const res = await apiClient.get<OrdenMedica[]>('/historia-clinica/ordenes-medicas/', {
        params: { historia: historiaId },
      })
      return Array.isArray(res.data) ? res.data : (res.data as any).results ?? []
    },
    create: async (data: { historia: string; contenido: string; cita?: string; nota?: string; plantilla_origen?: string }): Promise<OrdenMedica> => {
      const res = await apiClient.post<OrdenMedica>('/historia-clinica/ordenes-medicas/', data)
      return res.data
    },
    enviarWhatsapp: async (id: string): Promise<{ enviado: boolean }> => {
      const res = await apiClient.post<{ enviado: boolean }>(`/historia-clinica/ordenes-medicas/${id}/enviar_whatsapp/`, {})
      return res.data
    },
    descargarPdf: async (id: string): Promise<Blob> => {
      const res = await apiClient.get(`/historia-clinica/ordenes-medicas/${id}/pdf/`, { responseType: 'blob' })
      return res.data as Blob
    },
  },
}

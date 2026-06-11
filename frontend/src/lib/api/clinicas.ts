import { apiClient } from './client'
import type {
  Clinica, UpdateClinicaRequest, SlotIntervalResponse,
  Sede, CreateSedeRequest, UpdateSedeRequest,
  Servicio, CreateServicioRequest, UpdateServicioRequest,
  Procedimiento, CreateProcedimientoRequest, UpdateProcedimientoRequest,
  PasoProtocolo, ServicioConsentimientoRequerido,
  TratamientoCatalogo, CreateTratamientoCatalogoRequest, TipoSesion, CreateTipoSesionRequest,
  RecordatorioConfig, UpdateRecordatorioConfigRequest,
} from '@/types/clinicas'
import type { Paginated } from '@/types/common'

export const clinicasApi = {
  list: async (): Promise<Clinica[]> => {
    const res = await apiClient.get<Paginated<Clinica>>('/clinicas/clinicas/')
    return res.data.results
  },

  get: async (id: string): Promise<Clinica> => {
    const res = await apiClient.get<Clinica>(`/clinicas/clinicas/${id}/`)
    return res.data
  },

  update: async (id: string, data: UpdateClinicaRequest): Promise<Clinica> => {
    const res = await apiClient.patch<Clinica>(`/clinicas/clinicas/${id}/`, data)
    return res.data
  },

  subirLogo: async (id: string, file: File): Promise<Clinica> => {
    const form = new FormData()
    form.append('logo', file)
    const res = await apiClient.post<Clinica>(`/clinicas/clinicas/${id}/logo/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },

  eliminarLogo: async (id: string): Promise<Clinica> => {
    const res = await apiClient.delete<Clinica>(`/clinicas/clinicas/${id}/logo/`)
    return res.data
  },

  getSlotInterval: async (id: string): Promise<SlotIntervalResponse> => {
    const res = await apiClient.get<SlotIntervalResponse>(`/clinicas/clinicas/${id}/slot_interval/`)
    return res.data
  },

  updateSlotInterval: async (id: string, slot_interval_min: number): Promise<SlotIntervalResponse> => {
    const res = await apiClient.patch<SlotIntervalResponse>(`/clinicas/clinicas/${id}/slot_interval/`, { slot_interval_min })
    return res.data
  },

  sedes: {
    list: async (params?: { activa?: boolean; ciudad?: string; search?: string }): Promise<Paginated<Sede>> => {
      const res = await apiClient.get<Paginated<Sede>>('/clinicas/sedes/', { params })
      return res.data
    },
    get: async (id: string): Promise<Sede> => {
      const res = await apiClient.get<Sede>(`/clinicas/sedes/${id}/`)
      return res.data
    },
    create: async (data: CreateSedeRequest): Promise<Sede> => {
      const res = await apiClient.post<Sede>('/clinicas/sedes/', data)
      return res.data
    },
    update: async (id: string, data: UpdateSedeRequest): Promise<Sede> => {
      const res = await apiClient.patch<Sede>(`/clinicas/sedes/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/sedes/${id}/`)
    },
  },

  /** Catálogo de procedimientos (H26) — usa /clinicas/procedimientos/ */
  procedimientos: {
    list: async (params?: { activo?: boolean; search?: string }): Promise<Paginated<Procedimiento>> => {
      const res = await apiClient.get<Paginated<Procedimiento>>('/clinicas/procedimientos/', { params })
      return res.data
    },
    activos: async (): Promise<Procedimiento[]> => {
      const res = await apiClient.get<Procedimiento[]>('/clinicas/procedimientos/activos/')
      return res.data
    },
    get: async (id: string): Promise<Procedimiento> => {
      const res = await apiClient.get<Procedimiento>(`/clinicas/procedimientos/${id}/`)
      return res.data
    },
    create: async (data: CreateProcedimientoRequest): Promise<Procedimiento> => {
      const res = await apiClient.post<Procedimiento>('/clinicas/procedimientos/', data)
      return res.data
    },
    update: async (id: string, data: UpdateProcedimientoRequest): Promise<Procedimiento> => {
      const res = await apiClient.patch<Procedimiento>(`/clinicas/procedimientos/${id}/`, data)
      return res.data
    },
    pasos: {
      list: async (id: string): Promise<PasoProtocolo[]> => {
        const res = await apiClient.get<PasoProtocolo[]>(`/clinicas/procedimientos/${id}/pasos/`)
        return res.data
      },
      create: async (id: string, data: { nombre: string; semana?: number | null; es_control?: boolean; cantidad?: number }): Promise<PasoProtocolo> => {
        const res = await apiClient.post<PasoProtocolo>(`/clinicas/procedimientos/${id}/pasos/`, data)
        return res.data
      },
      update: async (id: string, pasoId: string, data: Partial<Pick<PasoProtocolo, 'nombre' | 'semana' | 'es_control' | 'cantidad' | 'activo'>>): Promise<PasoProtocolo> => {
        const res = await apiClient.patch<PasoProtocolo>(`/clinicas/procedimientos/${id}/pasos/${pasoId}/`, data)
        return res.data
      },
      delete: async (id: string, pasoId: string): Promise<void> => {
        await apiClient.delete(`/clinicas/procedimientos/${id}/pasos/${pasoId}/`)
      },
      reordenar: async (id: string, orden: { id: string; orden: number }[]): Promise<void> => {
        await apiClient.post(`/clinicas/procedimientos/${id}/pasos/reordenar/`, orden)
      },
    },
    consentimientos: {
      list: async (id: string): Promise<ServicioConsentimientoRequerido[]> => {
        const res = await apiClient.get<ServicioConsentimientoRequerido[]>(`/clinicas/procedimientos/${id}/consentimientos/`)
        return res.data
      },
      add: async (id: string, templateId: string, orden?: number): Promise<ServicioConsentimientoRequerido> => {
        const res = await apiClient.post<ServicioConsentimientoRequerido>(`/clinicas/procedimientos/${id}/consentimientos/`, { template_id: templateId, orden: orden ?? 1 })
        return res.data
      },
      remove: async (id: string, consentimientoId: string): Promise<void> => {
        await apiClient.delete(`/clinicas/procedimientos/${id}/consentimientos/${consentimientoId}/`)
      },
      reordenar: async (id: string, orden: { id: string; orden: number }[]): Promise<void> => {
        await apiClient.post(`/clinicas/procedimientos/${id}/consentimientos/reordenar/`, orden)
      },
    },
  },

  /** @deprecated Usar clinicasApi.procedimientos para la UI de configuración */
  servicios: {
    list: async (params?: { activo?: boolean; clinica?: string; search?: string }): Promise<Paginated<Servicio>> => {
      const res = await apiClient.get<Paginated<Servicio>>('/clinicas/servicios/', { params })
      return res.data
    },
    activos: async (clinicaId?: string): Promise<Servicio[]> => {
      const params = clinicaId ? { clinica: clinicaId } : undefined
      const res = await apiClient.get<Servicio[]>('/clinicas/servicios/activos/', { params })
      return res.data
    },
    get: async (id: string): Promise<Servicio> => {
      const res = await apiClient.get<Servicio>(`/clinicas/servicios/${id}/`)
      return res.data
    },
    create: async (data: CreateServicioRequest): Promise<Servicio> => {
      const res = await apiClient.post<Servicio>('/clinicas/servicios/', data)
      return res.data
    },
    update: async (id: string, data: UpdateServicioRequest): Promise<Servicio> => {
      const res = await apiClient.patch<Servicio>(`/clinicas/servicios/${id}/`, data)
      return res.data
    },
  },

  pasosProtocolo: {
    list: async (servicioId: string): Promise<PasoProtocolo[]> => {
      const res = await apiClient.get<PasoProtocolo[]>(`/clinicas/servicios/${servicioId}/pasos/`)
      return res.data
    },
    create: async (servicioId: string, data: { nombre: string; semana?: number | null; es_control?: boolean; cantidad?: number }): Promise<PasoProtocolo> => {
      const res = await apiClient.post<PasoProtocolo>(`/clinicas/servicios/${servicioId}/pasos/`, data)
      return res.data
    },
    update: async (servicioId: string, pasoId: string, data: Partial<Pick<PasoProtocolo, 'nombre' | 'semana' | 'es_control' | 'cantidad' | 'activo'>>): Promise<PasoProtocolo> => {
      const res = await apiClient.patch<PasoProtocolo>(`/clinicas/servicios/${servicioId}/pasos/${pasoId}/`, data)
      return res.data
    },
    delete: async (servicioId: string, pasoId: string): Promise<void> => {
      await apiClient.delete(`/clinicas/servicios/${servicioId}/pasos/${pasoId}/`)
    },
    reordenar: async (servicioId: string, orden: { id: string; orden: number }[]): Promise<void> => {
      await apiClient.post(`/clinicas/servicios/${servicioId}/pasos/reordenar/`, orden)
    },
  },

  consentimientosServicio: {
    list: async (servicioId: string): Promise<ServicioConsentimientoRequerido[]> => {
      const res = await apiClient.get<ServicioConsentimientoRequerido[]>(`/clinicas/servicios/${servicioId}/consentimientos/`)
      return res.data
    },
    add: async (servicioId: string, templateId: string, orden?: number): Promise<ServicioConsentimientoRequerido> => {
      const res = await apiClient.post<ServicioConsentimientoRequerido>(`/clinicas/servicios/${servicioId}/consentimientos/`, { template_id: templateId, orden: orden ?? 1 })
      return res.data
    },
    remove: async (servicioId: string, consentimientoId: string): Promise<void> => {
      await apiClient.delete(`/clinicas/servicios/${servicioId}/consentimientos/${consentimientoId}/`)
    },
    reordenar: async (servicioId: string, orden: { id: string; orden: number }[]): Promise<void> => {
      await apiClient.post(`/clinicas/servicios/${servicioId}/consentimientos/reordenar/`, orden)
    },
  },

  getMiPlan: async (): Promise<import('@/types/usuarios').PlanLimite> => {
    const res = await apiClient.get<{
      plan: { max_usuarios: number } | null
      usuarios_activos: number
      puede_agregar: boolean
      slots_disponibles: number | null
      sin_limite: boolean
    }>('/clinicas/mi-clinica/plan/')
    return {
      max_usuarios: res.data.plan?.max_usuarios ?? null,
      usuarios_activos: res.data.usuarios_activos,
      puede_agregar: res.data.puede_agregar,
      slots_disponibles: res.data.slots_disponibles,
      sin_limite: res.data.sin_limite,
    }
  },

  recordatorioConfig: {
    get: async (clinicaId: string): Promise<RecordatorioConfig> => {
      const res = await apiClient.get<RecordatorioConfig>(`/clinicas/${clinicaId}/recordatorio_config/`)
      return res.data
    },
    update: async (clinicaId: string, data: UpdateRecordatorioConfigRequest): Promise<RecordatorioConfig> => {
      const res = await apiClient.patch<RecordatorioConfig>(`/clinicas/${clinicaId}/recordatorio_config/`, data)
      return res.data
    },
  },

  tratamientos: {
    list: async (params?: { activo?: boolean; search?: string }): Promise<Paginated<TratamientoCatalogo>> => {
      const res = await apiClient.get<Paginated<TratamientoCatalogo>>('/clinicas/tratamientos/', { params })
      return res.data
    },

    activos: async (): Promise<TratamientoCatalogo[]> => {
      const res = await apiClient.get<TratamientoCatalogo[]>('/clinicas/tratamientos/activos/')
      return res.data
    },

    get: async (id: string): Promise<TratamientoCatalogo> => {
      const res = await apiClient.get<TratamientoCatalogo>(`/clinicas/tratamientos/${id}/`)
      return res.data
    },

    create: async (data: CreateTratamientoCatalogoRequest): Promise<TratamientoCatalogo> => {
      const res = await apiClient.post<TratamientoCatalogo>('/clinicas/tratamientos/', data)
      return res.data
    },

    update: async (id: string, data: Partial<CreateTratamientoCatalogoRequest> & { activo?: boolean }): Promise<TratamientoCatalogo> => {
      const res = await apiClient.patch<TratamientoCatalogo>(`/clinicas/tratamientos/${id}/`, data)
      return res.data
    },

    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/tratamientos/${id}/`)
    },

    addTipo: async (id: string, data: CreateTipoSesionRequest): Promise<TratamientoCatalogo> => {
      const res = await apiClient.post<TratamientoCatalogo>(`/clinicas/tratamientos/${id}/tipos/`, data)
      return res.data
    },

    updateTipo: async (id: string, tipoId: string, data: Partial<CreateTipoSesionRequest>): Promise<TipoSesion> => {
      const res = await apiClient.patch<TipoSesion>(`/clinicas/tratamientos/${id}/tipos/${tipoId}/`, data)
      return res.data
    },

    removeTipo: async (id: string, tipoId: string): Promise<void> => {
      await apiClient.delete(`/clinicas/tratamientos/${id}/tipos/${tipoId}/`)
    },
  },
}

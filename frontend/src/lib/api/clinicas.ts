import axios from 'axios'
import { apiClient } from './client'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

export interface RegistroClinicaRequest {
  nombre_clinica: string
  nit: string
  nombre_admin: string
  apellido_admin: string
  email: string
  telefono?: string
}

export interface PlanPublico {
  id: string
  nombre: string
  descripcion: string | null
  precio: string | null
  max_usuarios: number
  max_sedes: number
  precio_usuario_adicional: string | null
  precio_sede_adicional: string | null
  facial_verificacion_habilitada: boolean
  modulo_estetico_habilitado: boolean
  modulo_obesidad_habilitado: boolean
  whatsapp_habilitado: boolean
  whatsapp_envios_incluidos: number  // 0 = sin límite
}

export const registroPublicoApi = {
  registrarClinica: async (data: RegistroClinicaRequest): Promise<{ mensaje: string; email: string }> => {
    const res = await axios.post(`${BASE_URL}/registro-clinica/`, data)
    return res.data
  },

  verificarRegistro: async (token: string): Promise<{ ok: boolean; invite_token?: string; error?: string }> => {
    const res = await axios.get(`${BASE_URL}/registro-clinica/verificar/${token}/`)
    return res.data
  },

  planesPublicos: async (): Promise<PlanPublico[]> => {
    const res = await axios.get(`${BASE_URL}/registro-clinica/planes/`, { timeout: 8000 })
    return res.data
  },
}
import type {
  Clinica, UpdateClinicaRequest, SlotIntervalResponse,
  Sede, CreateSedeRequest, UpdateSedeRequest,
  Servicio, CreateServicioRequest, UpdateServicioRequest,
  Procedimiento, CreateProcedimientoRequest, UpdateProcedimientoRequest,
  PasoProtocolo, ServicioConsentimientoRequerido, ServicioDiagrama, ServicioGrupoZonas,
  TratamientoCatalogo, CreateTratamientoCatalogoRequest, TipoSesion, CreateTipoSesionRequest,
  RecordatorioConfig, UpdateRecordatorioConfigRequest,
  ConfiguracionFacial, UpdateConfiguracionFacialRequest,
  PlantillaAsistencia, CreatePlantillaAsistenciaRequest,
  SedesLimite, WizardConfig, ConfiguracionCartera,
} from '@/types/clinicas'
import type { DiagramaCorporal, GrupoZonas } from '@/types/admin'
import type { Paginated } from '@/types/common'

/** Un paso de "Preparar mi clínica". El estado sale de los datos reales, no se guarda. */
export interface SetupChecklistItem {
  key: string
  label: string
  /** Para qué sirve el paso. */
  por_que: string
  /** Lo que ya está configurado, en una línea. */
  resumen: string
  completado: boolean
  /** Los opcionales no cuentan para el progreso y se pueden omitir. */
  requerido: boolean
  omitido: boolean
  href: string
  /** Texto del botón que resuelve el paso. */
  accion: string
  /** Solo en el paso Equipo: el usuario puede marcarse como profesional con un clic. */
  puede_marcarse_profesional?: boolean
}

export type NivelPreparacion = 'sin_empezar' | 'datos_basicos' | 'lista_para_agendar'

export interface SetupChecklist {
  items: SetupChecklistItem[]
  niveles: { key: Exclude<NivelPreparacion, 'sin_empezar'>; label: string; alcanzado: boolean }[]
  nivel: NivelPreparacion
  completados: number
  total: number
  /** Todos los pasos requeridos están completos. */
  todo_listo: boolean
  modelo: '' | 'procedimientos' | 'tratamientos' | 'ambos'
}

export interface GuardarPreparacionRequest {
  modelo?: 'procedimientos' | 'tratamientos' | 'ambos'
  omitir?: string
  restaurar?: string
}

export interface ProcedimientosSinProfesional {
  procedimientos: { id: string; nombre: string }[]
  total_profesionales: number
}

export const clinicasApi = {
  /** Resumen previo a activar el filtro por procedimiento. */
  procedimientosSinProfesional: async (): Promise<ProcedimientosSinProfesional> => {
    const res = await apiClient.get<ProcedimientosSinProfesional>('/clinicas/mi-clinica/procedimientos-sin-profesional/')
    return res.data
  },

  /** Asigna todos los profesionales activos a los procedimientos que no tienen ninguno. */
  asignarProfesionalesAProcedimientos: async (): Promise<{ procedimientos_actualizados: number; profesionales: number }> => {
    const res = await apiClient.post('/clinicas/mi-clinica/asignar-profesionales-a-procedimientos/')
    return res.data
  },

  setupChecklist: async (): Promise<SetupChecklist> => {
    const res = await apiClient.get<SetupChecklist>('/clinicas/mi-clinica/setup-checklist/')
    return res.data
  },

  /** Guarda qué vende la clínica y los pasos opcionales que se omiten o se restauran. */
  guardarPreparacion: async (data: GuardarPreparacionRequest): Promise<SetupChecklist> => {
    const res = await apiClient.post<SetupChecklist>('/clinicas/mi-clinica/preparacion/', data)
    return res.data
  },

  /** Atajo para quien configura y también atiende pacientes. */
  marcarmeComoProfesional: async (): Promise<SetupChecklist> => {
    const res = await apiClient.post<SetupChecklist>('/clinicas/mi-clinica/preparacion/yo-atiendo/')
    return res.data
  },

  list: async (): Promise<Clinica[]> => {
    const res = await apiClient.get<Paginated<Clinica>>('/clinicas/clinicas/')
    return res.data.results
  },

  get: async (id: string): Promise<Clinica> => {
    const res = await apiClient.get<Clinica>(`/clinicas/clinicas/${id}/`)
    return res.data
  },

  miClinica: async (clinicaId?: string): Promise<Clinica> => {
    const params = clinicaId ? { clinica_id: clinicaId } : undefined
    const res = await apiClient.get<Clinica>('/clinicas/mi-clinica/', { params })
    return res.data
  },

  miClinicaUpdate: async (data: UpdateClinicaRequest): Promise<Clinica> => {
    const res = await apiClient.patch<Clinica>('/clinicas/mi-clinica/', data)
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
    list: async (params?: {
      activo?: boolean
      search?: string
      page?: number
      tiene_consentimiento?: boolean
      tiene_zonas?: boolean
    }): Promise<Paginated<Procedimiento>> => {
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
    /** Falla con 409 (`detail` explica qué lo usa) si el procedimiento está asociado a datos de negocio. */
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/procedimientos/${id}/`)
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
      add: async (id: string, templateId: string, orden?: number, requiereFirmaCadaVez?: boolean): Promise<ServicioConsentimientoRequerido> => {
        const res = await apiClient.post<ServicioConsentimientoRequerido>(`/clinicas/procedimientos/${id}/consentimientos/`, {
          template_id: templateId,
          orden: orden ?? 1,
          requiere_firma_cada_vez: requiereFirmaCadaVez ?? false,
        })
        return res.data
      },
      remove: async (id: string, consentimientoId: string): Promise<void> => {
        await apiClient.delete(`/clinicas/procedimientos/${id}/consentimientos/${consentimientoId}/`)
      },
      reordenar: async (id: string, orden: { id: string; orden: number }[]): Promise<void> => {
        await apiClient.post(`/clinicas/procedimientos/${id}/consentimientos/reordenar/`, orden)
      },
    },
    grupos: {
      list: async (id: string): Promise<ServicioGrupoZonas[]> => {
        const res = await apiClient.get<ServicioGrupoZonas[]>(`/clinicas/procedimientos/${id}/grupos/`)
        return res.data
      },
      add: async (id: string, grupoId: string): Promise<ServicioGrupoZonas> => {
        const res = await apiClient.post<ServicioGrupoZonas>(`/clinicas/procedimientos/${id}/grupos/`, { grupo: grupoId })
        return res.data
      },
      remove: async (id: string, grupoId: string): Promise<void> => {
        await apiClient.delete(`/clinicas/procedimientos/${id}/grupos/${grupoId}/`)
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

  getSedesLimite: async (): Promise<SedesLimite> => {
    const res = await apiClient.get<{
      plan: { max_sedes?: number } | null
      sedes_activas?: number
      puede_agregar_sede?: boolean
      sin_limite_sedes?: boolean
      slots_disponibles_sedes?: number | null
    }>('/clinicas/mi-clinica/plan/')
    const maxSedes = res.data.plan?.max_sedes ?? null
    const sedesActivas = res.data.sedes_activas
    return {
      max_sedes: maxSedes,
      sedes_activas: sedesActivas,
      puede_agregar: res.data.puede_agregar_sede ?? (maxSedes === null || (sedesActivas ?? 0) < maxSedes),
      sin_limite: res.data.sin_limite_sedes ?? maxSedes === null,
    }
  },

  wizardConfig: {
    get: async (): Promise<WizardConfig> => {
      const res = await apiClient.get<WizardConfig>('/configuracion/wizard/')
      return res.data
    },
    update: async (data: Partial<WizardConfig>): Promise<WizardConfig> => {
      const res = await apiClient.patch<WizardConfig>('/configuracion/wizard/', data)
      return res.data
    },
  },

  carteraConfig: {
    get: async (): Promise<ConfiguracionCartera> => {
      const res = await apiClient.get<ConfiguracionCartera>('/configuracion/cartera/')
      return res.data
    },
    update: async (data: Partial<Pick<ConfiguracionCartera, 'requiere_consentimiento_promocional'>>): Promise<ConfiguracionCartera> => {
      const res = await apiClient.patch<ConfiguracionCartera>('/configuracion/cartera/', data)
      return res.data
    },
  },

  facialConfig: {
    get: async (): Promise<ConfiguracionFacial> => {
      const res = await apiClient.get<ConfiguracionFacial>('/configuracion/facial/')
      return res.data
    },
    update: async (data: UpdateConfiguracionFacialRequest): Promise<ConfiguracionFacial> => {
      const res = await apiClient.patch<ConfiguracionFacial>('/configuracion/facial/', data)
      return res.data
    },
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
    list: async (params?: { activo?: boolean; search?: string; page?: number; page_size?: number }): Promise<Paginated<TratamientoCatalogo>> => {
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

  plantillasAsistencia: {
    list: async (): Promise<PlantillaAsistencia[]> => {
      const res = await apiClient.get<PlantillaAsistencia[]>('/clinicas/plantillas-asistencia/')
      return res.data
    },
    create: async (data: CreatePlantillaAsistenciaRequest): Promise<PlantillaAsistencia> => {
      const res = await apiClient.post<PlantillaAsistencia>('/clinicas/plantillas-asistencia/', data)
      return res.data
    },
    update: async (id: string, data: Partial<CreatePlantillaAsistenciaRequest>): Promise<PlantillaAsistencia> => {
      const res = await apiClient.patch<PlantillaAsistencia>(`/clinicas/plantillas-asistencia/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/plantillas-asistencia/${id}/`)
    },
  },

  diagramasCorporales: {
    list: async (): Promise<DiagramaCorporal[]> => {
      const res = await apiClient.get<DiagramaCorporal[]>('/clinicas/diagramas-corporales/')
      return res.data
    },
    create: async (data: FormData): Promise<DiagramaCorporal> => {
      const res = await apiClient.post<DiagramaCorporal>('/clinicas/diagramas-corporales/', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data
    },
    update: async (id: string, data: FormData | Partial<{ nombre: string; orden: number; activo: boolean }>): Promise<DiagramaCorporal> => {
      const res = await apiClient.patch<DiagramaCorporal>(`/clinicas/diagramas-corporales/${id}/`, data,
        data instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined,
      )
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/diagramas-corporales/${id}/`)
    },
  },

  gruposZonas: {
    list: async (): Promise<GrupoZonas[]> => {
      const res = await apiClient.get<GrupoZonas[] | { results: GrupoZonas[] }>('/clinicas/grupos-zonas/')
      return Array.isArray(res.data) ? res.data : (res.data as { results: GrupoZonas[] }).results
    },
    create: async (data: { nombre: string }): Promise<GrupoZonas> => {
      const res = await apiClient.post<GrupoZonas>('/clinicas/grupos-zonas/', data)
      return res.data
    },
    update: async (id: string, data: Partial<{ nombre: string; activo: boolean }>): Promise<GrupoZonas> => {
      const res = await apiClient.patch<GrupoZonas>(`/clinicas/grupos-zonas/${id}/`, data)
      return res.data
    },
    delete: async (id: string): Promise<void> => {
      await apiClient.delete(`/clinicas/grupos-zonas/${id}/`)
    },
    agregarDiagrama: async (id: string, diagramaId: string, orden?: number): Promise<GrupoZonas> => {
      const res = await apiClient.post<GrupoZonas>(`/clinicas/grupos-zonas/${id}/diagramas/`, { diagrama: diagramaId, orden: orden ?? 1 })
      return res.data
    },
    eliminarDiagrama: async (id: string, diagramaId: string): Promise<void> => {
      await apiClient.delete(`/clinicas/grupos-zonas/${id}/diagramas/${diagramaId}/`)
    },
  },
}

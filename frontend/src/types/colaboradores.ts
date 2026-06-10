import type { UserRole } from '@/types/auth'
import type { DiaSemana } from '@/types/clinicas'

export type TipoContrato = 'empleado' | 'contratista' | 'socio'

export interface ColaboradorEspecialidad {
  id: string
  nombre: string
  duracion_min?: number
}

export interface ColaboradorSede {
  id: string
  nombre: string
}

export interface HorarioColaborador {
  id: string
  colaborador: string
  sede: string
  sede_nombre?: string
  dia_semana: DiaSemana
  hora_inicio: string  // "HH:MM"
  hora_fin: string     // "HH:MM"
}

export interface CreateHorarioColaboradorRequest {
  colaborador: string
  sede: string
  dia_semana: DiaSemana
  hora_inicio: string
  hora_fin: string
}

export interface Colaborador {
  id: string
  user: string
  // user fields — require backend to include in serializer
  email?: string
  first_name?: string
  last_name?: string
  nombre_completo: string
  user_nombre?: string
  rol?: UserRole
  role_id?: string | null
  role_nombre?: string | null
  telefono?: string | null
  foto_perfil?: string | null
  // colaborador fields
  tipo_contrato: TipoContrato
  sede_principal: string | null
  sede_principal_nombre?: string | null
  sedes: string[]                        // IDs of all assigned sedes (M2M)
  sedes_detalle?: ColaboradorSede[]      // nested sede objects
  fecha_ingreso: string | null
  activo: boolean
  especialidades: string[]               // array of IDs
  especialidades_detalle: ColaboradorEspecialidad[]
  numero_documento?: string | null
  created_at: string
}

export interface CreateColaboradorRequest {
  email: string
  first_name: string
  last_name: string
  numero_documento: string
  telefono?: string
  role_id: string              // UUID del rol dinámico (H4.6)
  rol?: string                 // slug legacy — fallback hasta que backend soporte role_id
  sede_principal: string
  sedes_ids?: string[]
  tipo_contrato: TipoContrato
  fecha_ingreso: string
  especialidades: string[]
}

export interface UpdateColaboradorRequest {
  first_name?: string
  last_name?: string
  numero_documento?: string
  telefono?: string
  role_id?: string             // UUID del rol dinámico
  rol?: string                 // slug legacy
  sede_principal?: string
  sedes_ids?: string[]
  tipo_contrato?: TipoContrato
  fecha_ingreso?: string
  especialidades?: string[]
  activo?: boolean
}

export interface ColaboradorProfesional {
  id: string            // user.id del profesional
  colaborador_id: string // UUID del perfil laboral (Colaborador), usado en citas
  nombre_completo: string
  especialidades: ColaboradorEspecialidad[]
}

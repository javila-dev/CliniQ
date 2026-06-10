export type TipoDocumento = 'CC' | 'CE' | 'PA' | 'TI' | 'NIT'
export type Sexo = 'M' | 'F' | 'O'
export type CanalConfirmacion = 'whatsapp' | 'sms' | 'llamada'

export type EstadoCivil = 'soltero' | 'casado' | 'union_libre' | 'separado' | 'divorciado' | 'viudo'
export type Escolaridad = 'ninguna' | 'primaria' | 'secundaria' | 'tecnico' | 'universitario' | 'posgrado'
export type GrupoEtnico = 'mestizo' | 'blanco' | 'afrocolombiano' | 'indigena' | 'raizal' | 'rom' | 'otro'
export type GrupoSanguineo = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-'
export type TipoAfiliado = 'cotizante' | 'beneficiario' | 'independiente' | 'subsidiado' | 'vinculado'
export type Regimen = 'contributivo' | 'subsidiado' | 'vinculado' | 'especial' | 'pensionado'

export interface Paciente {
  id: string
  nombres: string
  apellidos: string
  nombre_completo: string
  tipo_documento: TipoDocumento
  numero_documento: string
  sexo: Sexo
  fecha_nacimiento: string | null
  telefono: string
  email: string | null
  canal_confirmacion: CanalConfirmacion
  autoriza_datos: boolean
  activo: boolean
  created_at: string
  updated_at: string

  // H5.2 — campos extendidos
  direccion?: string
  ciudad?: string
  barrio?: string

  estado_civil?: EstadoCivil | ''
  ocupacion?: string
  escolaridad?: Escolaridad | ''
  grupo_etnico?: GrupoEtnico | ''

  grupo_sanguineo?: GrupoSanguineo | ''

  eps?: string
  tipo_afiliado?: TipoAfiliado | ''
  regimen?: Regimen | ''

  nombre_responsable?: string
  parentesco_responsable?: string
  telefono_responsable?: string
}

export interface BusquedaPaciente {
  id: string
  nombre_completo: string
  numero_documento: string
  tipo_documento: TipoDocumento
  telefono: string
  canal_confirmacion: CanalConfirmacion
}

export interface CreatePacienteRequest {
  nombres: string
  apellidos: string
  tipo_documento: TipoDocumento
  numero_documento: string
  sexo: Sexo
  fecha_nacimiento?: string
  telefono: string
  email?: string
  canal_confirmacion: CanalConfirmacion
  autoriza_datos: boolean

  // H5.2 — campos extendidos (todos opcionales)
  direccion?: string
  ciudad?: string
  barrio?: string

  estado_civil?: EstadoCivil | ''
  ocupacion?: string
  escolaridad?: Escolaridad | ''
  grupo_etnico?: GrupoEtnico | ''

  grupo_sanguineo?: GrupoSanguineo | ''

  eps?: string
  tipo_afiliado?: TipoAfiliado | ''
  regimen?: Regimen | ''

  nombre_responsable?: string
  parentesco_responsable?: string
  telefono_responsable?: string
}

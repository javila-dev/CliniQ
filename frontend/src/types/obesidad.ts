export type ActividadFisica = 'sedentario' | 'leve' | 'moderado' | 'intenso'
export type ViaAdministracion = 'oral' | 'subcutanea' | 'intramuscular'
export type TipoLaboratorio = 'glucosa' | 'hba1c' | 'lipidos' | 'hepatico' | 'tiroideo' | 'hemograma' | 'otro'

export interface AntecedentesObesidad {
  id: string
  historia: string
  peso_maximo_kg: string | null
  peso_minimo_adulto_kg: string | null
  intentos_previos: string
  comorbilidades: string[]
  medicamentos_actuales: string
  antecedente_familiar: boolean | null
  actividad_fisica: ActividadFisica | ''
  patron_alimentario: string
  factores_emocionales: string
  created_at: string
  updated_at: string
}

export interface AntecedentesObesidadInput {
  historia: string
  peso_maximo_kg?: number | null
  peso_minimo_adulto_kg?: number | null
  intentos_previos?: string
  comorbilidades?: string[]
  medicamentos_actuales?: string
  antecedente_familiar?: boolean | null
  actividad_fisica?: ActividadFisica | ''
  patron_alimentario?: string
  factores_emocionales?: string
}

export interface ObjetivoObesidad {
  id: string
  paciente: string
  cotizacion: string | null
  peso_inicial_kg: string
  peso_objetivo_kg: string
  por_perder_kg: string
  fecha_inicio: string
  fecha_objetivo: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ObjetivoObesidadInput {
  paciente: string
  peso_inicial_kg: number
  peso_objetivo_kg: number
  fecha_inicio: string
  fecha_objetivo?: string | null
  cotizacion?: string | null
}

export interface CampoAdicionalSeguimiento {
  nombre: string
  valor: string | number
  unidad?: string
}

export interface MedicionAntropometrica {
  id: string
  paciente: string
  nota: string | null
  cita: string | null
  tomado_por: string
  fecha: string
  peso_kg: string
  talla_cm: string | null
  imc: string | null
  cintura_cm: string | null
  cadera_cm: string | null
  icc: string | null
  brazo_cm: string | null
  muslo_cm: string | null
  abdomen_alto_cm: string | null
  abdomen_medio_cm: string | null
  abdomen_bajo_cm: string | null
  pierna_derecha_alto_cm: string | null
  pierna_derecha_bajo_cm: string | null
  pierna_izquierda_alto_cm: string | null
  pierna_izquierda_bajo_cm: string | null
  grasa_corporal_pct: string | null
  masa_muscular_kg: string | null
  grasa_visceral: string | null
  agua_corporal_pct: string | null
  presion_sistolica: number | null
  presion_diastolica: number | null
  frecuencia_cardiaca: number | null
  frecuencia_respiratoria: number | null
  temperatura_c: string | null
  saturacion_oxigeno: string | null
  campos_adicionales: CampoAdicionalSeguimiento[]
  activo: boolean
  created_at: string
  updated_at: string
}

export interface MedicionAntropometricaInput {
  paciente: string
  nota?: string | null
  cita?: string | null
  fecha?: string
  peso_kg: number
  talla_cm?: number | null
  cintura_cm?: number | null
  cadera_cm?: number | null
  brazo_cm?: number | null
  muslo_cm?: number | null
  abdomen_alto_cm?: number | null
  abdomen_medio_cm?: number | null
  abdomen_bajo_cm?: number | null
  pierna_derecha_alto_cm?: number | null
  pierna_derecha_bajo_cm?: number | null
  pierna_izquierda_alto_cm?: number | null
  pierna_izquierda_bajo_cm?: number | null
  grasa_corporal_pct?: number | null
  masa_muscular_kg?: number | null
  grasa_visceral?: number | null
  agua_corporal_pct?: number | null
  presion_sistolica?: number | null
  presion_diastolica?: number | null
  frecuencia_cardiaca?: number | null
  frecuencia_respiratoria?: number | null
  temperatura_c?: number | null
  saturacion_oxigeno?: number | null
  campos_adicionales?: CampoAdicionalSeguimiento[]
}

export interface ResultadoLaboratorio {
  id: string
  paciente: string
  registrado_por: string
  fecha: string
  tipo: TipoLaboratorio
  archivo: string | null
  archivo_url: string | null
  valores: Record<string, string | number>
  observaciones: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ResultadoLaboratorioInput {
  paciente: string
  fecha: string
  tipo: TipoLaboratorio
  archivo?: File | null
  valores?: Record<string, string | number>
  observaciones?: string
}

export interface TratamientoFarmacologico {
  id: string
  paciente: string
  nota: string | null
  indicado_por: string
  medicamento: string
  principio_activo: string
  dosis: string
  via: ViaAdministracion
  frecuencia: string
  fecha_inicio: string
  fecha_fin: string | null
  motivo_suspension: string
  vigente: boolean
  activo: boolean
  created_at: string
  updated_at: string
}

export interface TratamientoFarmacologicoInput {
  paciente: string
  nota?: string | null
  medicamento: string
  principio_activo?: string
  dosis: string
  via?: ViaAdministracion
  frecuencia: string
  fecha_inicio: string
  fecha_fin?: string | null
  motivo_suspension?: string
}

export interface ProgresoObesidad {
  objetivo: ObjetivoObesidad | null
  mediciones: MedicionAntropometrica[]
  farmacologico: TratamientoFarmacologico[]
}

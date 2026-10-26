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
  peso_kg: string | null
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
  peso_kg: number | null
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

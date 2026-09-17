/** Catálogo de medidas antropométricas — compartido entre la pestaña
 *  Seguimiento (TabMediciones) y el paso de medidas históricas del asistente
 *  de puesta en marcha, para que ambos formularios queden idénticos. */

export type FieldKey =
  | 'peso_kg' | 'talla_cm'
  | 'presion_sistolica' | 'presion_diastolica'
  | 'frecuencia_cardiaca' | 'frecuencia_respiratoria'
  | 'temperatura_c' | 'saturacion_oxigeno'
  | 'cintura_cm' | 'cadera_cm' | 'brazo_cm' | 'muslo_cm'
  | 'abdomen_alto_cm' | 'abdomen_medio_cm' | 'abdomen_bajo_cm'
  | 'pierna_derecha_alto_cm' | 'pierna_derecha_bajo_cm'
  | 'pierna_izquierda_alto_cm' | 'pierna_izquierda_bajo_cm'
  | 'grasa_corporal_pct' | 'masa_muscular_kg' | 'grasa_visceral' | 'agua_corporal_pct'

export interface FieldConfig {
  key: FieldKey
  label: string
  unit?: string
  step?: string
  min?: number
  max?: number
  placeholder: string
}

export const MEDICION_FIELDS: FieldConfig[] = [
  { key: 'peso_kg',                   label: 'Peso',               unit: 'kg',   step: '0.1', min: 1,  max: 500, placeholder: '70.5' },
  { key: 'talla_cm',                  label: 'Talla',              unit: 'cm',   step: '0.1', min: 1,  max: 250, placeholder: '165' },
  { key: 'presion_sistolica',         label: 'P. sistólica',       unit: 'mmHg',              min: 60, max: 300, placeholder: '120' },
  { key: 'presion_diastolica',        label: 'P. diastólica',      unit: 'mmHg',              min: 40, max: 200, placeholder: '80' },
  { key: 'frecuencia_cardiaca',       label: 'Frec. cardíaca',     unit: 'lpm',                min: 20, max: 250, placeholder: '72' },
  { key: 'frecuencia_respiratoria',   label: 'Frec. respiratoria', unit: 'rpm',                min: 5,  max: 60,  placeholder: '16' },
  { key: 'temperatura_c',             label: 'Temperatura',        unit: '°C',   step: '0.1', min: 30, max: 45,  placeholder: '36.5' },
  { key: 'saturacion_oxigeno',        label: 'SpO₂',                unit: '%',    step: '0.1', min: 50, max: 100, placeholder: '98' },
  { key: 'cintura_cm',                label: 'Cintura',            unit: 'cm',   step: '0.1', placeholder: '90' },
  { key: 'cadera_cm',                 label: 'Cadera',             unit: 'cm',   step: '0.1', placeholder: '100' },
  { key: 'brazo_cm',                  label: 'Brazo',              unit: 'cm',   step: '0.1', placeholder: '32' },
  { key: 'muslo_cm',                  label: 'Muslo',              unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'abdomen_alto_cm',           label: 'Abdomen alto',       unit: 'cm',   step: '0.1', placeholder: '90' },
  { key: 'abdomen_medio_cm',          label: 'Abdomen medio',      unit: 'cm',   step: '0.1', placeholder: '85' },
  { key: 'abdomen_bajo_cm',           label: 'Abdomen bajo',       unit: 'cm',   step: '0.1', placeholder: '95' },
  { key: 'pierna_derecha_alto_cm',    label: 'Pierna der. alto',   unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'pierna_derecha_bajo_cm',    label: 'Pierna der. bajo',   unit: 'cm',   step: '0.1', placeholder: '40' },
  { key: 'pierna_izquierda_alto_cm',  label: 'Pierna izq. alto',   unit: 'cm',   step: '0.1', placeholder: '55' },
  { key: 'pierna_izquierda_bajo_cm',  label: 'Pierna izq. bajo',   unit: 'cm',   step: '0.1', placeholder: '40' },
  { key: 'grasa_corporal_pct',        label: 'Grasa corporal',     unit: '%',    step: '0.1', min: 1,  max: 70,  placeholder: '35' },
  { key: 'masa_muscular_kg',          label: 'Masa muscular',      unit: 'kg',   step: '0.1', placeholder: '28' },
  { key: 'grasa_visceral',            label: 'Grasa visceral',                  step: '0.1', placeholder: '8' },
  { key: 'agua_corporal_pct',         label: '% de agua',          unit: '%',    step: '0.1', min: 1,  max: 90,  placeholder: '55' },
]

export const MEDICION_FIELD_KEYS: FieldKey[] = MEDICION_FIELDS.map((f) => f.key)

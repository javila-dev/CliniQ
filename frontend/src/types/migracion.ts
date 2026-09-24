export type TipoTratamientoPrevio = 'tratamiento' | 'procedimiento' | 'libre'

export interface SesionRealizadaInput {
  nombre?: string
  servicio?: string | null
  profesional?: string | null
  fecha?: string | null
}

export interface PagoPrevioInput {
  valor: string
  medio_pago?: string | null  // id de FormaDePago; sin él el backend usa "Otro"
  fecha: string
}

export interface CuotaPlanInput {
  valor_esperado: string
  fecha_esperada?: string | null
  tipo: string                // id de FormaDePago
  descripcion?: string
}

/** Una medición antropométrica tomada antes de usar CliniQ (mismos campos
 *  que la pestaña Seguimiento de la historia clínica). Queda ahí, sin cita
 *  ni nota asociada. */
export interface MedicionHistoricaInput {
  fecha: string
  peso_kg?: string | null
  talla_cm?: string | null
  presion_sistolica?: string | null
  presion_diastolica?: string | null
  frecuencia_cardiaca?: string | null
  frecuencia_respiratoria?: string | null
  temperatura_c?: string | null
  saturacion_oxigeno?: string | null
  cintura_cm?: string | null
  cadera_cm?: string | null
  brazo_cm?: string | null
  muslo_cm?: string | null
  abdomen_alto_cm?: string | null
  abdomen_medio_cm?: string | null
  abdomen_bajo_cm?: string | null
  pierna_derecha_alto_cm?: string | null
  pierna_derecha_bajo_cm?: string | null
  pierna_izquierda_alto_cm?: string | null
  pierna_izquierda_bajo_cm?: string | null
  grasa_corporal_pct?: string | null
  masa_muscular_kg?: string | null
  grasa_visceral?: string | null
  agua_corporal_pct?: string | null
}

export interface PacienteEnCursoPayload {
  paciente: string
  sede: string
  nota?: string
  tratamiento: {
    tipo: TipoTratamientoPrevio
    tratamiento?: string | null
    servicio?: string | null
    descripcion: string
    num_sesiones_total: number
    precio_total_pactado: string
    fecha_inicio?: string | null
  }
  sesiones_realizadas: SesionRealizadaInput[]
  pagos: PagoPrevioInput[]
  plan_saldo: CuotaPlanInput[]
  mediciones_historicas: MedicionHistoricaInput[]
}

export interface LoteMigracion {
  id: string
  clinica: string
  paciente: string | null
  paciente_nombre: string | null
  tipo: string
  nota: string
  manifest: {
    resumen?: {
      total_pactado: string
      pagado: string
      saldo: string
      sesiones_total: number
      sesiones_realizadas: number
      sesiones_pendientes: number
    }
    [k: string]: unknown
  }
  creado_por: string | null
  creado_por_nombre: string | null
  revertido: boolean
  revertido_en: string | null
  created_at: string
}

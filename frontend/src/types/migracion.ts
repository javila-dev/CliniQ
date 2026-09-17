export type TipoTratamientoPrevio = 'tratamiento' | 'procedimiento' | 'libre'

export interface SesionRealizadaInput {
  nombre?: string
  servicio?: string | null
  profesional?: string | null
  fecha?: string | null
}

export interface PagoPrevioInput {
  valor: string
  medio_pago: 'efectivo' | 'tarjeta_debito' | 'tarjeta_credito' | 'transferencia' | 'otro'
  fecha: string
}

export interface CuotaPlanInput {
  valor_esperado: string
  fecha_esperada?: string | null
  tipo?: 'efectivo' | 'transferencia' | 'cuotas' | 'financiamiento'
  descripcion?: string
}

/** Una medida corporal tomada antes de usar CliniQ. Queda en la pestaña
 *  Seguimiento de la historia clínica del paciente, sin cita ni nota. */
export interface MedicionHistoricaInput {
  fecha: string
  peso_kg?: string | null
  talla_cm?: string | null
  cintura_cm?: string | null
  cadera_cm?: string | null
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

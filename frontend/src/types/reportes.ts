export interface CitasHoy {
  total: number
  pendientes: number
  confirmadas: number
  en_curso: number
  completadas: number
  canceladas: number
  no_asistio: number
}

export interface PorMedioPago {
  medio: string
  total: string
}

export interface CobrosHoy {
  total_cop: string
  pagados: number
  pendientes: number
  por_medio_pago: PorMedioPago[]
}

export interface IngresoSemana {
  fecha: string
  total: string
}

export interface DashboardData {
  citas_hoy: CitasHoy
  cobros_hoy: CobrosHoy
  stock_alertas: number
  ingresos_semana: IngresoSemana[]
}

export interface IngresosPeriodo {
  periodo: string
  total_cobros: string
  total_gastos: string
}

export interface ServicioReporte {
  servicio_nombre: string
  cantidad_citas: number
  ingresos: string
  costo_insumos: string
  margen: string
  margen_pct: string
}

export interface OcupacionReporte {
  profesional_id: string
  profesional_nombre: string
  total_citas: number
  completadas: number
  canceladas: number
  no_asistio: number
  tasa_completadas_pct: string
}

export interface ReportesParams {
  sede_id?: string
  fecha?: string
  fecha_inicio?: string
  fecha_fin?: string
  agrupar_por?: 'dia' | 'semana' | 'mes'
}

export interface PyLBloque {
  ingresos_facturado: string
  ingresos_recaudado: string
  costo_insumos: string
  gastos_operativos: string
  margen: string
  margen_pct: string
}

export interface PyLPorSede {
  sede_id: string
  sede_nombre: string
  ingresos_facturado: string
  costo_insumos: string
  gastos_operativos: string
  margen: string
  margen_pct: string
}

export interface EstadoFinanciero {
  periodo: { inicio: string; fin: string; dias: number }
  actual: PyLBloque
  anterior: PyLBloque
  /** null cuando no hay base de comparación (periodo anterior en cero). */
  variacion_pct: {
    ingresos_facturado: string | null
    costo_insumos: string | null
    gastos_operativos: string | null
    margen: string | null
  }
  /** Solo presente cuando NO se filtró por sede. */
  por_sede?: PyLPorSede[]
}

export interface CotizacionesMesMetrics {
  total_mes: number
  aceptadas_mes: number
  tasa_conversion_pct: string
}

export interface PacienteSinReagendar {
  paciente_id: string
  paciente_nombre: string
  ultima_cita: string | null
  dias_sin_agendar: number
  cotizacion_id: string
  tratamiento: string
  sesiones_pendientes: number
}

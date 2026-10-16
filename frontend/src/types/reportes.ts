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

export interface WhatsAppUsoDashboard {
  envios_realizados: number
  envios_incluidos: number
  cerca_del_limite: boolean
}

export interface DashboardData {
  citas_hoy: CitasHoy
  cobros_hoy: CobrosHoy
  stock_alertas: number
  ingresos_semana: IngresoSemana[]
  whatsapp_uso?: WhatsAppUsoDashboard
}

export interface IngresosPeriodo {
  periodo: string
  total_cobros: string
  total_gastos: string
}

/** Ingresos por origen (GET /reportes/ingresos-por-origen/). Montos en string. */
export type OrigenIngreso = 'citas' | 'ventas' | 'cartera' | 'otros'

export interface IngresosPorOrigen {
  fecha_inicio: string
  fecha_fin: string
  /** Un registro por día del rango (sin acumular). */
  serie: ({ fecha: string } & Record<OrigenIngreso, string>)[]
  totales: Record<OrigenIngreso | 'total', string>
  anterior: { fecha_inicio: string; fecha_fin: string; total: string }
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
  ventas_valor: string      // Decimal como string: valor aceptado en el periodo
  ventas_cantidad: number
}

// GET /reportes/comercial/: cotizaciones y ventas por separado, cada métrica
// con su propia fecha (ver docs/plan-funnel-comercial.md).
export interface ComercialMetrics {
  periodo: { desde: string; hasta: string }
  cotizaciones: {
    creadas: number
    creadas_valor: string
    enviadas: number
    abiertas: number          // foto de hoy, no del periodo
    abiertas_valor: string
    perdidas: number          // descartadas + vencidas en el periodo
    descartadas: number
    vencidas: number
    motivo_principal: string | null
  }
  ventas: {
    valor: string
    cantidad: number
    tasa_cierre_pct: string   // de las creadas en el periodo, % ya vendidas
    creadas_vendidas: number
    creadas_abiertas: number  // creadas en el periodo que siguen abiertas
    dias_promedio_cierre: number | null
  }
  granularidad: 'dia' | 'semana' | 'mes'
  serie: {
    periodo: string           // inicio del día/semana/mes (YYYY-MM-DD)
    cotizado_valor: string
    cotizadas: number
    vendido_valor: string
    vendidas: number
  }[]
}

export interface Vendedor {
  id: string
  nombre: string
  activo: boolean
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

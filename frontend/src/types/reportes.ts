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

// GET /reportes/comercial/asesores/: una fila por asesor (quien creó la
// cotización) con las mismas reglas que /reportes/comercial/.
export interface FilaAsesor {
  asesor_id: string | null      // null = cotizaciones sin asesor, o la fila de totales
  nombre: string
  email?: string | null         // distingue a dos usuarios con el mismo nombre
  activo: boolean
  cotizaciones: { cantidad: number; valor: string }
  ventas: {
    cantidad: number
    valor: string
    ticket_promedio: string | null
    dias_promedio_cierre: number | null
  }
  creadas_vendidas: number      // de las creadas en el periodo, cuántas ya se vendieron
  tasa_cierre_pct: string | null
}

export interface ComercialAsesores {
  periodo: { desde: string; hasta: string }
  asesores: FilaAsesor[]
  totales: FilaAsesor
}

/** Un paquete vendido o importado al que le faltan sesiones (backend: reportes/paquetes.py). */
export interface PaqueteSinMovimiento {
  item_id: string
  cotizacion_id: string
  paciente_id: string
  paciente_nombre: string
  tratamiento: string
  sede_id: string | null
  sede_nombre: string | null
  origen: 'venta' | 'importado'
  /** Quien lo vendió o, si es importado, quien hizo la carga. */
  responsable_id: string | null
  responsable_nombre: string | null
  /** Fecha de la venta o de la carga (YYYY-MM-DD). */
  inicio: string
  sesiones_total: number
  sesiones_hechas: number
  /** Citas del paquete en la app (sin las canceladas). */
  citas_en_app: number
  ultima_atencion: string | null
  proxima_cita: string | null
  dias_sin_movimiento: number
  estado: 'nunca_agendado' | 'sin_proxima_cita' | 'con_cita'
  /** Sesiones hechas por fuera de la app y registradas después. */
  registradas_despues: number
}

export interface ResumenPaquetes {
  id: string | null
  nombre: string | null
  /** Paquetes a los que les faltan sesiones. */
  activos: number
  sin_movimiento: number
  nunca_agendados: number
  /** Sesiones registradas después, también de paquetes ya completos. */
  registradas_despues: number
}

export interface ReportePaquetes {
  dias: number
  totales: {
    activos: number
    sin_movimiento: number
    nunca_agendados: number
    sesiones_pendientes: number
    registradas_despues: number
  }
  por_responsable: ResumenPaquetes[]
  por_sede: ResumenPaquetes[]
  paquetes: PaqueteSinMovimiento[]
}

// ── Regularizar un paquete: sesiones hechas por fuera de la app ─────────────

export interface SesionPorRegistrar {
  id: string
  nombre: string
  /** Lugar en el protocolo: "sesión {posicion} de {de}". */
  posicion: number
  de: number
}

export interface SesionRegistradaDespues extends SesionPorRegistrar {
  estado: string
  fecha: string | null
  profesional_nombre: string | null
  observaciones: string
  con_nota_clinica: boolean
  registrada_por: string | null
  registrada_en: string
}

export interface EstadoRegularizacion {
  item_id: string
  cotizacion_id: string
  paciente_id: string
  paciente_nombre: string
  tratamiento: string
  origen: 'venta' | 'importado'
  /** Fecha de la venta o de la carga: la sesión no puede ser anterior. */
  fecha_minima: string
  hoy: string
  sesiones_total: number
  /** Sesiones del paquete sin cita agendada: el máximo que se puede registrar. */
  sin_agendar: number
  pendientes: SesionPorRegistrar[]
  registradas: SesionRegistradaDespues[]
  profesionales: { id: string; nombre: string; activo: boolean }[]
  /** Puede escribir la nota clínica (permiso de crear notas). */
  puede_nota_clinica: boolean
}

export type ModoRegistro = 'sesion' | 'nota_clinica'

export interface SesionARegistrar {
  sesion_id: string
  fecha: string
  profesional_id: string
  modo: ModoRegistro
  nota?: string
  nota_clinica?: string
}

// ── Citas por profesional (/reportes/citas-profesional/) ──

export type ResultadoCita = 'atendida' | 'cancelada' | 'no_asistio' | 'sin_cerrar' | 'programada'
export type TipoCitaReporte = 'tratamiento' | 'procedimiento' | 'item_libre' | 'cita_libre'

export interface CitaReporte {
  id: string
  fecha: string
  hora: string
  hora_fin: string
  duracion_min: number | null
  profesional_id: string
  profesional: string
  sede_id: string
  sede: string
  recursos: string
  paciente_id: string
  paciente: string
  documento: string
  telefono: string
  estado: string
  resultado: ResultadoCita
  tipo: TipoCitaReporte
  es_obsequio: boolean
  servicio: string
  tratamiento: string
  tipo_sesion: string
  sesion_numero: number | null
  sesion_total: number | null
  motivo: string
  motivo_cancelacion: string
  confirmacion: string
  canal_origen: string
  llegada: string | null
  inicio_real: string | null
  fin_real: string | null
  duracion_real_min: number | null
  historia: 'firmada' | 'borrador' | 'sin_nota'
  firma_asistencia: string
  agendada_por: string
  agendada_en: string
  vendida_por: string
}

export interface ResumenProfesionalCitas {
  profesional_id: string | null
  profesional: string
  total: number
  atendida: number
  cancelada: number
  no_asistio: number
  sin_cerrar: number
  programada: number
  atendidas_por_tipo: Record<TipoCitaReporte, number>
  pacientes_atendidos: number
  minutos_atendidos: number
  atendidas_sin_nota_firmada: number
  pct_asistencia: number | null
}

export interface ReporteCitasProfesional {
  desde: string
  hasta: string
  totales: ResumenProfesionalCitas
  profesionales: ResumenProfesionalCitas[]
  citas: CitaReporte[]
}

import type { Cita } from '@/types/agenda'
import type { WizardConfig } from '@/types/clinicas'

/*
 * Pasos de recepción ("Preparar paciente") y el estado que se muestra de una
 * cita. Todo se deriva de la configuración de la clínica y de EstadoCita: no
 * hay estados nuevos en el backend, para no tocar agenda, filtros ni reportes.
 */

export type PasoRecepcion = 'llegada' | 'verificacion' | 'consentimiento' | 'pago' | 'firma'

/** Orden fijo: la clínica solo prende o apaga pasos, no los reordena. */
export const PASOS_RECEPCION: PasoRecepcion[] = ['llegada', 'verificacion', 'consentimiento', 'pago', 'firma']

/** Nombre corto, para el indicador de pasos. */
export const NOMBRE_CORTO_PASO: Record<PasoRecepcion, string> = {
  llegada: 'Llegada',
  verificacion: 'Identidad',
  consentimiento: 'Consentimiento',
  pago: 'Pago',
  firma: 'Firma',
}

/** Nombre completo, para los mensajes de "qué falta". */
export const NOMBRE_PASO: Record<PasoRecepcion, string> = {
  llegada: 'Llegada',
  verificacion: 'Verificación de identidad',
  consentimiento: 'Consentimiento',
  pago: 'Pago',
  firma: 'Firma de asistencia',
}

/** El paso "Pago" está hecho cuando el cobro de la cita tiene pagos. Un cobro
 *  creado cuyo pago falló sigue pendiente (M6-13). */
export function cobroConPagos(cita: Pick<Cita, 'cobro_estado'>): boolean {
  return cita.cobro_estado === 'pagado' || cita.cobro_estado === 'pagado_parcial'
}

/**
 * Pasos que la clínica tiene encendidos. El consentimiento no tiene
 * interruptor: siempre está y se completa solo si el procedimiento no lo pide.
 * Sin configuración cargada se asume la de fábrica (sin verificación facial).
 */
export function pasosActivos(config: WizardConfig | undefined): PasoRecepcion[] {
  return PASOS_RECEPCION.filter((paso) => {
    if (paso === 'llegada') return config ? config.paso_checkin : true
    if (paso === 'verificacion') return config?.paso_verificacion_facial ?? false
    if (paso === 'pago') return config ? config.paso_pago : true
    if (paso === 'firma') return config ? config.paso_firma_asistencia : true
    return true
  })
}

export interface OpcionesProgreso {
  /** El asistente acaba de registrar el pago y la cita aún no se recargó. */
  pagoRegistrado?: boolean
  /** El asistente acaba de verificar la identidad y la cita aún no se recargó. */
  verificacionCompletada?: boolean
}

export interface ProgresoRecepcion {
  activos: PasoRecepcion[]
  hechos: Record<PasoRecepcion, boolean>
  faltan: PasoRecepcion[]
  /** Todos los pasos encendidos están completos: listo para atender. */
  listo: boolean
  /** El procedimiento pide consentimiento (si no, ese paso se omite solo). */
  consentimientoAplica: boolean
}

/**
 * Lo mismo que exige el backend para iniciar la atención
 * (`pasos_recepcion_pendientes`): sin todos los pasos encendidos, no se atiende.
 */
export function progresoRecepcion(
  cita: Cita,
  config: WizardConfig | undefined,
  opciones: OpcionesProgreso = {},
): ProgresoRecepcion {
  const activos = pasosActivos(config)
  const consentimientoAplica = (cita.consentimiento_info?.consentimientos?.length ?? 0) > 0
  const hechos: Record<PasoRecepcion, boolean> = {
    llegada: !['pendiente', 'confirmada'].includes(cita.estado),
    // Basta un intento registrado, coincida o no; "Continuar sin verificar" deja uno.
    verificacion: Boolean(opciones.verificacionCompletada || cita.verificacion_identidad_registrada),
    consentimiento: !consentimientoAplica || Boolean(cita.consentimiento_info?.todos_firmados),
    // Una cita de cotización la cobra la cotización (cartera/cuotas), no recepción.
    pago: cita.item_cotizacion_id != null || Boolean(opciones.pagoRegistrado) || cobroConPagos(cita)
      || cita.estado === 'en_curso' || cita.estado === 'completada',
    firma: cita.firma_asistencia_estado === 'firmada',
  }
  const faltan = activos.filter((paso) => !hechos[paso])
  return { activos, hechos, faltan, listo: activos.length > 0 && faltan.length === 0, consentimientoAplica }
}

export type EstadoOperativo =
  | 'sin_llegar' | 'en_preparacion' | 'listo' | 'en_atencion' | 'finalizada' | 'cancelada' | 'no_asistio'

export const ETIQUETA_ESTADO_OPERATIVO: Record<EstadoOperativo, string> = {
  sin_llegar: 'Sin llegar',
  en_preparacion: 'En preparación',
  listo: 'Listo para atender',
  en_atencion: 'En atención',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

/**
 * Lo que vive la cita hoy, en palabras de recepción. Sin el paso de llegada la
 * cita sigue "confirmada" mientras recepción la prepara (pasa a "en espera" al
 * terminar), así que cualquier paso hecho ya cuenta como "en preparación".
 */
export function estadoOperativo(cita: Cita, progreso: ProgresoRecepcion): EstadoOperativo {
  switch (cita.estado) {
    case 'en_curso': return 'en_atencion'
    case 'completada': return 'finalizada'
    case 'cancelada': return 'cancelada'
    case 'no_asistio': return 'no_asistio'
    case 'en_espera': return progreso.listo ? 'listo' : 'en_preparacion'
    default: {
      const sinLlegada = !progreso.activos.includes('llegada')
      const algoHecho = progreso.activos.some((paso) =>
        paso !== 'llegada' && progreso.hechos[paso] && !(paso === 'consentimiento' && !progreso.consentimientoAplica)
        && !(paso === 'pago' && cita.item_cotizacion_id != null),
      )
      return cita.estado === 'confirmada' && sinLlegada && algoHecho ? 'en_preparacion' : 'sin_llegar'
    }
  }
}

/** "Pago", "Pago y Firma de asistencia", "Llegada, Pago y Firma de asistencia". */
export function listaDePasos(pasos: PasoRecepcion[]): string {
  const nombres = pasos.map((paso) => NOMBRE_PASO[paso])
  if (nombres.length <= 1) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

export function textoFaltan(n: number): string {
  return n === 1 ? 'Falta 1 paso' : `Faltan ${n} pasos`
}

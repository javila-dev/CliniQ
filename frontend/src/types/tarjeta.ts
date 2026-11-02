// La hoja del paquete de una cita (GET /agenda/citas/{id}/tarjeta/), para la
// vista sencilla de la atención. Ver docs/plan-atencion-sencilla.md.

export interface ProcedimientoFila {
  id: string | null
  nombre: string
  realizado: boolean
}

export interface FilaTarjeta {
  numero: number
  sesion_id: string | null
  cita_id: string | null
  /** La fila de la cita que se está atendiendo. */
  es_actual: boolean
  estado: 'pendiente' | 'completado' | 'inasistencia'
  obsequio: boolean
  procedimientos: ProcedimientoFila[]
  /** YYYY-MM-DD */
  fecha: string | null
  /** HH:MM */
  hora: string | null
  profesional: { id: string; nombre: string; firma_url: string | null } | null
  /** Estado de la firma de asistencia de la cita; null sin cita. */
  firma_paciente: 'sin_firma' | 'enviada' | 'firmada' | 'rechazada' | null
  /** Diagramas con marcas en la nota de esa cita: el "dónde". */
  zonas: string[]
}

export interface TarjetaCita {
  cita_id: string
  /** null = cita suelta (una sola fila). */
  paquete: { id: string | null; nombre: string } | null
  numero_actual: number | null
  total: number
  filas: FilaTarjeta[]
  firma_asistencia_activa: boolean
  mostrar_firma_paciente: boolean
}

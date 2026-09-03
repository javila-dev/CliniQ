export interface CategoriaGasto {
  id: string
  clinica: string
  nombre: string
  activa: boolean
  created_at: string
}

export interface GastoCaja {
  id: string
  sesion: string | null
  sede: string
  sede_nombre?: string
  categoria: string
  categoria_nombre?: string
  descripcion: string
  valor: string
  soporte_foto: string | null
  fecha: string           // YYYY-MM-DD
  registrado_por: string
  registrado_por_nombre?: string | null
  created_at: string
}

export interface CrearGastoPayload {
  sede: string
  categoria: string
  descripcion: string
  valor: number
  fecha: string
  soporte_foto?: File | null
}

export interface Caja {
  id: string
  sede: string
  sede_nombre?: string
  responsable: string | null
  responsable_nombre?: string | null
  saldo_inicial: string
  activa: boolean
  sesion_abierta_id: string | null
  monto_apertura_sugerido: string
  created_at: string
}

export type EstadoSesion = 'abierta' | 'cerrada'

export interface SesionCaja {
  id: string
  caja: string
  caja_sede_nombre?: string
  estado: EstadoSesion
  monto_apertura: string
  abierta_por: string | null
  abierta_por_nombre?: string | null
  abierta_en: string
  total_ingresos: string
  total_egresos: string
  esperado: string
  efectivo_contado: string | null
  diferencia: string
  observaciones: string
  cerrada_por: string | null
  cerrada_por_nombre?: string | null
  cerrada_en: string | null
  created_at: string
}

/** Respuesta de GET /caja/sesiones/actual/?sede= */
export interface EstadoCajaActual {
  caja: Caja | null
  /** Sesión abierta con total_ingresos/total_egresos/esperado recalculados en vivo. */
  sesion: SesionCaja | null
}

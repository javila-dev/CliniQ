export interface CampanaStats {
  cotizaciones_aceptadas: number
  items_vendidos:         number
  monto_total:            string  // Decimal como string (DRF)
}

export interface CampanaItem {
  id:                   string
  procedimiento:        string | null
  procedimiento_nombre: string | null
  tratamiento:          string | null
  tratamiento_nombre:   string | null
  precio_campana:       string | null   // precio fijo, o
  descuento_pct:        string | null   // % de descuento sobre el precio de cada sede
}

export interface Campana {
  id:            string
  nombre:        string
  descripcion:   string
  fecha_inicio:  string
  fecha_fin:     string
  activo:        boolean
  sedes:         string[]          // UUIDs; vacío = todas las sedes
  sedes_nombres: string[]
  items:         CampanaItem[]
  stats?:        CampanaStats
  created_at:    string
}

export interface CreateCampanaRequest {
  nombre:       string
  descripcion?: string
  fecha_inicio: string
  fecha_fin:    string
  activo?:      boolean
  sedes?:       string[]
}

export interface CreateCampanaItemRequest {
  procedimiento?: string | null
  tratamiento?:   string | null
  precio_campana?: number | null
  descuento_pct?:  number | null
}

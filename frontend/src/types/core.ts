export interface LogAccion {
  id:             string
  usuario_nombre: string
  accion:         string
  objeto_tipo:    string
  objeto_id:      string
  detalle:        Record<string, unknown>
  ip:             string | null
  created_at:     string
}

export type EstadoArticulo = 'borrador' | 'publicado' | 'archivado'

export type AreaAyuda =
  | ''
  | 'general'
  | 'agenda'
  | 'pacientes'
  | 'atenciones'
  | 'cotizaciones'
  | 'cartera'
  | 'consentimientos'
  | 'configuracion'
  | 'reportes'

export const AREAS_AYUDA: { value: Exclude<AreaAyuda, ''>; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'pacientes', label: 'Pacientes' },
  { value: 'atenciones', label: 'Atenciones' },
  { value: 'cotizaciones', label: 'Cotizaciones' },
  { value: 'cartera', label: 'Cartera y cobros' },
  { value: 'consentimientos', label: 'Consentimientos' },
  { value: 'configuracion', label: 'Configuración' },
  { value: 'reportes', label: 'Reportes' },
]

export interface CategoriaAyuda {
  id: string
  nombre: string
  slug: string
  descripcion: string
  icono: string
  orden: number
  articulos_count: number
  articulos_total: number
  created_at: string
  updated_at: string
}

export interface ArticuloAyudaLista {
  id: string
  titulo: string
  slug: string
  resumen: string
  keywords: string
  categoria: string
  categoria_slug: string
  categoria_nombre: string
  area: AreaAyuda
  area_display: string
  tiene_video: boolean
  thumbnail_url: string | null
  destacado: boolean
  estado: EstadoArticulo
  orden: number
  publicado_at: string | null
  updated_at: string
}

export interface ArticuloAyudaDetalle extends ArticuloAyudaLista {
  contenido: string
  video_url: string
  video_provider: 'youtube' | 'vimeo' | null
  video_id: string | null
  video_embed_url: string | null
  vistas: number
  util_si: number
  util_no: number
  actualizado_por_nombre: string | null
  created_at: string
}

export interface ArticuloAyudaInput {
  categoria: string
  titulo: string
  slug?: string
  resumen?: string
  contenido?: string
  video_url?: string
  keywords?: string
  area?: AreaAyuda
  destacado?: boolean
  estado?: EstadoArticulo
  orden?: number
}

export interface CategoriaAyudaInput {
  nombre: string
  descripcion?: string
  icono?: string
  orden?: number
}

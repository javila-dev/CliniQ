import { apiClient } from './client'
import type { Paginated } from '@/types/common'
import type {
  ArticuloAyudaDetalle,
  ArticuloAyudaInput,
  ArticuloAyudaLista,
  CategoriaAyuda,
  CategoriaAyudaInput,
} from '@/types/ayuda'

export interface ArticuloListParams {
  categoria?: string
  area?: string
  search?: string
  tiene_video?: boolean
  destacado?: boolean
  estado?: string
  page?: number
}

function toQuery(params?: ArticuloListParams) {
  if (!params) return undefined
  const q: Record<string, string> = {}
  if (params.categoria) q.categoria = params.categoria
  if (params.area) q.area = params.area
  if (params.search) q.search = params.search
  if (params.tiene_video) q.tiene_video = 'true'
  if (params.destacado) q.destacado = 'true'
  if (params.estado) q.estado = params.estado
  if (params.page) q.page = String(params.page)
  return q
}

// ── Lectura (cualquier usuario autenticado) ──────────────────────────────────

export const ayudaApi = {
  categorias: async (): Promise<CategoriaAyuda[]> => {
    const res = await apiClient.get<Paginated<CategoriaAyuda>>('/ayuda/categorias/')
    return res.data.results
  },

  articulos: async (params?: ArticuloListParams): Promise<Paginated<ArticuloAyudaLista>> => {
    const res = await apiClient.get<Paginated<ArticuloAyudaLista>>('/ayuda/articulos/', {
      params: toQuery(params),
    })
    return res.data
  },

  // Trae el corpus completo (todas las páginas) — para la búsqueda fuzzy client-side
  // y el panel de gestión, que necesitan la lista entera de una vez.
  articulosTodos: async (params?: ArticuloListParams): Promise<ArticuloAyudaLista[]> => {
    const acc: ArticuloAyudaLista[] = []
    let page = 1
    for (;;) {
      const res = await ayudaApi.articulos({ ...params, page })
      acc.push(...res.results)
      if (!res.next) break
      page += 1
    }
    return acc
  },

  articulo: async (slug: string, opts?: { preview?: boolean }): Promise<ArticuloAyudaDetalle> => {
    const res = await apiClient.get<ArticuloAyudaDetalle>(`/ayuda/articulos/${slug}/`, {
      params: opts?.preview ? { preview: 1 } : undefined,
    })
    return res.data
  },

  feedback: async (slug: string, util: boolean): Promise<void> => {
    await apiClient.post(`/ayuda/articulos/${slug}/feedback/`, { util })
  },
}

// ── Gestión (superadmin o is_staff) ─────────────────────────────────────────

export const ayudaAdminApi = {
  crearCategoria: async (data: CategoriaAyudaInput): Promise<CategoriaAyuda> => {
    const res = await apiClient.post<CategoriaAyuda>('/ayuda/categorias/', data)
    return res.data
  },
  actualizarCategoria: async (slug: string, data: Partial<CategoriaAyudaInput>): Promise<CategoriaAyuda> => {
    const res = await apiClient.patch<CategoriaAyuda>(`/ayuda/categorias/${slug}/`, data)
    return res.data
  },
  eliminarCategoria: async (slug: string): Promise<void> => {
    await apiClient.delete(`/ayuda/categorias/${slug}/`)
  },
  reordenarCategorias: async (orden: string[]): Promise<void> => {
    await apiClient.post('/ayuda/categorias/reordenar/', { orden })
  },

  crearArticulo: async (data: ArticuloAyudaInput): Promise<ArticuloAyudaDetalle> => {
    const res = await apiClient.post<ArticuloAyudaDetalle>('/ayuda/articulos/', data)
    return res.data
  },
  actualizarArticulo: async (slug: string, data: Partial<ArticuloAyudaInput>): Promise<ArticuloAyudaDetalle> => {
    const res = await apiClient.patch<ArticuloAyudaDetalle>(`/ayuda/articulos/${slug}/`, data)
    return res.data
  },
  eliminarArticulo: async (slug: string): Promise<void> => {
    await apiClient.delete(`/ayuda/articulos/${slug}/`)
  },
  reordenarArticulos: async (categoria: string, orden: string[]): Promise<void> => {
    await apiClient.post('/ayuda/articulos/reordenar/', { categoria, orden })
  },
  duplicarArticulo: async (slug: string): Promise<ArticuloAyudaDetalle> => {
    const res = await apiClient.post<ArticuloAyudaDetalle>(`/ayuda/articulos/${slug}/duplicar/`)
    return res.data
  },

  subirImagen: async (archivo: File): Promise<{ url: string }> => {
    const form = new FormData()
    form.append('archivo', archivo)
    const res = await apiClient.post<{ url: string }>('/ayuda/imagenes/', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data
  },
}

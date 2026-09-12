import GithubSlugger from 'github-slugger'

export interface TocItem {
  id: string
  texto: string
  nivel: 2 | 3
}

function aTextoPlano(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [texto](url) -> texto
    .replace(/[*_`~]/g, '') // negrita/itálica/código/tachado
    .trim()
}

/**
 * Extrae los encabezados ## y ### de un artículo en Markdown para armar el
 * índice. Usa github-slugger (lo mismo que usa rehype-slug puertas adentro)
 * para que los ids calzen con los que ArticuloView pone en el DOM.
 */
export function extractToc(markdown: string): TocItem[] {
  const slugger = new GithubSlugger()
  const items: TocItem[] = []
  for (const linea of markdown.split('\n')) {
    const m = /^(#{2,3})\s+(.+)$/.exec(linea.trim())
    if (!m) continue
    const texto = aTextoPlano(m[2])
    if (!texto) continue
    items.push({ id: slugger.slug(texto), texto, nivel: m[1].length as 2 | 3 })
  }
  return items
}

/** Minutos de lectura estimados (~200 palabras/min), mínimo 1. */
export function estimarMinutosLectura(markdown: string): number {
  const palabras = markdown.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(palabras / 200))
}

import type { MetadataRoute } from 'next'
import { DOMINIOS_SEPARADOS, SITIO_URL } from '@/lib/dominios'

// Solo las páginas del sitio público; la app no se indexa.
export default function sitemap(): MetadataRoute.Sitemap {
  if (!DOMINIOS_SEPARADOS) return []
  return [
    { url: `${SITIO_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITIO_URL}/registro-clinica`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITIO_URL}/terminos`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITIO_URL}/privacidad`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}

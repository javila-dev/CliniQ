import type { MetadataRoute } from 'next'
import { DOMINIOS_SEPARADOS, SITIO_URL } from '@/lib/dominios'

// El robots.txt del sitio público. En el dominio de la app lo responde el
// middleware y no deja indexar nada.
export default function robots(): MetadataRoute.Robots {
  if (!DOMINIOS_SEPARADOS) return { rules: { userAgent: '*', allow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITIO_URL}/sitemap.xml`,
  }
}

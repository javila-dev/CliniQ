import type { MetadataRoute } from 'next'
import { DOMINIOS_SEPARADOS, SITIO_URL } from '@/lib/dominios'

// Rastreadores de buscadores con IA y de asistentes (ChatGPT, Claude, Perplexity,
// Gemini, Apple). Ya entran con la regla general; se nombran para dejar explícito
// que el sitio público quiere aparecer en sus respuestas.
const AGENTES_IA = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
]

// El robots.txt del sitio público. En el dominio de la app lo responde el
// middleware y no deja indexar nada.
export default function robots(): MetadataRoute.Robots {
  const rules = [
    { userAgent: '*', allow: '/' },
    { userAgent: AGENTES_IA, allow: '/' },
  ]
  if (!DOMINIOS_SEPARADOS) return { rules }
  return {
    rules,
    sitemap: `${SITIO_URL}/sitemap.xml`,
  }
}

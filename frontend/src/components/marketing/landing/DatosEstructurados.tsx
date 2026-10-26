import type { PlanPublico } from '@/lib/api/clinicas'
import { resumenPlan } from '@/lib/planesPublicos'
import { SITIO_URL } from '@/lib/dominios'
import { EMPRESA } from '../empresa'
import { FAQ, FUNCIONES, RESUMEN } from './contenido'

/**
 * JSON-LD del landing: la empresa, el software con sus planes y las preguntas
 * frecuentes. Es lo que buscadores y agentes de IA (ChatGPT, Perplexity,
 * Claude, Gemini) leen sin ejecutar JavaScript.
 */
export function DatosEstructurados({ planes }: { planes: PlanPublico[] | null }) {
  const url = SITIO_URL || undefined
  const org = url ? `${url}/#organizacion` : '#organizacion'

  const ofertas = (planes ?? [])
    .filter((p) => p.precio !== null)
    .map((p) => ({
      '@type': 'Offer',
      name: `Plan ${p.nombre}`,
      description: [p.descripcion, resumenPlan(p).join(', ')].filter(Boolean).join(' '),
      price: Number(p.precio),
      priceCurrency: 'COP',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: Number(p.precio), priceCurrency: 'COP', unitText: 'MONTH' },
      ...(url && { url: `${url}/registro-clinica` }),
    }))

  const datos = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: EMPRESA.razonSocial,
        taxID: EMPRESA.nit,
        email: EMPRESA.correo,
        address: {
          '@type': 'PostalAddress',
          streetAddress: EMPRESA.direccion,
          addressLocality: 'Medellín',
          addressRegion: 'Antioquia',
          addressCountry: 'CO',
        },
        brand: { '@type': 'Brand', name: 'CliniQ' },
        ...(url && { url, logo: `${url}/brand/cliniq-app-icon-512.png` }),
      },
      ...(url ? [{ '@type': 'WebSite', '@id': `${url}/#sitio`, url, name: 'CliniQ', inLanguage: 'es-CO', publisher: { '@id': org } }] : []),
      {
        '@type': 'SoftwareApplication',
        name: 'CliniQ',
        alternateName: 'CliniQ software para clínicas estéticas',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Software de gestión para clínicas estéticas y de bienestar',
        operatingSystem: 'Web',
        inLanguage: 'es',
        areaServed: { '@type': 'Country', name: 'Colombia' },
        description: RESUMEN,
        featureList: FUNCIONES,
        provider: { '@id': org },
        ...(url && { url, image: `${url}/img/landing/dashboard.png` }),
        ...(ofertas.length > 0 && { offers: ofertas }),
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([pregunta, respuesta]) => ({
          '@type': 'Question',
          name: pregunta,
          acceptedAnswer: { '@type': 'Answer', text: respuesta },
        })),
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      // El contenido es nuestro (no viene del usuario); se escapa "<" por si acaso.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, '\\u003c') }}
    />
  )
}

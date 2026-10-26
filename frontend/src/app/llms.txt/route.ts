import { EMPRESA } from '@/components/marketing/empresa'
import { FAQ, FUNCIONES, RESUMEN } from '@/components/marketing/landing/contenido'
import { SITIO_URL } from '@/lib/dominios'
import { obtenerPlanesPublicos, resumenPlan } from '@/lib/planesPublicos'

// /llms.txt (https://llmstxt.org): resumen del producto para agentes de IA
// como ChatGPT, Claude o Perplexity. Los precios salen de la API y se
// regeneran cada hora.
export const revalidate = 3600

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

export async function GET() {
  const planes = await obtenerPlanesPublicos()
  const sitio = SITIO_URL || ''

  const lineasPlanes = (planes ?? []).map((p) => {
    const precio = p.precio === null ? 'precio por cotización' : `${COP.format(Number(p.precio))} al mes`
    const anual = p.precio !== null && p.descuento_anual_pct > 0 ? `; ${p.descuento_anual_pct} % de descuento en pago anual` : ''
    return `- **${p.nombre}** (${precio}${anual}): ${[p.descripcion, resumenPlan(p).join(', ')].filter(Boolean).join(' ')}`
  })

  const texto = [
    '# CliniQ',
    '',
    `> ${RESUMEN}`,
    '',
    'CliniQ lo desarrolla y opera 2Asoft S.A.S. (Medellín, Colombia). Está en español, se usa desde el navegador y está pensado para la operación diaria de recepción, profesionales y administración de clínicas estéticas, medicina estética, spas médicos y centros de bienestar.',
    '',
    '## Funciones principales',
    '',
    ...FUNCIONES.map((f) => `- ${f}`),
    '',
    '## Planes y precios',
    '',
    'Precios en pesos colombianos (COP). Todos los planes incluyen 14 días de prueba gratis sin tarjeta de crédito.',
    '',
    ...(lineasPlanes.length > 0 ? lineasPlanes : [`- Consulta los planes vigentes en ${sitio}/#precios`]),
    '',
    '## Preguntas frecuentes',
    '',
    ...FAQ.flatMap(([pregunta, respuesta]) => [`### ${pregunta}`, '', respuesta, '']),
    '## Enlaces',
    '',
    `- [Sitio de CliniQ](${sitio}/): presentación del producto, recorrido por roles y planes`,
    `- [Crear una clínica (prueba de 14 días)](${sitio}/registro-clinica)`,
    `- [Términos y condiciones](${sitio}/terminos)`,
    `- [Política de tratamiento de datos personales](${sitio}/privacidad)`,
    '',
    '## Contacto',
    '',
    `- ${EMPRESA.razonSocial}, NIT ${EMPRESA.nit}`,
    `- ${EMPRESA.direccion}, ${EMPRESA.ciudad}`,
    `- ${EMPRESA.correo}`,
    '',
  ].join('\n')

  return new Response(texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

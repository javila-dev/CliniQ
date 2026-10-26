import type { Metadata } from 'next'
import { LandingPageV3 } from '@/components/marketing/landing/LandingPageV3'
import { DatosEstructurados } from '@/components/marketing/landing/DatosEstructurados'
import { obtenerPlanesPublicos } from '@/lib/planesPublicos'
import { DOMINIOS_SEPARADOS, SITIO_URL } from '@/lib/dominios'

const TITULO = 'CliniQ — Gestión para clínicas estéticas'
const DESCRIPCION =
  'Agenda, historia clínica, consentimientos, cartera e inventario por sede en un solo sistema para clínicas estéticas y de bienestar en Colombia. 14 días de prueba sin tarjeta.'

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  // En su propio dominio el landing es la raíz (/): canonical y vista previa
  // al compartir el enlace.
  ...(DOMINIOS_SEPARADOS && {
    metadataBase: new URL(SITIO_URL),
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'es_CO',
      siteName: 'CliniQ',
      url: '/',
      title: TITULO,
      description: DESCRIPCION,
      images: [{ url: `${SITIO_URL}/img/landing/dashboard.png`, width: 2880, height: 1800, alt: 'Dashboard de CliniQ' }],
    },
  }),
}

// Los planes se leen en el servidor cada hora: los precios quedan en el HTML
// para buscadores y agentes de IA, que no ejecutan JavaScript.
export const revalidate = 3600

export default async function Page() {
  const planes = await obtenerPlanesPublicos()
  return (
    <>
      <DatosEstructurados planes={planes} />
      <LandingPageV3 planes={planes} />
    </>
  )
}

import type { Metadata } from 'next'
import { LandingPageV3 } from '@/components/marketing/landing/LandingPageV3'

export const metadata: Metadata = {
  title: 'CliniQ — Gestión para clínicas estéticas',
  description:
    'Agenda, historia clínica, consentimientos, cartera e inventario por sede en un solo sistema para clínicas estéticas y de bienestar en Colombia. 14 días de prueba sin tarjeta.',
}

export default function Page() {
  return <LandingPageV3 />
}

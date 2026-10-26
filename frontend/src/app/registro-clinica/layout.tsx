import type { Metadata } from 'next'
import { DOMINIOS_SEPARADOS, SITIO_URL } from '@/lib/dominios'

// La página es de cliente y no puede exportar metadata.
export const metadata: Metadata = {
  title: 'Prueba CliniQ 14 días gratis',
  description: 'Registra tu clínica estética y prueba CliniQ durante 14 días, sin tarjeta de crédito.',
  ...(DOMINIOS_SEPARADOS && {
    metadataBase: new URL(SITIO_URL),
    alternates: { canonical: '/registro-clinica' },
  }),
}

export default function RegistroClinicaLayout({ children }: { children: React.ReactNode }) {
  return children
}

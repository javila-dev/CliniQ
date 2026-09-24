import localFont from 'next/font/local'

// Tipografía de la app: Geist para texto y Geist Mono para datos.
// Se reutilizan los mismos archivos que ya sirve la landing.

export const geist = localFont({
  src: '../components/marketing/landing/fonts/Geist.woff2',
  weight: '300 700',
  variable: '--font-sans',
  display: 'swap',
})

export const geistMono = localFont({
  src: '../components/marketing/landing/fonts/GeistMono.woff2',
  weight: '400 600',
  variable: '--font-mono',
  display: 'swap',
})

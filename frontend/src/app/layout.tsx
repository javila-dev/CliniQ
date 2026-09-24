import type { Metadata } from 'next'
import './globals.css'
import { QueryProvider } from '@/components/shared/QueryProvider'
import { Toaster } from '@/components/ui/toaster'
import { geist, geistMono } from './fonts'

export const metadata: Metadata = {
  title: 'CliniQ — Gestión Clínica Estética',
  description: 'Sistema de gestión para clínica estética',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  )
}

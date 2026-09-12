'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

// Todo /ayuda/* (incluida la gestión, que tiene su propio guard más estricto
// anidado) queda detrás del flag global: un gestor siempre entra (para poder
// preparar contenido antes de activarlo); el resto solo si ya está habilitado.
export default function AyudaLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={canAccess.ayudaCentro}>{children}</RoleGuard>
}

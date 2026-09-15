'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { AyudaSearchBar } from '@/components/ayuda/AyudaSearchBar'

// Todo /ayuda/* (incluida la gestión, que tiene su propio guard más estricto
// anidado) queda detrás del flag global: un gestor siempre entra (para poder
// preparar contenido antes de activarlo); el resto solo si ya está habilitado.
//
// La barra de búsqueda vive acá (no en cada page) para que esté disponible en
// todo lo que cuelga de /ayuda: el inicio, un artículo abierto, el listado de
// videos, etc.
export default function AyudaLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard check={canAccess.ayudaCentro}>
      <div className="mx-auto w-full max-w-5xl">
        <AyudaSearchBar className="mb-6" />
      </div>
      {children}
    </RoleGuard>
  )
}

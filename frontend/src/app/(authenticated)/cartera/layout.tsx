'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { hasPermission, PERM } from '@/lib/permissions'

/** Cartera (lista y detalle): solo con "ver cartera". Antes se entraba por URL
 *  sin el permiso y la pantalla fallaba (QA-10). */
export default function CarteraLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={(u) => hasPermission(u, PERM.CARTERA_VER)}>{children}</RoleGuard>
}

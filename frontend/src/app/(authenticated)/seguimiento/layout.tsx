'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { hasPermission, PERM } from '@/lib/permissions'

/** Seguimiento: solo con "ver oportunidades". Antes se entraba por URL sin el
 *  permiso y la pantalla fallaba (QA-10). */
export default function SeguimientoLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={(u) => hasPermission(u, PERM.SEGUIMIENTO_VER)}>{children}</RoleGuard>
}

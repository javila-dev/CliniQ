'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { hasPermission, PERM } from '@/lib/permissions'

/** Cotizaciones (lista, nueva y detalle): solo con "ver cotizaciones". Antes se
 *  entraba por URL sin el permiso y la pantalla fallaba (QA-10). */
export default function CotizacionesLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={(u) => hasPermission(u, PERM.COTIZACIONES_VER)}>{children}</RoleGuard>
}

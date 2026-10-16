'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

/** La atención clínica: solo quien atiende (la lista ya tenía la guarda). Antes
 *  se entraba por URL sin el permiso y la pantalla fallaba (QA-10). */
export default function AtencionCitaLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={canAccess.atenciones}>{children}</RoleGuard>
}

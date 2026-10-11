'use client'

import { usePathname } from 'next/navigation'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ConfiguracionShell } from '@/components/configuracion/ConfiguracionShell'
import { puedeEntrarAConfiguracion } from '@/components/configuracion/navegacion'
import { hasPermission, PERM } from '@/lib/permissions'
import type { AuthUser } from '@/types/auth'

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // Promociones vive bajo /configuracion pero se abre desde el menú Comercial.
  const check = (u: AuthUser | null | undefined) =>
    pathname.startsWith('/configuracion/campanas')
      ? hasPermission(u, PERM.CAMPANAS_GESTIONAR)
      : puedeEntrarAConfiguracion(u)
  return (
    <RoleGuard check={check}>
      <ConfiguracionShell>{children}</ConfiguracionShell>
    </RoleGuard>
  )
}

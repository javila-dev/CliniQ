'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { ConfiguracionShell } from '@/components/configuracion/ConfiguracionShell'
import { canAccess } from '@/lib/permissions'

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard check={canAccess.configuracion}>
      <ConfiguracionShell>{children}</ConfiguracionShell>
    </RoleGuard>
  )
}

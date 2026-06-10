'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

export default function ConfiguracionLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={canAccess.configuracion}>{children}</RoleGuard>
}

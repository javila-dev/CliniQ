'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

export default function GestionAyudaLayout({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={canAccess.ayudaAdmin}>{children}</RoleGuard>
}

'use client'

import { useAuthStore } from '@/store/authStore'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'

export function EquipoShell({ children }: { children: React.ReactNode }) {
  return <RoleGuard check={canAccess.equipo}>{children}</RoleGuard>
}

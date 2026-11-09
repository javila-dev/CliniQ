'use client'

import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { CabinasYEquipos } from '@/components/configuracion/CabinasYEquipos'

// Cabinas, consultorios y equipos de las sedes (docs/plan-salas-y-equipos.md).
export default function CabinasYEquiposPage() {
  const { user } = useAuthStore()
  return (
    <div className="space-y-6">
      <PageHeader title="Cabinas y equipos" />
      <CabinasYEquipos puedeGestionar={hasPermission(user, PERM.SEDES_GESTIONAR)} />
    </div>
  )
}

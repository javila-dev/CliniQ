'use client'

import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { canAccess } from '@/lib/permissions'
import { RoleGuard } from '@/components/shared/RoleGuard'

export default function PuestaEnMarchaLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const { data: miClinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: !!user,
  })

  return (
    <RoleGuard check={canAccess.puestaEnMarcha}>
      {isLoading ? null : !miClinica?.modo_puesta_en_marcha ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-sm font-medium">El modo puesta en marcha no está habilitado.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pídele al equipo de CliniQ que lo active mientras migras los datos de tu clínica.
          </p>
        </div>
      ) : (
        children
      )}
    </RoleGuard>
  )
}

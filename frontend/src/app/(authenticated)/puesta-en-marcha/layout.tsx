'use client'

import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'

/** El asistente de puesta en marcha (cargar pacientes en curso) es una acción
 *  operativa, no de configuración: cualquier usuario autenticado de la
 *  clínica puede usarlo mientras el toggle `modo_puesta_en_marcha` esté
 *  activo — no depende de ningún permiso. */
export default function PuestaEnMarchaLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const { data: miClinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: !!user,
  })

  if (isLoading) return null

  if (!miClinica?.modo_puesta_en_marcha) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="text-sm font-medium">El modo puesta en marcha no está habilitado.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pídele al equipo de CliniQ que lo active mientras migras los datos de tu clínica.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

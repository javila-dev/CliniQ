'use client'

import { useAuthStore } from '@/store/authStore'

/** El asistente de puesta en marcha (cargar pacientes en curso) es una acción
 *  operativa, no de configuración: cualquier usuario autenticado de la
 *  clínica puede usarlo mientras el toggle `modo_puesta_en_marcha` esté
 *  activo — no depende de ningún permiso. El flag viaja en el perfil del
 *  usuario (login/me), no requiere el permiso clinicas.ver. */
export default function PuestaEnMarchaLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading || !user) return null

  if (!user.modo_puesta_en_marcha) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="text-sm font-medium">La migración de pacientes en curso no está habilitada.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pídele al equipo de CliniQ que lo active mientras migras los datos de tu clínica.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

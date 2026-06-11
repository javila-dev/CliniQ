import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { useAuthStore } from '@/store/authStore'
import { isAdminOrSuperAdmin } from '@/lib/permissions'
import type { ColaboradorSede } from '@/types/colaboradores'

/**
 * Devuelve las sedes a las que el usuario tiene acceso:
 * - admin/superadmin o sede_id === null: todas las sedes activas de la clínica
 * - otros: las sedes asignadas a su perfil de colaborador (sedes_detalle)
 */
export function useUserSedes(): { sedes: ColaboradorSede[]; isLoading: boolean } {
  const { user } = useAuthStore()
  const isAllSedes = isAdminOrSuperAdmin(user) || !user?.sede_id

  const { data: todasSedes, isLoading: loadingTodas } = useQuery({
    queryKey: ['sedes', 'activas'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
    staleTime: 10 * 60 * 1000,
    enabled: !!user && isAllSedes,
  })

  const { data: colaborador, isLoading: loadingColab } = useQuery({
    queryKey: ['colaborador', 'me', user?.id],
    queryFn: () => colaboradoresApi.list({ user: user!.id }),
    staleTime: 10 * 60 * 1000,
    enabled: !!user && !isAllSedes,
    select: (data) => data.results[0] ?? null,
  })

  if (isAllSedes) {
    return {
      sedes: (todasSedes?.results ?? []).map((s) => ({ id: s.id, nombre: s.nombre })),
      isLoading: loadingTodas,
    }
  }

  return {
    sedes: colaborador?.sedes_detalle ?? (user?.sede_id ? [{ id: user.sede_id, nombre: '' }] : []),
    isLoading: loadingColab,
  }
}

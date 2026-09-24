import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { isAdminOrSuperAdmin } from '@/lib/permissions'
import type { ColaboradorSede } from '@/types/colaboradores'

export interface UseUserSedes {
  /** Sedes a las que el usuario tiene acceso. */
  sedes: ColaboradorSede[]
  isLoading: boolean
  /**
   * true = el usuario ve todas las sedes de la clínica (admin/superadmin o sin
   * sede asignada). false = está acotado a `sedes`.
   */
  isAllSedes: boolean
  /**
   * Sede con la que inicializar un filtro:
   * - usuario acotado -> su primera sede (nunca arranca en "todas")
   * - all-sedes -> null ("todas" / sin filtro)
   */
  defaultSedeId: string | null
}

/**
 * Devuelve las sedes a las que el usuario tiene acceso:
 * - acotado: `user.sedes` de /auth/me (sede principal + asignadas, ya activas)
 * - admin/superadmin o `user.sedes === null`: todas las sedes activas de la clínica
 */
export function useUserSedes(): UseUserSedes {
  const { user } = useAuthStore()
  const sedesUsuario = user?.sedes ?? null
  const isAllSedes = isAdminOrSuperAdmin(user) || sedesUsuario === null

  const { data: todasSedes, isLoading: loadingTodas } = useQuery({
    queryKey: ['sedes', 'activas'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
    staleTime: 10 * 60 * 1000,
    enabled: !!user && isAllSedes,
  })

  const sedes: ColaboradorSede[] = isAllSedes
    ? (todasSedes?.results ?? []).map((s) => ({ id: s.id, nombre: s.nombre }))
    : (sedesUsuario ?? [])

  const defaultSedeId = isAllSedes ? null : (sedes[0]?.id ?? user?.sede_id ?? null)

  return { sedes, isLoading: isAllSedes ? loadingTodas : false, isAllSedes, defaultSedeId }
}

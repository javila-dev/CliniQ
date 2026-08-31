import { useQuery } from '@tanstack/react-query'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
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
   * Mientras se resuelve, usa `user.sede_id` como fallback para no dejar una
   * ventana sin scope en usuarios acotados.
   */
  defaultSedeId: string | null
}

/**
 * Devuelve las sedes a las que el usuario tiene acceso:
 * - admin/superadmin o sede_id === null: todas las sedes activas de la clínica
 * - otros: las sedes asignadas a su perfil de colaborador (sedes_detalle)
 *
 * En todos los casos los nombres se resuelven contra la lista de sedes activas
 * de la clínica (recepción y profesional tienen `sedes.ver`), así nunca se
 * devuelve una sede con el nombre en blanco.
 */
export function useUserSedes(): UseUserSedes {
  const { user } = useAuthStore()
  const isAllSedes = isAdminOrSuperAdmin(user) || !user?.sede_id

  const { data: todasSedes, isLoading: loadingTodas } = useQuery({
    queryKey: ['sedes', 'activas'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
    staleTime: 10 * 60 * 1000,
    enabled: !!user,
  })

  const { data: colaborador, isLoading: loadingColab } = useQuery({
    queryKey: ['colaborador', 'me', user?.id],
    queryFn: () => colaboradoresApi.list({ user: user!.id }),
    staleTime: 10 * 60 * 1000,
    enabled: !!user && !isAllSedes,
    select: (data) => data.results[0] ?? null,
  })

  const activas: ColaboradorSede[] = (todasSedes?.results ?? []).map((s) => ({ id: s.id, nombre: s.nombre }))

  let sedes: ColaboradorSede[]
  let isLoading: boolean

  if (isAllSedes) {
    sedes = activas
    isLoading = loadingTodas
  } else {
    // Sedes del perfil de colaborador (puede haber varias), descartando entradas sin nombre.
    const desdeColaborador = (colaborador?.sedes_detalle ?? []).filter((s) => s.nombre?.trim())
    if (desdeColaborador.length > 0) {
      sedes = desdeColaborador
      isLoading = loadingColab
    } else {
      // Fallback: la sede fija del usuario, resolviendo el nombre contra las sedes activas.
      const propia = activas.find((s) => s.id === user?.sede_id)
      sedes = propia
        ? [propia]
        : user?.sede_id
          ? [{ id: user.sede_id, nombre: 'Sede asignada' }]
          : []
      isLoading = loadingColab || loadingTodas
    }
  }

  const defaultSedeId = isAllSedes
    ? null
    : sedes.length > 0
      ? sedes[0].id
      : (user?.sede_id ?? null)

  return { sedes, isLoading, isAllSedes, defaultSedeId }
}

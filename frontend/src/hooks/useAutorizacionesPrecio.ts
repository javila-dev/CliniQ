'use client'

import { useQuery } from '@tanstack/react-query'

import { autorizacionesPrecioApi } from '@/lib/api/cotizaciones'
import { hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'

export const AUTORIZACIONES_CONTADOR_KEY = ['autorizaciones-precio', 'contador'] as const
export const AUTORIZACIONES_LISTA_KEY = ['autorizaciones-precio', 'lista'] as const

/** Solicitudes de precio pendientes en las sedes de quien autoriza. Sin websockets:
 * se consulta cada 30 s (y al volver a la pestaña) solo si tiene el permiso. */
export function useAutorizacionesPendientes() {
  const { user } = useAuthStore()
  const puedeAutorizar = hasPermission(user, PERM.COTIZACIONES_CAMBIAR_PRECIO)
  const { data } = useQuery({
    queryKey: AUTORIZACIONES_CONTADOR_KEY,
    queryFn: () => autorizacionesPrecioApi.contador(),
    enabled: puedeAutorizar,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })
  return { puedeAutorizar, pendientes: data?.pendientes ?? 0, ultimaEn: data?.ultima_en ?? null }
}

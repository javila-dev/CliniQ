import { useQuery } from '@tanstack/react-query'
import { formasPagoApi } from '@/lib/api/formasPago'
import { TIPOS_BASE_NO_MEDIO_REAL, type FormaDePago } from '@/types/formasPago'

interface UseFormasPagoOptions {
  /** Excluye tipo_base que son plan/estructura (cuotas, financiamiento), no un medio real de cobro. */
  soloMedioReal?: boolean
}

export function useFormasPago(options?: UseFormasPagoOptions) {
  const { data, isLoading } = useQuery({
    queryKey: ['formas-pago'],
    queryFn: () => formasPagoApi.list({ activo: true }),
    staleTime: 5 * 60 * 1000,
  })

  let formas: FormaDePago[] = data?.results ?? []
  if (options?.soloMedioReal) {
    formas = formas.filter((f) => !TIPOS_BASE_NO_MEDIO_REAL.includes(f.tipo_base))
  }

  return { formasPago: formas, isLoading }
}

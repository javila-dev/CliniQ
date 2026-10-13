'use client'

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'

/**
 * Consentimiento firmado cuyo PDF no se pudo traer de Documenso: antes se veía
 * sin enlace y sin aviso. Muestra "PDF pendiente · Reintentar".
 */
export function ReintentarPdfConsentimiento({ consentimientoId, invalidar }: {
  consentimientoId: string
  /** Consultas a refrescar cuando el PDF ya quedó guardado. */
  invalidar: QueryKey[]
}) {
  const queryClient = useQueryClient()
  const { mutate, isPending } = useMutation({
    mutationFn: () => historiaClinicaApi.consentimientosInformados.reintentarPdf(consentimientoId),
    onSuccess: () => {
      invalidar.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
      toast.success('PDF recuperado')
    },
    onError: (err) => toast.error('El PDF aún no está listo', mensajeDeError(err)),
  })

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
      PDF pendiente ·
      <button
        type="button"
        onClick={() => mutate()}
        disabled={isPending}
        className="inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Reintentar
      </button>
    </span>
  )
}

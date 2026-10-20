'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { avisarGuardado, FilaAjuste, NotaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

/** Sección "Cotizaciones" de Configuración → Comercial: el documento que firma
 *  el paciente al aceptar una cotización (antes era la pestaña "Otros documentos"). */
export function CotizacionesAjustes() {
  const queryClient = useQueryClient()

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['config-cartera'],
    queryFn: () => clinicasApi.carteraConfig.get(),
  })

  const mutation = useMutation({
    mutationFn: (data: { requiere_consentimiento_promocional: boolean }) =>
      clinicasApi.carteraConfig.update(data),
    onSuccess: (data) => {
      queryClient.setQueryData(['config-cartera'], data)
    },
    onError: () => {
      toast.error('No se pudo guardar', 'Intenta de nuevo.')
    },
  })

  function cambiarRequiere(valor: boolean, conDeshacer = true) {
    mutation.mutate(
      { requiere_consentimiento_promocional: valor },
      { onSuccess: () => avisarGuardado(conDeshacer ? () => cambiarRequiere(!valor, false) : undefined) },
    )
  }

  // Mientras se guarda se muestra el valor nuevo.
  const requiereActivo = (mutation.isPending ? mutation.variables?.requiere_consentimiento_promocional : undefined)
    ?? config?.requiere_consentimiento_promocional ?? false

  return (
    <SeccionAjustes
      id="cotizaciones"
      titulo="Cotizaciones"
      descripcion="Lo que firma el paciente cuando acepta una cotización."
    >
      {isLoading ? (
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
          <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
        </div>
      ) : isError ? (
        <FilaAjuste titulo="No se pudo cargar la configuración.">
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
        </FilaAjuste>
      ) : (
        <>
          <FilaAjuste
            icono={Receipt}
            apagada={!requiereActivo}
            titulo="Aceptación y compromiso de pago firmados"
            descripcion={requiereActivo
              ? 'Al aceptar una cotización queda pendiente de firma un documento con los servicios aceptados, el valor total y la forma de pago (valores y fechas).'
              : 'Apagado: la cotización se acepta sin documento de compromiso de pago.'}
          >
            <Switch
              checked={requiereActivo}
              disabled={mutation.isPending}
              onCheckedChange={(v) => cambiarRequiere(v)}
              aria-label="Aceptación y compromiso de pago firmados"
            />
          </FilaAjuste>
          <NotaAjuste>El texto del documento es estándar y no se edita: aquí solo lo activas o lo desactivas.</NotaAjuste>
        </>
      )}
    </SeccionAjustes>
  )
}

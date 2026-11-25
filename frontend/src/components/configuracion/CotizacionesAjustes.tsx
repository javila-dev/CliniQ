'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgePercent, CalendarClock, Receipt } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { avisarGuardado, FilaAjuste, NotaAjuste, SeccionAjustes, SelectAjuste } from '@/components/configuracion/ajustes'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { ConfiguracionCartera } from '@/types/clinicas'

type CambioCartera = Partial<Omit<ConfiguracionCartera, 'updated_at'>>

const PLAZOS = [15, 30, 45, 60, 90, 120, 180, 365]

/** Sección "Cotizaciones" de Configuración → Comercial: el documento que firma
 *  el paciente al aceptar una cotización (antes era la pestaña "Otros documentos").
 *  Puede llevar el compromiso de pago, las condiciones de compra promocional o
 *  las dos cosas en un mismo documento con una sola firma. */
export function CotizacionesAjustes() {
  const queryClient = useQueryClient()

  const { data: config, isLoading, isError, refetch } = useQuery({
    queryKey: ['config-cartera'],
    queryFn: () => clinicasApi.carteraConfig.get(),
  })

  const mutation = useMutation({
    mutationFn: (data: CambioCartera) => clinicasApi.carteraConfig.update(data),
    onSuccess: (data) => {
      queryClient.setQueryData(['config-cartera'], data)
    },
    onError: () => {
      toast.error('No se pudo guardar', 'Intenta de nuevo.')
    },
  })

  function guardar(cambio: CambioCartera, deshacer?: CambioCartera) {
    mutation.mutate(cambio, {
      onSuccess: () => avisarGuardado(deshacer ? () => guardar(deshacer) : undefined),
    })
  }

  // Mientras se guarda se muestra el valor nuevo.
  function valor<K extends keyof CambioCartera>(campo: K, porDefecto: NonNullable<CambioCartera[K]>) {
    const pendiente = mutation.isPending ? mutation.variables?.[campo] : undefined
    return (pendiente ?? config?.[campo] ?? porDefecto) as NonNullable<CambioCartera[K]>
  }

  const compromisoActivo = valor('requiere_consentimiento_promocional', false)
  const promocionalActivo = valor('exige_condiciones_compra_promocional', false)
  const plazo = valor('plazo_inicio_promocional_dias', 90)
  const opcionesPlazo = (PLAZOS.includes(plazo) ? PLAZOS : [...PLAZOS, plazo].sort((a, b) => a - b))
    .map((dias) => ({ value: String(dias), label: `${dias} días` }))

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
            apagada={!compromisoActivo}
            titulo="Aceptación y compromiso de pago firmados"
            descripcion={compromisoActivo
              ? 'Al aceptar una cotización queda pendiente de firma un documento con los servicios aceptados, el valor total y la forma de pago (valores y fechas).'
              : 'Apagado: la cotización se acepta sin documento de compromiso de pago.'}
          >
            <Switch
              checked={compromisoActivo}
              disabled={mutation.isPending}
              onCheckedChange={(v) => guardar({ requiere_consentimiento_promocional: v }, { requiere_consentimiento_promocional: !v })}
              aria-label="Aceptación y compromiso de pago firmados"
            />
          </FilaAjuste>
          <FilaAjuste
            icono={BadgePercent}
            apagada={!promocionalActivo}
            titulo="Condiciones de compra promocional"
            descripcion={promocionalActivo
              ? 'Toda venta lleva una página donde el paciente acepta que no hay devolución de dinero, que no se cambia por otro tratamiento, que no es transferible y el plazo para iniciarlo. La firman el paciente y quien hizo la cotización.'
              : 'Apagado: las ventas no llevan condiciones de compra promocional.'}
          >
            <Switch
              checked={promocionalActivo}
              disabled={mutation.isPending}
              onCheckedChange={(v) => guardar({ exige_condiciones_compra_promocional: v }, { exige_condiciones_compra_promocional: !v })}
              aria-label="Condiciones de compra promocional"
            />
          </FilaAjuste>
          {promocionalActivo && (
            <FilaAjuste
              icono={CalendarClock}
              titulo="Plazo para iniciar el tratamiento"
              descripcion="Días que tiene el paciente para empezar, contados desde la compra."
            >
              <SelectAjuste
                valor={String(plazo)}
                opciones={opcionesPlazo}
                deshabilitado={mutation.isPending}
                etiqueta="Plazo para iniciar el tratamiento"
                onCambiar={(v) => guardar(
                  { plazo_inicio_promocional_dias: Number(v) },
                  { plazo_inicio_promocional_dias: plazo },
                )}
              />
            </FilaAjuste>
          )}
          <NotaAjuste>
            El texto de los documentos es estándar y no se edita: aquí solo los activas o los desactivas.
            Si activas los dos, van en un mismo documento y el paciente firma una sola vez. Quien cotiza
            necesita su firma guardada en el perfil para las condiciones de compra promocional.
          </NotaAjuste>
        </>
      )}
    </SeccionAjustes>
  )
}

'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Building2, Loader2, MessageCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { clinicasApi } from '@/lib/api/clinicas'
import { notificacionesFallidasApi, veEnviosFallidos } from '@/lib/api/notificaciones'
import { cn } from '@/lib/utils'
import { EtiquetaAjuste, FilaAjuste, SeccionAjustes, VacioAjustes } from '@/components/configuracion/ajustes'

// Consumo de WhatsApp del mes y envíos que no salieron. Los envíos desde los
// números de la clínica no cuentan en el cupo del plan (los cobra Meta).

function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </>
  )
}

export default function ConsumoWhatsappPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id
  const veFallidos = veEnviosFallidos(user)

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })
  const { data: fallidasData, isLoading: cargandoFallidas } = useQuery({
    queryKey: ['notificaciones', 'fallidas'],
    queryFn: () => notificacionesFallidasApi.list({ resuelta: false }),
    enabled: veFallidos,
  })
  const resolver = useMutation({
    mutationFn: (id: string) => notificacionesFallidasApi.resolver(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones', 'fallidas'] }),
  })

  const uso = clinica?.whatsapp_uso
  const fallidas = fallidasData?.results ?? []
  const pct = uso && !uso.sin_limite && uso.envios_incluidos
    ? Math.min((uso.envios_realizados / uso.envios_incluidos) * 100, 100)
    : 0

  return (
    <div className="space-y-6">
      <PageHeader title="Consumo y envíos" description="Mensajes de WhatsApp enviados este mes y los que no se pudieron enviar." />

      <div className="space-y-7">
        <SeccionAjustes titulo="Este mes" descripcion="Mensajes enviados este mes. El cupo de tu plan se reinicia cada mes.">
          {isLoading ? (
            <FilasCargando filas={2} />
          ) : !clinica?.whatsapp_habilitado || !uso ? (
            <VacioAjustes
              titulo="Tu plan no incluye envíos por WhatsApp"
              descripcion="Escríbenos para activarlo."
            />
          ) : (
            <>
              <FilaAjuste
                icono={MessageCircle}
                titulo="Desde el número de CliniQ"
                descripcion="Cuentan en el cupo de tu plan. Incluye los códigos de check-in y los mensajes que no pudieron salir desde tu número."
                contenido={!uso.sin_limite && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
                  </div>
                )}
              >
                <p className="text-sm tabular-nums">
                  <span className="font-semibold">{uso.envios_realizados}</span>
                  <span className="text-muted-foreground"> / {uso.sin_limite ? '∞' : uso.envios_incluidos}</span>
                </p>
              </FilaAjuste>
              {clinica.whatsapp_numero_propio_habilitado && (
                <FilaAjuste
                  icono={Building2}
                  titulo="Desde los números de tu clínica"
                  descripcion="No consumen el cupo del plan: Meta los cobra directamente a tu cuenta de WhatsApp Business."
                >
                  <p className="text-sm tabular-nums">
                    <span className="font-semibold">{uso.envios_numero_propio ?? 0}</span>
                    <span className="text-muted-foreground"> enviados</span>
                  </p>
                </FilaAjuste>
              )}
            </>
          )}
        </SeccionAjustes>

        {veFallidos && (
          <SeccionAjustes
            titulo="Envíos que no salieron"
            descripcion="Mensajes que no llegaron al paciente. Márcalos como revisados cuando los resuelvas."
            accion={fallidas.length > 0 && <EtiquetaAjuste tono="aviso">{fallidas.length} sin revisar</EtiquetaAjuste>}
          >
            {cargandoFallidas ? (
              <FilasCargando filas={2} />
            ) : fallidas.length === 0 ? (
              <VacioAjustes
                titulo="Todos los mensajes salieron bien"
                descripcion="Si alguno no se puede enviar, aparece aquí para que lo revises."
              />
            ) : (
              fallidas.map((f) => (
                <FilaAjuste
                  key={f.id}
                  icono={AlertTriangle}
                  titulo={
                    <>
                      {f.tipo_notificacion_display}
                      {f.paciente_nombre && <span className="font-normal text-muted-foreground"> · {f.paciente_nombre}</span>}
                    </>
                  }
                  descripcion={
                    <>
                      {new Date(f.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {f.telefono && ` · ${f.telefono}`}
                      {f.motivo && <span className="mt-0.5 block text-red-700">{f.motivo}</span>}
                    </>
                  }
                >
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={resolver.isPending}
                    onClick={() => resolver.mutate(f.id)}
                  >
                    {resolver.isPending && resolver.variables === f.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : 'Marcar revisado'}
                  </Button>
                </FilaAjuste>
              ))
            )}
          </SeccionAjustes>
        )}
      </div>
    </div>
  )
}

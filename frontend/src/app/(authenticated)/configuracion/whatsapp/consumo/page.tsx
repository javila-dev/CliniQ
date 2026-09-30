'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { clinicasApi } from '@/lib/api/clinicas'
import { notificacionesFallidasApi } from '@/lib/api/notificaciones'
import { cn } from '@/lib/utils'
import { Bloque } from '@/components/configuracion/Bloque'

// Consumo de WhatsApp del mes y envíos que no salieron. Los envíos desde los
// números de la clínica no cuentan en el cupo del plan (los cobra Meta).

function Fila({ titulo, detalle, children }: { titulo: string; detalle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-[12.5px] text-muted-foreground">{detalle}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function ConsumoWhatsappPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const clinicaId = user?.clinica_id

  const { data: clinica, isLoading } = useQuery({
    queryKey: ['mi-clinica', clinicaId],
    queryFn: () => clinicasApi.miClinica(clinicaId),
    enabled: !!clinicaId,
  })
  const { data: fallidasData, isLoading: cargandoFallidas } = useQuery({
    queryKey: ['notificaciones', 'fallidas'],
    queryFn: () => notificacionesFallidasApi.list({ resuelta: false }),
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
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Consumo y envíos" description="Mensajes de WhatsApp enviados este mes y los que no se pudieron enviar." />

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl border bg-muted/40" />
      ) : !clinica?.whatsapp_habilitado || !uso ? (
        <p className="rounded-xl border bg-white px-4 py-4 text-sm text-muted-foreground">
          Tu plan no incluye envíos por WhatsApp. Escríbenos para activarlo.
        </p>
      ) : (
        <Bloque titulo="Este mes">
          <Fila
            titulo="Desde el número de CliniQ"
            detalle="Cuentan en el cupo de tu plan. Incluye los códigos de check-in y los mensajes que no pudieron salir desde tu número."
          >
            <p className="shrink-0 text-sm tabular-nums">
              <span className="font-semibold">{uso.envios_realizados}</span>
              <span className="text-muted-foreground"> / {uso.sin_limite ? '∞' : uso.envios_incluidos}</span>
            </p>
          </Fila>
          {!uso.sin_limite && (
            <div className="px-4 pb-3.5 pt-0">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-amber-500' : 'bg-primary')} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {clinica.whatsapp_numero_propio_habilitado && (
            <Fila
              titulo="Desde los números de tu clínica"
              detalle="No consumen el cupo del plan: Meta los cobra directamente a tu cuenta de WhatsApp Business."
            >
              <p className="shrink-0 text-sm tabular-nums">
                <span className="font-semibold">{uso.envios_numero_propio ?? 0}</span>
                <span className="text-muted-foreground"> enviados</span>
              </p>
            </Fila>
          )}
        </Bloque>
      )}

      <Bloque
        titulo="Envíos que no salieron"
        extra={fallidas.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-medium text-amber-700">
            {fallidas.length} sin revisar
          </span>
        )}
      >
        {cargandoFallidas ? (
          <div className="h-16 animate-pulse bg-muted/40" />
        ) : fallidas.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Todos los mensajes salieron bien.
          </p>
        ) : (
          fallidas.map((f) => (
            <div key={f.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {f.tipo_notificacion_display}
                  {f.paciente_nombre && <span className="font-normal text-muted-foreground"> · {f.paciente_nombre}</span>}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                  {new Date(f.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {f.telefono && ` · ${f.telefono}`}
                </p>
                {f.motivo && <p className="mt-1 text-[12.5px] text-red-700">{f.motivo}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={resolver.isPending}
                onClick={() => resolver.mutate(f.id)}
              >
                {resolver.isPending && resolver.variables === f.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : 'Marcar revisado'}
              </Button>
            </div>
          ))
        )}
      </Bloque>
    </div>
  )
}

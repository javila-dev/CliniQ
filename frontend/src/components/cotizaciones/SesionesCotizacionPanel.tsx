'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import type { EstadoCita } from '@/types/agenda'

interface SesionesCotizacionPanelProps {
  cotizacionId: string
  pacienteId: string
}

const ESTADO_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pendiente:   { label: 'Pendiente',   variant: 'secondary',   icon: Clock         },
  confirmada:  { label: 'Confirmada',  variant: 'outline',     icon: CheckCircle2  },
  en_espera:   { label: 'En espera',   variant: 'secondary',   icon: Clock         },
  en_curso:    { label: 'En curso',    variant: 'default',     icon: Clock         },
  completada:  { label: 'Completada',  variant: 'success',     icon: CheckCircle2  },
  cancelada:   { label: 'Cancelada',   variant: 'destructive', icon: XCircle       },
  no_asistio:  { label: 'No asistió',  variant: 'destructive', icon: AlertCircle   },
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] ?? { label: estado, variant: 'secondary', icon: Clock }
  return (
    <Badge variant={cfg.variant as any} className="text-xs gap-1">
      <cfg.icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  )
}

export function SesionesCotizacionPanel({ cotizacionId, pacienteId }: SesionesCotizacionPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['cotizacion-sesiones', cotizacionId],
    queryFn: () => cotizacionesApi.sesiones(cotizacionId),
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seguimiento de sesiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!data?.items.length) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Seguimiento de sesiones
          </CardTitle>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/agenda`}>
              Ir a agenda
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.items.map((item) => {
          const usadas = item.num_citas - item.citas_restantes
          const pct = item.num_citas > 0 ? Math.round((usadas / item.num_citas) * 100) : 0

          return (
            <div key={item.item_id} className="space-y-3">
              {/* Header del ítem */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{item.descripcion}</p>
                    {item.tipo && item.tipo !== 'libre' && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                        item.tipo === 'tratamiento'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {item.tipo === 'tratamiento' ? 'Tratamiento' : 'Procedimiento'}
                      </span>
                    )}
                  </div>
                  {item.periodicidad && (
                    <p className="text-xs text-muted-foreground">{item.periodicidad}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold tabular-nums">{usadas}/{item.num_citas}</p>
                  <p className="text-xs text-muted-foreground">{item.citas_restantes} restantes</p>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="space-y-1">
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{item.citas_completadas} completadas · {item.citas_agendadas} agendadas</span>
                  <span>{pct}%</span>
                </div>
              </div>

              {/* Lista de citas */}
              {item.citas.length > 0 && (
                <div className="rounded-md border divide-y text-sm">
                  {item.citas.map((cita) => (
                    <div key={cita.cita_id} className="flex items-center justify-between px-3 py-2 gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{formatDateTime(cita.fecha_inicio)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {cita.profesional_nombre} · {cita.sede_nombre}
                        </p>
                      </div>
                      <EstadoBadge estado={cita.estado} />
                    </div>
                  ))}
                </div>
              )}

              {item.citas_restantes > 0 && (
                <div className="pt-1">
                  <Button size="sm" variant="outline" className="w-full text-xs" asChild>
                    <Link href={`/agenda?paciente=${pacienteId}`}>
                      <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                      Agendar siguiente sesión
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

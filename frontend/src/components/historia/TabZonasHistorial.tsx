'use client'

import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { AnotacionZona, ZonasVisita } from '@/types/historia'

interface Props {
  historiaId: string
}

const TIPO_LABELS: Record<string, string> = {
  equipo: 'Equipo',
  inyectable: 'Inyectable',
  topico: 'Tópico',
  laser: 'Láser',
  otro: 'Otro',
}

function resumenAnotacion(pin: AnotacionZona): string {
  const p = pin.parametros ?? {}
  switch (pin.tipo_aplicacion) {
    case 'equipo':
      return [p.equipo_nombre, p.potencia, p.tiempo].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'inyectable':
      return [p.producto, p.volumen_ml ? `${p.volumen_ml}ml` : null, p.tecnica].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'topico':
      return [p.producto, p.cantidad].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'laser':
      return [p.longitud_onda, p.fluencia ? `${p.fluencia}J/cm²` : null].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    default:
      return pin.texto || 'Sin nota'
  }
}

function DiagramaReadOnly({
  diagrama, anotaciones,
}: {
  diagrama: ZonasVisita['diagramas'][number]
  anotaciones: AnotacionZona[]
}) {
  const propias = anotaciones.filter((a) => a.diagrama === diagrama.id)

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{diagrama.nombre}</p>
      <div className="relative inline-block w-full max-w-xs mx-auto select-none">
        <div className="rounded-lg overflow-hidden border bg-white shadow-sm">
          {diagrama.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={diagrama.imagen_url} alt={diagrama.nombre} className="w-full h-auto block" draggable={false} />
          ) : (
            <div className="aspect-square flex items-center justify-center bg-muted">
              <MapPin className="h-8 w-8 text-muted-foreground/30" />
            </div>
          )}
        </div>
        {propias.map((a, i) => (
          <div key={a.id}>
            <div
              className="absolute rounded-full border-2 border-primary/50 bg-primary/8 pointer-events-none"
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                width: `${a.radio * 200}%`,
                aspectRatio: '1',
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="absolute w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow pointer-events-none"
              style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, transform: 'translate(-50%, -50%)' }}
            >
              {i + 1}
            </div>
          </div>
        ))}
      </div>
      {propias.length > 0 && (
        <ol className="space-y-1 text-xs">
          {propias.map((a, i) => (
            <li key={a.id} className="flex gap-1.5">
              <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
              <span>
                {TIPO_LABELS[a.tipo_aplicacion] && (
                  <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded-sm uppercase tracking-wide mr-1">
                    {TIPO_LABELS[a.tipo_aplicacion]}
                  </span>
                )}
                {resumenAnotacion(a)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function TabZonasHistorial({ historiaId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['historia-zonas', historiaId],
    queryFn: () => historiaClinicaApi.historias.zonas(historiaId),
    enabled: Boolean(historiaId),
    staleTime: 30_000,
  })

  const visitas = data ?? []

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => <div key={i} className="h-64 rounded-lg bg-muted" />)}
      </div>
    )
  }

  if (visitas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Sin zonas tratadas registradas todavía.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {visitas.map((visita) => (
        <div key={visita.nota_id} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatDate(visita.fecha)}</span>
            {visita.servicio && <><span>·</span><span>{visita.servicio}</span></>}
          </div>
          <div className={cn('grid gap-4', visita.diagramas.length > 1 && 'sm:grid-cols-2')}>
            {visita.diagramas.map((d) => (
              <DiagramaReadOnly key={d.id} diagrama={d} anotaciones={visita.anotaciones} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

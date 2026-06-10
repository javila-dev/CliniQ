'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Send, Upload } from 'lucide-react'
import { protocolosApi } from '@/lib/api/protocolos'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ConsentimientoSesionEstado } from '@/types/protocolos'

const ESTADO_CONFIG = {
  vigente:  { icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-50',  label: 'Vigente'  },
  vencido:  { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50',  label: 'Vencido'  },
  faltante: { icon: XCircle,       color: 'text-red-500',   bg: 'bg-red-50',    label: 'Faltante' },
}

function ConsentimientoFila({ c, pacienteId }: { c: ConsentimientoSesionEstado; pacienteId: string }) {
  const cfg = ESTADO_CONFIG[c.estado]
  const Icon = cfg.icon

  return (
    <div className={cn('flex items-start gap-3 rounded-lg px-3 py-2.5', cfg.bg)}>
      <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', cfg.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground">{c.template_nombre}</p>
          <span className="text-xs text-muted-foreground">({c.procedimiento})</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {c.estado === 'vigente' && c.vence && `Vence: ${new Date(c.vence).toLocaleDateString('es-CO')}`}
          {c.estado === 'vencido' && c.vencio && `Venció: ${new Date(c.vencio).toLocaleDateString('es-CO')}`}
          {c.estado === 'faltante' && 'No se ha firmado este consentimiento'}
        </p>
      </div>
      {c.estado !== 'vigente' && (
        <div className="flex items-center gap-1.5 shrink-0">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1">
            <Send className="h-2.5 w-2.5" />Documenso
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1">
            <Upload className="h-2.5 w-2.5" />Presencial
          </Button>
        </div>
      )}
    </div>
  )
}

interface Props {
  sesionId: string
  pacienteId: string
  onPuedeContinuar?: (puede: boolean) => void
}

export function ConsentimientosSesionCheck({ sesionId, pacienteId, onPuedeContinuar }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sesion-consentimientos', sesionId],
    queryFn: () => protocolosApi.sesionesEjecutadas.getConsentimientos(sesionId),
  })

  // Notify parent when data changes
  if (data) onPuedeContinuar?.(data.puede_ejecutar)

  if (isLoading) return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />Verificando consentimientos…
    </div>
  )

  if (isError || !data) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Consentimientos
        </p>
        {data.puede_ejecutar
          ? <span className="text-xs text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Todo en orden</span>
          : <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Requiere acción</span>
        }
      </div>
      <div className="space-y-1.5">
        {data.consentimientos.map((c, i) => (
          <ConsentimientoFila key={i} c={c} pacienteId={pacienteId} />
        ))}
      </div>
    </div>
  )
}

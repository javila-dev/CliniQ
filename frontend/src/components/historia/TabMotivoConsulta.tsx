'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { useBorradorNota } from './useBorradorNota'
import { EstadoGuardado } from './EstadoGuardado'
import { formatDate, formatTime } from '@/lib/utils'
import type { HistoriaClinica, NotaClinica } from '@/types/historia'

interface TabMotivoConsultaProps {
  historia: HistoriaClinica
  notas: NotaClinica[]
  notaId?: string   // presente en modo atención; ausente en modo historia
  /** Modo historia: muestra "Agregar evolución" (evoluciones fuera de una atención). */
  puedeAgregarEvolucion?: boolean
}

export function TabMotivoConsulta({ historia, notas, notaId, puedeAgregarEvolucion = false }: TabMotivoConsultaProps) {
  const modoAtencion = Boolean(notaId)
  const queryClient = useQueryClient()

  // ── Modo atención: textarea que guarda en la nota en progreso ────────────
  const notaActual = notas.find((n) => n.id === notaId)
  // Autoguardado: lo escrito no se pierde al cambiar de pestaña.
  const { texto, setTexto, estado, hayCambios, guardarAhora } = useBorradorNota(
    notaId, 'motivo_consulta', notaActual?.motivo_consulta ?? '', historia.id,
  )

  // ── Modo historia: evolución nueva, fuera de una atención ────────────────
  const [escribiendo, setEscribiendo] = useState(false)
  const [evolucion, setEvolucion] = useState('')
  const guardarEvolucion = useMutation({
    mutationFn: () => historiaClinicaApi.historias.agregarEvolucion(historia.id, evolucion.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historia', historia.id, 'notas'] })
      setEvolucion('')
      setEscribiendo(false)
      toast.success('Evolución guardada')
    },
    onError: (err) => toast.error('No se pudo guardar la evolución', mensajeDeError(err)),
  })

  // ── Modo historia: timeline de notas completadas (solo lectura) ──────────
  // Las mini-atenciones generadas desde una cotización no tienen un paso de
  // "completar" propio (siguen editables como borrador), así que se muestran
  // igual apenas tengan contenido, sin esperar ese estado. Las evoluciones van
  // intercaladas por fecha con las visitas.
  const timeline = notas
    .filter((n) => (n.estado === 'completada' || !!n.cotizacion) && (n.motivo_consulta ?? n.anamnesis)?.trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (modoAtencion) {
    return (
      <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
        <Label className="text-sm font-medium">Motivo de consulta</Label>
        <Textarea
          rows={6}
          placeholder="¿Qué trae al paciente hoy? ¿Evolución desde la última visita?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex items-center justify-end gap-3">
          <EstadoGuardado estado={estado} />
          <Button size="sm" variant="outline" onClick={guardarAhora} disabled={!hayCambios || estado === 'guardando'}>
            {estado === 'guardando'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Motivo de consulta y evoluciones
        </p>
        {puedeAgregarEvolucion && !escribiendo && (
          <Button size="sm" variant="outline" onClick={() => setEscribiendo(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Agregar evolución
          </Button>
        )}
      </div>

      {escribiendo && (
        <div className="space-y-2.5 rounded-lg border p-4">
          <Label htmlFor="evolucion-nueva" className="text-sm font-medium">Evolución</Label>
          <Textarea
            id="evolucion-nueva"
            rows={4}
            autoFocus
            maxLength={5000}
            value={evolucion}
            onChange={(e) => setEvolucion(e.target.value)}
            placeholder="Por ejemplo: llamada de control, la paciente refiere buena evolución, sin molestias."
          />
          <p className="text-xs text-muted-foreground">
            Queda firmada con tu nombre, la fecha y la hora, y no se puede editar después. Si hay un error, agrega otra evolución que lo aclare.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEscribiendo(false); setEvolucion('') }}
              disabled={guardarEvolucion.isPending}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={() => guardarEvolucion.mutate()} disabled={!evolucion.trim() || guardarEvolucion.isPending}>
              {guardarEvolucion.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Guardar evolución
            </Button>
          </div>
        </div>
      )}

      {timeline.length === 0 && !escribiendo && (
        <p className="text-sm text-muted-foreground italic">
          Aún no hay motivos de consulta ni evoluciones de este paciente.
        </p>
      )}
      <div className="space-y-3">
        {timeline.map((nota) => (
          <div key={nota.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="flex-1 w-px bg-border mt-1" />
            </div>
            <div className="pb-4 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{formatDate(nota.created_at)}</span>
                {nota.es_evolucion && (
                  <>
                    <span>{formatTime(nota.created_at)}</span>
                    <span className="rounded bg-primary/10 px-1.5 py-px font-medium text-primary">Evolución</span>
                  </>
                )}
                {nota.servicio_nombre && <><span>·</span><span className="uppercase">{nota.servicio_nombre}</span></>}
                {nota.profesional_nombre && <><span>·</span><span>{nota.profesional_nombre}</span></>}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{nota.motivo_consulta ?? nota.anamnesis}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useBorradorNota } from './useBorradorNota'
import { EstadoGuardado } from './EstadoGuardado'
import { formatDate } from '@/lib/utils'
import type { HistoriaClinica, NotaClinica } from '@/types/historia'

interface TabMotivoConsultaProps {
  historia: HistoriaClinica
  notas: NotaClinica[]
  notaId?: string   // presente en modo atención; ausente en modo historia
}

export function TabMotivoConsulta({ historia, notas, notaId }: TabMotivoConsultaProps) {
  const modoAtencion = Boolean(notaId)

  // ── Modo atención: textarea que guarda en la nota en progreso ────────────
  const notaActual = notas.find((n) => n.id === notaId)
  // Autoguardado: lo escrito no se pierde al cambiar de pestaña.
  const { texto, setTexto, estado, hayCambios, guardarAhora } = useBorradorNota(
    notaId, 'motivo_consulta', notaActual?.motivo_consulta ?? '', historia.id,
  )

  // ── Modo historia: timeline de notas completadas (solo lectura) ──────────
  // Las mini-atenciones generadas desde una cotización no tienen un paso de
  // "completar" propio (siguen editables como borrador), así que se muestran
  // igual apenas tengan contenido, sin esperar ese estado.
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Motivo de consulta por visita
      </p>
      {timeline.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Aún no hay registros de motivo de consulta en las notas de este paciente.
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
                {nota.servicio_nombre && <><span>·</span><span className="uppercase">{nota.servicio_nombre}</span></>}
                {nota.profesional_nombre && <><span>·</span><span>{nota.profesional_nombre}</span></>}
              </div>
              <p className="text-sm leading-relaxed">{nota.motivo_consulta ?? nota.anamnesis}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

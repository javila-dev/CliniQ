'use client'

import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
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
  const [texto, setTexto] = useState(notaActual?.motivo_consulta ?? '')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (notaActual?.motivo_consulta) setTexto(notaActual.motivo_consulta)
  }, [notaActual?.motivo_consulta])

  const { mutate, isPending } = useMutation({
    mutationFn: (value: string) => historiaClinicaApi.notas.patch(notaId!, { motivo_consulta: value }),
    onSuccess: () => {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  // ── Modo historia: timeline de notas completadas (solo lectura) ──────────
  const timeline = notas
    .filter((n) => n.estado === 'completada' && (n.motivo_consulta ?? n.anamnesis)?.trim())
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
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => mutate(texto)}
            disabled={isPending || texto === (notaActual?.motivo_consulta ?? '')}
          >
            {isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {guardado ? '¡Guardado!' : 'Guardar'}
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
                {nota.servicio_nombre && <><span>·</span><span>{nota.servicio_nombre}</span></>}
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

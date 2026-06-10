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

interface TabPlanManejoProps {
  historia: HistoriaClinica
  notas: NotaClinica[]
  notaId?: string   // presente en modo atención; ausente en modo historia
}

export function TabPlanManejo({ historia, notas, notaId }: TabPlanManejoProps) {
  const modoAtencion = Boolean(notaId)

  const notaActual = notas.find((n) => n.id === notaId)
  const [texto, setTexto] = useState(notaActual?.plan_manejo ?? '')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    if (notaActual?.plan_manejo) setTexto(notaActual.plan_manejo)
  }, [notaActual?.plan_manejo])

  const { mutate, isPending } = useMutation({
    mutationFn: (value: string) => historiaClinicaApi.notas.patch(notaId!, { plan_manejo: value }),
    onSuccess: () => {
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    },
  })

  const timeline = notas
    .filter((n) => n.estado === 'completada' && n.plan_manejo?.trim())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  if (modoAtencion) {
    return (
      <div className="rounded-lg border p-4 space-y-3 max-w-2xl">
        <Label className="text-sm font-medium">Plan de manejo</Label>
        <Textarea
          rows={6}
          placeholder="Continuación del tratamiento, referir a especialista, indicaciones…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => mutate(texto)}
            disabled={isPending || texto === (notaActual?.plan_manejo ?? '')}
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
        Plan de manejo por visita
      </p>
      {timeline.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          Aún no hay planes de manejo registrados en las notas de este paciente.
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
              <p className="text-sm leading-relaxed">{nota.plan_manejo}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CalendarClock, Check, PhoneOff, UserX, X } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn, formatDateTime, formatTime } from '@/lib/utils'
import { MEDIOS } from './ConfirmacionForm'
import type { Cita, MedioConfirmacion } from '@/types/agenda'

type Resultado = 'confirmo' | 'cancelo' | 'no_confirmo' | 'no_asistio'

interface ConfirmarCitaDialogProps {
  cita: Cita
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'estado': la cita está pendiente y "confirmó" la pasa a confirmada.
   *  'manual': la cita ya está confirmada y se registra la confirmación de asistencia. */
  modo: 'estado' | 'manual'
  /** Muestra "No asistió" (cita confirmada, o pendiente cuya hora ya pasó). */
  permiteNoAsistio?: boolean
}

/** Registro del contacto con el paciente: confirmó, canceló, no confirmó o no asistió. Cada opción
 * queda en el historial de contacto con el usuario que la registró. */
export function ConfirmarCitaDialog({ cita, open, onOpenChange, modo, permiteNoAsistio }: ConfirmarCitaDialogProps) {
  const queryClient = useQueryClient()
  const [medio, setMedio] = useState<MedioConfirmacion | ''>('')
  const [nota, setNota] = useState('')
  const [faltaNota, setFaltaNota] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setMedio('')
      setNota('')
      setFaltaNota(false)
      setError(null)
    }
  }, [open])

  const { mutate, isPending, variables } = useMutation({
    mutationFn: (resultado: Resultado) => {
      const texto = nota.trim()
      if (resultado === 'no_confirmo') return agendaApi.citas.noConfirmo(cita.id, { medio, nota: texto })
      if (resultado === 'no_asistio') {
        return agendaApi.citas.cambiarEstado(cita.id, { estado: 'no_asistio', medio, nota: texto })
      }
      if (resultado === 'cancelo') {
        return agendaApi.citas.cambiarEstado(cita.id, {
          estado: 'cancelada', motivo_cancelacion: texto, medio, nota: texto,
        })
      }
      if (modo === 'manual') return agendaApi.citas.confirmarManual(cita.id, { medio, nota: texto })
      return agendaApi.citas.cambiarEstado(cita.id, { estado: 'confirmada', medio, nota: texto })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      queryClient.invalidateQueries({ queryKey: ['registros-confirmacion', cita.id] })
      queryClient.invalidateQueries({ queryKey: ['citas-sin-confirmar-proximo-dia-habil'] })
      onOpenChange(false)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      const data = err?.response?.data
      setError(data?.error ?? data?.nota?.[0] ?? 'No se pudo guardar. Intenta de nuevo.')
    },
  })

  const registrar = (resultado: Resultado) => {
    setError(null)
    if ((resultado === 'cancelo' || resultado === 'no_confirmo') && !nota.trim()) {
      setFaltaNota(true)
      notaRef.current?.focus()
      return
    }
    mutate(resultado)
  }

  const guardando = (r: Resultado) => isPending && variables === r

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isPending) onOpenChange(o) }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{modo === 'manual' ? 'Confirmar asistencia' : 'Confirmar cita'}</DialogTitle>
          <DialogDescription>Registra el resultado del contacto con el paciente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <CalendarClock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold leading-tight">{cita.paciente_nombre}</p>
              <p className="text-muted-foreground">
                {formatDateTime(cita.fecha_inicio)} – {formatTime(cita.fecha_fin)}
              </p>
              <p className="text-muted-foreground uppercase text-xs mt-0.5">
                {cita.servicio_nombre || 'Sin procedimiento'} · {cita.profesional_nombre}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Medio de contacto</Label>
            <div className="flex flex-wrap gap-1.5">
              {MEDIOS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMedio(medio === m.value ? '' : m.value)}
                  aria-pressed={medio === m.value}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    medio === m.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nota-contacto" className="text-xs">
              ¿Qué dijo el paciente?
            </Label>
            <Textarea
              id="nota-contacto"
              ref={notaRef}
              rows={3}
              placeholder="Ej: confirma y llega puntual / no contesta / pide reagendar para la otra semana…"
              value={nota}
              onChange={(e) => { setNota(e.target.value); if (e.target.value.trim()) setFaltaNota(false) }}
              className={cn('text-sm resize-none', faltaNota && 'border-destructive focus-visible:ring-destructive')}
            />
            {faltaNota ? (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Escribe el motivo para registrar que canceló o no confirmó.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Obligatorio si cancela o no confirma.</p>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 sm:flex-wrap">
          {permiteNoAsistio && (
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => registrar('no_asistio')}
            >
              <UserX className="h-4 w-4 mr-1.5" />
              {guardando('no_asistio') ? 'Guardando…' : 'No asistió'}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => registrar('no_confirmo')}
          >
            <PhoneOff className="h-4 w-4 mr-1.5" />
            {guardando('no_confirmo') ? 'Guardando…' : 'No confirmó'}
          </Button>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => registrar('cancelo')}
            className="border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
          >
            <X className="h-4 w-4 mr-1.5" />
            {guardando('cancelo') ? 'Guardando…' : 'Canceló'}
          </Button>
          <Button disabled={isPending} onClick={() => registrar('confirmo')}>
            <Check className="h-4 w-4 mr-1.5" />
            {guardando('confirmo') ? 'Guardando…' : 'Confirmó'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

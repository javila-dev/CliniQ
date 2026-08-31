'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { agendaApi } from '@/lib/api/agenda'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ProfesionalSelect } from './ProfesionalSelect'
import type { Cita } from '@/types/agenda'

interface CambiarProfesionalDialogProps {
  cita: Cita
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CambiarProfesionalDialog({ cita, open, onOpenChange }: CambiarProfesionalDialogProps) {
  const queryClient = useQueryClient()
  const [profesionalId, setProfesionalId] = useState(cita.profesional)

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => agendaApi.citas.update(cita.id, { profesional: profesionalId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      queryClient.invalidateQueries({ queryKey: ['slots'] })
      onOpenChange(false)
    },
  })

  const serverError = (() => {
    if (!error) return null
    const data = (error as any)?.response?.data
    if (!data) return 'No se pudo cambiar el profesional'
    if (data.error) return String(data.error)
    if (data.profesional) return Array.isArray(data.profesional) ? data.profesional[0] : String(data.profesional)
    if (data.detail) return String(data.detail)
    return 'No se pudo cambiar el profesional'
  })()

  const sinCambio = profesionalId === cita.profesional

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar profesional</DialogTitle>
          <DialogDescription>
            Reasigna esta cita a otro profesional. Se valida su horario y disponibilidad en la misma franja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          <Label className="text-xs">Profesional</Label>
          <ProfesionalSelect
            value={profesionalId}
            onValueChange={setProfesionalId}
            sedeId={cita.sede}
          />
          <p className="text-[11px] text-muted-foreground">Actual: {cita.profesional_nombre}</p>
        </div>

        {serverError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => mutate()} disabled={isPending || sinCambio}>
            {isPending ? 'Guardando…' : 'Cambiar profesional'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

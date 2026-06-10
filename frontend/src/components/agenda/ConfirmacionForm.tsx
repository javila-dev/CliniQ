'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { EstadoCita, MedioConfirmacion } from '@/types/agenda'

const MEDIOS: { value: MedioConfirmacion; label: string }[] = [
  { value: 'llamada',    label: 'Llamada telefónica' },
  { value: 'whatsapp',  label: 'WhatsApp' },
  { value: 'presencial', label: 'Presencial' },
  { value: 'sms',       label: 'SMS' },
  { value: 'email',     label: 'Email' },
]

const PLACEHOLDER_NOTA: Partial<Record<EstadoCita, string>> = {
  confirmada:  'Ej: paciente confirma, llega puntual / llegará 10 min tarde…',
  cancelada:   'Ej: paciente no puede asistir, solicita reagendar para la próxima semana…',
  no_asistio:  'Ej: se intentó contactar, no respondió…',
  en_curso:    'Ej: paciente llegó, se inicia la atención…',
}

interface ConfirmacionFormProps {
  estado: EstadoCita
  onConfirmar: (medio: MedioConfirmacion | '', nota: string) => void
  onCancelar: () => void
  isPending?: boolean
  extraContent?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
}

export function ConfirmacionForm({ estado, onConfirmar, onCancelar, isPending, extraContent, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }: ConfirmacionFormProps) {
  const [medio, setMedio] = useState<MedioConfirmacion | ''>('')
  const [nota, setNota] = useState('')

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Registrar contacto
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Medio de contacto</Label>
        <Select
          value={medio || '__none__'}
          onValueChange={(v) => setMedio(v === '__none__' ? '' : v as MedioConfirmacion)}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder="Seleccionar…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin especificar</SelectItem>
            {MEDIOS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">¿Qué dijo el paciente? (opcional)</Label>
        <Textarea
          rows={2}
          placeholder={PLACEHOLDER_NOTA[estado] ?? 'Observaciones del contacto…'}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          className="text-sm resize-none"
        />
      </div>

      {extraContent}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => onConfirmar(medio, nota)}
        >
          {isPending ? 'Guardando…' : confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}

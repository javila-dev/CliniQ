'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { MOTIVOS_DESCARTE, type MotivoDescarte } from '@/types/cotizaciones'

/** Descartar con un motivo de un toque (opcional) y una nota corta. */
export function DescartarCotizacionDialog({
  open,
  onOpenChange,
  pacienteNombre,
  conSeguimiento = false,
  otrasAbiertas = 0,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  pacienteNombre?: string
  /** La cotización viene de una oportunidad abierta en Seguimiento. */
  conSeguimiento?: boolean
  /** Otras propuestas abiertas de la misma oportunidad: no se cierra (CT-05). */
  otrasAbiertas?: number
  loading?: boolean
  onConfirm: (data: { motivo_descarte?: MotivoDescarte; nota_descarte?: string; cerrar_oportunidad?: boolean }) => void
}) {
  const [motivo, setMotivo] = useState<MotivoDescarte | null>(null)
  const [nota, setNota] = useState('')
  const [cerrarSeguimiento, setCerrarSeguimiento] = useState(true)

  function cambiarOpen(v: boolean) {
    if (loading) return
    if (!v) {
      setMotivo(null)
      setNota('')
      setCerrarSeguimiento(true)
    }
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={cambiarOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar cotización</DialogTitle>
          <DialogDescription>
            {pacienteNombre ? `¿Por qué ${pacienteNombre} no tomó la cotización?` : '¿Por qué no se tomó la cotización?'}
            {' '}Ayuda a ver dónde se pierden las ventas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {MOTIVOS_DESCARTE.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMotivo(motivo === m.value ? null : m.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                motivo === m.value
                  ? 'border-primary bg-primary text-white'
                  : 'border-border bg-white text-foreground hover:bg-muted',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <Textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          rows={2}
          maxLength={1000}
        />

        {conSeguimiento && otrasAbiertas > 0 && (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {otrasAbiertas === 1
              ? 'El paciente tiene otra propuesta abierta: sigue en Seguimiento hasta que se decida esa.'
              : `El paciente tiene ${otrasAbiertas} propuestas abiertas más: sigue en Seguimiento hasta que se decidan.`}
          </p>
        )}

        {conSeguimiento && otrasAbiertas === 0 && (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={cerrarSeguimiento} onChange={(e) => setCerrarSeguimiento(e.target.checked)} className="mt-0.5" />
            <span>
              Sacarlo también de la lista de Seguimiento
              <span className="block text-xs text-muted-foreground">Si lo dejas, seguirá apareciendo para volver a contactarle.</span>
            </span>
          </label>
        )}

        <p className="text-xs text-muted-foreground">
          Si el paciente lo va a pensar, no la descartes: déjala abierta y vuelve a llamarlo.
        </p>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={() => cambiarOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={loading}
            onClick={() => onConfirm({
              motivo_descarte: motivo ?? undefined,
              nota_descarte: nota.trim() || undefined,
              cerrar_oportunidad: conSeguimiento && otrasAbiertas === 0 && cerrarSeguimiento,
            })}
          >
            {loading ? 'Procesando…' : 'Descartar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

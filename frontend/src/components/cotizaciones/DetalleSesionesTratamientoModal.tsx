'use client'

import { Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TratamientoCatalogo } from '@/types/clinicas'

/** Detalle informativo de las sesiones que incluye un tratamiento del catálogo. */
export function DetalleSesionesTratamientoModal({
  tratamiento,
  onClose,
}: {
  tratamiento: TratamientoCatalogo | null
  onClose: () => void
}) {
  const bloques = [...(tratamiento?.tipos_sesion ?? [])].sort((a, b) => a.orden - b.orden)

  return (
    <Dialog open={!!tratamiento} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{tratamiento?.nombre}</DialogTitle>
          <DialogDescription className="text-xs">
            {tratamiento?.total_sesiones === 1 ? '1 sesión' : `${tratamiento?.total_sesiones ?? 0} sesiones`} en el plan
          </DialogDescription>
        </DialogHeader>

        {bloques.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
            Este tratamiento no tiene sesiones definidas.
          </p>
        ) : (
          <ol className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
            {bloques.map((b) => (
              <li key={b.id} className="px-4 py-2.5">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[13px] font-medium">{b.nombre}</p>
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
                      {b.cantidad}×
                    </span>
                    {!b.es_compromiso && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] text-muted-foreground">
                        No cuenta como sesión
                      </span>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {b.duracion_min} min por sesión
                  </p>
                  {b.procedimientos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...b.procedimientos].sort((x, y) => x.orden - y.orden).map((p) => (
                        <span key={p.id} className="rounded-md border bg-muted/40 px-1.5 py-0.5 text-[11px]">
                          {p.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  )
}

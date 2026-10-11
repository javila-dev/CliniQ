'use client'

import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { EstadoBorrador } from './useBorradorNota'

/** Indicador del autoguardado de la nota: la profesional sabe si lo escrito quedó. */
export function EstadoGuardado({ estado }: { estado: EstadoBorrador }) {
  if (estado === 'guardando') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
      </span>
    )
  }
  if (estado === 'guardado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <Check className="h-3 w-3" /> Guardado
      </span>
    )
  }
  if (estado === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" /> No se guardó
      </span>
    )
  }
  if (estado === 'pendiente') {
    return <span className="text-xs text-muted-foreground">Cambios sin guardar</span>
  }
  return null
}

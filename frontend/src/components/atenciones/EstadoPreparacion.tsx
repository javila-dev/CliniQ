'use client'

import Link from 'next/link'
import { Check, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ETIQUETA_ESTADO_OPERATIVO, NOMBRE_PASO, textoFaltan,
  type EstadoOperativo, type PasoRecepcion, type ProgresoRecepcion,
} from '@/lib/recepcion'

const TONO_ESTADO: Record<EstadoOperativo, string> = {
  sin_llegar: 'border-gray-200 bg-gray-50 text-gray-600',
  en_preparacion: 'border-amber-200 bg-amber-50 text-amber-700',
  listo: 'border-green-200 bg-green-50 text-green-700',
  en_atencion: 'border-primary/30 bg-primary/5 text-primary',
  finalizada: 'border-gray-200 bg-gray-50 text-gray-600',
  cancelada: 'border-gray-200 bg-gray-50 text-gray-500',
  no_asistio: 'border-gray-200 bg-gray-50 text-gray-500',
}

export function EtiquetaEstadoOperativo({ estado, className }: { estado: EstadoOperativo; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium', TONO_ESTADO[estado], className)}>
      {ETIQUETA_ESTADO_OPERATIVO[estado]}
    </span>
  )
}

/** Pasos que se muestran: el consentimiento se oculta si el procedimiento no lo pide. */
function pasosVisibles(progreso: ProgresoRecepcion): PasoRecepcion[] {
  return progreso.activos.filter((paso) => paso !== 'consentimiento' || progreso.consentimientoAplica)
}

/** Cada paso de recepción con su nombre y si está hecho: nada depende del hover. */
export function PasosRecepcion({ progreso, className }: { progreso: ProgresoRecepcion; className?: string }) {
  const pasos = pasosVisibles(progreso)
  if (pasos.length === 0) return null
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Pasos de recepción">
      {pasos.map((paso) => {
        const hecho = progreso.hechos[paso]
        return (
          <li
            key={paso}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
              hecho ? 'border-green-200 bg-green-50 text-green-700' : 'border-dashed border-amber-300 bg-white text-amber-700',
            )}
          >
            {hecho ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />}
            {paso === 'pago' && progreso.deTratamiento ? 'Tratamiento' : NOMBRE_PASO[paso]}
            <span className="sr-only">{hecho ? '(hecho)' : '(pendiente)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** "Faltan 2 pasos: Pago y Firma de asistencia. Los completa recepción con Preparar paciente." */
export function QueFalta({
  progreso, puedeCambiarPasos, className,
}: {
  progreso: ProgresoRecepcion
  puedeCambiarPasos?: boolean
  className?: string
}) {
  if (progreso.faltan.length === 0) return null
  return (
    <div className={cn('space-y-1 text-xs leading-snug', className)}>
      <p className="text-foreground">
        <span className="font-medium">{textoFaltan(progreso.faltan.length)}.</span>{' '}
        <span className="text-muted-foreground">Los completa recepción con Preparar paciente.</span>
      </p>
      {puedeCambiarPasos && <EnlaceCambiarPasos />}
    </div>
  )
}

export function EnlaceCambiarPasos({ className }: { className?: string }) {
  return (
    <Link
      href="/configuracion/recepcion"
      className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline', className)}
    >
      <Settings2 className="h-3 w-3" />
      Cambiar los pasos de recepción
    </Link>
  )
}

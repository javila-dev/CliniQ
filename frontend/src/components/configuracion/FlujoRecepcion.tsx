'use client'

import { DoorOpen, Lock, Stethoscope } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export interface PasoFlujo {
  clave: string
  titulo: string
  descripcion: React.ReactNode
  icono: React.ElementType
  /** Etiqueta junto al título (p. ej. "Add-on"). */
  extra?: React.ReactNode
  activo: boolean
  /** No se puede cambiar: módulo fuera del plan o paso fijo. */
  bloqueado?: 'plan' | 'fijo'
}

/**
 * Pasos de recepción como un recorrido: el paciente llega, pasa por cada paso
 * encendido y termina con el profesional. Un paso apagado queda punteado y el
 * recorrido lo salta, para que se vea de un vistazo qué vive el paciente.
 */
export function FlujoRecepcion({
  pasos, onCambiar, deshabilitado,
}: {
  pasos: PasoFlujo[]
  onCambiar: (clave: string, activo: boolean) => void
  deshabilitado?: boolean
}) {
  return (
    <ol className="px-4 py-4">
      <Extremo icono={DoorOpen} texto="Llega el paciente" />
      {pasos.map((paso) => (
        <Paso key={paso.clave} paso={paso} onCambiar={onCambiar} deshabilitado={deshabilitado} />
      ))}
      <Extremo icono={Stethoscope} texto="Lo atiende el profesional" final />
    </ol>
  )
}

function Extremo({ icono: Icono, texto, final }: { icono: React.ElementType; texto: string; final?: boolean }) {
  return (
    <li className="flex gap-4">
      <div className="flex w-9 flex-col items-center">
        {final && <span className="h-3 border-l-2 border-border" aria-hidden />}
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icono className="h-3.5 w-3.5" />
        </span>
        {!final && <span className="h-3 border-l-2 border-border" aria-hidden />}
      </div>
      <p className={cn('text-[13px] font-medium text-muted-foreground', final ? 'pt-3.5' : 'pt-1')}>{texto}</p>
    </li>
  )
}

function Paso({
  paso, onCambiar, deshabilitado,
}: {
  paso: PasoFlujo
  onCambiar: (clave: string, activo: boolean) => void
  deshabilitado?: boolean
}) {
  const { icono: Icono, activo, bloqueado } = paso
  const encendido = activo && bloqueado !== 'plan'

  return (
    <li className="flex gap-4">
      {/* Riel: línea que llega, el nodo del paso y la línea que sigue. */}
      <div className="flex w-9 flex-col items-center">
        <span className={cn('h-3 border-l-2', encendido ? 'border-primary/40' : 'border-dashed border-border')} aria-hidden />
        <span
          className={cn(
            'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
            encendido
              ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.5)]'
              : 'border-2 border-dashed border-muted-foreground/40 bg-white text-muted-foreground',
          )}
        >
          <Icono className="h-4 w-4" />
          {bloqueado === 'plan' && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white">
              <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
          )}
        </span>
        <span className={cn('min-h-3 flex-1 border-l-2', encendido ? 'border-primary/40' : 'border-dashed border-border')} aria-hidden />
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-3 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium leading-snug text-foreground">{paso.titulo}</p>
            {paso.extra}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{paso.descripcion}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
          <span
            className={cn('hidden w-[4.5rem] text-right text-[13px] font-medium sm:block', encendido ? 'text-primary' : 'text-muted-foreground')}
            aria-hidden
          >
            {bloqueado === 'plan' ? 'No incluido' : encendido ? 'Activo' : 'Se omite'}
          </span>
          {bloqueado ? (
            <Switch checked={encendido} disabled aria-label={paso.titulo} />
          ) : (
            <Switch
              checked={activo}
              disabled={deshabilitado}
              onCheckedChange={(v) => onCambiar(paso.clave, v)}
              aria-label={paso.titulo}
            />
          )}
        </div>
      </div>
    </li>
  )
}

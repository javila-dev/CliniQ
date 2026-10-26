'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, DoorOpen, Lock, Stethoscope } from 'lucide-react'
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
  /** Qué deja de pasar si se apaga; se muestra mientras está apagado. */
  consecuenciaApagado?: React.ReactNode
  /** Cómo activar un módulo fuera del plan; se despliega al pulsar el paso. */
  comoActivar?: React.ReactNode
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
  // Lo que recepción hará de verdad: los pasos con interruptor que quedan
  // encendidos. Los fijos (consentimiento) dependen del procedimiento.
  const encendidos = pasos.filter((p) => p.activo && !p.bloqueado)
  const fijos = pasos.filter((p) => p.bloqueado === 'fijo')

  return (
    <div>
      <ol className="px-4 py-4">
        <Extremo icono={DoorOpen} texto="Llega el paciente" />
        {pasos.map((paso) => (
          <Paso key={paso.clave} paso={paso} onCambiar={onCambiar} deshabilitado={deshabilitado} />
        ))}
        <Extremo icono={Stethoscope} texto="Lo atiende el profesional" final />
      </ol>
      <div className="border-t bg-muted/30 px-4 py-3" aria-live="polite">
        <p className="text-sm font-medium text-foreground">
          Recepción verá: {encendidos.length === 1 ? '1 paso' : `${encendidos.length} pasos`} antes de atender
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          {encendidos.length > 0
            ? encendidos.map((p) => p.titulo).join(' → ') + '.'
            : 'Al abrir Preparar paciente, el paciente pasa directo a la cola del profesional.'}
          {fijos.length > 0 && ` ${fijos.map((p) => p.titulo).join(' y ')}: solo si el procedimiento lo pide.`}
          {' '}Los cambios aplican a las próximas atenciones.
        </p>
      </div>
    </div>
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
  const [explicando, setExplicando] = useState(false)
  const fueraDelPlan = bloqueado === 'plan'

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
          {fueraDelPlan && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border bg-white">
              <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            </span>
          )}
        </span>
        <span className={cn('min-h-3 flex-1 border-l-2', encendido ? 'border-primary/40' : 'border-dashed border-border')} aria-hidden />
      </div>

      <div className={cn('min-w-0 flex-1 pb-3 pt-3', !encendido && 'text-muted-foreground')}>
        <div className="flex items-start gap-3">
          <div className={cn('min-w-0 flex-1', !encendido && 'opacity-70')}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-medium leading-snug text-foreground">{paso.titulo}</p>
              {paso.extra}
            </div>
            <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{paso.descripcion}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
            {fueraDelPlan ? (
              // Bloqueado por el plan: el control explica cómo activarlo, en vez
              // de un interruptor apagado que no dice nada al tocarlo.
              <button
                type="button"
                onClick={() => setExplicando((v) => !v)}
                aria-expanded={explicando}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <Lock className="h-3 w-3" />
                No incluido
                <ChevronDown className={cn('h-3 w-3 transition-transform', explicando && 'rotate-180')} />
              </button>
            ) : (
              <>
                <span
                  className={cn('hidden w-[4.5rem] text-right text-[13px] font-medium sm:block', encendido ? 'text-primary' : 'text-muted-foreground')}
                  aria-hidden
                >
                  {bloqueado === 'fijo' ? 'Si aplica' : encendido ? 'Activo' : 'Se omite'}
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
              </>
            )}
          </div>
        </div>

        {fueraDelPlan && explicando && paso.comoActivar && (
          <div className="mt-2 rounded-lg border bg-muted/40 px-3 py-2 text-[13px] leading-snug text-foreground">
            {paso.comoActivar}
          </div>
        )}
        {!fueraDelPlan && !activo && paso.consecuenciaApagado && (
          <p className="mt-2 flex items-start gap-1.5 text-[13px] leading-snug text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{paso.consecuenciaApagado}</span>
          </p>
        )}
      </div>
    </li>
  )
}

'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToastAction } from '@/components/ui/toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

/*
 * Piezas comunes de las pestañas de Configuración (17/10/2026). Todas las
 * pestañas se arman igual, para que se lean y se usen igual:
 *
 *   SeccionAjustes  título + una línea, y debajo una tarjeta con filas
 *   FilaAjuste      qué es (a la izquierda) y el control (a la derecha)
 *   NotaAjuste      aclaración corta al pie de la tarjeta
 *
 * Regla de guardado:
 *   - Un ajuste suelto (interruptor o lista) se guarda al tocarlo y avisa
 *     "Guardado" con la opción de deshacer: avisarGuardado().
 *   - Un formulario de varios campos muestra BarraGuardado (arriba, fija) solo
 *     cuando hay cambios sin guardar.
 */

export function SeccionAjustes({
  titulo, descripcion, accion, id, children,
}: {
  titulo: string
  descripcion?: string
  /** Botón o enlace a la derecha del título (p. ej. "Nueva categoría"). */
  accion?: React.ReactNode
  id?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-2.5">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{descripcion}</p>}
        </div>
        {accion && <div className="shrink-0">{accion}</div>}
      </div>
      <div className="overflow-hidden rounded-xl border bg-white divide-y divide-border/70">{children}</div>
    </section>
  )
}

export function FilaAjuste({
  icono: Icono, titulo, descripcion, extra, apagada, children, contenido,
}: {
  icono?: React.ElementType
  titulo: React.ReactNode
  descripcion?: React.ReactNode
  /** Etiqueta junto al título (p. ej. "Add-on", "Obligatorio"). */
  extra?: React.ReactNode
  /** El ajuste no aplica ahora (depende de otro apagado): se atenúa el ícono. */
  apagada?: boolean
  /** El control, a la derecha: Switch, SelectAjuste o un botón. */
  children?: React.ReactNode
  /** Contenido ancho debajo del texto (un link para copiar, un aviso). */
  contenido?: React.ReactNode
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3 sm:gap-4">
        {Icono && (
          <span
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
              apagada ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
            )}
          >
            <Icono className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium leading-snug text-foreground">{titulo}</p>
            {extra}
          </div>
          {descripcion && <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{descripcion}</p>}
        </div>
        {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
      </div>
      {contenido && <div className={cn('mt-3', Icono && 'sm:pl-12')}>{contenido}</div>}
    </div>
  )
}

export function NotaAjuste({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-muted/40 px-4 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}

const TONOS_ETIQUETA = {
  neutro: 'bg-muted text-muted-foreground',
  activo: 'bg-emerald-50 text-emerald-700',
  aviso: 'bg-amber-50 text-amber-800',
  marca: 'bg-primary/10 text-primary',
  addon: 'bg-violet-50 text-violet-700',
} as const

/** Etiqueta corta junto a un título o en la columna derecha ("Activa", "Add-on", "Obligatorio"). */
export function EtiquetaAjuste({
  tono = 'neutro', icono: Icono, children,
}: {
  tono?: keyof typeof TONOS_ETIQUETA
  icono?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', TONOS_ETIQUETA[tono])}>
      {Icono && <Icono className="h-3 w-3" />}
      {children}
    </span>
  )
}

/** Lista sin elementos: qué falta y la acción para empezar. Va dentro de una SeccionAjustes. */
export function VacioAjustes({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      {descripcion && <p className="max-w-[48ch] text-[13px] text-muted-foreground">{descripcion}</p>}
      {accion && <div className="mt-3">{accion}</div>}
    </div>
  )
}

/** Lista desplegable compacta para el lado derecho de una FilaAjuste. */
export function SelectAjuste({
  valor, opciones, onCambiar, deshabilitado, etiqueta, ancho = 'w-[8.25rem] sm:w-40',
}: {
  valor: string
  opciones: { value: string; label: string }[]
  onCambiar: (valor: string) => void
  deshabilitado?: boolean
  /** Nombre para lectores de pantalla (el título de la fila). */
  etiqueta: string
  ancho?: string
}) {
  return (
    <Select value={valor} onValueChange={onCambiar} disabled={deshabilitado}>
      <SelectTrigger className={cn('h-9', ancho)} aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Aviso tras guardar un ajuste suelto. Con `deshacer`, ofrece volver atrás. */
export function avisarGuardado(deshacer?: () => void, titulo = 'Guardado') {
  toast({
    variant: 'success',
    title: titulo,
    action: deshacer ? (
      <ToastAction altText="Deshacer el cambio" onClick={deshacer}>Deshacer</ToastAction>
    ) : undefined,
  })
}

/** Barra para formularios de varios campos: aparece solo con cambios sin guardar. */
export function BarraGuardado({
  visible, guardando, onGuardar, onDescartar,
}: {
  visible: boolean
  guardando?: boolean
  onGuardar: () => void
  onDescartar: () => void
}) {
  // Cerrar o recargar la pestaña con cambios pendientes pregunta antes.
  useEffect(() => {
    if (!visible) return
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [visible])

  if (!visible || typeof document === 'undefined') return null
  // Fija arriba de la ventana (sobre el área de contenido, sin tapar el menú
  // lateral): se ve sin importar dónde esté la persona en la página. Va en un
  // portal para que ningún contenedor con transform la descoloque.
  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-3 z-50 flex justify-center lg:left-[calc(15rem+1.5rem)] lg:right-6">
      <div
        role="region"
        aria-label="Cambios sin guardar"
        className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl bg-foreground py-2 pl-4 pr-2 text-background shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] animate-in fade-in-0 slide-in-from-top-2 duration-200"
      >
        <p className="text-sm font-medium"><span className="hidden sm:inline">Tienes cambios</span><span className="sm:hidden">Cambios</span> sin guardar</p>
        <div className="flex shrink-0 gap-1.5">
          <Button
            type="button" size="sm" variant="ghost" onClick={onDescartar} disabled={guardando}
            className="text-background/80 hover:bg-white/10 hover:text-background"
          >
            Descartar
          </Button>
          <Button type="button" size="sm" onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

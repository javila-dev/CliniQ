'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, MapPin, Check, X } from 'lucide-react'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnotacionZona, DiagramaConAnotaciones, TipoAplicacion } from '@/types/historia'

interface Props {
  notaId: string
  readOnly?: boolean
}

// Estado de la anotación pendiente:
// 'sizing'  → primer click puesto, el mouse mueve el radio en vivo
// 'text'    → segundo click confirma el radio, se muestra el popup de texto
type Pending =
  | { phase: 'sizing'; x: number; y: number; radio: number }
  | { phase: 'text';   x: number; y: number; radio: number }

// ─── Configuración de tipos de aplicación ────────────────────────────────────

const TIPOS: Array<{ value: TipoAplicacion; label: string }> = [
  { value: 'equipo',     label: 'Equipo' },
  { value: 'inyectable', label: 'Inyectable' },
  { value: 'topico',     label: 'Tópico' },
  { value: 'laser',      label: 'Láser' },
  { value: 'otro',       label: 'Otro' },
]

const CAMPOS_POR_TIPO: Record<string, Array<{ key: string; label: string; placeholder?: string }>> = {
  equipo: [
    { key: 'equipo_nombre', label: 'Equipo',   placeholder: 'Ej: Ultrasonido, Radiofrecuencia…' },
    { key: 'potencia',      label: 'Potencia', placeholder: 'Ej: 80W, nivel 3…' },
    { key: 'tiempo',        label: 'Tiempo',   placeholder: 'Ej: 10 min' },
    { key: 'pulsos',        label: 'Pulsos',   placeholder: 'Ej: 500' },
  ],
  inyectable: [
    { key: 'producto',   label: 'Producto',     placeholder: 'Ej: Botox, Restylane…' },
    { key: 'volumen_ml', label: 'Volumen (ml)', placeholder: 'Ej: 0.5' },
    { key: 'dilucion',   label: 'Dilución',     placeholder: 'Ej: 2.5 ml SF' },
    { key: 'tecnica',    label: 'Técnica',      placeholder: 'Ej: bólus, abanico…' },
  ],
  topico: [
    { key: 'producto',  label: 'Producto',  placeholder: 'Ej: Retinol 0.5%…' },
    { key: 'cantidad',  label: 'Cantidad',  placeholder: 'Ej: 2 ml, 1 aplicación…' },
  ],
  laser: [
    { key: 'longitud_onda', label: 'Longitud de onda', placeholder: 'Ej: 1064 nm' },
    { key: 'fluencia',      label: 'Fluencia (J/cm²)', placeholder: 'Ej: 12' },
    { key: 'spot_size',     label: 'Spot size',        placeholder: 'Ej: 6 mm' },
    { key: 'tiempo',        label: 'Tiempo de pulso',  placeholder: 'Ej: 10 ms' },
  ],
  otro: [],
}

function resumenAnotacion(pin: AnotacionZona): string {
  const p = pin.parametros ?? {}
  switch (pin.tipo_aplicacion) {
    case 'equipo':
      return [p.equipo_nombre, p.potencia, p.tiempo].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'inyectable':
      return [p.producto, p.volumen_ml ? `${p.volumen_ml}ml` : null, p.tecnica].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'topico':
      return [p.producto, p.cantidad].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    case 'laser':
      return [p.longitud_onda, p.fluencia ? `${p.fluencia}J/cm²` : null].filter(Boolean).join(' · ') || pin.texto || 'Sin detalle'
    default:
      return pin.texto || 'Sin nota'
  }
}

// ─── Formulario de anotación (compartido por popup nuevo y edición existente) ─

interface AnotacionFormData {
  tipo_aplicacion: TipoAplicacion
  parametros: Record<string, string>
  texto: string
}

function AnotacionForm({
  inicial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  inicial: AnotacionFormData
  onSubmit: (data: AnotacionFormData) => void
  onCancel: () => void
  isLoading?: boolean
}) {
  const [tipo, setTipo] = useState<TipoAplicacion>(inicial.tipo_aplicacion)
  const [params, setParams] = useState<Record<string, string>>(inicial.parametros)
  const [texto, setTexto] = useState(inicial.texto)

  const handleTipo = (t: TipoAplicacion) => {
    setTipo(t)
    setParams({})
  }

  const setParam = (key: string, value: string) =>
    setParams((p) => ({ ...p, [key]: value }))

  const campos = tipo ? (CAMPOS_POR_TIPO[tipo] ?? []) : []

  const submit = () => onSubmit({ tipo_aplicacion: tipo, parametros: params, texto })

  return (
    <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Selector de tipo */}
      <div className="flex flex-wrap gap-1">
        {TIPOS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => handleTipo(t.value)}
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full border transition-colors',
              tipo === t.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:border-primary/50',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Campos dinámicos según tipo */}
      {campos.map((campo) => (
        <div key={campo.key} className="flex flex-col gap-0.5">
          <label className="text-[10px] text-muted-foreground">{campo.label}</label>
          <input
            className="text-xs w-full border rounded px-1.5 py-1 outline-none focus:border-primary bg-background"
            placeholder={campo.placeholder}
            value={params[campo.key] ?? ''}
            onChange={(e) => setParam(campo.key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submit() }
              if (e.key === 'Escape') onCancel()
            }}
          />
        </div>
      ))}

      {/* Notas libres */}
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] text-muted-foreground">
          {campos.length > 0 ? 'Observaciones' : 'Nota'}
        </label>
        <textarea
          autoFocus={campos.length === 0}
          className="text-xs w-full outline-none min-h-[60px] resize border rounded px-1.5 py-1 focus:border-primary bg-background"
          placeholder="Observaciones adicionales…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            if (e.key === 'Escape') onCancel()
          }}
        />
      </div>

      <div className="flex gap-1 justify-end">
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={onCancel}>
          <X className="h-3 w-3" />
        </Button>
        <Button size="sm" className="h-6 px-2 text-xs" onClick={submit} disabled={isLoading}>
          <Check className="h-3 w-3 mr-1" />Guardar
        </Button>
      </div>
    </div>
  )
}

// ─── FloatingPopup ───────────────────────────────────────────────────────────
// Portal anclado a un punto fijo de pantalla. Mide su propia altura y decide
// si extenderse hacia arriba o hacia abajo según el espacio disponible —
// evita que el popup se corte contra el borde superior de la ventana.

const POPUP_MARGIN = 12
const POPUP_GAP = 10

function FloatingPopup({
  anchor, children, className,
}: {
  anchor: { left: number; top: number }
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [direction, setDirection] = useState<'up' | 'down'>('up')

  // ResizeObserver detecta cambios de altura del contenido sin importar qué
  // componente hijo los provoque (ej: AnotacionForm agrega campos por su cuenta,
  // lo cual no re-renderiza FloatingPopup). La decisión se basa en la altura real
  // del contenido — independiente de dónde esté posicionado ahora — así que no
  // hay circularidad ni necesidad de que el padre se entere del cambio.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const recompute = () => {
      const height = el.getBoundingClientRect().height
      const fitsAbove = anchor.top - height - POPUP_GAP >= POPUP_MARGIN
      setDirection(fitsAbove ? 'up' : 'down')
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [anchor.left, anchor.top])

  const transform = direction === 'up'
    ? `translate(-50%, calc(-100% - ${POPUP_GAP}px))`
    : `translate(-50%, ${POPUP_GAP}px)`

  return createPortal(
    <div
      ref={ref}
      className={cn('fixed z-[9999]', className)}
      style={{ left: anchor.left, top: anchor.top, transform }}
    >
      {children}
    </div>,
    document.body,
  )
}

// ─── ZoneCircle ──────────────────────────────────────────────────────────────

function ZoneCircle({
  x, y, radio: radioProp, readOnly, containerRef, onResizeEnd,
}: {
  x: number
  y: number
  radio: number
  readOnly?: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  onResizeEnd?: (radio: number) => void
}) {
  const [localRadio, setLocalRadio] = useState(radioProp)
  useEffect(() => setLocalRadio(radioProp), [radioProp])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const dist = Math.hypot(e.clientX - (rect.left + x * rect.width), e.clientY - (rect.top + y * rect.height))
    setLocalRadio(Math.min(0.5, Math.max(0.03, dist / rect.width)))
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId)
    onResizeEnd?.(localRadio)
  }

  return (
    <div
      className="absolute rounded-full border-2 border-primary/50 bg-primary/8 pointer-events-none"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${localRadio * 200}%`,
        aspectRatio: '1',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {!readOnly && onResizeEnd && (
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-white shadow pointer-events-auto"
          style={{ cursor: 'ew-resize' }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}
    </div>
  )
}

// ─── PinBubble ───────────────────────────────────────────────────────────────

function PinBubble({
  pin, index, onDelete, onUpdate, readOnly,
}: {
  pin: AnotacionZona
  index: number
  onDelete: () => void
  onUpdate: (data: AnotacionFormData) => void
  readOnly?: boolean
}) {
  const [open, setOpen]       = useState(false)
  const [editing, setEditing] = useState(false)
  const [fixedPos, setFixedPos] = useState<{ left: number; top: number } | null>(null)
  const dotRef   = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  const show = () => {
    clearTimeout(hideTimer.current)
    if (dotRef.current) {
      const r = dotRef.current.getBoundingClientRect()
      setFixedPos({ left: r.left + r.width / 2, top: r.top })
    }
    setOpen(true)
  }
  const hide = () => { hideTimer.current = setTimeout(() => { setOpen(false); setEditing(false) }, 80) }

  const visible = open || editing
  const tipoLabel = TIPOS.find((t) => t.value === pin.tipo_aplicacion)?.label

  return (
    <>
      {/* Dot numerado — único trigger de hover */}
      <div
        ref={dotRef}
        className={cn(
          'absolute w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold shadow pointer-events-auto cursor-default',
          visible ? 'z-20' : 'z-10',
        )}
        style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%`, transform: 'translate(-50%, -50%)' }}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {index + 1}
      </div>

      {/* Burbuja — FloatingPopup escapa del stacking context y decide dirección */}
      {visible && fixedPos && (
        <FloatingPopup anchor={fixedPos}>
          <div
            className="relative bg-white border border-border rounded-lg shadow-md px-2 py-1.5 min-w-[220px] max-w-[300px]"
            onMouseEnter={() => clearTimeout(hideTimer.current)}
            onMouseLeave={hide}
          >
            {editing ? (
              <AnotacionForm
                inicial={{ tipo_aplicacion: pin.tipo_aplicacion, parametros: pin.parametros ?? {}, texto: pin.texto }}
                onSubmit={(data) => { onUpdate(data); setEditing(false); setOpen(false) }}
                onCancel={() => { setEditing(false); setOpen(false) }}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-start gap-1.5">
                  {tipoLabel && (
                    <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.5 rounded-sm uppercase tracking-wide shrink-0 mt-0.5">
                      {tipoLabel}
                    </span>
                  )}
                  <p
                    className={cn(
                      'text-xs leading-tight flex-1 cursor-default',
                      !pin.tipo_aplicacion && !pin.texto && 'text-muted-foreground italic',
                    )}
                    onClick={() => !readOnly && setEditing(true)}
                  >
                    {resumenAnotacion(pin)}
                  </p>
                  {!readOnly && (
                    <button onClick={onDelete} className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {pin.tipo_aplicacion && pin.texto && (
                  <p className="text-[10px] text-muted-foreground leading-tight">{pin.texto}</p>
                )}
              </div>
            )}
          </div>
        </FloatingPopup>
      )}
    </>
  )
}

// ─── DiagramaPanel ───────────────────────────────────────────────────────────

function DiagramaPanel({
  diagrama, anotaciones, notaId, readOnly,
}: {
  diagrama: DiagramaConAnotaciones
  anotaciones: AnotacionZona[]
  notaId: string
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const imgRef = useRef<HTMLDivElement>(null)
  const [pending, setPending]             = useState<Pending | null>(null)
  const [pendingTipo, setPendingTipo]     = useState<TipoAplicacion>('')
  const [pendingParams, setPendingParams] = useState<Record<string, string>>({})
  const [pendingTexto, setPendingTexto]   = useState('')
  const [popupFixedPos, setPopupFixedPos] = useState<{ left: number; top: number } | null>(null)

  const qKey = ['nota-zonas', notaId]

  const createMut = useMutation({
    mutationFn: (d: { x: number; y: number; radio: number; texto: string; tipo_aplicacion: TipoAplicacion; parametros: Record<string, string> }) =>
      historiaClinicaApi.zonas.create({ nota: notaId, diagrama: diagrama.id, ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey })
      setPending(null)
      setPendingTipo('')
      setPendingParams({})
      setPendingTexto('')
      setPopupFixedPos(null)
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; texto?: string; radio?: number; tipo_aplicacion?: TipoAplicacion; parametros?: Record<string, string> }) =>
      historiaClinicaApi.zonas.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.zonas.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  })

  const getRelPos = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return
    if (pending?.phase === 'sizing') {
      e.stopPropagation()
      const rect = imgRef.current?.getBoundingClientRect()
      if (rect) {
        setPopupFixedPos({
          left: rect.left + pending.x * rect.width,
          top:  rect.top  + pending.y * rect.height,
        })
      }
      setPending({ ...pending, phase: 'text' })
      setPendingTipo('')
      setPendingParams({})
      setPendingTexto('')
      return
    }
    if (pending?.phase === 'text') return
    const pos = getRelPos(e)
    if (!pos) return
    setPending({ phase: 'sizing', x: pos.x, y: pos.y, radio: 0.01 })
  }, [readOnly, pending])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (pending?.phase !== 'sizing') return
    const rect = imgRef.current?.getBoundingClientRect()
    if (!rect) return
    const dist = Math.hypot(
      e.clientX - (rect.left + pending.x * rect.width),
      e.clientY - (rect.top + pending.y * rect.height),
    )
    setPending((p) => p ? { ...p, radio: Math.min(0.5, Math.max(0.01, dist / rect.width)) } : p)
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPending(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  function confirmPending(data: AnotacionFormData) {
    if (pending?.phase !== 'text') return
    createMut.mutate({ x: pending.x, y: pending.y, radio: pending.radio, ...data })
  }

  const isSizing = pending?.phase === 'sizing'

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{diagrama.nombre}</p>

      <div
        ref={imgRef}
        className={cn('relative inline-block w-full max-w-sm mx-auto select-none', isSizing ? 'cursor-crosshair' : !readOnly ? 'cursor-crosshair' : '')}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
      >
        {/* Imagen */}
        <div className="rounded-lg overflow-hidden border bg-white shadow-sm pointer-events-none">
          {diagrama.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={diagrama.imagen_url} alt={diagrama.nombre} className="w-full h-auto block" draggable={false} />
          ) : (
            <div className="aspect-square flex items-center justify-center bg-muted">
              <MapPin className="h-10 w-10 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Círculos guardados */}
        {anotaciones.map((a) => (
          <ZoneCircle
            key={`circle-${a.id}`}
            x={a.x} y={a.y} radio={a.radio}
            readOnly={readOnly}
            containerRef={imgRef}
            onResizeEnd={(radio) => updateMut.mutate({ id: a.id, radio })}
          />
        ))}

        {/* Burbujas de anotaciones guardadas */}
        {anotaciones.map((a, i) => (
          <PinBubble
            key={a.id}
            pin={a} index={i}
            readOnly={readOnly}
            onDelete={() => deleteMut.mutate(a.id)}
            onUpdate={(data) => updateMut.mutate({ id: a.id, ...data })}
          />
        ))}

        {/* Círculo pendiente */}
        {pending && (
          <ZoneCircle
            x={pending.x} y={pending.y} radio={pending.radio}
            containerRef={imgRef}
          />
        )}

        {/* Dot del pin pendiente */}
        {pending && (
          <div
            className="absolute z-10 w-3 h-3 rounded-full bg-primary border-2 border-white shadow pointer-events-none"
            style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%`, transform: 'translate(-50%, -50%)' }}
          />
        )}

        {/* Popup de formulario — FloatingPopup escapa del stacking context y decide dirección */}
        {pending?.phase === 'text' && popupFixedPos && (
          <FloatingPopup anchor={popupFixedPos}>
            <div
              className="bg-white border border-primary rounded-lg shadow-lg px-2 py-2 min-w-[220px] max-w-[300px]"
              onClick={(e) => e.stopPropagation()}
            >
              <AnotacionForm
                inicial={{ tipo_aplicacion: pendingTipo, parametros: pendingParams, texto: pendingTexto }}
                onSubmit={confirmPending}
                onCancel={() => { setPending(null); setPopupFixedPos(null) }}
                isLoading={createMut.isPending}
              />
            </div>
          </FloatingPopup>
        )}
      </div>

      {!readOnly && (
        <p className="text-[10px] text-muted-foreground text-center">
          {isSizing
            ? 'Ajusta el área y haz clic para confirmar el radio'
            : 'Clic para marcar el centro · arrastra el borde del círculo para ajustar áreas guardadas'}
        </p>
      )}
    </div>
  )
}

// ─── TabZonas ────────────────────────────────────────────────────────────────

export function TabZonas({ notaId, readOnly }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['nota-zonas', notaId],
    queryFn: () => historiaClinicaApi.zonas.get(notaId),
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse p-4">
        {[1, 2].map((i) => <div key={i} className="h-64 rounded-lg bg-muted" />)}
      </div>
    )
  }

  if (!data || data.diagramas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <MapPin className="h-8 w-8 text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">Sin diagramas configurados para este procedimiento.</p>
      </div>
    )
  }

  return (
    <div className={cn('grid gap-6 p-4', data.diagramas.length > 1 && 'sm:grid-cols-2')}>
      {data.diagramas.map((d) => (
        <DiagramaPanel
          key={d.id}
          diagrama={d}
          anotaciones={data.anotaciones.filter((a) => a.diagrama === d.id)}
          notaId={notaId}
          readOnly={readOnly}
        />
      ))}
    </div>
  )
}

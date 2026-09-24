'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Info, Loader2, Plus, Search, Stethoscope, X } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { ProcedimientoDialog } from './ProcedimientoDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CreateTratamientoCatalogoRequest, Procedimiento, TratamientoCatalogo } from '@/types/clinicas'

// ─── Modelo del formulario ────────────────────────────────────
// Cada fila es una sesión (internamente un TipoSesion): una descripción propia, cuántas veces
// se repite y, opcionalmente, los procedimientos que se hacen en ella.

interface ProcRef {
  id: string
  nombre: string
  duracion_min: number
  /** Id de la relación en el backend, solo si ya existía. */
  tipoProcId?: string
}

interface Fila {
  key: string
  /** Id del TipoSesion en el backend, solo si ya existía. Se envía para actualizarlo en lugar de recrearlo. */
  id?: string
  descripcion: string
  cantidad: number
  /** Duración escrita a mano; solo se usa cuando la sesión no tiene procedimientos. */
  duracionManual: number
  procs: ProcRef[]
  /** Las sesiones nuevas siempre se agendan; las que ya existían conservan su valor. */
  agenda: boolean
}

const nuevaClave = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const filaVacia = (): Fila => ({ key: nuevaClave(), descripcion: '', cantidad: 1, duracionManual: 0, procs: [], agenda: true })
const nombreDeProcs = (f: Fila) => f.procs.map((p) => p.nombre).join(' + ')
const nombreDeFila = (f: Fila) => f.descripcion.trim() || nombreDeProcs(f)
const duracionDeFila = (f: Fila) =>
  f.procs.length ? f.procs.reduce((suma, p) => suma + p.duracion_min, 0) : f.duracionManual
/** Fila nueva que nadie tocó: se ignora al guardar en vez de reclamarla. */
const filaEnBlanco = (f: Fila) => !f.id && f.procs.length === 0 && !f.descripcion.trim() && !f.duracionManual
const problemasDeFila = (f: Fila) => ({
  nombre: !nombreDeFila(f),
  minutos: f.procs.length === 0 && f.duracionManual <= 0,
})
const idCampo = (f: Fila, campo: 'nombre' | 'min') => `sesion-${f.key}-${campo}`

function filaDesdeTipo(t: TratamientoCatalogo['tipos_sesion'][number], conservarIds: boolean): Fila {
  return {
    key: conservarIds ? t.id : nuevaClave(),
    id: conservarIds ? t.id : undefined,
    descripcion: t.nombre,
    cantidad: t.cantidad,
    duracionManual: t.duracion_min ?? 0,
    agenda: t.es_compromiso,
    procs: t.procedimientos.map((p) => ({
      id: p.procedimiento,
      nombre: p.nombre,
      duracion_min: p.duracion_min,
      tipoProcId: conservarIds ? p.id : undefined,
    })),
  }
}

const formatoDuracion = (minutos: number) => {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return [h ? `${h} h` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ')
}

function mensajesDelServidor(error: unknown): string[] {
  const data = (error as any)?.response?.data
  if (!data) return ['No se pudo guardar el tratamiento. Intenta de nuevo.']
  const mensajes: string[] = []
  const recorrer = (valor: unknown) => {
    if (typeof valor === 'string') mensajes.push(valor)
    else if (Array.isArray(valor)) valor.forEach(recorrer)
    else if (valor && typeof valor === 'object') Object.values(valor).forEach(recorrer)
  }
  recorrer(data.detail ?? data)
  return mensajes.length ? [...new Set(mensajes)] : ['No se pudo guardar el tratamiento. Intenta de nuevo.']
}

// ─── Selector de procedimiento ────────────────────────────────

function ElegirProcedimiento({
  servicios, excluir, onSelect, onCrear, destacado,
}: {
  servicios: Procedimiento[]
  excluir: string[]
  onSelect: (s: Procedimiento) => void
  onCrear: () => void
  /** Sin procedimientos aún: botón visible en vez del chip pequeño. */
  destacado?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const filtrados = servicios
    .filter((s) => !excluir.includes(s.id))
    .filter((s) => !q || s.nombre.toLowerCase().includes(q.toLowerCase()))

  return (
    <Popover open={abierto} onOpenChange={(v) => { setAbierto(v); if (!v) setQ('') }}>
      <PopoverTrigger asChild>
        {destacado ? (
          <Button type="button" variant="outline" size="sm" className="h-8 border-primary/40 text-primary hover:bg-primary/5 hover:text-primary">
            <Plus className="h-3.5 w-3.5 mr-1" />Elegir procedimiento
          </Button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
          >
            <Plus className="h-3 w-3" />Otro procedimiento
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-64 p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar procedimiento…"
            className="flex-1 text-xs outline-none bg-transparent"
          />
        </div>
        <div className="max-h-48 overflow-y-auto divide-y">
          {filtrados.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setAbierto(false); setQ(''); onSelect(s) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
            >
              <Stethoscope className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 uppercase">{s.nombre}</span>
              <span className="text-[10px] text-muted-foreground">{s.duracion_min} min</span>
            </button>
          ))}
          {filtrados.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>}
        </div>
        <div className="border-t px-3 py-2">
          <button
            type="button"
            onClick={() => { setAbierto(false); onCrear() }}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3 w-3" />Crear procedimiento
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ─── Fila de sesión ───────────────────────────────────────────

// Inline para no depender de que Tailwind genere la clase arbitraria:
// flechas · # · procedimientos · nombre · veces · duración · quitar.
const COLUMNAS: React.CSSProperties = {
  gridTemplateColumns: '1rem 1.5rem minmax(0, 1.3fr) minmax(0, 1fr) 4.5rem 4.5rem 1.75rem',
}

function FilaDeSesion({
  fila, etiqueta, esPrimera, esUltima, puedeQuitar, servicios, errores, onChange, onQuitar, onMover, onCrearProcedimiento,
}: {
  fila: Fila
  etiqueta: string
  /** Solo después de intentar guardar. */
  errores: { nombre: boolean; minutos: boolean } | null
  esPrimera: boolean
  esUltima: boolean
  puedeQuitar: boolean
  servicios: Procedimiento[]
  onChange: (f: Fila) => void
  onQuitar: () => void
  onMover: (direccion: -1 | 1) => void
  onCrearProcedimiento: (alCrear: (s: Procedimiento) => void) => void
}) {
  const agregar = (s: Procedimiento) => {
    if (fila.procs.some((p) => p.id === s.id)) return
    onChange({ ...fila, procs: [...fila.procs, { id: s.id, nombre: s.nombre, duracion_min: s.duracion_min }] })
  }
  const quitar = (id: string) => onChange({ ...fila, procs: fila.procs.filter((p) => p.id !== id) })

  return (
    <div className="grid items-start gap-2 px-3 py-2.5" style={COLUMNAS}>
      <div className="flex flex-col pt-1">
        <button type="button" onClick={() => onMover(-1)} disabled={esPrimera} aria-label="Subir sesión"
          className="text-muted-foreground/60 hover:text-foreground disabled:opacity-20 h-4 flex items-center">
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={esUltima} aria-label="Bajar sesión"
          className="text-muted-foreground/60 hover:text-foreground disabled:opacity-20 h-4 flex items-center">
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <span className="pt-2 text-xs tabular-nums text-muted-foreground">{etiqueta}</span>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap min-h-8">
          {fila.procs.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs uppercase">
              {p.nombre}
              <span className="normal-case text-muted-foreground">· {p.duracion_min} min</span>
              <button type="button" onClick={() => quitar(p.id)} aria-label={`Quitar ${p.nombre}`} className="text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <ElegirProcedimiento
            servicios={servicios}
            excluir={fila.procs.map((p) => p.id)}
            onSelect={agregar}
            onCrear={() => onCrearProcedimiento(agregar)}
            destacado={fila.procs.length === 0}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Input
          id={idCampo(fila, 'nombre')}
          value={fila.descripcion}
          onChange={(e) => onChange({ ...fila, descripcion: e.target.value })}
          placeholder={fila.procs.length ? `Opcional · ${nombreDeProcs(fila)}` : 'Ej: Control'}
          className={cn('h-8 text-sm', errores?.nombre && 'border-destructive focus-visible:ring-destructive')}
          aria-label="Nombre de la sesión"
          aria-invalid={errores?.nombre || undefined}
        />
        {errores?.nombre && <p className="text-[11px] text-destructive">Elige un procedimiento o escribe un nombre.</p>}
      </div>

      <Input
        type="number"
        min={1}
        value={fila.cantidad}
        onChange={(e) => onChange({ ...fila, cantidad: Math.max(1, Number(e.target.value) || 1) })}
        className="h-8 px-1 text-center text-sm"
        aria-label="Número de veces"
      />

      {fila.procs.length > 0 ? (
        <span className="pt-2 text-sm tabular-nums text-muted-foreground">{formatoDuracion(duracionDeFila(fila))}</span>
      ) : (
        <div className="relative">
          <Input
            id={idCampo(fila, 'min')}
            type="number"
            min={0}
            aria-invalid={errores?.minutos || undefined}
            value={fila.duracionManual || ''}
            placeholder="0"
            onChange={(e) => onChange({ ...fila, duracionManual: Math.max(0, Number(e.target.value) || 0) })}
            className={cn('h-8 px-2 pr-8 text-sm', errores?.minutos && 'border-destructive focus-visible:ring-destructive')}
            aria-label="Duración en minutos"
          />
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">min</span>
        </div>
      )}

      <Button
        type="button" variant="ghost" size="icon" className="h-8 w-7 hover:text-destructive"
        onClick={onQuitar} disabled={!puedeQuitar} aria-label="Quitar sesión"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Tratamiento a editar o, con `duplicar`, a copiar. */
  tratamiento?: TratamientoCatalogo | null
  duplicar?: boolean
}

interface Borrador {
  nombre: string
  precio: number | null
  descuento: number
  descripcion: string
  filas: Fila[]
}

export function TratamientoDialog({ open, onOpenChange, tratamiento, duplicar = false }: Props) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const esEdicion = !!tratamiento && !duplicar
  const claveBorrador = `tratamiento-borrador-v2:${user?.clinica_id ?? ''}`
  const filtroActivo = Boolean(user?.filtrar_profesionales_por_procedimiento)

  const [iniciado, setIniciado] = useState(false)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState<number | null>(null)
  const [descuento, setDescuento] = useState(0)
  const [descripcion, setDescripcion] = useState('')
  const [activo, setActivo] = useState(true)
  const [filas, setFilas] = useState<Fila[]>([filaVacia()])
  /** Errores del servidor; los del formulario se marcan en cada campo. */
  const [errores, setErrores] = useState<string[]>([])
  const [intentado, setIntentado] = useState(false)
  const [recuperado, setRecuperado] = useState(false)
  const [procDialogAbierto, setProcDialogAbierto] = useState(false)
  const [alCrearProcedimiento, setAlCrearProcedimiento] = useState<((s: Procedimiento) => void) | null>(null)

  // `activos` no pagina: `list()` solo trae la primera página (25) y dejaba fuera al resto.
  const { data: servicios = [] } = useQuery({
    queryKey: ['procedimientos', 'activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
    enabled: open,
  })

  // ── Al abrir: edición, copia, borrador guardado o formulario en blanco ──
  useEffect(() => {
    if (!open) return
    setErrores([])
    setIntentado(false)
    setRecuperado(false)
    if (tratamiento) {
      setNombre(duplicar ? `${tratamiento.nombre} (copia)` : tratamiento.nombre)
      setPrecio(tratamiento.precio_estimado ? parseFloat(tratamiento.precio_estimado) : null)
      setDescuento(tratamiento.descuento_maximo_pct != null ? parseFloat(tratamiento.descuento_maximo_pct) : 0)
      setDescripcion(tratamiento.descripcion ?? '')
      setActivo(duplicar ? true : tratamiento.activo)
      const cargadas = tratamiento.tipos_sesion.map((t) => filaDesdeTipo(t, !duplicar))
      setFilas(cargadas.length ? cargadas : [filaVacia()])
    } else {
      let borrador: Borrador | null = null
      try {
        const guardado = window.localStorage.getItem(claveBorrador)
        borrador = guardado ? (JSON.parse(guardado) as Borrador) : null
      } catch { borrador = null }
      setNombre(borrador?.nombre ?? '')
      setPrecio(borrador?.precio ?? null)
      setDescuento(borrador?.descuento ?? 0)
      setDescripcion(borrador?.descripcion ?? '')
      setActivo(true)
      setFilas(borrador?.filas?.length ? borrador.filas : [filaVacia()])
      setRecuperado(Boolean(borrador))
    }
    setIniciado(true)
  }, [open, tratamiento?.id, duplicar])

  // ── El avance de un tratamiento nuevo se guarda en este navegador ──
  useEffect(() => {
    if (!open || !iniciado || tratamiento) return
    const algoEscrito = nombre.trim() !== '' || filas.some((f) => f.procs.length > 0 || f.descripcion.trim())
    try {
      if (!algoEscrito) { window.localStorage.removeItem(claveBorrador); return }
      const borrador: Borrador = { nombre, precio, descuento, descripcion, filas }
      window.localStorage.setItem(claveBorrador, JSON.stringify(borrador))
    } catch { /* sin almacenamiento: no se guarda el avance */ }
  }, [open, iniciado, tratamiento, nombre, precio, descuento, descripcion, filas, claveBorrador])

  // Numeración corrida: "1", "2–5", "6"…
  const etiquetas = useMemo(() => {
    let siguiente = 1
    return filas.map((f) => {
      const etiqueta = f.cantidad === 1 ? `${siguiente}` : `${siguiente}–${siguiente + f.cantidad - 1}`
      siguiente += f.cantidad
      return etiqueta
    })
  }, [filas])

  const filasUtiles = filas.filter((f) => !filaEnBlanco(f))
  const totalSesiones = filasUtiles.reduce((suma, f) => suma + f.cantidad, 0)
  const totalMinutos = filasUtiles.reduce((suma, f) => suma + f.cantidad * duracionDeFila(f), 0)

  // Se recalcula en vivo tras el primer intento, así el rojo desaparece al corregir.
  const faltaNombre = intentado && !nombre.trim()
  const sinSesiones = intentado && filasUtiles.length === 0
  const erroresDeFila = (f: Fila) => {
    if (!intentado) return null
    if (filaEnBlanco(f)) return sinSesiones && f === filas[0] ? { nombre: true, minutos: false } : null
    const p = problemasDeFila(f)
    return p.nombre || p.minutos ? p : null
  }
  const hayErrores = faltaNombre || sinSesiones || filas.some((f) => erroresDeFila(f) !== null)

  // Los consentimientos vienen de los procedimientos: se cuentan una vez aunque se repitan.
  const consentimientos = useMemo(() => {
    const ids = new Set(filas.flatMap((f) => f.procs.map((p) => p.id)))
    // Por nombre: dos plantillas con el mismo nombre se ven como una sola para quien arma el tratamiento.
    const nombres = new Map<string, string>()
    for (const s of servicios) {
      if (!ids.has(s.id)) continue
      for (const c of s.consentimientos_requeridos ?? []) {
        if (c.activo !== false && c.template_nombre) nombres.set(c.template_nombre.trim().toLowerCase(), c.template_nombre)
      }
    }
    return Array.from(nombres.values())
  }, [filas, servicios])

  const sinProfesional = useMemo(() => {
    if (!filtroActivo) return []
    const ids = new Set(filas.flatMap((f) => f.procs.map((p) => p.id)))
    return servicios
      .filter((s) => ids.has(s.id) && (s.profesionales_detalle?.length ?? 0) === 0)
      .map((s) => s.nombre)
  }, [filtroActivo, filas, servicios])

  // ── Edición de filas ──
  const cambiarFila = (i: number, f: Fila) => setFilas((prev) => prev.map((x, j) => (j === i ? f : x)))
  const quitarFila = (i: number) => setFilas((prev) => prev.filter((_, j) => j !== i))
  const moverFila = (i: number, direccion: -1 | 1) => setFilas((prev) => {
    const destino = i + direccion
    if (destino < 0 || destino >= prev.length) return prev
    const copia = [...prev]
    ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
    return copia
  })

  const abrirCreacionDeProcedimiento = (alCrear: (s: Procedimiento) => void) => {
    setAlCrearProcedimiento(() => alCrear)
    setProcDialogAbierto(true)
  }

  // ── Guardar ──
  /** Id del primer campo con problema, o null si todo está bien. */
  const primerCampoInvalido = (): string | null => {
    if (!nombre.trim()) return 'trat-nombre'
    if (filasUtiles.length === 0) return filas[0] ? idCampo(filas[0], 'nombre') : null
    for (const f of filasUtiles) {
      const p = problemasDeFila(f)
      if (p.nombre) return idCampo(f, 'nombre')
      if (p.minutos) return idCampo(f, 'min')
    }
    return null
  }

  const guardar = useMutation({
    mutationFn: (payload: CreateTratamientoCatalogoRequest & { activo?: boolean }) =>
      esEdicion ? clinicasApi.tratamientos.update(tratamiento!.id, payload) : clinicasApi.tratamientos.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tratamientos'] })
      qc.invalidateQueries({ queryKey: ['setup-checklist'] })
      try { window.localStorage.removeItem(claveBorrador) } catch { /* nada que limpiar */ }
      toast.success(esEdicion ? 'Tratamiento guardado' : 'Tratamiento creado')
      cerrar()
    },
    onError: (error) => setErrores(mensajesDelServidor(error)),
  })

  const enviar = () => {
    setIntentado(true)
    setErrores([])
    const invalido = primerCampoInvalido()
    if (invalido) {
      requestAnimationFrame(() => {
        const el = document.getElementById(invalido)
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el?.focus({ preventScroll: true })
      })
      return
    }
    guardar.mutate({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      precio_estimado: precio,
      descuento_maximo_pct: descuento,
      ...(esEdicion ? { activo } : {}),
      tipos_sesion: filasUtiles.map((f, i) => ({
        ...(f.id ? { id: f.id } : {}),
        nombre: nombreDeFila(f),
        cantidad: f.cantidad,
        orden: i + 1,
        es_compromiso: f.agenda,
        duracion_min: duracionDeFila(f),
        procedimientos: f.procs.map((p, j) => ({
          ...(p.tipoProcId ? { id: p.tipoProcId } : {}),
          procedimiento: p.id,
          orden: j + 1,
        })),
      })),
    })
  }

  function cerrar() {
    onOpenChange(false)
    setTimeout(() => { setIniciado(false); setErrores([]); setIntentado(false); guardar.reset() }, 200)
  }

  const empezarDeCero = () => {
    try { window.localStorage.removeItem(claveBorrador) } catch { /* nada que limpiar */ }
    setNombre(''); setPrecio(null); setDescuento(0); setDescripcion('')
    setFilas([filaVacia()]); setRecuperado(false); setErrores([]); setIntentado(false)
  }

  const vendidos = esEdicion ? (tratamiento?.pacientes_con_tratamiento ?? 0) : 0
  const titulo = esEdicion ? 'Editar tratamiento' : duplicar ? 'Duplicar tratamiento' : 'Nuevo tratamiento'

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) cerrar() }}>
        <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden max-h-[90vh] w-full sm:max-w-5xl">
          <DialogHeader className="px-6 py-4 border-b shrink-0 space-y-0">
            <DialogTitle className="text-base">{titulo}</DialogTitle>
            <DialogDescription className="pt-1 text-xs">
              Lo que vendes al paciente: un paquete de sesiones con un precio.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {recuperado && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5 shrink-0" />Recuperamos lo que estabas armando.</span>
                <button type="button" onClick={empezarDeCero} className="font-medium text-primary hover:underline shrink-0">Empezar de cero</button>
              </div>
            )}
            {vendidos > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {vendidos === 1 ? '1 paciente ya tiene' : `${vendidos} pacientes ya tienen`} este tratamiento y
                  conserva{vendidos === 1 ? '' : 'n'} lo que compr{vendidos === 1 ? 'ó' : 'aron'}. Los cambios aplican solo a las próximas ventas.
                </span>
              </div>
            )}

            {/* Datos del tratamiento */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="trat-nombre">Nombre *</Label>
                <Input
                  id="trat-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Rejuvenecimiento facial"
                  autoFocus={!tratamiento}
                  aria-invalid={faltaNombre || undefined}
                  className={cn(faltaNombre && 'border-destructive focus-visible:ring-destructive')}
                />
                {faltaNombre && <p className="text-xs text-destructive">Escribe el nombre del tratamiento.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trat-precio">Precio de lista</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                  <Input
                    id="trat-precio"
                    inputMode="numeric"
                    className="pl-7"
                    placeholder="0"
                    value={precio != null ? new Intl.NumberFormat('es-CO').format(precio) : ''}
                    onChange={(e) => { const crudo = e.target.value.replace(/\D/g, ''); setPrecio(crudo ? Number(crudo) : null) }}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trat-dto">Descuento máximo al cotizar</Label>
                <div className="relative max-w-[8rem]">
                  <Input
                    id="trat-dto"
                    inputMode="numeric" className="pr-7" value={descuento}
                    onChange={(e) => { const crudo = e.target.value.replace(/\D/g, '').slice(0, 3); setDescuento(crudo ? Math.min(100, Number(crudo)) : 0) }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                </div>
              </div>
            </div>

            {/* Sesiones */}
            <div className="space-y-2">
              <div className="space-y-0.5">
                <Label>Sesiones</Label>
                <p className="text-xs text-muted-foreground">
                  Cada sesión puede llevar procedimientos; de ellos salen la duración y los consentimientos que firmará el paciente.
                </p>
              </div>
              <div className="rounded-lg border divide-y">
                <div className="grid items-end gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30" style={COLUMNAS}>
                  <span />
                  <span>#</span>
                  <span>Procedimientos</span>
                  <span>Nombre de la sesión</span>
                  <span className="text-center">Nº de veces</span>
                  <span>Duración</span>
                  <span />
                </div>
                {filas.map((f, i) => (
                  <FilaDeSesion
                    key={f.key}
                    fila={f}
                    etiqueta={etiquetas[i]}
                    esPrimera={i === 0}
                    esUltima={i === filas.length - 1}
                    puedeQuitar={filas.length > 1}
                    servicios={servicios}
                    errores={erroresDeFila(f)}
                    onChange={(nueva) => cambiarFila(i, nueva)}
                    onQuitar={() => quitarFila(i)}
                    onMover={(d) => moverFila(i, d)}
                    onCrearProcedimiento={abrirCreacionDeProcedimiento}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <Button type="button" variant="outline" size="sm" onClick={() => setFilas((prev) => [...prev, filaVacia()])}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />Agregar sesión
                </Button>
                <p className="text-xs text-muted-foreground">Ej: 4 sesiones de peeling = una fila con Peeling y 4 en Nº de veces.</p>
              </div>
              {sinSesiones && <p className="text-xs text-destructive">Agrega al menos una sesión.</p>}
              {consentimientos.length > 0 && (
                <p className="text-xs">
                  <span className="font-medium">Consentimientos que firmará el paciente:</span> {consentimientos.join(', ')}.
                </p>
              )}
              {sinProfesional.length > 0 && (
                <p className="text-xs text-amber-700">
                  Sin profesionales asociados: {sinProfesional.join(', ')}. No se podrán agendar.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trat-desc">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Textarea id="trat-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
            </div>

            {esEdicion && (
              <label className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 cursor-pointer">
                <span>
                  <span className="block text-sm font-medium">Activo</span>
                  <span className="block text-xs text-muted-foreground">Los tratamientos inactivos no aparecen en cotizaciones</span>
                </span>
                <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-primary" />
              </label>
            )}

            {errores.length > 0 && (
              <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5 space-y-0.5">
                {errores.map((e) => <p key={e} className="text-sm text-destructive">{e}</p>)}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t px-6 py-4 flex justify-between items-center gap-3 flex-wrap bg-background">
            <p className="text-sm">
              {hayErrores && (
                <span className="block text-destructive font-medium">Revisa los campos marcados en rojo.</span>
              )}
              <span className="font-medium">{totalSesiones} {totalSesiones === 1 ? 'sesión' : 'sesiones'}</span>
              <span className="text-muted-foreground"> · {formatoDuracion(totalMinutos)}</span>
              <span className="text-muted-foreground">
                {' · '}{consentimientos.length} {consentimientos.length === 1 ? 'consentimiento' : 'consentimientos'}
              </span>
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={cerrar} disabled={guardar.isPending}>Cancelar</Button>
              <Button onClick={enviar} disabled={guardar.isPending}>
                {guardar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {esEdicion ? 'Guardar cambios' : 'Crear tratamiento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProcedimientoDialog
        open={procDialogAbierto}
        onOpenChange={setProcDialogAbierto}
        onCreated={(s) => {
          qc.invalidateQueries({ queryKey: ['procedimientos'] })
          alCrearProcedimiento?.(s)
          setProcDialogAbierto(false)
          setAlCrearProcedimiento(null)
        }}
      />
    </>
  )
}

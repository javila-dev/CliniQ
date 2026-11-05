'use client'

/*
 * Salas y equipos de una sede (docs/plan-salas-y-equipos.md). Se configura una
 * vez: cuántas cabinas hay y qué equipos se comparten. Lo que usa cada
 * procedimiento se marca en el procedimiento; aquí hay un atajo para los equipos.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, DoorOpen, Minus, MoreHorizontal, Plus, Search, Zap } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { cn, formatFechaLocal } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes, SelectAjuste,
} from '@/components/configuracion/ajustes'
import type {
  DiaSemana, HorarioRecurso, PrevisualizacionRecursos, Recurso, RecursoInput, Sede, TipoRecurso,
} from '@/types/clinicas'

const DIAS: { key: DiaSemana; label: string; short: string }[] = [
  { key: 'lunes', label: 'lunes', short: 'L' },
  { key: 'martes', label: 'martes', short: 'M' },
  { key: 'miercoles', label: 'miércoles', short: 'X' },
  { key: 'jueves', label: 'jueves', short: 'J' },
  { key: 'viernes', label: 'viernes', short: 'V' },
  { key: 'sabado', label: 'sábado', short: 'S' },
  { key: 'domingo', label: 'domingo', short: 'D' },
]

const claveRecursos = (sedeId: string) => ['recursos', sedeId] as const

// ── Días disponibles ───────────────────────────────────────────

/** Días sin registro "no disponible" (los que viene). Sin horario propio: todos. */
function diasQueViene(horarios: HorarioRecurso[]): DiaSemana[] {
  const fuera = new Set(horarios.filter((h) => h.no_disponible).map((h) => h.dia_semana))
  return DIAS.map((d) => d.key).filter((d) => !fuera.has(d))
}

function listaDias(dias: DiaSemana[]): string {
  const nombres = DIAS.filter((d) => dias.includes(d.key)).map((d) => d.label)
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** "Todos los días que abre la sede" o "Viene martes y jueves". */
export function textoDisponibilidad(recurso: Pick<Recurso, 'horarios' | 'tipo'>): string {
  const dias = diasQueViene(recurso.horarios)
  const conHoras = recurso.horarios.some((h) => !h.no_disponible && h.hora_inicio)
  if (dias.length === 7) return conHoras ? 'Con horario propio' : 'Todos los días que abre la sede'
  if (dias.length === 0) return 'No está disponible ningún día'
  const verbo = recurso.tipo === 'equipo' ? 'Viene' : 'Disponible'
  return `${verbo} ${listaDias(dias)}${conHoras ? ' (con horario propio)' : ''}`
}

function DiasEditor({ horarios, onChange }: { horarios: HorarioRecurso[]; onChange: (h: HorarioRecurso[]) => void }) {
  const dias = diasQueViene(horarios)
  const todos = dias.length === 7 && !horarios.some((h) => h.hora_inicio)
  const [conHoras, setConHoras] = useState(horarios.some((h) => !h.no_disponible && h.hora_inicio))

  const fijar = (siguientes: DiaSemana[], horas: Record<string, [string | null, string | null]> = {}) => {
    onChange(DIAS.flatMap(({ key }): HorarioRecurso[] => {
      if (!siguientes.includes(key)) return [{ dia_semana: key, no_disponible: true, hora_inicio: null, hora_fin: null }]
      const [ini, fin] = horas[key] ?? [null, null]
      return ini && fin ? [{ dia_semana: key, no_disponible: false, hora_inicio: ini, hora_fin: fin }] : []
    }))
  }
  const horasActuales = Object.fromEntries(
    horarios.filter((h) => !h.no_disponible && h.hora_inicio).map((h) => [h.dia_semana, [h.hora_inicio, h.hora_fin]]),
  ) as Record<string, [string | null, string | null]>

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        {([['todos', 'Todos los días que abre la sede'], ['algunos', 'Solo algunos días']] as const).map(([valor, texto]) => {
          const marcado = valor === 'todos' ? todos : !todos
          return (
            <label key={valor} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                className="h-4 w-4 accent-primary"
                checked={marcado}
                onChange={() => {
                  if (valor === 'todos') { setConHoras(false); onChange([]) }
                  else fijar(['lunes', 'martes', 'miercoles', 'jueves', 'viernes'])
                }}
              />
              {texto}
            </label>
          )
        })}
      </div>
      {!todos && (
        <div className="space-y-2 pl-6">
          <div className="flex gap-1.5">
            {DIAS.map(({ key, label, short }) => {
              const activo = dias.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={activo}
                  aria-label={label}
                  title={label}
                  onClick={() => fijar(activo ? dias.filter((d) => d !== key) : [...dias, key], horasActuales)}
                  className={cn(
                    'h-8 w-8 rounded-md text-xs font-semibold transition-colors',
                    activo ? 'bg-primary text-primary-foreground' : 'border border-dashed border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {short}
                </button>
              )
            })}
          </div>
          {!conHoras ? (
            <button type="button" onClick={() => setConHoras(true)} className="text-xs font-medium text-primary hover:underline">
              Con horario distinto al de la sede
            </button>
          ) : (
            <div className="space-y-1.5">
              {DIAS.filter((d) => dias.includes(d.key)).map(({ key, label }) => {
                const [ini, fin] = horasActuales[key] ?? [null, null]
                const cambiar = (i: 0 | 1, valor: string) => {
                  const actual: [string | null, string | null] = [ini, fin]
                  actual[i] = valor || null
                  fijar(dias, { ...horasActuales, [key]: actual })
                }
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="w-20 capitalize text-muted-foreground">{label}</span>
                    <input type="time" value={ini ?? ''} onChange={(e) => cambiar(0, e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" aria-label={`Desde el ${label}`} />
                    <span className="text-[13px] text-muted-foreground">a</span>
                    <input type="time" value={fin ?? ''} onChange={(e) => cambiar(1, e.target.value)} className="w-28 rounded border px-2 py-1 text-sm" aria-label={`Hasta el ${label}`} />
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground">Vacío: el horario de la sede.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aviso de citas ya agendadas ────────────────────────────────

export function AvisoCitasAfectadas({ previa }: { previa: PrevisualizacionRecursos }) {
  if (previa.total_sin_lugar === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-emerald-700">
        <Check className="h-3.5 w-3.5" />
        {previa.citas_revisadas === 0
          ? 'No hay citas agendadas que se vean afectadas.'
          : `Las ${previa.citas_revisadas} citas agendadas tienen lugar.`}
      </p>
    )
  }
  const n = previa.total_sin_lugar
  const tipo = previa.sin_lugar[0]?.faltan[0]?.tipo === 'equipo' ? 'equipo' : 'sala'
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
      <p className="font-medium">
        {n} cita{n !== 1 ? 's' : ''} agendada{n !== 1 ? 's' : ''} no {n !== 1 ? 'tendrían' : 'tendría'} {tipo === 'equipo' ? 'el equipo' : 'una sala'} libre.
      </p>
      <p className="mt-0.5 text-amber-800">
        Quedarán marcadas «Falta {tipo}» en la agenda para que las muevas. No se cancela ninguna.
      </p>
      <ul className="mt-1.5 space-y-0.5 text-amber-800">
        {previa.sin_lugar.slice(0, 5).map((c) => (
          <li key={c.cita_id}>
            {formatFechaLocal(c.fecha_inicio.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
            {new Date(c.fecha_inicio).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · {c.paciente}
          </li>
        ))}
        {n > 5 && <li>y {n - 5} más</li>}
      </ul>
    </div>
  )
}

// ── Procedimientos que usan el equipo ──────────────────────────

function ProcedimientosDelEquipo({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [buscar, setBuscar] = useState('')
  const { data: procedimientos = [] } = useQuery({
    queryKey: ['procedimientos-activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
  })
  const q = buscar.trim().toLowerCase()
  const visibles = q ? procedimientos.filter((p) => p.nombre.toLowerCase().includes(q)) : procedimientos
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const sinMarcar = visibles.filter((p) => !value.includes(p.id))

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar procedimiento…" className="h-9 pl-8 text-sm" />
      </div>
      {q && sinMarcar.length > 1 && (
        <button
          type="button"
          onClick={() => onChange([...value, ...sinMarcar.map((p) => p.id)])}
          className="text-xs font-medium text-primary hover:underline"
        >
          Marcar los {sinMarcar.length} que contienen «{buscar.trim()}»
        </button>
      )}
      <div className="max-h-56 overflow-y-auto rounded-lg border py-1">
        {visibles.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-muted-foreground">Sin resultados</p>
        ) : visibles.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
            <span className="truncate">{p.nombre}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length === 0 ? 'Ninguno todavía. También se marca desde cada procedimiento.' : `${value.length} marcado${value.length !== 1 ? 's' : ''}. También se cambia desde cada procedimiento.`}
      </p>
    </div>
  )
}

// ── Crear o editar ─────────────────────────────────────────────

function RecursoSheet({
  sede, tipo, recurso, open, onClose,
}: {
  sede: Sede
  tipo: TipoRecurso
  recurso: Recurso | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [horarios, setHorarios] = useState<HorarioRecurso[]>([])
  const [procedimientos, setProcedimientos] = useState<string[]>([])
  const [previa, setPrevia] = useState<PrevisualizacionRecursos | null>(null)
  const esEquipo = tipo === 'equipo'

  useEffect(() => {
    if (!open) return
    setNombre(recurso?.nombre ?? '')
    setHorarios(recurso?.horarios ?? [])
    setProcedimientos(recurso?.procedimientos ?? [])
    setPrevia(null)
  }, [open, recurso])

  // Cualquier cambio invalida el aviso: se vuelve a revisar al guardar.
  useEffect(() => { setPrevia(null) }, [horarios, procedimientos])

  const datos: RecursoInput = {
    sede: sede.id,
    nombre,
    tipo,
    horarios,
    ...(esEquipo ? { procedimientos } : {}),
  }

  const guardar = useMutation({
    mutationFn: async (forzar: boolean) => {
      // Antes de guardar se mira qué pasa con lo agendado; si algo queda sin
      // lugar se avisa y se pide confirmar.
      if (!forzar) {
        const resultado = await clinicasApi.recursos.previsualizar({ recurso: datos, ...(recurso ? { recurso_id: recurso.id } : {}) })
        if (resultado.total_sin_lugar > 0) {
          setPrevia(resultado)
          return null
        }
      }
      return recurso ? clinicasApi.recursos.update(recurso.id, datos) : clinicasApi.recursos.create(datos)
    },
    onSuccess: (guardado) => {
      if (!guardado) return
      qc.invalidateQueries({ queryKey: ['recursos'] })
      qc.invalidateQueries({ queryKey: ['procedimiento'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      toast.success(recurso ? 'Guardado' : `${esEquipo ? 'Equipo' : 'Sala'} creado${esEquipo ? '' : 'a'}`)
      onClose()
    },
  })

  const titulo = recurso ? `Editar ${recurso.nombre}` : esEquipo ? 'Agregar equipo' : 'Agregar sala'

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>
        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => { e.preventDefault(); guardar.mutate(Boolean(previa)) }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="recurso-nombre">Nombre</Label>
            <Input
              id="recurso-nombre"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={esEquipo ? 'Soprano, láser diodo, HIFU…' : 'Cabina 1, Consultorio 2…'}
            />
          </div>

          <div className="space-y-2">
            <Label>Disponible</Label>
            <DiasEditor horarios={horarios} onChange={setHorarios} />
          </div>

          {esEquipo && (
            <div className="space-y-2">
              <Label>¿Qué procedimientos lo usan?</Label>
              <ProcedimientosDelEquipo value={procedimientos} onChange={setProcedimientos} />
            </div>
          )}

          {previa && <AvisoCitasAfectadas previa={previa} />}

          {guardar.isError && (
            <p className="text-sm text-destructive">{mensajeDeError(guardar.error, 'No se pudo guardar. Intenta de nuevo.')}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={guardar.isPending || !nombre.trim()}>
              {guardar.isPending ? 'Guardando…' : previa ? 'Guardar igual' : recurso ? 'Guardar cambios' : esEquipo ? 'Agregar equipo' : 'Agregar sala'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ── No disponible… ─────────────────────────────────────────────

function hoyLocal(hora: string) {
  const d = new Date()
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${fecha}T${hora}`
}

function NoDisponibleDialog({ recurso, onClose }: { recurso: Recurso | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [desde, setDesde] = useState(hoyLocal('08:00'))
  const [hasta, setHasta] = useState(hoyLocal('18:00'))
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!recurso) return
    setDesde(hoyLocal('08:00'))
    setHasta(hoyLocal('18:00'))
    setMotivo('')
  }, [recurso])

  const guardar = useMutation({
    mutationFn: () => clinicasApi.recursos.noDisponible(recurso!.id, {
      fecha_inicio: new Date(desde).toISOString(),
      fecha_fin: new Date(hasta).toISOString(),
      motivo,
    }),
    onSuccess: ({ citas }) => {
      qc.invalidateQueries({ queryKey: ['citas'] })
      qc.invalidateQueries({ queryKey: ['slots'] })
      const n = citas.total_sin_lugar
      toast.success(
        `${recurso!.nombre} quedó no disponible`,
        n ? `${n} cita${n !== 1 ? 's' : ''} quedaron sin ${recurso!.tipo === 'equipo' ? 'equipo' : 'sala'}: aparecen en la agenda para moverlas.` : undefined,
      )
      onClose()
    },
  })

  return (
    <Dialog open={!!recurso} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{recurso?.nombre} no disponible</DialogTitle>
          <DialogDescription>
            Mientras tanto no se agenda nada que lo necesite. Lo ya agendado se pasa a otra {recurso?.tipo === 'equipo' ? 'unidad' : 'sala'} si hay una libre.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nd-desde">Desde</Label>
              <Input id="nd-desde" type="datetime-local" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nd-hasta">Hasta</Label>
              <Input id="nd-hasta" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nd-motivo">Motivo</Label>
            <Textarea id="nd-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Mantenimiento, no llegó…" />
          </div>
          {guardar.isError && <p className="text-sm text-destructive">{mensajeDeError(guardar.error)}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={guardar.isPending || !desde || !hasta}>
              {guardar.isPending ? 'Guardando…' : 'Marcar no disponible'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Primer uso: dos preguntas ──────────────────────────────────

function Bienvenida({ sede, onAgregarEquipo }: { sede: Sede; onAgregarEquipo: () => void }) {
  const qc = useQueryClient()
  const [cabinas, setCabinas] = useState(2)
  const crear = useMutation({
    mutationFn: async () => {
      for (let i = 1; i <= cabinas; i++) {
        await clinicasApi.recursos.create({ sede: sede.id, nombre: `Cabina ${i}`, tipo: 'sala', orden: i })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recursos'] })
      toast.success(`${cabinas} cabina${cabinas !== 1 ? 's' : ''} creada${cabinas !== 1 ? 's' : ''}`, 'Puedes cambiarles el nombre.')
    },
    onError: (err) => toast.error('No se pudieron crear las cabinas', mensajeDeError(err)),
  })

  return (
    <div className="space-y-5 px-4 py-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">¿Cuántas cabinas o consultorios tiene esta sede?</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg border">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Una menos"
              onClick={() => setCabinas((n) => Math.max(1, n - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">{cabinas}</span>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Una más"
              onClick={() => setCabinas((n) => Math.min(30, n + 1))}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button type="button" size="sm" onClick={() => crear.mutate()} disabled={crear.isPending}>
            {crear.isPending ? 'Creando…' : `Crear ${cabinas === 1 ? 'la cabina' : `${cabinas} cabinas`}`}
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Crea «Cabina 1»{cabinas > 1 ? `${cabinas > 2 ? ', …' : ''} y «Cabina ${cabinas}»` : ''}. Puedes cambiarles el nombre.
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">¿Tienes equipos que se comparten entre cabinas?</p>
        <p className="text-[13px] text-muted-foreground">Por ejemplo, un láser que solo puede estar en una cabina a la vez.</p>
        <Button type="button" size="sm" variant="outline" onClick={onAgregarEquipo}>
          <Plus className="mr-1.5 h-4 w-4" />Agregar equipo
        </Button>
      </div>
    </div>
  )
}

// ── Sección ────────────────────────────────────────────────────

/** La frase que resume el efecto en la agenda. */
function resumen(recursos: Recurso[]): string | null {
  const salas = recursos.filter((r) => r.tipo === 'sala' && r.activo)
  const equipos = recursos.filter((r) => r.tipo === 'equipo' && r.activo)
  const partes: string[] = []
  if (salas.length) {
    partes.push(`no dejará más de ${salas.length === 1 ? 'una cita' : `${salas.length} citas`} a la vez que necesite${salas.length === 1 ? '' : 'n'} sala`)
  }
  for (const e of equipos) {
    const dias = diasQueViene(e.horarios)
    const cuando = dias.length === 7 ? '' : dias.length ? `, que viene ${listaDias(dias)}` : ', que ahora no está disponible ningún día'
    partes.push(`solo una a la vez con ${e.nombre}${cuando}`)
  }
  if (!partes.length) return null
  const unidas = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join('; ')} y ${partes[partes.length - 1]}`
  return `La agenda de esta sede ${unidas}.`
}

export function SalasYEquipos({ sedes, puedeGestionar }: { sedes: Sede[]; puedeGestionar: boolean }) {
  const qc = useQueryClient()
  const activas = useMemo(() => sedes.filter((s) => s.activo), [sedes])
  const [sedeId, setSedeId] = useState('')
  const sede = activas.find((s) => s.id === sedeId) ?? activas[0]
  const [editor, setEditor] = useState<{ tipo: TipoRecurso; recurso: Recurso | null } | null>(null)
  const [noDisponible, setNoDisponible] = useState<Recurso | null>(null)

  const { data: recursos = [], isLoading } = useQuery({
    queryKey: claveRecursos(sede?.id ?? ''),
    queryFn: () => clinicasApi.recursos.list({ sede: sede!.id }),
    enabled: !!sede,
  })

  const cambiar = useMutation({
    mutationFn: ({ r, data }: { r: Recurso; data: RecursoInput }) => clinicasApi.recursos.update(r.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recursos'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
    },
    onError: (err) => toast.error('No se pudo guardar', mensajeDeError(err)),
  })
  const eliminar = useMutation({
    mutationFn: (r: Recurso) => clinicasApi.recursos.delete(r.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recursos'] }),
    onError: (err) => toast.error('No se pudo eliminar', mensajeDeError(err)),
  })

  if (!sede) return null
  // Sin nada configurado y sin permiso para configurarlo: no se muestra.
  if (!puedeGestionar && !isLoading && recursos.length === 0) return null

  const frase = resumen(recursos)
  const ordenados = [...recursos].sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden || a.nombre.localeCompare(b.nombre) : a.tipo === 'sala' ? -1 : 1))

  return (
    <>
      <SeccionAjustes
        id="salas-y-equipos"
        titulo="Salas y equipos"
        descripcion="Para que la agenda no cruce citas en la misma cabina ni con el mismo equipo."
        accion={activas.length > 1 && (
          <SelectAjuste
            etiqueta="Sede"
            valor={sede.id}
            onCambiar={setSedeId}
            opciones={activas.map((s) => ({ value: s.id, label: s.nombre }))}
          />
        )}
      >
        {isLoading ? (
          <div className="px-4 py-5 text-sm text-muted-foreground">Cargando…</div>
        ) : recursos.length === 0 ? (
          <Bienvenida sede={sede} onAgregarEquipo={() => setEditor({ tipo: 'equipo', recurso: null })} />
        ) : (
          <>
            {frase && <div className="bg-primary/[0.03] px-4 py-3 text-[13px] text-foreground">{frase}</div>}
            {ordenados.map((r) => {
              const usos = r.total_procedimientos
              const usan = r.tipo === 'equipo'
                ? usos ? `Lo ${usos === 1 ? 'usa 1 procedimiento' : `usan ${usos} procedimientos`}` : 'Ningún procedimiento lo usa todavía'
                : usos ? `La ${usos === 1 ? 'usa 1 procedimiento' : `usan ${usos} procedimientos`}` : 'Ningún procedimiento pide sala todavía'
              return (
                <FilaAjuste
                  key={r.id}
                  icono={r.tipo === 'sala' ? DoorOpen : Zap}
                  apagada={!r.activo}
                  titulo={r.nombre}
                  extra={!r.activo && <EtiquetaAjuste>Inactiva</EtiquetaAjuste>}
                  descripcion={`${usan} · ${textoDisponibilidad(r)}`}
                >
                  {puedeGestionar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${r.nombre}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditor({ tipo: r.tipo, recurso: r })}>Editar</DropdownMenuItem>
                        {r.activo && <DropdownMenuItem onClick={() => setNoDisponible(r)}>No disponible…</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => cambiar.mutate({ r, data: { activo: !r.activo } })}>
                          {r.activo ? 'Desactivar' : 'Activar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => { if (window.confirm(`¿Eliminar ${r.nombre}? Si ya tiene citas, desactívalo en su lugar.`)) eliminar.mutate(r) }}
                        >
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </FilaAjuste>
              )
            })}
            {puedeGestionar && (
              <div className="flex flex-wrap gap-2 px-4 py-3">
                <Button size="sm" variant="outline" onClick={() => setEditor({ tipo: 'sala', recurso: null })}>
                  <Plus className="mr-1.5 h-4 w-4" />Agregar sala
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditor({ tipo: 'equipo', recurso: null })}>
                  <Plus className="mr-1.5 h-4 w-4" />Agregar equipo
                </Button>
              </div>
            )}
            <NotaAjuste>
              Qué sala o equipo necesita cada procedimiento se marca al crearlo o editarlo. Al agendar, la cita toma uno libre sola.
            </NotaAjuste>
          </>
        )}
      </SeccionAjustes>

      {editor && (
        <RecursoSheet
          sede={sede}
          tipo={editor.tipo}
          recurso={editor.recurso}
          open={!!editor}
          onClose={() => setEditor(null)}
        />
      )}
      <NoDisponibleDialog recurso={noDisponible} onClose={() => setNoDisponible(null)} />
    </>
  )
}

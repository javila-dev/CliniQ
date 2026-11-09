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
  EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes,
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


// ── Días disponibles ───────────────────────────────────────────

/** Días sin registro "no disponible" (los que viene). Sin horario propio: todos. */
export function diasQueViene(horarios: HorarioRecurso[]): DiaSemana[] {
  const fuera = new Set(horarios.filter((h) => h.no_disponible).map((h) => h.dia_semana))
  return DIAS.map((d) => d.key).filter((d) => !fuera.has(d))
}

export function listaDias(dias: DiaSemana[]): string {
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

export function DiasEditor({ horarios, onChange }: { horarios: HorarioRecurso[]; onChange: (h: HorarioRecurso[]) => void }) {
  const dias = diasQueViene(horarios)
  const todos = dias.length === 7 && !horarios.some((h) => h.hora_inicio)
  const tieneHoras = horarios.some((h) => !h.no_disponible && h.hora_inicio)
  const [conHoras, setConHoras] = useState(tieneHoras)
  // Al editar, el horario llega después del primer render.
  useEffect(() => { if (tieneHoras) setConHoras(true) }, [tieneHoras])
  // Horas a medio escribir (solo "desde" o solo "hasta"): no se guardan todavía,
  // pero tienen que seguir en el campo mientras se escribe la otra.
  const [borrador, setBorrador] = useState<Record<string, [string | null, string | null]>>({})

  const fijar = (siguientes: DiaSemana[], horas: Record<string, [string | null, string | null]> = {}) => {
    onChange(DIAS.flatMap(({ key }): HorarioRecurso[] => {
      if (!siguientes.includes(key)) return [{ dia_semana: key, no_disponible: true, hora_inicio: null, hora_fin: null }]
      const [ini, fin] = horas[key] ?? [null, null]
      return ini && fin ? [{ dia_semana: key, no_disponible: false, hora_inicio: ini, hora_fin: fin }] : []
    }))
  }
  const horasActuales = {
    ...Object.fromEntries(
      horarios.filter((h) => !h.no_disponible && h.hora_inicio).map((h) => [h.dia_semana, [h.hora_inicio, h.hora_fin]]),
    ),
    ...borrador,
  } as Record<string, [string | null, string | null]>

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
                  setBorrador((b) => ({ ...b, [key]: actual }))
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
          : previa.citas_revisadas === 1
            ? 'La cita agendada tiene lugar.'
            : `Las ${previa.citas_revisadas} citas agendadas tienen lugar.`}
      </p>
    )
  }
  const n = previa.total_sin_lugar
  const tipo = previa.sin_lugar[0]?.faltan[0]?.tipo === 'equipo' ? 'equipo' : 'sala'
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
      <p className="font-medium">
        {n} cita{n !== 1 ? 's' : ''} agendada{n !== 1 ? 's' : ''} no {n !== 1 ? 'tendrían' : 'tendría'} {tipo === 'equipo' ? 'el equipo' : 'una cabina o consultorio'} libre.
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

export function ProcedimientosDelEquipo({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
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

export const mismoNombre = (a: string, b: string) =>
  a.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  === b.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function RecursoSheet({
  sede, sedes, existentes, tipo, recurso, open, onClose,
}: {
  sede: Sede
  /** Sedes activas: un equipo nuevo se puede crear en varias a la vez. */
  sedes: Sede[]
  /** Salas y equipos que ya existen (de todas las sedes). */
  existentes: Recurso[]
  tipo: TipoRecurso
  recurso: Recurso | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [horarios, setHorarios] = useState<HorarioRecurso[]>([])
  const [procedimientos, setProcedimientos] = useState<string[]>([])
  const [tocoProcedimientos, setTocoProcedimientos] = useState(false)
  const [enSedes, setEnSedes] = useState<string[]>([])
  const [previa, setPrevia] = useState<PrevisualizacionRecursos | null>(null)
  const esEquipo = tipo === 'equipo'
  const creando = !recurso

  useEffect(() => {
    if (!open) return
    setNombre(recurso?.nombre ?? '')
    setHorarios(recurso?.horarios ?? [])
    setProcedimientos(recurso?.procedimientos ?? [])
    setTocoProcedimientos(false)
    setEnSedes([sede.id])
    setPrevia(null)
  }, [open, recurso, sede.id])

  // El mismo equipo (mismo nombre) en otras sedes.
  const gemelos = esEquipo && nombre.trim()
    ? existentes.filter((r) => r.tipo === 'equipo' && r.id !== recurso?.id && mismoNombre(r.nombre, nombre))
    : []
  const sedesConEse = new Set(gemelos.map((g) => g.sede))
  // Al crear uno que ya existe en otra sede: usa los mismos procedimientos.
  const copiados = creando && !tocoProcedimientos && gemelos.length > 0
    ? Array.from(new Set(gemelos.flatMap((g) => g.procedimientos)))
    : null
  useEffect(() => {
    if (copiados) setProcedimientos(copiados)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copiados?.join(',')])
  // Las sedes que ya tienen uno con ese nombre no se pueden marcar (sería repetido).
  useEffect(() => {
    setEnSedes((actual) => {
      const sin = actual.filter((id) => !sedesConEse.has(id))
      return sin.length === actual.length ? actual : sin
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(sedesConEse).join(',')])

  // Cualquier cambio invalida el aviso: se vuelve a revisar al guardar.
  useEffect(() => { setPrevia(null) }, [horarios, procedimientos, enSedes])

  const datosPara = (sedeId: string): RecursoInput => ({
    sede: sedeId,
    nombre,
    tipo,
    horarios,
    ...(esEquipo ? { procedimientos } : {}),
  })
  const destinos = creando && esEquipo ? enSedes : [recurso?.sede ?? sede.id]

  const guardar = useMutation({
    mutationFn: async (forzar: boolean) => {
      // Antes de guardar se mira qué pasa con lo agendado (en cada sede); si
      // algo queda sin lugar se avisa y se pide confirmar.
      if (!forzar) {
        const previas = await Promise.all(destinos.map((id) => clinicasApi.recursos.previsualizar({
          recurso: datosPara(id), ...(recurso ? { recurso_id: recurso.id } : {}),
        })))
        const total = previas.reduce((n, p) => n + p.total_sin_lugar, 0)
        if (total > 0) {
          setPrevia({
            citas_revisadas: previas.reduce((n, p) => n + p.citas_revisadas, 0),
            total_sin_lugar: total,
            sin_lugar: previas.flatMap((p) => p.sin_lugar),
          })
          return null
        }
      }
      if (recurso) return [await clinicasApi.recursos.update(recurso.id, datosPara(recurso.sede))]
      const creados = []
      for (const id of destinos) creados.push(await clinicasApi.recursos.create(datosPara(id)))
      return creados
    },
    onSuccess: (guardados) => {
      if (!guardados) return
      qc.invalidateQueries({ queryKey: ['recursos'] })
      qc.invalidateQueries({ queryKey: ['procedimiento'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      toast.success(
        recurso ? 'Guardado'
          : !esEquipo ? 'Agregado'
          : guardados.length > 1 ? `Equipo creado en ${guardados.length} sedes` : 'Equipo creado',
      )
      onClose()
    },
    // Si falló a mitad (varias sedes), las que sí se crearon se muestran.
    onError: () => qc.invalidateQueries({ queryKey: ['recursos'] }),
  })

  const titulo = recurso ? `Editar ${recurso.nombre}` : esEquipo ? 'Agregar equipo' : 'Agregar cabina o consultorio'

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

          {/* Equipo nuevo con varias sedes: se crea uno en cada sede marcada. */}
          {esEquipo && creando && sedes.length > 1 && (
            <div className="space-y-2">
              <Label>¿En qué sedes hay uno?</Label>
              <div className="space-y-1.5">
                {sedes.map((s) => {
                  const yaTiene = sedesConEse.has(s.id)
                  return (
                    <label
                      key={s.id}
                      className={cn('flex items-center gap-2 text-sm', yaTiene ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer')}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        disabled={yaTiene}
                        checked={!yaTiene && enSedes.includes(s.id)}
                        onChange={() => setEnSedes((a) => (a.includes(s.id) ? a.filter((x) => x !== s.id) : [...a, s.id]))}
                      />
                      {s.nombre}
                      {yaTiene && <span className="text-xs">· ya tiene uno con ese nombre</span>}
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {enSedes.length > 1
                  ? `Se crea uno en cada sede: son ${enSedes.length} aparatos y cada uno se agenda por su lado.`
                  : 'Si el mismo equipo está en otra sede, márcala también.'}
              </p>
            </div>
          )}

          {esEquipo && !creando && gemelos.length > 0 && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              También hay {nombre.trim()} en {Array.from(new Set(gemelos.map((g) => g.sede_nombre))).join(', ')}.
              Los cambios de aquí solo aplican a {sedes.find((s) => s.id === recurso?.sede)?.nombre ?? 'esta sede'}.
            </p>
          )}

          {esEquipo && (
            <div className="space-y-2">
              <Label>¿Qué procedimientos lo usan?</Label>
              {copiados && copiados.length > 0 && (
                <p className="text-xs text-primary">
                  Se marcaron los mismos que usa en {Array.from(new Set(gemelos.map((g) => g.sede_nombre))).join(', ')}.
                </p>
              )}
              <ProcedimientosDelEquipo
                value={procedimientos}
                onChange={(ids) => { setTocoProcedimientos(true); setProcedimientos(ids) }}
              />
            </div>
          )}

          {previa && <AvisoCitasAfectadas previa={previa} />}

          {guardar.isError && (
            <p className="text-sm text-destructive">{mensajeDeError(guardar.error, 'No se pudo guardar. Intenta de nuevo.')}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={guardar.isPending || !nombre.trim() || destinos.length === 0}>
              {guardar.isPending ? 'Guardando…' : previa ? 'Guardar igual' : recurso ? 'Guardar cambios'
                : esEquipo ? (destinos.length > 1 ? `Agregar en ${destinos.length} sedes` : 'Agregar equipo') : 'Agregar cabina o consultorio'}
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

export function NoDisponibleDialog({ recurso, onClose }: { recurso: Recurso | null; onClose: () => void }) {
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
        n ? `${n === 1 ? '1 cita quedó' : `${n} citas quedaron`} sin ${recurso!.tipo === 'equipo' ? 'equipo' : 'cabina/consultorio'}: ${n === 1 ? 'aparece' : 'aparecen'} en la agenda para moverla${n === 1 ? '' : 's'}.` : undefined,
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
            Mientras tanto no se agenda nada que lo necesite. Lo ya agendado se pasa a otra {recurso?.tipo === 'equipo' ? 'unidad' : 'cabina/consultorio'} si hay una libre.
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

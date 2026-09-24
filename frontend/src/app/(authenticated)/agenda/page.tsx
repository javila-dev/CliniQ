'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  ChevronLeft, ChevronRight, Plus, AlertTriangle, ChevronRight as ChevronRightIcon,
  CalendarOff, UserPlus, Copy, Check, QrCode, X, Columns3, List, SlidersHorizontal,
  Clock3, UsersRound, CircleCheck, CircleDashed, CalendarDays, Rows3, Search, ChevronDown, Compass,
} from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { useUserSedes } from '@/hooks/useUserSedes'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PacienteSearchInput } from '@/components/pacientes/PacienteSearchInput'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { AgendaTour } from '@/components/agenda/AgendaTour'
import { AvisoCitasSinConfirmar } from '@/components/shared/AvisoCitasSinConfirmar'
import { addDaysISO, cn, formatTime, todayISO } from '@/lib/utils'
import { ESTADO_CITA_CONFIG } from '@/lib/constants'
import type { Cita, EstadoCita, BloqueoAgenda } from '@/types/agenda'
import type { BusquedaPaciente } from '@/types/pacientes'
import type { ColaboradorProfesional } from '@/types/colaboradores'

const NuevaCitaModal = dynamic(
  () => import('@/components/agenda/NuevaCitaModal').then((module) => module.NuevaCitaModal),
  { ssr: false },
)
const CitaDetailSheet = dynamic(
  () => import('@/components/agenda/CitaDetailSheet').then((module) => module.CitaDetailSheet),
  { ssr: false },
)
const BloqueosPanel = dynamic(
  () => import('@/components/agenda/BloqueosPanel').then((module) => module.BloqueosPanel),
  { ssr: false },
)

// ─── constants ────────────────────────────────────────────────
const START_HOUR = 7
const END_HOUR = 21
const HOUR_PX = 72

const ESTADO_COLORS: Record<EstadoCita, { bg: string; border: string; text: string; dot: string }> = {
  pendiente:  { bg: 'bg-amber-50',    border: 'border-l-amber-400',   text: 'text-amber-800',   dot: 'bg-amber-400'   },
  confirmada: { bg: 'bg-blue-50',     border: 'border-l-blue-400',    text: 'text-blue-800',    dot: 'bg-blue-400'    },
  en_espera:  { bg: 'bg-violet-50',   border: 'border-l-violet-400',  text: 'text-violet-800',  dot: 'bg-violet-400'  },
  en_curso:   { bg: 'bg-primary/10',  border: 'border-l-primary',     text: 'text-primary',     dot: 'bg-primary'     },
  completada: { bg: 'bg-green-50',    border: 'border-l-green-500',   text: 'text-green-800',   dot: 'bg-green-500'   },
  cancelada:  { bg: 'bg-red-50',      border: 'border-l-red-300',     text: 'text-red-500',     dot: 'bg-red-300'     },
  no_asistio: { bg: 'bg-gray-100',    border: 'border-l-gray-300',    text: 'text-gray-400',    dot: 'bg-gray-300'    },
}

type ViewMode = 'dia' | 'semana' | 'mes'
type AgendaMode = 'calendario' | 'columnas' | 'lista'
type AgendaDensity = 'compacta' | 'comoda'

interface AgendaViewPreference {
  view: ViewMode
  mode: AgendaMode
  density: AgendaDensity
}

const DEFAULT_AGENDA_PREFERENCE: AgendaViewPreference = {
  view: 'dia',
  mode: 'lista',
  density: 'comoda',
}

interface CitaWithLayout extends Cita {
  colIndex: number
  totalCols: number
}

function ProfessionalMultiSelect({
  options, value, onChange, disabled,
}: {
  options: ColaboradorProfesional[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery
    ? options.filter((professional) => professional.nombre_completo.toLowerCase().includes(normalizedQuery))
    : options
  const selectedNames = options.filter((professional) => value.includes(professional.id))
  const label = value.length === 0
    ? 'Todos los profesionales'
    : value.length === 1
      ? selectedNames[0]?.nombre_completo ?? '1 profesional'
      : `${value.length} profesionales`

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((current) => current !== id) : [...value, id])
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-8 w-48 justify-between gap-2 px-3 text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 overflow-hidden p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar profesional..."
            className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {!normalizedQuery && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Check className={cn('h-3.5 w-3.5', value.length === 0 ? 'opacity-100' : 'opacity-0')} />
              <span className="font-medium">Todos los profesionales</span>
            </button>
          )}
          {filtered.map((professional) => (
            <button
              key={professional.id}
              type="button"
              onClick={() => toggle(professional.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', value.includes(professional.id) ? 'opacity-100 text-primary' : 'opacity-0')} />
              <span className="truncate">{professional.nombre_completo}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Sin resultados</p>}
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{value.length} seleccionado{value.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => onChange([])} className="font-medium text-primary hover:underline">Limpiar</button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ─── overlap layout (Google Calendar style) ───────────────────
function resolveOverlaps(citas: Cita[]): CitaWithLayout[] {
  if (citas.length === 0) return []

  const sorted = [...citas].sort(
    (a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()
  )

  const overlaps = (a: Cita, b: Cita) =>
    new Date(a.fecha_inicio) < new Date(b.fecha_fin) &&
    new Date(b.fecha_inicio) < new Date(a.fecha_fin)

  // Greedy column assignment
  const cols: Cita[][] = []
  const colIndexMap = new Map<string, number>()

  for (const cita of sorted) {
    let placed = false
    for (let i = 0; i < cols.length; i++) {
      if (!cols[i].some((c) => overlaps(c, cita))) {
        cols[i].push(cita)
        colIndexMap.set(cita.id, i)
        placed = true
        break
      }
    }
    if (!placed) {
      colIndexMap.set(cita.id, cols.length)
      cols.push([cita])
    }
  }

  // Connected components → totalCols per group
  const visited = new Set<string>()
  const totalColsMap = new Map<string, number>()

  for (const cita of sorted) {
    if (visited.has(cita.id)) continue
    const group: Cita[] = []
    const queue = [cita]
    while (queue.length > 0) {
      const curr = queue.shift()!
      if (visited.has(curr.id)) continue
      visited.add(curr.id)
      group.push(curr)
      for (const other of sorted) {
        if (!visited.has(other.id) && overlaps(curr, other)) queue.push(other)
      }
    }
    const maxCol = Math.max(...group.map((c) => colIndexMap.get(c.id)!)) + 1
    for (const c of group) totalColsMap.set(c.id, maxCol)
  }

  return sorted.map((c) => ({
    ...c,
    colIndex: colIndexMap.get(c.id)!,
    totalCols: totalColsMap.get(c.id)!,
  }))
}

// ─── helpers ──────────────────────────────────────────────────
function addDays(d: string, n: number) {
  return addDaysISO(d, n)
}

function addMonths(d: string, n: number) {
  const [year, month] = d.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + n, 1))
  return date.toISOString().split("T")[0]
}

function startOfWeek(d: string) {
  const date = new Date(d + 'T12:00:00')
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDaysISO(d, diff)
}

function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

function monthGrid(d: string) {
  const date = new Date(d + 'T12:00:00')
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1 // Monday-based
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function monthLabel(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}

function weekLabel(weekStart: string) {
  const days = weekDays(weekStart)
  const start = new Date(days[0] + 'T12:00:00')
  const end = new Date(days[6] + 'T12:00:00')
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} de ${start.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}`
  }
  return `${start.getDate()} ${start.toLocaleDateString('es-CO', { month: 'short' })} – ${end.getDate()} ${end.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })}`
}

function dayLabel(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

function shortDayLabel(d: string) {
  const date = new Date(d + 'T12:00:00')
  return { wd: date.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''), num: date.getDate() }
}

function topPx(iso: string, hourPx = HOUR_PX) {
  const d = new Date(iso)
  return ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * (hourPx / 60)
}

function heightPx(start: string, end: string, hourPx = HOUR_PX) {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  return Math.max(mins * (hourPx / 60), 24)
}

// ─── Cita block (time grid) ───────────────────────────────────
function CompactCitaCard({
  cita, onClick, selected, style, className,
}: {
  cita: Cita
  onClick: () => void
  selected: boolean
  style?: React.CSSProperties
  className?: string
}) {
  const color = ESTADO_COLORS[cita.estado]
  const estado = ESTADO_CITA_CONFIG[cita.estado]?.label ?? cita.estado
  const servicio = cita.servicio_nombre || cita.motivo || 'Consulta'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="cita-item"
            onClick={(event) => { event.stopPropagation(); onClick() }}
            style={style}
            aria-label={`${formatTime(cita.fecha_inicio)}, ${cita.paciente_nombre}, ${servicio}, ${estado}`}
            className={cn(
              'group flex items-center gap-1.5 overflow-hidden rounded-md border border-l-[3px] border-gray-200 bg-white px-1.5 py-1.5 text-left shadow-sm transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-md',
              color.border,
              selected && 'border-primary ring-2 ring-primary/15',
              className,
            )}
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', color.dot)} />
            <span className="w-[58px] shrink-0 text-[10px] font-semibold tabular-nums text-gray-900">{formatTime(cita.fecha_inicio)}</span>
            <span className="min-w-0 flex-1 truncate text-[10px] text-gray-900">
              <span className="font-semibold">{cita.paciente_nombre}</span>
              <span className="text-muted-foreground"> · {servicio}</span>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" avoidCollisions collisionPadding={12} className="max-w-[240px] space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold leading-tight">{cita.paciente_nombre}</p>
            <span className={cn('shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium', ESTADO_CITA_CONFIG[cita.estado]?.color)}>{estado}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatTime(cita.fecha_inicio)} – {formatTime(cita.fecha_fin)} · {servicio}</p>
          <p className="border-t border-border pt-1 text-xs"><span className="text-muted-foreground">Profesional:</span> {cita.profesional_nombre}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function CitaBlock({
  cita, onClick, selected, hourPx = HOUR_PX, density = 'comoda',
}: {
  cita: CitaWithLayout; onClick: () => void; selected: boolean
  hourPx?: number; density?: AgendaDensity
}) {
  const top = topPx(cita.fecha_inicio, hourPx)
  const height = heightPx(cita.fecha_inicio, cita.fecha_fin, hourPx)
  const GAP = 2
  const widthPct = 100 / cita.totalCols
  const leftPct = widthPct * cita.colIndex

  return (
    <CompactCitaCard
      cita={cita}
      onClick={onClick}
      selected={selected}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + ${GAP}px)`,
        width: `calc(${widthPct}% - ${GAP * 2}px)`,
      }}
      className={cn('absolute z-10', density === 'compacta' && 'py-1')}
    />
  )
}

// ─── Bloqueo block (calendar overlay) ────────────────────────
function BloqueoBlock({ bloqueo, fecha, hourPx = HOUR_PX }: { bloqueo: BloqueoAgenda; fecha: string; hourPx?: number }) {
  const dayStart = new Date(`${fecha}T${String(START_HOUR).padStart(2, '0')}:00:00`)
  const dayEnd   = new Date(`${fecha}T${String(END_HOUR).padStart(2, '0')}:00:00`)
  const bStart   = new Date(bloqueo.fecha_inicio)
  const bEnd     = new Date(bloqueo.fecha_fin)
  if (bEnd <= dayStart || bStart >= dayEnd) return null
  const visStart = bStart < dayStart ? dayStart : bStart
  const visEnd   = bEnd   > dayEnd   ? dayEnd   : bEnd
  const top    = topPx(visStart.toISOString(), hourPx)
  const height = Math.max(heightPx(visStart.toISOString(), visEnd.toISOString(), hourPx), 8)

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            style={{ top, height, left: 0, right: 0 }}
            className="absolute z-5 bg-gray-200/70 border-l-[3px] border-l-gray-400 pointer-events-auto"
          >
            <p className="text-[10px] text-gray-500 font-medium px-1.5 pt-0.5 truncate">
              {bloqueo.motivo || 'Bloqueado'}
            </p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" avoidCollisions collisionPadding={12} className="space-y-1 max-w-[200px]">
          <p className="font-semibold text-sm">Bloqueado</p>
          {bloqueo.motivo && <p className="text-muted-foreground text-xs">{bloqueo.motivo}</p>}
          {bloqueo.profesional_nombre && (
            <p className="text-xs"><span className="text-muted-foreground">Profesional:</span> {bloqueo.profesional_nombre}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(bloqueo.fecha_inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} –{' '}
            {new Date(bloqueo.fecha_fin).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Time column (hours) ──────────────────────────────────────
function HourLabels({ hourPx = HOUR_PX, sticky = false }: { hourPx?: number; sticky?: boolean }) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  return (
    <div
      className={cn('w-14 shrink-0 bg-white', sticky && 'sticky left-0 z-30 border-r border-gray-100')}
      style={{ height: (END_HOUR - START_HOUR) * hourPx }}
    >
      {hours.map((h) => (
        <div key={h} style={{ height: hourPx }} className="flex items-start justify-end pr-2 pt-1">
          <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
            {h.toString().padStart(2, '0')}:00
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Single day column ────────────────────────────────────────
function DayColumn({
  citas, fecha, selectedId, onSelectCita, onClickSlot, showNowLine, bloqueos,
  hourPx = HOUR_PX, density = 'comoda', className,
}: {
  citas: Cita[]; fecha: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void; showNowLine: boolean
  bloqueos?: BloqueoAgenda[]; hourPx?: number; density?: AgendaDensity; className?: string
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const totalH = (END_HOUR - START_HOUR) * hourPx

  const hoy = todayISO()
  const diaPasado = fecha < hoy
  const horaActual = new Date().getHours()
  const horaPasada = (h: number) => diaPasado || (fecha === hoy && h < horaActual)

  const nowTop = (() => {
    const now = new Date()
    return ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (hourPx / 60)
  })()

  return (
    <div className={cn('flex-1 relative border-l border-gray-100', className)} style={{ height: totalH, minWidth: 0 }}>
      {/* Día pasado: sin afordancia de creación */}
      {diaPasado && <div className="absolute inset-0 bg-gray-50/60 pointer-events-none" />}

      {/* Grid lines */}
      {hours.map((h) => (
        <div key={h} style={{ top: (h - START_HOUR) * hourPx }}
          className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none">
          <div style={{ top: hourPx / 2 }}
            className="absolute left-0 right-0 border-t border-dashed border-gray-50" />
        </div>
      ))}

      {/* Now indicator */}
      {showNowLine && nowTop >= 0 && nowTop <= totalH && (
        <div style={{ top: nowTop }}
          className="absolute left-0 right-0 z-20 flex items-center pointer-events-none">
          <div className="h-2 w-2 rounded-full bg-primary shrink-0 -ml-1" />
          <div className="flex-1 h-[1.5px] bg-primary" />
        </div>
      )}

      {/* Click zones */}
      {hours.map((h) => {
        const pasada = horaPasada(h)
        return (
          <div key={h}
            style={{ top: (h - START_HOUR) * hourPx, height: hourPx }}
            className={cn(
              'absolute left-0 right-0 transition-colors group',
              pasada ? 'cursor-default' : 'cursor-pointer hover:bg-primary/[0.03]'
            )}
            onClick={pasada ? undefined : () => {
              const d = new Date(fecha + 'T12:00:00')
              d.setHours(h, 0, 0, 0)
              onClickSlot(d.toISOString())
            }}
          >
            {!pasada && (
              <span className="absolute left-2 top-1 text-[9px] text-primary/0 group-hover:text-primary/40 transition-colors select-none">
                {h.toString().padStart(2, '0')}:00
              </span>
            )}
          </div>
        )
      })}

      {/* Bloqueos aprobados */}
      {bloqueos?.map((b) => (
        <BloqueoBlock key={b.id} bloqueo={b} fecha={fecha} hourPx={hourPx} />
      ))}

      {/* Appointments */}
      {resolveOverlaps(citas).map((cita) => (
        <CitaBlock key={cita.id} cita={cita} selected={selectedId === cita.id}
          onClick={() => onSelectCita(cita.id)} hourPx={hourPx} density={density} />
      ))}
    </div>
  )
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

// Si el paciente ya llegó (o no vendrá), la confirmación ya no aplica: no se muestra
// "Por confirmar" ni se cuenta como pendiente.
const ESTADOS_CON_LLEGADA = ['en_espera', 'en_curso', 'completada']
const ESTADOS_SIN_CONFIRMACION = [...ESTADOS_CON_LLEGADA, 'cancelada', 'no_asistio']
const cuentaComoConfirmada = (c: Cita) =>
  c.estado_confirmacion === 'confirmado' || ESTADOS_CON_LLEGADA.includes(c.estado)
const pideConfirmacion = (c: Cita) => !ESTADOS_SIN_CONFIRMACION.includes(c.estado)

function DayListCard({
  cita, selected, onClick, density,
}: {
  cita: Cita; selected: boolean; onClick: () => void; density: AgendaDensity
}) {
  const color = ESTADO_COLORS[cita.estado]
  const estado = ESTADO_CITA_CONFIG[cita.estado]?.label ?? cita.estado
  const confirmada = cita.estado_confirmacion === 'confirmado'
  const mostrarConfirmacion = pideConfirmacion(cita)

  return (
    <button
      type="button"
      data-testid="cita-item"
      onClick={onClick}
      className={cn(
        'group w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md',
        selected ? 'border-primary ring-2 ring-primary/15' : 'border-gray-200',
      )}
    >
      <div className="flex">
        <div className={cn('w-1 shrink-0', color.dot)} />
        <div className={cn('flex min-w-0 flex-1 items-center gap-3', density === 'compacta' ? 'px-3 py-2.5' : 'px-4 py-3.5')}>
          <div className="w-[88px] shrink-0">
            <p className="text-sm font-semibold tabular-nums text-gray-900">{formatTime(cita.fecha_inicio)}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">hasta {formatTime(cita.fecha_fin)}</p>
          </div>

          <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center text-xs font-semibold text-primary">
            {initials(cita.paciente_nombre)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">{cita.paciente_nombre}</p>
              <span className={cn('hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-flex', color.bg, color.text)}>
                {estado}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {cita.servicio_nombre || cita.motivo || 'Consulta'}
              <span className="mx-1.5 text-gray-300">·</span>
              {cita.profesional_nombre}
            </p>
          </div>

          <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
            {mostrarConfirmacion && (confirmada ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                <CircleCheck className="h-3.5 w-3.5" /> Paciente confirmó
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                <CircleDashed className="h-3.5 w-3.5" /> Por confirmar
              </span>
            ))}
            <ChevronRight className="h-4 w-4 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </div>
      </div>
    </button>
  )
}

function DayListView({
  citas, fecha, selectedId, onSelectCita, onClickSlot, density,
}: {
  citas: Cita[]; fecha: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void; density: AgendaDensity
}) {
  const sorted = [...citas].sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
  const now = new Date()
  const isToday = fecha === todayISO()
  const isFuture = fecha > todayISO()
  const active = isToday
    ? sorted.filter((c) => c.estado === 'en_curso' || (new Date(c.fecha_inicio) <= now && new Date(c.fecha_fin) > now))
    : []
  const activeIds = new Set(active.map((c) => c.id))
  const upcoming = sorted.filter((c) => !activeIds.has(c.id) && (isFuture || (isToday && new Date(c.fecha_inicio) > now)))
  const earlier = sorted.filter((c) => !activeIds.has(c.id) && !upcoming.some((upcomingCita) => upcomingCita.id === c.id))
  const confirmed = sorted.filter(cuentaComoConfirmada).length
  const porConfirmar = sorted.filter((c) => pideConfirmacion(c) && c.estado_confirmacion !== 'confirmado').length

  const sections: { title: string; eyebrow?: string; citas: Cita[] }[] = isFuture
    ? [{ title: 'Agenda del día', citas: sorted }]
    : isToday
      ? [
          { title: 'Ahora', eyebrow: 'En atención', citas: active },
          { title: 'Siguiente', eyebrow: 'Próxima cita', citas: upcoming.slice(0, 1) },
          { title: 'Más tarde', citas: upcoming.slice(1) },
          { title: 'Anteriores', citas: earlier },
        ]
      : [{ title: 'Historial del día', citas: sorted }]

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-slate-50/80 to-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Citas</span></div>
            <p className="mt-1 text-xl font-semibold text-gray-900">{sorted.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><CircleCheck className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Confirmadas</span></div>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{confirmed}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><UsersRound className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Pendientes</span></div>
            <p className="mt-1 text-xl font-semibold text-amber-700">{porConfirmar}</p>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/80 px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Clock3 className="h-6 w-6" /></div>
            <h3 className="font-semibold text-gray-900">El día está libre</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">No hay citas con los filtros seleccionados.</p>
            {fecha >= todayISO() && (
              <Button className="mt-5" size="sm" onClick={() => onClickSlot(`${fecha}T09:00:00`)}>
                <Plus className="mr-1.5 h-4 w-4" /> Agendar una cita
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {sections.filter((section) => section.citas.length > 0).map((section) => (
              <section key={section.title}>
                <div className="mb-2.5 flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-600">{section.title}</h3>
                  {section.eyebrow && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{section.eyebrow}</span>}
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-xs tabular-nums text-muted-foreground">{section.citas.length}</span>
                </div>
                <div className="space-y-2">
                  {section.citas.map((cita) => (
                    <DayListCard
                      key={cita.id}
                      cita={cita}
                      selected={selectedId === cita.id}
                      onClick={() => onSelectCita(cita.id)}
                      density={density}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PeriodListView({
  groups, selectedId, onSelectCita, density, emptyTitle, emptyDescription,
}: {
  groups: { date: string; citas: Cita[] }[]
  selectedId: string | null
  onSelectCita: (id: string) => void
  density: AgendaDensity
  emptyTitle: string
  emptyDescription: string
}) {
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      citas: [...group.citas].sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime()),
    }))
    .filter((group) => group.citas.length > 0)
  const allAppointments = visibleGroups.flatMap((group) => group.citas)
  const confirmed = allAppointments.filter(cuentaComoConfirmada).length

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-slate-50/80 to-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6">
        <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Citas</span></div>
            <p className="mt-1 text-xl font-semibold text-gray-900">{allAppointments.length}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><CircleCheck className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Confirmadas</span></div>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{confirmed}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
            <div className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" /><span className="text-[11px] font-medium uppercase tracking-wide">Días ocupados</span></div>
            <p className="mt-1 text-xl font-semibold text-primary">{visibleGroups.length}</p>
          </div>
        </div>

        {allAppointments.length === 0 ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/80 px-6 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-6 w-6" /></div>
            <h3 className="font-semibold text-gray-900">{emptyTitle}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {visibleGroups.map((group) => {
              const date = new Date(`${group.date}T12:00:00`)
              const isToday = group.date === todayISO()
              const label = date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
              return (
                <section key={group.date}>
                  <div className="sticky top-0 z-20 mb-2.5 flex items-center gap-2 bg-slate-50/95 py-1.5 backdrop-blur">
                    <h3 className={cn('text-xs font-semibold capitalize tracking-wide', isToday ? 'text-primary' : 'text-gray-700')}>{label}</h3>
                    {isToday && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Hoy</span>}
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs tabular-nums text-muted-foreground">{group.citas.length}</span>
                  </div>
                  <div className="space-y-2">
                    {group.citas.map((cita) => (
                      <DayListCard
                        key={cita.id}
                        cita={cita}
                        selected={selectedId === cita.id}
                        onClick={() => onSelectCita(cita.id)}
                        density={density}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── VIEW: Día ────────────────────────────────────────────────
function DayView({
  fecha, selectedId, onSelectCita, onClickSlot, filterSede, filterProfesional, filterPaciente,
  profesionales, mode, density,
}: {
  fecha: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void
  filterSede: string; filterProfesional: string[]; filterPaciente: string
  profesionales: ColaboradorProfesional[]; mode: AgendaMode; density: AgendaDensity
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isToday = fecha === todayISO()
  const hourPx = density === 'compacta' ? 56 : HOUR_PX

  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (hourPx / 60)
    scrollRef.current.scrollTop = Math.max(0, top - 100)
  }, [fecha, hourPx, mode])

  const { data, isLoading } = useQuery({
    queryKey: ['citas', 'dia', fecha, filterSede, filterProfesional.join(','), filterPaciente],
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date: fecha,
      page_size: 100,
      ...(filterSede && { sede: filterSede }),
      ...(filterProfesional.length > 0 && { profesional__in: filterProfesional.join(',') }),
      ...(filterPaciente && { paciente: filterPaciente }),
    }),
  })
  const citas = data?.results ?? []

  const { data: bloqueos } = useQuery({
    queryKey: ['bloqueos', 'dia', fecha, filterSede],
    queryFn: () => agendaApi.bloqueos.list({
      estado: 'aprobado',
      ...(filterSede && { sede: filterSede }),
    }),
    select: (list) => list.filter((b) => {
      const dayEnd = new Date(`${fecha}T${String(END_HOUR).padStart(2, '0')}:00:00`)
      const dayStart = new Date(`${fecha}T${String(START_HOUR).padStart(2, '0')}:00:00`)
      return new Date(b.fecha_fin) > dayStart && new Date(b.fecha_inicio) < dayEnd
    }),
  })

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center bg-white"><p className="text-sm text-muted-foreground">Cargando agenda...</p></div>
  }

  if (mode === 'lista') {
    return (
      <DayListView
        citas={citas}
        fecha={fecha}
        selectedId={selectedId}
        onSelectCita={onSelectCita}
        onClickSlot={onClickSlot}
        density={density}
      />
    )
  }

  if (mode === 'calendario') {
    return (
      <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
        <div className="flex" style={{ minHeight: (END_HOUR - START_HOUR) * hourPx }}>
          <HourLabels hourPx={hourPx} sticky />
          <DayColumn
            citas={citas}
            fecha={fecha}
            selectedId={selectedId}
            onSelectCita={onSelectCita}
            onClickSlot={onClickSlot}
            showNowLine={isToday}
            bloqueos={bloqueos}
            hourPx={hourPx}
            density={density}
          />
        </div>
      </div>
    )
  }

  const activeProfessionals = profesionales.filter((professional) => professional.activo !== false)
  const professionalsFromAppointments = Array.from(
    new Map(citas.map((cita) => [cita.profesional, {
      id: cita.profesional,
      colaborador_id: null,
      nombre_completo: cita.profesional_nombre,
      especialidades: [],
    }])).values()
  ) as ColaboradorProfesional[]
  // Nunca ocultar citas porque falte o esté desactualizado el perfil laboral
  // del profesional. La respuesta del endpoint aporta todos los usuarios con
  // "atiende pacientes" y las citas cubren cualquier inconsistencia histórica.
  const allProfessionals = Array.from(
    new Map([...professionalsFromAppointments, ...activeProfessionals].map((professional) => [professional.id, professional])).values()
  )
  const columns = filterProfesional.length > 0
    ? allProfessionals.filter((professional) => filterProfesional.includes(professional.id))
    : allProfessionals
  const totalHeight = (END_HOUR - START_HOUR) * hourPx
  const minGridWidth = 56 + Math.max(columns.length, 1) * 240

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
      <div style={{ minWidth: minGridWidth }}>
        <div className="sticky top-0 z-40 flex h-[58px] border-b border-gray-200 bg-white/95 shadow-[0_1px_0_rgba(15,23,42,0.04)] backdrop-blur">
          <div className="sticky left-0 z-50 w-14 shrink-0 bg-white/95" />
          {(columns.length > 0 ? columns : [{ id: '', colaborador_id: '', nombre_completo: 'Agenda del día' } as ColaboradorProfesional]).map((professional) => {
            const professionalAppointments = professional.id ? citas.filter((cita) => cita.profesional === professional.id) : citas
            return (
              <div key={professional.id || 'agenda'} className="flex min-w-[240px] flex-1 items-center gap-2.5 border-l border-gray-100 px-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-[11px] font-bold text-white shadow-sm">
                  {initials(professional.nombre_completo)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-gray-900">{professional.nombre_completo}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{professionalAppointments.length} cita{professionalAppointments.length === 1 ? '' : 's'} hoy</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex" style={{ minHeight: totalHeight }}>
          <HourLabels hourPx={hourPx} sticky />
          {(columns.length > 0 ? columns : [{ id: '', colaborador_id: '', nombre_completo: 'Agenda del día' } as ColaboradorProfesional]).map((professional) => (
            <DayColumn
              key={professional.id || 'agenda'}
              citas={professional.id ? citas.filter((cita) => cita.profesional === professional.id) : citas}
              fecha={fecha}
              selectedId={selectedId}
              onSelectCita={onSelectCita}
              onClickSlot={onClickSlot}
              showNowLine={isToday}
              bloqueos={bloqueos?.filter((bloqueo) => !bloqueo.profesional || bloqueo.profesional === professional.id || (!!professional.colaborador_id && bloqueo.profesional === professional.colaborador_id))}
              hourPx={hourPx}
              density={density}
              className="min-w-[240px]"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ProfessionalMatrixView({
  days, appointmentsByDay, profesionales, selectedId, onSelectCita, filterProfesional, density, periodLabel,
}: {
  days: string[]
  appointmentsByDay: Cita[][]
  profesionales: ColaboradorProfesional[]
  selectedId: string | null
  onSelectCita: (id: string) => void
  filterProfesional: string[]
  density: AgendaDensity
  periodLabel: string
}) {
  const [expandedCell, setExpandedCell] = useState<{
    day: string
    professional: ColaboradorProfesional
    citas: Cita[]
  } | null>(null)
  const appointments = appointmentsByDay.flat()
  const appointmentProfessionals = Array.from(
    new Map(appointments.map((cita) => [cita.profesional, {
      id: cita.profesional,
      colaborador_id: null,
      nombre_completo: cita.profesional_nombre,
      especialidades: [],
    }])).values()
  ) as ColaboradorProfesional[]
  const allProfessionals = Array.from(
    new Map([
      ...appointmentProfessionals,
      ...profesionales.filter((professional) => professional.activo !== false),
    ].map((professional) => [professional.id, professional])).values()
  )
  const columns = filterProfesional.length > 0
    ? allProfessionals.filter((professional) => filterProfesional.includes(professional.id))
    : allProfessionals

  if (columns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-slate-50/80 to-white px-6 text-center">
        <div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UsersRound className="h-6 w-6" /></div>
          <h3 className="font-semibold text-gray-900">No hay profesionales para mostrar</h3>
          <p className="mt-1 text-sm text-muted-foreground">Revisa los filtros o marca quiénes atienden pacientes.</p>
        </div>
      </div>
    )
  }

  const minWidth = 136 + columns.length * 200

  return (
    <>
      <div className="flex-1 overflow-auto bg-slate-50/60">
      <div
        className="grid border-l border-t bg-white"
        style={{ gridTemplateColumns: `136px repeat(${columns.length}, minmax(200px, 1fr))`, minWidth }}
      >
        <div className="sticky left-0 top-0 z-40 flex min-h-[68px] items-center border-b border-r bg-white/95 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          Día
        </div>
        {columns.map((professional) => {
          const total = appointments.filter((cita) => cita.profesional === professional.id).length
          return (
            <div key={professional.id} className="sticky top-0 z-30 flex min-h-[68px] items-center gap-2.5 border-b border-r bg-white/95 px-3 backdrop-blur">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-[11px] font-bold text-white shadow-sm">
                {initials(professional.nombre_completo)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{professional.nombre_completo}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{total} cita{total === 1 ? '' : 's'} {periodLabel}</p>
              </div>
            </div>
          )
        })}

        {days.map((day, dayIndex) => {
          const date = new Date(`${day}T12:00:00`)
          const isToday = day === todayISO()
          const dayAppointments = appointmentsByDay[dayIndex] ?? []
          return (
            <div key={day} className="contents">
              <div className={cn(
                'sticky left-0 z-20 flex flex-col justify-center border-b border-r px-3',
                density === 'compacta' ? 'min-h-[84px]' : 'min-h-[104px]',
                isToday ? 'bg-primary/[0.06]' : 'bg-white',
              )}>
                <span className={cn('text-xs font-semibold capitalize', isToday ? 'text-primary' : 'text-gray-700')}>
                  {date.toLocaleDateString('es-CO', { weekday: 'long' })}
                </span>
                <span className={cn('mt-1 text-2xl font-semibold tabular-nums', isToday ? 'text-primary' : 'text-gray-900')}>{date.getDate()}</span>
                <span className="mt-1 text-[10px] text-muted-foreground">{dayAppointments.length} cita{dayAppointments.length === 1 ? '' : 's'}</span>
              </div>

              {columns.map((professional) => {
                const cellAppointments = dayAppointments
                  .filter((cita) => cita.profesional === professional.id)
                  .sort((a, b) => new Date(a.fecha_inicio).getTime() - new Date(b.fecha_inicio).getTime())
                const visibleAppointments = cellAppointments.slice(0, 5)
                return (
                  <div
                    key={`${day}-${professional.id}`}
                    className={cn(
                      'border-b border-r bg-white align-top',
                      density === 'compacta' ? 'min-h-[84px] p-1.5' : 'min-h-[104px] p-2',
                      isToday && 'bg-primary/[0.015]',
                    )}
                  >
                    {cellAppointments.length > 0 && (
                      <div className="space-y-1">
                        {visibleAppointments.map((cita) => (
                          <CompactCitaCard
                            key={cita.id}
                            cita={cita}
                            onClick={() => onSelectCita(cita.id)}
                            selected={selectedId === cita.id}
                            className="w-full"
                          />
                        ))}
                        {cellAppointments.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setExpandedCell({ day, professional, citas: cellAppointments })}
                            className="w-full rounded-md px-2 py-1 text-center text-[10px] font-semibold text-primary transition-colors hover:bg-primary/[0.06]"
                          >
                            Ver {cellAppointments.length - 5} más
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
        </div>
      </div>

      <Dialog open={!!expandedCell} onOpenChange={(open) => { if (!open) setExpandedCell(null) }}>
        <DialogContent className="max-h-[80vh] max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4 pr-12">
            <DialogTitle className="text-base">Agenda de {expandedCell?.professional.nombre_completo}</DialogTitle>
            {expandedCell && (
              <p className="text-sm capitalize text-muted-foreground">
                {new Date(`${expandedCell.day}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="normal-case"> · {expandedCell.citas.length} citas</span>
              </p>
            )}
          </DialogHeader>
          <div className="min-h-0 space-y-1.5 overflow-y-auto p-4">
            {expandedCell?.citas.map((cita) => (
              <CompactCitaCard
                key={cita.id}
                cita={cita}
                selected={selectedId === cita.id}
                onClick={() => { setExpandedCell(null); onSelectCita(cita.id) }}
                className="w-full py-2"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── VIEW: Semana ─────────────────────────────────────────────
function WeekView({ weekStart, selectedId, onSelectCita, onClickSlot, filterSede, filterProfesional, filterPaciente, profesionales, mode, density }: {
  weekStart: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void
  filterSede: string; filterProfesional: string[]; filterPaciente: string
  profesionales: ColaboradorProfesional[]
  mode: AgendaMode; density: AgendaDensity
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const weekAnchor = startOfWeek(weekStart)
  const days = weekDays(weekAnchor)
  const today = todayISO()
  const hourPx = density === 'compacta' ? 56 : HOUR_PX

  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (hourPx / 60)
    scrollRef.current.scrollTop = Math.max(0, top - 100)
  }, [weekStart, hourPx, mode])

  const queries = useQueries({
    queries: days.map((d) => ({
      queryKey: ['citas', 'dia', d, filterSede, filterProfesional.join(','), filterPaciente],
      queryFn: () => agendaApi.citas.list({
        fecha_inicio__date: d,
        page_size: 100,
        ...(filterSede && { sede: filterSede }),
        ...(filterProfesional.length > 0 && { profesional__in: filterProfesional.join(',') }),
        ...(filterPaciente && { paciente: filterPaciente }),
      }),
    })),
  })

  const weekEnd = addDays(weekAnchor, 6)
  const { data: bloqueosWeek } = useQuery({
    queryKey: ['bloqueos', 'semana', weekAnchor, filterSede],
    queryFn: () => agendaApi.bloqueos.list({
      estado: 'aprobado',
      ...(filterSede && { sede: filterSede }),
    }),
    select: (list) => list.filter((b) => {
      const wStart = new Date(`${weekAnchor}T${String(START_HOUR).padStart(2, '0')}:00:00`)
      const wEnd   = new Date(`${weekEnd}T${String(END_HOUR).padStart(2, '0')}:00:00`)
      return new Date(b.fecha_fin) > wStart && new Date(b.fecha_inicio) < wEnd
    }),
  })

  const isLoading = queries.some((q) => q.isLoading)

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center bg-white"><p className="text-sm text-muted-foreground">Cargando semana...</p></div>
  }

  if (mode === 'lista') {
    return (
      <PeriodListView
        groups={days.map((date, index) => ({ date, citas: queries[index].data?.results ?? [] }))}
        selectedId={selectedId}
        onSelectCita={onSelectCita}
        density={density}
        emptyTitle="La semana está libre"
        emptyDescription="No hay citas con los filtros seleccionados durante esta semana."
      />
    )
  }

  if (mode === 'columnas') {
    return (
      <ProfessionalMatrixView
        days={days}
        appointmentsByDay={days.map((_, index) => queries[index].data?.results ?? [])}
        profesionales={profesionales}
        selectedId={selectedId}
        onSelectCita={onSelectCita}
        filterProfesional={filterProfesional}
        density={density}
        periodLabel="esta semana"
      />
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white">
      {/* Day headers */}
      <div className="flex border-b shrink-0">
        <div className="w-14 shrink-0" />
        {days.map((d, i) => {
          const { wd, num } = shortDayLabel(d)
          const isToday = d === today
          return (
            <div key={d} className="flex-1 flex flex-col items-center py-2 border-l border-gray-100 min-w-0">
              <span className={cn('text-[11px] capitalize', isToday ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                {wd}
              </span>
              <span className={cn(
                'flex items-center justify-center h-7 w-7 rounded-full text-sm font-semibold mt-0.5',
                isToday ? 'bg-primary text-white' : 'text-foreground'
              )}>
                {num}
              </span>
              {/* Cita count dot */}
              {(queries[i].data?.results.length ?? 0) > 0 && (
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {queries[i].data!.results.length}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="flex" style={{ minHeight: (END_HOUR - START_HOUR) * hourPx }}>
          <HourLabels hourPx={hourPx} />
          {days.map((d, i) => (
              <DayColumn
                key={d}
                citas={queries[i].data?.results ?? []}
                fecha={d}
                selectedId={selectedId}
                onSelectCita={onSelectCita}
                onClickSlot={onClickSlot}
                showNowLine={d === today}
                bloqueos={bloqueosWeek?.filter((b) => {
                  const dStart = new Date(`${d}T${String(START_HOUR).padStart(2, '0')}:00:00`)
                  const dEnd   = new Date(`${d}T${String(END_HOUR).padStart(2, '0')}:00:00`)
                  return new Date(b.fecha_fin) > dStart && new Date(b.fecha_inicio) < dEnd
                })}
                hourPx={hourPx}
                density={density}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

// ─── VIEW: Mes ────────────────────────────────────────────────
function MonthView({ monthDate, onSelectDay, onSelectCita, selectedId, filterSede, filterProfesional, filterPaciente, profesionales, mode, density }: {
  monthDate: string; onSelectDay: (d: string) => void
  onSelectCita: (id: string) => void; selectedId: string | null
  filterSede: string; filterProfesional: string[]; filterPaciente: string
  profesionales: ColaboradorProfesional[]
  mode: AgendaMode; density: AgendaDensity
}) {
  const today = todayISO()
  const date = new Date(monthDate + 'T12:00:00')
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data, isLoading } = useQuery({
    queryKey: ['citas', 'mes', monthStart, filterSede, filterProfesional.join(','), filterPaciente],
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date__gte: monthStart,
      fecha_inicio__date__lte: monthEnd,
      page_size: 300,
      ...(filterSede && { sede: filterSede }),
      ...(filterProfesional.length > 0 && { profesional__in: filterProfesional.join(',') }),
      ...(filterPaciente && { paciente: filterPaciente }),
    }),
  })

  // Group by date
  const byDay: Record<string, Cita[]> = {}
  data?.results.forEach((c) => {
    const d = c.fecha_inicio.split('T')[0]
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(c)
  })

  const cells = monthGrid(monthDate)
  const monthDays = Array.from({ length: lastDay }, (_, index) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
  )
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center bg-white"><p className="text-sm text-muted-foreground">Cargando mes...</p></div>
  }

  if (mode === 'lista') {
    return (
      <PeriodListView
        groups={monthDays.map((date) => ({ date, citas: byDay[date] ?? [] }))}
        selectedId={selectedId}
        onSelectCita={onSelectCita}
        density={density}
        emptyTitle="El mes está libre"
        emptyDescription="No hay citas con los filtros seleccionados durante este mes."
      />
    )
  }

  if (mode === 'columnas') {
    return (
      <ProfessionalMatrixView
        days={monthDays}
        appointmentsByDay={monthDays.map((day) => byDay[day] ?? [])}
        profesionales={profesionales}
        selectedId={selectedId}
        onSelectCita={onSelectCita}
        filterProfesional={filterProfesional}
        density={density}
        periodLabel="este mes"
      />
    )
  }

  return (
    <div className={cn('flex-1 overflow-auto bg-white', density === 'compacta' ? 'p-2.5' : 'p-4')}>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7 border-l border-t">
        {cells.map((d, i) => {
          const isToday = d === today
          const citas = d ? (byDay[d] ?? []) : []
          const isCurrentMonth = d ? new Date(d + 'T12:00:00').getMonth() === month : false

          return (
            <div
              key={i}
              onClick={() => d && onSelectDay(d)}
              className={cn(
                'border-r border-b',
                density === 'compacta' ? 'min-h-[72px] p-1' : 'min-h-[96px] p-1.5',
                d ? 'cursor-pointer hover:bg-muted/30 transition-colors' : 'bg-gray-50/50',
                !isCurrentMonth && d && 'bg-gray-50/50'
              )}
            >
              {d && (
                <>
                  <div className="flex items-center justify-center mb-1">
                    <span className={cn(
                      'h-6 w-6 flex items-center justify-center rounded-full text-xs font-medium',
                      isToday ? 'bg-primary text-white font-bold' : 'text-foreground'
                    )}>
                      {new Date(d + 'T12:00:00').getDate()}
                    </span>
                  </div>

                  {/* Appointment pills */}
                  <div className="space-y-0.5">
                    {citas.slice(0, density === 'compacta' ? 2 : 4).map((c) => {
                      const color = ESTADO_COLORS[c.estado]
                      return (
                        <div
                          key={c.id}
                          onClick={(e) => { e.stopPropagation(); onSelectCita(c.id) }}
                          className={cn(
                            'rounded px-1 py-0.5 text-[10px] font-medium truncate border-l-2',
                            color.bg, color.border.replace('border-l-', 'border-l-'), color.text,
                            selectedId === c.id && 'ring-1 ring-primary',
                          )}
                        >
                          {formatTime(c.fecha_inicio)} {c.paciente_nombre.split(' ')[0]}
                        </div>
                      )
                    })}
                    {citas.length > (density === 'compacta' ? 2 : 4) && (
                      <p className="text-[10px] text-muted-foreground pl-1">+{citas.length - (density === 'compacta' ? 2 : 4)} más</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────
function AgendaContent() {
  const searchParams = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const [view, setView] = useState<ViewMode>('dia')
  const [agendaPreference, setAgendaPreference] = useState<AgendaViewPreference>(DEFAULT_AGENDA_PREFERENCE)
  const [fecha, setFecha] = useState(todayISO)
  const [showNuevaCita, setShowNuevaCita] = useState(false)
  const [defaultSlot, setDefaultSlot] = useState<string | undefined>()
  const [selectedCitaId, setSelectedCitaId] = useState<string | null>(null)
  const [filterSede, setFilterSede] = useState(() => user?.sede_id ?? '')
  const [filterProfesional, setFilterProfesional] = useState<string[]>([])
  const [filterPaciente, setFilterPaciente] = useState<BusquedaPaciente | null>(null)
  const [sheetNoCerradas, setSheetNoCerradas] = useState(false)
  const [showBloqueos, setShowBloqueos] = useState(false)
  const canBloqueos = hasPermission(user, PERM.AGENDA_CREAR_BLOQUEO) || hasPermission(user, PERM.AGENDA_APROBAR_BLOQUEO)
  const canCrearCita = hasPermission(user, PERM.AGENDA_CREAR)

  const isAdmin = user?.rol === 'admin' || user?.rol === 'superadmin'
  const esSoloProfesional = !!user?.es_profesional && !isAdmin

  const [linkCopiado, setLinkCopiado] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [tourReplaySignal, setTourReplaySignal] = useState(0)

  const { sedes: sedesDisponibles, isAllSedes, defaultSedeId } = useUserSedes()

  useEffect(() => {
    if (!user?.id) return
    try {
      const stored = localStorage.getItem(`cliniq:agenda-view:${user.id}`)
      if (!stored) return
      const parsed = JSON.parse(stored) as Partial<AgendaViewPreference> & {
        dayMode?: 'clasica' | 'columnas' | 'lista'
        weekMode?: AgendaMode
        monthMode?: 'calendario' | 'lista'
      }
      const restoredView: ViewMode = parsed.view === 'semana' || parsed.view === 'mes' ? parsed.view : 'dia'
      const legacyMode = restoredView === 'dia'
        ? parsed.dayMode
        : restoredView === 'semana'
          ? parsed.weekMode
          : parsed.monthMode
      const restoredMode: AgendaMode = parsed.mode === 'columnas' || parsed.mode === 'calendario' || parsed.mode === 'lista'
        ? parsed.mode
        : legacyMode === 'columnas'
          ? 'columnas'
          : legacyMode === 'lista'
            ? 'lista'
            : 'calendario'
      const restored: AgendaViewPreference = {
        view: restoredView,
        mode: restoredMode,
        density: parsed.density === 'compacta' ? 'compacta' : 'comoda',
      }
      setAgendaPreference(restored)
      setView(restored.view)
    } catch {
      setAgendaPreference(DEFAULT_AGENDA_PREFERENCE)
    }
  }, [user?.id])

  const updateAgendaPreference = (next: Partial<AgendaViewPreference>) => {
    setAgendaPreference((current) => {
      const updated = { ...current, ...next }
      if (user?.id) {
        try {
          localStorage.setItem(`cliniq:agenda-view:${user.id}`, JSON.stringify(updated))
        } catch {
          // La preferencia sigue funcionando en la sesión aunque el navegador bloquee el almacenamiento.
        }
      }
      return updated
    })
  }

  const handleViewChange = (nextView: ViewMode) => {
    setView(nextView)
    updateAgendaPreference({ view: nextView })
  }

  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: !!user?.clinica_id,
    staleTime: 5 * 60 * 1000,
  })

  const registroUrl = miClinica?.registro_publico_token
    ? (typeof window !== 'undefined' ? `${window.location.origin}/registro/${miClinica.registro_publico_token}` : '')
    : null

  function copiarLink() {
    if (!registroUrl) return
    navigator.clipboard.writeText(registroUrl).then(() => {
      setLinkCopiado(true)
      setTimeout(() => setLinkCopiado(false), 2000)
    })
  }

  const ESTADOS_NO_CERRADOS: EstadoCita[] = ['pendiente', 'confirmada', 'en_espera', 'en_curso']

  const { data: noCerradasData } = useQuery({
    queryKey: ['citas', 'no-cerradas', filterSede, esSoloProfesional ? user?.id : null],
    queryFn: () => {
      const hoy = todayISO()
      const d90 = new Date(); d90.setDate(d90.getDate() - 90)
      const hace90 = `${d90.getFullYear()}-${String(d90.getMonth() + 1).padStart(2, '0')}-${String(d90.getDate()).padStart(2, '0')}`
      return agendaApi.citas.list({
        fecha_inicio__date__gte: hace90,
        fecha_inicio__date__lt: hoy,   // estrictamente antes de hoy (fecha local)
        page_size: 100,
        ...(filterSede && { sede: filterSede }),
        // Un profesional puro solo ve sus propias citas sin cerrar, no las de toda la clínica.
        ...(esSoloProfesional && user?.id ? { profesional: user.id } : {}),
      })
    },
    staleTime: 5 * 60 * 1000,
  })

  const citasNoCerradas = (noCerradasData?.results ?? []).filter((c) => {
    if (!ESTADOS_NO_CERRADOS.includes(c.estado as EstadoCita)) return false
    const fechaCita = c.fecha_inicio?.slice(0, 10)
    return fechaCita != null && fechaCita < todayISO()
  })

  // Un usuario acotado a sedes solo ve y filtra por las suyas; nunca "todas".
  const sedesVisibles = sedesDisponibles

  // Al resolverse el scope, si el usuario está acotado y aún no hay filtro,
  // fijarlo en su sede por defecto para no arrancar mostrando todas.
  useEffect(() => {
    if (!isAllSedes && !filterSede && defaultSedeId) {
      setFilterSede(defaultSedeId)
    }
  }, [isAllSedes, filterSede, defaultSedeId])

  const { data: profesionales } = useQuery({
    queryKey: ['profesionales', filterSede],
    queryFn: () => colaboradoresApi.profesionales(filterSede || undefined),
  })

  // Auto-filtrar por profesional solo si es un profesional puro (no admin)
  useEffect(() => {
    if (!esSoloProfesional || !profesionales) return
    const miPerfil = profesionales.find((p) => p.id === user?.id)
    if (miPerfil) setFilterProfesional([miPerfil.id])
  }, [esSoloProfesional, profesionales, user?.id])

  const handleSedeChange = (val: string) => {
    setFilterSede(val === 'all' ? '' : val)
    if (!esSoloProfesional) setFilterProfesional([])
  }

  useEffect(() => {
    const p = searchParams.get('cita')
    if (p) { setSelectedCitaId(p); setView('dia') }
  }, [searchParams])

  useEffect(() => {
    const f = searchParams.get('fecha')
    if (f) { setFecha(f); setView('dia') }
  }, [searchParams])

  // Navigation labels & prev/next logic per view
  const navLabel = view === 'dia' ? dayLabel(fecha)
    : view === 'semana' ? weekLabel(fecha)
    : monthLabel(fecha)

  const goBack = () => {
    if (view === 'dia') setFecha(f => addDays(f, -1))
    else if (view === 'semana') setFecha(f => addDays(f, -7))
    else setFecha(f => addMonths(f, -1))
  }

  const goForward = () => {
    if (view === 'dia') setFecha(f => addDays(f, 1))
    else if (view === 'semana') setFecha(f => addDays(f, 7))
    else setFecha(f => addMonths(f, 1))
  }

  const handleClickSlot = (iso: string) => {
    if (!canCrearCita) return
    const dia = iso.split('T')[0]
    if (dia < todayISO()) return
    setDefaultSlot(dia)
    setShowNuevaCita(true)
  }

  const handleSelectDay = (d: string) => {
    setFecha(d)
    handleViewChange('dia')
  }

  const activeMode = agendaPreference.mode
  const activeModeLabel = activeMode === 'lista'
    ? 'Lista'
    : activeMode === 'columnas'
      ? 'Columnas'
      : view === 'dia' ? 'Clásica' : 'Calendario'

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white" style={{ height: 'calc(100vh - 4.5rem)' }}>

      {/* ── Toolbar ── */}
      <div className="flex flex-col px-4 py-2.5 bg-white border-b shrink-0 gap-2">
        {/* Row 1: View switcher + Navigation */}
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div data-tour="period-switcher" className="flex items-center bg-muted rounded-lg p-0.5">
            {(['dia', 'semana', 'mes'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => handleViewChange(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                  view === v
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'text-muted-foreground hover:bg-white/70 hover:text-primary'
                )}
              >
                {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div data-tour="date-navigation" className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setFecha(todayISO())}
              className="text-sm font-medium px-2.5 py-1 rounded-md hover:bg-muted transition-colors whitespace-nowrap"
            >
              Hoy
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goForward}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground ml-1 capitalize hidden sm:block">
              {navLabel}
            </span>
          </div>

          <Popover>
              <PopoverTrigger asChild>
                <Button data-tour="view-mode" variant="outline" size="sm" className="ml-auto h-8 gap-1.5 rounded-lg border-gray-200 bg-white shadow-sm">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Vista:</span>
                  <span>{activeModeLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(26rem,calc(100vw-2rem))] rounded-xl p-3 shadow-xl">
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-900">Visualización de {view === 'dia' ? 'día' : view}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Esta preferencia es solo tuya y se recordará automáticamente.</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => updateAgendaPreference({ mode: 'calendario' })}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03]',
                      activeMode === 'calendario' ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20' : 'border-gray-200',
                    )}
                  >
                    <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', activeMode === 'calendario' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>
                      {view === 'dia' ? <Clock3 className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{view === 'dia' ? 'Clásica' : 'Calendario'}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {view === 'dia' ? 'Todas las citas en una cuadrícula horaria.' : view === 'semana' ? 'Compara los días y sus horarios.' : 'Explora el mes de un vistazo.'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateAgendaPreference({ mode: 'columnas' })}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03]',
                      activeMode === 'columnas' ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20' : 'border-gray-200',
                    )}
                  >
                    <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', activeMode === 'columnas' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>
                      <Columns3 className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-semibold text-gray-900">{view === 'dia' ? 'Columnas' : 'Por profesional'}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {view === 'dia' ? 'Compara profesionales y espacios libres.' : `Cruza los días con cada profesional en el ${view}.`}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateAgendaPreference({ mode: 'lista' })}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/[0.03]',
                      activeMode === 'lista' ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/20' : 'border-gray-200',
                    )}
                  >
                    <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg', activeMode === 'lista' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600')}>
                      {view === 'dia' ? <List className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
                    </div>
                    <p className="text-xs font-semibold text-gray-900">Lista {view === 'dia' ? 'del día' : view === 'semana' ? 'semanal' : 'del mes'}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">Revisa las citas agrupadas por día y en orden cronológico.</p>
                  </button>
                </div>

                <div className="mt-3 border-t border-gray-100 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-700">Densidad</p>
                    <span className="text-[10px] text-muted-foreground">Espacio entre citas</span>
                  </div>
                  <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-0.5">
                    {(['compacta', 'comoda'] as AgendaDensity[]).map((density) => (
                      <button
                        key={density}
                        type="button"
                        onClick={() => updateAgendaPreference({ density })}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all',
                          agendaPreference.density === density ? 'bg-white text-gray-900 shadow-sm' : 'text-muted-foreground hover:text-gray-900',
                        )}
                      >
                        {density === 'comoda' ? 'Cómoda' : 'Compacta'}
                      </button>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

          <AvisoCitasSinConfirmar compact className="hidden md:flex" />
        </div>

        {/* Row 2: Filters (left) + Actions (right) */}
        <div className="flex items-center gap-2">
          {/* Filters */}
          <div data-tour="agenda-filters" className="flex items-center gap-2 flex-wrap flex-1">
            <div className="w-72">
              <PacienteSearchInput
                selected={filterPaciente}
                onSelect={setFilterPaciente}
                onClear={() => setFilterPaciente(null)}
                placeholder="Buscar paciente..."
              />
            </div>

            <Select
              value={filterSede || 'all'}
              onValueChange={handleSedeChange}
              disabled={!isAllSedes && sedesVisibles.length <= 1}
            >
              <SelectTrigger className="h-8 text-xs w-36">
                <SelectValue placeholder="Todas las sedes" />
              </SelectTrigger>
              <SelectContent>
                {isAllSedes && <SelectItem value="all">Todas las sedes</SelectItem>}
                {sedesVisibles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!esSoloProfesional && (
              <ProfessionalMultiSelect
                options={profesionales ?? []}
                value={filterProfesional}
                onChange={setFilterProfesional}
              />
            )}
          </div>

          {/* Actions */}
          <div data-tour="agenda-actions" className="flex items-center gap-2 ml-auto shrink-0">
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label="Iniciar visita guiada de la agenda"
                    onClick={() => setTourReplaySignal((signal) => signal + 1)}
                  >
                    <Compass className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Visita guiada</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <HelpButton slug="agendar-una-cita" />
            {registroUrl && (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <TooltipProvider delayDuration={250}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Autoregistro de pacientes">
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Autoregistro</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <PopoverContent align="end" className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Link de autoregistro</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Comparte este link con el paciente para que se registre por su cuenta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 rounded-md border bg-gray-50 px-2.5 py-1.5">
                      <p className="text-[11px] text-muted-foreground truncate font-mono">{registroUrl}</p>
                    </div>
                    <button
                      type="button"
                      onClick={copiarLink}
                      className="shrink-0 flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      {linkCopiado
                        ? <><Check className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-600">Copiado</span></>
                        : <><Copy className="h-3.5 w-3.5" />Copiar</>}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPopoverOpen(false); setShowQr(true) }}
                      className="shrink-0 flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 transition-colors"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {canBloqueos && (
              <TooltipProvider delayDuration={250}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      aria-label="Gestionar bloqueos de agenda"
                      onClick={() => setShowBloqueos(true)}
                    >
                      <CalendarOff className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Bloqueos</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {canCrearCita && (
              <Button size="sm" onClick={() => setShowNuevaCita(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nueva cita
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerta citas no cerradas ── */}
      {citasNoCerradas.length > 0 && (
        <>
          <button
            onClick={() => setSheetNoCerradas(true)}
            className="flex items-center gap-3 px-4 py-2.5 bg-orange-50 border-b border-orange-200 text-sm text-orange-800 hover:bg-orange-100 transition-colors w-full text-left shrink-0"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1 font-medium">
              {citasNoCerradas.length} cita{citasNoCerradas.length !== 1 ? 's' : ''} sin cerrar de días anteriores
            </span>
            <ChevronRightIcon className="h-4 w-4 shrink-0" />
          </button>

          <Sheet open={sheetNoCerradas} onOpenChange={setSheetNoCerradas}>
            <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                  Citas sin cerrar
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {citasNoCerradas.length} cita{citasNoCerradas.length !== 1 ? 's' : ''} de días anteriores con estado pendiente de resolución
                </p>
              </SheetHeader>

              <div className="space-y-2">
                {citasNoCerradas
                  .sort((a, b) => new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime())
                  .map((cita) => {
                    const cfg = ESTADO_COLORS[cita.estado as EstadoCita]
                    const fecha = new Date(cita.fecha_inicio).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
                    return (
                      <button
                        key={cita.id}
                        onClick={() => {
                          setSelectedCitaId(cita.id)
                          setFecha(cita.fecha_inicio.split('T')[0])
                          handleViewChange('dia')
                          setSheetNoCerradas(false)
                        }}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-lg border text-left hover:opacity-90 transition-opacity',
                          cfg.bg, 'border-gray-100'
                        )}
                      >
                        <div className={cn('w-1 self-stretch rounded-full shrink-0', cfg.dot.replace('bg-', 'bg-'))} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cita.paciente_nombre}</p>
                          <p className="text-xs text-muted-foreground truncate"><span className="uppercase">{cita.servicio_nombre}</span> · {cita.profesional_nombre}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] capitalize text-muted-foreground">{fecha} · {formatTime(cita.fecha_inicio)}</span>
                            <span className={cn('text-[11px] font-medium', cfg.text)}>
                              {cita.estado.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <ChevronRightIcon className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </button>
                    )
                  })}
              </div>
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* ── Week strip (only in day view) ── */}
      {view === 'dia' && (
        <div className="flex shrink-0 bg-white border-b">
          <div className="w-14 shrink-0" />
          {weekDays(startOfWeek(fecha)).map((d) => {
            const { wd, num } = shortDayLabel(d)
            const isSelected = d === fecha
            const isToday = d === todayISO()
            return (
              <button
                key={d}
                onClick={() => setFecha(d)}
                className={cn(
                  'flex-1 flex flex-col items-center py-1.5 gap-0.5 text-xs hover:bg-muted/40 transition-colors',
                  isSelected && 'bg-primary/5'
                )}
              >
                <span className={cn('capitalize text-[11px]', isToday ? 'text-primary font-semibold' : 'text-muted-foreground')}>
                  {wd}
                </span>
                <span className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full font-semibold text-sm',
                  isSelected && isToday && 'bg-primary text-white',
                  isSelected && !isToday && 'bg-foreground text-white',
                  !isSelected && isToday && 'text-primary',
                  !isSelected && !isToday && 'text-foreground',
                )}>
                  {num}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Content ── */}
      <div data-tour="agenda-canvas" className="flex min-h-0 flex-1 overflow-hidden">
        {view === 'dia' && (
          <DayView
            fecha={fecha}
            selectedId={selectedCitaId}
            onSelectCita={setSelectedCitaId}
            onClickSlot={handleClickSlot}
            filterSede={filterSede}
            filterProfesional={filterProfesional}
            filterPaciente={filterPaciente?.id ?? ''}
            profesionales={profesionales ?? []}
            mode={agendaPreference.mode}
            density={agendaPreference.density}
          />
        )}
        {view === 'semana' && (
          <WeekView
            weekStart={fecha}
            selectedId={selectedCitaId}
            onSelectCita={setSelectedCitaId}
            onClickSlot={handleClickSlot}
            filterSede={filterSede}
            filterProfesional={filterProfesional}
            filterPaciente={filterPaciente?.id ?? ''}
            profesionales={profesionales ?? []}
            mode={agendaPreference.mode}
            density={agendaPreference.density}
          />
        )}
        {view === 'mes' && (
          <MonthView
            monthDate={fecha}
            onSelectDay={handleSelectDay}
            onSelectCita={setSelectedCitaId}
            selectedId={selectedCitaId}
            filterSede={filterSede}
            filterProfesional={filterProfesional}
            filterPaciente={filterPaciente?.id ?? ''}
            profesionales={profesionales ?? []}
            mode={agendaPreference.mode}
            density={agendaPreference.density}
          />
        )}
      </div>

      {/* Modals */}
      <BloqueosPanel
        open={showBloqueos}
        onOpenChange={setShowBloqueos}
        defaultSedeId={filterSede || undefined}
      />
      <NuevaCitaModal
        open={showNuevaCita}
        onOpenChange={(o) => { setShowNuevaCita(o); if (!o) setDefaultSlot(undefined) }}
        defaultFecha={defaultSlot ?? (fecha < todayISO() ? todayISO() : fecha)}
      />
      <CitaDetailSheet
        citaId={selectedCitaId}
        onClose={() => setSelectedCitaId(null)}
      />

      {showQr && registroUrl && <QrOverlay url={registroUrl} onClose={() => setShowQr(false)} />}
      <AgendaTour userId={user?.id} replaySignal={tourReplaySignal} />
    </div>
  )
}

function QrOverlay({ url, onClose }: { url: string; onClose: () => void }) {
  const { QRCodeCanvas } = require('qrcode.react') as typeof import('qrcode.react')

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center justify-center h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
      >
        <X className="h-5 w-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="rounded-2xl bg-white p-6 shadow-2xl">
        <QRCodeCanvas value={url} size={260} />
      </div>
    </div>
  )
}

export default function AgendaPage() {
  return (
    <Suspense>
      <AgendaContent />
    </Suspense>
  )
}

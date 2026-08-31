'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, ChevronRight as ChevronRightIcon, CalendarOff, UserPlus, Copy, Check, QrCode, X } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { useUserSedes } from '@/hooks/useUserSedes'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NuevaCitaModal } from '@/components/agenda/NuevaCitaModal'
import { CitaDetailSheet } from '@/components/agenda/CitaDetailSheet'
import { BloqueosPanel } from '@/components/agenda/BloqueosPanel'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PacienteSearchInput } from '@/components/pacientes/PacienteSearchInput'
import { addDaysISO, cn, formatTime, todayISO } from '@/lib/utils'
import { ESTADO_CITA_CONFIG } from '@/lib/constants'
import type { Cita, EstadoCita, BloqueoAgenda } from '@/types/agenda'
import type { BusquedaPaciente } from '@/types/pacientes'

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

interface CitaWithLayout extends Cita {
  colIndex: number
  totalCols: number
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

function topPx(iso: string) {
  const d = new Date(iso)
  return ((d.getHours() - START_HOUR) * 60 + d.getMinutes()) * (HOUR_PX / 60)
}

function heightPx(start: string, end: string) {
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000
  return Math.max(mins * (HOUR_PX / 60), 24)
}

// ─── Cita block (time grid) ───────────────────────────────────
function citaTipo(cita: Cita): string {
  if (cita.item_cotizacion_id) return 'Cotización'
  if (cita.servicio) return 'Servicio'
  return 'Consulta'
}

function CitaBlock({ cita, onClick, selected }: { cita: CitaWithLayout; onClick: () => void; selected: boolean }) {
  const c = ESTADO_COLORS[cita.estado]
  const top = topPx(cita.fecha_inicio)
  const height = heightPx(cita.fecha_inicio, cita.fecha_fin)
  const tiny = height < 40
  const GAP = 2
  const widthPct = 100 / cita.totalCols
  const leftPct = widthPct * cita.colIndex

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => { e.stopPropagation(); onClick() }}
            style={{
              top,
              height,
              left: `calc(${leftPct}% + ${GAP}px)`,
              width: `calc(${widthPct}% - ${GAP * 2}px)`,
            }}
            className={cn(
              'absolute rounded-md border-l-[3px] px-2 py-1 text-left overflow-hidden transition-all hover:brightness-95 hover:shadow-sm z-10',
              c.bg, c.border,
              selected && 'ring-2 ring-primary ring-offset-1'
            )}
          >
            <p className={cn('text-xs font-semibold truncate leading-tight', c.text)}>
              {cita.paciente_nombre}
            </p>
            {!tiny && (
              <p className={cn('text-[10px] truncate opacity-70 mt-0.5', c.text)}>
                {formatTime(cita.fecha_inicio)} · {cita.servicio_nombre}
              </p>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" avoidCollisions collisionPadding={12} className="space-y-1 max-w-[220px]">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-sm leading-tight">{cita.paciente_nombre}</p>
            <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0', ESTADO_CITA_CONFIG[cita.estado]?.color)}>
              {ESTADO_CITA_CONFIG[cita.estado]?.label ?? cita.estado}
            </span>
          </div>
          <p className="text-muted-foreground">{formatTime(cita.fecha_inicio)} – {formatTime(cita.fecha_fin)}</p>
          <div className="border-t border-border pt-1 mt-1 space-y-0.5">
            <p><span className="text-muted-foreground">Tipo:</span> {citaTipo(cita)}</p>
            <p><span className="text-muted-foreground">Sede:</span> {cita.sede_nombre}</p>
            <p><span className="text-muted-foreground">Profesional:</span> {cita.profesional_nombre}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─── Bloqueo block (calendar overlay) ────────────────────────
function BloqueoBlock({ bloqueo, fecha }: { bloqueo: BloqueoAgenda; fecha: string }) {
  const dayStart = new Date(`${fecha}T${String(START_HOUR).padStart(2, '0')}:00:00`)
  const dayEnd   = new Date(`${fecha}T${String(END_HOUR).padStart(2, '0')}:00:00`)
  const bStart   = new Date(bloqueo.fecha_inicio)
  const bEnd     = new Date(bloqueo.fecha_fin)
  if (bEnd <= dayStart || bStart >= dayEnd) return null
  const visStart = bStart < dayStart ? dayStart : bStart
  const visEnd   = bEnd   > dayEnd   ? dayEnd   : bEnd
  const top    = topPx(visStart.toISOString())
  const height = Math.max(heightPx(visStart.toISOString(), visEnd.toISOString()), 8)

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
function HourLabels() {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  return (
    <div className="w-14 shrink-0" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
      {hours.map((h) => (
        <div key={h} style={{ height: HOUR_PX }} className="flex items-start justify-end pr-2 pt-1">
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
}: {
  citas: Cita[]; fecha: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void; showNowLine: boolean
  bloqueos?: BloqueoAgenda[]
}) {
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
  const totalH = (END_HOUR - START_HOUR) * HOUR_PX

  const hoy = todayISO()
  const diaPasado = fecha < hoy
  const horaActual = new Date().getHours()
  const horaPasada = (h: number) => diaPasado || (fecha === hoy && h < horaActual)

  const nowTop = (() => {
    const now = new Date()
    return ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60)
  })()

  return (
    <div className="flex-1 relative border-l border-gray-100" style={{ height: totalH, minWidth: 0 }}>
      {/* Día pasado: sin afordancia de creación */}
      {diaPasado && <div className="absolute inset-0 bg-gray-50/60 pointer-events-none" />}

      {/* Grid lines */}
      {hours.map((h) => (
        <div key={h} style={{ top: (h - START_HOUR) * HOUR_PX }}
          className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none">
          <div style={{ top: HOUR_PX / 2 }}
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
            style={{ top: (h - START_HOUR) * HOUR_PX, height: HOUR_PX }}
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
        <BloqueoBlock key={b.id} bloqueo={b} fecha={fecha} />
      ))}

      {/* Appointments */}
      {resolveOverlaps(citas).map((cita) => (
        <CitaBlock key={cita.id} cita={cita} selected={selectedId === cita.id}
          onClick={() => onSelectCita(cita.id)} />
      ))}
    </div>
  )
}

// ─── VIEW: Día ────────────────────────────────────────────────
function DayView({ fecha, selectedId, onSelectCita, onClickSlot, filterSede, filterProfesional, filterPaciente }: {
  fecha: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void
  filterSede: string; filterProfesional: string; filterPaciente: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isToday = fecha === todayISO()

  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60)
    scrollRef.current.scrollTop = Math.max(0, top - 100)
  }, [fecha])

  const { data, isLoading } = useQuery({
    queryKey: ['citas', 'dia', fecha, filterSede, filterProfesional, filterPaciente],
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date: fecha,
      page_size: 100,
      ...(filterSede && { sede: filterSede }),
      ...(filterProfesional && { profesional: filterProfesional }),
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

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-white">
      <div className="flex" style={{ minHeight: (END_HOUR - START_HOUR) * HOUR_PX }}>
        <HourLabels />
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Cargando...</p>
          </div>
        ) : (
          <DayColumn
            citas={citas} fecha={fecha} selectedId={selectedId}
            onSelectCita={onSelectCita} onClickSlot={onClickSlot}
            showNowLine={isToday} bloqueos={bloqueos}
          />
        )}
      </div>
    </div>
  )
}

// ─── VIEW: Semana ─────────────────────────────────────────────
function WeekView({ weekStart, selectedId, onSelectCita, onClickSlot, filterSede, filterProfesional, filterPaciente }: {
  weekStart: string; selectedId: string | null
  onSelectCita: (id: string) => void; onClickSlot: (iso: string) => void
  filterSede: string; filterProfesional: string; filterPaciente: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = weekDays(weekStart)
  const today = todayISO()

  useEffect(() => {
    if (!scrollRef.current) return
    const now = new Date()
    const top = ((now.getHours() - START_HOUR) * 60 + now.getMinutes()) * (HOUR_PX / 60)
    scrollRef.current.scrollTop = Math.max(0, top - 100)
  }, [weekStart])

  const queries = useQueries({
    queries: days.map((d) => ({
      queryKey: ['citas', 'dia', d, filterSede, filterProfesional, filterPaciente],
      queryFn: () => agendaApi.citas.list({
        fecha_inicio__date: d,
        page_size: 100,
        ...(filterSede && { sede: filterSede }),
        ...(filterProfesional && { profesional: filterProfesional }),
        ...(filterPaciente && { paciente: filterPaciente }),
      }),
    })),
  })

  const weekEnd = addDays(weekStart, 6)
  const { data: bloqueosWeek } = useQuery({
    queryKey: ['bloqueos', 'semana', weekStart, filterSede],
    queryFn: () => agendaApi.bloqueos.list({
      estado: 'aprobado',
      ...(filterSede && { sede: filterSede }),
    }),
    select: (list) => list.filter((b) => {
      const wStart = new Date(`${weekStart}T${String(START_HOUR).padStart(2, '0')}:00:00`)
      const wEnd   = new Date(`${weekEnd}T${String(END_HOUR).padStart(2, '0')}:00:00`)
      return new Date(b.fecha_fin) > wStart && new Date(b.fecha_inicio) < wEnd
    }),
  })

  const isLoading = queries.some((q) => q.isLoading)

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
              {!isLoading && (queries[i].data?.results.length ?? 0) > 0 && (
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
        <div className="flex" style={{ minHeight: (END_HOUR - START_HOUR) * HOUR_PX }}>
          <HourLabels />
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Cargando semana...</p>
            </div>
          ) : (
            days.map((d, i) => (
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─── VIEW: Mes ────────────────────────────────────────────────
function MonthView({ monthDate, onSelectDay, filterSede, filterProfesional, filterPaciente }: {
  monthDate: string; onSelectDay: (d: string) => void
  filterSede: string; filterProfesional: string; filterPaciente: string
}) {
  const today = todayISO()
  const date = new Date(monthDate + 'T12:00:00')
  const year = date.getFullYear()
  const month = date.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data } = useQuery({
    queryKey: ['citas', 'mes', monthStart, filterSede, filterProfesional, filterPaciente],
    queryFn: () => agendaApi.citas.list({
      fecha_inicio__date__gte: monthStart,
      fecha_inicio__date__lte: monthEnd,
      page_size: 300,
      ...(filterSede && { sede: filterSede }),
      ...(filterProfesional && { profesional: filterProfesional }),
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
  const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  return (
    <div className="flex-1 overflow-auto bg-white p-4">
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
                'border-r border-b min-h-[88px] p-1.5',
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
                    {citas.slice(0, 3).map((c) => {
                      const color = ESTADO_COLORS[c.estado]
                      return (
                        <div
                          key={c.id}
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            'rounded px-1 py-0.5 text-[10px] font-medium truncate border-l-2',
                            color.bg, color.border.replace('border-l-', 'border-l-'), color.text
                          )}
                        >
                          {formatTime(c.fecha_inicio)} {c.paciente_nombre.split(' ')[0]}
                        </div>
                      )
                    })}
                    {citas.length > 3 && (
                      <p className="text-[10px] text-muted-foreground pl-1">+{citas.length - 3} más</p>
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
  const [view, setView] = useState<ViewMode>('semana')
  const [fecha, setFecha] = useState(todayISO)
  const [showNuevaCita, setShowNuevaCita] = useState(false)
  const [defaultSlot, setDefaultSlot] = useState<string | undefined>()
  const [selectedCitaId, setSelectedCitaId] = useState<string | null>(null)
  const [filterSede, setFilterSede] = useState(() => user?.sede_id ?? '')
  const [filterProfesional, setFilterProfesional] = useState('')
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

  const { sedes: sedesDisponibles, isAllSedes, defaultSedeId } = useUserSedes()

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
    if (miPerfil) setFilterProfesional(miPerfil.id)
  }, [esSoloProfesional, profesionales, user?.id])

  const handleSedeChange = (val: string) => {
    setFilterSede(val === 'all' ? '' : val)
    if (!esSoloProfesional) setFilterProfesional('')
  }

  useEffect(() => {
    const p = searchParams.get('cita')
    if (p) { setSelectedCitaId(p); setView('dia') }
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
    setView('dia')
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-white" style={{ height: 'calc(100vh - 4.5rem)' }}>

      {/* ── Toolbar ── */}
      <div className="flex flex-col px-4 py-2.5 bg-white border-b shrink-0 gap-2">
        {/* Row 1: View switcher + Navigation */}
        <div className="flex items-center gap-2">
          {/* View switcher */}
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {(['dia', 'semana', 'mes'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
                  view === v
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
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
        </div>

        {/* Row 2: Filters (left) + Actions (right) */}
        <div className="flex items-center gap-2">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
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
              <Select
                value={filterProfesional || 'all'}
                onValueChange={(v) => setFilterProfesional(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-xs w-40">
                  <SelectValue placeholder="Todos los profesionales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los profesionales</SelectItem>
                  {profesionales?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {registroUrl && (
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <UserPlus className="h-4 w-4" />
                    <span className="hidden sm:inline">Autoregistro</span>
                  </Button>
                </PopoverTrigger>
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
              <Button size="sm" variant="outline" onClick={() => setShowBloqueos(true)}>
                <CalendarOff className="h-4 w-4 mr-1.5" />
                Bloqueos
              </Button>
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
                          setView('dia')
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
                          <p className="text-xs text-muted-foreground truncate">{cita.servicio_nombre} · {cita.profesional_nombre}</p>
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
      {view === 'dia' && (
        <DayView
          fecha={fecha}
          selectedId={selectedCitaId}
          onSelectCita={setSelectedCitaId}
          onClickSlot={handleClickSlot}
          filterSede={filterSede}
          filterProfesional={filterProfesional}
          filterPaciente={filterPaciente?.id ?? ''}
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
        />
      )}
      {view === 'mes' && (
        <MonthView
          monthDate={fecha}
          onSelectDay={handleSelectDay}
          filterSede={filterSede}
          filterProfesional={filterProfesional}
          filterPaciente={filterPaciente?.id ?? ''}
        />
      )}

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

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Search, Eye,
  CalendarPlus, CalendarCheck, CalendarX,
  FileText, PenLine, CheckCircle2, ClipboardSignature,
  CreditCard, DollarSign, Activity,
} from 'lucide-react'
import { coreApi } from '@/lib/api/core'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { LogAccion } from '@/types/core'

const PAGE_SIZE = 50

// ─── Semantic mapping ────────────────────────────────────────────────────────

type AccionMeta = {
  label: (log: LogAccion) => string
  icon: React.ElementType
  color: string // Tailwind classes for icon bg + text
}

const ACCION_MAP: Record<string, AccionMeta> = {
  'cita.crear': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Agendó una cita para ${paciente}` : 'Agendó una cita'
    },
    icon: CalendarPlus,
    color: 'bg-blue-100 text-blue-600',
  },
  'cita.completar': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Marcó como completada la cita de ${paciente}` : 'Marcó una cita como completada'
    },
    icon: CalendarCheck,
    color: 'bg-emerald-100 text-emerald-600',
  },
  'cita.cancelar': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      const motivo = log.detalle?.motivo as string | undefined
      const base = paciente ? `Canceló la cita de ${paciente}` : 'Canceló una cita'
      return motivo ? `${base} — ${motivo}` : base
    },
    icon: CalendarX,
    color: 'bg-red-100 text-red-600',
  },
  'historia.ver': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Consultó la historia clínica de ${paciente}` : 'Consultó una historia clínica'
    },
    icon: FileText,
    color: 'bg-violet-100 text-violet-600',
  },
  'nota.completar': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Completó una nota clínica para ${paciente}` : 'Completó una nota clínica'
    },
    icon: PenLine,
    color: 'bg-indigo-100 text-indigo-600',
  },
  'consentimiento.firmar': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Envió consentimiento a firma — ${paciente}` : 'Envió consentimiento a firma'
    },
    icon: ClipboardSignature,
    color: 'bg-amber-100 text-amber-600',
  },
  'cuota.modificar_plazo': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      return paciente ? `Modificó el plazo de una cuota de ${paciente}` : 'Modificó el plazo de una cuota'
    },
    icon: CreditCard,
    color: 'bg-orange-100 text-orange-600',
  },
  'cuota.cobrar': {
    label: (log) => {
      const paciente = log.detalle?.paciente_nombre as string | undefined
      const valor = log.detalle?.valor as string | number | undefined
      const base = paciente ? `Registró un pago de ${paciente}` : 'Registró un pago'
      return valor ? `${base} — $${valor}` : base
    },
    icon: DollarSign,
    color: 'bg-emerald-100 text-emerald-600',
  },
}

function getAccionMeta(accion: string): AccionMeta {
  if (ACCION_MAP[accion]) return ACCION_MAP[accion]
  // Fallback genérico por prefijo
  if (accion.startsWith('cita.'))          return { ...ACCION_MAP['cita.crear'],    label: () => accion }
  if (accion.startsWith('historia.'))      return { ...ACCION_MAP['historia.ver'],  label: () => accion }
  if (accion.startsWith('nota.'))          return { ...ACCION_MAP['nota.completar'],label: () => accion }
  if (accion.startsWith('consentimiento.'))return { ...ACCION_MAP['consentimiento.firmar'], label: () => accion }
  if (accion.startsWith('cuota.'))         return { ...ACCION_MAP['cuota.cobrar'],  label: () => accion }
  return { label: () => accion, icon: Activity, color: 'bg-gray-100 text-gray-500' }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function formatDateTimeRelative(iso: string): { primary: string; secondary: string } {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)

  let primary: string
  if (diffMin < 1) primary = 'Ahora mismo'
  else if (diffMin < 60) primary = `Hace ${diffMin} min`
  else if (diffH < 24) primary = `Hace ${diffH} h`
  else if (diffD === 1) primary = 'Ayer'
  else if (diffD < 7) primary = `Hace ${diffD} días`
  else primary = d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

  const secondary = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  return { primary, secondary }
}

// ─── Detail dialog ────────────────────────────────────────────────────────────

function DetalleDialog({ log, onClose }: { log: LogAccion; onClose: () => void }) {
  const meta = getAccionMeta(log.accion)
  const Icon = meta.icon
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn('h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0', meta.color)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {meta.label(log)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="text-muted-foreground block">Usuario</span>
              <p className="font-medium">{log.usuario_nombre}</p>
            </div>
            <div>
              <span className="text-muted-foreground block">Fecha y hora</span>
              <p className="font-medium">{formatDateTime(log.created_at)}</p>
            </div>
            <div>
              <span className="text-muted-foreground block">Tipo de objeto</span>
              <p className="font-medium">{log.objeto_tipo}</p>
            </div>
            <div>
              <span className="text-muted-foreground block">ID</span>
              <p className="font-mono text-[11px] text-muted-foreground">{log.objeto_id}</p>
            </div>
            {log.ip && (
              <div>
                <span className="text-muted-foreground block">IP</span>
                <p className="font-medium font-mono">{log.ip}</p>
              </div>
            )}
          </div>
          {Object.keys(log.detalle ?? {}).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Información adicional</p>
              <pre className="rounded-md bg-muted/50 border p-3 text-xs font-mono overflow-auto max-h-56 whitespace-pre-wrap break-all">
                {JSON.stringify(log.detalle, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function PaginacionBar({
  page, total, pageSize, onPage,
}: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to   = Math.min(page * pageSize, total)
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t text-sm">
      <span className="text-muted-foreground text-xs">
        {total === 0 ? 'Sin resultados' : `${from}–${to} de ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-xs px-2">{page} / {totalPages}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LogAccionesPage() {
  const { user } = useAuthStore()
  const canVer = hasPermission(user, PERM.CORE_VER_LOG_ACCIONES)

  const [page, setPage]               = useState(1)
  const [filterUsuario, setFilterUsuario] = useState('')
  const [filterDesde, setFilterDesde]     = useState('')
  const [filterHasta, setFilterHasta]     = useState('')
  const [detalle, setDetalle]         = useState<LogAccion | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['log-acciones', page, filterUsuario, filterDesde, filterHasta],
    queryFn: () => coreApi.logAcciones.list({
      page,
      page_size: PAGE_SIZE,
      ...(filterUsuario.trim() && { usuario: filterUsuario.trim() }),
      ...(filterDesde          && { fecha_desde: filterDesde }),
      ...(filterHasta          && { fecha_hasta: filterHasta }),
    }),
    enabled: canVer,
  })

  const logs  = data?.results ?? []
  const total = data?.count   ?? 0

  function resetPage() { setPage(1) }
  const hasFilters = !!(filterUsuario || filterDesde || filterHasta)

  if (!canVer) {
    return (
      <div className="space-y-6">
        <PageHeader title="Actividad" description="Historial de acciones del sistema." />
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
          No tienes permiso para ver el log de acciones.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividad"
        description="Registro de todas las acciones realizadas en el sistema."
      />

      {/* Filtros */}
      <div className="rounded-xl border bg-white p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Usuario</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Nombre del usuario"
                value={filterUsuario}
                onChange={(e) => { setFilterUsuario(e.target.value); resetPage() }}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desde</Label>
            <Input type="date" className="h-8 text-xs" value={filterDesde} onChange={(e) => { setFilterDesde(e.target.value); resetPage() }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" className="h-8 text-xs" value={filterHasta} onChange={(e) => { setFilterHasta(e.target.value); resetPage() }} />
          </div>
        </div>
        {hasFilters && (
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground"
              onClick={() => { setFilterUsuario(''); setFilterDesde(''); setFilterHasta(''); resetPage() }}>
              Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="rounded-xl border bg-white overflow-hidden">
        {isLoading && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Cargando actividad…</div>
        )}
        {!isLoading && logs.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No hay registros con los filtros actuales.
          </div>
        )}
        {!isLoading && logs.length > 0 && (
          <ul className="divide-y">
            {logs.map((log) => {
              const meta = getAccionMeta(log.accion)
              const Icon = meta.icon
              const { primary, secondary } = formatDateTimeRelative(log.created_at)
              return (
                <li
                  key={log.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
                >
                  {/* Icon */}
                  <span className={cn('mt-0.5 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0', meta.color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug">
                      {meta.label(log)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">{log.usuario_nombre}</span>
                      {' · '}
                      <span title={formatDateTime(log.created_at)}>{primary}</span>
                      {' '}
                      <span className="opacity-60">{secondary}</span>
                    </p>
                  </div>

                  {/* Detail button */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Ver detalle"
                    onClick={() => setDetalle(log)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <PaginacionBar page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
      </div>

      {detalle && <DetalleDialog log={detalle} onClose={() => setDetalle(null)} />}
    </div>
  )
}

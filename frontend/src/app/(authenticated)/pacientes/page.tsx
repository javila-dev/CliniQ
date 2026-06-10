'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, ChevronLeft, ChevronRight,
  Phone, Mail, MessageCircle, PhoneCall, MessageSquare,
  ChevronRight as ArrowRight, Users, UserCheck, UserX, Loader2,
} from 'lucide-react'
import Link from 'next/link'
import { pacientesApi } from '@/lib/api/pacientes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import type { Paciente } from '@/types/pacientes'

// ─── helpers ──────────────────────────────────────────────────

const AVATAR_COLORS = [
  'bg-rose-100 text-rose-700',
  'bg-purple-100 text-purple-700',
  'bg-blue-100 text-blue-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-700',
  'bg-indigo-100 text-indigo-700',
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

const CANAL_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle,  className: 'bg-green-50 text-green-700 ring-green-200/60' },
  sms:      { label: 'SMS',      icon: MessageSquare,  className: 'bg-blue-50 text-blue-700 ring-blue-200/60'   },
  llamada:  { label: 'Llamada',  icon: PhoneCall,      className: 'bg-violet-50 text-violet-700 ring-violet-200/60' },
}

const DOC_LABEL: Record<string, string> = {
  CC: 'CC', CE: 'CE', PA: 'Pasaporte', TI: 'TI', NIT: 'NIT',
}

// ─── Pagination ───────────────────────────────────────────────

function Pagination({
  page, total, pageSize, onPage,
}: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (totalPages <= 1) return null

  // Build visible page numbers: always show first, last, current ±2
  const pages: (number | '…')[] = []
  const addPage = (p: number) => {
    if (p >= 1 && p <= totalPages && !pages.includes(p)) pages.push(p)
  }
  addPage(1)
  for (let p = page - 2; p <= page + 2; p++) addPage(p)
  addPage(totalPages)
  // Insert ellipsis
  const withGaps: (number | '…')[] = []
  let prev = 0
  for (const p of pages as number[]) {
    if (prev && p - prev > 1) withGaps.push('…')
    withGaps.push(p)
    prev = p
  }

  return (
    <div className="flex items-center justify-between px-1 mt-5">
      <p className="text-sm text-muted-foreground">
        {total === 0 ? 'Sin resultados' : (
          <>Mostrando <span className="font-medium text-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}</span> de <span className="font-medium text-foreground">{total}</span></>
        )}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {withGaps.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground text-sm select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={cn(
                'flex items-center justify-center h-8 min-w-[2rem] px-1 rounded-lg text-sm font-medium transition-colors',
                p === page
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Patient row ──────────────────────────────────────────────

function PatientRow({ paciente, onClick, isLoading }: { paciente: Paciente; onClick: () => void; isLoading?: boolean }) {
  const canal = CANAL_CONFIG[paciente.canal_confirmacion]
  const CanalIcon = canal?.icon ?? MessageCircle

  return (
    <div
      onClick={isLoading ? undefined : onClick}
      className={cn(
        'group flex items-center gap-4 px-5 py-3.5 hover:bg-rose-50/40 cursor-pointer transition-colors border-b border-gray-100 last:border-0',
        isLoading && 'opacity-60 pointer-events-none'
      )}
    >
      {/* Avatar */}
      <div className={cn(
        'flex items-center justify-center h-9 w-9 rounded-full text-sm font-semibold shrink-0 select-none',
        avatarColor(paciente.nombre_completo)
      )}>
        {initials(paciente.nombre_completo)}
      </div>

      {/* Name + doc */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {paciente.nombre_completo}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {DOC_LABEL[paciente.tipo_documento] ?? paciente.tipo_documento} · {paciente.numero_documento}
        </p>
      </div>

      {/* Phone */}
      <div className="hidden sm:flex items-center gap-1.5 w-36 shrink-0">
        <Phone className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-sm text-muted-foreground truncate">{paciente.telefono}</span>
      </div>

      {/* Email */}
      <div className="hidden lg:flex items-center gap-1.5 w-48 shrink-0">
        <Mail className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
        <span className="text-sm text-muted-foreground truncate">{paciente.email ?? '—'}</span>
      </div>

      {/* Canal */}
      <div className="hidden md:block shrink-0">
        {canal ? (
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1',
            canal.className
          )}>
            <CanalIcon className="h-3 w-3" />
            {canal.label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Estado */}
      <div className="shrink-0">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ring-1',
          paciente.activo
            ? 'bg-green-50 text-green-700 ring-green-200/60'
            : 'bg-gray-100 text-gray-500 ring-gray-200/60'
        )}>
          <span className={cn('h-1.5 w-1.5 rounded-full', paciente.activo ? 'bg-green-500' : 'bg-gray-400')} />
          {paciente.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Arrow / loading */}
      {isLoading
        ? <Loader2 className="h-4 w-4 text-primary/50 animate-spin shrink-0" />
        : <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary/50 shrink-0 transition-colors" />
      }
    </div>
  )
}

// ─── Skeleton row ─────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 border-b border-gray-100 last:border-0 animate-pulse">
      <div className="h-9 w-9 rounded-full bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-40 rounded bg-gray-100" />
        <div className="h-3 w-28 rounded bg-gray-100" />
      </div>
      <div className="hidden sm:block h-3 w-28 rounded bg-gray-100" />
      <div className="hidden lg:block h-3 w-36 rounded bg-gray-100" />
      <div className="hidden md:block h-6 w-20 rounded bg-gray-100" />
      <div className="h-6 w-16 rounded bg-gray-100" />
      <div className="h-4 w-4 rounded bg-gray-100" />
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted mb-4">
        <Users className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-semibold text-foreground">
        {search ? 'Sin resultados' : 'Aún no hay pacientes'}
      </p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">
        {search
          ? `No se encontraron pacientes para "${search}"`
          : 'Crea el primer paciente usando el botón de arriba'}
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50]

export default function PacientesPage() {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [filtroActivo, setFiltroActivo] = useState<string>('todos')
  const debouncedSearch = useDebounce(search, 400)

  const params = {
    search: debouncedSearch || undefined,
    activo: filtroActivo === 'todos' ? undefined : filtroActivo === 'activos',
    page,
    page_size: pageSize,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pacientes', params],
    queryFn: () => pacientesApi.list(params),
  })

  const handleSearch = (v: string) => { setSearch(v); setPage(1) }
  const handleFiltro = (v: string) => { setFiltroActivo(v); setPage(1) }

  // Stats
  const total = data?.count ?? 0

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando...' : `${total} paciente${total !== 1 ? 's' : ''} registrados`}
          </p>
        </div>
        <Button asChild>
          <Link href="/pacientes/nuevo">
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo paciente
          </Link>
        </Button>
      </div>

      {/* ── Quick stats ── */}
      {!isLoading && data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,     label: 'Total',    value: total,            color: 'text-foreground',   bg: 'bg-gray-50'   },
            { icon: UserCheck, label: 'Activos',   value: '—',              color: 'text-green-600',    bg: 'bg-green-50'  },
            { icon: UserX,     label: 'Inactivos', value: '—',              color: 'text-gray-500',     bg: 'bg-gray-50'   },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className={cn('rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3', bg)}>
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-white shadow-sm shrink-0">
                <Icon className={cn('h-4 w-4', color)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn('text-base font-bold', color)}>{label === 'Total' ? total : '—'}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Nombre, documento, teléfono..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroActivo} onValueChange={handleFiltro}>
          <SelectTrigger className="w-32 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activos">Activos</SelectItem>
            <SelectItem value="inactivos">Inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1) }}>
          <SelectTrigger className="w-24 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / pág</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Table card ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Column headers */}
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-gray-100">
          <div className="w-9 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Paciente</span>
          </div>
          <div className="hidden sm:block w-36 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Teléfono</span>
          </div>
          <div className="hidden lg:block w-48 shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Correo</span>
          </div>
          <div className="hidden md:block w-[88px] shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Canal</span>
          </div>
          <div className="w-[76px] shrink-0">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estado</span>
          </div>
          <div className="w-4 shrink-0" />
        </div>

        {/* Rows */}
        {isLoading ? (
          Array.from({ length: pageSize > 10 ? 8 : 5 }).map((_, i) => <SkeletonRow key={i} />)
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6">
            <p className="text-sm font-semibold text-foreground">Error al cargar pacientes</p>
            <p className="text-sm text-muted-foreground mt-1">Verifica tu conexión e intenta de nuevo</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        ) : data?.results.length === 0 ? (
          <EmptyState search={debouncedSearch} />
        ) : (
          data?.results.map((p) => (
            <PatientRow
              key={p.id}
              paciente={p}
              isLoading={loadingId === p.id}
              onClick={() => { setLoadingId(p.id); router.push(`/pacientes/${p.id}`) }}
            />
          ))
        )}
      </div>

      {/* ── Pagination ── */}
      <Pagination
        page={page}
        total={total}
        pageSize={pageSize}
        onPage={setPage}
      />

    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MapPin, Phone, Clock, MoreHorizontal, Building2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { clinicasApi } from '@/lib/api/clinicas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Sede, DiaSemana, HorarioSede } from '@/types/clinicas'

// ─── constantes ──────────────────────────────────────────────

const DIAS: { key: DiaSemana; label: string; short: string }[] = [
  { key: 'lunes',     label: 'Lunes',     short: 'L' },
  { key: 'martes',    label: 'Martes',    short: 'M' },
  { key: 'miercoles', label: 'Miércoles', short: 'X' },
  { key: 'jueves',    label: 'Jueves',    short: 'J' },
  { key: 'viernes',   label: 'Viernes',   short: 'V' },
  { key: 'sabado',    label: 'Sábado',    short: 'S' },
  { key: 'domingo',   label: 'Domingo',   short: 'D' },
]

const HORARIO_DEFAULT: HorarioSede = {
  lunes:     ['08:00', '18:00'],
  martes:    ['08:00', '18:00'],
  miercoles: ['08:00', '18:00'],
  jueves:    ['08:00', '18:00'],
  viernes:   ['08:00', '18:00'],
  sabado:    ['08:00', '13:00'],
}

// ─── Schema ───────────────────────────────────────────────────

const sedeSchema = z.object({
  nombre:    z.string().min(2, 'Mínimo 2 caracteres'),
  ciudad:    z.string().min(2, 'Requerido'),
  direccion: z.string().min(5, 'Dirección muy corta'),
  telefono:  z.string().optional(),
})

type SedeFormValues = z.infer<typeof sedeSchema>

// ─── Editor de horario ───────────────────────────────────────

function HorarioEditor({
  value,
  onChange,
}: {
  value: HorarioSede
  onChange: (h: HorarioSede) => void
}) {
  const toggle = (dia: DiaSemana) => {
    const next = { ...value }
    if (next[dia]) {
      delete next[dia]
    } else {
      next[dia] = ['08:00', '18:00']
    }
    onChange(next)
  }

  const setHora = (dia: DiaSemana, idx: 0 | 1, hora: string) => {
    const current = value[dia] ?? ['08:00', '18:00']
    const next = [...current] as [string, string]
    next[idx] = hora
    onChange({ ...value, [dia]: next })
  }

  return (
    <div className="space-y-2">
      {DIAS.map(({ key, label }) => {
        const activo = !!value[key]
        const horas = value[key] ?? ['08:00', '18:00']
        return (
          <div key={key} className={cn(
            'flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors',
            activo ? 'border-border bg-white' : 'border-dashed border-gray-200 bg-gray-50/50'
          )}>
            <button
              type="button"
              onClick={() => toggle(key)}
              className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                activo ? 'border-rose-500 bg-rose-500' : 'border-gray-300 bg-white'
              )}
            >
              {activo && <span className="text-white text-[10px] font-bold">✓</span>}
            </button>
            <span className={cn('text-sm w-20 shrink-0', !activo && 'text-muted-foreground')}>{label}</span>
            {activo ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={horas[0]}
                  onChange={e => setHora(key, 0, e.target.value)}
                  className="text-sm border rounded px-2 py-1 w-28"
                />
                <span className="text-muted-foreground text-xs">a</span>
                <input
                  type="time"
                  value={horas[1]}
                  onChange={e => setHora(key, 1, e.target.value)}
                  className="text-sm border rounded px-2 py-1 w-28"
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Cerrado</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Resumen de horario (read-only) ─────────────────────────

function HorarioResumen({ horario }: { horario: HorarioSede }) {
  const diasActivos = DIAS.filter(d => horario[d.key])
  if (!diasActivos.length) return <span className="text-xs text-muted-foreground">Sin horario</span>

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {DIAS.map(({ key, short }) => (
        <span
          key={key}
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold',
            horario[key] ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-300'
          )}
        >
          {short}
        </span>
      ))}
      {diasActivos.length > 0 && (
        <span className="text-xs text-muted-foreground ml-1">
          {horario[diasActivos[0].key]?.[0]}–{horario[diasActivos[0].key]?.[1]}
        </span>
      )}
    </div>
  )
}

// ─── Sheet sede ──────────────────────────────────────────────

function SedeSheet({
  sede,
  open,
  onClose,
}: {
  sede: Sede | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!sede
  const [horario, setHorario] = useState<HorarioSede>(sede?.horario ?? HORARIO_DEFAULT)

  useEffect(() => {
    setHorario(sede?.horario ?? HORARIO_DEFAULT)
  }, [sede])

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SedeFormValues>({
    resolver: zodResolver(sedeSchema),
    values: sede ? {
      nombre:    sede.nombre,
      ciudad:    sede.ciudad,
      direccion: sede.direccion,
      telefono:  sede.telefono ?? '',
    } : undefined,
  })

  const mutation = useMutation({
    mutationFn: (data: SedeFormValues) =>
      isEdit
        ? clinicasApi.sedes.update(sede!.id, { ...data, horario })
        : clinicasApi.sedes.create({ ...data, horario }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sedes'] })
      reset()
      setHorario(HORARIO_DEFAULT)
      onClose()
    },
  })

  const handleClose = () => { reset(); setHorario(HORARIO_DEFAULT); onClose() }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar sede' : 'Nueva sede'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="mt-6 space-y-5">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Sede Norte" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ciudad *</Label>
              <Input placeholder="Bogotá" {...register('ciudad')} className={cn(errors.ciudad && 'border-red-400')} />
              {errors.ciudad && <p className="text-xs text-red-500">{errors.ciudad.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="6011234567" {...register('telefono')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dirección *</Label>
            <Input placeholder="Cra 15 #93-47" {...register('direccion')} className={cn(errors.direccion && 'border-red-400')} />
            {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Horario de atención
            </Label>
            <HorarioEditor value={horario} onChange={setHorario} />
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-500">Error al guardar la sede. Intenta de nuevo.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear sede'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Card de sede ─────────────────────────────────────────────

function SedeCard({
  sede,
  onEdit,
  onToggle,
}: {
  sede: Sede
  onEdit: (s: Sede) => void
  onToggle: (s: Sede) => void
}) {
  return (
    <div className={cn(
      'bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-4 transition-opacity',
      !sede.activo && 'opacity-60'
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-10 w-10 rounded-lg flex items-center justify-center shrink-0',
            sede.activo ? 'bg-rose-50' : 'bg-gray-100'
          )}>
            <Building2 className={cn('h-5 w-5', sede.activo ? 'text-rose-500' : 'text-gray-400')} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{sede.nombre}</p>
              {!sede.activo && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">Inactiva</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{sede.ciudad}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(sede)}>Editar sede</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggle(sede)}
              className={sede.activo ? 'text-red-600 focus:text-red-600' : 'text-green-600 focus:text-green-600'}
            >
              {sede.activo ? 'Desactivar' : 'Activar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{sede.direccion}</span>
        </div>
        {sede.telefono && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{sede.telefono}</span>
          </div>
        )}
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <HorarioResumen horario={sede.horario ?? {}} />
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────

export default function SedesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editando, setEditando] = useState<Sede | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list(),
  })

  const toggleMutation = useMutation({
    mutationFn: (s: Sede) => clinicasApi.sedes.update(s.id, { activo: !s.activo }),
    onMutate: async (s: Sede) => {
      await qc.cancelQueries({ queryKey: ['sedes'] })
      const prev = qc.getQueryData(['sedes'])
      qc.setQueryData(['sedes'], (old: any) => old ? {
        ...old,
        results: old.results.map((r: Sede) => r.id === s.id ? { ...r, activa: !s.activo } : r),
      } : old)
      return { prev }
    },
    onError: (_err, _s, ctx) => {
      qc.setQueryData(['sedes'], ctx?.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sedes'] })
    },
  })

  const sedes = (data?.results ?? []).filter(s =>
    !search || s.nombre.toLowerCase().includes(search.toLowerCase()) || s.ciudad.toLowerCase().includes(search.toLowerCase())
  )

  const handleEdit = (s: Sede) => { setEditando(s); setSheetOpen(true) }
  const handleClose = () => { setSheetOpen(false); setEditando(null) }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/configuracion" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" />Volver
          </Link>
          <h1 className="text-xl font-bold">Sedes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${data?.count ?? 0} sede${(data?.count ?? 0) !== 1 ? 's' : ''} registradas`}
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setSheetOpen(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva sede
        </Button>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar sede o ciudad…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 bg-white"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border shadow-sm p-5 animate-pulse space-y-3">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-lg bg-gray-100" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 w-32 rounded bg-gray-100" />
                  <div className="h-3 w-20 rounded bg-gray-100" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-gray-100" />
                <div className="h-3 w-3/4 rounded bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      ) : sedes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-semibold">Sin sedes</p>
          <p className="text-sm text-muted-foreground mt-1">Crea la primera sede de la clínica</p>
          <Button className="mt-4" onClick={() => setSheetOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva sede
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sedes.map(s => (
            <SedeCard
              key={s.id}
              sede={s}
              onEdit={handleEdit}
              onToggle={s => toggleMutation.mutate(s)}
            />
          ))}
        </div>
      )}

      <SedeSheet sede={editando} open={sheetOpen} onClose={handleClose} />
    </div>
  )
}

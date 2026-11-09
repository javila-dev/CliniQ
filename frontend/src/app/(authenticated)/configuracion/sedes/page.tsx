'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, Search, Clock, MoreHorizontal, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { mensajeDeError } from '@/lib/errores'
import { toast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
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
import { PageHeader } from '@/components/shared/PageHeader'
import {
  EtiquetaAjuste, FilaAjuste, NotaAjuste, SeccionAjustes, VacioAjustes,
} from '@/components/configuracion/ajustes'

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
            activo ? 'border-border bg-white' : 'border-dashed border-border bg-muted/30'
          )}>
            <button
              type="button"
              role="checkbox"
              aria-checked={activo}
              aria-label={`Abre el ${label.toLowerCase()}`}
              onClick={() => toggle(key)}
              className={cn(
                'h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                activo ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-white'
              )}
            >
              {activo && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
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
                <span className="text-muted-foreground text-[13px]">a</span>
                <input
                  type="time"
                  value={horas[1]}
                  onChange={e => setHora(key, 1, e.target.value)}
                  className="text-sm border rounded px-2 py-1 w-28"
                />
              </div>
            ) : (
              <span className="text-[13px] text-muted-foreground">Cerrado</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Resumen de horario (read-only) ─────────────────────────

/** Días que abre la sede (en color) y su horario. Va dentro del texto de la fila. */
function HorarioResumen({ horario }: { horario: HorarioSede }) {
  const diasActivos = DIAS.filter(d => horario[d.key])
  if (!diasActivos.length) return <span className="block">Sin horario de atención</span>

  const [abre, cierra] = horario[diasActivos[0].key] ?? ['', '']
  const varia = diasActivos.some(d => horario[d.key]?.[0] !== abre || horario[d.key]?.[1] !== cierra)
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1">
      {DIAS.map(({ key, label, short }) => {
        const horas = horario[key]
        return (
          <span
            key={key}
            title={horas ? `${label}: ${horas[0]}–${horas[1]}` : `${label}: cerrado`}
            aria-label={horas ? `${label}: ${horas[0]} a ${horas[1]}` : `${label}: cerrado`}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold',
              horas ? 'bg-primary/10 text-primary' : 'border border-dashed border-border text-muted-foreground',
            )}
          >
            {short}
          </span>
        )
      })}
      <span className="ml-1 tabular-nums">
        {abre}–{cierra}{varia && ' (varía según el día)'}
      </span>
    </span>
  )
}

// ─── Sheet sede ──────────────────────────────────────────────

const SEDE_VACIA: SedeFormValues = { nombre: '', ciudad: '', direccion: '', telefono: '' }

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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SedeFormValues>({
    resolver: zodResolver(sedeSchema),
    defaultValues: SEDE_VACIA,
  })

  // Cada vez que se abre parte de la sede elegida o vacío: con `values` el
  // formulario conservaba los datos de la última sede editada al ir a "Nueva sede" (M1-26).
  useEffect(() => {
    if (!open) return
    setHorario(sede?.horario ?? HORARIO_DEFAULT)
    reset(sede ? {
      nombre:    sede.nombre,
      ciudad:    sede.ciudad,
      direccion: sede.direccion,
      telefono:  sede.telefono ?? '',
    } : SEDE_VACIA)
  }, [open, sede, reset])

  const mutation = useMutation({
    mutationFn: (data: SedeFormValues) =>
      isEdit
        ? clinicasApi.sedes.update(sede!.id, { ...data, horario })
        : clinicasApi.sedes.create({ ...data, horario }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sedes'] })
      onClose()
    },
  })

  const handleClose = () => onClose()

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar sede' : 'Nueva sede'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="mt-6 space-y-5">

          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Sede Norte" {...register('nombre')} className={cn(errors.nombre && 'border-destructive')} />
            {errors.nombre && <p className="text-[13px] text-destructive">{errors.nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Ciudad *</Label>
              <Input placeholder="Bogotá" {...register('ciudad')} className={cn(errors.ciudad && 'border-destructive')} />
              {errors.ciudad && <p className="text-[13px] text-destructive">{errors.ciudad.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input placeholder="6011234567" {...register('telefono')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Dirección *</Label>
            <Input placeholder="Cra 15 #93-47" {...register('direccion')} className={cn(errors.direccion && 'border-destructive')} />
            {errors.direccion && <p className="text-[13px] text-destructive">{errors.direccion.message}</p>}
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Horario de atención
            </Label>
            <HorarioEditor value={horario} onChange={setHorario} />
          </div>

          {mutation.isError && (
            <p className="text-sm text-destructive">{mensajeDeError(mutation.error, 'No se pudo guardar la sede. Intenta de nuevo.')}</p>
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

// ─── Fila de sede ─────────────────────────────────────────────

function FilaSede({
  sede,
  onEdit,
  onToggle,
  puedeGestionar,
}: {
  sede: Sede
  onEdit: (s: Sede) => void
  onToggle: (s: Sede) => void
  puedeGestionar: boolean
}) {
  const contacto = [sede.ciudad, sede.direccion, sede.telefono].filter(Boolean).join(' · ')
  return (
    <FilaAjuste
      icono={Building2}
      apagada={!sede.activo}
      titulo={sede.nombre}
      extra={!sede.activo && <EtiquetaAjuste>Inactiva</EtiquetaAjuste>}
      descripcion={
        <>
          <span className="block">{contacto}</span>
          <HorarioResumen horario={sede.horario ?? {}} />
        </>
      }
    >
      {puedeGestionar && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Acciones de ${sede.nombre}`}>
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
      )}
    </FilaAjuste>
  )
}

/** Filas grises mientras carga la lista. */
function FilasCargando({ filas }: { filas: number }) {
  return (
    <>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-64 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────

const SEDES_TODAS = ['sedes', 'todas'] as const
/** Con pocas sedes la búsqueda solo ocupa espacio. */
const SEDES_PARA_BUSCAR = 6

export default function SedesPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  // Con solo "ver sedes" no aparecen Nueva, Editar ni Desactivar (fallaban).
  const puedeGestionar = hasPermission(user, PERM.SEDES_GESTIONAR)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editando, setEditando] = useState<Sede | null>(null)

  // Clave propia: esta lista trae también las inactivas. Con ['sedes'] la
  // pisaba la lista de solo activas de Promociones y no se podían reactivar.
  const { data, isLoading } = useQuery({
    queryKey: SEDES_TODAS,
    queryFn: () => clinicasApi.sedes.list(),
  })

  const { data: limite } = useQuery({
    queryKey: ['sedes-limite'],
    queryFn: () => clinicasApi.getSedesLimite(),
  })

  // sedes_activas del endpoint puede no venir → contar desde la lista cargada
  const sedesActivas = limite?.sedes_activas ?? (data?.results.filter(s => s.activo).length ?? 0)
  const maxSedes = limite?.max_sedes ?? null
  const sinLimite = limite?.sin_limite ?? maxSedes === null
  const enLimite = !sinLimite && sedesActivas >= (maxSedes ?? 0)

  const toggleMutation = useMutation({
    mutationFn: (s: Sede) => clinicasApi.sedes.update(s.id, { activo: !s.activo }),
    onMutate: async (s: Sede) => {
      await qc.cancelQueries({ queryKey: SEDES_TODAS })
      const prev = qc.getQueryData(SEDES_TODAS)
      qc.setQueryData(SEDES_TODAS, (old: any) => old ? {
        ...old,
        results: old.results.map((r: Sede) => r.id === s.id ? { ...r, activo: !s.activo } : r),
      } : old)
      return { prev }
    },
    onError: (err, _s, ctx) => {
      qc.setQueryData(SEDES_TODAS, ctx?.prev)
      toast.error('No se pudo cambiar la sede', mensajeDeError(err))
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sedes'] })
    },
  })

  const total = data?.count ?? 0
  const sedes = (data?.results ?? []).filter(s =>
    !search || s.nombre.toLowerCase().includes(search.toLowerCase()) || s.ciudad.toLowerCase().includes(search.toLowerCase())
  )

  const handleEdit = (s: Sede) => { setEditando(s); setSheetOpen(true) }
  const handleClose = () => { setSheetOpen(false); setEditando(null) }
  const nuevaSede = () => { setEditando(null); setSheetOpen(true) }

  const descripcion = isLoading
    ? 'Cargando…'
    : !sinLimite && maxSedes !== null
      ? `${sedesActivas} de ${maxSedes} sedes activas que incluye tu plan.`
      : `${total} sede${total !== 1 ? 's' : ''} registrada${total !== 1 ? 's' : ''}.`

  return (
    <div className="space-y-6">
      <PageHeader title="Sedes" helpSlug="sedes-horarios-y-turnos" />

      <SeccionAjustes
        titulo="Sedes"
        descripcion={descripcion}
        accion={puedeGestionar && (
          <Button
            size="sm"
            onClick={nuevaSede}
            disabled={enLimite}
            title={enLimite ? `Límite de ${maxSedes} sedes alcanzado` : undefined}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva sede
          </Button>
        )}
      >
        {total > SEDES_PARA_BUSCAR && (
          <div className="px-4 py-2.5">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar sede o ciudad…"
                aria-label="Buscar sede o ciudad"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </div>
        )}

        {isLoading ? (
          <FilasCargando filas={2} />
        ) : total === 0 ? (
          <VacioAjustes
            titulo="Aún no hay sedes"
            descripcion={puedeGestionar ? 'Crea la primera sede de la clínica con su dirección y horario de atención.' : undefined}
            accion={puedeGestionar && (
              <Button size="sm" onClick={nuevaSede}>
                <Plus className="mr-1.5 h-4 w-4" />
                Nueva sede
              </Button>
            )}
          />
        ) : sedes.length === 0 ? (
          <VacioAjustes titulo={`Ninguna sede coincide con «${search.trim()}»`} />
        ) : (
          sedes.map(s => (
            <FilaSede
              key={s.id}
              sede={s}
              onEdit={handleEdit}
              onToggle={s => toggleMutation.mutate(s)}
              puedeGestionar={puedeGestionar}
            />
          ))
        )}

        {enLimite && (
          <NotaAjuste>
            Llegaste al límite de {maxSedes} sedes activas de tu plan. Para abrir otra, desactiva una o escríbenos para ampliarlo.
          </NotaAjuste>
        )}
      </SeccionAjustes>

      <SedeSheet sede={editando} open={sheetOpen} onClose={handleClose} />
    </div>
  )
}

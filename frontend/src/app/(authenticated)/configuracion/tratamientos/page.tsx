'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, MoreHorizontal, Pencil, Power, Loader2, Package2,
  Maximize2, Minimize2, X, Search, ChevronUp, ChevronDown,
  Stethoscope, GripVertical, Info, Clock,
} from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { ProcedimientoDialog } from '@/components/configuracion/ProcedimientoDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TratamientoCatalogo, TipoSesion, Procedimiento, CreateTipoSesionRequest } from '@/types/clinicas'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// ─── Schema ───────────────────────────────────────────────────

const schema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
  precio_estimado: z.number().min(0).nullable().optional(),
  activo: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

// ─── Draft de tipo de sesión (estado local antes de guardar) ──

interface TipoSesionDraft {
  key: string
  id?: string           // si ya existe en backend
  nombre: string
  cantidad: number
  es_compromiso: boolean
  duracion_min: number
  procedimientos: { tipoProc_id?: string; id: string; nombre: string; duracion_min: number }[]
}

function buildDraftFromTipo(t: TipoSesion): TipoSesionDraft {
  return {
    key: t.id,
    id: t.id,
    nombre: t.nombre,
    cantidad: t.cantidad,
    es_compromiso: t.es_compromiso,
    duracion_min: t.duracion_min,
    procedimientos: t.procedimientos.map((p) => ({
      tipoProc_id: p.id,
      id: p.procedimiento,
      nombre: p.procedimiento_nombre,
      duracion_min: p.procedimiento_duracion_min,
    })),
  }
}

// ─── Selector de procedimiento ────────────────────────────────

function ProcSelector({
  servicios,
  excludeIds,
  onSelect,
  onCreateNew,
}: {
  servicios: Procedimiento[]
  excludeIds: string[]
  onSelect: (s: Procedimiento) => void
  onCreateNew: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = servicios
    .filter((s) => !excludeIds.includes(s.id))
    .filter((s) => !q || s.nombre.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden w-60">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar procedimiento…"
          className="flex-1 text-xs outline-none bg-transparent" />
      </div>
      <div className="max-h-44 overflow-y-auto divide-y">
        {filtered.map((s) => (
          <button key={s.id} type="button" onClick={() => { setQ(''); onSelect(s) }}
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
            <Stethoscope className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-xs flex-1">{s.nombre}</span>
            <span className="text-[10px] text-muted-foreground">{s.duracion_min} min</span>
          </button>
        ))}
        {filtered.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</p>}
      </div>
      <div className="border-t px-3 py-2">
        <button type="button" onClick={onCreateNew}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
          <Plus className="h-3 w-3" />Crear nuevo procedimiento
        </button>
      </div>
    </div>
  )
}

// ─── Fila de tipo de sesión ───────────────────────────────────

function TipoSesionRow({
  tipo, index, total, servicios,
  onChange, onRemove, onMoveUp, onMoveDown,
  onCreateProcedimiento,
}: {
  tipo: TipoSesionDraft
  index: number
  total: number
  servicios: Procedimiento[]
  onChange: (updated: TipoSesionDraft) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onCreateProcedimiento: (onCreated: (s: Procedimiento) => void) => void
}) {
  const [showProc, setShowProc] = useState(false)

  function addProcedimiento(s: Procedimiento) {
    if (tipo.procedimientos.some((p) => p.id === s.id)) return
    const nuevos = [...tipo.procedimientos, { id: s.id, nombre: s.nombre, duracion_min: s.duracion_min }]
    const suma = nuevos.reduce((acc, p) => acc + p.duracion_min, 0)
    onChange({ ...tipo, procedimientos: nuevos, duracion_min: suma })
    setShowProc(false)
  }

  function removeProcedimiento(procId: string) {
    const nuevos = tipo.procedimientos.filter((p) => p.id !== procId)
    const suma = nuevos.reduce((acc, p) => acc + p.duracion_min, 0)
    onChange({ ...tipo, procedimientos: nuevos, duracion_min: suma })
  }

  return (
    <div className="rounded-lg border bg-white p-3 space-y-2">
      {/* Header fila */}
      <div className="flex items-center gap-2">
        {/* Reordenar */}
        <div className="flex flex-col shrink-0">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20 h-3.5 flex items-center">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="text-muted-foreground/40 hover:text-muted-foreground disabled:opacity-20 h-3.5 flex items-center">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Nombre */}
        <Input
          className="h-7 text-sm flex-1"
          placeholder="Nombre del tipo de sesión…"
          value={tipo.nombre}
          onChange={(e) => onChange({ ...tipo, nombre: e.target.value })}
        />

        {/* Cantidad */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">×</span>
          <Input
            type="number" min={1}
            className="h-7 w-14 text-sm text-center"
            value={tipo.cantidad}
            onChange={(e) => onChange({ ...tipo, cantidad: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>

        {/* Duración */}
        <div className="flex items-center gap-1 shrink-0">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="number" min={5} step={5}
            className="h-7 w-16 text-sm text-center"
            value={tipo.duracion_min || ''}
            placeholder="min"
            onChange={(e) => onChange({ ...tipo, duracion_min: Math.max(0, Number(e.target.value) || 0) })}
          />
          <span className="text-xs text-muted-foreground">min</span>
        </div>

        {/* Toggle es_compromiso */}
        <button type="button"
          title={tipo.es_compromiso ? 'Sesión trackeable (genera registro de seguimiento)' : 'Solo informativo'}
          onClick={() => onChange({ ...tipo, es_compromiso: !tipo.es_compromiso })}
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0 transition-colors',
            tipo.es_compromiso
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-gray-100 text-gray-400 border-gray-200'
          )}>
          {tipo.es_compromiso ? 'seguim.' : 'info'}
        </button>

        {/* Eliminar fila */}
        <button type="button" onClick={onRemove}
          className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 p-0.5 rounded">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Procedimientos vinculados */}
      <div className="pl-8 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tipo.procedimientos.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full border border-emerald-200">
              <Stethoscope className="h-2.5 w-2.5" />
              {p.nombre}
              <span className="text-emerald-400">· {p.duracion_min} min</span>
              <button type="button"
                onClick={() => removeProcedimiento(p.id)}
                className="ml-0.5 hover:text-destructive transition-colors">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          <div className="relative">
            <button type="button"
              onClick={() => setShowProc((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-dashed border-gray-300 rounded-full px-2 py-0.5 transition-colors">
              <Plus className="h-2.5 w-2.5" />procedimiento
            </button>
            {showProc && (
              <div className="absolute z-20 top-7 left-0">
                <ProcSelector
                  servicios={servicios}
                  excludeIds={tipo.procedimientos.map((p) => p.id)}
                  onSelect={addProcedimiento}
                  onCreateNew={() => {
                    setShowProc(false)
                    onCreateProcedimiento(addProcedimiento)
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {tipo.procedimientos.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic">Sin procedimientos vinculados</p>
        )}
        {tipo.es_compromiso && tipo.duracion_min === 0 && (
          <p className="text-[10px] text-amber-600">
            ⚠ Ingresa la duración para poder calcular slots de agenda
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Dialog de tratamiento ────────────────────────────────────

function TratamientoDialog({
  open, onOpenChange, tratamiento,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tratamiento?: TratamientoCatalogo | null
}) {
  const qc = useQueryClient()
  const isEdit = !!tratamiento
  const [tab, setTab] = useState<'datos' | 'tipos'>('datos')
  const [expanded, setExpanded] = useState(false)
  const [tipos, setTipos] = useState<TipoSesionDraft[]>([])
  const [procDialogOpen, setProcDialogOpen] = useState(false)
  const [procCreatedCallback, setProcCreatedCallback] = useState<((s: Procedimiento) => void) | null>(null)
  const [syncedId, setSyncedId] = useState<string | null>(null)

  // Sincronizar tipos al abrir en modo edición
  if (tratamiento && tratamiento.id !== syncedId) {
    setTipos(tratamiento.tipos_sesion.map(buildDraftFromTipo))
    setSyncedId(tratamiento.id)
  }

  const { data: procData } = useQuery({
    queryKey: ['procedimientos', 'all'],
    queryFn: () => clinicasApi.procedimientos.list(),
    enabled: open,
  })
  const servicios = (procData?.results ?? []).filter((s) => s.activo)

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: tratamiento ? {
      nombre: tratamiento.nombre,
      descripcion: tratamiento.descripcion ?? '',
      precio_estimado: tratamiento.precio_estimado ? parseFloat(tratamiento.precio_estimado) : null,
      activo: tratamiento.activo,
    } : { nombre: '', descripcion: '', precio_estimado: null, activo: true },
    resetOptions: { keepDirtyValues: false },
  })

  const mut = useMutation({
    mutationFn: (data: FormValues) => {
      const payload = {
        ...data,
        tipos_sesion: tipos.map((t, idx) => ({
          nombre: t.nombre,
          cantidad: t.cantidad,
          orden: idx + 1,
          es_compromiso: t.es_compromiso,
          duracion_min: t.duracion_min,
          procedimientos: t.procedimientos.map((p, pIdx) => ({
            ...(p.tipoProc_id ? { id: p.tipoProc_id } : {}),
            procedimiento: p.id,
            orden: pIdx + 1,
          })),
        })) satisfies CreateTipoSesionRequest[],
      }
      return isEdit
        ? clinicasApi.tratamientos.update(tratamiento!.id, payload)
        : clinicasApi.tratamientos.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tratamientos', 'all'] })
      handleClose()
    },
  })

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => { setTipos([]); setTab('datos'); setExpanded(false); setSyncedId(null); reset() }, 200)
  }

  function addTipo() {
    setTipos((prev) => [...prev, {
      key: `new-${Date.now()}`,
      nombre: '',
      cantidad: 1,
      es_compromiso: true,
      duracion_min: 0,
      procedimientos: [],
    }])
  }

  function handleProcCreated(s: Procedimiento) {
    qc.invalidateQueries({ queryKey: ['procedimientos', 'all'] })
    procCreatedCallback?.(s)
    setProcDialogOpen(false)
    setProcCreatedCallback(null)
  }

  const totalSesiones = tipos.filter((t) => t.es_compromiso).reduce((a, t) => a + t.cantidad, 0)
  const serverError = mut.error as any

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className={cn(
          'flex flex-col p-0 gap-0 overflow-hidden transition-all duration-200 max-h-[90vh]',
          expanded ? 'max-w-4xl w-full' : 'sm:max-w-2xl w-full',
        )}>
          <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0 space-y-0">
            <DialogTitle className="text-base">
              {isEdit ? 'Editar tratamiento' : 'Nuevo tratamiento'}
            </DialogTitle>
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="ml-auto mr-8 text-muted-foreground hover:text-foreground transition-colors"
              title={expanded ? 'Reducir' : 'Expandir'}>
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'datos' | 'tipos')} className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="shrink-0 rounded-none border-b bg-gray-50/70 h-10 px-6 justify-start gap-1">
              <TabsTrigger value="datos" className="rounded-md text-xs px-3 h-7">Datos</TabsTrigger>
              <TabsTrigger value="tipos" className="rounded-md text-xs px-3 h-7">
                Tipos de sesión
                {tipos.length > 0 && (
                  <span className="ml-1.5 bg-primary/15 text-primary text-[10px] font-semibold px-1.5 rounded-full">
                    {tipos.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Tab Datos ── */}
            <TabsContent value="datos" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none">
              <form id="tratamiento-form" onSubmit={handleSubmit((d) => mut.mutate(d))} className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Nombre *</Label>
                  <Input {...register('nombre')} placeholder="Ej: Tensamax 10 sesiones" autoFocus />
                  {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea {...register('descripcion')} placeholder="Descripción opcional..." rows={3} />
                </div>
                <div className="space-y-1.5">
                  <Label>Precio estimado</Label>
                  <Controller name="precio_estimado" control={control} render={({ field }) => (
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">$</span>
                      <Input inputMode="numeric" className="pl-7" placeholder="0"
                        value={field.value != null ? new Intl.NumberFormat('es-CO').format(field.value) : ''}
                        onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); field.onChange(raw ? Number(raw) : null) }}
                      />
                    </div>
                  )} />
                  <p className="text-xs text-muted-foreground">Precio sugerido al agregar este tratamiento en una cotización.</p>
                </div>
                {isEdit && (
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">Activo</p>
                      <p className="text-xs text-muted-foreground">Los tratamientos inactivos no aparecen en cotizaciones</p>
                    </div>
                    <Controller name="activo" control={control} render={({ field }) => (
                      <input type="checkbox" checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
                    )} />
                  </div>
                )}
                {serverError && (
                  <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                    <p className="text-sm text-destructive">{serverError?.response?.data?.detail || 'Ocurrió un error.'}</p>
                  </div>
                )}
              </form>
            </TabsContent>

            {/* ── Tab Tipos de sesión ── */}
            <TabsContent value="tipos" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50/50 shrink-0">
                <div>
                  <p className="text-sm font-semibold">Tipos de sesión</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cada tipo define qué procedimientos se realizan en ese grupo de citas.
                    {totalSesiones > 0 && ` Total: ${totalSesiones} sesiones trackeables.`}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addTipo}>
                  <Plus className="h-3.5 w-3.5" />Agregar tipo
                </Button>
              </div>

              <div className="flex-1 p-4 space-y-3">
                {tipos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Package2 className="h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Sin tipos de sesión.</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Ej: "Sesión Tensamax ×7", "Sesión combinada ×2"</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4 gap-1" onClick={addTipo}>
                      <Plus className="h-3.5 w-3.5" />Agregar tipo de sesión
                    </Button>
                  </div>
                ) : (
                  tipos.map((tipo, idx) => (
                    <TipoSesionRow
                      key={tipo.key}
                      tipo={tipo}
                      index={idx}
                      total={tipos.length}
                      servicios={servicios}
                      onChange={(updated) => setTipos((prev) => prev.map((t, i) => i === idx ? updated : t))}
                      onRemove={() => setTipos((prev) => prev.filter((_, i) => i !== idx))}
                      onMoveUp={() => setTipos((prev) => { const a = [...prev]; [a[idx - 1], a[idx]] = [a[idx], a[idx - 1]]; return a })}
                      onMoveDown={() => setTipos((prev) => { const a = [...prev]; [a[idx], a[idx + 1]] = [a[idx + 1], a[idx]]; return a })}
                      onCreateProcedimiento={(cb) => { setProcCreatedCallback(() => cb); setProcDialogOpen(true) }}
                    />
                  ))
                )}
              </div>

              {/* Leyenda */}
              {tipos.length > 0 && (
                <div className="px-4 pb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span><strong>seguim.</strong> = genera sesión trackeable con checkin y consentimientos. <strong>info</strong> = aparece en el plan pero no crea seguimiento.</span>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="shrink-0 border-t px-6 py-4 flex justify-between items-center bg-white">
            {totalSesiones > 0
              ? <p className="text-xs text-muted-foreground">{totalSesiones} sesiones · {tipos.length} tipo{tipos.length !== 1 ? 's' : ''}</p>
              : <span />}
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleClose} disabled={mut.isPending}>Cancelar</Button>
              <Button type="button" onClick={() => handleSubmit((d) => mut.mutate(d))()} disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit ? 'Guardar cambios' : 'Crear tratamiento'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProcedimientoDialog
        open={procDialogOpen}
        onOpenChange={setProcDialogOpen}
        onCreated={handleProcCreated}
      />
    </>
  )
}

// ─── Tabla de tratamientos ────────────────────────────────────

function TratamientosTable({
  tratamientos, onEdit, onToggle,
}: {
  tratamientos: TratamientoCatalogo[]
  onEdit: (t: TratamientoCatalogo) => void
  onToggle: (t: TratamientoCatalogo) => void
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50/60">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tratamiento</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 hidden md:table-cell">Precio est.</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24 hidden sm:table-cell">Sesiones</th>
            <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Estado</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {tratamientos.map((t) => (
            <tr key={t.id} className={cn('hover:bg-gray-50/50 transition-colors', !t.activo && 'opacity-55')}>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{t.nombre}</p>
                {t.descripcion && <p className="text-xs text-muted-foreground truncate max-w-sm mt-0.5">{t.descripcion}</p>}
                {/* Pills de tipos de sesión */}
                {t.tipos_sesion.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.tipos_sesion.map((tipo) => (
                      <span key={tipo.id} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        {tipo.nombre}
                        <span className="text-gray-400">×{tipo.cantidad}</span>
                        {!tipo.es_compromiso && <span className="text-gray-300 italic"> info</span>}
                      </span>
                    ))}
                  </div>
                )}
                {/* Procedimientos únicos */}
                {t.tipos_sesion.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.from(new Set(t.tipos_sesion.flatMap((ts) => ts.procedimientos.map((p) => p.procedimiento_nombre)))).map((nombre) => (
                      <span key={nombre} className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700">
                        <Stethoscope className="h-2.5 w-2.5" />{nombre}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right hidden md:table-cell">
                {t.precio_estimado
                  ? <span className="text-sm font-semibold tabular-nums">{COP.format(parseFloat(t.precio_estimado))}</span>
                  : <span className="text-xs text-muted-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-center hidden sm:table-cell">
                <span className="text-sm font-medium">{t.total_sesiones}</span>
              </td>
              <td className="px-4 py-3 text-center">
                <Badge variant={t.activo ? 'default' : 'secondary'} className="text-[10px]">
                  {t.activo ? 'Activo' : 'Inactivo'}
                </Badge>
              </td>
              <td className="px-2 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(t)}>
                      <Pencil className="h-4 w-4 mr-2" />Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onToggle(t)}>
                      <Power className="h-4 w-4 mr-2" />{t.activo ? 'Desactivar' : 'Activar'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function TratamientosPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TratamientoCatalogo | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tratamientos', 'all'],
    queryFn: () => clinicasApi.tratamientos.list(),
    retry: 1,
  })

  const toggleMut = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) =>
      clinicasApi.tratamientos.update(id, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tratamientos', 'all'] }),
  })

  const tratamientos = data?.results ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tratamientos"
        description="Agrupa procedimientos en planes con tipos de sesión y precio estimado"
        backHref="/configuracion"
        action={
          <Button onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />Nuevo tratamiento
          </Button>
        }
      />

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}

      {isError && (
        <div className="rounded-xl border bg-amber-50 border-amber-200 p-6 text-center">
          <Package2 className="h-8 w-8 text-amber-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-amber-800">Módulo de tratamientos no disponible aún</p>
          <p className="text-xs text-amber-600 mt-1">
            El endpoint <code className="bg-amber-100 px-1 rounded">/clinicas/tratamientos/</code> está pendiente de backend (H27).
          </p>
        </div>
      )}

      {!isLoading && !isError && tratamientos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No hay tratamientos configurados</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Un tratamiento define tipos de sesión (ej. "Sesión Tensamax ×7 + Sesión combinada ×2") y el precio del plan.
          </p>
          <Button className="mt-4" onClick={() => { setEditTarget(null); setDialogOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />Nuevo tratamiento
          </Button>
        </div>
      )}

      {!isLoading && !isError && tratamientos.length > 0 && (
        <TratamientosTable
          tratamientos={tratamientos}
          onEdit={(t) => { setEditTarget(t); setDialogOpen(true) }}
          onToggle={(t) => toggleMut.mutate({ id: t.id, activo: !t.activo })}
        />
      )}

      <TratamientoDialog open={dialogOpen} onOpenChange={setDialogOpen} tratamiento={editTarget} />
    </div>
  )
}

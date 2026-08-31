'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Loader2, Zap,
  ChevronRight, ChevronDown, X, Package2, Stethoscope,
  BarChart2, TrendingUp, ShoppingBag, CalendarRange, MapPin,
} from 'lucide-react'
import { campanasApi } from '@/lib/api/campanas'
import { clinicasApi } from '@/lib/api/clinicas'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { Campana, CampanaItem, CreateCampanaRequest, CreateCampanaItemRequest } from '@/types/campanas'
import type { Procedimiento, TratamientoCatalogo } from '@/types/clinicas'

// ─── Helpers ──────────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function campanaEstado(c: Campana): { label: string; color: string } {
  if (!c.activo) return { label: 'Inactiva', color: 'bg-gray-100 text-gray-500' }
  const hoy = todayStr()
  if (c.fecha_fin < hoy) return { label: 'Vencida', color: 'bg-gray-100 text-gray-500' }
  if (c.fecha_inicio > hoy) return { label: 'Próxima', color: 'bg-blue-100 text-blue-700' }
  return { label: 'Activa', color: 'bg-green-100 text-green-700' }
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Schemas ──────────────────────────────────────────────────

const campanaSchema = z.object({
  nombre:      z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
  fecha_inicio: z.string().min(1, 'Requerido'),
  fecha_fin:    z.string().min(1, 'Requerido'),
  activo:      z.boolean(),
  sedes:       z.array(z.string()),
})
type CampanaFormValues = z.infer<typeof campanaSchema>

// ─── Item draft (local state before saving) ───────────────────

interface ItemDraft {
  key:            string
  id?:            string    // backend UUID (present for existing items)
  tipo:           'procedimiento' | 'tratamiento'
  targetId:       string
  targetNombre:   string
  precio_campana: number
  precio_regular: number | null
}

// ─── CampañaDialog ────────────────────────────────────────────

function CampanaDialog({
  open, onOpenChange, editing,
  procedimientos, tratamientos, sedesDisponibles, todasCampanas,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Campana | null
  procedimientos: Procedimiento[]
  tratamientos: TratamientoCatalogo[]
  sedesDisponibles: { id: string; nombre: string }[]
  todasCampanas: Campana[]
}) {
  const qc = useQueryClient()
  const [itemsDraft, setItemsDraft] = useState<ItemDraft[]>([])
  const [itemTipo, setItemTipo] = useState<'procedimiento' | 'tratamiento'>('procedimiento')
  const [itemTargetId, setItemTargetId] = useState('')
  const [itemPrecio, setItemPrecio] = useState('')
  const [itemsError, setItemsError] = useState(false)

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CampanaFormValues>({
    resolver: zodResolver(campanaSchema),
    defaultValues: { nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', activo: true, sedes: [] },
  })

  const selectedSedes = watch('sedes') ?? []

  // Sync form + items when dialog opens
  useEffect(() => {
    if (!open) return
    if (editing) {
      reset({
        nombre:       editing.nombre,
        descripcion:  editing.descripcion,
        fecha_inicio: editing.fecha_inicio,
        fecha_fin:    editing.fecha_fin,
        activo:       editing.activo,
        sedes:        editing.sedes ?? [],
      })
      setItemsDraft((editing.items ?? []).map((item) => {
        const esProcedimiento = !!item.procedimiento
        const targetId = (item.procedimiento ?? item.tratamiento)!
        let precio_regular: number | null = null
        if (esProcedimiento) {
          const p = procedimientos.find((x) => x.id === targetId)
          const raw = p?.precio_referencia ?? p?.precio_base ?? p?.precio
          precio_regular = raw ? parseFloat(raw) : null
        } else {
          const t = tratamientos.find((x) => x.id === targetId)
          precio_regular = t?.precio_estimado ? parseFloat(t.precio_estimado) : null
        }
        return {
          key:            item.id,
          id:             item.id,
          tipo:           esProcedimiento ? 'procedimiento' : 'tratamiento',
          targetId,
          targetNombre:   (item.procedimiento_nombre ?? item.tratamiento_nombre)!,
          precio_campana: parseFloat(item.precio_campana),
          precio_regular,
        }
      }))
    } else {
      reset({ nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', activo: true, sedes: [] })
      setItemsDraft([])
    }
    setItemTipo('procedimiento')
    setItemTargetId('')
    setItemPrecio('')
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const createMutation = useMutation({
    mutationFn: async (values: CampanaFormValues) => {
      const payload: CreateCampanaRequest = { ...values, descripcion: values.descripcion ?? '' }
      const campana = await campanasApi.create(payload)
      for (const item of itemsDraft) {
        const itemPayload: CreateCampanaItemRequest = {
          procedimiento:  item.tipo === 'procedimiento' ? item.targetId : null,
          tratamiento:    item.tipo === 'tratamiento'   ? item.targetId : null,
          precio_campana: item.precio_campana,
        }
        await campanasApi.addItem(campana.id, itemPayload)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña creada')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al crear la campaña'),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: CampanaFormValues) => {
      await campanasApi.update(editing!.id, { ...values, descripcion: values.descripcion ?? '' })

      const existingIds = new Set(editing!.items.map((i) => i.id))
      const draftIds    = new Set(itemsDraft.map((d) => d.id).filter(Boolean) as string[])

      // Remove deleted items
      for (const item of editing!.items) {
        if (!draftIds.has(item.id)) await campanasApi.removeItem(editing!.id, item.id)
      }
      // Add new items
      for (const draft of itemsDraft) {
        if (!draft.id || !existingIds.has(draft.id)) {
          await campanasApi.addItem(editing!.id, {
            procedimiento:  draft.tipo === 'procedimiento' ? draft.targetId : null,
            tratamiento:    draft.tipo === 'tratamiento'   ? draft.targetId : null,
            precio_campana: draft.precio_campana,
          })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña actualizada')
      onOpenChange(false)
    },
    onError: () => toast.error('Error al guardar la campaña'),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function getPrecioRegular(tipo: 'procedimiento' | 'tratamiento', targetId: string): number | null {
    if (tipo === 'procedimiento') {
      const p = procedimientos.find((x) => x.id === targetId)
      const raw = p?.precio_referencia ?? p?.precio_base ?? p?.precio
      return raw ? parseFloat(raw) : null
    }
    const t = tratamientos.find((x) => x.id === targetId)
    return t?.precio_estimado ? parseFloat(t.precio_estimado) : null
  }

  const itemYaAgregado = !!itemTargetId && itemsDraft.some(
    (d) => d.tipo === itemTipo && d.targetId === itemTargetId
  )

  function addItemToDraft() {
    if (!itemTargetId || !itemPrecio || itemYaAgregado || itemBloqueadoPorOtraCampana) return
    const nombre = itemTipo === 'procedimiento'
      ? procedimientos.find((p) => p.id === itemTargetId)?.nombre ?? itemTargetId
      : tratamientos.find((t) => t.id === itemTargetId)?.nombre ?? itemTargetId
    setItemsDraft((prev) => [...prev, {
      key:            crypto.randomUUID(),
      tipo:           itemTipo,
      targetId:       itemTargetId,
      targetNombre:   nombre,
      precio_campana: parseFloat(itemPrecio.replace(/\D/g, '')),
      precio_regular: getPrecioRegular(itemTipo, itemTargetId),
    }])
    setItemsError(false)
    setItemTargetId('')
    setItemPrecio('')
  }

  function handleSubmit_withItemsCheck(values: CampanaFormValues) {
    if (itemsDraft.length === 0) {
      setItemsError(true)
      return
    }
    setItemsError(false)
    if (editing) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const precioRegularActual = itemTargetId ? getPrecioRegular(itemTipo, itemTargetId) : undefined

  // IDs de procedimientos/tratamientos ya usados en OTRAS campañas activas hoy
  const hoy = todayStr()
  const otrasActivas = todasCampanas.filter(
    (c) => c.id !== editing?.id && c.activo && c.fecha_inicio <= hoy && c.fecha_fin >= hoy
  )
  const procOcupados = new Set(
    otrasActivas.flatMap((c) => (c.items ?? []).map((i) => i.procedimiento).filter(Boolean) as string[])
  )
  const tratOcupados = new Set(
    otrasActivas.flatMap((c) => (c.items ?? []).map((i) => i.tratamiento).filter(Boolean) as string[])
  )
  const itemBloqueadoPorOtraCampana = itemTargetId && (
    (itemTipo === 'procedimiento' && procOcupados.has(itemTargetId)) ||
    (itemTipo === 'tratamiento'   && tratOcupados.has(itemTargetId))
  )
  const campanaQueBloquea = itemBloqueadoPorOtraCampana
    ? otrasActivas.find((c) => (c.items ?? []).some(
        (i) => itemTipo === 'procedimiento' ? i.procedimiento === itemTargetId : i.tratamiento === itemTargetId
      ))
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-lg">{editing ? 'Editar campaña' : 'Nueva campaña'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSubmit_withItemsCheck)} className="space-y-6">

          {/* ── Información general ── */}
          <section className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Información general</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre</Label>
                <Input {...register('nombre')} placeholder="Ej. Campaña Verano 2026" />
                {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
              </div>

              {/* Descripción */}
              <div className="col-span-2 space-y-1.5">
                <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Textarea rows={2} className="resize-none" {...register('descripcion')} />
              </div>

              {/* Fecha inicio */}
              <div className="space-y-1.5">
                <Label>Fecha inicio</Label>
                <Input type="date" {...register('fecha_inicio')} />
                {errors.fecha_inicio && <p className="text-xs text-destructive">{errors.fecha_inicio.message}</p>}
              </div>

              {/* Fecha fin */}
              <div className="space-y-1.5">
                <Label>Fecha fin</Label>
                <Input type="date" {...register('fecha_fin')} />
                {errors.fecha_fin && <p className="text-xs text-destructive">{errors.fecha_fin.message}</p>}
              </div>
            </div>

            {/* Activo + Sedes en la misma fila */}
            <div className="flex flex-wrap items-start gap-6">
              <Controller
                control={control}
                name="activo"
                render={({ field }) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="activo"
                      checked={field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                    <Label htmlFor="activo" className="cursor-pointer font-normal">Campaña activa</Label>
                  </div>
                )}
              />
            </div>

            {/* Sedes */}
            {sedesDisponibles.length > 0 && (
              <div className="space-y-2">
                <div>
                  <Label>Sedes aplicables</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Sin selección aplica a todas las sedes.</p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {sedesDisponibles.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`sede-${s.id}`}
                        checked={selectedSedes.includes(s.id)}
                        onChange={(e) => {
                          setValue(
                            'sedes',
                            e.target.checked
                              ? [...selectedSedes, s.id]
                              : selectedSedes.filter((id) => id !== s.id),
                            { shouldDirty: true }
                          )
                        }}
                      />
                      <Label htmlFor={`sede-${s.id}`} className="cursor-pointer font-normal">{s.nombre}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ── Ítems de campaña ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ítems de campaña</p>
              {itemsError && <p className="text-xs text-destructive font-medium">Agrega al menos un ítem</p>}
            </div>

            {/* Lista de ítems */}
            {itemsDraft.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">Nombre</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">P. regular</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">P. campaña</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {itemsDraft.map((item) => (
                      <tr key={item.key} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {item.tipo === 'procedimiento'
                              ? <Stethoscope className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <Package2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            }
                            <span className="truncate max-w-[220px]">{item.targetNombre}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground text-xs">
                          {item.precio_regular != null ? COP.format(item.precio_regular) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                          {COP.format(item.precio_campana)}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => setItemsDraft((prev) => prev.filter((d) => d.key !== item.key))}
                            className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Agregar ítem */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              {/* Toggle tipo */}
              <div className="flex gap-1 p-1 bg-background border rounded-md w-fit">
                {(['procedimiento', 'tratamiento'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setItemTipo(t); setItemTargetId('') }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                      itemTipo === t
                        ? 'bg-white shadow-sm text-foreground border'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t === 'procedimiento' ? <Stethoscope className="h-3.5 w-3.5" /> : <Package2 className="h-3.5 w-3.5" />}
                    {t === 'procedimiento' ? 'Procedimiento' : 'Tratamiento'}
                  </button>
                ))}
              </div>

              {/* Selector + precio + botón en una fila */}
              <div className="flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  <Select value={itemTargetId} onValueChange={setItemTargetId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={itemTipo === 'procedimiento' ? 'Seleccionar procedimiento…' : 'Seleccionar tratamiento…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {itemTipo === 'procedimiento'
                        ? procedimientos
                            .filter((p) => !itemsDraft.some((d) => d.tipo === 'procedimiento' && d.targetId === p.id))
                            .filter((p) => !procOcupados.has(p.id))
                            .map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)
                        : tratamientos
                            .filter((t) => !itemsDraft.some((d) => d.tipo === 'tratamiento' && d.targetId === t.id))
                            .filter((t) => !tratOcupados.has(t.id))
                            .map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  {itemTargetId && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {itemYaAgregado
                        ? <span className="text-destructive font-medium">Ya está en esta campaña</span>
                        : itemBloqueadoPorOtraCampana
                          ? <span className="text-destructive font-medium">
                              En campaña activa: {campanaQueBloquea?.nombre ?? '—'}
                            </span>
                          : <>Precio referencia:{' '}
                              {precioRegularActual != null
                                ? <span className="font-medium text-foreground tabular-nums">{COP.format(precioRegularActual)}</span>
                                : <span className="italic">sin registrar</span>
                              }
                            </>
                      }
                    </p>
                  )}
                </div>

                <div className="relative w-48 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                  <Input
                    inputMode="numeric"
                    className="pl-7 bg-background tabular-nums"
                    placeholder="0"
                    value={itemPrecio ? Number(itemPrecio).toLocaleString('es-CO') : ''}
                    onChange={(e) => setItemPrecio(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <Button
                  type="button"
                  variant="default"
                  disabled={!itemTargetId || !itemPrecio || itemYaAgregado || !!itemBloqueadoPorOtraCampana}
                  onClick={addItemToDraft}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>
            </div>

            {itemsDraft.length === 0 && !itemsError && (
              <p className="text-xs text-muted-foreground italic text-center py-1">Sin ítems aún.</p>
            )}
          </section>

          <DialogFooter className="pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear campaña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Fila expandida: ítems ────────────────────────────────────

function CampanaItems({ campana }: { campana: Campana }) {
  const items = campana.items ?? []
  if (items.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground italic">Sin ítems en esta campaña.</p>
  }
  return (
    <div className="px-4 pb-3 pt-1 space-y-1">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-1.5">
            {item.procedimiento
              ? <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
              : <Package2 className="h-3.5 w-3.5 text-muted-foreground" />
            }
            <span>{item.procedimiento_nombre ?? item.tratamiento_nombre}</span>
          </div>
          <span className="font-medium tabular-nums text-emerald-700">{COP.format(parseFloat(item.precio_campana))}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Stats modal ──────────────────────────────────────────────

function CampanaStatsModal({ campana, open, onClose }: { campana: Campana | null; open: boolean; onClose: () => void }) {
  if (!campana) return null

  const stats       = campana.stats
  const estado      = campanaEstado(campana)
  const ventas      = stats?.cotizaciones_aceptadas ?? 0
  const itemsVendidos = stats?.items_vendidos ?? 0
  const monto       = stats ? Number(stats.monto_total) : 0
  const totalItems  = campana.items?.length ?? 0
  const ticketProm  = ventas > 0 ? monto / ventas : 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base leading-tight truncate">{campana.nombre}</DialogTitle>
                {campana.descripcion && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{campana.descripcion}</p>
                )}
              </div>
            </div>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 mt-0.5', estado.color)}>
              {estado.label}
            </span>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Vigencia y sedes */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              <span>{fmtDate(campana.fecha_inicio)} — {fmtDate(campana.fecha_fin)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              <span>
                {(campana.sedes_nombres?.length ?? 0) === 0
                  ? 'Todas las sedes'
                  : campana.sedes_nombres.join(', ')}
              </span>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <ShoppingBag className="h-4 w-4 text-violet-500" />
              </div>
              <p className="text-xl font-bold text-foreground tabular-nums">{ventas}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Cotizaciones</p>
            </div>
            <div className="rounded-xl border bg-emerald-50 px-4 py-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-base font-bold text-emerald-700 tabular-nums leading-tight">
                {COP.format(monto)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Monto total</p>
            </div>
            <div className="rounded-xl border bg-gray-50 px-4 py-3 text-center">
              <div className="flex items-center justify-center mb-1">
                <BarChart2 className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-base font-bold text-foreground tabular-nums leading-tight">
                {ventas > 0 ? COP.format(ticketProm) : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Ticket prom.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            <Package2 className="h-3.5 w-3.5 shrink-0" />
            <span><span className="font-semibold text-foreground">{itemsVendidos}</span> ítems vendidos en total · <span className="font-semibold text-foreground">{totalItems}</span> {totalItems === 1 ? 'ítem' : 'ítems'} en campaña</span>
          </div>

          {/* Ítems */}
          {totalItems > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ítems de la campaña</p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Precio campaña</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {campana.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {item.procedimiento
                              ? <Stethoscope className="h-3 w-3 text-muted-foreground shrink-0" />
                              : <Package2 className="h-3 w-3 text-muted-foreground shrink-0" />
                            }
                            <span className="truncate max-w-[220px]">
                              {item.procedimiento_nombre ?? item.tratamiento_nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                          {COP.format(parseFloat(item.precio_campana))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────

export default function CampanasPage() {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Campana | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [statsModal, setStatsModal] = useState<Campana | null>(null)

  const { data: campanas, isLoading } = useQuery({
    queryKey: ['campanas'],
    queryFn: () => campanasApi.list(),
  })

  const { data: procedimientos } = useQuery({
    queryKey: ['procedimientos-activos'],
    queryFn: () => clinicasApi.procedimientos.activos(),
  })

  const { data: tratamientos } = useQuery({
    queryKey: ['tratamientos-activos'],
    queryFn: () => clinicasApi.tratamientos.activos(),
  })

  const { data: sedesData } = useQuery({
    queryKey: ['sedes'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campanasApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Campaña eliminada')
    },
    onError: () => toast.error('No se pudo eliminar la campaña'),
  })

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(c: Campana) {
    setEditing(c)
    setDialogOpen(true)
  }

  const rows = campanas?.results ?? []
  const sedes = sedesData?.results ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas"
        description="Precios especiales por período para procedimientos y tratamientos."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva campaña
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-muted-foreground">Sin campañas</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una campaña para ofrecer precios especiales por período.</p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nueva campaña
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60">
                <th className="w-8" />
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaña</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Vigencia</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Sedes</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Estado</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Ítems</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Ventas</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => {
                const estado = campanaEstado(c)
                const expanded = expandedId === c.id
                return (
                  <>
                    <tr
                      key={c.id}
                      className={cn('hover:bg-gray-50/50 transition-colors', !c.activo && 'opacity-60')}
                    >
                      {/* Expand toggle */}
                      <td className="pl-3 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : c.id)}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {expanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />
                          }
                        </button>
                      </td>

                      {/* Nombre */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <div>
                            <p className="font-medium text-gray-900">{c.nombre}</p>
                            {c.descripcion && (
                              <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">{c.descripcion}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Vigencia */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(c.fecha_inicio)} — {fmtDate(c.fecha_fin)}
                        </p>
                      </td>

                      {/* Sedes */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {(c.sedes?.length ?? 0) === 0 ? (
                          <span className="text-xs text-muted-foreground">Todas</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {(c.sedes_nombres ?? []).map((nombre, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] font-normal">{nombre}</Badge>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', estado.color)}>
                          {estado.label}
                        </span>
                      </td>

                      {/* # Ítems */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm tabular-nums text-muted-foreground">{c.items?.length ?? 0}</span>
                      </td>

                      {/* Ventas */}
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        {c.stats ? (
                          c.stats.cotizaciones_aceptadas === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div>
                              <p className="text-sm font-semibold tabular-nums text-gray-900">
                                {c.stats.cotizaciones_aceptadas} {c.stats.cotizaciones_aceptadas === 1 ? 'venta' : 'ventas'}
                              </p>
                              <p className="text-[11px] text-emerald-600 tabular-nums font-medium">
                                {Number(c.stats.monto_total).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                              </p>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => setStatsModal(c)}>
                              <BarChart2 className="h-3.5 w-3.5 mr-2" />
                              Estadísticas
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm(`¿Eliminar la campaña "${c.nombre}"?`)) {
                                  deleteMutation.mutate(c.id)
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {/* Expanded items row */}
                    {expanded && (
                      <tr key={`${c.id}-items`} className="bg-gray-50/40">
                        <td colSpan={7} className="py-0">
                          <CampanaItems campana={c} />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CampanaDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null) }}
        editing={editing}
        procedimientos={procedimientos ?? []}
        tratamientos={tratamientos ?? []}
        sedesDisponibles={sedes}
        todasCampanas={rows}
      />

      <CampanaStatsModal
        campana={statsModal}
        open={!!statsModal}
        onClose={() => setStatsModal(null)}
      />
    </div>
  )
}

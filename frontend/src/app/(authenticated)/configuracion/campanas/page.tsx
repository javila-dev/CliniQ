'use client'

import { Fragment, useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, MoreHorizontal, Pencil, Trash2, Loader2, Zap,
  ChevronRight, ChevronDown, X, Package2, Stethoscope,
  BarChart2, TrendingUp, ShoppingBag, CalendarRange, MapPin, AlertTriangle,
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
import { mensajeDeError } from '@/lib/errores'
import { cn, todayISO } from '@/lib/utils'
import { precioEnSede, precioGeneralProcedimiento } from '@/lib/precios'
import type { Campana, CampanaItem, CreateCampanaRequest, CreateCampanaItemRequest } from '@/types/campanas'
import type { Procedimiento, TratamientoCatalogo } from '@/types/clinicas'

// ─── Helpers ──────────────────────────────────────────────────

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function todayStr() {
  return todayISO()
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

type ModoPromo = 'precio' | 'pct'

interface ItemDraft {
  key:          string
  id?:          string    // backend UUID (present for existing items)
  tipo:         'procedimiento' | 'tratamiento'
  targetId:     string
  targetNombre: string
  modo:         ModoPromo // precio fijo o % de descuento sobre el precio de cada sede
  valor:        number
  cambiado?:    boolean   // ítem existente al que se le cambió el precio
}

/** Texto corto de la promoción de un ítem guardado: "$280.000" o "−10%". */
function textoPromo(item: CampanaItem): string {
  if (item.descuento_pct != null) return `−${Number(item.descuento_pct)}%`
  return item.precio_campana != null ? COP.format(parseFloat(item.precio_campana)) : '—'
}

/** "$300.000" o "$300.000 – $350.000" si cambia entre sedes. */
function rango(valores: number[]): string {
  if (valores.length === 0) return '—'
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  return min === max ? COP.format(min) : `${COP.format(min)} – ${COP.format(max)}`
}

// ─── PromociónDialog ────────────────────────────────────────────

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
  const [itemModo, setItemModo] = useState<ModoPromo>('precio')
  const [itemValor, setItemValor] = useState('')
  const [itemsError, setItemsError] = useState(false)

  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CampanaFormValues>({
    resolver: zodResolver(campanaSchema),
    defaultValues: { nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', activo: true, sedes: [] },
  })

  const selectedSedes = watch('sedes') ?? []
  // Sin sedes elegidas, la promoción aplica en todas.
  const sedesAplicables = selectedSedes.length
    ? sedesDisponibles.filter((s) => selectedSedes.includes(s.id))
    : sedesDisponibles

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
        const esPct = item.descuento_pct != null
        return {
          key:          item.id,
          id:           item.id,
          tipo:         esProcedimiento ? 'procedimiento' : 'tratamiento',
          targetId:     (item.procedimiento ?? item.tratamiento)!,
          targetNombre: (item.procedimiento_nombre ?? item.tratamiento_nombre)!,
          modo:         esPct ? 'pct' : 'precio',
          valor:        esPct ? Number(item.descuento_pct) : parseFloat(item.precio_campana ?? '0'),
        }
      }))
    } else {
      reset({ nombre: '', descripcion: '', fecha_inicio: '', fecha_fin: '', activo: true, sedes: [] })
      setItemsDraft([])
    }
    setItemTipo('procedimiento')
    setItemTargetId('')
    setItemModo('precio')
    setItemValor('')
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const payloadItem = (d: ItemDraft): CreateCampanaItemRequest => ({
    procedimiento:  d.tipo === 'procedimiento' ? d.targetId : null,
    tratamiento:    d.tipo === 'tratamiento'   ? d.targetId : null,
    precio_campana: d.modo === 'precio' ? d.valor : null,
    descuento_pct:  d.modo === 'pct' ? d.valor : null,
  })

  const createMutation = useMutation({
    mutationFn: async (values: CampanaFormValues) => {
      // Promoción e ítems en una sola llamada: si un ítem es inválido no queda
      // nada creado y reintentar no la duplica.
      const payload: CreateCampanaRequest = {
        ...values,
        descripcion: values.descripcion ?? '',
        items: itemsDraft.map(payloadItem),
      }
      await campanasApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Promoción creada')
      onOpenChange(false)
    },
    onError: (err) => toast.error('No se pudo crear la promoción', mensajeDeError(err)),
  })

  const updateMutation = useMutation({
    mutationFn: async (values: CampanaFormValues) => {
      await campanasApi.update(editing!.id, { ...values, descripcion: values.descripcion ?? '' })

      const existingIds = new Set(editing!.items.map((i) => i.id))
      const draftIds    = new Set(itemsDraft.map((d) => d.id).filter(Boolean) as string[])

      for (const item of editing!.items) {
        if (!draftIds.has(item.id)) await campanasApi.removeItem(editing!.id, item.id)
      }
      for (const draft of itemsDraft) {
        if (!draft.id || !existingIds.has(draft.id)) {
          await campanasApi.addItem(editing!.id, payloadItem(draft))
        } else if (draft.cambiado) {
          const { precio_campana, descuento_pct } = payloadItem(draft)
          await campanasApi.updateItem(editing!.id, draft.id, { precio_campana, descuento_pct })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campanas'] })
      toast.success('Promoción actualizada')
      onOpenChange(false)
    },
    onError: (err) => toast.error('No se pudo guardar la promoción', mensajeDeError(err)),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  // ── Precios del catálogo por sede ──

  function catalogo(tipo: 'procedimiento' | 'tratamiento', targetId: string) {
    if (tipo === 'procedimiento') {
      const p = procedimientos.find((x) => x.id === targetId)
      return p ? { item: p, general: precioGeneralProcedimiento(p) } : null
    }
    const t = tratamientos.find((x) => x.id === targetId)
    return t ? { item: t, general: t.precio_estimado } : null
  }

  /** Precio regular en cada sede donde aplica la promoción. */
  function preciosRegulares(tipo: 'procedimiento' | 'tratamiento', targetId: string) {
    const c = catalogo(tipo, targetId)
    if (!c) return []
    const sedes = sedesAplicables.length ? sedesAplicables : [{ id: '', nombre: 'General' }]
    return sedes
      .map((s) => ({ sede: s, precio: precioEnSede(c.item, c.general, s.id || null) }))
      .filter((x): x is { sede: { id: string; nombre: string }; precio: number } => x.precio !== null)
  }

  /** Precio de promoción en una sede (fijo, o el % sobre el precio de esa sede). */
  const precioPromo = (modo: ModoPromo, valor: number, regular: number) =>
    modo === 'pct' ? Math.round(regular * (1 - valor / 100)) : valor

  /** Sedes donde la promoción fija no mejora el precio normal: ahí no se ofrecería. */
  function sedesSinMejora(d: Pick<ItemDraft, 'tipo' | 'targetId' | 'modo' | 'valor'>) {
    if (d.modo === 'pct') return []
    return preciosRegulares(d.tipo, d.targetId).filter((r) => r.sede.id && d.valor >= r.precio)
  }

  function quitarSedes(ids: string[]) {
    const base = selectedSedes.length ? selectedSedes : sedesDisponibles.map((s) => s.id)
    setValue('sedes', base.filter((id) => !ids.includes(id)), { shouldDirty: true })
  }

  function pasarAPorcentaje(d: ItemDraft) {
    const c = catalogo(d.tipo, d.targetId)
    const general = c?.general != null ? Number(c.general) : null
    if (!general) return
    const pct = Math.max(1, Math.min(99, Math.round((1 - d.valor / general) * 100)))
    setItemsDraft((prev) => prev.map((x) => (x.key === d.key ? { ...x, modo: 'pct', valor: pct, cambiado: true } : x)))
  }

  const itemYaAgregado = !!itemTargetId && itemsDraft.some(
    (d) => d.tipo === itemTipo && d.targetId === itemTargetId
  )

  const valorNuevo = itemValor ? Number(itemValor) : null
  const valorValido = valorNuevo !== null && (itemModo === 'precio' ? valorNuevo > 0 : valorNuevo >= 1 && valorNuevo <= 99)

  function addItemToDraft() {
    if (!itemTargetId || !valorValido || itemYaAgregado || itemBloqueadoPorOtraCampana) return
    const nombre = itemTipo === 'procedimiento'
      ? procedimientos.find((p) => p.id === itemTargetId)?.nombre ?? itemTargetId
      : tratamientos.find((t) => t.id === itemTargetId)?.nombre ?? itemTargetId
    setItemsDraft((prev) => [...prev, {
      key:          crypto.randomUUID(),
      tipo:         itemTipo,
      targetId:     itemTargetId,
      targetNombre: nombre,
      modo:         itemModo,
      valor:        valorNuevo!,
    }])
    setItemsError(false)
    setItemTargetId('')
    setItemValor('')
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

  const regularesActual = itemTargetId ? preciosRegulares(itemTipo, itemTargetId) : []
  const previaNuevo = itemTargetId && valorValido
    ? regularesActual.map((r) => ({ ...r, promo: precioPromo(itemModo, valorNuevo!, r.precio) }))
    : []

  // IDs de procedimientos/tratamientos ya usados en OTRAS promociones activas hoy
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
          <DialogTitle className="text-lg">{editing ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleSubmit_withItemsCheck)} className="space-y-6">

          {/* ── Información general ── */}
          <section className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Información general</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Nombre */}
              <div className="col-span-2 space-y-1.5">
                <Label>Nombre</Label>
                <Input {...register('nombre')} placeholder="Ej. Promoción Verano 2026" />
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
                    <Label htmlFor="activo" className="cursor-pointer font-normal">Promoción activa</Label>
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

          {/* ── Ítems de promoción ── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ítems de promoción</p>
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
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">Promoción</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {itemsDraft.map((item) => {
                      const regulares = preciosRegulares(item.tipo, item.targetId)
                      const promos = regulares.map((r) => precioPromo(item.modo, item.valor, r.precio))
                      const sinMejora = sedesSinMejora(item)
                      return (
                        <Fragment key={item.key}>
                          <tr className="border-t first:border-t-0 hover:bg-muted/20 transition-colors">
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
                              {rango(regulares.map((r) => r.precio))}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <p className="tabular-nums font-semibold text-emerald-700">
                                {item.modo === 'pct' ? `−${item.valor}%` : COP.format(item.valor)}
                              </p>
                              {item.modo === 'pct' && promos.length > 0 && (
                                <p className="text-[11px] tabular-nums text-muted-foreground">{rango(promos)}</p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setItemsDraft((prev) => prev.filter((d) => d.key !== item.key))}
                                className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                aria-label={`Quitar ${item.targetNombre}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                          {sinMejora.length > 0 && (
                            <tr>
                              <td colSpan={4} className="px-4 pb-3 pt-0">
                                <div className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                                  <span className="flex items-start gap-1.5">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                    <span>
                                      En {sinMejora.map((r) => `${r.sede.nombre} (${COP.format(r.precio)})`).join(', ')} el precio normal ya es
                                      igual o menor que la promoción: ahí no se ofrecerá.
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 gap-2">
                                    <button type="button" onClick={() => quitarSedes(sinMejora.map((r) => r.sede.id))}
                                      className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100">
                                      Quitar {sinMejora.length === 1 ? sinMejora[0].sede.nombre : 'esas sedes'}
                                    </button>
                                    <button type="button" onClick={() => pasarAPorcentaje(item)}
                                      className="rounded-md border border-amber-300 bg-white px-2 py-1 font-medium hover:bg-amber-100">
                                      Usar % de descuento
                                    </button>
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
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

              {/* Selector + promoción + botón en una fila */}
              <div className="flex flex-wrap gap-2 items-start">
                <div className="flex-1 min-w-[12rem]">
                  <Select value={itemTargetId} onValueChange={setItemTargetId}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={itemTipo === 'procedimiento' ? 'Seleccionar procedimiento…' : 'Seleccionar tratamiento…'} />
                    </SelectTrigger>
                    <SelectContent>
                      {itemTipo === 'procedimiento'
                        ? procedimientos
                            .filter((p) => !itemsDraft.some((d) => d.tipo === 'procedimiento' && d.targetId === p.id))
                            .filter((p) => !procOcupados.has(p.id))
                            .map((p) => <SelectItem key={p.id} value={p.id} className="uppercase">{p.nombre}</SelectItem>)
                        : tratamientos
                            .filter((t) => !itemsDraft.some((d) => d.tipo === 'tratamiento' && d.targetId === t.id))
                            .filter((t) => !tratOcupados.has(t.id))
                            .map((t) => <SelectItem key={t.id} value={t.id} className="uppercase">{t.nombre}</SelectItem>)
                      }
                    </SelectContent>
                  </Select>
                  {itemTargetId && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {itemYaAgregado
                        ? <span className="text-destructive font-medium">Ya está en esta promoción</span>
                        : itemBloqueadoPorOtraCampana
                          ? <span className="text-destructive font-medium">
                              En promoción activa: {campanaQueBloquea?.nombre ?? '—'}
                            </span>
                          : <>Precio regular:{' '}
                              {regularesActual.length
                                ? <span className="font-medium text-foreground tabular-nums">{rango(regularesActual.map((r) => r.precio))}</span>
                                : <span className="italic">sin registrar</span>
                              }
                              {new Set(regularesActual.map((r) => r.precio)).size > 1 && ' según sede'}
                            </>
                      }
                    </p>
                  )}
                </div>

                {/* Precio fijo o % */}
                <div className="flex shrink-0 items-start gap-1.5">
                  <div className="flex rounded-md border bg-background p-0.5" role="group" aria-label="Tipo de promoción">
                    {([['precio', '$'], ['pct', '%']] as const).map(([m, simbolo]) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={itemModo === m}
                        title={m === 'precio' ? 'Precio fijo de promoción' : '% de descuento sobre el precio de cada sede'}
                        onClick={() => { setItemModo(m); setItemValor('') }}
                        className={cn(
                          'h-8 w-8 rounded text-sm font-medium transition-colors',
                          itemModo === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {simbolo}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-36">
                    {itemModo === 'precio' && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    )}
                    <Input
                      inputMode="numeric"
                      aria-label={itemModo === 'precio' ? 'Precio de promoción' : 'Porcentaje de descuento'}
                      className={cn('bg-background tabular-nums', itemModo === 'precio' ? 'pl-7' : 'pr-7 text-right')}
                      placeholder={itemModo === 'precio' ? '0' : 'Ej: 15'}
                      value={itemValor ? (itemModo === 'precio' ? Number(itemValor).toLocaleString('es-CO') : itemValor) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '')
                        setItemValor(itemModo === 'pct' ? raw.slice(0, 2) : raw.slice(0, 9))
                      }}
                    />
                    {itemModo === 'pct' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
                    )}
                  </div>
                </div>

                <Button
                  type="button"
                  variant="default"
                  disabled={!itemTargetId || !valorValido || itemYaAgregado || !!itemBloqueadoPorOtraCampana}
                  onClick={addItemToDraft}
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar
                </Button>
              </div>

              {/* Cómo queda en cada sede */}
              {previaNuevo.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {previaNuevo.map((p) => {
                    const mejora = p.promo < p.precio
                    return (
                      <span
                        key={p.sede.id || 'general'}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                          mejora ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800',
                        )}
                        title={mejora ? undefined : 'El precio normal de esta sede ya es igual o menor: ahí no se ofrecerá'}
                      >
                        {p.sede.nombre}: {COP.format(p.promo)}
                        {!mejora && <AlertTriangle className="h-3 w-3" />}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {itemsDraft.length === 0 && !itemsError && (
              <p className="text-xs text-muted-foreground italic text-center py-1">Sin ítems aún.</p>
            )}
          </section>

          <DialogFooter className="pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Guardar cambios' : 'Crear promoción'}
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
    return <p className="px-4 py-3 text-xs text-muted-foreground italic">Sin ítems en esta promoción.</p>
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
            <span className="uppercase">{item.procedimiento_nombre ?? item.tratamiento_nombre}</span>
          </div>
          <span className="font-medium tabular-nums text-emerald-700">{textoPromo(item)}</span>
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
            <span><span className="font-semibold text-foreground">{itemsVendidos}</span> ítems vendidos en total · <span className="font-semibold text-foreground">{totalItems}</span> {totalItems === 1 ? 'ítem' : 'ítems'} en promoción</span>
          </div>

          {/* Ítems */}
          {totalItems > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ítems de la promoción</p>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Precio promoción</th>
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
                            <span className="truncate max-w-[220px] uppercase">
                              {item.procedimiento_nombre ?? item.tratamiento_nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-emerald-700">
                          {textoPromo(item)}
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
      toast.success('Promoción desactivada', 'Puedes reactivarla desde Editar.')
    },
    onError: (err) => toast.error('No se pudo desactivar la promoción', mensajeDeError(err)),
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
        helpSlug="campanas-y-precios-promocionales"
        title="Promociones"
        description="Precios especiales por período para procedimientos y tratamientos."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva promoción
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
          <p className="text-sm font-medium text-muted-foreground">Sin promociones</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una promoción para ofrecer precios especiales por período.</p>
          <Button size="sm" className="mt-4" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Nueva promoción
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50/60">
                <th className="w-8" />
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Promoción</th>
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
                  <Fragment key={c.id}>
                    <tr
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
                            {/* El backend la desactiva (no la borra): conserva su historial de ventas (M1-28). */}
                            {c.activo && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm(`¿Desactivar la promoción "${c.nombre}"? Deja de aplicarse en cotizaciones nuevas.`)) {
                                      deleteMutation.mutate(c.id)
                                    }
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Desactivar
                                </DropdownMenuItem>
                              </>
                            )}
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
                  </Fragment>
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

'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, LayoutTemplate, Maximize2, Minimize2, CheckCircle2, ChevronDown, X } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { configuracionApi } from '@/lib/api/configuracion'
import { DiagramasProcedimiento } from './DiagramasProcedimiento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Procedimiento, CreateProcedimientoRequest } from '@/types/clinicas'

const schema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
  duracion_min: z.number().int().min(1, 'Duración requerida'),
  precio_base: z.number().min(0).nullable().optional(),
  descuento_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  requiere_consentimiento: z.boolean(),
  documenso_template_id: z.string().nullable().optional(),
  documenso_template_nombre: z.string().nullable().optional(),
  vigencia_meses: z.number().int().min(1).max(120),
  profesionales: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  nombre: '', descripcion: '', duracion_min: 30,
  precio_base: null, descuento_maximo_pct: 0,
  requiere_consentimiento: false, documenso_template_id: null,
  documenso_template_nombre: null, vigencia_meses: 12, profesionales: [], activo: true,
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  procedimiento?: Procedimiento | null
  /** @deprecated usa procedimiento */
  servicio?: Procedimiento | null
  onCreated?: (procedimiento: Procedimiento) => void
}

export function ProcedimientoDialog({ open, onOpenChange, procedimiento, servicio, onCreated }: Props) {
  const target = procedimiento ?? servicio ?? null
  const qc = useQueryClient()
  const isEdit = !!target
  const [createdId, setCreatedId] = useState<string | null>(null)
  const procedimientoId = target?.id ?? createdId
  const [tab, setTab] = useState<'datos' | 'zonas'>('datos')
  const [expanded, setExpanded] = useState(false)

  // Un solo precio: precio_base (con fallbacks legacy).
  function getPrecio(p: Procedimiento | null): number | null {
    if (!p) return null
    const val = p.precio_base ?? p.precio_referencia ?? p.precio
    return val ? parseFloat(val) : null
  }

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  // Fetch detalle completo al editar — la lista no incluye consentimientos_requeridos
  const { data: fullTarget } = useQuery({
    queryKey: ['procedimiento', target?.id],
    queryFn: () => clinicasApi.procedimientos.get(target!.id),
    enabled: !!target?.id && open,
  })

  useEffect(() => {
    if (!open || !target) return
    if (!fullTarget) return
    const primerConsentimiento = fullTarget.consentimientos_requeridos?.[0] ?? null
    reset({
      nombre: fullTarget.nombre,
      descripcion: fullTarget.descripcion ?? '',
      duracion_min: fullTarget.duracion_min,
      precio_base: getPrecio(fullTarget),
      descuento_maximo_pct: fullTarget.descuento_maximo_pct != null ? parseFloat(fullTarget.descuento_maximo_pct) : 0,
      requiere_consentimiento: (fullTarget.consentimientos_requeridos?.length ?? 0) > 0,
      documenso_template_id: primerConsentimiento?.template_id ?? null,
      documenso_template_nombre: primerConsentimiento?.template_nombre ?? null,
      vigencia_meses: fullTarget.vigencia_meses ?? 12,
      profesionales: fullTarget.profesionales_detalle?.map((p) => p.id) ?? [],
      activo: fullTarget.activo ?? true,
    })
  }, [open, target?.id, fullTarget])

  const requiereConsentimiento = useWatch({ control, name: 'requiere_consentimiento' })

  const { data: templates } = useQuery({
    queryKey: ['plantillas-consentimiento'],
    queryFn: () => configuracionApi.plantillasConsentimiento.list(),
    enabled: open,
  })
  const templateOptions = (templates ?? []).filter((t) => t.tiene_pdf)

  const { data: profesionales } = useQuery({
    queryKey: ['profesionales', 'catalogo-procedimiento'],
    queryFn: () => colaboradoresApi.profesionales(),
    enabled: open,
  })

  const mut = useMutation({
    mutationFn: async (data: FormValues) => {
      const selectedId = data.requiere_consentimiento ? (data.documenso_template_id ?? null) : null
      const templateId = selectedId ?? null
      const payload: CreateProcedimientoRequest = {
        nombre: data.nombre,
        descripcion: data.descripcion,
        duracion_min: data.duracion_min,
        precio_base: data.precio_base ?? null,
        precio_referencia: data.precio_base ?? null,
        descuento_maximo_pct: data.descuento_maximo_pct ?? 0,
        vigencia_meses: data.requiere_consentimiento ? data.vigencia_meses : undefined,
        profesionales: data.profesionales ?? [],
      }
      const result = isEdit
        ? await clinicasApi.procedimientos.update(target!.id, payload)
        : await clinicasApi.procedimientos.create(payload)

      // Sync consentimientos_requeridos — el backend ya no acepta template en el payload principal
      const existing = fullTarget?.consentimientos_requeridos ?? []
      if (templateId) {
        // Eliminar los que no coinciden con el seleccionado
        for (const c of existing.filter((c) => (c.template_id || c.id) !== templateId)) {
          await clinicasApi.procedimientos.consentimientos.remove(result.id, c.id)
        }
        // Agregar si aún no existe
        const yaExiste = existing.some((c) => (c.template_id || c.id) === templateId)
        if (!yaExiste) {
          await clinicasApi.procedimientos.consentimientos.add(result.id, templateId, 1)
        }
      } else {
        // Sin consentimiento: eliminar todos
        for (const c of existing) {
          await clinicasApi.procedimientos.consentimientos.remove(result.id, c.id)
        }
      }

      return result
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['procedimientos', 'all'] })
      qc.invalidateQueries({ queryKey: ['procedimiento', result.id] })
      qc.invalidateQueries({ queryKey: ['servicios', 'all'] }) // backward compat
      if (!isEdit) {
        setCreatedId(result.id)
        setTab('zonas')
        setExpanded(true)
        onCreated?.(result)
      } else {
        onCreated?.(result)
      }
    },
  })

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => { setCreatedId(null); setTab('datos'); setExpanded(false); reset(DEFAULT_VALUES); mut.reset() }, 200)
  }

  const serverError = mut.error as any
  const justCreated = !isEdit && !!createdId

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className={cn(
        'flex flex-col p-0 gap-0 overflow-hidden transition-all duration-200 max-h-[90vh]',
        expanded ? 'max-w-4xl w-full' : 'sm:max-w-xl w-full',
      )}>
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0 space-y-0">
          <DialogTitle className="text-base">
            {justCreated ? 'Procedimiento creado · Diagramas' : isEdit ? 'Editar procedimiento' : 'Nuevo procedimiento'}
          </DialogTitle>
          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="ml-auto mr-8 text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? 'Reducir' : 'Expandir'}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'datos' | 'zonas')} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="shrink-0 rounded-none border-b bg-gray-50/70 h-10 px-6 justify-start gap-1">
            <TabsTrigger value="datos" className="rounded-md text-xs px-3 h-7">Datos</TabsTrigger>
            <TabsTrigger value="zonas" disabled={!procedimientoId}
              className={cn('rounded-md text-xs px-3 h-7', !procedimientoId && 'opacity-40 cursor-not-allowed')}>
              <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />Zonas
              {!procedimientoId && <span className="ml-1.5 text-[10px] text-muted-foreground">(guarda primero)</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="datos" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none">
            {justCreated ? (
              <div className="px-6 py-8 flex flex-col items-center text-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="font-semibold">¡Procedimiento creado correctamente!</p>
                <p className="text-sm text-muted-foreground">
                  Asigna diagramas corporales desde el tab <strong>Zonas</strong>, o cierra si no los necesitas ahora.
                </p>
                <Button variant="outline" size="sm" className="mt-1" onClick={() => setTab('zonas')}>
                  <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />Ir a zonas
                </Button>
              </div>
            ) : (
              <form id="procedimiento-form" onSubmit={handleSubmit((d) => mut.mutate(d))} className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Nombre *</Label>
                  <Input {...register('nombre')} placeholder="Ej: Limpieza Facial" autoFocus />
                  {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Descripción</Label>
                  <Textarea {...register('descripcion')} placeholder="Descripción opcional..." rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Duración (min) *</Label>
                    <Controller name="duracion_min" control={control} render={({ field }) => (
                      <Input type="number" min={5} step={5} value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                    )} />
                    {errors.duracion_min && <p className="text-xs text-destructive">{errors.duracion_min.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Precio</Label>
                    <Controller name="precio_base" control={control} render={({ field }) => (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">$</span>
                        <Input inputMode="numeric" className="pl-7" placeholder="0"
                          value={field.value != null ? new Intl.NumberFormat('es-CO').format(field.value) : ''}
                          onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); field.onChange(raw ? Number(raw) : null) }}
                        />
                      </div>
                    )} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Flexibilidad de precio</Label>
                    <Controller name="descuento_maximo_pct" control={control} render={({ field }) => (
                      <Select
                        value={String(field.value ?? 0)}
                        onValueChange={(v) => field.onChange(Number(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Firme — no se puede cambiar</SelectItem>
                          <SelectItem value="5">Hasta 5% de descuento</SelectItem>
                          <SelectItem value="10">Hasta 10% de descuento</SelectItem>
                          <SelectItem value="15">Hasta 15% de descuento</SelectItem>
                          <SelectItem value="20">Hasta 20% de descuento</SelectItem>
                          <SelectItem value="25">Hasta 25% de descuento</SelectItem>
                          <SelectItem value="30">Hasta 30% de descuento</SelectItem>
                          <SelectItem value="50">Hasta 50% de descuento</SelectItem>
                          <SelectItem value="100">Libre — precio sugerido, editable</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                    <p className="text-xs text-muted-foreground">
                      Controla cuánto se puede bajar el precio al armar una cotización.
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Profesionales que lo realizan</Label>
                  <Controller name="profesionales" control={control} render={({ field }) => {
                    const selected = field.value ?? []
                    const toggle = (id: string) =>
                      field.onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
                    const opciones = profesionales ?? []
                    const seleccionados = opciones.filter((p) => selected.includes(p.colaborador_id))
                    return (
                      <div className="space-y-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="outline" className="w-full justify-between font-normal">
                              <span className={cn(!seleccionados.length && 'text-muted-foreground')}>
                                {seleccionados.length
                                  ? `${seleccionados.length} profesional${seleccionados.length > 1 ? 'es' : ''} seleccionado${seleccionados.length > 1 ? 's' : ''}`
                                  : 'Seleccionar profesionales…'}
                              </span>
                              <ChevronDown className="h-4 w-4 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start"
                            className="w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-y-auto">
                            {opciones.length === 0 ? (
                              <div className="px-2 py-3 text-xs text-muted-foreground">No hay profesionales registrados.</div>
                            ) : opciones.map((p) => (
                              <DropdownMenuCheckboxItem
                                key={p.colaborador_id}
                                checked={selected.includes(p.colaborador_id)}
                                onCheckedChange={() => toggle(p.colaborador_id)}
                                onSelect={(e) => e.preventDefault()}
                              >
                                {p.nombre_completo}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {seleccionados.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {seleccionados.map((p) => (
                              <Badge key={p.colaborador_id} variant="secondary" className="gap-1 pr-1">
                                {p.nombre_completo}
                                <button type="button" onClick={() => toggle(p.colaborador_id)}
                                  className="rounded-sm hover:bg-muted-foreground/20" aria-label={`Quitar ${p.nombre_completo}`}>
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }} />
                  <p className="text-xs text-muted-foreground">También se puede editar desde cada perfil de personal.</p>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Requiere consentimiento</p>
                    <p className="text-xs text-muted-foreground">El paciente debe firmar antes del procedimiento</p>
                  </div>
                  <Controller name="requiere_consentimiento" control={control} render={({ field }) => (
                    <input type="checkbox" checked={field.value} onChange={(e) => {
                      field.onChange(e.target.checked)
                      if (!e.target.checked) { setValue('documenso_template_id', null); setValue('documenso_template_nombre', null) }
                    }} className="h-4 w-4 accent-primary" />
                  )} />
                </div>
                {requiereConsentimiento && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Plantilla de consentimiento</Label>
                      {templateOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground rounded-lg border px-3 py-2.5">No hay plantillas de consentimiento configuradas. <a href="/configuracion/consentimientos" className="underline">Crear una</a></p>
                      ) : (
                        <Controller name="documenso_template_id" control={control} render={({ field }) => (
                          <select value={field.value ?? ''} onChange={(e) => {
                            const v = e.target.value; field.onChange(v || null)
                            setValue('documenso_template_nombre', templateOptions.find((t) => t.id === v)?.label ?? null)
                          }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                            <option value="">Seleccionar plantilla…</option>
                            {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.label || t.nombre}</option>)}
                          </select>
                        )} />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>Vigencia (meses) *</Label>
                      <Controller name="vigencia_meses" control={control} render={({ field }) => (
                        <div className="flex items-center gap-2">
                          <Input type="number" min={1} max={120} className="w-24" value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
                          <span className="text-sm text-muted-foreground">meses</span>
                        </div>
                      )} />
                    </div>
                  </>
                )}
                {isEdit && (
                  <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Activo</p>
                      <p className="text-xs text-muted-foreground">Los procedimientos inactivos no aparecen en nuevas citas</p>
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
            )}
          </TabsContent>

          <TabsContent value="zonas" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none">
            {procedimientoId
              ? <div className="p-5"><DiagramasProcedimiento servicioId={procedimientoId} /></div>
              : <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <LayoutTemplate className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Guarda el procedimiento primero para asignar diagramas.</p>
                </div>
            }
          </TabsContent>
        </Tabs>

        <div className="shrink-0 border-t px-6 py-4 flex justify-between items-center bg-white">
          {tab === 'zonas' && procedimientoId
            ? <p className="text-xs text-muted-foreground">Los cambios se guardan automáticamente.</p>
            : <span />}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} disabled={mut.isPending}>
              {justCreated ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!justCreated && (
              <Button form="procedimiento-form" type="submit" disabled={mut.isPending}>
                {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isEdit ? 'Guardar cambios' : 'Crear procedimiento'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

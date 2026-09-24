'use client'

import { useState, useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ChevronDown, X, Check, Search, LayoutTemplate, Maximize2, Minimize2, CheckCircle2, Info } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { colaboradoresApi } from '@/lib/api/colaboradores'
import { configuracionApi } from '@/lib/api/configuracion'
import { useAuthStore } from '@/store/authStore'
import { toast } from '@/hooks/use-toast'
import { DiagramasProcedimiento } from './DiagramasProcedimiento'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn, toTitleCase, scrollWheelFallback } from '@/lib/utils'
import type { Procedimiento, CreateProcedimientoRequest } from '@/types/clinicas'
import type { ColaboradorProfesional } from '@/types/colaboradores'

const schema = z.object({
  nombre: z.string().min(1, 'Requerido'),
  descripcion: z.string().optional(),
  duracion_min: z.number().int().min(1, 'Duración requerida'),
  precio_base: z.number().min(0).nullable().optional(),
  descuento_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  requiere_consentimiento: z.boolean(),
  documenso_template_id: z.string().nullable().optional(),
  documenso_template_nombre: z.string().nullable().optional(),
  consentimiento_cada_vez: z.boolean(),
  vigencia_meses: z.number().int().min(1).max(120),
  profesionales: z.array(z.string()).optional(),
  activo: z.boolean().optional(),
})
type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  nombre: '', descripcion: '', duracion_min: 30,
  precio_base: null, descuento_maximo_pct: 0,
  requiere_consentimiento: false, documenso_template_id: null,
  documenso_template_nombre: null, consentimiento_cada_vez: false,
  vigencia_meses: 12, profesionales: [], activo: true,
}

const ETIQUETAS_DE_ERROR: Record<string, string> = {
  nombre: 'Nombre', duracion_min: 'Duración', precio_base: 'Precio',
  descuento_maximo_pct: 'Descuento máximo', profesionales: 'Profesionales',
  documenso_template_id: 'Plantilla de consentimiento', vigencia_meses: 'Vigencia',
}

function ProfesionalesMultiSelect({ opciones, selected, onChange }: {
  opciones: ColaboradorProfesional[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtradas = q ? opciones.filter((p) => p.nombre_completo.toLowerCase().includes(q)) : opciones
  const seleccionados = opciones.filter((p) => selected.includes(p.colaborador_id))
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between font-normal">
            <span className={cn(!seleccionados.length && 'text-muted-foreground')}>
              {seleccionados.length
                ? `${seleccionados.length} profesional${seleccionados.length > 1 ? 'es' : ''} seleccionado${seleccionados.length > 1 ? 's' : ''}`
                : 'Seleccionar profesionales…'}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden">
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar profesional..."
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1" onWheel={scrollWheelFallback}>
            {opciones.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">No hay profesionales registrados.</p>
            ) : filtradas.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground text-center">Sin resultados</p>
            ) : filtradas.map((p) => {
              const marcado = selected.includes(p.colaborador_id)
              return (
                <button
                  key={p.colaborador_id}
                  type="button"
                  onClick={() => toggle(p.colaborador_id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', marcado ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{toTitleCase(p.nombre_completo)}</span>
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
      {seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionados.map((p) => (
            <Badge key={p.colaborador_id} variant="secondary" className="gap-1 pr-1">
              {toTitleCase(p.nombre_completo)}
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
}

function LabelConAyuda({ children, ayuda }: { children: React.ReactNode; ayuda: string }) {
  return (
    <Label className="inline-flex items-center gap-1">
      {children}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px]">{ayuda}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </Label>
  )
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  procedimiento?: Procedimiento | null
  /** @deprecated usa procedimiento */
  servicio?: Procedimiento | null
  /** Se llama con cada procedimiento creado. Si se pasa, el modal crea uno solo y se cierra
   *  (p. ej. al crear un procedimiento desde un tratamiento). */
  onCreated?: (procedimiento: Procedimiento) => void
}

export function ProcedimientoDialog({ open, onOpenChange, procedimiento, servicio, onCreated }: Props) {
  const target = procedimiento ?? servicio ?? null
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isEdit = !!target
  const [tab, setTab] = useState<'datos' | 'zonas'>('datos')
  const [expanded, setExpanded] = useState(false)
  // Nombres creados con "Guardar y agregar otro" en esta apertura del modal.
  const [creados, setCreados] = useState<string[]>([])
  const permiteAgregarOtro = !isEdit && !onCreated
  // Con el filtro por procedimiento, un procedimiento sin profesionales no se puede agendar:
  // en ese caso la asignación deja de ser secundaria y se muestra a la vista.
  const filtroActivo = Boolean(user?.filtrar_profesionales_por_procedimiento)

  // Un solo precio: precio_base (con fallbacks legacy).
  function getPrecio(p: Procedimiento | null): number | null {
    if (!p) return null
    const val = p.precio_base ?? p.precio_referencia ?? p.precio
    return val ? parseFloat(val) : null
  }

  const { register, control, handleSubmit, reset, setValue, setFocus, formState: { errors } } = useForm<FormValues>({
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
      consentimiento_cada_vez: primerConsentimiento?.requiere_firma_cada_vez ?? false,
      vigencia_meses: fullTarget.vigencia_meses ?? 12,
      profesionales: fullTarget.profesionales_detalle?.map((p) => p.id) ?? [],
      activo: fullTarget.activo ?? true,
    })
  }, [open, target?.id, fullTarget])

  const requiereConsentimiento = useWatch({ control, name: 'requiere_consentimiento' })
  const consentimientoCadaVez = useWatch({ control, name: 'consentimiento_cada_vez' })

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
    mutationFn: async ({ data }: { data: FormValues; otro: boolean }) => {
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
        // Crea o actualiza la relación (incluye el modo de firma, que puede haber cambiado)
        await clinicasApi.procedimientos.consentimientos.add(result.id, templateId, 1, data.consentimiento_cada_vez)
      } else {
        // Sin consentimiento: eliminar todos
        for (const c of existing) {
          await clinicasApi.procedimientos.consentimientos.remove(result.id, c.id)
        }
      }

      return result
    },
    onSuccess: (result, { otro }) => {
      qc.invalidateQueries({ queryKey: ['procedimientos', 'all'] })
      qc.invalidateQueries({ queryKey: ['procedimiento', result.id] })
      qc.invalidateQueries({ queryKey: ['servicios', 'all'] }) // backward compat
      qc.invalidateQueries({ queryKey: ['setup-checklist'] })
      onCreated?.(result)
      if (isEdit) {
        handleClose()
      } else if (otro) {
        // Se queda abierto y en blanco para cargar el siguiente.
        setCreados((previos) => [...previos, result.nombre])
        reset(DEFAULT_VALUES)
        setTimeout(() => setFocus('nombre'), 0)
      } else {
        toast.success('Procedimiento creado')
        handleClose()
      }
    },
  })

  function handleClose() {
    onOpenChange(false)
    setTimeout(() => { setTab('datos'); setExpanded(false); setCreados([]); reset(DEFAULT_VALUES); mut.reset() }, 200)
  }

  const erroresDelServidor: string[] = (() => {
    if (!mut.error) return []
    const data = (mut.error as any)?.response?.data
    if (!data) return ['Ocurrió un error. Intenta de nuevo.']
    if (data.detail) return [String(data.detail)]
    const lineas = Object.entries(data).map(
      ([campo, mensaje]) => `${ETIQUETAS_DE_ERROR[campo] ?? campo}: ${Array.isArray(mensaje) ? mensaje[0] : mensaje}`,
    )
    return lineas.length ? lineas : ['Ocurrió un error. Intenta de nuevo.']
  })()

  const campoProfesionales = (
    <div className="space-y-1.5">
      <Label>Profesionales que lo realizan</Label>
      <Controller name="profesionales" control={control} render={({ field }) => (
        <ProfesionalesMultiSelect
          opciones={profesionales ?? []}
          selected={field.value ?? []}
          onChange={field.onChange}
        />
      )} />
      <p className="text-xs text-muted-foreground">
        {filtroActivo
          ? 'Tu clínica solo ofrece al agendar a los profesionales asociados. Sin ninguno, este procedimiento no se puede agendar.'
          : 'Opcional. También se puede editar desde cada perfil de personal.'}
      </p>
    </div>
  )

  const formulario = (
    <form
      id="procedimiento-form"
      onSubmit={handleSubmit((data) => mut.mutate({ data, otro: false }))}
      className="px-6 py-5 space-y-4"
    >
      {creados.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Creados ahora: <strong className="font-medium">{creados.join(', ')}</strong></span>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Nombre *</Label>
        <Input {...register('nombre')} placeholder="Ej: Limpieza Facial" autoFocus />
        {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Descripción</Label>
        <Textarea {...register('descripcion')} placeholder="Descripción opcional..." rows={2} />
      </div>

      <div className="grid grid-cols-[6rem_1fr_6.5rem] gap-3 items-start">
        <div className="space-y-1.5">
          <LabelConAyuda ayuda="Duración del procedimiento: el bloque de tiempo que la agenda reserva para esta cita.">
            Minutos *
          </LabelConAyuda>
          <Controller name="duracion_min" control={control} render={({ field }) => (
            <Input type="number" min={5} max={999} step={5} value={field.value}
              onChange={(e) => field.onChange(Math.min(999, Number(e.target.value)))} />
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
                onChange={(e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 8); field.onChange(raw ? Number(raw) : null) }}
              />
            </div>
          )} />
        </div>
        <div className="space-y-1.5">
          <LabelConAyuda ayuda="Cuánto se puede bajar el precio al armar una cotización. 0 = sin descuento.">
            Descuento
          </LabelConAyuda>
          <Controller name="descuento_maximo_pct" control={control} render={({ field }) => (
            <div className="relative">
              <Input inputMode="numeric" className="pr-6" placeholder="0"
                value={field.value ?? 0}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '').slice(0, 3)
                  field.onChange(raw ? Math.min(100, Number(raw)) : 0)
                }}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none select-none">%</span>
            </div>
          )} />
        </div>
      </div>

      {campoProfesionales}

      <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-medium">Requiere consentimiento</p>
          <p className="text-xs text-muted-foreground">El paciente debe firmar antes del procedimiento</p>
        </div>
        <Controller name="requiere_consentimiento" control={control} render={({ field }) => (
          <input type="checkbox" checked={field.value} onChange={(e) => {
            field.onChange(e.target.checked)
            if (!e.target.checked) { setValue('documenso_template_id', null); setValue('documenso_template_nombre', null) }
          }} className="h-4 w-4 accent-primary shrink-0" />
        )} />
      </div>
      {requiereConsentimiento && (
        <div className="rounded-lg border px-4 py-3 space-y-2.5">
          <LabelConAyuda ayuda="Con firma cada vez, ninguna firma anterior cuenta: se exige una nueva en cada cita de este procedimiento, sin importar la vigencia.">
            Frecuencia de firma
          </LabelConAyuda>
          <Controller name="consentimiento_cada_vez" control={control} render={({ field }) => (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => field.onChange(false)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-left transition-colors',
                  !field.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <p className="text-sm font-medium">Válido por vigencia</p>
                <p className="text-xs text-muted-foreground">Se reutiliza mientras no venza</p>
              </button>
              <button
                type="button"
                onClick={() => field.onChange(true)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-left transition-colors',
                  field.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <p className="text-sm font-medium">Firmar cada vez</p>
                <p className="text-xs text-muted-foreground">Una firma nueva en cada cita</p>
              </button>
            </div>
          )} />
          {!consentimientoCadaVez && (
            <div className="flex items-center gap-2 pt-0.5">
              <Label className="text-xs shrink-0">Vigencia *</Label>
              <Controller name="vigencia_meses" control={control} render={({ field }) => (
                <Input type="number" min={1} max={120} className="h-8 w-20" value={field.value} onChange={(e) => field.onChange(Number(e.target.value))} />
              )} />
              <span className="text-sm text-muted-foreground">meses</span>
            </div>
          )}
        </div>
      )}
      {requiereConsentimiento && (
        <div className="space-y-1.5">
          <Label>Plantilla de consentimiento</Label>
          {templateOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-lg border px-3 py-2.5">No hay plantillas de consentimiento configuradas. <a href="/configuracion/consentimientos" target="_blank" rel="noopener noreferrer" className="underline">Crear una (se abre en otra pestaña)</a></p>
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

      {erroresDelServidor.length > 0 && (
        <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5 space-y-0.5">
          {erroresDelServidor.map((linea) => (
            <p key={linea} className="text-sm text-destructive">{linea}</p>
          ))}
        </div>
      )}
    </form>
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className={cn(
        'flex flex-col p-0 gap-0 overflow-hidden transition-all duration-200 max-h-[90vh]',
        expanded ? 'max-w-4xl w-full' : 'sm:max-w-xl w-full',
      )}>
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b shrink-0 space-y-0">
          <DialogTitle className="text-base">
            {isEdit ? 'Editar procedimiento' : 'Nuevo procedimiento'}
          </DialogTitle>
          {isEdit && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="ml-auto mr-8 text-muted-foreground hover:text-foreground transition-colors"
              title={expanded ? 'Reducir' : 'Expandir'}>
              {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </DialogHeader>

        {isEdit ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'datos' | 'zonas')} className="flex flex-col flex-1 overflow-hidden">
            <TabsList className="shrink-0 rounded-none border-b bg-gray-50/70 h-10 px-6 justify-start gap-1">
              <TabsTrigger value="datos" className="rounded-md text-xs px-3 h-7">Datos</TabsTrigger>
              <TabsTrigger value="zonas" className="rounded-md text-xs px-3 h-7">
                <LayoutTemplate className="h-3.5 w-3.5 mr-1.5" />Zonas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="datos" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none">
              {formulario}
            </TabsContent>

            <TabsContent value="zonas" className="flex-1 overflow-y-auto mt-0 focus-visible:outline-none">
              <div className="p-5"><DiagramasProcedimiento servicioId={target!.id} /></div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 overflow-y-auto">{formulario}</div>
        )}

        <div className="shrink-0 border-t px-6 py-4 flex justify-between items-center bg-white">
          {isEdit && tab === 'zonas'
            ? <p className="text-xs text-muted-foreground">Los cambios se guardan automáticamente.</p>
            : <span />}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose} disabled={mut.isPending}>
              {creados.length > 0 ? 'Cerrar' : 'Cancelar'}
            </Button>
            {permiteAgregarOtro && (
              <Button
                type="button"
                variant="outline"
                disabled={mut.isPending}
                onClick={handleSubmit((data) => mut.mutate({ data, otro: true }))}
              >
                Guardar y agregar otro
              </Button>
            )}
            <Button form="procedimiento-form" type="submit" disabled={mut.isPending}>
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear procedimiento'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

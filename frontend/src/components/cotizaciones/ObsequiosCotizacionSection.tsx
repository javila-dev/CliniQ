'use client'

import { useState } from 'react'
import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift, Loader2, PackageCheck, Plus, Undo2, X, Stethoscope, Package2 } from 'lucide-react'
import { BuscadorPopover, type OpcionBuscadorPopover as Opcion } from '@/components/ui/buscador-popover'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { clinicasApi } from '@/lib/api/clinicas'
import { inventarioApi } from '@/lib/api/inventario'
import { useAuthStore } from '@/store/authStore'
import { useUserSedes } from '@/hooks/useUserSedes'
import { toast } from '@/hooks/use-toast'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn, formatDateTime } from '@/lib/utils'
import type { Procedimiento, TratamientoCatalogo } from '@/types/clinicas'
import type { Cotizacion, ItemCotizacion as ItemCotizacionApi } from '@/types/cotizaciones'
import type { FormValues } from './CotizacionForm'

type ItemForm = FormValues['items'][number]

export type ModoObsequio = 'procedimiento' | 'clon' | 'informativo' | 'producto'

const MODO_LABEL: Record<Exclude<ModoObsequio, 'producto'>, string> = {
  procedimiento: 'Procedimiento del catálogo',
  clon: 'Sesión adicional de un tratamiento cotizado',
  informativo: 'Solo informativo',
}

function cop(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

/** Cantidad legible de un obsequio ya guardado (datos del servidor, no del formulario). */
function cantidadTextoApi(item: ItemCotizacionApi): string {
  if (item.tipo === 'insumo') {
    const n = Number(item.cantidad_insumo ?? 0)
    const cantidad = n.toLocaleString('es-CO', { maximumFractionDigits: 3 })
    const unidad = item.insumo_unidad === 'unidad' ? 'und.' : item.insumo_unidad ?? ''
    return `${cantidad} ${unidad}`.trim()
  }
  return `${item.num_citas} ${item.num_citas === 1 ? 'sesión' : 'sesiones'}`
}

/** Mensaje del backend (`error`) o uno genérico si la respuesta no lo trae. */
function mensajeError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data
  return data?.error ?? data?.detail ?? fallback
}

export function nuevaClave(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Forma en que se muestra/edita un obsequio: la elegida en la fila (`_modo`) o,
 * al cargar una cotización guardada, la deducida de sus campos.
 */
export function modoDe(item: ItemForm | undefined): ModoObsequio {
  if (item?._modo) return item._modo
  if (item?.tipo === 'insumo') return 'producto'
  if (item?.tipo === 'procedimiento') return 'procedimiento'
  return item?.tipo_sesion_origen || item?.agendable ? 'clon' : 'informativo'
}

/** Fila nueva de obsequio, lista para `append` del useFieldArray. */
export function nuevoObsequio(modo: 'sesion' | 'producto'): ItemForm {
  const base = {
    descripcion: '',
    num_citas: 1,
    duracion_estimada: '',
    periodicidad: '',
    valor_unitario: 0,
    descuento_porcentaje: 0,
    precio_bloqueado: false,
    tratamiento: null,
    procedimiento: null,
    es_obsequio: true,
    valor_referencia: 0,
    tipo_sesion_origen: null,
    origen_clave: null,
    insumo: null,
    insumo_nombre: null,
    insumo_unidad: null,
    insumo_stock: null,
    cantidad_insumo: null,
    _clave: nuevaClave(),
  }
  return modo === 'producto'
    ? { ...base, tipo: 'insumo', agendable: false, _modo: 'producto' }
    : { ...base, tipo: 'procedimiento', agendable: true, _modo: 'procedimiento' }
}

// ── Selector con búsqueda ──────────────────────────────────────────────────────

function InsumoBuscador({
  etiqueta, sedeId, onSelect, invalido,
}: {
  etiqueta: string | null | undefined
  sedeId: string | null
  onSelect: (insumo: { id: string; nombre: string; unidad: string; stock: string; precio: number }) => void
  invalido?: boolean
}) {
  const [q, setQ] = useState('')
  const { data, isFetching, isError } = useQuery({
    queryKey: ['insumos-obsequio', sedeId ?? null, q],
    queryFn: () => inventarioApi.listInsumos({ search: q || undefined, sede: sedeId ?? undefined, activo: true, page_size: 20 }),
    staleTime: 60_000,
  })
  const insumos = data?.results ?? []

  if (isError) {
    return <p className="text-xs text-destructive">No se pudo cargar el inventario.</p>
  }

  return (
    <BuscadorPopover
      etiqueta={etiqueta}
      placeholder="Seleccionar producto…"
      icono={Package2}
      cargando={isFetching}
      onBuscar={setQ}
      invalido={invalido}
      opciones={insumos.map((i) => ({
        id: i.id,
        label: i.nombre,
        hint: sedeId ? `${Number(i.stock_actual).toLocaleString('es-CO', { maximumFractionDigits: 2 })} ${i.unidad_medida}` : i.unidad_medida,
      }))}
      onSelect={(id) => {
        const i = insumos.find((x) => x.id === id)
        if (i) onSelect({ id: i.id, nombre: i.nombre, unidad: i.unidad_medida, stock: i.stock_actual, precio: i.precio_venta ? parseFloat(i.precio_venta) : 0 })
      }}
    />
  )
}

// ── Sección ────────────────────────────────────────────────────────────────────

interface Props {
  control: Control<FormValues>
  register: UseFormRegister<FormValues>
  setValue: UseFormSetValue<FormValues>
  itemFields: { id: string }[]
  items: FormValues['items']
  errors: FieldErrors<FormValues>
  soloLectura: boolean
  procedimientos: Procedimiento[]
  sedeId: string | null
  onAdd: (item: ItemForm) => void
  onRemove: (idx: number) => void
  /** Cotización guardada: en modo lectura se usa para mostrar la entrega de
   *  productos y su estado (datos que el formulario no guarda en su propio estado). */
  cotizacion?: Cotizacion | null
}

export function ObsequiosCotizacionSection({
  control, register, setValue, itemFields, items, errors, soloLectura,
  procedimientos, sedeId, onAdd, onRemove, cotizacion,
}: Props) {
  // ── Entrega de obsequios de producto (solo aplica en modo lectura, con la
  // cotización ya guardada) ───────────────────────────────────────────────
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { sedes } = useUserSedes()
  const puedeEntregar = hasPermission(user, PERM.INVENTARIO_CONSUMO_REGISTRAR)
  const puedeRevertir = hasPermission(user, PERM.INVENTARIO_CONSUMO_ELIMINAR)
  const [entregando, setEntregando] = useState<ItemCotizacionApi | null>(null)
  const [sedeEntrega, setSedeEntrega] = useState('')
  const [revirtiendo, setRevirtiendo] = useState<ItemCotizacionApi | null>(null)

  function refrescarInventario() {
    if (!cotizacion) return
    queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacion.id] })
    queryClient.invalidateQueries({ queryKey: ['kardex'] })
    queryClient.invalidateQueries({ queryKey: ['insumos'] })
  }

  const { mutate: entregar, isPending: entregandoPendiente } = useMutation({
    mutationFn: ({ itemId, sede }: { itemId: string; sede: string }) =>
      cotizacionesApi.entregarObsequio(cotizacion!.id, itemId, { sede }),
    onSuccess: (item) => {
      toast.success('Obsequio entregado', `${item.insumo_nombre ?? item.descripcion} descontado del inventario.`)
      setEntregando(null)
      refrescarInventario()
    },
    onError: (err) => toast.error('No se pudo entregar', mensajeError(err, 'Vuelve a intentarlo en un momento.')),
  })

  const { mutate: revertir, isPending: revirtiendoPendiente } = useMutation({
    mutationFn: (itemId: string) => cotizacionesApi.revertirEntregaObsequio(cotizacion!.id, itemId),
    onSuccess: () => {
      toast.success('Entrega revertida', 'El stock se devolvió al inventario.')
      setRevirtiendo(null)
      refrescarInventario()
    },
    onError: (err) => toast.error('No se pudo revertir', mensajeError(err, 'Vuelve a intentarlo en un momento.')),
  })

  function abrirEntrega(item: ItemCotizacionApi) {
    const porDefecto = cotizacion?.sede ?? sedes[0]?.id ?? ''
    setSedeEntrega(sedes.some((s) => s.id === porDefecto) ? porDefecto : sedes[0]?.id ?? '')
    setEntregando(item)
  }
  // El listado de tratamientos activos no trae los tipos de sesión: se piden por
  // tratamiento cotizado (detalle) para ofrecer las sesiones que se pueden clonar.
  const idsTratamientos = [...new Set(
    items
      .filter((it) => !it.es_obsequio && it.tipo === 'tratamiento' && it.tratamiento)
      .map((it) => it.tratamiento as string),
  )]
  const detalles = useQueries({
    queries: idsTratamientos.map((id) => ({
      queryKey: ['tratamiento-detalle', id],
      queryFn: () => clinicasApi.tratamientos.get(id),
      staleTime: 5 * 60_000,
    })),
  })
  const catalogoPorId = new Map<string, TratamientoCatalogo>()
  detalles.forEach((q) => { if (q.data) catalogoPorId.set(q.data.id, q.data) })

  const filas = itemFields
    .map((f, idx) => ({ field: f, idx }))
    .filter(({ idx }) => items[idx]?.es_obsequio)
  // En lectura con la cotización guardada se usan sus datos directamente (incluye
  // la entrega, que el formulario no guarda en su propio estado).
  const obsequiosGuardados = cotizacion?.items.filter((i) => i.es_obsequio) ?? []
  const vacioEnLectura = soloLectura && (cotizacion ? obsequiosGuardados.length === 0 : filas.length === 0)

  if (vacioEnLectura) return null

  /** Tipos de sesión de los tratamientos cotizados (ítems pagados de tipo tratamiento). */
  function opcionesClon(soloCompromiso: boolean): Opcion[] {
    const opciones: Opcion[] = []
    items.forEach((it) => {
      if (it.es_obsequio || it.tipo !== 'tratamiento' || !it.tratamiento || !it._clave) return
      const catalogo = catalogoPorId.get(it.tratamiento)
      ;(catalogo?.tipos_sesion ?? [])
        .filter((ts) => !soloCompromiso || ts.es_compromiso)
        .forEach((ts) => opciones.push({
          id: `${it._clave}::${ts.id}`,
          label: ts.nombre,
          sublabel: catalogo.nombre,
          hint: ts.es_compromiso ? undefined : 'sin compromiso',
        }))
    })
    return opciones
  }

  function cambiarModo(idx: number, modo: Exclude<ModoObsequio, 'producto'>) {
    setValue(`items.${idx}._modo`, modo, { shouldDirty: true })
    setValue(`items.${idx}.tipo`, modo === 'procedimiento' ? 'procedimiento' : 'libre', { shouldDirty: true })
    setValue(`items.${idx}.procedimiento`, null, { shouldDirty: true })
    setValue(`items.${idx}.tipo_sesion_origen`, null, { shouldDirty: true })
    setValue(`items.${idx}.origen_clave`, null, { shouldDirty: true })
    setValue(`items.${idx}.descripcion`, '', { shouldDirty: true })
    setValue(`items.${idx}.valor_referencia`, 0, { shouldDirty: true })
    setValue(`items.${idx}.agendable`, modo !== 'informativo', { shouldDirty: true })
  }

  function elegirProcedimiento(idx: number, p: Procedimiento) {
    setValue(`items.${idx}.procedimiento`, p.id, { shouldDirty: true })
    setValue(`items.${idx}.descripcion`, p.nombre, { shouldDirty: true })
    const precio = p.precio_base ?? p.precio_referencia
    setValue(`items.${idx}.valor_referencia`, precio ? parseFloat(precio) : 0, { shouldDirty: true })
  }

  function elegirClon(idx: number, valor: string) {
    const [clave, tipoId] = valor.split('::')
    const origen = items.find((it) => it._clave === clave)
    const catalogo = origen?.tratamiento ? catalogoPorId.get(origen.tratamiento) : undefined
    const tipo = catalogo?.tipos_sesion?.find((ts) => ts.id === tipoId)
    if (!catalogo || !tipo) return
    setValue(`items.${idx}.origen_clave`, clave, { shouldDirty: true })
    setValue(`items.${idx}.tipo_sesion_origen`, tipo.id, { shouldDirty: true })
    setValue(`items.${idx}.descripcion`, tipo.nombre, { shouldDirty: true })
    // Referencia aproximada: precio del tratamiento repartido entre sus sesiones.
    const total = catalogo.total_sesiones > 0 ? catalogo.total_sesiones : 1
    const precio = catalogo.precio_estimado ? Math.round(parseFloat(catalogo.precio_estimado) / total) : 0
    setValue(`items.${idx}.valor_referencia`, precio, { shouldDirty: true })
  }

  function cambiarAgendable(idx: number, agendable: boolean) {
    const it = items[idx]
    setValue(`items.${idx}.agendable`, agendable, { shouldDirty: true })
    if (!agendable || !it?.tipo_sesion_origen) return
    // Una sesión agendable solo puede clonar un tipo de sesión de compromiso.
    const permitido = opcionesClon(true).some((o) => o.id === `${it.origen_clave}::${it.tipo_sesion_origen}`)
    if (!permitido) {
      setValue(`items.${idx}.tipo_sesion_origen`, null, { shouldDirty: true })
      setValue(`items.${idx}.origen_clave`, null, { shouldDirty: true })
      setValue(`items.${idx}.descripcion`, '', { shouldDirty: true })
    }
  }

  const valorTotal = soloLectura && cotizacion
    ? obsequiosGuardados.reduce(
        (acc, i) => acc + Number(i.valor_referencia ?? 0) * (i.tipo === 'insumo' ? 1 : (i.num_citas || 1)),
        0,
      )
    : filas.reduce(
        (acc, { idx }) => acc + (items[idx]?.valor_referencia || 0) * (items[idx]?.tipo === 'insumo' ? 1 : (items[idx]?.num_citas || 1)),
        0,
      )
  const porEntregar = cotizacion?.estado === 'aceptada'
    ? obsequiosGuardados.filter((i) => i.tipo === 'insumo' && !i.entregado_at).length
    : 0

  return (
    <div className="border-b last:border-b-0">
      <div className="px-5 py-3 bg-amber-50/60 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gift className="h-3.5 w-3.5 text-amber-700" />
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Obsequios</p>
          {valorTotal > 0 && (
            <span className="text-[11px] text-amber-700 ml-2">valor de referencia {cop(valorTotal)} · sin costo</span>
          )}
          {porEntregar > 0 && (
            <span className="text-[11px] font-medium text-amber-800 ml-2">· {porEntregar} por entregar</span>
          )}
        </div>
        {!soloLectura && (
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-primary"
              onClick={() => onAdd(nuevoObsequio('sesion'))}>
              <Plus className="h-3.5 w-3.5 mr-1" />Sesión
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-primary"
              onClick={() => onAdd(nuevoObsequio('producto'))}>
              <Plus className="h-3.5 w-3.5 mr-1" />Producto
            </Button>
          </div>
        )}
      </div>

      <div className="divide-y">
        {!soloLectura && filas.length === 0 && (
          <p className="px-5 py-3 text-xs text-muted-foreground italic">
            Sin obsequios — usa Sesión o Producto para agregar uno. No suman al total.
          </p>
        )}

        {soloLectura && cotizacion && obsequiosGuardados.map((item) => {
          const esProducto = item.tipo === 'insumo'
          const entregado = !!item.entregado_at
          const valorRef = Number(item.valor_referencia ?? 0)
          const stock = item.stock_disponible != null ? Number(item.stock_disponible) : null
          const stockInsuficiente = esProducto && !entregado && stock !== null && stock < Number(item.cantidad_insumo ?? 0)
          const cotizacionAceptada = cotizacion.estado === 'aceptada'

          return (
            <div key={item.id} className="px-5 py-3 flex items-start justify-between gap-3 text-xs">
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-medium truncate">{item.descripcion}</p>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-800">
                    {esProducto ? 'Producto' : item.agendable ? 'Sesión adicional' : 'Cortesía'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cantidadTextoApi(item)}
                  {valorRef > 0 && <> · valor de referencia <span className="line-through">{cop(valorRef)}</span></>}
                </p>
                {!esProducto && item.agendable && (
                  <p className="text-xs text-muted-foreground">
                    {item.item_origen
                      ? 'Suma a las sesiones del tratamiento: se agenda desde el seguimiento de sesiones.'
                      : 'Se agenda desde el seguimiento de sesiones.'}
                  </p>
                )}
                {!esProducto && !item.agendable && (
                  <p className="text-xs text-muted-foreground">Incluido sin costo. No consume sesiones.</p>
                )}
                {esProducto && entregado && (
                  <p className="text-xs text-green-700">
                    Entregado el {formatDateTime(item.entregado_at!)}
                    {item.entregado_por_nombre ? ` por ${item.entregado_por_nombre}` : ''}
                    {item.sede_entrega_nombre ? ` · ${item.sede_entrega_nombre}` : ''}
                  </p>
                )}
                {stockInsuficiente && (
                  <p className="text-xs text-amber-700">
                    Stock en la sede de la cotización: {stock} {item.insumo_unidad}. Puede no alcanzar para entregarlo.
                  </p>
                )}
              </div>

              <div className="text-right shrink-0 space-y-1">
                {esProducto && cotizacionAceptada ? (
                  <>
                    {!entregado && puedeEntregar && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirEntrega(item)}>
                        <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                        Entregar
                      </Button>
                    )}
                    {!entregado && !puedeEntregar && (
                      <span className="text-xs text-muted-foreground">Pendiente de entrega</span>
                    )}
                    {entregado && puedeRevertir && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setRevirtiendo(item)}>
                        <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                        Revertir
                      </Button>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-semibold text-amber-700">Obsequio</span>
                )}
              </div>
            </div>
          )
        })}

        {soloLectura && !cotizacion && filas.map(({ field, idx }) => {
          const item = items[idx]
          return (
            <div key={field.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="truncate">{item?.descripcion}</p>
                <p className="text-xs text-muted-foreground">
                  {item?.tipo === 'insumo'
                    ? `${item?.cantidad_insumo ?? ''} ${item?.insumo_unidad ?? ''}`.trim()
                    : `${item?.num_citas ?? 1} ${item?.agendable ? 'sesión(es) agendable(s)' : '· incluido'}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                {(item?.valor_referencia ?? 0) > 0 && (
                  <span className="text-xs text-muted-foreground line-through mr-2">{cop(item!.valor_referencia!)}</span>
                )}
                <span className="text-xs font-semibold text-amber-700">Obsequio</span>
              </div>
            </div>
          )
        })}

        {!soloLectura && filas.map(({ field, idx }) => {
          const item = items[idx]
          const modo = modoDe(item)
          const err = errors.items?.[idx]
          const esProducto = modo === 'producto'
          const cantidad = item?.cantidad_insumo ?? 0
          const stock = item?.insumo_stock != null ? parseFloat(item.insumo_stock) : null
          const stockInsuficiente = esProducto && stock !== null && cantidad > stock
          const origenFaltante = modo === 'clon' && item?.origen_clave &&
            !items.some((it) => it._clave === item.origen_clave && !it.es_obsequio && it.tipo === 'tratamiento')

          return (
            <div key={field.id} className="px-5 py-3 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1.3fr)_140px_90px_130px_36px] gap-3 items-start">
              {/* Origen / forma del obsequio */}
              <div>
                <p className="text-xs text-muted-foreground md:hidden mb-1">Tipo</p>
                {esProducto ? (
                  <span className="flex h-8 items-center gap-1.5 text-xs text-muted-foreground">
                    <Package2 className="h-3 w-3" />Producto del inventario
                  </span>
                ) : (
                  <Select value={modo} onValueChange={(v) => cambiarModo(idx, v as Exclude<ModoObsequio, 'producto'>)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MODO_LABEL) as Exclude<ModoObsequio, 'producto'>[]).map((m) => (
                        <SelectItem key={m} value={m}>{MODO_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Qué se obsequia */}
              <div>
                <p className="text-xs text-muted-foreground md:hidden mb-1">Obsequio</p>
                {esProducto && (
                  <InsumoBuscador
                    etiqueta={item?.insumo_nombre}
                    sedeId={sedeId}
                    invalido={!!err?.insumo}
                    onSelect={(i) => {
                      setValue(`items.${idx}.insumo`, i.id, { shouldDirty: true })
                      setValue(`items.${idx}.insumo_nombre`, i.nombre, { shouldDirty: true })
                      setValue(`items.${idx}.insumo_unidad`, i.unidad, { shouldDirty: true })
                      setValue(`items.${idx}.insumo_stock`, sedeId ? i.stock : null, { shouldDirty: true })
                      setValue(`items.${idx}.descripcion`, i.nombre, { shouldDirty: true })
                      setValue(`items.${idx}.valor_referencia`, i.precio, { shouldDirty: true })
                    }}
                  />
                )}
                {modo === 'procedimiento' && (
                  <BuscadorPopover
                    etiqueta={item?.procedimiento ? item.descripcion : null}
                    placeholder="Seleccionar procedimiento…"
                    icono={Stethoscope}
                    invalido={!!err?.procedimiento}
                    opciones={procedimientos.map((p) => ({
                      id: p.id,
                      label: p.nombre,
                      hint: (p.precio_base ?? p.precio_referencia) ? cop(parseFloat((p.precio_base ?? p.precio_referencia)!)) : undefined,
                    }))}
                    onSelect={(id) => { const p = procedimientos.find((x) => x.id === id); if (p) elegirProcedimiento(idx, p) }}
                  />
                )}
                {modo === 'clon' && (
                  <BuscadorPopover
                    etiqueta={item?.tipo_sesion_origen ? item.descripcion : null}
                    placeholder="Seleccionar sesión…"
                    icono={Package2}
                    invalido={!!err?.origen_clave}
                    opciones={opcionesClon(!!item?.agendable)}
                    onSelect={(valor) => elegirClon(idx, valor)}
                  />
                )}
                {modo === 'informativo' && (
                  <Input
                    className="h-8 text-sm"
                    placeholder="Ej. Consulta de valoración"
                    {...register(`items.${idx}.descripcion`)}
                  />
                )}
                {(err?.insumo?.message || err?.procedimiento?.message || err?.origen_clave?.message || err?.descripcion) && (
                  <p className="text-[10px] text-destructive mt-0.5">
                    {err?.insumo?.message ?? err?.procedimiento?.message ?? err?.origen_clave?.message ?? 'Requerido'}
                  </p>
                )}
                {origenFaltante && (
                  <p className="text-[10px] text-destructive mt-0.5">El tratamiento de origen ya no está en la cotización.</p>
                )}
                {esProducto && sedeId === null && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">Elige la sede de la cotización para ver el stock.</p>
                )}
                {esProducto && stock !== null && (
                  <p className={cn('text-[10px] mt-0.5', stockInsuficiente ? 'text-amber-700' : 'text-muted-foreground')}>
                    {stockInsuficiente
                      ? `Stock en la sede: ${stock} ${item?.insumo_unidad ?? ''}. No podrás entregarlo hasta reponer.`
                      : `Stock en la sede: ${stock} ${item?.insumo_unidad ?? ''}`}
                  </p>
                )}
              </div>

              {/* Agendable: inline junto al selector de obsequio, no debajo */}
              <div>
                <p className="text-xs text-muted-foreground md:hidden mb-1">Agendable</p>
                {modo !== 'producto' && modo !== 'informativo' ? (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-2 pt-1.5 w-fit">
                          <Controller
                            control={control}
                            name={`items.${idx}.agendable`}
                            render={({ field: f }) => (
                              <Switch checked={!!f.value} onCheckedChange={(v) => cambiarAgendable(idx, v)} />
                            )}
                          />
                          <span className="text-xs text-muted-foreground">Agendable</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[220px]">
                        Desactívalo si ya está incluida en el tratamiento.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>

              {/* Cantidad */}
              <div>
                <p className="text-xs text-muted-foreground md:hidden mb-1">Cantidad</p>
                {esProducto ? (
                  <Controller
                    control={control}
                    name={`items.${idx}.cantidad_insumo`}
                    render={({ field: f }) => (
                      <div className="relative">
                        <Input
                          type="number" min={0} step="any"
                          className={cn('h-8 text-sm text-center pr-8', err?.cantidad_insumo && 'border-destructive')}
                          value={f.value ?? ''}
                          onChange={(e) => f.onChange(e.target.value === '' ? null : Number(e.target.value))}
                        />
                        {item?.insumo_unidad && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                            {item.insumo_unidad === 'unidad' ? 'und' : item.insumo_unidad}
                          </span>
                        )}
                      </div>
                    )}
                  />
                ) : (
                  <Input type="number" min={1} className="h-8 text-sm text-center"
                    {...register(`items.${idx}.num_citas`, { valueAsNumber: true })} />
                )}
              </div>

              {/* Valor de referencia */}
              <div>
                <p className="text-xs text-muted-foreground md:hidden mb-1">Valor de referencia</p>
                <Controller
                  control={control}
                  name={`items.${idx}.valor_referencia`}
                  render={({ field: f }) => (
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none">$</span>
                      <Input
                        inputMode="numeric"
                        className="h-8 text-sm text-right pl-6"
                        value={f.value ? new Intl.NumberFormat('es-CO').format(f.value) : ''}
                        onChange={(e) => { const raw = e.target.value.replace(/\D/g, ''); f.onChange(raw ? Number(raw) : 0) }}
                        placeholder="0"
                      />
                    </div>
                  )}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">Se cobra $0</p>
              </div>

              {/* Eliminar */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Entregar: elegir la sede de la que sale el producto */}
      <Dialog open={entregando !== null} onOpenChange={(o) => { if (!o && !entregandoPendiente) setEntregando(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entregar obsequio</DialogTitle>
            <DialogDescription>
              {entregando?.descripcion} ({entregando ? cantidadTextoApi(entregando) : ''}) se descuenta del inventario de la sede que elijas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm">Sede de entrega</Label>
            <Select value={sedeEntrega} onValueChange={setSedeEntrega}>
              <SelectTrigger><SelectValue placeholder="Selecciona la sede" /></SelectTrigger>
              <SelectContent>
                {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEntregando(null)} disabled={entregandoPendiente}>Cancelar</Button>
            <Button
              disabled={!sedeEntrega || entregandoPendiente}
              onClick={() => entregando && entregar({ itemId: entregando.id, sede: sedeEntrega })}
            >
              {entregandoPendiente && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Confirmar entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revirtiendo !== null}
        onOpenChange={(o) => { if (!o) setRevirtiendo(null) }}
        title="Revertir entrega"
        description={`Se devolverá ${revirtiendo ? cantidadTextoApi(revirtiendo) : ''} de ${revirtiendo?.descripcion ?? ''} al inventario y el obsequio quedará pendiente de entrega.`}
        confirmLabel="Revertir"
        variant="destructive"
        loading={revirtiendoPendiente}
        onConfirm={() => revirtiendo && revertir(revirtiendo.id)}
      />
    </div>
  )
}

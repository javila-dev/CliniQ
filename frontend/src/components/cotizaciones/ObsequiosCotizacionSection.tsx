'use client'

import { useState } from 'react'
import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Gift, Plus, X, Search, Stethoscope, Package2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { clinicasApi } from '@/lib/api/clinicas'
import { inventarioApi } from '@/lib/api/inventario'
import { cn } from '@/lib/utils'
import type { Procedimiento, TratamientoCatalogo } from '@/types/clinicas'
import type { FormValues } from './CotizacionForm'

type ItemForm = FormValues['items'][number]

export type ModoObsequio = 'procedimiento' | 'clon' | 'informativo' | 'producto'

const MODO_LABEL: Record<Exclude<ModoObsequio, 'producto'>, string> = {
  procedimiento: 'Procedimiento del catálogo',
  clon: 'Sesión de un tratamiento cotizado',
  informativo: 'Solo informativo',
}

function cop(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
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

interface Opcion { id: string; label: string; sublabel?: string; hint?: string }

function BuscadorObsequio({
  etiqueta, placeholder, icono: Icono, opciones, cargando, onBuscar, onSelect, invalido,
}: {
  etiqueta: string | null | undefined
  placeholder: string
  icono: typeof Search
  opciones: Opcion[]
  cargando?: boolean
  /** Si se pasa, la búsqueda la resuelve el padre (servidor) y no se filtra en local. */
  onBuscar?: (q: string) => void
  onSelect: (id: string) => void
  invalido?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const visibles = !onBuscar && q
    ? opciones.filter((o) => `${o.label} ${o.sublabel ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    : opciones

  function cerrar() {
    setOpen(false)
    setQ('')
    onBuscar?.('')
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-8 w-full items-center gap-1.5 rounded-md border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors',
          invalido && 'border-destructive',
        )}
      >
        <Icono className="h-3 w-3 shrink-0" />
        <span className="truncate">{etiqueta || placeholder}</span>
      </button>
    )
  }

  return (
    <div className="relative">
      <div className="rounded-lg border bg-white shadow-md overflow-hidden z-20 w-72">
        <div className="flex items-center gap-2 px-2.5 py-2 border-b">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); onBuscar?.(e.target.value) }}
            placeholder="Buscar…"
            className="flex-1 text-xs outline-none bg-transparent"
            onKeyDown={(e) => { if (e.key === 'Escape') cerrar() }}
          />
        </div>
        <div className="max-h-44 overflow-y-auto divide-y">
          {visibles.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onSelect(o.id); cerrar() }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-xs font-medium truncate">{o.label}</span>
                {o.sublabel && <span className="block text-[10px] text-muted-foreground truncate">{o.sublabel}</span>}
              </span>
              {o.hint && <span className="text-[10px] text-muted-foreground shrink-0">{o.hint}</span>}
            </button>
          ))}
          {!cargando && visibles.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">Sin resultados</p>
          )}
          {cargando && <p className="px-3 py-2.5 text-xs text-muted-foreground">Buscando…</p>}
        </div>
        <div className="border-t px-3 py-2 flex justify-end">
          <button type="button" onClick={cerrar} className="text-[10px] text-muted-foreground hover:text-foreground">Cerrar</button>
        </div>
      </div>
    </div>
  )
}

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
    <BuscadorObsequio
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
}

export function ObsequiosCotizacionSection({
  control, register, setValue, itemFields, items, errors, soloLectura,
  procedimientos, sedeId, onAdd, onRemove,
}: Props) {
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

  if (soloLectura && filas.length === 0) return null

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

  const valorTotal = filas.reduce(
    (acc, { idx }) => acc + (items[idx]?.valor_referencia || 0) * (items[idx]?.tipo === 'insumo' ? 1 : (items[idx]?.num_citas || 1)),
    0,
  )

  return (
    <div className="border-b last:border-b-0">
      <div className="px-5 py-3 bg-amber-50/60 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gift className="h-3.5 w-3.5 text-amber-700" />
          <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Obsequios</p>
          {valorTotal > 0 && (
            <span className="text-[11px] text-amber-700 ml-2">valor de referencia {cop(valorTotal)} · sin costo</span>
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
        {filas.length === 0 && (
          <p className="px-5 py-3 text-xs text-muted-foreground italic">
            Sin obsequios — usa Sesión o Producto para agregar uno. No suman al total.
          </p>
        )}
        {filas.map(({ field, idx }) => {
          const item = items[idx]
          const modo = modoDe(item)
          const err = errors.items?.[idx]
          const esProducto = modo === 'producto'
          const cantidad = item?.cantidad_insumo ?? 0
          const stock = item?.insumo_stock != null ? parseFloat(item.insumo_stock) : null
          const stockInsuficiente = esProducto && stock !== null && cantidad > stock
          const origenFaltante = modo === 'clon' && item?.origen_clave &&
            !items.some((it) => it._clave === item.origen_clave && !it.es_obsequio && it.tipo === 'tratamiento')

          if (soloLectura) {
            return (
              <div key={field.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{item?.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    {esProducto
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
          }

          return (
            <div key={field.id} className="px-5 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_90px_130px_36px] gap-3 items-start">
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
                  <BuscadorObsequio
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
                  <BuscadorObsequio
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
                {modo !== 'producto' && modo !== 'informativo' && (
                  <div className="flex items-center gap-2 mt-2">
                    <Controller
                      control={control}
                      name={`items.${idx}.agendable`}
                      render={({ field: f }) => (
                        <Switch checked={!!f.value} onCheckedChange={(v) => cambiarAgendable(idx, v)} />
                      )}
                    />
                    <span className="text-xs text-muted-foreground leading-tight">
                      Agendable
                      <span className="block text-[10px]">Desactívalo si ya está incluida en el protocolo.</span>
                    </span>
                  </div>
                )}
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
    </div>
  )
}

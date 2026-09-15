'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Search, Lock, Loader2 } from 'lucide-react'
import { proveedoresApi } from '@/lib/api/proveedores'
import { clinicasApi } from '@/lib/api/clinicas'
import { inventarioApi } from '@/lib/api/inventario'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { ProveedorSearchInput } from '@/components/proveedores/ProveedorSearchInput'
import { NuevoProveedorDialog } from '@/components/proveedores/NuevoProveedorDialog'
import { toast } from '@/hooks/use-toast'
import type { OrdenCompra } from '@/types/proveedores'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

interface ItemLocal {
  id?: string          // presente si ya existe en el backend (orden borrador guardada)
  insumo: string
  insumo_nombre: string
  cantidad: string
  precio_unitario: string
}

// ─── Modal de agregado rápido de ítem ──────────────────────────

function AgregarItemModal({
  open,
  sede,
  onClose,
  onAgregar,
}: {
  open: boolean
  sede: string
  onClose: () => void
  onAgregar: (item: ItemLocal) => void
}) {
  const [search, setSearch] = useState('')
  const [insumoSel, setInsumoSel] = useState<{ id: string; nombre: string } | null>(null)
  const [cantidad, setCantidad] = useState('')
  const [costo, setCosto] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['insumos-quick-search', debouncedSearch, sede],
    queryFn: () => inventarioApi.listInsumos({ search: debouncedSearch || undefined, activo: true, sede: sede || undefined, page_size: 15 }),
    enabled: open,
  })

  function handleClose() {
    setSearch(''); setInsumoSel(null); setCantidad(''); setCosto('')
    onClose()
  }

  function handleAgregar() {
    if (!insumoSel || !cantidad || Number(cantidad) <= 0 || !costo || Number(costo) < 0) return
    onAgregar({
      insumo: insumoSel.id,
      insumo_nombre: insumoSel.nombre,
      cantidad,
      precio_unitario: costo,
    })
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar ítem</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {!insumoSel ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar insumo por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="rounded-lg border max-h-56 overflow-y-auto divide-y">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Buscando…</p>
                ) : !data?.results.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {search ? 'Sin resultados' : 'Escribe para buscar un insumo'}
                  </p>
                ) : (
                  data.results.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setInsumoSel({ id: i.id, nombre: i.nombre })}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{i.nombre}</p>
                      <p className="text-xs text-muted-foreground">Stock actual: {i.stock_actual}</p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">{insumoSel.nombre}</p>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setInsumoSel(null)}>
                  Cambiar
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cantidad *</Label>
                  <Input
                    type="number" step="0.001" min="0.001" placeholder="0.000"
                    value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Costo unitario *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      className="pl-7 tabular-nums"
                      value={costo ? Number(costo).toLocaleString('es-CO') : ''}
                      onChange={(e) => setCosto(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button
            type="button"
            onClick={handleAgregar}
            disabled={!insumoSel || !cantidad || Number(cantidad) <= 0 || !costo || Number(costo) < 0}
          >
            Agregar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Form principal ─────────────────────────────────────────────

export function CompraForm({ compraExistente }: { compraExistente?: OrdenCompra }) {
  const router = useRouter()
  const qc = useQueryClient()
  const esNueva = !compraExistente
  const esInmutable = !!compraExistente && compraExistente.estado !== 'borrador'

  const [proveedor, setProveedor] = useState(compraExistente?.proveedor ?? '')
  const [sede, setSede] = useState(compraExistente?.sede ?? '')
  const [fecha, setFecha] = useState(compraExistente?.fecha ?? new Date().toISOString().slice(0, 10))
  const [numeroFactura, setNumeroFactura] = useState(compraExistente?.numero_factura_proveedor ?? '')
  const [fechaFactura, setFechaFactura] = useState(compraExistente?.fecha_factura_proveedor ?? '')
  const [notas, setNotas] = useState(compraExistente?.notas ?? '')
  const [items, setItems] = useState<ItemLocal[]>(
    compraExistente?.items.map((i) => ({
      id: i.id, insumo: i.insumo, insumo_nombre: i.insumo_nombre ?? i.insumo,
      cantidad: i.cantidad, precio_unitario: i.precio_unitario,
    })) ?? []
  )
  const [modalItemOpen, setModalItemOpen] = useState(false)
  const [nuevoProvOpen, setNuevoProvOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: proveedoresData } = useQuery({
    queryKey: ['proveedores-select'],
    queryFn: () => proveedoresApi.listProveedores({ activo: true, page_size: 100 }),
  })
  const proveedorSeleccionado = proveedoresData?.results.find((p) => p.id === proveedor) ?? null
  const { data: sedesData } = useQuery({
    queryKey: ['sedes-select'],
    queryFn: () => clinicasApi.sedes.list({ activa: true }),
  })

  const total = items.reduce((acc, i) => acc + Number(i.cantidad || 0) * Number(i.precio_unitario || 0), 0)

  function agregarItem(nuevo: ItemLocal) {
    setItems((prev) => {
      const existente = prev.find((i) => i.insumo === nuevo.insumo && !i.id)
      if (existente) {
        return prev.map((i) =>
          i === existente ? { ...i, cantidad: String(Number(i.cantidad) + Number(nuevo.cantidad)) } : i
        )
      }
      return [...prev, nuevo]
    })
  }

  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  function payloadHeader() {
    return {
      proveedor,
      sede,
      fecha,
      notas: notas || undefined,
      numero_factura_proveedor: numeroFactura || undefined,
      fecha_factura_proveedor: fechaFactura || undefined,
      items: items.map((i) => ({
        ...(i.id ? { id: i.id } : {}),
        insumo: i.insumo,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
      })),
    }
  }

  function validar(): boolean {
    if (!proveedor || !sede || !fecha) {
      setError('Proveedor, sede y fecha son obligatorios.')
      return false
    }
    if (!numeroFactura.trim()) {
      setError('El N.° de factura del proveedor es obligatorio.')
      return false
    }
    if (items.length === 0) {
      setError('Agrega al menos un ítem.')
      return false
    }
    setError(null)
    return true
  }

  const guardarMutation = useMutation({
    mutationFn: () =>
      esNueva
        ? proveedoresApi.createOrden(payloadHeader())
        : proveedoresApi.updateOrden(compraExistente!.id, payloadHeader()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      toast.success('Guardado', 'La compra quedó guardada como borrador.')
      router.push('/compras')
    },
    onError: () => setError('No se pudo guardar la compra. Revisa los datos.'),
  })

  const recibirMutation = useMutation({
    mutationFn: async () => {
      const orden = esNueva
        ? await proveedoresApi.createOrden(payloadHeader())
        : await proveedoresApi.updateOrden(compraExistente!.id, payloadHeader())
      return proveedoresApi.recibirOrden(orden.id, {
        items_recibidos: orden.items.map((i) => ({ item_id: i.id, cantidad: i.cantidad })),
        numero_factura_proveedor: numeroFactura || undefined,
        fecha_factura_proveedor: fechaFactura || undefined,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['compras'] })
      toast.success('Compra recibida', 'El stock ya quedó actualizado.')
      router.push('/compras')
    },
    onError: () => setError('No se pudo registrar la recepción. Revisa las cantidades.'),
  })

  const guardando = guardarMutation.isPending || recibirMutation.isPending

  return (
    <div className="space-y-5">
      {/* Encabezado tipo factura */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Proveedor *</Label>
              <ProveedorSearchInput
                proveedores={proveedoresData?.results ?? []}
                selected={proveedorSeleccionado}
                onSelect={(p) => setProveedor(p.id)}
                onClear={() => setProveedor('')}
                onCreateNew={() => setNuevoProvOpen(true)}
                disabled={esInmutable}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sede *</Label>
              <Select value={sede} onValueChange={setSede} disabled={esInmutable}>
                <SelectTrigger><SelectValue placeholder="Selecciona una sede" /></SelectTrigger>
                <SelectContent>
                  {sedesData?.results.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha de compra *</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={esInmutable} />
            </div>
            <div className="space-y-1.5">
              <Label>N.° de factura del proveedor *</Label>
              <Input placeholder="Ej. FE-12345" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} disabled={esInmutable} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de factura</Label>
              <Input type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} disabled={esInmutable} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ítems */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Ítems</p>
            {!esInmutable && (
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setModalItemOpen(true)}>
                <Plus className="h-3.5 w-3.5" />Agregar ítem
              </Button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin ítems agregados todavía.</p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_90px_110px_110px_32px] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                <span>Insumo</span>
                <span className="text-right">Cantidad</span>
                <span className="text-right">Costo u.</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>
              {items.map((item, idx) => (
                <div key={item.id ?? `${item.insumo}-${idx}`} className="grid grid-cols-[1fr_90px_110px_110px_32px] gap-2 px-3 py-2.5 border-t items-center text-sm">
                  <span className="truncate">{item.insumo_nombre}</span>
                  <span className="text-right tabular-nums">{item.cantidad}</span>
                  <span className="text-right tabular-nums">{COP.format(Number(item.precio_unitario))}</span>
                  <span className="text-right tabular-nums font-medium">
                    {COP.format(Number(item.cantidad) * Number(item.precio_unitario))}
                  </span>
                  {!esInmutable && !item.id ? (
                    <button type="button" onClick={() => quitarItem(idx)} className="text-muted-foreground hover:text-red-500 transition-colors justify-self-center">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : <span />}
                </div>
              ))}
              <div className="flex justify-end px-3 py-2.5 border-t bg-muted/20">
                <span className="text-sm font-semibold">Total: {COP.format(total)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas — pie del formulario */}
      <Card>
        <CardContent className="pt-5">
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea placeholder="Opcional" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} disabled={esInmutable} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {esInmutable ? (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          Esta compra ya fue recibida y quedó inmutable — el stock ya se actualizó.
        </div>
      ) : (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={guardando}
            onClick={() => { if (validar()) guardarMutation.mutate() }}
          >
            {guardarMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {guardarMutation.isPending ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          <Button
            type="button"
            disabled={guardando}
            onClick={() => { if (validar()) recibirMutation.mutate() }}
          >
            {recibirMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {recibirMutation.isPending ? 'Registrando…' : 'Registrar y recibir'}
          </Button>
        </div>
      )}

      <AgregarItemModal open={modalItemOpen} sede={sede} onClose={() => setModalItemOpen(false)} onAgregar={agregarItem} />
      <NuevoProveedorDialog
        open={nuevoProvOpen}
        onClose={() => setNuevoProvOpen(false)}
        onCreated={(p) => setProveedor(p.id)}
      />
    </div>
  )
}

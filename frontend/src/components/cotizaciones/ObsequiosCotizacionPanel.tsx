'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Gift, Loader2, PackageCheck, Undo2 } from 'lucide-react'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAuthStore } from '@/store/authStore'
import { useUserSedes } from '@/hooks/useUserSedes'
import { toast } from '@/hooks/use-toast'
import { hasPermission, PERM } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils'
import type { Cotizacion, ItemCotizacion } from '@/types/cotizaciones'

function cop(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

function cantidadTexto(item: ItemCotizacion): string {
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

export function ObsequiosCotizacionPanel({ cotizacion }: { cotizacion: Cotizacion }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { sedes } = useUserSedes()
  const puedeEntregar = hasPermission(user, PERM.INVENTARIO_CONSUMO_REGISTRAR)
  const puedeRevertir = hasPermission(user, PERM.INVENTARIO_CONSUMO_ELIMINAR)

  const obsequios = cotizacion.items.filter((i) => i.es_obsequio)

  const [entregando, setEntregando] = useState<ItemCotizacion | null>(null)
  const [sedeEntrega, setSedeEntrega] = useState<string>('')
  const [revirtiendo, setRevirtiendo] = useState<ItemCotizacion | null>(null)
  // Abierto al entrar solo si hay un producto por entregar (la acción pendiente
  // no debe quedar escondida); si no, arranca cerrado. Después manda el usuario.
  const [abierto, setAbierto] = useState(
    () => cotizacion.estado === 'aceptada' && obsequios.some((i) => i.tipo === 'insumo' && !i.entregado_at),
  )

  function refrescar() {
    queryClient.invalidateQueries({ queryKey: ['cotizacion', cotizacion.id] })
    queryClient.invalidateQueries({ queryKey: ['kardex'] })
    queryClient.invalidateQueries({ queryKey: ['insumos'] })
  }

  const { mutate: entregar, isPending: entregandoPendiente } = useMutation({
    mutationFn: ({ itemId, sede }: { itemId: string; sede: string }) =>
      cotizacionesApi.entregarObsequio(cotizacion.id, itemId, { sede }),
    onSuccess: (item) => {
      toast.success('Obsequio entregado', `${item.insumo_nombre ?? item.descripcion} descontado del inventario.`)
      setEntregando(null)
      refrescar()
    },
    onError: (err) => toast.error('No se pudo entregar', mensajeError(err, 'Vuelve a intentarlo en un momento.')),
  })

  const { mutate: revertir, isPending: revirtiendoPendiente } = useMutation({
    mutationFn: (itemId: string) => cotizacionesApi.revertirEntregaObsequio(cotizacion.id, itemId),
    onSuccess: () => {
      toast.success('Entrega revertida', 'El stock se devolvió al inventario.')
      setRevirtiendo(null)
      refrescar()
    },
    onError: (err) => toast.error('No se pudo revertir', mensajeError(err, 'Vuelve a intentarlo en un momento.')),
  })

  function abrirEntrega(item: ItemCotizacion) {
    const porDefecto = cotizacion.sede ?? sedes[0]?.id ?? ''
    setSedeEntrega(sedes.some((s) => s.id === porDefecto) ? porDefecto : sedes[0]?.id ?? '')
    setEntregando(item)
  }

  const cotizacionAceptada = cotizacion.estado === 'aceptada'

  // Después de los hooks: retornar antes cambiaría su cantidad entre renders.
  if (obsequios.length === 0) return null

  const porEntregar = obsequios.filter((i) => i.tipo === 'insumo' && !i.entregado_at).length

  return (
    <>
      <Card>
        <CardHeader className={abierto ? 'pb-3' : 'py-3'}>
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls="obsequios-cotizacion"
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Gift className="h-4 w-4 text-amber-700 shrink-0" />
              <CardTitle className="text-base">Obsequios</CardTitle>
              {/* Resumen visible también cerrado: la entrega pendiente no queda escondida */}
              <span className="text-xs text-muted-foreground truncate">
                {obsequios.length} {obsequios.length === 1 ? 'obsequio' : 'obsequios'}
                {cotizacionAceptada && porEntregar > 0 && (
                  <span className="text-amber-700"> · {porEntregar} por entregar</span>
                )}
              </span>
            </span>
            {abierto
              ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
          </button>
        </CardHeader>
        {abierto && (
        <CardContent id="obsequios-cotizacion" className="divide-y">
          {obsequios.map((item) => {
            const esProducto = item.tipo === 'insumo'
            const entregado = !!item.entregado_at
            const valorRef = Number(item.valor_referencia ?? 0)
            const stock = item.stock_disponible != null ? Number(item.stock_disponible) : null
            const stockInsuficiente = esProducto && !entregado && stock !== null && stock < Number(item.cantidad_insumo ?? 0)

            return (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium">{item.descripcion}</p>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-amber-100 text-amber-800">
                      {esProducto ? 'Producto' : item.agendable ? 'Sesión adicional' : 'Cortesía'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {cantidadTexto(item)}
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

                {esProducto && cotizacionAceptada && (
                  <div className="shrink-0">
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
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
        )}
      </Card>

      {/* Entregar: elegir la sede de la que sale el producto */}
      <Dialog open={entregando !== null} onOpenChange={(o) => { if (!o && !entregandoPendiente) setEntregando(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Entregar obsequio</DialogTitle>
            <DialogDescription>
              {entregando?.descripcion} ({entregando ? cantidadTexto(entregando) : ''}) se descuenta del inventario de la sede que elijas.
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
        description={`Se devolverá ${revirtiendo ? cantidadTexto(revirtiendo) : ''} de ${revirtiendo?.descripcion ?? ''} al inventario y el obsequio quedará pendiente de entrega.`}
        confirmLabel="Revertir"
        variant="destructive"
        loading={revirtiendoPendiente}
        onConfirm={() => revirtiendo && revertir(revirtiendo.id)}
      />
    </>
  )
}

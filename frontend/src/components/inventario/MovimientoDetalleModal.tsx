'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { MovimientoInventario, TipoMovimiento } from '@/types/inventario'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatCantidad(value: string): string {
  const n = Number(value)
  return isNaN(n) ? value : n.toLocaleString('es-CO', { maximumFractionDigits: 2 })
}

const TIPO_LABEL: Record<TipoMovimiento, string> = {
  entrada: 'Entrada',
  salida: 'Salida',
  ajuste_positivo: 'Ajuste (+)',
  ajuste_negativo: 'Ajuste (-)',
  baja: 'Baja',
}

const ORIGEN_LABEL: Record<string, string> = {
  compra: 'Compra',
  consumo_cita: 'Consumo en atención',
  venta_retail: 'Venta retail',
  obsequio: 'Obsequio en cotización',
  ajuste_manual: 'Ajuste manual',
  baja_vencimiento: 'Baja por vencimiento',
}

const ORIGEN_COBRO_LABEL: Record<string, string> = {
  cita: 'Cita',
  cotizacion: 'Cotización / plan',
  libre: 'Ingreso libre',
}

function Fila({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function MovimientoDetalleModal({
  movimiento,
  open,
  onClose,
}: {
  movimiento: MovimientoInventario | null
  open: boolean
  onClose: () => void
}) {
  if (!movimiento) return null
  const m = movimiento
  const ctx = m.contexto

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Detalle del movimiento</DialogTitle></DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
            <Fila label="Fecha"><span className="font-medium">{fmtDateTime(m.fecha)}</span></Fila>
            <Fila label="Tipo"><span className="font-medium">{TIPO_LABEL[m.tipo]}</span></Fila>
            <Fila label="Origen"><span className="font-medium">{ORIGEN_LABEL[m.origen] ?? m.origen}</span></Fila>
            <Fila label="Cantidad"><span className="font-semibold tabular-nums">{formatCantidad(m.cantidad)}</span></Fila>
            <Fila label="Costo unitario"><span className="tabular-nums">{COP.format(Number(m.costo_unitario))}</span></Fila>
            <Fila label="Stock resultante"><span className="tabular-nums">{formatCantidad(m.stock_resultante)}</span></Fila>
            {m.sede_nombre && <Fila label="Sede"><span>{m.sede_nombre}</span></Fila>}
          </div>

          {ctx?.tipo === 'orden_compra' && (
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compra</p>
              <Fila label="Orden">
                <Link href={`/compras/${ctx.orden_id}`} className="text-primary hover:underline font-medium">
                  {ctx.orden_numero}
                </Link>
              </Fila>
              <Fila label="Proveedor"><span className="font-medium">{ctx.proveedor_nombre}</span></Fila>
              <Fila label="N.° de factura"><span>{ctx.numero_factura_proveedor ?? '—'}</span></Fila>
            </div>
          )}

          {ctx?.tipo === 'nota_clinica' && (
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Atención</p>
              <Fila label="Paciente">
                <Link href={`/pacientes/${ctx.paciente_id}/historia`} className="text-primary hover:underline font-medium">
                  {ctx.paciente_nombre}
                </Link>
              </Fila>
              {ctx.servicio_nombre && (
                <Fila label="Procedimiento / tratamiento"><span className="font-medium">{ctx.servicio_nombre}</span></Fila>
              )}
              {ctx.cita_fecha && (
                <Fila label="Fecha de la cita"><span>{fmtDateTime(ctx.cita_fecha)}</span></Fila>
              )}
            </div>
          )}

          {ctx?.tipo === 'cobro' && (
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Venta</p>
              <Fila label="Paciente">
                <Link href={`/pacientes/${ctx.paciente_id}/historia`} className="text-primary hover:underline font-medium">
                  {ctx.paciente_nombre}
                </Link>
              </Fila>
              <Fila label="Origen del cobro"><span>{ORIGEN_COBRO_LABEL[ctx.origen] ?? ctx.origen}</span></Fila>
              {ctx.cotizacion_numero && (
                <Fila label="Cotización"><span className="font-medium">#{ctx.cotizacion_numero}</span></Fila>
              )}
            </div>
          )}

          {ctx?.tipo === 'obsequio' && (
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Obsequio</p>
              <Fila label="Paciente">
                <Link href={`/pacientes/${ctx.paciente_id}/historia`} className="text-primary hover:underline font-medium">
                  {ctx.paciente_nombre}
                </Link>
              </Fila>
              <Fila label="Cotización">
                <Link href={`/cotizaciones/${ctx.cotizacion_id}`} className="text-primary hover:underline font-medium">
                  #{ctx.cotizacion_referencia}
                </Link>
              </Fila>
            </div>
          )}

          {m.motivo && (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Motivo</p>
              <p>{m.motivo}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t text-xs">
            <span className="text-muted-foreground">Registrado por</span>
            <span className="font-medium">{m.realizado_por_nombre ?? '—'}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Wallet, AlertTriangle, TrendingUp, TrendingDown, ExternalLink, User, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { carteraApi } from '@/lib/api/cartera'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import type { Cartera } from '@/types/cartera'

function formatCOP(value: string | number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(Number(value))
}

function CuotasVencidasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: cuotas, isLoading } = useQuery({
    queryKey: ['cuotas-vencidas'],
    queryFn: () => carteraApi.cuotasVencidas(),
    enabled: open,
  })

  function exportarExcel() {
    if (!cuotas?.length) return
    const hoy = new Date()
    const filas = cuotas.map((c) => ({
      Paciente: c.paciente_nombre,
      Cuota: `Cuota ${c.numero_cuota} de ${c.total_cuotas}`,
      Cotización: `#${c.cotizacion_id.slice(0, 8).toUpperCase()}`,
      Descripción: c.descripcion || c.tipo,
      'Fecha esperada': c.fecha_esperada ? formatDate(c.fecha_esperada) : '—',
      'Días de mora': c.dias_vencida,
      'Valor esperado': Number(c.valor_esperado),
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cuotas vencidas')
    XLSX.writeFile(wb, `cuotas_vencidas_${hoy.toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
              Cuotas vencidas
            </DialogTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!cuotas?.length}
              onClick={exportarExcel}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar Excel
            </Button>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="px-6 py-8"><LoadingState rows={4} /></div>
          ) : !cuotas?.length ? (
            <div className="px-6 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No hay cuotas vencidas</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Descripción</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Fecha esperada</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Días mora</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Valor</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {cuotas.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.paciente_nombre}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cuota {c.numero_cuota} de {c.total_cuotas} · Cot. #{c.cotizacion_id.slice(0, 8).toUpperCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                      {c.descripcion || c.tipo}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {c.fecha_esperada ? formatDate(c.fecha_esperada) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant="destructive" className="text-xs tabular-nums">
                        {c.dias_vencida}d
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-rose-600">
                      {formatCOP(c.valor_esperado)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/cartera/${c.cartera_id}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                        onClick={onClose}
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {cuotas?.length ? (
          <div className="px-6 py-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>{cuotas.length} cuota{cuotas.length !== 1 ? 's' : ''} vencida{cuotas.length !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-rose-600">
              {formatCOP(cuotas.reduce((sum, c) => sum + Number(c.valor_esperado), 0))}
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ResumenCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: string
  onClick?: () => void
}) {
  return (
    <Card
      className={onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2.5 ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function CarteraPage() {
  const router = useRouter()
  const [modalVencidas, setModalVencidas] = useState(false)

  const { data: resumen, isLoading: cargandoResumen } = useQuery({
    queryKey: ['cartera-resumen'],
    queryFn: () => carteraApi.resumen(),
  })

  const { data: carteras, isLoading } = useQuery({
    queryKey: ['cartera'],
    queryFn: () => carteraApi.list(),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartera"
        description="Control de cuentas por cobrar y formas de pago acordadas"
      />

      {/* Cards resumen */}
      {cargandoResumen ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><LoadingState rows={2} /></CardContent></Card>
          ))}
        </div>
      ) : resumen ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ResumenCard
            icon={Wallet}
            label="Total cartera"
            value={formatCOP(resumen.total_cartera)}
            color="bg-blue-500"
          />
          <ResumenCard
            icon={TrendingUp}
            label="Total cobrado"
            value={formatCOP(resumen.total_cobrado)}
            color="bg-emerald-500"
          />
          <ResumenCard
            icon={TrendingDown}
            label="Saldo pendiente"
            value={formatCOP(resumen.saldo_pendiente)}
            color="bg-amber-500"
          />
          <ResumenCard
            icon={AlertTriangle}
            label="Cuotas vencidas"
            value={String(resumen.cuotas_vencidas)}
            sub={formatCOP(resumen.cuotas_vencidas_valor)}
            color="bg-rose-500"
            onClick={() => setModalVencidas(true)}
          />
        </div>
      ) : null}

      {/* Tabla */}
      {isLoading ? (
        <LoadingState rows={5} />
      ) : !carteras?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No hay registros de cartera aún</p>
            <p className="text-xs text-muted-foreground mt-1">
              Se crean automáticamente al aprobar una cotización
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Paciente</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">Cotización</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Cobrado</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Saldo</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Cuotas</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Próx. pago</th>
              </tr>
            </thead>
            <tbody>
              {carteras.map((c) => {
                const saldoPct = c.total !== '0' ? Math.round((Number(c.total_pagado) / Number(c.total)) * 100) : 100
                return (
                  <tr
                    key={c.id}
                    className="border-b last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                    onClick={() => router.push(`/cartera/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.paciente_nombre}</p>
                      {c.profesional_nombre && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <User className="h-3 w-3" />{c.profesional_nombre}
                        </p>
                      )}
                      <div className="mt-1.5 w-24 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${saldoPct}%` }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <Link
                        href={`/cotizaciones/${c.cotizacion_id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{c.cotizacion_id.slice(0, 8).toUpperCase()}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">{formatCOP(c.total)}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-600">{formatCOP(c.total_pagado)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {Number(c.saldo_pendiente) > 0 ? (
                        <span className="text-amber-600 font-medium">{formatCOP(c.saldo_pendiente)}</span>
                      ) : (
                        <Badge variant="success" className="text-xs">Al día</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">
                      {c.cuotas_pagadas}/{c.cuotas_total}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">
                      {c.proxima_cuota_fecha ? (
                        <div>
                          <p>{formatDate(c.proxima_cuota_fecha)}</p>
                          {c.proxima_cuota_valor && (
                            <p className="text-foreground font-medium">{formatCOP(c.proxima_cuota_valor)}</p>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CuotasVencidasModal open={modalVencidas} onClose={() => setModalVencidas(false)} />
    </div>
  )
}

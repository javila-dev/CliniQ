'use client'

import Link from 'next/link'
import { CreditCard, HandCoins, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Cotizacion } from '@/types/cotizaciones'

function cop(value: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)
}

export function CarteraAvanceCotizacionPanel({ cotizacion }: { cotizacion: Cotizacion }) {
  if (cotizacion.total_pagado == null || cotizacion.saldo_pendiente == null) return null

  const total = Number(cotizacion.total)
  const abonado = Number(cotizacion.total_pagado)
  const pendiente = Number(cotizacion.saldo_pendiente)
  const pct = total > 0 ? Math.min(100, Math.round((abonado / total) * 100)) : 100
  const alDia = pendiente <= 0

  return (
    <Card>
      <CardContent className="pt-5 pb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-medium">Avance de cartera</p>
          </div>
          <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm">
            <span className="text-muted-foreground">
              Abonado <span className="font-semibold text-emerald-600 tabular-nums">{cop(abonado)}</span>
            </span>
            {alDia ? (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Al día
              </span>
            ) : (
              <span className="text-muted-foreground">
                Pendiente <span className="font-semibold text-amber-600 tabular-nums">{cop(pendiente)}</span>
              </span>
            )}
          </div>
          <div className="w-full max-w-sm h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {cotizacion.cartera_id && (
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <Link href={`/cartera/${cotizacion.cartera_id}`}>
              <HandCoins className="h-3.5 w-3.5 mr-1.5" />
              {alDia ? 'Ver cartera' : 'Registrar pago'}
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

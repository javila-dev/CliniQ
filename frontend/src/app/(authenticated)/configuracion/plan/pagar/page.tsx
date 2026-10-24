'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { PagoSuscripcion, type ModoPago } from '@/components/suscripcion/PagoSuscripcion'

const TITULOS: Record<ModoPago, { titulo: string; descripcion: string }> = {
  contratar: { titulo: 'Elegir plan', descripcion: 'Elige tu plan, tus datos de facturación y la tarjeta para el cobro automático.' },
  tarjeta: { titulo: 'Cambiar tarjeta', descripcion: 'La nueva tarjeta se usará en los próximos cobros.' },
  plan: { titulo: 'Cambiar de plan', descripcion: 'Subir de plan se cobra hoy por los días que quedan; bajar de plan se aplica al renovar.' },
  facturacion: { titulo: 'Datos de facturación', descripcion: 'A nombre de quién sale la factura electrónica de tu suscripción. Usa los datos del RUT.' },
}

function Contenido() {
  const modo = (useSearchParams().get('modo') as ModoPago) || 'contratar'
  const t = TITULOS[modo] ?? TITULOS.contratar
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader title={t.titulo} description={t.descripcion} />
      <PagoSuscripcion modo={modo in TITULOS ? modo : 'contratar'} />
    </div>
  )
}

export default function PagarPlanPage() {
  return (
    <Suspense>
      <Contenido />
    </Suspense>
  )
}

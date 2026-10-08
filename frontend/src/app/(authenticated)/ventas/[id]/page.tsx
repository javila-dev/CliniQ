'use client'

import { use, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { CotizacionForm } from '@/components/cotizaciones/CotizacionForm'
import { LoadingState } from '@/components/shared/LoadingState'

// Una venta es una cotización aceptada: se muestra con el mismo detalle (cartera,
// cobros, sesiones y consentimientos) y comparte la caché con /cotizaciones/[id].
export default function DetalleVentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => cotizacionesApi.get(id),
  })

  // Si el id no es de una venta (no está aceptada), se abre como cotización.
  // Solo con la primera carga, igual que en /cotizaciones/[id].
  const estadoInicial = useRef<string | null>(null)
  if (data && estadoInicial.current === null) estadoInicial.current = data.estado
  const noEsVenta = estadoInicial.current !== null && estadoInicial.current !== 'aceptada'
  useEffect(() => {
    if (noEsVenta) router.replace(`/cotizaciones/${id}`)
  }, [noEsVenta, id, router])

  if (isLoading || noEsVenta) return <div className="p-8"><LoadingState rows={6} /></div>
  if (!data) return null

  return <CotizacionForm cotizacion={data} vista="venta" />
}

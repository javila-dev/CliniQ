'use client'

import { use, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { CotizacionForm } from '@/components/cotizaciones/CotizacionForm'
import { LoadingState } from '@/components/shared/LoadingState'

export default function DetalleCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data, isLoading } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => cotizacionesApi.get(id),
  })

  // Una cotización aceptada es una venta: su pantalla vive en /ventas/[id].
  // Se redirige para no romper los enlaces que todavía apuntan aquí. Solo con
  // lo que trae la primera carga: si se acepta en esta pantalla, el formulario
  // decide (puede quedar abierto el asistente de consentimientos).
  const estadoInicial = useRef<string | null>(null)
  if (data && estadoInicial.current === null) estadoInicial.current = data.estado
  const esVenta = estadoInicial.current === 'aceptada'
  useEffect(() => {
    if (esVenta) router.replace(`/ventas/${id}`)
  }, [esVenta, id, router])

  if (isLoading || esVenta) return <div className="p-8"><LoadingState rows={6} /></div>
  if (!data) return null

  return <CotizacionForm cotizacion={data} />
}

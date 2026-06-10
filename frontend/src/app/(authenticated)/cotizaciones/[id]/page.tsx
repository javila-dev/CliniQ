'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { CotizacionForm } from '@/components/cotizaciones/CotizacionForm'
import { LoadingState } from '@/components/shared/LoadingState'

export default function DetalleCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data, isLoading } = useQuery({
    queryKey: ['cotizacion', id],
    queryFn: () => cotizacionesApi.get(id),
  })

  if (isLoading) return <div className="p-8"><LoadingState rows={6} /></div>
  if (!data) return null

  return <CotizacionForm cotizacion={data} />
}

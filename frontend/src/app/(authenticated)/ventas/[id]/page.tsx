'use client'

import { use, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { CotizacionForm } from '@/components/cotizaciones/CotizacionForm'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { mensajeDeError } from '@/lib/errores'

// Una venta es una cotización aceptada: se muestra con el mismo detalle (cartera,
// cobros, sesiones y consentimientos) y comparte la caché con /cotizaciones/[id].
export default function DetalleVentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  if (isError || !data) {
    const noExiste = (error as { response?: { status?: number } } | null)?.response?.status === 404
    return (
      <div className="p-8 flex flex-col items-center">
        <ErrorState
          message={noExiste
            ? 'No encontramos esta venta; puede que se haya eliminado.'
            : mensajeDeError(error, 'No se pudo cargar la venta.')}
          onRetry={noExiste ? undefined : () => refetch()}
        />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/ventas">Volver a ventas</Link>
        </Button>
      </div>
    )
  }

  return <CotizacionForm cotizacion={data} vista="venta" />
}

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

export default function DetalleCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  if (isError || !data) {
    const noExiste = (error as { response?: { status?: number } } | null)?.response?.status === 404
    // Sin permiso (p. ej. la cotización de otro profesional) reintentar no cambia nada.
    const sinPermiso = (error as { response?: { status?: number } } | null)?.response?.status === 403
    return (
      <div className="p-8 flex flex-col items-center">
        <ErrorState
          message={noExiste
            ? 'No encontramos esta cotización; puede que se haya eliminado.'
            : mensajeDeError(error, 'No se pudo cargar la cotización.')}
          onRetry={noExiste || sinPermiso ? undefined : () => refetch()}
        />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cotizaciones">Volver a cotizaciones</Link>
        </Button>
      </div>
    )
  }

  return <CotizacionForm cotizacion={data} />
}

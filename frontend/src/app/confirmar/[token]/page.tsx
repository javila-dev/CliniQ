'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Stethoscope } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/utils'

interface ConfirmarResponse {
  ok: boolean
  paciente_nombre: string
  servicio_nombre: string
  fecha_inicio: string
  profesional_nombre: string
  error?: string
}

interface Props {
  params: Promise<{ token: string }>
}

export default function ConfirmarCitaPage({ params }: Props) {
  const { token } = use(params)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['confirmar', token],
    queryFn: async (): Promise<ConfirmarResponse> => {
      const res = await apiClient.get(`/agenda/confirmar/${token}/`)
      return res.data
    },
    retry: false,
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/10 px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Stethoscope className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold">CliniQ</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-8 rounded-full mx-auto" />
                <Skeleton className="h-6 w-48 mx-auto" />
              </div>
            ) : data?.ok ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <CardTitle className="text-green-700">Cita confirmada</CardTitle>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
                <CardTitle className="text-destructive">Enlace inválido</CardTitle>
              </>
            )}
          </CardHeader>
          <CardContent className="text-center space-y-3">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
              </div>
            ) : data?.ok ? (
              <>
                <p className="text-muted-foreground text-sm">
                  Hola <strong>{data.paciente_nombre}</strong>, tu cita ha sido confirmada.
                </p>
                <div className="rounded-md bg-muted/50 p-3 text-left space-y-1.5 text-sm">
                  <p><span className="text-muted-foreground">Servicio:</span> {data.servicio_nombre}</p>
                  <p><span className="text-muted-foreground">Profesional:</span> {data.profesional_nombre}</p>
                  <p><span className="text-muted-foreground">Fecha:</span> {formatDateTime(data.fecha_inicio)}</p>
                </div>
                <p className="text-xs text-muted-foreground">Te esperamos. ¡Gracias!</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {data?.error ?? 'Este enlace no es válido o ya fue utilizado.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

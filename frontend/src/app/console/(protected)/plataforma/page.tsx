'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy } from 'lucide-react'

import { coreApi } from '@/lib/api/core'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/store/authStore'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Switch } from '@/components/ui/switch'

export default function PlataformaAdminPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const setUser = useAuthStore((s) => s.setUser)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'configuracion-global'],
    queryFn: coreApi.configuracionGlobal.get,
  })

  const mutation = useMutation({
    mutationFn: (centro_ayuda_habilitado: boolean) =>
      coreApi.configuracionGlobal.update({ centro_ayuda_habilitado }),
    onSuccess: async (nuevo) => {
      qc.setQueryData(['admin', 'configuracion-global'], nuevo)
      toast({ title: nuevo.centro_ayuda_habilitado ? 'Centro de ayuda activado' : 'Centro de ayuda desactivado' })
      // Refresca al superadmin actual para que su propio sidebar refleje el cambio ya mismo.
      try {
        setUser(await authApi.me())
      } catch {
        /* no crítico: el resto de las sesiones lo ven en su próximo /auth/me */
      }
    },
    onError: () => toast({ title: 'No se pudo guardar el cambio', variant: 'destructive' }),
  })

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="Plataforma"
        description="Funcionalidades que afectan a todas las clínicas a la vez."
      />

      {isLoading ? (
        <LoadingState rows={2} />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Centro de ayuda</p>
                <p className="mt-0.5 max-w-md text-sm text-muted-foreground">
                  FAQ y videos de ayuda dentro de la app. Mientras está apagado, solo lo ven
                  superadmin y el equipo interno (para preparar el contenido); al activarlo
                  queda visible para todas las clínicas.
                </p>
                {data && (
                  <p className="mt-2 text-xs text-muted-foreground/70">
                    Última actualización: {formatDate(data.updated_at)}
                  </p>
                )}
              </div>
            </div>
            <Switch
              checked={data?.centro_ayuda_habilitado ?? false}
              onCheckedChange={(v) => mutation.mutate(v)}
              disabled={mutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  )
}

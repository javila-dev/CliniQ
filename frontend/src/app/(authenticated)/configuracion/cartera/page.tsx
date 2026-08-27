'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Receipt } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { toast } from '@/hooks/use-toast'
import { PageHeader } from '@/components/shared/PageHeader'
import { Switch } from '@/components/ui/switch'

export default function ConfiguracionCarteraPage() {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['config-cartera'],
    queryFn: () => clinicasApi.carteraConfig.get(),
  })

  const mutation = useMutation({
    mutationFn: (data: { requiere_consentimiento_promocional: boolean }) =>
      clinicasApi.carteraConfig.update(data),
    onSuccess: (data) => {
      queryClient.setQueryData(['config-cartera'], data)
      toast.success('Configuración actualizada')
    },
    onError: () => {
      toast.error('No se pudo actualizar')
    },
  })

  const requiereActivo = config?.requiere_consentimiento_promocional ?? false

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Compromiso de pago"
        description="Configura si al aceptar una cotización se genera automáticamente un documento de compromiso de pago para firma del paciente."
      />

      {isLoading ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-muted-foreground">
          Cargando...
        </div>
      ) : (
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50">
              <Receipt className="h-4.5 w-4.5 text-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Requiere compromiso de pago firmado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Al aceptar una cotización, se genera y queda pendiente de firma un documento
                    estándar con el detalle del pago (valor total, abono inicial, saldo y plan de
                    cuotas). El texto del documento es fijo; aquí solo lo activas o lo desactivas.
                  </p>
                </div>
                <Switch
                  checked={requiereActivo}
                  disabled={mutation.isPending}
                  onCheckedChange={(v) => mutation.mutate({ requiere_consentimiento_promocional: v })}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

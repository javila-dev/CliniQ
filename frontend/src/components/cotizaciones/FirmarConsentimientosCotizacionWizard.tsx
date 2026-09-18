'use client'

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, Maximize2, Minimize2, X } from 'lucide-react'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { ConsentimientoFirmaContent } from '@/components/atenciones/ConsentimientoFirmaContent'

export const CONSENTIMIENTOS_PENDIENTES_KEY = 'cotizacion-consentimientos-pendientes'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  cotizacionId: string
  pacienteId: string
  pacienteNombre: string
}

export function FirmarConsentimientosCotizacionWizard({
  open,
  onOpenChange,
  cotizacionId,
  pacienteId,
  pacienteNombre,
}: Props) {
  const queryClient = useQueryClient()
  const [maximized, setMaximized] = useState(false)
  const [firmando, setFirmando] = useState(false)
  const totalRef = useRef(0)

  // Polling: el paciente puede firmar desde su celular (link por WhatsApp).
  const { data: pendientes, isLoading } = useQuery({
    queryKey: [CONSENTIMIENTOS_PENDIENTES_KEY, cotizacionId],
    queryFn: () => cotizacionesApi.consentimientosPendientes(cotizacionId),
    enabled: open,
    refetchInterval: open ? 5000 : false,
    refetchIntervalInBackground: true,
  })

  if (pendientes && pendientes.length > totalRef.current) totalRef.current = pendientes.length

  const actual = pendientes?.[0] ?? null
  const total = totalRef.current
  const firmados = total - (pendientes?.length ?? 0)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setMaximized(false)
      setFirmando(false)
      totalRef.current = 0
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        trapFocus={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'flex flex-col gap-0 p-0 transition-all duration-200',
          maximized
            ? '!fixed !inset-3 !left-3 !top-3 !translate-x-0 !translate-y-0 max-w-none !w-[calc(100vw-1.5rem)] !h-[calc(100vh-1.5rem)] rounded-xl'
            : 'max-w-3xl w-full h-[80vh]',
        )}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Consentimientos de la cotización — {pacienteNombre}</DialogTitle>
        </VisuallyHidden.Root>

        <div className={cn('flex items-center justify-between px-5 border-b shrink-0', firmando ? 'py-2' : 'py-3.5')}>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              {firmando ? `Firmando — ${pacienteNombre}` : 'Consentimientos de la cotización'}
            </p>
            {!firmando && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {pacienteNombre}
                {total > 0 && actual ? ` · Consentimiento ${firmados + 1} de ${total}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMaximized((v) => !v)}
              title={maximized ? 'Restaurar tamaño' : 'Maximizar'}
            >
              {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenChange(false)} title="Cerrar">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !actual ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="max-w-sm">
                <p className="text-lg font-semibold">
                  {total > 0 ? 'Consentimientos firmados' : 'Sin consentimientos pendientes'}
                </p>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {total > 0
                    ? 'El paciente firmó todos los consentimientos requeridos por esta cotización.'
                    : 'Esta cotización no tiene consentimientos por firmar.'}
                </p>
              </div>
              <Button onClick={() => handleOpenChange(false)}>Cerrar</Button>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {!firmando && actual.procedimiento && (
                <p className="px-5 pt-3 text-xs text-muted-foreground">
                  Requerido por: <span className="font-medium text-foreground">{actual.procedimiento}</span>
                </p>
              )}
              <div className="flex-1 min-h-0">
                <ConsentimientoFirmaContent
                  key={actual.template_token}
                  pacienteId={pacienteId}
                  pacienteNombre={pacienteNombre}
                  token={actual.template_token}
                  templateNombre={actual.template_nombre}
                  consentimientoId={actual.consentimiento_id}
                  onInicioFirma={() => {
                    setFirmando(true)
                    setMaximized(true)
                  }}
                  onFinFirma={() => {
                    setFirmando(false)
                    setMaximized(false)
                  }}
                  onCompleted={() => {
                    queryClient.invalidateQueries({ queryKey: [CONSENTIMIENTOS_PENDIENTES_KEY, cotizacionId] })
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

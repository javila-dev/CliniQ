'use client'

import Link from 'next/link'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { hasPermission, PERM } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useNumeroCliniqStore } from '@/store/numeroCliniqStore'

/** Pregunta si un WhatsApp que no pudo salir por el número de la clínica se
 *  envía desde el de CliniQ (ver enviarConConfirmacion). */
export function ConfirmarNumeroCliniqDialog() {
  const { pendiente, responder } = useNumeroCliniqStore()
  const puedeConfigurar = hasPermission(useAuthStore((s) => s.user), PERM.CLINICAS_EDITAR)

  return (
    <Dialog open={!!pendiente} onOpenChange={(v) => { if (!v) responder(false) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            No se pudo enviar desde tu número
          </DialogTitle>
          <DialogDescription className="leading-relaxed">{pendiente?.mensaje}</DialogDescription>
        </DialogHeader>

        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          {puedeConfigurar ? (
            <>
              Revisa el error en{' '}
              <Link href="/configuracion/whatsapp" onClick={() => responder(false)}
                className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
                Configuración → WhatsApp <ExternalLink className="h-3 w-3" />
              </Link>
              .
            </>
          ) : (
            'Avísale al administrador de la clínica para que revise el número en Configuración → WhatsApp.'
          )}
        </p>

        <p className="text-sm font-medium">¿Quieres enviar este mensaje desde el número de CliniQ?</p>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => responder(false)}>No enviar</Button>
          <Button onClick={() => responder(true)}>Enviar desde CliniQ</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

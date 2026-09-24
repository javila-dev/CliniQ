'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, Clock, FileSignature, Loader2, MoreHorizontal, RefreshCw, Send } from 'lucide-react'
import { carteraApi } from '@/lib/api/cartera'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/utils'
import type { AcuerdoPago } from '@/types/cartera'

function CancelarAcuerdoDialog({
  acuerdo,
  open,
  onOpenChange,
  carteraId,
}: {
  acuerdo: AcuerdoPago
  open: boolean
  onOpenChange: (v: boolean) => void
  carteraId: string
}) {
  const queryClient = useQueryClient()
  const [motivo, setMotivo] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: () => carteraApi.anularAcuerdo(acuerdo.id, motivo.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cartera', carteraId] })
      toast.success('Acuerdo cancelado', 'Puedes crear uno nuevo o registrar pagos normalmente.')
      onOpenChange(false)
      setMotivo('')
    },
    onError: (e: any) => toast.error('No se pudo cancelar', e?.response?.data?.error ?? 'Intenta de nuevo.'),
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setMotivo('') }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar acuerdo N.° {acuerdo.numero}</DialogTitle>
          <DialogDescription>
            El plan actual se mantiene y el acta queda sin efecto. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-cancelacion">Motivo de la cancelación *</Label>
          <Textarea
            id="motivo-cancelacion"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej.: el paciente pidió cambiar las fechas"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!motivo.trim() || isPending}
            onClick={() => mutate()}
          >
            {isPending ? 'Cancelando…' : 'Cancelar acuerdo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Aviso de acuerdo de pago pendiente de firma: bloquea pagos y cambios de fecha. */
export function AcuerdoPendienteAviso({
  acuerdo,
  carteraId,
  onFirmar,
}: {
  acuerdo: AcuerdoPago
  carteraId: string
  onFirmar: () => void
}) {
  const queryClient = useQueryClient()
  const [showCancelar, setShowCancelar] = useState(false)

  const verificarFirma = useMutation({
    mutationFn: () => carteraApi.verificarFirmaAcuerdo(acuerdo.id),
    onSuccess: (a) => {
      queryClient.invalidateQueries({ queryKey: ['cartera', carteraId] })
      if (a.estado === 'vigente') toast.success('Acuerdo vigente', 'El plan de cartera fue actualizado.')
      else if (a.estado === 'requiere_revision') toast.error('Requiere revisión', 'El saldo cambió respecto a la propuesta. Cancela el acuerdo y crea uno nuevo.')
      else toast({ title: 'Todavía sin firmar', description: 'El paciente aún no ha firmado el acta.' })
    },
    onError: () => toast.error('No se pudo verificar', 'Intenta de nuevo en un momento.'),
  })

  const reenviarLink = useMutation({
    mutationFn: () => consentimientosApi.enviarLinkDocumenso(acuerdo.documento!.id),
    onSuccess: (info) => toast.success(
      info.enviado ? 'Link reenviado' : 'Link listo',
      info.enviado ? `Se envió por WhatsApp a ${info.telefono}.` : 'El paciente no tiene teléfono; abre "Firmar" para copiar el enlace.',
    ),
    onError: (e: any) => toast.error('No se pudo reenviar', e?.response?.data?.error ?? 'Intenta de nuevo.'),
  })

  return (
    <div className="rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/60 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <Clock className="hidden sm:block h-4 w-4 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
          Acuerdo de pago N.° {acuerdo.numero} pendiente de firma
        </p>
        <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-0.5">
          Creado el {formatDate(acuerdo.created_at)}
          {acuerdo.creado_por_nombre ? ` por ${acuerdo.creado_por_nombre}` : ''}.
          {' '}Hasta que se firme, el plan actual sigue vigente y no se pueden registrar pagos ni mover fechas.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {acuerdo.documento && (
          <Button size="sm" onClick={onFirmar}>
            <FileSignature className="h-3.5 w-3.5 mr-1.5" /> Firmar acta
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline" className="h-9 w-9" aria-label="Más acciones del acuerdo">
              {verificarFirma.isPending || reenviarLink.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <MoreHorizontal className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {acuerdo.documento && (
              <DropdownMenuItem onSelect={() => reenviarLink.mutate()} disabled={reenviarLink.isPending}>
                <Send className="h-4 w-4 mr-2" /> Reenviar link por WhatsApp
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => verificarFirma.mutate()} disabled={verificarFirma.isPending}>
              <RefreshCw className="h-4 w-4 mr-2" /> Verificar firma
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setShowCancelar(true)} className="text-destructive focus:text-destructive">
              <Ban className="h-4 w-4 mr-2" /> Cancelar acuerdo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CancelarAcuerdoDialog
        acuerdo={acuerdo}
        open={showCancelar}
        onOpenChange={setShowCancelar}
        carteraId={carteraId}
      />
    </div>
  )
}

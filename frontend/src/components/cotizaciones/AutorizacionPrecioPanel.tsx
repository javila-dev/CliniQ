'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, Hourglass, Loader2, RotateCcw, Send, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils'
import type { EstadoAutorizacionCotizacion } from '@/types/cotizaciones'
import { SolicitudAutorizacionCard, haceCuanto } from './SolicitudAutorizacionCard'

function cop(valor: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor)
}

/** Ítem fuera de regla visto desde el formulario (cálculo local, el backend decide). */
export interface ItemPorAutorizar {
  descripcion: string
  minimo: number
  pedido: number
}

export function SolicitarAutorizacionDialog({
  open, items, enviando, onOpenChange, onConfirmar,
}: {
  open: boolean
  items: ItemPorAutorizar[]
  enviando: boolean
  onOpenChange: (open: boolean) => void
  onConfirmar: (motivo: string) => void
}) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (open) setMotivo('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-600" />
            Este precio necesita autorización
          </DialogTitle>
          <DialogDescription>
            Está por debajo de lo que puedes cotizar. Se guarda igual y le llega a quien autoriza precios;
            mientras decide, la cotización no se puede enviar, descargar ni aceptar.
          </DialogDescription>
        </DialogHeader>

        {items.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
            {items.map((item, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-gray-800">{item.descripcion || 'Ítem sin descripción'}</span>
                <span className="shrink-0 text-right text-xs text-gray-500">
                  mínimo {cop(item.minimo)} ·{' '}
                  <span className="font-semibold text-gray-900">pides {cop(item.pedido)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1.5">
          <label htmlFor="motivo-autorizacion" className="text-sm font-medium text-gray-800">
            ¿Por qué este precio?
          </label>
          <Textarea
            id="motivo-autorizacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={1000}
            autoFocus
            placeholder="Ej.: paciente frecuente, trae a dos amigas; la competencia le ofreció $1.200.000."
          />
          <p className="text-xs text-gray-500">Quien autoriza lo leerá antes de decidir.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={enviando || !motivo.trim()} onClick={() => onConfirmar(motivo.trim())}>
            {enviando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
            Guardar y pedir autorización
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Estado de la autorización dentro de la cotización: esperando, autorizada o rechazada. */
export function AutorizacionPrecioBanner({
  estado, puedeDecidir, puedeEditar, corrigiendo, onVolverAlPermitido, onPedirDeNuevo,
}: {
  estado: EstadoAutorizacionCotizacion | undefined
  /** Quien tiene cotizaciones.cambiar_precio decide desde aquí mismo. */
  puedeDecidir: boolean
  puedeEditar: boolean
  corrigiendo: boolean
  onVolverAlPermitido: () => void
  onPedirDeNuevo: () => void
}) {
  const solicitud = estado?.solicitud
  if (!solicitud) return null

  if (solicitud.estado === 'pendiente' && estado.precio_por_autorizar) {
    if (puedeDecidir) {
      return <SolicitudAutorizacionCard solicitud={solicitud} puedeDecidir className="border-amber-200 ring-1 ring-amber-100" />
    }
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="status">
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-amber-600" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-amber-900">Esperando autorización del precio</p>
          <p className="mt-0.5 text-amber-800">
            La pediste {haceCuanto(solicitud.created_at)}. Mientras tanto puedes seguir editando, pero no enviarla ni
            aceptarla. Esta pantalla se actualiza sola cuando decidan.
          </p>
        </div>
      </div>
    )
  }

  if (solicitud.estado === 'rechazada' && estado.precio_por_autorizar) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-red-900">
              No se autorizó el precio
              {solicitud.resuelta_por_nombre && <span className="font-normal text-red-800"> · {solicitud.resuelta_por_nombre}</span>}
            </p>
            {solicitud.comentario && <p className="mt-0.5 break-words text-red-800">“{solicitud.comentario}”</p>}
            <p className="mt-1 text-xs text-red-700">
              Vuelve al precio permitido o ajústalo y pide autorización de nuevo para poder enviarla.
            </p>
          </div>
        </div>
        {puedeEditar && (
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" className="border-red-200 bg-white" disabled={corrigiendo} onClick={onPedirDeNuevo}>
              Pedir de nuevo
            </Button>
            <Button size="sm" disabled={corrigiendo} onClick={onVolverAlPermitido}>
              {corrigiendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
              Volver al precio permitido
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (solicitud.estado === 'autorizada' && !solicitud.directa && !estado.precio_por_autorizar) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm" role="status">
        <BadgeCheck className="h-4 w-4 shrink-0 text-green-600" />
        <p className="min-w-0 text-green-900">
          <span className="font-semibold">Precio autorizado</span>
          {solicitud.resuelta_por_nombre && ` por ${solicitud.resuelta_por_nombre}`}
          {solicitud.resuelta_en && <span className="text-green-800"> · {formatDateTime(solicitud.resuelta_en)}</span>}
          {solicitud.comentario && <span className="text-green-800"> · “{solicitud.comentario}”</span>}
        </p>
      </div>
    )
  }

  return null
}

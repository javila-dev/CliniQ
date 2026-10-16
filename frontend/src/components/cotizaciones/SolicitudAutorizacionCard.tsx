'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Check, Loader2, MessageSquareQuote, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/hooks/use-toast'
import { autorizacionesPrecioApi } from '@/lib/api/cotizaciones'
import { mensajeDeError } from '@/lib/errores'
import { cn, formatDateTime } from '@/lib/utils'
import type { ItemAutorizacionPrecio, SolicitudAutorizacionPrecio } from '@/types/cotizaciones'

function cop(valor: string | number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(valor))
}

/** "hace 5 min", "hace 2 h" o la fecha: quien autoriza ve cuánto lleva esperando. */
export function haceCuanto(iso: string) {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutos < 1) return 'hace un momento'
  if (minutos < 60) return `hace ${minutos} min`
  if (minutos < 24 * 60) return `hace ${Math.round(minutos / 60)} h`
  return formatDateTime(iso)
}

function etiquetaRegla(item: ItemAutorizacionPrecio) {
  if (item.regla === 'precio') return 'Bajo el precio de catálogo'
  const max = Number(item.descuento_maximo_pct)
  return max > 0 ? `Descuento sobre el máximo (${max.toLocaleString('es-CO')} %)` : 'Este ítem no admite descuento'
}

function FilaItem({ item }: { item: ItemAutorizacionPrecio }) {
  const cantidad = item.num_citas > 1 ? ` × ${item.num_citas}` : ''
  return (
    <li className="grid grid-cols-1 gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{item.descripcion}{cantidad && <span className="font-normal text-gray-500">{cantidad}</span>}</p>
        <p className="mt-0.5 text-xs text-amber-700">{etiquetaRegla(item)}</p>
      </div>
      <dl className="grid grid-cols-3 gap-x-5 text-right text-xs sm:min-w-[19rem]">
        <div>
          <dt className="text-gray-500">Mínimo permitido</dt>
          <dd className="mt-0.5 tabular-nums text-gray-700">{cop(item.minimo)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Pide</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">{cop(item.precio_pedido)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Diferencia</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rose-700">
            −{cop(item.diferencia)}
            <span className="ml-1 font-normal text-rose-600/80">({Number(item.diferencia_pct).toLocaleString('es-CO')} %)</span>
          </dd>
        </div>
      </dl>
    </li>
  )
}

interface Props {
  solicitud: SolicitudAutorizacionPrecio
  /** Bandeja: muestra paciente, sede y el enlace a la cotización. */
  conContexto?: boolean
  /** Puede decidir (tiene cotizaciones.cambiar_precio en esa sede). */
  puedeDecidir?: boolean
  onDecidida?: (solicitud: SolicitudAutorizacionPrecio) => void
  className?: string
}

/** Lo que el autorizador necesita para decidir: qué se pide, cuánto baja y por qué. */
export function SolicitudAutorizacionCard({ solicitud, conContexto, puedeDecidir, onDecidida, className }: Props) {
  const queryClient = useQueryClient()
  const [rechazando, setRechazando] = useState(false)
  const [comentario, setComentario] = useState('')
  const deja = Number(solicitud.total_permitido) - Number(solicitud.total_pedido)

  const terminar = (resultado: SolicitudAutorizacionPrecio) => {
    queryClient.invalidateQueries({ queryKey: ['autorizaciones-precio'] })
    queryClient.invalidateQueries({ queryKey: ['cotizacion-autorizacion', resultado.cotizacion] })
    queryClient.invalidateQueries({ queryKey: ['cotizaciones'] })
    onDecidida?.(resultado)
  }
  const alFallar = (err: unknown) => {
    // Otro autorizador pudo decidir antes: se refresca para que no quede colgada.
    queryClient.invalidateQueries({ queryKey: ['autorizaciones-precio'] })
    toast.error('No se pudo guardar la decisión', mensajeDeError(err))
  }

  const autorizar = useMutation({
    mutationFn: () => autorizacionesPrecioApi.autorizar(solicitud.id),
    onSuccess: (r) => {
      toast.success('Precio autorizado', `${r.solicitada_por_nombre ?? 'El asesor'} ya puede enviar la cotización.`)
      terminar(r)
    },
    onError: alFallar,
  })
  const rechazar = useMutation({
    mutationFn: () => autorizacionesPrecioApi.rechazar(solicitud.id, comentario.trim()),
    onSuccess: (r) => {
      toast.success('Solicitud rechazada', 'El asesor verá tu comentario en la cotización.')
      setRechazando(false)
      setComentario('')
      terminar(r)
    },
    onError: alFallar,
  })
  const ocupado = autorizar.isPending || rechazar.isPending

  return (
    <article className={cn('rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <div className="min-w-0">
          {conContexto ? (
            <p className="text-sm font-semibold text-gray-900">
              {solicitud.paciente_nombre}
              {solicitud.sede_nombre && <span className="font-normal text-gray-500"> · {solicitud.sede_nombre}</span>}
            </p>
          ) : (
            <p className="text-sm font-semibold text-gray-900">Precio por autorizar</p>
          )}
          <p className="mt-0.5 text-xs text-gray-500">
            Pide {solicitud.solicitada_por_nombre ?? 'alguien del equipo'} · {haceCuanto(solicitud.created_at)}
          </p>
        </div>
        {conContexto && (
          <Link
            href={`/cotizaciones/${solicitud.cotizacion}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver cotización <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>

      {solicitud.motivo && (
        <blockquote className="mx-5 mt-3 flex gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 break-words">{solicitud.motivo}</span>
        </blockquote>
      )}

      <ul className="mx-5 mt-3 divide-y divide-gray-100">
        {solicitud.items.map((item) => <FilaItem key={`${item.clave}-${item.precio_pedido}`} item={item} />)}
      </ul>

      <div className="mx-5 mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-gray-100 pt-3 text-sm">
        <p className="text-gray-600">
          Total con estos precios <span className="font-semibold tabular-nums text-gray-900">{cop(solicitud.total_pedido)}</span>
          <span className="text-gray-400"> · con lo permitido {cop(solicitud.total_permitido)}</span>
        </p>
        {deja > 0 && (
          <p className="text-xs font-medium text-rose-700">La clínica deja de recibir {cop(deja)}</p>
        )}
      </div>

      {puedeDecidir && solicitud.estado === 'pendiente' ? (
        <footer className="mt-4 border-t border-gray-100 px-5 py-3">
          {rechazando ? (
            <div className="space-y-2">
              <label htmlFor={`rechazo-${solicitud.id}`} className="text-xs font-medium text-gray-700">
                ¿Por qué no se autoriza? El asesor lo verá en la cotización.
              </label>
              <Textarea
                id={`rechazo-${solicitud.id}`}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
                maxLength={1000}
                autoFocus
                placeholder="Ej.: este mes el máximo es 10 %; ofrécele la promoción de verano."
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => { setRechazando(false); setComentario('') }}>
                  Volver
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={ocupado || !comentario.trim()}
                  onClick={() => rechazar.mutate()}
                >
                  {rechazar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Rechazar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                disabled={ocupado}
                onClick={() => setRechazando(true)}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Rechazar
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={ocupado} onClick={() => autorizar.mutate()}>
                {autorizar.isPending
                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  : <Check className="mr-1.5 h-3.5 w-3.5" />}
                Autorizar
              </Button>
            </div>
          )}
        </footer>
      ) : solicitud.estado !== 'pendiente' ? (
        <footer
          className={cn(
            'mt-4 rounded-b-xl border-t px-5 py-3 text-xs',
            solicitud.estado === 'autorizada' ? 'border-green-100 bg-green-50/60 text-green-800' : 'border-red-100 bg-red-50/60 text-red-800',
          )}
        >
          <p className="font-medium">
            {solicitud.estado === 'autorizada' ? 'Autorizada' : 'Rechazada'}
            {solicitud.resuelta_por_nombre && ` por ${solicitud.resuelta_por_nombre}`}
            {solicitud.resuelta_en && ` · ${formatDateTime(solicitud.resuelta_en)}`}
          </p>
          {solicitud.comentario && <p className="mt-0.5 break-words">{solicitud.comentario}</p>}
        </footer>
      ) : (
        <div className="h-4" />
      )}
    </article>
  )
}

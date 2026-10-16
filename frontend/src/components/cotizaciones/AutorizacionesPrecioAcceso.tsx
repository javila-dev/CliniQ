'use client'

import Link from 'next/link'
import { ArrowRight, BadgeCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAutorizacionesPendientes } from '@/hooks/useAutorizacionesPrecio'

/** Acceso a la bandeja de autorizaciones de precio desde Cotizaciones. Solo para
 *  quien autoriza (cotizaciones.cambiar_precio). Reemplaza el ítem del menú
 *  lateral, que lo recargaba. */
export function AutorizacionesBoton() {
  const { puedeAutorizar, pendientes } = useAutorizacionesPendientes()
  if (!puedeAutorizar) return null
  return (
    <Button asChild variant="outline">
      <Link href="/autorizaciones">
        <BadgeCheck className="h-4 w-4 mr-2" />
        Autorizaciones
        {pendientes > 0 && (
          <span className="ml-2 rounded-full bg-rose-500 px-1.5 text-[11px] font-bold leading-5 text-white">
            {pendientes}
          </span>
        )}
      </Link>
    </Button>
  )
}

/** Aviso en el dashboard cuando hay precios esperando la decisión de quien
 *  autoriza. Sin solicitudes no aparece: el historial está en Cotizaciones →
 *  Autorizaciones. */
export function AutorizacionesPendientesBanner() {
  const { puedeAutorizar, pendientes } = useAutorizacionesPendientes()
  if (!puedeAutorizar || pendientes === 0) return null
  return (
    <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
          <BadgeCheck className="h-5 w-5 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {pendientes === 1 ? '1 precio espera tu autorización' : `${pendientes} precios esperan tu autorización`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Mientras esperan, esas cotizaciones no se pueden enviar ni aceptar.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/autorizaciones">
            Revisar<ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

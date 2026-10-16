'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { toast } from '@/hooks/use-toast'
import { useAutorizacionesPendientes } from '@/hooks/useAutorizacionesPrecio'

/** Aviso emergente para quien autoriza precios cuando llega una solicitud nueva
 * mientras está conectado. La primera lectura no avisa: para eso está el contador. */
export function AvisoAutorizacionesPrecio() {
  const { puedeAutorizar, pendientes, ultimaEn } = useAutorizacionesPendientes()
  const pathname = usePathname()
  const vistaRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!puedeAutorizar) return
    const anterior = vistaRef.current
    vistaRef.current = ultimaEn
    if (anterior === undefined || !ultimaEn || ultimaEn === anterior) return
    if (anterior && new Date(ultimaEn) <= new Date(anterior)) return
    if (pathname.startsWith('/autorizaciones')) return
    toast({
      title: 'Te piden autorizar un precio',
      description: (
        <span>
          {pendientes === 1 ? 'Hay 1 solicitud esperando.' : `Hay ${pendientes} solicitudes esperando.`}{' '}
          <Link href="/autorizaciones" className="font-semibold underline underline-offset-2">
            Revisar ahora
          </Link>
        </span>
      ),
    })
  }, [puedeAutorizar, ultimaEn, pendientes, pathname])

  return null
}

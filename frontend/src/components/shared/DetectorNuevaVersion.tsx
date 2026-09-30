'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Recarga la app sola cuando hubo un deploy, sin avisar al usuario.
 *
 * Una pestaña abierta todo el día sigue corriendo el JS con el que cargó:
 * las navegaciones internas no vuelven a pedir el HTML. Este componente:
 *
 *  1. Al montar, pide /api/version y guarda ese build como "el mío".
 *  2. Vuelve a consultar cada pocos minutos y al volver a la pestaña. Si el
 *     servidor responde otro build, marca la app como desactualizada.
 *  3. Con la marca puesta, la siguiente navegación interna se hace como
 *     carga completa (click en link) o recarga la página nueva (navegación
 *     programática). Nunca recarga en medio de una pantalla: un formulario a
 *     medio llenar no se pierde.
 *  4. Si un chunk del build viejo ya no existe (ChunkLoadError), recarga una
 *     vez, con un candado en sessionStorage para no entrar en bucle.
 */

const INTERVALO_MS = 5 * 60 * 1000
const CLAVE_RECARGA = 'cliniq:recarga-por-chunk'
const VENTANA_ANTI_BUCLE_MS = 30 * 1000

function esErrorDeChunk(motivo: unknown): boolean {
  const texto =
    motivo instanceof Error ? `${motivo.name} ${motivo.message}` : String(motivo ?? '')
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
    texto,
  )
}

function recargarPorChunk() {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA) ?? 0)
    if (Date.now() - ultima < VENTANA_ANTI_BUCLE_MS) return
    sessionStorage.setItem(CLAVE_RECARGA, String(Date.now()))
  } catch {
    // sessionStorage bloqueado: sin candado no arriesgamos un bucle.
    return
  }
  window.location.reload()
}

async function pedirBuildId(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { buildId?: string }
    return data.buildId && data.buildId !== 'desconocido' ? data.buildId : null
  } catch {
    // Sin red o servidor reiniciando durante el deploy: se reintenta luego.
    return null
  }
}

export function DetectorNuevaVersion() {
  const pathname = usePathname()
  const buildPropio = useRef<string | null>(null)
  const desactualizada = useRef(false)
  const pathAnterior = useRef(pathname)

  // 1 y 2: detectar el deploy.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return

    const verificar = async () => {
      if (desactualizada.current) return
      const actual = await pedirBuildId()
      if (!actual) return
      if (buildPropio.current === null) buildPropio.current = actual
      else if (actual !== buildPropio.current) desactualizada.current = true
    }

    const alVolver = () => {
      if (document.visibilityState === 'visible') verificar()
    }

    verificar()
    const intervalo = setInterval(verificar, INTERVALO_MS)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [])

  // 3a: click en link interno con la app desactualizada -> carga completa del destino.
  useEffect(() => {
    const alHacerClick = (e: MouseEvent) => {
      if (!desactualizada.current || e.defaultPrevented) return
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as HTMLElement | null)?.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const href = anchor.getAttribute('href')
      if (!href?.startsWith('/') || href.startsWith('//')) return
      e.preventDefault()
      window.location.assign(href)
    }
    // Captura: corre antes que el onClick de <Link> de Next.
    document.addEventListener('click', alHacerClick, true)
    return () => document.removeEventListener('click', alHacerClick, true)
  }, [])

  // 3b: navegación programática (router.push) con la app desactualizada.
  useEffect(() => {
    if (pathname === pathAnterior.current) return
    pathAnterior.current = pathname
    if (desactualizada.current) window.location.reload()
  }, [pathname])

  // 4: chunk del build viejo que ya no existe.
  useEffect(() => {
    const alError = (e: ErrorEvent) => {
      if (esErrorDeChunk(e.error ?? e.message)) recargarPorChunk()
    }
    const alRechazo = (e: PromiseRejectionEvent) => {
      if (esErrorDeChunk(e.reason)) recargarPorChunk()
    }
    window.addEventListener('error', alError)
    window.addEventListener('unhandledrejection', alRechazo)
    return () => {
      window.removeEventListener('error', alError)
      window.removeEventListener('unhandledrejection', alRechazo)
    }
  }, [])

  return null
}

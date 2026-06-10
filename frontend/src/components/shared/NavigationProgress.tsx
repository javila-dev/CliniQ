'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const [progress, setProgress] = useState(0)  // 0–1
  const [visible, setVisible] = useState(false)
  const prevPath = useRef(pathname)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms); timers.current.push(t)
  }

  const start = () => {
    clear()
    setVisible(true)
    setProgress(0.12)
    later(() => setProgress(0.45), 120)
    later(() => setProgress(0.72), 500)
  }

  // Escucha clicks en links internos para detectar inicio de navegación
  // (no toca pushState — evita conflicto con el router de Next.js)
  useEffect(() => {
    const onClik = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href?.startsWith('/')) return                        // solo links internos
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return  // shortcuts del OS
      if (anchor.target === '_blank') return
      start()
    }

    document.addEventListener('click', onClik)
    return () => { document.removeEventListener('click', onClik); clear() }
  }, [])

  // Completa cuando la nueva página ya montó
  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname
    clear()
    setProgress(1)
    later(() => { setVisible(false); setProgress(0) }, 380)
  }, [pathname])

  if (!visible && progress === 0) return null

  const sharedStyle = (extra: React.CSSProperties): React.CSSProperties => ({
    transform: `scaleX(${progress})`,
    opacity: visible ? 1 : 0,
    transition: progress < 1
      ? 'transform 0.45s cubic-bezier(0.4,0,0.2,1)'
      : 'transform 0.15s ease-out, opacity 0.3s ease 0.08s',
    ...extra,
  })

  const barStyle = (extra: React.CSSProperties): React.CSSProperties => ({
    ...sharedStyle(extra),
    boxShadow: '0 0 8px 2px hsl(334 72% 58% / 0.7)',
  })

  return (
    <>
      {/* Mobile — debajo del topbar (h-14 = 3.5rem) */}
      <div
        className="lg:hidden fixed h-[3px] bg-rose-500 z-[60] origin-left pointer-events-none"
        style={barStyle({ top: '3.5rem', left: 0, right: 0 })}
      />
      {/* Desktop — arriba, a la derecha del sidebar (w-60 = 15rem) */}
      <div
        className="hidden lg:block fixed h-[3px] bg-rose-500 z-[60] origin-left pointer-events-none"
        style={barStyle({ top: 0, left: '15rem', right: 0 })}
      />
    </>
  )
}

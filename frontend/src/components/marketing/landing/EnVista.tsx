'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Marca con data-en-vista si el bloque ya entró en pantalla (una sola vez).
 * Sin JS el atributo no existe y el CSS muestra el estado final: la animación
 * de entrada solo se arma cuando el cliente lo pone en "false".
 */
export function EnVista({
  as: Tag = 'div',
  className = '',
  children,
  ...resto
}: { as?: 'div' | 'figure' | 'section'; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement | null>(null)
  const [estado, setEstado] = useState<'false' | 'true' | undefined>(undefined)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    setEstado('false')
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setEstado('true')
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref as never} data-en-vista={estado} className={className} {...resto}>
      {children}
    </Tag>
  )
}

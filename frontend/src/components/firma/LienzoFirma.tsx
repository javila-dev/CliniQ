'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { cn } from '@/lib/utils'

export interface LienzoFirmaHandle {
  /** PNG con fondo transparente, recortado al trazo. null si está vacío. */
  obtenerPng: () => string | null
  limpiar: () => void
}

interface LienzoFirmaProps {
  alto?: number
  className?: string
  onCambio?: (vacio: boolean) => void
}

/** Recorta el canvas al área dibujada (con un margen) y lo devuelve como PNG. */
function recortarAPng(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')
  const { width, height } = canvas
  const pixeles = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixeles[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return canvas.toDataURL('image/png')
  const margen = 8
  minX = Math.max(0, minX - margen)
  minY = Math.max(0, minY - margen)
  maxX = Math.min(width - 1, maxX + margen)
  maxY = Math.min(height - 1, maxY + margen)
  const recorte = document.createElement('canvas')
  recorte.width = maxX - minX + 1
  recorte.height = maxY - minY + 1
  recorte.getContext('2d')?.drawImage(canvas, minX, minY, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height)
  return recorte.toDataURL('image/png')
}

export const LienzoFirma = forwardRef<LienzoFirmaHandle, LienzoFirmaProps>(function LienzoFirma(
  { alto = 200, className, onCambio },
  ref,
) {
  const sigRef = useRef<SignatureCanvas>(null)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(0)

  // El canvas necesita un ancho en píxeles: se ajusta al contenedor (y al girar el celular).
  useEffect(() => {
    const el = contenedorRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const nuevo = Math.floor(entries[0].contentRect.width)
      setAncho(prev => (prev === nuevo ? prev : nuevo))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { onCambio?.(true) }, [ancho, onCambio])

  useImperativeHandle(ref, () => ({
    obtenerPng: () => {
      const firma = sigRef.current
      if (!firma || firma.isEmpty()) return null
      return recortarAPng(firma.getCanvas())
    },
    limpiar: () => {
      sigRef.current?.clear()
      onCambio?.(true)
    },
  }), [onCambio])

  return (
    <div
      ref={contenedorRef}
      className={cn('relative w-full rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none', className)}
      style={{ height: alto }}
    >
      {ancho > 0 && (
        <SignatureCanvas
          ref={sigRef}
          penColor="#0f172a"
          minWidth={1.2}
          maxWidth={2.8}
          canvasProps={{ width: ancho, height: alto, className: 'block rounded-lg' }}
          onEnd={() => onCambio?.(sigRef.current?.isEmpty() ?? true)}
        />
      )}
      <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-gray-300" />
      <span className="pointer-events-none absolute bottom-2 left-6 text-[11px] text-gray-500">Firma aquí</span>
    </div>
  )
})

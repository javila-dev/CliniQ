'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgendaTourProps {
  userId?: string
  replaySignal: number
}

interface TourStep {
  selector: string
  eyebrow: string
  title: string
  description: string
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="period-switcher"]',
    eyebrow: 'Organiza tu tiempo',
    title: 'Cambia el periodo de la agenda',
    description: 'Alterna entre Día, Semana y Mes. La presentación que elijas se mantiene cuando cambias de periodo.',
  },
  {
    selector: '[data-tour="date-navigation"]',
    eyebrow: 'Muévete rápido',
    title: 'Navega entre fechas',
    description: 'Usa las flechas para avanzar o retroceder y pulsa Hoy para regresar inmediatamente a la fecha actual.',
  },
  {
    selector: '[data-tour="view-mode"]',
    eyebrow: 'Hazla tuya',
    title: 'Elige cómo quieres verla',
    description: 'Usa Calendario, Columnas o Lista y ajusta la densidad. Esta preferencia es personal y se recuerda automáticamente.',
  },
  {
    selector: '[data-tour="agenda-filters"]',
    eyebrow: 'Encuentra lo importante',
    title: 'Combina los filtros',
    description: 'Busca un paciente y filtra por sede o por varios profesionales al mismo tiempo. Todos los modos respetan estos filtros.',
  },
  {
    selector: '[data-tour="agenda-actions"]',
    eyebrow: 'Acciones frecuentes',
    title: 'Gestiona la jornada',
    description: 'Desde aquí puedes compartir el autoregistro, administrar bloqueos y crear una nueva cita.',
  },
  {
    selector: '[data-tour="agenda-canvas"]',
    eyebrow: 'Tu centro de trabajo',
    title: 'Abre cualquier cita para gestionarla',
    description: 'Pulsa una cita para consultar sus datos, confirmarla, cambiar su estado o continuar el flujo de atención.',
  },
]

function storageKey(userId: string) {
  return `cliniq:agenda-tour:v1:${userId}`
}

export function AgendaTour({ userId, replaySignal }: AgendaTourProps) {
  const [open, setOpen] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const finish = useCallback(() => {
    if (userId) {
      try { localStorage.setItem(storageKey(userId), 'completed') } catch { /* La sesión puede continuar sin persistencia. */ }
    }
    setOpen(false)
    setStepIndex(0)
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const shouldReplay = replaySignal > 0
    let completed = false
    try { completed = localStorage.getItem(storageKey(userId)) === 'completed' } catch { /* Ignorar almacenamiento bloqueado. */ }
    if (completed && !shouldReplay) return

    const timer = window.setTimeout(() => {
      setStepIndex(0)
      setOpen(true)
    }, shouldReplay ? 0 : 650)
    return () => window.clearTimeout(timer)
  }, [userId, replaySignal])

  useEffect(() => {
    if (!open) return
    const updateRect = () => {
      const element = document.querySelector(STEPS[stepIndex].selector)
      setRect(element?.getBoundingClientRect() ?? null)
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    const observer = new ResizeObserver(updateRect)
    const target = document.querySelector(STEPS[stepIndex].selector)
    if (target) observer.observe(target)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
      observer.disconnect()
    }
  }, [open, stepIndex])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight') setStepIndex((current) => Math.min(STEPS.length - 1, current + 1))
      if (event.key === 'ArrowLeft') setStepIndex((current) => Math.max(0, current - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [finish, open])

  if (!open || !rect) return null

  const step = STEPS[stepIndex]
  const padding = 7
  const spotlight = {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
    height: rect.height + padding * 2,
  }
  const cardWidth = Math.min(370, window.innerWidth - 24)
  const estimatedCardHeight = 245
  const placeBelow = spotlight.top + spotlight.height + estimatedCardHeight + 16 < window.innerHeight
  const cardTop = placeBelow
    ? spotlight.top + spotlight.height + 14
    : Math.max(12, spotlight.top - estimatedCardHeight - 14)
  const cardLeft = Math.min(
    window.innerWidth - cardWidth - 12,
    Math.max(12, spotlight.left + spotlight.width / 2 - cardWidth / 2),
  )
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Visita guiada de la agenda">
      <div className="absolute inset-0" onClick={finish} />
      <div
        className="pointer-events-none fixed rounded-xl ring-2 ring-white/90 transition-all duration-300 ease-out"
        style={{
          ...spotlight,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.76), 0 0 0 5px rgba(217, 70, 239, 0.35)',
        }}
      />

      <div
        className="fixed overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl transition-all duration-300"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="h-1 bg-gradient-to-r from-primary via-fuchsia-500 to-violet-500" />
        <div className="p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{step.eyebrow}</p>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-gray-950">{step.title}</h2>
            </div>
            <button type="button" onClick={finish} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Cerrar visita guiada">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm leading-relaxed text-gray-600">{step.description}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-label={`Paso ${stepIndex + 1} de ${STEPS.length}`}>
              {STEPS.map((_, index) => (
                <span key={index} className={cn('h-1.5 rounded-full transition-all', index === stepIndex ? 'w-5 bg-primary' : 'w-1.5 bg-gray-200')} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIndex === 0 ? (
                <button type="button" onClick={finish} className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-900">Omitir</button>
              ) : (
                <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <ArrowLeft className="h-3.5 w-3.5" /> Anterior
                </button>
              )}
              <button
                type="button"
                onClick={() => isLast ? finish() : setStepIndex((current) => current + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                {isLast ? <><Check className="h-3.5 w-3.5" /> Entendido</> : <>Siguiente <ArrowRight className="h-3.5 w-3.5" /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export const CAPTURAS = {
  dashboard: { src: '/img/landing/dashboard.png', w: 2880, h: 1800, alt: 'Dashboard administrativo de CliniQ con citas, ingresos, cartera y resultados de la clínica' },
  agenda: { src: '/img/landing/agenda-v3.png', w: 1752, h: 1280, alt: 'Agenda semanal de CliniQ con citas por profesional y sede' },
  cartera: { src: '/img/landing/cartera-v3.png', w: 1752, h: 1400, alt: 'Cartera de un paciente con cuotas, pagos y saldo pendiente en CliniQ' },
  atenciones: { src: '/img/landing/atenciones-v3.png', w: 1752, h: 1280, alt: 'Cola de atención en vivo para profesionales y recepción en CliniQ' },
}

export type Captura = keyof typeof CAPTURAS

export function Ventana({
  captura,
  caption = 'CliniQ en operación',
  priority = false,
  className = '',
}: {
  captura: Captura
  caption?: string
  priority?: boolean
  className?: string
}) {
  const img = CAPTURAS[captura]
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0d0811] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)] ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-white/[0.06] px-4 py-3">
        <span className="lv3-mono text-[10px] uppercase tracking-[0.14em] text-white/60">{caption}</span>
        <span className="lv3-mono text-[10px] uppercase tracking-[0.14em] text-white/60">Datos de ejemplo</span>
      </div>
      <Image
        src={img.src}
        alt={img.alt}
        width={img.w}
        height={img.h}
        priority={priority}
        sizes="(min-width: 1024px) 640px, 100vw"
        className="block h-auto w-full"
      />
    </div>
  )
}

export function CtaPrimary({ href, children, compact = false }: { href: string; children: React.ReactNode; compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href={href}
        className="landing-cta group inline-flex h-9 items-center gap-2 rounded-[0.7rem_0.7rem_0.7rem_0.2rem] bg-[#d9226f] px-3.5 text-sm font-semibold text-white"
      >
        {children} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </Link>
    )
  }
  return (
    <Link
      href={href}
      className="landing-cta group inline-flex h-12 items-center justify-center gap-4 rounded-[0.9rem_0.9rem_0.9rem_0.25rem] bg-[#d9226f] px-5 text-[15px] font-semibold text-white"
    >
      {children}
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#b01a5b]">
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  )
}

export function Dash({ tone = 'rose' }: { tone?: 'rose' | 'muted' }) {
  return <span aria-hidden className={`mt-[0.7rem] h-px w-3 shrink-0 ${tone === 'rose' ? 'bg-[var(--lv3-lit)]' : 'bg-white/30'}`} />
}

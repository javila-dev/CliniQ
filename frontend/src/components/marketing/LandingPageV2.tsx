'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, ChevronRight, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { registroPublicoApi } from '@/lib/api/clinicas'

const COP_FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatPrecio(precio: string | null) {
  if (precio === null) return 'Cotización'
  return COP_FMT.format(parseFloat(precio))
}

const CAPTURAS = {
  dashboard: { src: '/img/landing/dashboard.png', w: 2880, h: 1800, alt: 'Dashboard administrativo de CliniQ con citas, ingresos, cartera y resultados de la clínica' },
  agenda: { src: '/img/landing/agenda.png', w: 2880, h: 1620, alt: 'Agenda semanal de CliniQ con citas por profesional y sede' },
  cartera: { src: '/img/landing/cartera.png', w: 2880, h: 1280, alt: 'Cartera de un paciente con cuotas, pagos y saldo pendiente en CliniQ' },
  atenciones: { src: '/img/landing/atenciones.png', w: 2880, h: 1300, alt: 'Cola de atención en vivo para profesionales y recepción en CliniQ' },
}

type Captura = keyof typeof CAPTURAS
type Rol = 'recepcion' | 'profesional' | 'administracion'

function Ventana({ captura, priority = false, className = '' }: { captura: Captura; priority?: boolean; className?: string }) {
  const img = CAPTURAS[captura]
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#120b12] shadow-[0_32px_90px_-28px_rgba(71,10,39,0.55)] ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="ml-3 text-[9px] font-medium uppercase tracking-[0.18em] text-white/25">CliniQ en operación</span>
      </div>
      <Image src={img.src} alt={img.alt} width={img.w} height={img.h} priority={priority}
        sizes="(min-width: 1024px) 760px, 100vw" className="block h-auto w-full" />
    </div>
  )
}

const RECORRIDO: Record<Rol, { label: string; eyebrow: string; title: string; desc: string; captura: Captura; bullets: string[] }> = {
  recepcion: {
    label: 'Recepción', eyebrow: 'Antes de la atención',
    title: 'La agenda deja de ser una conversación fragmentada.',
    desc: 'Recepción coordina citas, sedes, profesionales y llegadas desde una sola vista. El equipo sabe qué ocurre sin perseguir respuestas por WhatsApp.',
    captura: 'agenda',
    bullets: ['Agenda diaria, semanal y mensual', 'Confirmaciones y recordatorios', 'Autorregistro y check-in del paciente'],
  },
  profesional: {
    label: 'Profesionales', eyebrow: 'Durante la atención',
    title: 'Cada sesión empieza con el contexto completo.',
    desc: 'El profesional ve quién sigue y continúa el proceso clínico con historia, fotografías, zonas tratadas, consentimientos y evolución por sesión.',
    captura: 'atenciones',
    bullets: ['Cola de atención en vivo', 'Historia clínica y registro fotográfico', 'Protocolos, zonas y seguimiento por sesión'],
  },
  administracion: {
    label: 'Administración', eyebrow: 'Después de la atención',
    title: 'Lo vendido, lo cobrado y lo pendiente dejan de vivir separados.',
    desc: 'Cotizaciones, acuerdos de pago, cuotas y mora quedan conectados con el paciente y el tratamiento que originó cada movimiento.',
    captura: 'cartera',
    bullets: ['Cotizaciones, cobros y cartera', 'Acuerdos de pago con firma electrónica', 'Resultados, caja y trazabilidad'],
  },
}

const DOLORES = [
  ['Información dispersa', 'La historia está en papel, las fotos en un celular y los pagos en otra hoja.'],
  ['Equipo descoordinado', 'Recepción, profesionales y administración trabajan con versiones distintas del día.'],
  ['Cartera reactiva', 'La mora se descubre tarde porque las cuotas no están unidas al tratamiento.'],
  ['Sedes sin contexto', 'El inventario y la operación se mezclan aunque cada sede tenga una realidad distinta.'],
]

const CAPACIDADES = [
  {
    label: 'Historia clínica',
    title: 'Historia clínica que acompaña el tratamiento',
    desc: 'Fotografías, zonas anatómicas, notas, antecedentes y evolución organizados alrededor de cada paciente y cada sesión.',
  },
  {
    label: 'Documentos e identidad',
    title: 'Consentimientos e identidad verificada',
    desc: 'Documentos por procedimiento con firma electrónica, más verificación facial y OTP por WhatsApp para confirmar al paciente que llega.',
  },
  {
    label: 'Operación por sede',
    title: 'Cada sede con su propia operación',
    desc: 'Stock, compras y costo promedio independientes por sede, con recordatorios y documentos de WhatsApp dentro del mismo flujo.',
  },
  { label: 'Control', title: 'Permisos y auditoría', desc: 'Cada rol ve y hace lo necesario. Las acciones sensibles quedan registradas por usuario.' },
]

const FAQ = [
  ['¿CliniQ sirve para una clínica con varias sedes?', 'Sí. La sede es una unidad operativa real: agenda, stock, compras y operación diaria respetan la ubicación física donde ocurren.'],
  ['¿Podemos migrar los pacientes que ya tenemos?', 'Sí. CliniQ incluye herramientas de carga y un proceso de puesta en marcha para organizar la información inicial de la clínica.'],
  ['¿Los profesionales y recepción ven lo mismo?', 'No necesariamente. Los permisos se configuran por rol para que cada persona acceda únicamente a la información y acciones que necesita.'],
  ['¿Cómo funciona la prueba?', 'Puedes registrar la clínica y usar CliniQ durante 14 días sin tarjeta de crédito. Así puedes configurar el equipo y probar el flujo real antes de elegir un plan.'],
]

export function LandingPageV2() {
  const router = useRouter()
  const { hasCheckedAuth, isAuthenticated, loadUser } = useAuthStore()
  const [rolActivo, setRolActivo] = useState<Rol>('recepcion')
  const [headerSolid, setHeaderSolid] = useState(false)
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => { if (!hasCheckedAuth) loadUser() }, [hasCheckedAuth, loadUser])
  useEffect(() => { if (hasCheckedAuth && isAuthenticated) router.replace('/dashboard') }, [hasCheckedAuth, isAuthenticated, router])
  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => { element.dataset.visible = 'true' })
      return
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          ;(entry.target as HTMLElement).dataset.visible = 'true'
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' })
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const HEADER_HEIGHT = 64
    const updateHeaderStyle = () => {
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? 0
      setHeaderSolid(heroBottom <= HEADER_HEIGHT)
    }
    updateHeaderStyle()
    window.addEventListener('scroll', updateHeaderStyle, { passive: true })
    window.addEventListener('resize', updateHeaderStyle)
    return () => {
      window.removeEventListener('scroll', updateHeaderStyle)
      window.removeEventListener('resize', updateHeaderStyle)
    }
  }, [])

  const { data: planes, isLoading: planesLoading, isError: planesError, isFetching: planesFetching, refetch: recargarPlanes } = useQuery({
    queryKey: ['planes-publicos'], queryFn: registroPublicoApi.planesPublicos, staleTime: 5 * 60 * 1000, retry: 1,
  })
  const recorrido = RECORRIDO[rolActivo]

  return (
    <div className="min-h-screen bg-[#fbfaf9] text-[#211a1f]">
      <header className={`fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${headerSolid ? 'border-black/[0.06] bg-[#fbfaf9]/90 backdrop-blur-xl' : 'border-transparent bg-transparent'}`}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/landing" aria-label="Ir al inicio de CliniQ">
            <Image src={headerSolid ? '/brand/cliniq-logo-horizontal.svg' : '/brand/cliniq-logo-on-dark.svg'} alt="CliniQ" width={116} height={36} className="h-auto w-[104px] sm:w-[116px]" />
          </Link>
          <nav className={`hidden items-center gap-7 text-sm transition-colors duration-300 lg:flex ${headerSolid ? 'text-[#665c63]' : 'text-white/75'}`} aria-label="Navegación principal">
            <a href="#recorrido" className={`transition-colors ${headerSolid ? 'hover:text-[#211a1f]' : 'hover:text-white'}`}>Cómo funciona</a>
            <a href="#capacidades" className={`transition-colors ${headerSolid ? 'hover:text-[#211a1f]' : 'hover:text-white'}`}>Funciones</a>
            <a href="#multisede" className={`transition-colors ${headerSolid ? 'hover:text-[#211a1f]' : 'hover:text-white'}`}>Multisede</a>
            <a href="#precios" className={`transition-colors ${headerSolid ? 'hover:text-[#211a1f]' : 'hover:text-white'}`}>Planes</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className={`hidden text-sm font-medium transition-colors duration-300 sm:inline-flex ${headerSolid ? 'text-[#665c63] hover:text-[#211a1f]' : 'text-white/75 hover:text-white'}`}>Iniciar sesión</Link>
            <Link href="/registro-clinica" className="landing-cta group inline-flex h-9 items-center gap-2 rounded-[0.7rem_0.7rem_0.7rem_0.2rem] bg-[#df2f78] px-3.5 text-sm font-semibold text-white shadow-sm">
              Probar 14 días <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </header>

      <main className="overflow-x-hidden">
        <section ref={heroRef} className="relative overflow-hidden bg-[#170b13] text-white">
          <div aria-hidden className="absolute inset-0">
            <div className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-fuchsia-600/10 blur-3xl" />
            <div className="absolute -right-24 bottom-0 h-[32rem] w-[32rem] rounded-full bg-rose-500/10 blur-3xl" />
            <div className="absolute inset-y-0 left-[52%] hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent lg:block" />
          </div>
          <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-16 sm:py-20 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16 lg:py-24">
            <div>
              <h1 data-reveal className="font-[family-name:var(--font-display)] text-[2.7rem] font-bold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-[4rem]">
                Toda tu clínica, de la cita al cobro.
                <span className="mt-2 block text-rose-300">Sin perder el control entre sedes.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-white/70 sm:text-lg">CliniQ conecta agenda, historia clínica, consentimientos, tratamientos, cartera e inventario para que recepción, profesionales y administración trabajen sobre la misma realidad.</p>
              <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-center">
                <Link href="/registro-clinica" className="landing-cta group inline-flex h-12 items-center justify-center gap-4 rounded-[0.9rem_0.9rem_0.9rem_0.25rem] bg-[#e52f7c] px-5 text-[15px] font-semibold text-white shadow-[0_18px_45px_-16px_rgba(236,72,153,0.8)]">
                  Empezar prueba gratis
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#b91c5c]"><ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
                </Link>
                <a href="#recorrido" className="group inline-flex h-12 items-center justify-center gap-1.5 border-b border-white/20 text-sm font-semibold text-white/75 transition-colors hover:border-rose-300 hover:text-white">Ver cómo funciona <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></a>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/50">
                {['14 días gratis', 'Sin tarjeta', 'Configuración guiada'].map((item) => <span key={item} className="inline-flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-rose-300" /> {item}</span>)}
              </div>
            </div>
            <div className="relative lg:translate-x-8">
              <Ventana captura="agenda" priority className="landing-float relative z-10" />
              <div className="absolute -bottom-7 -left-4 z-20 hidden w-64 rounded-2xl border border-white/10 bg-[#24131f]/95 p-4 shadow-2xl backdrop-blur sm:block lg:-left-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">El mismo día, una sola operación</p>
                <div className="mt-3 space-y-2.5 text-xs text-white/75">
                  <div className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="font-mono text-[10px] text-rose-300">01</span> Agenda por profesional y sede</div>
                  <div className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="font-mono text-[10px] text-rose-300">02</span> Llegadas y cola en tiempo real</div>
                  <div className="grid grid-cols-[1.5rem_1fr] gap-2"><span className="font-mono text-[10px] text-rose-300">03</span> Cobros unidos al paciente</div>
                </div>
              </div>
              <div className="absolute -right-3 -top-5 z-20 hidden rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 backdrop-blur md:inline-flex">Operación conectada</div>
            </div>
          </div>
          <div className="relative border-t border-white/[0.07] bg-white/[0.025]">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-5 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-white/80">Pensado para el día a día de clínicas estéticas y de bienestar en Colombia.</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                <span>Equipos conectados</span><span className="h-1 w-1 rounded-full bg-rose-300/60" />
                <span>Operación por sede</span><span className="h-1 w-1 rounded-full bg-rose-300/60" />
                <span>Control diario</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div data-reveal className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Tu clínica no necesita <span className="text-rose-600">otra agenda</span>. Necesita dejar de perder información entre herramientas.</h2>
              <p className="mt-5 text-base leading-7 text-[#6f656b]">Cuando el equipo crece, cada proceso aislado añade preguntas, reprocesos y decisiones tomadas sin contexto.</p>
            </div>
            <div data-reveal data-reveal-delay="1" className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
              {DOLORES.map(([title, desc]) => (
                <div key={title} className="grid gap-2 py-6 sm:grid-cols-[0.7fr_1.3fr] sm:items-start sm:gap-5">
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">{title}</h3>
                  <p className="text-sm leading-6 text-[#756b71]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="recorrido" className="scroll-mt-16 border-y border-black/[0.06] bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div data-reveal className="max-w-3xl">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl"><span className="text-rose-600">Un solo flujo</span>, visto por todo el equipo.</h2>
              <p className="mt-4 text-base leading-7 text-[#6f656b]">Explora cómo cambia la operación para cada rol, sin duplicar datos ni depender de mensajes sueltos.</p>
            </div>
            <div className="mt-10 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-black/[0.08] bg-[#f7f4f5] p-1" role="tablist" aria-label="Flujo por rol">
              {(Object.keys(RECORRIDO) as Rol[]).map((rol) => (
                <button key={rol} type="button" role="tab" aria-selected={rolActivo === rol} onClick={() => setRolActivo(rol)}
                  className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-all ${rolActivo === rol ? 'bg-[#24131f] text-white shadow-sm' : 'text-[#736970] hover:text-[#24131f]'}`}>{RECORRIDO[rol].label}</button>
              ))}
            </div>
            <div data-reveal data-reveal-delay="1" className="mt-8 grid border-y border-black/[0.1] bg-[#f8f5f6] lg:grid-cols-[0.78fr_1.22fr]">
              <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-14">
                <p className="text-xs font-bold uppercase tracking-[0.17em] text-rose-600">{recorrido.eyebrow}</p>
                <h3 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight sm:text-3xl">{recorrido.title}</h3>
                <p className="mt-5 text-sm leading-6 text-[#71676d] sm:text-base sm:leading-7">{recorrido.desc}</p>
                <ul className="mt-7 space-y-3">
                  {recorrido.bullets.map((bullet) => <li key={bullet} className="grid grid-cols-[1.25rem_1fr] items-start gap-2 text-sm font-medium text-[#443b41]"><span className="mt-2 h-px w-3 bg-rose-500" />{bullet}</li>)}
                </ul>
              </div>
              <div className="min-w-0 bg-[#22131d] p-4 sm:p-7 lg:flex lg:items-center lg:justify-center"><Ventana key={rolActivo} captura={recorrido.captura} className="landing-role-swap w-full lg:max-w-md" /></div>
            </div>
          </div>
        </section>

        <section id="capacidades" className="relative scroll-mt-16 overflow-hidden py-20 sm:py-28">
          <div aria-hidden className="absolute left-[-8rem] top-20 h-80 w-80 rounded-full bg-rose-200/35 blur-[90px]" />
          <div aria-hidden className="absolute right-[-10rem] bottom-12 h-96 w-96 rounded-full bg-fuchsia-100/50 blur-[110px]" />

          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div data-reveal className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div><h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl">Diseñado alrededor de <span className="text-rose-600">cómo trabaja una clínica estética</span>.</h2></div>
              <p className="max-w-2xl text-base leading-7 text-[#6f656b] lg:justify-self-end">Procedimientos, zonas, sesiones, documentos y cobros comparten el mismo contexto. No son campos genéricos añadidos a una agenda.</p>
            </div>

            <div data-reveal data-reveal-delay="1" className="relative mt-14 grid gap-0 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
              <div className="relative z-10 bg-[#1a0d15] p-7 text-white shadow-[0_35px_85px_-38px_rgba(53,9,32,0.8)] sm:p-10 lg:-mr-8 lg:-translate-y-5 lg:p-12">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400">{CAPACIDADES[0].label}</p>
                <h3 className="mt-8 max-w-md font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight sm:text-3xl">{CAPACIDADES[0].title}</h3>
                <p className="mt-4 max-w-lg text-sm leading-6 text-white/60">{CAPACIDADES[0].desc}</p>
                <div className="mt-8 h-px w-12 bg-rose-400/50" aria-hidden />
              </div>
              <div className="grid border-y border-black/[0.1] bg-[#fbfaf9]/85 backdrop-blur-md sm:grid-cols-3 lg:pl-8">
                {CAPACIDADES.slice(1).map(({ label, title, desc }, index) => (
                  <article key={title} className={`border-b border-black/[0.1] p-6 last:border-b-0 sm:border-b-0 sm:p-8 ${index > 0 ? 'sm:border-l sm:border-black/[0.1]' : ''}`}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">{label}</span>
                    <h3 className="mt-5 font-[family-name:var(--font-display)] text-lg font-semibold leading-snug">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-[#71676d]">{desc}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-y border-black/[0.06] bg-[#f3eff1] py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div data-reveal className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl"><span className="text-rose-600">El pulso de la clínica</span>, sin abrir cinco reportes.</h2>
              </div>
              <div className="grid gap-4 border-l border-black/10 pl-5 text-sm leading-6 text-[#6f656b] sm:grid-cols-3">
                <p><strong className="block text-[#251d22]">Operación de hoy</strong>Citas, confirmaciones y atenciones pendientes.</p>
                <p><strong className="block text-[#251d22]">Salud comercial</strong>Cotizaciones, conversión e ingresos del periodo.</p>
                <p><strong className="block text-[#251d22]">Cartera visible</strong>Saldo pendiente y cuotas vencidas para actuar a tiempo.</p>
              </div>
            </div>
            <div data-reveal data-reveal-delay="1" className="relative mx-auto mt-12 max-w-4xl">
              <div aria-hidden className="absolute -inset-x-16 bottom-0 h-32 bg-rose-400/10 blur-3xl" />
              <Ventana captura="dashboard" className="landing-dashboard relative border-black/10 bg-[#170b13] shadow-[0_45px_100px_-35px_rgba(74,17,48,0.45)]" />
              <div className="landing-orbit absolute -right-3 -top-4 hidden h-24 w-24 items-center justify-center border border-rose-400/25 bg-[#fbfaf9]/90 text-center text-[10px] font-bold uppercase tracking-[0.13em] text-rose-600 backdrop-blur sm:flex">Decisiones<br />con contexto</div>
            </div>
          </div>
        </section>

        <section id="multisede" className="scroll-mt-16 bg-[#170b13] py-20 text-white sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-20">
            <div data-reveal>
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Cada sede conserva su operación. <span className="text-rose-300">Tú conservas la visión completa.</span></h2>
              <p className="mt-5 text-base leading-7 text-white/60">El catálogo puede ser compartido, pero el stock físico, los costos y los movimientos pertenecen al lugar donde realmente ocurren.</p>
              <div className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {['Stock y costo promedio por sede', 'Equipos y permisos por rol', 'Resultados para tomar decisiones', 'Auditoría de acciones sensibles'].map((text) => (
                  <div key={text} className="grid grid-cols-[1rem_1fr] items-start gap-2 text-sm text-white/75"><span className="mt-2 h-px w-3 bg-rose-300/60" /><span>{text}</span></div>
                ))}
              </div>
            </div>
            <div data-reveal data-reveal-delay="1" className="relative border-y border-white/12">
              <div className="absolute bottom-8 left-[1.18rem] top-8 w-px bg-gradient-to-b from-rose-400/0 via-rose-400/50 to-rose-400/0" />
              {['Sede principal', 'Sede norte', 'Sede sur'].map((sede) => (
                <div key={sede} className="relative grid grid-cols-[2.5rem_1fr] gap-5 border-b border-white/10 py-7 last:border-0">
                  <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-rose-300/30 bg-[#170b13]"><span className="h-2 w-2 rounded-full bg-rose-300" /></span>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-[family-name:var(--font-display)] text-lg font-semibold">{sede}</p><p className="mt-1 text-xs text-white/40">Agenda · Stock · Compras · Caja</p></div>
                    <span className="inline-flex items-center gap-2 text-xs text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Operación activa</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 border-t border-rose-300/20 py-5 text-xs font-semibold text-rose-200"><span className="h-px w-8 bg-rose-300/60" /> Pacientes y catálogo conectados; operación separada por ubicación.</div>
            </div>
          </div>
        </section>

        <section id="precios" className="scroll-mt-16 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mx-auto max-w-2xl text-center"><h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight sm:text-4xl">Empieza con <span className="text-rose-600">el tamaño que tienes hoy</span>.</h2><p className="mt-4 text-base leading-7 text-[#6f656b]">Todos los planes incluyen 14 días de prueba sin tarjeta de crédito.</p></div>
            {planesLoading || planesFetching ? (
              <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando planes">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-72 animate-pulse rounded-2xl border border-black/[0.06] bg-[#f7f4f5]" />)}</div>
            ) : planesError ? (
              <div className="mx-auto mt-12 max-w-xl border-y border-rose-200 bg-rose-50 p-7 text-center"><p className="font-[family-name:var(--font-display)] text-lg font-semibold">No pudimos cargar los planes en este momento.</p><p className="mt-2 text-sm leading-6 text-[#71676d]">Puedes iniciar tu prueba de todas formas o volver a intentarlo.</p><div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><Button variant="outline" onClick={() => recargarPlanes()} className="rounded-none"><RefreshCw className="mr-2 h-4 w-4" /> Reintentar</Button><Link href="/registro-clinica" className="landing-cta group inline-flex h-10 items-center justify-center gap-3 bg-[#25131f] px-5 text-sm font-semibold text-white">Empezar prueba <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link></div></div>
            ) : planes && planes.length > 0 ? (
              <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {planes.map((plan, index) => <article key={plan.id} className={`relative flex flex-col rounded-2xl border p-6 ${index === 1 ? 'border-rose-300 bg-rose-50/50 shadow-[0_22px_60px_-35px_rgba(190,24,93,0.5)]' : 'border-black/[0.08] bg-white'}`}>
                  {index === 1 && <span className="absolute -top-3 left-5 rounded-full bg-[#24131f] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Más elegido</span>}
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500">Plan</p><h3 className="mt-2 font-[family-name:var(--font-display)] text-base font-semibold">{plan.nombre}</h3>{plan.descripcion && <p className="mt-2 min-h-10 text-xs leading-5 text-[#756b71]">{plan.descripcion}</p>}
                  <p className="mt-5 text-2xl font-bold tracking-tight">{formatPrecio(plan.precio)}{plan.precio !== null && <span className="text-xs font-normal text-[#756b71]">/mes</span>}</p>
                  <ul className="mt-5 flex-1 space-y-3 text-sm text-[#655b61]"><li className="grid grid-cols-[0.75rem_1fr] gap-2"><span className="mt-2 h-1 w-1 rounded-full bg-emerald-500" />{plan.max_usuarios > 0 ? `Hasta ${plan.max_usuarios} usuarios` : 'Usuarios ilimitados'}</li><li className="grid grid-cols-[0.75rem_1fr] gap-2"><span className="mt-2 h-1 w-1 rounded-full bg-emerald-500" />{plan.max_sedes > 0 ? `Hasta ${plan.max_sedes} sedes` : 'Sedes ilimitadas'}</li>{plan.facial_verificacion_habilitada && <li className="grid grid-cols-[0.75rem_1fr] gap-2"><span className="mt-2 h-1 w-1 rounded-full bg-emerald-500" />Verificación facial</li>}{plan.whatsapp_habilitado && <li className="grid grid-cols-[0.75rem_1fr] gap-2"><span className="mt-2 h-1 w-1 rounded-full bg-emerald-500" />WhatsApp integrado</li>}{plan.modulo_obesidad_habilitado && <li className="grid grid-cols-[0.75rem_1fr] gap-2"><span className="mt-2 h-1 w-1 rounded-full bg-emerald-500" />Módulo de obesidad</li>}</ul>
                  <Link href="/registro-clinica" className={`group mt-7 inline-flex h-11 w-full items-center justify-between border-t pt-4 text-sm font-bold ${index === 1 ? 'border-rose-300 text-rose-700' : 'border-black/10 text-[#2b2127]'}`}>
                    {plan.precio === null ? 'Hablemos' : 'Probar gratis'}
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full ${index === 1 ? 'bg-rose-600 text-white' : 'bg-[#25131f] text-white'}`}><ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
                  </Link>
                </article>)}
              </div>
            ) : <div className="mx-auto mt-12 max-w-xl border-y border-black/[0.08] bg-[#f8f5f6] p-8 text-center"><p className="font-[family-name:var(--font-display)] text-lg font-semibold">Cada clínica tiene una operación distinta.</p><p className="mt-2 text-sm text-[#71676d]">Inicia la prueba y configura CliniQ según tu equipo y tus sedes.</p><Link href="/registro-clinica" className="landing-cta group mt-5 inline-flex h-11 items-center gap-3 bg-[#25131f] px-5 text-sm font-semibold text-white">Empezar prueba <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link></div>}
          </div>
        </section>

        <section className="border-y border-black/[0.06] bg-[#f7f4f5] py-20 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
            <div><h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">Antes de <span className="text-rose-600">mover la operación</span> de tu clínica.</h2></div>
            <div className="divide-y divide-black/[0.1] border-y border-black/[0.1]">{FAQ.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-[family-name:var(--font-display)] text-base font-semibold">{question}<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 text-lg font-light transition-transform group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-4 text-sm leading-6 text-[#71676d]">{answer}</p></details>)}</div>
          </div>
        </section>

        <section className="bg-white px-6 py-20 sm:py-28">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#21121c] px-7 py-14 text-center text-white sm:px-12 sm:py-20">
            <div aria-hidden className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-rose-500/15 blur-3xl" /><div aria-hidden className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
            <div data-reveal className="relative mx-auto max-w-3xl"><p className="text-sm font-medium text-rose-300">Una clínica conectada se siente distinta.</p><h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight sm:text-5xl">Que tu equipo deje de buscar información y vuelva a atender pacientes.</h2><p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-white/60 sm:text-base">Configura tu clínica, invita al equipo y prueba el flujo completo durante 14 días.</p><Link href="/registro-clinica" className="landing-cta group mt-8 inline-flex h-12 items-center gap-4 rounded-[0.9rem_0.9rem_0.9rem_0.25rem] bg-[#e52f7c] px-5 text-sm font-semibold text-white">Empezar prueba gratis <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#b91c5c]"><ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span></Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/[0.07] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 text-sm text-[#71676d] sm:grid-cols-2 sm:items-end">
          <div><Image src="/brand/cliniq-logo-horizontal.svg" alt="CliniQ" width={104} height={33} className="h-auto w-[104px]" /><p className="mt-3 max-w-sm text-xs leading-5">Gestión para clínicas estéticas y de bienestar en Colombia.</p></div>
          <div className="flex flex-col gap-3 sm:items-end"><div className="flex flex-wrap gap-x-5 gap-y-2 text-xs"><a href="#recorrido" className="hover:text-[#211a1f]">Cómo funciona</a><a href="#capacidades" className="hover:text-[#211a1f]">Funciones</a><a href="#precios" className="hover:text-[#211a1f]">Planes</a><Link href="/login" className="hover:text-[#211a1f]">Iniciar sesión</Link></div><p className="text-xs">© {new Date().getFullYear()} CliniQ. Todos los derechos reservados.</p></div>
        </div>
      </footer>
    </div>
  )
}

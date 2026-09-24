'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { display, sans, mono } from './fonts'
import { CtaPrimary } from './shared'
import { ProductTheater } from './ProductTheater'
import { Recorrido } from './Recorrido'
import { Bento } from './Bento'
import { Multisede } from './Multisede'
import { Precios } from './Precios'
import './landing.css'

const CONTRATO = `
THESIS: la landing es un día de clínica en vivo (recordatorio, cita, firma, cuota, sede), no una lista de funciones. Rechaza el hero con captura estática y la grilla de tarjetas con iconos.
OWN-WORLD: negro-ciruela #07040a, hoja superior redondeada, líneas de 1px, magenta #d9226f como única luz, serif Hedvig Letters + Geist / Geist Mono para datos.
STORY: el dueño entiende que todo su día pasa en un solo flujo y empieza la prueba de 14 días.
FIRST VIEWPORT: titular serif a la izquierda; a la derecha el teatro de producto animado (WhatsApp, agenda, firma, cuota); CTA magenta bajo el titular.
FORM: dirección fijada por la petición (referencias Resend y ManyChat), sin sorteo; build code-first.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
`

const DOLORES = [
  ['Información dispersa', 'La historia está en papel, las fotos en un celular y los pagos en otra hoja.'],
  ['Equipo descoordinado', 'Recepción, profesionales y administración trabajan con versiones distintas del día.'],
  ['Cartera reactiva', 'La mora se descubre tarde porque las cuotas no están unidas al tratamiento.'],
  ['Sedes sin contexto', 'El inventario y la operación se mezclan aunque cada sede tenga una realidad distinta.'],
]

const FAQ = [
  ['¿CliniQ sirve para una clínica con varias sedes?', 'Sí. La sede es una unidad operativa real: agenda, stock, compras y operación diaria respetan la ubicación física donde ocurren.'],
  ['¿Podemos migrar los pacientes que ya tenemos?', 'Sí. CliniQ incluye herramientas de carga y un proceso de puesta en marcha para organizar la información inicial de la clínica.'],
  ['¿Los profesionales y recepción ven lo mismo?', 'No necesariamente. Los permisos se configuran por rol para que cada persona acceda únicamente a la información y acciones que necesita.'],
  ['¿Cómo funciona la prueba?', 'Puedes registrar la clínica y usar CliniQ durante 14 días sin tarjeta de crédito. Así puedes configurar el equipo y probar el flujo real antes de elegir un plan.'],
]

const H2 = 'lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.02em] [text-wrap:balance]'

export function LandingPageV3() {
  const router = useRouter()
  const { hasCheckedAuth, isAuthenticated, loadUser } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => { if (!hasCheckedAuth) loadUser() }, [hasCheckedAuth, loadUser])
  useEffect(() => { if (hasCheckedAuth && isAuthenticated) router.replace('/dashboard') }, [hasCheckedAuth, isAuthenticated, router])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])


  const linkNav = 'transition-colors hover:text-white'

  return (
    <div className={`${display.variable} ${sans.variable} ${mono.variable} lv3 min-h-screen`}>
      <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRATO}-->` }} />

      <a
        href="#contenido"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07040a] focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <header
        className={`fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300 motion-reduce:transition-none ${
          scrolled ? 'border-white/10 bg-[#07040a]/75 backdrop-blur-xl' : 'border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/landing" aria-label="Ir al inicio de CliniQ">
            <Image src="/brand/cliniq-logo-on-dark.svg" alt="CliniQ" width={116} height={36} priority className="h-auto w-[92px] sm:w-[104px]" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[var(--lv3-muted)] min-[900px]:flex lg:gap-8" aria-label="Navegación principal">
            <a href="#recorrido" className={linkNav}>Cómo funciona</a>
            <a href="#capacidades" className={linkNav}>Funciones</a>
            <a href="#multisede" className={linkNav}>Multisede</a>
            <a href="#precios" className={linkNav}>Planes</a>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/login" className={`hidden text-sm font-medium text-[var(--lv3-muted)] min-[420px]:inline-flex ${linkNav}`}>Iniciar sesión</Link>
            <CtaPrimary href="/registro-clinica" compact>Probar 14 días</CtaPrimary>
          </div>
        </div>
      </header>

      <main id="contenido">
        <section className="lv3-grain relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -right-40 top-[8%] h-[38rem] w-[38rem] rounded-full bg-[#d9226f]/[0.16] blur-[140px]" />
          </div>

          <div className="mx-auto grid max-w-7xl gap-16 px-5 pb-24 pt-32 sm:px-6 sm:pt-36 lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center lg:gap-8 lg:pb-32 lg:pt-40">
            <div>
              <h1 className="lv3-display lv3-rise text-[clamp(2.6rem,4.5vw,4.2rem)] leading-[1.03] tracking-[-0.025em] [text-wrap:balance]">
                Toda tu clínica, de la cita al cobro.
                <span className="mt-2 block text-[var(--lv3-lit)]">Sin perder el control entre sedes.</span>
              </h1>
              <p className="lv3-rise lv3-rise-1 mt-7 max-w-xl text-base leading-7 text-[var(--lv3-muted)] sm:text-lg sm:leading-8">
                CliniQ conecta agenda, historia clínica, consentimientos, tratamientos, cartera e inventario para que recepción, profesionales y administración trabajen sobre la misma realidad.
              </p>
              <div className="lv3-rise lv3-rise-2 mt-9 flex flex-col gap-5 sm:flex-row sm:items-center">
                <CtaPrimary href="/registro-clinica">Empezar prueba gratis</CtaPrimary>
                <a
                  href="#recorrido"
                  className="group inline-flex h-12 items-center justify-center gap-1.5 text-sm font-semibold text-[var(--lv3-muted)] transition-colors hover:text-white"
                >
                  Ver cómo funciona <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </a>
              </div>
              <ul className="lv3-rise lv3-rise-2 mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--lv3-faint)]">
                {['14 días gratis', 'Sin tarjeta', 'Configuración guiada'].map((item) => (
                  <li key={item} className="inline-flex items-center gap-2">
                    <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--lv3-lit)]" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <ProductTheater />
          </div>

          <div className="border-t border-white/[0.07]">
            <p className="mx-auto max-w-7xl px-5 py-5 text-sm text-[var(--lv3-faint)] sm:px-6">
              Pensado para el día a día de clínicas estéticas y de bienestar en Colombia.
            </p>
          </div>
        </section>

        <div className="relative rounded-t-[2rem] border-t border-white/10 bg-[var(--lv3-sheet)] lg:rounded-t-[2.75rem]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-[#ff6aa9]/70 to-transparent" />

          <section className="mx-auto max-w-7xl px-5 py-24 sm:px-6 sm:py-32">
            <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
              <div className="lg:sticky lg:top-32 lg:self-start">
                <h2 className={H2}>
                  Tu clínica no necesita <span className="text-[var(--lv3-lit)]">otra agenda</span>. Necesita dejar de perder información entre herramientas.
                </h2>
                <p className="mt-6 max-w-md text-base leading-7 text-[var(--lv3-muted)]">
                  Cuando el equipo crece, cada proceso aislado añade preguntas, reprocesos y decisiones tomadas sin contexto.
                </p>
              </div>
              <div className="border-t border-white/10">
                {DOLORES.map(([title, desc]) => (
                  <div key={title} className="grid gap-2 border-b border-white/10 py-7 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8">
                    <h3 className="lv3-display text-2xl leading-tight">{title}</h3>
                    <p className="text-[15px] leading-7 text-[var(--lv3-muted)]">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <Recorrido />
          <Bento />
          <Multisede />
          <Precios />

          <section className="border-t border-white/[0.07] py-16 sm:py-28">
            <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
              <h2 className="lv3-display text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.08] tracking-[-0.02em] [text-wrap:balance]">
                Antes de <span className="text-[var(--lv3-lit)]">mover la operación</span> de tu clínica.
              </h2>
              <div className="border-t border-white/10">
                {FAQ.map(([question, answer]) => (
                  <details key={question} className="group border-b border-white/10 py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-medium">
                      {question}
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-lg font-light text-[var(--lv3-muted)] transition-transform motion-reduce:transition-none group-open:rotate-45">+</span>
                    </summary>
                    <p className="max-w-2xl pt-4 text-[15px] leading-7 text-[var(--lv3-muted)]">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          <section className="lv3-grain relative isolate overflow-hidden border-t border-white/[0.07] py-24 text-center sm:py-40">
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 -z-10 h-[75%] bg-[radial-gradient(60%_90%_at_50%_100%,rgba(217,34,111,0.6),rgba(217,34,111,0.16)_45%,transparent_74%)]"
            />
            <div className="mx-auto max-w-4xl px-6">
              <h2 className="lv3-display text-[clamp(2.2rem,5vw,4.4rem)] leading-[1.04] tracking-[-0.025em] [text-wrap:balance]">
                Que tu equipo deje de buscar información y vuelva a atender pacientes.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[var(--lv3-muted)]">
                Configura tu clínica, invita al equipo y prueba el flujo completo durante 14 días.
              </p>
              <div className="mt-10 flex justify-center">
                <CtaPrimary href="/registro-clinica">Empezar prueba gratis</CtaPrimary>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/[0.07] bg-[var(--lv3-sheet)]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 text-sm text-[var(--lv3-faint)] sm:grid-cols-2 sm:items-end sm:px-6">
          <div>
            <Image src="/brand/cliniq-logo-on-dark.svg" alt="CliniQ" width={104} height={33} className="h-auto w-[88px]" />
            <p className="mt-3 max-w-sm text-xs leading-5">Gestión para clínicas estéticas y de bienestar en Colombia.</p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <a href="#recorrido" className={linkNav}>Cómo funciona</a>
              <a href="#capacidades" className={linkNav}>Funciones</a>
              <a href="#precios" className={linkNav}>Planes</a>
              <Link href="/login" className={linkNav}>Iniciar sesión</Link>
            </div>
            <p className="text-xs">© {new Date().getFullYear()} CliniQ. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

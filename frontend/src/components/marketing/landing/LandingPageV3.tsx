'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCheck, ChevronRight, MessageCircle, Wallet } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { DOMINIOS_SEPARADOS, INICIO_SITIO, urlApp } from '@/lib/dominios'
import { sans, mono } from './fonts'
import { CAPTURAS, CtaPrimary } from './shared'
import { Ficha } from './Ficha'
import { FAQ } from './contenido'
import type { PlanPublico } from '@/lib/api/clinicas'
import { EnVista } from './EnVista'
import { QAnimada } from './Ilustraciones'
import { ProductTheater } from './ProductTheater'
import { Recorrido } from './Recorrido'
import { Bento } from './Bento'
import { Multisede } from './Multisede'
import { Precios } from './Precios'
import './landing.css'

const CONTRATO = `
THESIS: la landing es un día de clínica en vivo (recordatorio, cita, firma, cuota, sede), no una lista de funciones. Rechaza el hero con captura estática y la grilla de tarjetas con iconos.
OWN-WORLD: negro-ciruela #07040a alternado con blanco (paneles oscuros redondeados sobre fondo blanco), fotografía real de clínica junto a las capturas, líneas de 1px, magenta #d9226f como única luz, Geist en negrita para títulos (la voz de la app) y Geist Mono solo para datos; ilustraciones de línea animadas en SVG, sin fotos de stock.
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

// Notificaciones que flotan alrededor del dashboard (solo en pantallas grandes).
const AVISOS = [
  { icono: MessageCircle, titulo: 'Cita confirmada por WhatsApp', detalle: 'Valentina G. · mañana 10:30', lugar: '-left-10 top-24' },
  { icono: Wallet, titulo: 'Cuota 3 de 6 pagada', detalle: '$180.000 · Sede Norte', lugar: '-right-12 top-[38%]' },
  { icono: CheckCheck, titulo: 'Consentimiento firmado', detalle: 'Toxina botulínica · 10:24', lugar: '-left-8 bottom-20' },
]

const H2 = 'lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.025em] [text-wrap:balance]'

export function LandingPageV3({ planes }: { planes?: PlanPublico[] | null }) {
  const router = useRouter()
  const { hasCheckedAuth, isAuthenticated, loadUser } = useAuthStore()
  const [scrolled, setScrolled] = useState(false)

  // Con dominios separados el sitio público no ve la sesión (la cookie es del
  // dominio de la app): "Iniciar sesión" lleva a la app y el login redirige solo.
  useEffect(() => { if (!DOMINIOS_SEPARADOS && !hasCheckedAuth) loadUser() }, [hasCheckedAuth, loadUser])
  useEffect(() => { if (!DOMINIOS_SEPARADOS && hasCheckedAuth && isAuthenticated) router.replace('/dashboard') }, [hasCheckedAuth, isAuthenticated, router])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])


  const linkNav = 'transition-colors hover:text-white'

  return (
    <div className={`${sans.variable} ${mono.variable} lv3 min-h-screen`}>
      <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRATO}-->` }} />

      <a
        href="#contenido"
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#07040a] focus:translate-y-0"
      >
        Saltar al contenido
      </a>

      <header
        className={`fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300 motion-reduce:transition-none ${
          scrolled ? 'border-white/10 bg-[#07040a]/[0.93] backdrop-blur-xl' : 'border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href={INICIO_SITIO} aria-label="Ir al inicio de CliniQ">
            <Image src="/brand/cliniq-logo-on-dark.svg" alt="CliniQ" width={116} height={36} priority className="h-auto w-[92px] sm:w-[104px]" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[var(--lv3-muted)] min-[900px]:flex lg:gap-8" aria-label="Navegación principal">
            <a href="#recorrido" className={linkNav}>Cómo funciona</a>
            <a href="#capacidades" className={linkNav}>Funciones</a>
            <a href="#multisede" className={linkNav}>Multisede</a>
            <a href="#precios" className={linkNav}>Planes</a>
          </nav>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href={urlApp('/login')} className={`hidden text-sm font-medium text-[var(--lv3-muted)] min-[420px]:inline-flex ${linkNav}`}>Iniciar sesión</Link>
            <CtaPrimary href="/registro-clinica" compact>Probar 14 días</CtaPrimary>
          </div>
        </div>
      </header>

      <main id="contenido">
        <section className="lv3-grain relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="lv3-aurora absolute -right-40 top-[6%] h-[38rem] w-[38rem] rounded-full bg-[#d9226f]/[0.17] blur-[140px]" />
            <div className="lv3-aurora lv3-aurora-b absolute right-[28%] top-[38%] h-[26rem] w-[26rem] rounded-full bg-[#8b2fc9]/[0.12] blur-[130px]" />
            <div className="lv3-aurora lv3-aurora-c absolute -left-40 bottom-[-10%] h-[30rem] w-[30rem] rounded-full bg-[#ff6aa9]/[0.08] blur-[150px]" />
          </div>

          <div className="mx-auto grid max-w-7xl gap-16 px-5 pb-20 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[minmax(0,1fr)_560px] lg:items-center lg:gap-8 lg:pb-24 lg:pt-36">
            <div>
              <h1 className="lv3-display lv3-rise text-[clamp(2.6rem,4.5vw,4.2rem)] leading-[1.03] tracking-[-0.03em] [text-wrap:balance]">
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
                  <li key={item} className="inline-flex items-center gap-2 whitespace-nowrap">
                    <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--lv3-lit)]" /> {item}
                  </li>
                ))}
              </ul>
            </div>
            <ProductTheater />
          </div>

        </section>

        {/* La captura cruza del negro al blanco y marca el cambio de paleta. */}
        <div className="bg-[linear-gradient(to_bottom,var(--lv3-bg)_50%,#ffffff_50%)]">
          <EnVista as="figure" className="relative mx-auto max-w-6xl px-3 sm:px-6">
            {AVISOS.map((aviso, i) => (
              <div key={aviso.titulo} className={`lv3-entra absolute z-10 hidden lg:block ${aviso.lugar}`} style={{ '--retraso': `${300 + i * 220}ms` } as React.CSSProperties}>
                <div className="lv3-flota flex w-[17.5rem] items-center gap-3 rounded-2xl bg-white p-3 text-[#1b1020] shadow-[0_30px_60px_-25px_rgba(27,16,32,0.45)] ring-1 ring-black/5" style={{ '--fase': `${i * -2}s` } as React.CSSProperties}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d9226f]/10 text-[#c01d63]">
                    <aviso.icono className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{aviso.titulo}</span>
                    <span className="block truncate text-xs text-[#1b1020]/60">{aviso.detalle}</span>
                  </span>
                </div>
              </div>
            ))}
            <div className="rounded-[1.25rem] border border-white/10 bg-[#f6f1f4] p-1.5 shadow-[0_60px_140px_-50px_rgba(217,34,111,0.6)] sm:rounded-[1.75rem] sm:p-2">
              <div className="flex items-center justify-between gap-4 px-3 py-2 sm:px-4 sm:py-2.5">
                <span aria-hidden className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1b1020]/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1b1020]/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1b1020]/15" />
                </span>
                <figcaption className="truncate text-xs text-[#1b1020]/55">Dashboard de CliniQ</figcaption>
              </div>
              <Image
                src={CAPTURAS.dashboard.src}
                alt={CAPTURAS.dashboard.alt}
                width={CAPTURAS.dashboard.w}
                height={CAPTURAS.dashboard.h}
                sizes="(min-width: 1152px) 1104px, 100vw"
                className="block h-auto w-full rounded-[0.9rem] ring-1 ring-black/5 sm:rounded-[1.25rem]"
              />
            </div>
          </EnVista>
        </div>

        <div className="lv3-light pb-2 sm:pb-3">
          <div className="mx-auto max-w-4xl px-5 pt-12 text-center sm:px-6 sm:pt-16">
            <p className="text-sm text-[var(--lv3-faint)]">Pensado para clínicas estéticas y de bienestar en Colombia</p>
            <p className="mt-4 text-[clamp(1.25rem,2.2vw,1.75rem)] leading-snug tracking-[-0.015em] text-[var(--lv3-faint)] [text-wrap:balance]">
              <strong className="font-semibold text-[var(--lv3-text)]">Agenda</strong>, <strong className="font-semibold text-[var(--lv3-text)]">historia clínica</strong>,{' '}
              <strong className="font-semibold text-[var(--lv3-text)]">consentimientos</strong>, <strong className="font-semibold text-[var(--lv3-text)]">tratamientos</strong>,{' '}
              <strong className="font-semibold text-[var(--lv3-text)]">cartera</strong> e <strong className="font-semibold text-[var(--lv3-text)]">inventario</strong>, con WhatsApp
              integrado y en <span className="text-[var(--lv3-lit)]">todas tus sedes</span>.
            </p>
          </div>

          <section className="mx-auto max-w-7xl px-5 py-14 sm:px-6 sm:py-20">
            <div className="max-w-3xl">
              <h2 className={H2}>
                Tu clínica no necesita <span className="text-[var(--lv3-lit)]">otra agenda</span>. Necesita dejar de perder información entre herramientas.
              </h2>
              <p className="mt-6 max-w-xl text-base leading-7 text-[var(--lv3-muted)]">
                Cuando el equipo crece, cada proceso aislado añade preguntas, reprocesos y decisiones tomadas sin contexto.
              </p>
            </div>

            <div className="mt-10 grid gap-10 lg:mt-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
              <Ficha />

              <ol className="border-t border-[var(--lv3-line)]">
                {DOLORES.map(([title, desc], i) => (
                  <li key={title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--lv3-line)] py-7 sm:grid-cols-[2.5rem_0.8fr_1.2fr] sm:gap-x-8">
                    <span className="lv3-mono pt-2 text-xs text-[var(--lv3-lit)]">0{i + 1}</span>
                    <h3 className="lv3-display text-2xl leading-tight">{title}</h3>
                    <p className="col-start-2 mt-2 text-[15px] leading-7 text-[var(--lv3-muted)] sm:col-start-auto sm:mt-0">{desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <div className="lv3-dark relative mx-2 rounded-[2rem] sm:mx-4 lg:rounded-[2.75rem]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-[#ff6aa9]/70 to-transparent" />
            <Recorrido />
          </div>

          <Bento />

          <div className="lv3-dark relative mx-2 rounded-[2rem] sm:mx-4 lg:rounded-[2.75rem]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-[#ff6aa9]/70 to-transparent" />
            <Multisede />
          </div>

          <Precios planesIniciales={planes ?? undefined} />

          <section className="border-t border-[var(--lv3-line)] py-14 sm:py-20">
            <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
              <h2 className="lv3-display text-[clamp(1.9rem,3.2vw,2.8rem)] leading-[1.08] tracking-[-0.025em] [text-wrap:balance]">
                Antes de <span className="text-[var(--lv3-lit)]">mover la operación</span> de tu clínica.
              </h2>
              <div className="border-t border-[var(--lv3-line)]">
                {FAQ.map(([question, answer]) => (
                  <details key={question} className="group border-b border-[var(--lv3-line)] py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-base font-medium">
                      {question}
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--lv3-line)] text-lg font-light text-[var(--lv3-muted)] transition-[transform,background-color,color] motion-reduce:transition-none group-open:rotate-45 group-open:bg-[#d9226f] group-open:text-white">+</span>
                    </summary>
                    <p className="max-w-2xl pt-4 text-[15px] leading-7 text-[var(--lv3-muted)]">{answer}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="lv3-grain relative isolate overflow-hidden py-24 text-center sm:py-36">
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 -z-10 h-[75%] bg-[radial-gradient(60%_90%_at_50%_100%,rgba(217,34,111,0.6),rgba(217,34,111,0.16)_45%,transparent_74%)]"
          />
          <QAnimada className="absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 opacity-50 lg:left-auto lg:right-[-10rem] lg:h-[46rem] lg:w-[46rem] lg:translate-x-0 lg:opacity-100" />
          <div className="mx-auto max-w-4xl px-6">
            <h2 className="lv3-display text-[clamp(2.2rem,5vw,4.4rem)] leading-[1.04] tracking-[-0.03em] [text-wrap:balance]">
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
              <Link href={urlApp('/login')} className={linkNav}>Iniciar sesión</Link>
              <Link href="/terminos" className={linkNav}>Términos y condiciones</Link>
              <Link href="/privacidad" className={linkNav}>Tratamiento de datos</Link>
            </div>
            <p className="text-xs">© {new Date().getFullYear()} 2Asoft S.A.S. · CliniQ. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

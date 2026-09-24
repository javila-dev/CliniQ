'use client'

// Landing pública para clientes en frío, montada en /landing.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import { Sora } from 'next/font/google'
import {
  FileText, ScanFace, ShieldCheck, Boxes,
  MessageCircle, CheckCircle2, ArrowRight, Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { registroPublicoApi } from '@/lib/api/clinicas'

const sora = Sora({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-display' })

const COP_FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatPrecio(precio: string | null) {
  if (precio === null) return 'Cotización'
  return COP_FMT.format(parseFloat(precio))
}

// ── Capturas reales de la app (clínica demo ficticia, sin datos de clientes) ──

const CAPTURAS = {
  agenda: { src: '/img/landing/agenda.png', w: 2880, h: 1620 },
  pacientes: { src: '/img/landing/pacientes.png', w: 2880, h: 1220 },
  cartera: { src: '/img/landing/cartera.png', w: 2880, h: 1280 },
  atenciones: { src: '/img/landing/atenciones.png', w: 2880, h: 1300 },
}

function Ventana({ captura, priority = false }: { captura: keyof typeof CAPTURAS; priority?: boolean }) {
  const img = CAPTURAS[captura]
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-[#120b12] shadow-[0_30px_80px_-20px_rgba(120,20,60,0.35)]">
      <div className="flex items-center gap-1.5 px-3.5 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
      </div>
      <Image
        src={img.src}
        alt=""
        width={img.w}
        height={img.h}
        priority={priority}
        sizes="(min-width: 1024px) 960px, 100vw"
        className="block w-full h-auto"
      />
    </div>
  )
}

const FEATURES_CON_CAPTURA: { captura: keyof typeof CAPTURAS; title: string; desc: string }[] = [
  {
    captura: 'pacientes',
    title: 'Pacientes e historia clínica',
    desc: 'Cada paciente con su ficha completa — datos, contacto y resumen clínico — para que recepción encuentre en segundos a quién está atendiendo.',
  },
  {
    captura: 'cartera',
    title: 'Cartera con acuerdos de pago',
    desc: 'Tratamientos financiados en cuotas, con la mora a la vista y acta de renegociación firmada. No una hoja de cálculo aparte.',
  },
  {
    captura: 'atenciones',
    title: 'Cola de atención en vivo',
    desc: 'Recepción activa al paciente que llega y el profesional ve quién sigue, sin gritar nombres en la sala de espera.',
  },
]

const DIFERENCIADORES = [
  { icon: FileText, title: 'Consentimientos firmados', desc: 'Firma electrónica con validez legal por procedimiento, con trazabilidad completa.' },
  { icon: ScanFace, title: 'Verificación facial + OTP', desc: 'Confirma la identidad del paciente en el mostrador sin depender de que recepción lo reconozca.' },
  { icon: Boxes, title: 'Stock por sede', desc: 'El catálogo de insumos es compartido; el stock físico y el costo promedio son independientes por sede.' },
  { icon: MessageCircle, title: 'WhatsApp nativo', desc: 'Recordatorios, confirmaciones y seguimiento automático, sin un proveedor que cobre por conversación.' },
]

export function LandingPage() {
  const router = useRouter()
  const { hasCheckedAuth, isAuthenticated, loadUser } = useAuthStore()

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  useEffect(() => {
    if (hasCheckedAuth && isAuthenticated) router.replace('/dashboard')
  }, [hasCheckedAuth, isAuthenticated, router])

  const { data: planes, isLoading: planesLoading } = useQuery({
    queryKey: ['planes-publicos'],
    queryFn: registroPublicoApi.planesPublicos,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className={`${sora.variable} min-h-screen bg-white`}>
      {/* ── Nav ── */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Image src="/brand/cliniq-logo-horizontal.svg" alt="CliniQ" width={112} height={35} className="h-auto w-[112px] object-contain" />
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#funciones" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#precios" className="hover:text-foreground transition-colors">Precios</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Iniciar sesión
            </Link>
            <Button asChild size="sm">
              <Link href="/registro-clinica">Prueba gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative bg-[#170d13]">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: 'radial-gradient(hsla(334,60%,70%,0.35) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage: 'linear-gradient(to bottom, black, transparent 75%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 75%)',
            }}
          />
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 h-[520px] w-[820px]"
            style={{ background: 'radial-gradient(ellipse, hsla(334,72%,58%,0.22) 0%, transparent 65%)' }} />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-24 pb-0 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400/70 mb-5">
            Software para clínicas estéticas y de bienestar
          </p>
          <h1 className={`font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-bold text-white leading-[1.1] max-w-3xl mx-auto tracking-tight`}>
            Cero papel, cero Excel,<br />
            <span className="text-rose-300">cero WhatsApp para todo.</span>
          </h1>
          <p className="mt-5 text-base text-white/55 max-w-xl mx-auto leading-relaxed">
            Agenda, historia clínica, consentimientos con firma legal y cartera con acuerdos de pago,
            en el mismo sistema — construido para el día a día real de una clínica estética, no una
            agenda genérica adaptada a la fuerza.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/registro-clinica">
                Empezar prueba gratis de 14 días
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-white/30">Sin tarjeta de crédito. Cancela cuando quieras.</p>

          {/* Captura hero — se asoma sobre la sección blanca siguiente */}
          <div className="mt-14 -mb-32 sm:-mb-40 lg:-mb-52 mx-auto max-w-4xl text-left">
            <Ventana captura="agenda" priority />
          </div>
        </div>
      </section>

      {/* ── Declaración de principio ── */}
      <section className="bg-white pt-40 sm:pt-48 lg:pt-60 pb-16">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className={`font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold text-foreground leading-snug`}>
            Si hoy se firma, se imprime o se anota a mano en tu clínica,
            <span className="text-rose-500"> debería poder hacerse dentro de CliniQ.</span>
          </p>
        </div>
      </section>

      {/* ── Features con captura ── */}
      <section id="funciones" className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-12 max-w-2xl mx-auto">
          <h2 className={`font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-foreground`}>
            Construido para la especialidad, no adaptado a la fuerza
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Zonas de tratamiento, protocolos con sesiones y consentimientos por procedimiento —
            no una agenda genérica con campos personalizados.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES_CON_CAPTURA.map(({ captura, title, desc }) => (
            <div key={captura}>
              <Ventana captura={captura} />
              <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Diferenciadores sin captura */}
        <div className="mt-16">
          <p className="text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-6">
            Lo que un competidor genérico no puede copiar sin rehacer su producto
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DIFERENCIADORES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl border border-muted-foreground/10 p-5">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/15 mb-3.5">
                  <Icon className="h-4.5 w-4.5 text-rose-500" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="precios" className="bg-muted/30 border-y">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className={`font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-bold text-foreground`}>Planes</h2>
            <p className="mt-2 text-sm text-muted-foreground">Elige según el tamaño de tu clínica. Todos los planes incluyen 14 días de prueba.</p>
          </div>

          {planesLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse h-64 rounded-xl border border-muted-foreground/10 bg-white" />
              ))}
            </div>
          ) : planes && planes.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {planes.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-muted-foreground/10 bg-white flex flex-col p-6">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-rose-500" />
                    {plan.nombre}
                  </h3>
                  {plan.descripcion && (
                    <p className="mt-1 text-xs text-muted-foreground">{plan.descripcion}</p>
                  )}
                  <p className="mt-4 text-2xl font-bold text-foreground">
                    {formatPrecio(plan.precio)}
                    {plan.precio !== null && <span className="text-sm font-normal text-muted-foreground">/mes</span>}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground flex-1">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      {plan.max_usuarios > 0 ? `Hasta ${plan.max_usuarios} usuario${plan.max_usuarios === 1 ? '' : 's'}` : 'Usuarios ilimitados'}
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      {plan.max_sedes > 0 ? `Hasta ${plan.max_sedes} sede${plan.max_sedes === 1 ? '' : 's'}` : 'Sedes ilimitadas'}
                    </li>
                    {plan.facial_verificacion_habilitada && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        Verificación facial
                      </li>
                    )}
                    {plan.whatsapp_habilitado && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        Mensajería por WhatsApp
                        {plan.whatsapp_envios_incluidos > 0
                          ? ` (${plan.whatsapp_envios_incluidos} envíos/mes)`
                          : ' (envíos ilimitados)'}
                      </li>
                    )}
                    {plan.modulo_obesidad_habilitado && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        Módulo de obesidad
                      </li>
                    )}
                  </ul>
                  {(plan.precio_usuario_adicional || plan.precio_sede_adicional) && (
                    <div className="mt-4 pt-4 border-t space-y-1 text-[11px] text-muted-foreground">
                      {plan.precio_usuario_adicional && (
                        <p>+{COP_FMT.format(parseFloat(plan.precio_usuario_adicional))} por usuario adicional</p>
                      )}
                      {plan.precio_sede_adicional && (
                        <p>+{COP_FMT.format(parseFloat(plan.precio_sede_adicional))} por sede adicional</p>
                      )}
                    </div>
                  )}
                  <Button asChild variant="outline" className="mt-6 w-full">
                    <Link href="/registro-clinica">{plan.precio === null ? 'Hablemos' : 'Empezar'}</Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center max-w-md mx-auto">
              <p className="text-sm text-muted-foreground">
                Cada clínica es distinta — arma tu plan a la medida en una llamada de 15 minutos.
              </p>
              <Button asChild className="mt-4">
                <Link href="/registro-clinica">Solicitar una demo</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-col items-center text-center gap-3 max-w-xl mx-auto">
          <ShieldCheck className="h-6 w-6 text-rose-500" />
          <p className="text-sm text-muted-foreground">
            Los datos de tus pacientes están cifrados en tránsito y en reposo. Tus documentos firmados
            (consentimientos, actas de pago) quedan con trazabilidad legal completa.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} CliniQ. Todos los derechos reservados.</p>
          <div className="flex items-center gap-5">
            <Link href="/terminos" className="hover:text-foreground transition-colors">Términos de servicio</Link>
            <Link href="/privacidad" className="hover:text-foreground transition-colors">Política de privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

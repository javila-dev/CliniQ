'use client'

// Landing pública para clientes en frío. No está montada en ninguna ruta
// todavía — queda aquí lista para cuando se decida dónde exponerla.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Image from 'next/image'
import Link from 'next/link'
import {
  CalendarDays, FileText, Users, Sparkles, ScanFace, ShieldCheck,
  MessageCircle, Wallet, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/store/authStore'
import { registroPublicoApi } from '@/lib/api/clinicas'

const FEATURES = [
  { icon: CalendarDays,   title: 'Agenda inteligente',      desc: 'Vistas día, semana y mes, confirmaciones y recordatorios automáticos por WhatsApp.' },
  { icon: Users,          title: 'Historia clínica digital', desc: 'Notas de evolución, fotos de antes/después y zonas de tratamiento en un solo lugar.' },
  { icon: FileText,       title: 'Consentimientos firmados', desc: 'Firma electrónica con validez legal y trazabilidad completa por procedimiento.' },
  { icon: ScanFace,       title: 'Check-in facial y OTP',    desc: 'Verifica la identidad del paciente al llegar, sin depender de que lo reconozca recepción.' },
  { icon: Wallet,         title: 'Cartera y acuerdos de pago', desc: 'Tratamientos financiados en cuotas con acta de renegociación firmada, no una hoja de cálculo.' },
  { icon: MessageCircle,  title: 'WhatsApp automatizado',   desc: 'Recordatorios, confirmaciones y seguimiento sin depender de un operador manual.' },
]

const COP_FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatPrecio(precio: string | null) {
  if (precio === null) return 'Cotización'
  return COP_FMT.format(parseFloat(precio))
}

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
    <div className="min-h-screen bg-white">
      {/* ── Nav ── */}
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Image src="/imagotipo cliniq.png" alt="CliniQ" width={110} height={32} className="object-contain" />
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
      <section className="relative overflow-hidden bg-[#1a1118]">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,72%,60%,0.20) 0%, transparent 65%)' }} />
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,55%,50%,0.12) 0%, transparent 68%)' }} />

        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400/70 mb-4">
            Software para clínicas estéticas y de bienestar
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight max-w-3xl mx-auto">
            Tu clínica ordenada,<br />
            <span className="text-rose-300">desde la agenda hasta la cartera.</span>
          </h1>
          <p className="mt-5 text-base text-white/50 max-w-xl mx-auto leading-relaxed">
            Agenda, historia clínica, consentimientos con firma legal y cobros en un mismo sistema,
            pensado para el día a día de una clínica estética real.
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
        </div>
      </section>

      {/* ── Features ── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-foreground">Todo lo que ya usa tu clínica, en un solo lugar</h2>
          <p className="mt-2 text-sm text-muted-foreground">No es una agenda genérica adaptada a la fuerza — está construido para procedimientos, protocolos y zonas de tratamiento.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border-muted-foreground/10">
              <CardContent className="p-6">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/15 mb-4">
                  <Icon className="h-5 w-5 text-rose-500" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="bg-muted/30 border-y">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-foreground">Planes</h2>
            <p className="mt-2 text-sm text-muted-foreground">Elige según el tamaño de tu clínica. Todos los planes incluyen 14 días de prueba.</p>
          </div>

          {planesLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="animate-pulse h-64" />
              ))}
            </div>
          ) : planes && planes.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-5xl mx-auto">
              {planes.map((plan) => (
                <Card key={plan.id} className="border-muted-foreground/10 flex flex-col">
                  <CardContent className="p-6 flex flex-col flex-1">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-rose-500" />
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
                  </CardContent>
                </Card>
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

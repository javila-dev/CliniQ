'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { registroPublicoApi } from '@/lib/api/clinicas'
import { CtaPrimary } from './shared'

const COP_FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatPrecio(precio: string | null) {
  if (precio === null) return 'Cotización'
  return COP_FMT.format(parseFloat(precio))
}

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-[var(--lv3-muted)]">
      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
      {children}
    </li>
  )
}

export function Precios() {
  const { data: planes, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['planes-publicos'],
    queryFn: registroPublicoApi.planesPublicos,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  return (
    <section id="precios" className="scroll-mt-20 border-t border-white/[0.07] py-16 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.02em] [text-wrap:balance]">
            Empieza con <span className="text-[var(--lv3-lit)]">el tamaño que tienes hoy</span>.
          </h2>
          <p className="mt-5 text-base leading-7 text-[var(--lv3-muted)]">Todos los planes incluyen 14 días de prueba sin tarjeta de crédito.</p>
        </div>

        {isLoading ? (
          <div className="mx-auto mt-14 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando planes">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl motion-reduce:animate-none border border-white/[0.06] bg-white/[0.03]" />
            ))}
          </div>
        ) : isError ? (
          <div className="mx-auto mt-14 max-w-xl rounded-2xl border border-white/10 bg-[var(--lv3-surface)] p-8 text-center">
            <p className="lv3-display text-xl">No pudimos cargar los planes en este momento.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lv3-muted)]">Puedes iniciar tu prueba de todas formas o volver a intentarlo.</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-sm font-medium text-[var(--lv3-text)] transition-colors hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                {isFetching ? 'Reintentando' : 'Reintentar'}
              </button>
              <CtaPrimary href="/registro-clinica">Empezar prueba</CtaPrimary>
            </div>
          </div>
        ) : planes && planes.length > 0 ? (
          <div className="mx-auto mt-14 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {planes.map((plan) => {
              return (
                <article
                  key={plan.id}
                  className="relative flex flex-col rounded-2xl border border-white/10 bg-[var(--lv3-surface)] p-7"
                >
                  <h3 className="lv3-display text-2xl">{plan.nombre}</h3>
                  {plan.descripcion && <p className="mt-2 min-h-[6.5rem] text-[13px] leading-5 text-[var(--lv3-faint)]">{plan.descripcion}</p>}
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="lv3-display text-4xl tracking-tight">{formatPrecio(plan.precio)}</span>
                    {plan.precio !== null && <span className="text-xs text-[var(--lv3-faint)]">/mes</span>}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3">
                    <Punto>{plan.max_usuarios > 0 ? `Hasta ${plan.max_usuarios} ${plan.max_usuarios === 1 ? 'usuario' : 'usuarios'}` : 'Usuarios ilimitados'}</Punto>
                    <Punto>{plan.max_sedes > 0 ? `Hasta ${plan.max_sedes} ${plan.max_sedes === 1 ? 'sede' : 'sedes'}` : 'Sedes ilimitadas'}</Punto>
                    {plan.facial_verificacion_habilitada && <Punto>Verificación facial</Punto>}
                    {plan.whatsapp_habilitado && <Punto>WhatsApp integrado</Punto>}
                    {plan.modulo_obesidad_habilitado && <Punto>Módulo de obesidad</Punto>}
                  </ul>
                  <Link
                    href="/registro-clinica"
                    className="group mt-8 inline-flex h-11 w-full items-center justify-between border-t border-white/10 pt-4 text-sm font-semibold text-[var(--lv3-text)]"
                  >
                    Probar gratis
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mx-auto mt-14 max-w-xl rounded-2xl border border-white/10 bg-[var(--lv3-surface)] p-8 text-center">
            <p className="lv3-display text-xl">Cada clínica tiene una operación distinta.</p>
            <p className="mt-2 text-sm text-[var(--lv3-muted)]">Inicia la prueba y configura CliniQ según tu equipo y tus sedes.</p>
            <div className="mt-6 flex justify-center">
              <CtaPrimary href="/registro-clinica">Empezar prueba</CtaPrimary>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

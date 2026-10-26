'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Check, Network, RefreshCw, Store, UserRound, type LucideIcon } from 'lucide-react'
import { registroPublicoApi, type PlanPublico } from '@/lib/api/clinicas'
import { CtaPrimary } from './shared'

const COP_FMT = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function formatPrecio(precio: string | null) {
  if (precio === null) return 'Cotización'
  return COP_FMT.format(parseFloat(precio))
}

type Ciclo = 'mensual' | 'anual'

/** Precio mensual a mostrar: en anual, el mes con el descuento del plan. */
function precioMes(precio: string, ciclo: Ciclo, descuento: number) {
  const mensual = parseFloat(precio)
  return ciclo === 'anual' && descuento > 0 ? Math.round(mensual * (1 - descuento / 100)) : mensual
}

// Ícono por posición del plan (de menor a mayor tamaño).
const ICONOS: LucideIcon[] = [UserRound, Store, Building2, Network]

function Punto({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-[var(--lv3-muted)]">
      <span aria-hidden className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#d9226f]/[0.14] text-[var(--lv3-lit)]">
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      {children}
    </li>
  )
}

export function Precios({ planesIniciales }: { planesIniciales?: PlanPublico[] }) {
  const { data: planes, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['planes-publicos'],
    queryFn: registroPublicoApi.planesPublicos,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    initialData: planesIniciales,
  })
  const [ciclo, setCiclo] = useState<Ciclo>('mensual')
  const hayAnual = !!planes?.some((p) => p.precio !== null && p.descuento_anual_pct > 0)
  const maxDescuento = Math.max(0, ...(planes ?? []).map((p) => p.descuento_anual_pct))

  return (
    <section id="precios" className="scroll-mt-20 py-14 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.025em] [text-wrap:balance]">
            Empieza con <span className="text-[var(--lv3-lit)]">el tamaño que tienes hoy</span>.
          </h2>
          <p className="mt-5 text-base leading-7 text-[var(--lv3-muted)]">Todos los planes incluyen 14 días de prueba sin tarjeta de crédito.</p>
          {hayAnual && (
            <div role="group" aria-label="Ciclo de pago" className="mt-8 inline-flex rounded-full border border-[var(--lv3-line)] bg-[var(--lv3-surface)] p-1 text-sm">
              {(['mensual', 'anual'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={ciclo === c}
                  onClick={() => setCiclo(c)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 font-medium transition-colors ${ciclo === c ? 'bg-[var(--lv3-text)] text-[var(--lv3-bg)]' : 'text-[var(--lv3-muted)] hover:text-[var(--lv3-text)]'}`}
                >
                  {c === 'mensual' ? 'Mensual' : `Anual · ahorra hasta ${maxDescuento} %`}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="mx-auto mt-10 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando planes">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-80 animate-pulse rounded-2xl motion-reduce:animate-none border border-[var(--lv3-line)] bg-[var(--lv3-surface)]" />
            ))}
          </div>
        ) : isError ? (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-[var(--lv3-line)] bg-[var(--lv3-surface)] p-8 text-center">
            <p className="lv3-display text-xl">No pudimos cargar los planes en este momento.</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lv3-muted)]">Puedes iniciar tu prueba de todas formas o volver a intentarlo.</p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--lv3-line)] px-5 text-sm font-medium text-[var(--lv3-text)] transition-colors hover:bg-[var(--lv3-surface-2)] disabled:pointer-events-none disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
                {isFetching ? 'Reintentando' : 'Reintentar'}
              </button>
              <CtaPrimary href="/registro-clinica">Empezar prueba</CtaPrimary>
            </div>
          </div>
        ) : planes && planes.length > 0 ? (
          <div className="mx-auto mt-10 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {planes.map((plan, i) => {
              const destacado = plan.recomendado
              const Icono = ICONOS[Math.min(i, ICONOS.length - 1)]
              return (
                <article
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl p-7 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                    destacado
                      ? 'border border-[#d9226f]/40 bg-white bg-[radial-gradient(120%_70%_at_100%_0%,rgba(217,34,111,0.16),transparent_62%)] shadow-[0_30px_60px_-38px_rgba(192,29,99,0.55)]'
                      : 'border border-[var(--lv3-line)] bg-white hover:shadow-[0_30px_60px_-35px_rgba(192,29,99,0.45)]'
                  }`}
                >
                  {destacado && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#d9226f]/30 bg-[#fdf0f5] px-3 py-1 text-xs font-semibold text-[#c01d63]">
                      Más elegido
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${destacado ? 'bg-[#d9226f]/[0.16] text-[#c01d63]' : 'bg-[#d9226f]/10 text-[#c01d63]'}`}>
                      <Icono className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <h3 className="lv3-display text-2xl">{plan.nombre}</h3>
                  </div>
                  {plan.descripcion && <p className="mt-2 min-h-[6.5rem] text-[13px] leading-5 text-[var(--lv3-faint)]">{plan.descripcion}</p>}
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="lv3-display text-4xl tracking-tight">
                      {plan.precio === null ? formatPrecio(null) : COP_FMT.format(precioMes(plan.precio, ciclo, plan.descuento_anual_pct))}
                    </span>
                    {plan.precio !== null && <span className="text-xs text-[var(--lv3-faint)]">/mes</span>}
                  </p>
                  {plan.precio !== null && ciclo === 'anual' && (
                    <p className="mt-1 text-xs text-[var(--lv3-faint)]">
                      {plan.descuento_anual_pct > 0
                        ? `${COP_FMT.format(precioMes(plan.precio, 'anual', plan.descuento_anual_pct) * 12)} al año · ahorras ${plan.descuento_anual_pct} %`
                        : 'Este plan se paga mes a mes'}
                    </p>
                  )}
                  <ul className="mt-6 flex-1 space-y-3">
                    <Punto>{plan.max_usuarios > 0 ? `Hasta ${plan.max_usuarios} ${plan.max_usuarios === 1 ? 'usuario' : 'usuarios'}` : 'Usuarios ilimitados'}</Punto>
                    <Punto>{plan.max_sedes > 0 ? `Hasta ${plan.max_sedes} ${plan.max_sedes === 1 ? 'sede' : 'sedes'}` : 'Sedes ilimitadas'}</Punto>
                    {plan.facial_verificacion_habilitada && <Punto>Verificación facial</Punto>}
                    {plan.whatsapp_habilitado && <Punto>WhatsApp integrado</Punto>}
                  </ul>
                  <Link
                    href="/registro-clinica"
                    className={`group mt-8 inline-flex h-11 w-full items-center justify-between rounded-xl px-4 text-sm font-semibold transition-colors ${
                      destacado
                        ? 'bg-[#d9226f] text-white hover:bg-[#c01d63]'
                        : 'border border-[#d9226f]/30 text-[#c01d63] hover:bg-[#d9226f]/[0.06]'
                    }`}
                  >
                    Probar gratis
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-[var(--lv3-line)] bg-[var(--lv3-surface)] p-8 text-center">
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

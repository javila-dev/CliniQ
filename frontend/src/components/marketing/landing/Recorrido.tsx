'use client'

import { useEffect, useRef, useState } from 'react'
import { Dash, Ventana, type Captura } from './shared'

const PASOS: {
  hora: string
  rol: string
  momento: string
  title: string
  desc: string
  bullets: string[]
  captura: Captura
}[] = [
  {
    hora: '08:00',
    rol: 'Recepción',
    momento: 'Antes de la atención',
    title: 'La agenda deja de ser una conversación fragmentada.',
    desc: 'Recepción coordina citas, sedes, profesionales y llegadas desde una sola vista. El equipo sabe qué ocurre sin perseguir respuestas por WhatsApp.',
    captura: 'agenda',
    bullets: ['Agenda diaria, semanal y mensual', 'Confirmaciones y recordatorios', 'Autorregistro y check-in del paciente'],
  },
  {
    hora: '11:30',
    rol: 'Profesionales',
    momento: 'Durante la atención',
    title: 'Cada sesión empieza con el contexto completo.',
    desc: 'El profesional ve quién sigue y continúa el proceso clínico con historia, fotografías, zonas tratadas, consentimientos y evolución por sesión.',
    captura: 'atenciones',
    bullets: ['Cola de atención en vivo', 'Historia clínica y registro fotográfico', 'Protocolos, zonas y seguimiento por sesión'],
  },
  {
    hora: '18:00',
    rol: 'Administración',
    momento: 'Después de la atención',
    title: 'Lo vendido, lo cobrado y lo pendiente dejan de vivir separados.',
    desc: 'Cotizaciones, acuerdos de pago, cuotas y mora quedan conectados con el paciente y el tratamiento que originó cada movimiento.',
    captura: 'cartera',
    bullets: ['Cotizaciones, cobros y cartera', 'Acuerdos de pago con firma electrónica', 'Resultados, caja y trazabilidad'],
  },
]

export function Recorrido() {
  const [activo, setActivo] = useState(0)
  const pasos = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActivo(Number((entry.target as HTMLElement).dataset.paso))
        })
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 },
    )
    pasos.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="recorrido" className="scroll-mt-20 border-t border-white/[0.07] py-16 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="max-w-3xl">
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.02em] [text-wrap:balance]">
            <span className="text-[var(--lv3-lit)]">Un solo flujo</span>, visto por todo el equipo.
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--lv3-muted)]">
            Explora cómo cambia la operación para cada rol, sin duplicar datos ni depender de mensajes sueltos.
          </p>
        </div>

        <div className="mt-14 grid lg:mt-20 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
          <ol>
            {PASOS.map((paso, i) => (
              <li
                key={paso.hora}
                ref={(el) => { pasos.current[i] = el }}
                data-paso={i}
                className="grid grid-cols-[3.6rem_minmax(0,1fr)] gap-x-4 py-10 lg:min-h-[62vh] lg:grid-cols-[6.4rem_minmax(0,1fr)] lg:items-center lg:py-0"
              >
                <div className="relative flex flex-col items-end justify-center pr-5 text-right">
                  <span aria-hidden className="absolute inset-y-0 right-0 w-px bg-white/10" />
                  <span
                    aria-hidden
                    className={`absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full transition-all duration-500 motion-reduce:transition-none ${
                      activo === i ? 'bg-[var(--lv3-lit)] shadow-[0_0_0_5px_rgba(255,106,169,0.18)]' : 'bg-white/25'
                    }`}
                  />
                  <span className={`lv3-mono text-sm transition-colors duration-500 motion-reduce:transition-none ${activo === i ? 'text-white' : 'text-[var(--lv3-faint)]'}`}>
                    {paso.hora}
                  </span>
                  <span className="mt-1 hidden text-[11px] leading-4 text-[var(--lv3-faint)] lg:block">{paso.momento}</span>
                </div>

                <div className={`transition-opacity duration-500 motion-reduce:transition-none lg:py-8 ${activo === i ? 'opacity-100' : 'lg:opacity-60'}`}>
                  <h3 className="lv3-display text-[clamp(1.55rem,2.5vw,2.25rem)] leading-[1.12] tracking-[-0.015em] [text-wrap:balance]">
                    {paso.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-7 text-[var(--lv3-muted)]">{paso.desc}</p>
                  <ul className="mt-6 space-y-3">
                    {paso.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm text-white/90">
                        <Dash />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="col-span-2 mt-8 lg:hidden">
                  <Ventana captura={paso.captura} caption={`${paso.rol} · ${paso.momento}`} />
                </div>
              </li>
            ))}
          </ol>

          <div className="hidden lg:block">
            <div className="sticky top-28 flex h-[calc(100vh-9rem)] items-center">
              <div className="relative h-[34rem] w-full">
                {PASOS.map((paso, i) => (
                  <div
                    key={paso.captura}
                    aria-hidden={activo !== i}
                    className={`absolute inset-x-0 top-1/2 transition-all duration-700 ease-out motion-reduce:transition-none ${
                      activo === i ? '-translate-y-1/2 opacity-100' : 'pointer-events-none -translate-y-[45%] opacity-0'
                    }`}
                  >
                    <Ventana captura={paso.captura} caption={`${paso.rol} · ${paso.momento}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

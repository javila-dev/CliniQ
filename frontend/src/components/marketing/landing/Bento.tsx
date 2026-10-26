import { Check } from 'lucide-react'
import Image from 'next/image'
import { CelularFirma } from './Ilustraciones'

function Tile({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <article className={`flex flex-col rounded-3xl border border-[var(--lv3-line)] bg-[var(--lv3-surface)] bg-[radial-gradient(90%_70%_at_100%_0%,rgba(217,34,111,0.07),transparent_62%)] p-7 sm:p-9 ${className}`}>{children}</article>
}

const PULSO = [
  { titulo: 'Citas de hoy', valor: '18', detalle: '15 confirmadas por WhatsApp' },
  { titulo: 'Ingresos del mes', valor: '$24,6 M', detalle: '62 % de la meta' },
  { titulo: 'Cartera vencida', valor: '$1,2 M', detalle: '4 cuotas por cobrar' },
]

const OCUPACION = [
  { sede: 'Sede principal', pct: 82 },
  { sede: 'Sede norte', pct: 64 },
  { sede: 'Sede sur', pct: 71 },
]

// Marcas sobre el diagrama del rostro, como las dibuja la pestaña Zonas de la historia:
// x, y y r en fracción del ancho de la imagen.
const MARCAS = [
  { n: 1, x: 0.5, y: 0.29, r: 0.11 },
  { n: 2, x: 0.5, y: 0.45, r: 0.05 },
  { n: 3, x: 0.25, y: 0.51, r: 0.05 },
  { n: 3, x: 0.75, y: 0.51, r: 0.05 },
]

const ZONAS = [
  { n: 1, nombre: 'Frente', detalle: 'Toxina · 10 U' },
  { n: 2, nombre: 'Entrecejo', detalle: 'Toxina · 20 U' },
  { n: 3, nombre: 'Patas de gallo', detalle: 'Toxina · 12 U c/u' },
]

const AUDITORIA = [
  { hora: '09:12', quien: 'Laura M. · Recepción', accion: 'abrió la agenda de Sede Norte' },
  { hora: '10:24', quien: 'Dr. Andrés P.', accion: 'firmó la nota de sesión del paciente #1042' },
  { hora: '10:31', quien: 'Carlos R. · Caja', accion: 'registró un pago de $180.000' },
  { hora: '10:47', quien: 'Laura M. · Recepción', accion: 'consultó el teléfono ••• ••• 4821 (enmascarado)' },
  { hora: '11:05', quien: 'Sofía L. · Administración', accion: 'cambió los permisos del rol Recepción' },
]

const TITULO = 'lv3-display text-[clamp(1.5rem,2.2vw,2rem)] leading-[1.12] tracking-[-0.02em] [text-wrap:balance]'
const TEXTO = 'mt-4 max-w-md text-[15px] leading-7 text-[var(--lv3-muted)]'

export function Bento() {
  return (
    <section id="capacidades" className="scroll-mt-20 py-14 sm:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-24">
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.025em] [text-wrap:balance]">
            Diseñado alrededor de <span className="text-[var(--lv3-lit)]">cómo trabaja una clínica estética</span>.
          </h2>
          <p className="max-w-xl text-base leading-7 text-[var(--lv3-muted)] lg:justify-self-end">
            Procedimientos, zonas, sesiones, documentos y cobros comparten el mismo contexto. No son campos genéricos añadidos a una agenda.
          </p>
        </div>

        <div
          className="mt-10 grid gap-3 lg:grid-cols-3"
        >
          <Tile className="lg:col-span-2">
            <h3 className={TITULO}>El pulso de la clínica, sin abrir cinco reportes.</h3>
            <dl className="mt-7 grid gap-3 sm:grid-cols-3">
              {PULSO.map((k) => (
                <div key={k.titulo} className="rounded-2xl bg-white p-4 ring-1 ring-[var(--lv3-line)]">
                  <dt className="text-xs text-[var(--lv3-faint)]">{k.titulo}</dt>
                  <dd className="lv3-display mt-2 text-3xl tracking-tight">{k.valor}</dd>
                  <dd className="mt-1 text-xs text-[var(--lv3-muted)]">{k.detalle}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-1 flex-col rounded-2xl bg-white p-4 ring-1 ring-[var(--lv3-line)]">
              <p className="text-xs text-[var(--lv3-faint)]">Ocupación de agenda por sede · esta semana</p>
              <ul className="mt-3 flex flex-1 flex-col justify-evenly gap-2.5">
                {OCUPACION.map((o) => (
                  <li key={o.sede} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-[13px]">
                    <span className="truncate text-[var(--lv3-text)]">{o.sede}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-[var(--lv3-surface-2)]">
                      <span className="block h-full rounded-full bg-[#d9226f]" style={{ width: `${o.pct}%` }} />
                    </span>
                    <span className="lv3-mono text-right text-xs text-[var(--lv3-muted)]">{o.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </Tile>

          <Tile>
            <h3 className={TITULO}>Historia clínica que acompaña el tratamiento</h3>
            <p className={TEXTO}>Fotografías, zonas anatómicas, notas, antecedentes y evolución organizados alrededor de cada paciente y cada sesión.</p>
            <div className="mt-auto space-y-5 pt-6">
              <div className="flex items-center gap-4">
                <div className="relative w-[55%] max-w-[13rem] shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-[var(--lv3-line)]">
                  <Image src="/img/landing/diagrama-rostro.png" alt="Diagrama del rostro con la frente, el entrecejo y las patas de gallo marcados" width={1536} height={1536} sizes="208px" className="block h-auto w-full" />
                  {MARCAS.map((m, i) => (
                    <span key={i} aria-hidden>
                      <span
                        className="lv3-marca absolute rounded-full border-2 border-[#d9226f]/50 bg-[#d9226f]/[0.08]"
                        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.r * 200}%`, aspectRatio: '1', transform: 'translate(-50%, -50%)', '--fase': `${i * -0.6}s` } as React.CSSProperties}
                      />
                      <span
                        className="absolute flex h-4 w-4 items-center justify-center rounded-full bg-[#d9226f] text-[9px] font-bold text-white shadow"
                        style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, transform: 'translate(-50%, -50%)' }}
                      >
                        {m.n}
                      </span>
                    </span>
                  ))}
                </div>
                <ul className="flex min-w-0 flex-1 flex-col gap-3">
                  {ZONAS.map((z) => (
                    <li key={z.n} className="flex items-start gap-2 whitespace-nowrap">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#d9226f] text-[9px] font-bold text-white">{z.n}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-[var(--lv3-text)]">{z.nombre}</span>
                        <span className="block text-[11px] text-[var(--lv3-faint)]">{z.detalle}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[var(--lv3-text)]">Sesión 3 de 6</span>
                  <span className="lv3-mono text-[var(--lv3-faint)]">Próxima · 08 oct</span>
                </div>
                <div className="mt-2.5 grid grid-cols-6 gap-1.5" aria-hidden>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={`h-1.5 rounded-full ${i < 3 ? 'bg-[var(--lv3-lit)]' : 'bg-[var(--lv3-line)]'}`} />
                  ))}
                </div>
              </div>
            </div>
          </Tile>

          <Tile>
            <h3 className={TITULO}>Consentimientos e identidad verificada</h3>
            <p className={TEXTO}>Documentos por procedimiento con firma electrónica, más verificación facial y OTP por WhatsApp para confirmar al paciente que llega.</p>
            <div className="mt-auto flex items-center gap-4 pt-6">
            <CelularFirma className="h-36 w-auto shrink-0 text-[#1b1020]/45" />
            <div className="min-w-0 flex-1 rounded-xl border border-[var(--lv3-line)] bg-white p-4">
              <p className="text-xs text-[var(--lv3-faint)]">Código enviado por WhatsApp</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {['4', '8', '2', '9'].map((d, i) => (
                  <span key={d + i} className="lv3-mono flex h-11 w-8 items-center justify-center rounded-lg border border-[var(--lv3-line)] bg-[var(--lv3-surface)] text-lg">
                    <span className={`lv3-d lv3-d${i + 1}`}>{d}</span>
                  </span>
                ))}
                <span className="lv3-otp-ok inline-flex basis-full items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--lv3-ok)]">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Identidad verificada
                </span>
              </div>
            </div>
            </div>
          </Tile>

          <Tile className="lg:col-span-2">
            <h3 className={TITULO}>Permisos y auditoría</h3>
            <p className={`${TEXTO} mb-8`}>Cada rol ve y hace lo necesario. Las acciones sensibles quedan registradas por usuario.</p>
            <ul className="mt-auto divide-y divide-[var(--lv3-line)] rounded-xl border border-[var(--lv3-line)] bg-white text-[13px]">
              {AUDITORIA.map((l) => (
                <li key={l.hora} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[3rem_11rem_minmax(0,1fr)]">
                  <span className="lv3-mono text-xs leading-5 text-[var(--lv3-faint)]">{l.hora}</span>
                  <span className="col-start-2 text-[var(--lv3-text)] sm:col-start-auto">{l.quien}</span>
                  <span className="col-start-2 text-[var(--lv3-muted)] sm:col-start-auto">{l.accion}</span>
                </li>
              ))}
            </ul>
          </Tile>
        </div>
      </div>
    </section>
  )
}

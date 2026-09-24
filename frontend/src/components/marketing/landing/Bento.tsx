import Image from 'next/image'
import { Check } from 'lucide-react'
import { CAPTURAS } from './shared'

function Tile({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <article className={`flex flex-col bg-[var(--lv3-sheet)] p-7 sm:p-9 ${className}`}>{children}</article>
}

const ZONAS = [
  { nombre: 'Frente', activa: true },
  { nombre: 'Entrecejo', activa: true },
  { nombre: 'Patas de gallo', activa: false },
  { nombre: 'Mentón', activa: false },
]

const AUDITORIA = [
  { hora: '09:12', quien: 'Laura M. · Recepción', accion: 'abrió la agenda de Sede Norte' },
  { hora: '10:24', quien: 'Dr. Andrés P.', accion: 'firmó la nota de sesión del paciente #1042' },
  { hora: '10:31', quien: 'Carlos R. · Caja', accion: 'registró un pago de $180.000' },
  { hora: '10:47', quien: 'Laura M. · Recepción', accion: 'consultó el teléfono ••• ••• 4821 (enmascarado)' },
]

const TITULO = 'lv3-display text-[clamp(1.5rem,2.2vw,2rem)] leading-[1.12] tracking-[-0.015em] [text-wrap:balance]'
const TEXTO = 'mt-4 max-w-md text-[15px] leading-7 text-[var(--lv3-muted)]'

export function Bento() {
  return (
    <section id="capacidades" className="scroll-mt-20 border-t border-white/[0.07] py-16 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-24">
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.02em] [text-wrap:balance]">
            Diseñado alrededor de <span className="text-[var(--lv3-lit)]">cómo trabaja una clínica estética</span>.
          </h2>
          <p className="max-w-xl text-base leading-7 text-[var(--lv3-muted)] lg:justify-self-end">
            Procedimientos, zonas, sesiones, documentos y cobros comparten el mismo contexto. No son campos genéricos añadidos a una agenda.
          </p>
        </div>

        <div
          className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 lg:grid-cols-3"
        >
          <Tile className="lg:col-span-2">
            <h3 className={TITULO}>El pulso de la clínica, sin abrir cinco reportes.</h3>
            <dl className="mt-5 grid gap-x-8 gap-y-4 text-sm leading-6 text-[var(--lv3-muted)] sm:grid-cols-3">
              <div>
                <dt className="font-medium text-[var(--lv3-text)]">Operación de hoy</dt>
                <dd>Citas, confirmaciones y atenciones pendientes.</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--lv3-text)]">Salud comercial</dt>
                <dd>Cotizaciones, conversión e ingresos del periodo.</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--lv3-text)]">Cartera visible</dt>
                <dd>Saldo pendiente y cuotas vencidas para actuar a tiempo.</dd>
              </div>
            </dl>
            <div className="relative mt-8 min-h-56 flex-1 overflow-hidden rounded-xl border border-white/10 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] sm:min-h-64">
              <Image
                src={CAPTURAS.dashboard.src}
                alt={CAPTURAS.dashboard.alt}
                fill
                sizes="(min-width: 1024px) 720px, 100vw"
                className="object-cover object-left-top"
              />
            </div>
            <p className="lv3-mono mt-3 text-[10px] uppercase tracking-[0.14em] text-[var(--lv3-faint)]">Ejemplo ilustrativo · datos ficticios</p>
          </Tile>

          <Tile>
            <h3 className={TITULO}>Historia clínica que acompaña el tratamiento</h3>
            <p className={TEXTO}>Fotografías, zonas anatómicas, notas, antecedentes y evolución organizados alrededor de cada paciente y cada sesión.</p>
            <div className="mt-8 space-y-5">
              <div className="flex flex-wrap gap-2">
                {ZONAS.map((z) => (
                  <span
                    key={z.nombre}
                    className={`rounded-full border px-3 py-1.5 text-xs ${
                      z.activa ? 'border-[#ff6aa9]/50 bg-[#d9226f]/[0.16] text-white' : 'border-white/[0.12] text-[var(--lv3-muted)]'
                    }`}
                  >
                    {z.nombre}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-[var(--lv3-text)]">Sesión 3 de 6</span>
                  <span className="lv3-mono text-[var(--lv3-faint)]">Próxima · 08 oct</span>
                </div>
                <div className="mt-2.5 grid grid-cols-6 gap-1.5" aria-hidden>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={`h-1.5 rounded-full ${i < 3 ? 'bg-[var(--lv3-lit)]' : 'bg-white/[0.12]'}`} />
                  ))}
                </div>
              </div>
            </div>
          </Tile>

          <Tile>
            <h3 className={TITULO}>Consentimientos e identidad verificada</h3>
            <p className={TEXTO}>Documentos por procedimiento con firma electrónica, más verificación facial y OTP por WhatsApp para confirmar al paciente que llega.</p>
            <div className="mt-8 rounded-xl border border-white/10 bg-[var(--lv3-surface)] p-4">
              <p className="text-xs text-[var(--lv3-faint)]">Código enviado por WhatsApp</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {['4', '8', '2', '9'].map((d, i) => (
                  <span key={d + i} className="lv3-mono flex h-11 w-9 items-center justify-center rounded-lg border border-white/[0.12] bg-black/30 text-lg">
                    <span className={`lv3-d lv3-d${i + 1}`}>{d}</span>
                  </span>
                ))}
                <span className="lv3-otp-ok ml-2 inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Identidad verificada
                </span>
              </div>
            </div>
          </Tile>

          <Tile className="lg:col-span-2">
            <h3 className={TITULO}>Permisos y auditoría</h3>
            <p className={TEXTO}>Cada rol ve y hace lo necesario. Las acciones sensibles quedan registradas por usuario.</p>
            <ul className="mt-8 divide-y divide-white/[0.07] rounded-xl border border-white/10 bg-[var(--lv3-surface)] text-[13px]">
              {AUDITORIA.map((l) => (
                <li key={l.hora} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-4 py-3 sm:grid-cols-[3rem_11rem_minmax(0,1fr)]">
                  <span className="lv3-mono text-xs leading-5 text-[var(--lv3-faint)]">{l.hora}</span>
                  <span className="col-start-2 text-[var(--lv3-text)] sm:col-start-auto">{l.quien}</span>
                  <span className="col-start-2 text-[var(--lv3-muted)] sm:col-start-auto">{l.accion}</span>
                </li>
              ))}
            </ul>
            <p className="lv3-mono mt-3 text-[10px] uppercase tracking-[0.14em] text-[var(--lv3-faint)]">Ejemplo ilustrativo · datos ficticios</p>
          </Tile>
        </div>
      </div>
    </section>
  )
}

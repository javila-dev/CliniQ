import { Check, CheckCheck } from 'lucide-react'

function Panel({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--lv3-surface)] shadow-[0_30px_70px_-35px_rgba(217,34,111,0.55)] ${className}`}>
      {children}
    </div>
  )
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
      <span className="text-[13px] font-medium text-[var(--lv3-text)]">{title}</span>
      <span className="lv3-mono text-[11px] text-[var(--lv3-faint)]">{meta}</span>
    </div>
  )
}

const PILL = 'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium'
const PILL_OK = `${PILL} bg-emerald-400/[0.13] text-emerald-300`
const PILL_WARN = `${PILL} bg-amber-300/[0.13] text-amber-200`

function Fila({
  hora, servicio, paciente, children, className = '',
}: { hora: string; servicio: string; paciente: string; children: React.ReactNode; className?: string }) {
  return (
    <li className={`grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-b-0 ${className}`}>
      <span className="lv3-mono text-xs text-[var(--lv3-faint)]">{hora}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-[var(--lv3-text)]">{servicio}</span>
        <span className="block truncate text-xs text-[var(--lv3-faint)]">{paciente}</span>
      </span>
      {children}
    </li>
  )
}

export function ProductTheater() {
  return (
    <div
      className="lv3-rise lv3-rise-3 relative mx-auto w-full max-w-[560px] lg:mx-0 lg:ml-auto lg:w-[560px]"
      role="img"
      aria-label="Ejemplo de un día en CliniQ: un recordatorio por WhatsApp, la cita que pasa a confirmada, un consentimiento firmado y una cuota pagada."
    >
      <div aria-hidden className="pointer-events-none absolute -inset-14 -z-10 bg-[radial-gradient(50%_50%_at_60%_50%,rgba(217,34,111,0.3),transparent_72%)]" />

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel className="sm:col-span-2">
          <PanelHead title="Agenda · Sede Norte" meta="Ejemplo · Mié 24" />
          <ul>
            <Fila hora="09:00" servicio="Limpieza facial" paciente="M. Rojas">
              <span className={PILL_OK}>Completada</span>
            </Fila>
            <Fila hora="10:30" servicio="Toxina botulínica" paciente="Valentina G." className="lv3-t-row">
              <span className="relative block h-6 w-[104px]">
                <span className={`lv3-t-pill-a absolute right-0 top-0 ${PILL_WARN}`}>Pendiente</span>
                <span className={`lv3-t-pill-b absolute right-0 top-0 ${PILL_OK}`}>Confirmada</span>
              </span>
            </Fila>
            <Fila hora="11:15" servicio="Valoración" paciente="C. Ortiz">
              <span className={PILL_WARN}>Pendiente</span>
            </Fila>
          </ul>
        </Panel>

        <Panel>
          <PanelHead title="WhatsApp" meta="18:02" />
          <div className="flex flex-1 flex-col justify-between gap-3 p-4">
            <div className="relative">
              <div className="lv3-t-typing absolute left-0 top-0 inline-flex items-center gap-1 rounded-2xl rounded-tl-md bg-[var(--lv3-surface-2)] px-3.5 py-3" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              </div>
              <p className="lv3-t-in max-w-[94%] rounded-2xl rounded-tl-md bg-[var(--lv3-surface-2)] px-3.5 py-2.5 text-[13px] leading-5 text-[var(--lv3-text)]">
                Hola Valentina, te recordamos tu cita de mañana a las 10:30 en Sede Norte. ¿La confirmas?
              </p>
            </div>
            <p className="lv3-t-reply ml-auto flex w-fit items-center gap-2 rounded-2xl rounded-tr-md border border-[#ff6aa9]/25 bg-[#d9226f]/[0.22] px-3.5 py-2.5 text-[13px] text-white">
              Sí, confirmo <CheckCheck className="h-3.5 w-3.5 text-[var(--lv3-lit)]" aria-hidden />
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Consentimiento" meta="10:24" />
          <div className="flex flex-1 flex-col p-4">
            <p className="text-xs leading-5 text-[var(--lv3-faint)]">
              Toxina botulínica. Autorizo la realización del procedimiento y declaro haber recibido la información.
            </p>
            <div className="relative mt-auto h-14 border-b border-white/15">
              <svg viewBox="0 0 120 40" className="absolute inset-x-0 bottom-0 h-12 w-full" fill="none" aria-hidden>
                <path
                  className="lv3-t-sign"
                  pathLength={1}
                  d="M6 30 C 14 6, 22 42, 32 20 S 48 6, 56 24 S 72 38, 84 14 S 100 10, 112 26"
                  stroke="#ff6aa9"
                  strokeWidth="2"
                  strokeLinecap="butt"
                />
              </svg>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="whitespace-nowrap text-[11px] text-[var(--lv3-faint)]">Firma del paciente</span>
              <span className="lv3-t-stamp inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-emerald-300">
                <Check className="h-3 w-3" aria-hidden /> Firmado electrónicamente
              </span>
            </div>
          </div>
        </Panel>

        <Panel className="sm:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
            <div>
              <p className="text-[13px] font-medium text-[var(--lv3-text)]">Acuerdo de pago</p>
              <p className="lv3-mono mt-0.5 text-[11px] text-[var(--lv3-faint)]">Cuota 3 de 6</p>
            </div>
            <div className="grid w-28 grid-cols-6 gap-1.5" aria-hidden>
              <span className="h-1.5 rounded-full bg-[var(--lv3-lit)]" />
              <span className="h-1.5 rounded-full bg-[var(--lv3-lit)]" />
              <span className="lv3-t-pip h-1.5 rounded-full" />
              <span className="h-1.5 rounded-full bg-white/[0.12]" />
              <span className="h-1.5 rounded-full bg-white/[0.12]" />
              <span className="h-1.5 rounded-full bg-white/[0.12]" />
            </div>
            <div className="flex items-center gap-4">
              <span className="lv3-mono text-xl tracking-tight text-[var(--lv3-text)]">$180.000</span>
              <span className="relative block h-6 w-[88px]">
                <span className={`lv3-t-cuota-a absolute right-0 top-0 ${PILL_WARN}`}>Vence hoy</span>
                <span className={`lv3-t-cuota-b absolute right-0 top-0 ${PILL_OK}`}>Pagada</span>
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <p className="lv3-mono mt-4 text-center text-[10px] uppercase tracking-[0.14em] text-[var(--lv3-faint)] lg:text-right">
        Ejemplo ilustrativo · datos ficticios
      </p>
    </div>
  )
}

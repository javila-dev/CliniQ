import { MessageCircle, NotebookPen, Sheet, Smartphone } from 'lucide-react'
import { EnVista } from './EnVista'

// dx/dy/giro: de dónde llega cada fuente suelta antes de ordenarse.
const DISPERSOS = [
  { icono: NotebookPen, texto: 'Cuaderno de citas', dx: '-70px', dy: '-46px', giro: '-9deg' },
  { icono: Sheet, texto: 'Excel de pagos', dx: '64px', dy: '-54px', giro: '8deg' },
  { icono: Smartphone, texto: 'Fotos en el celular', dx: '-76px', dy: '34px', giro: '7deg' },
  { icono: MessageCircle, texto: 'Chats sueltos', dx: '72px', dy: '26px', giro: '-10deg' },
]

const PESTANAS = ['Historia', 'Fotos', 'Consentimientos', 'Cartera']

const DATOS: { clave: string; valor: string; ok?: boolean }[] = [
  { clave: 'Próxima cita', valor: 'Jue 30 oct · 10:30' },
  { clave: 'Tratamiento', valor: 'Toxina · sesión 3 de 6' },
  { clave: 'Consentimiento', valor: 'Firmado electrónicamente', ok: true },
  { clave: 'Saldo', valor: '$360.000 · 2 cuotas' },
]

/** Las herramientas sueltas de la clínica terminan en una sola ficha del paciente. */
export function Ficha() {
  return (
    <EnVista
      className="relative overflow-hidden rounded-[1.75rem] border border-[var(--lv3-line)] bg-[var(--lv3-surface)] p-5 sm:p-8"
      role="img"
      aria-label="El cuaderno de citas, el Excel de pagos, las fotos del celular y los chats quedan reunidos en la ficha de una paciente con su historia, próxima cita, tratamiento, consentimiento y saldo."
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(70%_55%_at_0%_0%,rgba(217,34,111,0.13),transparent_70%),radial-gradient(60%_55%_at_100%_100%,rgba(150,90,220,0.1),transparent_70%)]"
      />
      <div className="relative">
        <ul className="grid grid-cols-2 gap-2">
          {DISPERSOS.map(({ icono: Icono, texto, dx, dy, giro }, i) => (
            <li
              key={texto}
              style={{ '--dx': dx, '--dy': dy, '--giro': giro, '--retraso': `${i * 90}ms` } as React.CSSProperties}
              className="lv3-junta flex items-center gap-2 rounded-xl border border-dashed border-[#1b1020]/15 bg-white/60 px-3 py-2 text-xs text-[var(--lv3-faint)]">
              <Icono className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate line-through decoration-[#d9226f]/50">{texto}</span>
            </li>
          ))}
        </ul>

        <div aria-hidden className="lv3-baja mx-auto my-3 h-8 w-px bg-gradient-to-b from-[#1b1020]/10 to-[#d9226f]" />

        <div style={{ '--retraso': '900ms' } as React.CSSProperties} className="lv3-entra rounded-2xl bg-white p-4 shadow-[0_24px_60px_-30px_rgba(27,16,32,0.35)] ring-1 ring-black/5 sm:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d9226f] text-sm font-semibold text-white">VG</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">Valentina Gómez</span>
              <span className="block text-xs text-[var(--lv3-faint)]">Paciente · Sede Norte</span>
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Al día</span>
          </div>

          <div className="mt-4 flex gap-4 overflow-hidden border-b border-[var(--lv3-line)] text-xs">
            {PESTANAS.map((p, i) => (
              <span
                key={p}
                className={`-mb-px whitespace-nowrap border-b-2 pb-2 ${i === 0 ? 'border-[#d9226f] font-medium text-[var(--lv3-text)]' : 'border-transparent text-[var(--lv3-faint)]'}`}
              >
                {p}
              </span>
            ))}
          </div>

          <dl className="mt-1 divide-y divide-[var(--lv3-line)] text-[13px]">
            {DATOS.map((d) => (
              <div key={d.clave} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-[var(--lv3-faint)]">{d.clave}</dt>
                <dd className={`text-right ${d.ok ? 'font-medium text-emerald-700' : 'text-[var(--lv3-text)]'}`}>{d.valor}</dd>
              </div>
            ))}
          </dl>
        </div>

      </div>
    </EnVista>
  )
}

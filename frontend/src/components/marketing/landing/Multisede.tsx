import { Dash } from './shared'

const SEDES = ['Sede principal', 'Sede norte', 'Sede sur']

const STOCK = [
  { insumo: 'Ácido hialurónico 1 ml', valores: [24, 6, 15] },
  { insumo: 'Toxina botulínica 100 U', valores: [8, 3, 11] },
  { insumo: 'Guantes de nitrilo (caja)', valores: [40, 12, 22] },
]

const COSTO = { insumo: 'Costo promedio · Ácido hialurónico', valores: ['$182.000', '$195.500', '$188.000'] }

const PUNTOS = [
  'Stock y costo promedio por sede',
  'Equipos y permisos por rol',
  'Resultados para tomar decisiones',
  'Auditoría de acciones sensibles',
]

const BAJO = 4

export function Multisede() {
  return (
    <section id="multisede" className="scroll-mt-20 border-t border-white/[0.07] py-16 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-20">
        <div>
          <h2 className="lv3-display text-[clamp(1.9rem,3.1vw,2.85rem)] leading-[1.06] tracking-[-0.02em] [text-wrap:balance]">
            Cada sede conserva su operación. <span className="text-[var(--lv3-lit)]">Tú conservas la visión completa.</span>
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-[var(--lv3-muted)]">
            El catálogo puede ser compartido, pero el stock físico, los costos y los movimientos pertenecen al lugar donde realmente ocurren.
          </p>
          <ul className="mt-8 space-y-3.5">
            {PUNTOS.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm text-white/90">
                <Dash />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--lv3-surface)] shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <caption className="sr-only">Stock y costo promedio de tres insumos en cada sede</caption>
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th scope="col" className="px-3 py-4 text-xs font-normal text-[var(--lv3-faint)] sm:px-5">Insumo del catálogo</th>
                    {SEDES.map((s) => (
                      <th key={s} scope="col" className="px-2 py-4 font-medium text-[var(--lv3-text)] sm:px-4">
                        <span className="block">{s}</span>
                        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-normal text-emerald-300">
                          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> <span className="hidden sm:inline">Operación activa</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STOCK.map((fila) => (
                    <tr key={fila.insumo} className="border-b border-white/[0.06]">
                      <th scope="row" className="px-3 py-4 font-normal text-[var(--lv3-muted)] sm:px-5">{fila.insumo}</th>
                      {fila.valores.map((v, i) => (
                        <td key={i} className="lv3-mono px-2 py-4 text-sm sm:px-4 sm:text-base">
                          <span className={v <= BAJO ? 'text-[var(--lv3-lit)]' : 'text-[var(--lv3-text)]'}>{v}</span>
                          {v <= BAJO && <span className="ml-2 font-sans text-[11px] text-[#ff6aa9]/80">Bajo</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="px-3 py-4 font-normal text-[var(--lv3-muted)] sm:px-5">{COSTO.insumo}</th>
                    {COSTO.valores.map((v) => (
                      <td key={v} className="lv3-mono px-2 py-4 text-[var(--lv3-text)] sm:px-4">{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-1 border-t border-white/[0.08] px-5 py-4 text-xs text-[var(--lv3-faint)] sm:flex-row sm:items-center sm:justify-between">
              <span>Cada sede: Agenda · Stock · Compras · Caja</span>
              <span className="lv3-mono text-[10px] uppercase tracking-[0.14em]">Ejemplo ilustrativo · datos ficticios</span>
            </div>
          </div>
          <p className="mt-5 flex items-center gap-3 text-xs font-medium text-[#ff6aa9]/90">
            <span aria-hidden className="h-px w-8 bg-[#ff6aa9]/60" /> Pacientes y catálogo conectados; operación separada por ubicación.
          </p>
        </div>
      </div>
    </section>
  )
}

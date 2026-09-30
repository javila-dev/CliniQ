/** Tarjeta de sección de Configuración: título (con un extra opcional a la
 *  derecha) y filas separadas por líneas. */
export function Bloque({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3 text-[13.5px] font-semibold">
        {titulo}
        {extra}
      </div>
      <div className="divide-y divide-border/60">{children}</div>
    </section>
  )
}

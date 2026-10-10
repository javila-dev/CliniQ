'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, MapPin, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useUserSedes } from '@/hooks/useUserSedes'
import { cn } from '@/lib/utils'
import type { PrecioSede, PrecioSedeInput } from '@/types/clinicas'

/** Precios propios por sede en el formulario: { sedeId: precio | null }. */
export type PreciosSedeForm = Record<string, number | null>

export function preciosSedeAForm(precios: PrecioSede[] | null | undefined): PreciosSedeForm {
  return Object.fromEntries((precios ?? []).map((p) => [p.sede, Number(p.precio)]))
}

export function preciosSedeAPayload(valores: PreciosSedeForm | null | undefined): PrecioSedeInput[] {
  return Object.entries(valores ?? {})
    .filter(([, precio]) => precio !== null && precio !== undefined)
    .map(([sede, precio]) => ({ sede, precio: precio as number }))
}

const cop = (n: number) => new Intl.NumberFormat('es-CO').format(n)

/** Diferencia frente al precio general, para leer de un vistazo. */
function Diferencia({ precio, general }: { precio: number; general: number | null }) {
  if (!general) return null
  const pct = Math.round(((precio - general) / general) * 100)
  if (pct === 0) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Igual al general</span>
  }
  return (
    <span className={cn(
      'whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
      pct < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
    )}>
      {pct > 0 ? '+' : '−'}{Math.abs(pct)}% vs general
    </span>
  )
}

/**
 * "Precio distinto por sede": una fila por sede con su precio propio. Vacío =
 * usa el general (se ve como texto de ejemplo). Solo aparece con más de una sede.
 */
export function PreciosPorSedeEditor({ value, onChange, precioGeneral }: {
  value: PreciosSedeForm
  onChange: (valor: PreciosSedeForm) => void
  precioGeneral: number | null
}) {
  const { sedes } = useUserSedes()
  const conPrecio = sedes.filter((s) => value[s.id] !== null && value[s.id] !== undefined)
  const [abierto, setAbierto] = useState(conPrecio.length > 0)
  // Al cargar un procedimiento que ya tiene precios por sede, se muestra abierto.
  useEffect(() => { if (conPrecio.length > 0) setAbierto(true) }, [conPrecio.length])

  if (sedes.length <= 1) return null

  function poner(sedeId: string, precio: number | null) {
    onChange({ ...value, [sedeId]: precio })
  }

  const resumen = conPrecio.length === 0
    ? 'Todas las sedes usan el precio general'
    : `${conPrecio.length} de ${sedes.length} sedes con precio propio`

  return (
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Precio distinto por sede</span>
          <span className={cn('block text-xs', conPrecio.length ? 'text-primary' : 'text-muted-foreground')}>{resumen}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="border-t bg-muted/20">
          <ul className="divide-y">
            {sedes.map((sede) => {
              const precio = value[sede.id] ?? null
              return (
                <li key={sede.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{sede.nombre}</span>
                  {precio !== null && <Diferencia precio={precio} general={precioGeneral} />}
                  <div className="relative w-36 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <Input
                      inputMode="numeric"
                      aria-label={`Precio en ${sede.nombre}`}
                      className={cn('h-8 bg-white pl-7 pr-7 text-right tabular-nums', precio === null && 'placeholder:text-muted-foreground/70')}
                      placeholder={precioGeneral != null ? cop(precioGeneral) : 'General'}
                      value={precio !== null ? cop(precio) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, '').slice(0, 9)
                        poner(sede.id, raw ? Number(raw) : null)
                      }}
                    />
                    {precio !== null && (
                      <button
                        type="button"
                        onClick={() => poner(sede.id, null)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Usar el precio general en ${sede.nombre}`}
                        title="Usar el precio general"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="border-t px-4 py-2 text-xs text-muted-foreground">
            Las sedes vacías usan el precio general{precioGeneral != null ? ` ($${cop(precioGeneral)})` : ''}. El descuento máximo se aplica sobre el precio de cada sede.
          </p>
        </div>
      )}
    </div>
  )
}

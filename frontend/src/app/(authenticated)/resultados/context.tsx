'use client'

import { createContext, useContext, useState } from 'react'
import { useUserSedes } from '@/hooks/useUserSedes'
import type { ColaboradorSede } from '@/types/colaboradores'

interface ResultadosSedeCtx {
  /** Sede efectiva a pasar a las queries (undefined = todas). */
  sede: string | undefined
  sedeId: string | null
  setSedeId: (v: string | null) => void
  sedes: ColaboradorSede[]
  isAllSedes: boolean
}

const Ctx = createContext<ResultadosSedeCtx | null>(null)

export function useResultadosSede(): ResultadosSedeCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useResultadosSede fuera de <ResultadosProvider>')
  return v
}

/** Estado de sede compartido por todas las sub-vistas de Resultados. Como los
 *  layouts de Next persisten al navegar entre rutas hijas, la selección
 *  sobrevive al cambiar de pestaña (Resumen ↔ Egresos ↔ Cierre). */
export function ResultadosProvider({ children }: { children: React.ReactNode }) {
  const { sedes, isAllSedes, defaultSedeId } = useUserSedes()
  const [sedeId, setSedeId] = useState<string | null>(null)
  const sede = (sedeId ?? defaultSedeId) ?? undefined
  return (
    <Ctx.Provider value={{ sede, sedeId, setSedeId, sedes, isAllSedes }}>
      {children}
    </Ctx.Provider>
  )
}

'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { PageHeader } from '@/components/shared/PageHeader'
import { FinanzasTabs } from '@/components/finanzas/FinanzasTabs'
import { canAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { ResultadosProvider, useResultadosSede } from './context'

function SedeBadges() {
  const { sede, sedeId, setSedeId, sedes, isAllSedes } = useResultadosSede()
  if (sedes.length <= 1) return null
  const cls = (activo: boolean) => cn(
    'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
    activo ? 'bg-primary text-white border-primary'
           : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/50 hover:text-foreground'
  )
  return (
    <div className="flex flex-wrap gap-2">
      {isAllSedes && (
        <button onClick={() => setSedeId(null)} className={cls(sede === undefined && sedeId === null)}>
          Todas las sedes
        </button>
      )}
      {sedes.map((s) => (
        <button key={s.id} onClick={() => setSedeId(s.id)} className={cls(sede === s.id)}>{s.nombre}</button>
      ))}
    </div>
  )
}

export default function ResultadosLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard check={canAccess.finanzas}>
      <ResultadosProvider>
        <div className="space-y-4">
          <PageHeader title="Resultados" description="Cómo va el negocio: ingresos, egresos y margen del periodo" />
          <FinanzasTabs />
          <SedeBadges />
          {children}
        </div>
      </ResultadosProvider>
    </RoleGuard>
  )
}

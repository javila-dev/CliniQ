'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, CircleDashed } from 'lucide-react'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useResumenConfiguracion } from '@/components/configuracion/ConfiguracionShell'
import { categoriaDeRuta, categoriasVisibles, rutaDe } from '@/components/configuracion/navegacion'
import { EtiquetaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'

// Entrada de Configuración. Solo muestra algo mientras falta parte de la puesta
// en marcha (qué falta y "Continuar"). Con todo listo no hay resumen: en
// computador lleva a la primera categoría; en celular queda el menú, que pone
// ConfiguracionShell arriba.

/** Cuántos pasos pendientes se muestran; el resto, en "Ver los otros". */
const PENDIENTES_VISIBLES = 5

export default function ConfiguracionPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const categorias = categoriasVisibles(user)
  const { checklist, cargando, mostrar } = useResumenConfiguracion()
  const primera = categorias[0] ? rutaDe(categorias[0].ajustes[0].href) : null

  useEffect(() => {
    if (cargando || mostrar || !primera) return
    if (window.matchMedia('(min-width: 1024px)').matches) router.replace(primera)
  }, [cargando, mostrar, primera, router])

  if (!mostrar || !checklist) return null

  const porRevisar = checklist.items
    .filter((i) => !i.completado && !i.omitido)
    .sort((a, b) => Number(b.requerido) - Number(a.requerido))
  const pct = checklist.total ? Math.round((checklist.completados / checklist.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-[22px] font-semibold tracking-tight">Puesta en marcha</h1>
          <HelpButton slug="checklist-de-configuracion-inicial" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Lo que falta para dejar la clínica lista.</p>
      </div>

      <SeccionAjustes
        titulo={`${pct} % completado`}
        accion={<EtiquetaAjuste tono="aviso">{checklist.completados} de {checklist.total}</EtiquetaAjuste>}
      >
        <div className="flex items-center gap-4 px-4 py-3">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <Button asChild size="sm">
            <Link href="/preparar-clinica">Continuar</Link>
          </Button>
        </div>
        {porRevisar.slice(0, PENDIENTES_VISIBLES).map((item) => {
          const Icono = categoriaDeRuta(categorias, item.href.split('?')[0])?.icon ?? CircleDashed
          return (
            <Link key={item.key} href={item.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
              <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-snug">{item.label}</span>
                {item.por_que && <span className="block truncate text-[13px] leading-snug text-muted-foreground">{item.por_que}</span>}
              </span>
              {item.requerido && <EtiquetaAjuste tono="aviso">Necesario</EtiquetaAjuste>}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          )
        })}
        {porRevisar.length > PENDIENTES_VISIBLES && (
          <Link href="/preparar-clinica" className="block px-4 py-2.5 text-sm font-medium text-primary hover:bg-muted/50">
            Ver {porRevisar.length - PENDIENTES_VISIBLES === 1 ? 'el otro paso' : `los otros ${porRevisar.length - PENDIENTES_VISIBLES} pasos`}
          </Link>
        )}
      </SeccionAjustes>
    </div>
  )
}

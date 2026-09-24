'use client'

import Link from 'next/link'
import { ChevronRight, CircleDashed } from 'lucide-react'
import { PuestaEnMarchaBanner } from '@/components/shared/PuestaEnMarchaBanner'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'
import { useChecklistConfiguracion } from '@/components/configuracion/ConfiguracionShell'
import { categoriaDeRuta, categoriasVisibles } from '@/components/configuracion/navegacion'

// Resumen de Configuración. En escritorio acompaña al menú lateral; en celular
// el menú se muestra encima (lo pone ConfiguracionShell).

function Bloque({ titulo, extra, children }: { titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
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

export default function ConfiguracionPage() {
  const { user } = useAuthStore()
  const categorias = categoriasVisibles(user)
  const checklist = useChecklistConfiguracion()

  const porRevisar = (checklist?.items ?? [])
    .filter((i) => !i.completado && !i.omitido)
    .sort((a, b) => Number(b.requerido) - Number(a.requerido))
  const listos = (checklist?.items ?? []).filter((i) => i.completado && i.resumen)
  const faltan = checklist ? checklist.total - checklist.completados : 0
  const pct = checklist?.total ? Math.round((checklist.completados / checklist.total) * 100) : 0
  // Con todos los pasos completos la tarjeta de puesta en marcha ya no aporta.
  const mostrarPuestaEnMarcha = !!checklist && checklist.completados < checklist.total

  return (
    <div className="max-w-4xl space-y-[22px]">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-[22px] font-semibold tracking-tight">Resumen de tu clínica</h1>
          <HelpButton slug="checklist-de-configuracion-inicial" />
        </div>
        <p className="mt-1 max-w-[62ch] text-sm text-muted-foreground">
          {checklist
            ? 'Lo que falta para dejar la clínica lista, y el estado de lo que ya está.'
            : 'Elige una categoría para ver y cambiar sus ajustes.'}
        </p>
      </div>

      <PuestaEnMarchaBanner dismissible={false} />

      {checklist && (mostrarPuestaEnMarcha || listos.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {mostrarPuestaEnMarcha && (
          <Bloque
            titulo="Puesta en marcha"
            extra={
              <span className={cn(
                'rounded-full px-2.5 py-0.5 text-[11.5px] font-medium',
                checklist.todo_listo ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}>
                {checklist.todo_listo ? 'Lista' : `${checklist.completados} de ${checklist.total}`}
              </span>
            }
          >
            <div className="flex items-center gap-4 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-[28px] font-semibold leading-tight tracking-tight tabular-nums">
                  {pct}<span className="text-sm font-normal text-muted-foreground">%</span>
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {checklist.todo_listo
                    ? 'Tu clínica está lista para agendar y atender.'
                    : `${faltan === 1 ? 'Falta 1 paso' : `Faltan ${faltan} pasos`} para agendar y atender sin tropiezos.`}
                </p>
              </div>
              <Button asChild size="sm" variant={checklist.todo_listo ? 'outline' : 'default'}>
                <Link href="/preparar-clinica">{checklist.todo_listo ? 'Ver pasos' : 'Continuar'}</Link>
              </Button>
            </div>
          </Bloque>
          )}

          {listos.length > 0 && (
            <Bloque titulo="Resumen">
              {listos.slice(0, 3).map((item) => (
                <div key={item.key} className="px-4 py-3.5">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-[12.5px] text-muted-foreground">{item.resumen}</p>
                </div>
              ))}
            </Bloque>
          )}
        </div>
      )}

      {porRevisar.length > 0 && (
        <Bloque titulo="Te falta revisar">
          {porRevisar.map((item) => {
            const Icono = categoriaDeRuta(categorias, item.href.split('?')[0])?.icon ?? CircleDashed
            return (
              <Link key={item.key} href={item.href} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{item.por_que}</span>
                </span>
                {item.requerido && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Pendiente
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </Bloque>
      )}
    </div>
  )
}

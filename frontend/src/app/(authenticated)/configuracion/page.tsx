'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, CircleDashed, Rocket } from 'lucide-react'
import { PuestaEnMarchaBanner } from '@/components/shared/PuestaEnMarchaBanner'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useChecklistConfiguracion } from '@/components/configuracion/ConfiguracionShell'
import { categoriaDeRuta, categoriasVisibles, rutaDe } from '@/components/configuracion/navegacion'
import { EtiquetaAjuste, FilaAjuste, SeccionAjustes } from '@/components/configuracion/ajustes'

// Resumen de Configuración. En escritorio acompaña al menú lateral; en celular
// el menú se muestra encima (lo pone ConfiguracionShell).

/** Fila que lleva a otra pantalla: ícono, título, una línea y flecha. */
function FilaEnlace({
  href, icono: Icono, titulo, descripcion, extra,
}: {
  href: string
  icono: React.ElementType
  titulo: string
  descripcion?: string
  extra?: React.ReactNode
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50 sm:gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icono className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground">{titulo}</span>
        {descripcion && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{descripcion}</span>}
      </span>
      {extra}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
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
  // Con todos los pasos completos la puesta en marcha ya no aporta: en su lugar
  // se listan las categorías, para que el resumen no quede casi vacío.
  const mostrarPuestaEnMarcha = !!checklist && checklist.completados < checklist.total

  return (
    <div className="space-y-7">
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

      {mostrarPuestaEnMarcha && (
        <SeccionAjustes
          titulo="Puesta en marcha"
          descripcion="Los pasos para empezar a agendar y atender."
          accion={<EtiquetaAjuste tono="aviso">{checklist.completados} de {checklist.total}</EtiquetaAjuste>}
        >
          <FilaAjuste
            icono={Rocket}
            titulo={`${pct} % completado`}
            descripcion={`${faltan === 1 ? 'Falta 1 paso' : `Faltan ${faltan} pasos`} para agendar y atender sin tropiezos.`}
            contenido={
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            }
          >
            <Button asChild size="sm">
              <Link href="/preparar-clinica">Continuar</Link>
            </Button>
          </FilaAjuste>
        </SeccionAjustes>
      )}

      {porRevisar.length > 0 && (
        <SeccionAjustes titulo="Te falta revisar" descripcion="Pasos sin completar, primero los necesarios.">
          {porRevisar.map((item) => (
            <FilaEnlace
              key={item.key}
              href={item.href}
              icono={categoriaDeRuta(categorias, item.href.split('?')[0])?.icon ?? CircleDashed}
              titulo={item.label}
              descripcion={item.por_que}
              extra={item.requerido && <EtiquetaAjuste tono="aviso">Pendiente</EtiquetaAjuste>}
            />
          ))}
        </SeccionAjustes>
      )}

      {listos.length > 0 && (
        <SeccionAjustes titulo="Lo que ya está listo" descripcion="Cómo está configurada tu clínica hoy.">
          {listos.slice(0, 3).map((item) => (
            <FilaEnlace key={item.key} href={item.href} icono={CheckCircle2} titulo={item.label} descripcion={item.resumen} />
          ))}
        </SeccionAjustes>
      )}

      {/* En celular el menú de categorías ya está arriba (ConfiguracionShell). */}
      {!mostrarPuestaEnMarcha && categorias.length > 0 && (
        <div className="hidden lg:block">
          <SeccionAjustes titulo="Ajustes" descripcion="Elige una categoría para ver y cambiar sus ajustes.">
            {/* Cada celda dibuja su línea derecha e inferior; el margen negativo
                esconde las del borde, que ya pone la tarjeta. */}
            <div className="-mb-px -mr-px grid sm:grid-cols-2 xl:grid-cols-3">
              {categorias.map((c) => (
                <div key={c.id} className="border-b border-r border-border/70">
                  <FilaEnlace href={rutaDe(c.ajustes[0].href)} icono={c.icon} titulo={c.label} descripcion={c.description} />
                </div>
              ))}
            </div>
          </SeccionAjustes>
        </div>
      )}
    </div>
  )
}

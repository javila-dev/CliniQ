'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Home, Search, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { clinicasApi, type SetupChecklist } from '@/lib/api/clinicas'
import { PageHeaderEnMarcoContext } from '@/components/shared/PageHeader'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { cn } from '@/lib/utils'
import {
  buscarAjustes, categoriaDeRuta, categoriasVisibles, pestanasDe, rutaDe,
  type CategoriaConfig,
} from './navegacion'

/** Rutas del checklist de preparación que viven fuera de /configuracion pero cuentan para una categoría. */
const RUTAS_EXTERNAS: Record<string, string> = { '/equipo/personal': '/configuracion/usuarios' }

/** Categorías con un paso requerido de "Preparar mi clínica" sin completar. */
function categoriasPendientes(categorias: CategoriaConfig[], checklist?: SetupChecklist) {
  const ids = new Set<string>()
  for (const item of checklist?.items ?? []) {
    if (!item.requerido || item.completado || item.omitido) continue
    const ruta = RUTAS_EXTERNAS[item.href] ?? item.href.split('?')[0]
    const cat = categoriaDeRuta(categorias, ruta)
    if (cat) ids.add(cat.id)
  }
  return ids
}

export function useChecklistConfiguracion() {
  const { user } = useAuthStore()
  const puedePreparar = hasPermission(user, PERM.CLINICAS_EDITAR)
  const { data } = useQuery({
    queryKey: ['setup-checklist'],
    queryFn: clinicasApi.setupChecklist,
    enabled: puedePreparar,
  })
  return puedePreparar ? data : undefined
}

export function ConfiguracionShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const categorias = categoriasVisibles(user)
  const categoria = categoriaDeRuta(categorias, pathname)
  const esResumen = pathname === '/configuracion'
  const checklist = useChecklistConfiguracion()
  const [ayuda, setAyuda] = useState<string | undefined>()
  const registrarAyuda = useCallback((slug: string | undefined) => setAyuda(slug), [])

  const pestanas = categoria ? pestanasDe(categoria) : []
  // Solo la página principal de cada pestaña va "enmarcada"; subpáginas como
  // /consentimientos/nuevo conservan su propio encabezado con Volver.
  const pestanaActual = pestanas.find((p) => rutaDe(p.href) === pathname)
  const apilada = categoria ? categoria.ajustes.filter((a) => rutaDe(a.href) === pathname).length > 1 : false
  const marco = useMemo(
    () => (pestanaActual ? { descripcion: apilada ? null : pestanaActual.description, registrarAyuda } : null),
    [pestanaActual, apilada, registrarAyuda],
  )

  // Rutas de /configuracion que no son ajustes (catálogo, campañas…) se ven como siempre.
  if (!categoria && !esResumen) return <>{children}</>

  const pendientes = categoriasPendientes(categorias, checklist)

  return (
    <div className="lg:grid lg:min-h-[calc(100vh-7rem)] lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:rounded-2xl lg:border lg:bg-white lg:shadow-sm">
      <aside className="hidden lg:block rounded-l-2xl border-r bg-muted/30 px-2.5 py-3.5">
        <div className="sticky top-4">
          <MenuLateral categorias={categorias} activa={categoria?.id} esResumen={esResumen} pendientes={pendientes} checklist={checklist} />
        </div>
      </aside>

      <div className="min-w-0 lg:px-9 lg:py-7">
        {esResumen && (
          <div className="mb-8 rounded-2xl border bg-white p-3 lg:hidden">
            <MenuLateral categorias={categorias} esResumen pendientes={pendientes} checklist={checklist} />
          </div>
        )}

        {categoria && (
          <div className="mb-6 space-y-4">
            <div>
              <Link
                href="/configuracion"
                className="mb-2 inline-flex items-center gap-0.5 text-sm text-primary lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                Configuración
              </Link>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[22px] font-semibold tracking-tight text-balance">{categoria.label}</h1>
                {marco && ayuda && <HelpButton slug={ayuda} />}
              </div>
            </div>
            {pestanas.length > 1 && (
              <nav className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none]" aria-label={categoria.label}>
                {pestanas.map((p) => {
                  const ruta = rutaDe(p.href)
                  const activa = pathname === ruta || pathname.startsWith(`${ruta}/`)
                  return (
                    <Link
                      key={ruta}
                      href={ruta}
                      aria-current={activa ? 'page' : undefined}
                      className={cn(
                        '-mb-px whitespace-nowrap border-b-2 px-2.5 pb-2.5 pt-2 text-sm transition-colors',
                        activa
                          ? 'border-primary font-medium text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {p.label}
                    </Link>
                  )
                })}
              </nav>
            )}
          </div>
        )}

        <PageHeaderEnMarcoContext.Provider value={marco}>
          {children}
        </PageHeaderEnMarcoContext.Provider>
      </div>
    </div>
  )
}

function MenuLateral({
  categorias, activa, esResumen, pendientes, checklist,
}: {
  categorias: CategoriaConfig[]
  activa?: string
  esResumen: boolean
  pendientes: Set<string>
  checklist?: SetupChecklist
}) {
  const pathname = usePathname()
  const [consulta, setConsulta] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Al navegar desde un resultado, el menú vuelve a mostrar las categorías.
  useEffect(() => { setConsulta('') }, [pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && inputRef.current?.offsetParent) {
        e.preventDefault()
        inputRef.current.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const buscando = consulta.trim().length > 0
  const resultados = buscando ? buscarAjustes(categorias, consulta) : []

  return (
    <nav className="space-y-3.5" aria-label="Configuración">
      <div className="relative mx-0.5">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setConsulta('') }}
          placeholder="Buscar ajuste…"
          aria-label="Buscar en la configuración"
          className="h-[34px] w-full rounded-lg border bg-white pl-8 pr-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {buscando ? (
          <button
            type="button"
            onClick={() => setConsulta('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-white px-1.5 font-mono text-[10.5px] text-muted-foreground lg:inline">
            Ctrl K
          </kbd>
        )}
      </div>

      {buscando ? (
        resultados.length > 0 ? (
          <ul className="space-y-0.5">
            {resultados.map(({ ajuste, categoria }) => (
              <li key={ajuste.href}>
                <Link href={ajuste.href} className="block rounded-lg px-2.5 py-[7px] hover:bg-muted">
                  <span className="block text-[13.5px] font-medium">{ajuste.label}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{categoria.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2.5 text-[12.5px] text-muted-foreground">Nada coincide con «{consulta.trim()}».</p>
        )
      ) : (
        <ul className="space-y-0.5">
          <li>
            <ItemMenu href="/configuracion" icon={Home} label="Resumen" activo={esResumen}>
              {checklist && !checklist.todo_listo && (
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {checklist.completados}/{checklist.total}
                </span>
              )}
            </ItemMenu>
          </li>
          <li aria-hidden className="mx-2 my-1 h-px bg-border" />
          {categorias.map((c) => (
            <li key={c.id}>
              <ItemMenu href={rutaDe(c.ajustes[0].href)} icon={c.icon} label={c.label} activo={activa === c.id}>
                {pendientes.has(c.id) && (
                  <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-500" title="Tiene algo pendiente" />
                )}
              </ItemMenu>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

function ItemMenu({
  href, icon: Icon, label, activo, children,
}: {
  href: string
  icon: React.ElementType
  label: string
  activo: boolean
  children?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors',
        activo
          ? 'bg-white font-medium text-foreground ring-1 ring-border'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', activo && 'text-primary')} />
      <span className="flex-1">{label}</span>
      {children}
    </Link>
  )
}

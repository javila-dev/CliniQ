'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  Building2, CreditCard, PersonStanding, LifeBuoy, Users, LogOut, Gauge, Receipt, Menu, X, Wrench,
} from 'lucide-react'

import { canAccess, defaultRoute, isSuperAdmin } from '@/lib/permissions'
import { useAuthStore } from '@/store/authStore'
import { useSuperadminClinicaStore } from '@/store/superadminClinicaStore'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// /console no cuelga de (authenticated) — no hereda AuthGuard ni RoleGuard, así
// que resuelve su propia autenticación + acceso acá. No autenticado → su login
// propio (no el de clínicas); autenticado sin acceso a consola → su app normal.
function ConsoleGuard({ children }: { children: React.ReactNode }) {
  const { hasCheckedAuth, isAuthenticated, isLoading, loadUser, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  const allowed = !!user && canAccess.console(user)
  const pathname = usePathname()
  // El equipo de ayuda (is_staff sin ser superadmin) solo gestiona el Centro de
  // ayuda: el resto de la consola lo exige el backend para superadmin (M7-13).
  const fueraDeSuAlcance = allowed && !isSuperAdmin(user) && !pathname.startsWith(RUTA_AYUDA)

  useEffect(() => {
    if (fueraDeSuAlcance) router.replace(RUTA_AYUDA)
  }, [fueraDeSuAlcance, router])

  useEffect(() => {
    if (!hasCheckedAuth || isLoading) return
    if (!isAuthenticated) {
      router.replace('/console/login')
    } else if (user && !allowed) {
      router.replace(defaultRoute(user))
    }
  }, [hasCheckedAuth, isLoading, isAuthenticated, user, allowed, router])

  if (!hasCheckedAuth || isLoading || !isAuthenticated || !allowed || fueraDeSuAlcance) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-64 space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}

const RUTA_AYUDA = '/console/ayuda'

// Menú lateral por grupos: crece con más secciones sin apretarse y deja el
// ancho de la pantalla a las tablas (Pagos, Pruebas, Clínicas).
const GRUPOS = [
  {
    titulo: 'Clientes',
    items: [
      { href: '/console/clinicas', label: 'Clínicas', icon: Building2, soloSuperadmin: true },
      { href: '/console/pruebas', label: 'Pruebas', icon: Gauge, soloSuperadmin: true },
      { href: '/console/pagos', label: 'Pagos', icon: Receipt, soloSuperadmin: true },
      { href: '/console/soporte', label: 'Soporte', icon: Wrench, soloSuperadmin: true },
    ],
  },
  {
    titulo: 'Producto',
    items: [
      { href: '/console/planes', label: 'Planes', icon: CreditCard, soloSuperadmin: true },
      { href: '/console/diagramas', label: 'Diagramas y zonas', icon: PersonStanding, soloSuperadmin: true },
      { href: RUTA_AYUDA, label: 'Centro de ayuda', icon: LifeBuoy, soloSuperadmin: false },
    ],
  },
  {
    titulo: 'Equipo',
    items: [
      { href: '/console/usuarios', label: 'Usuarios', icon: Users, soloSuperadmin: true },
    ],
  },
]

function ConsoleSidebar({ onNavegar }: { onNavegar?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { clinicaActiva } = useSuperadminClinicaStore()
  const superadmin = isSuperAdmin(user)

  async function handleLogout() {
    await logout()
    router.replace('/console/login')
  }

  return (
    <div className="flex h-full flex-col bg-[#0b0d12]">
      <Link href={superadmin ? '/console/clinicas' : RUTA_AYUDA} onClick={onNavegar} className="flex items-center gap-2.5 px-5 pb-5 pt-6">
        <Image src="/brand/cliniq-logo-on-dark.svg" alt="CliniQ" width={96} height={30} className="h-auto w-[96px] object-contain" />
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
          Console
        </span>
      </Link>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {GRUPOS.map((grupo) => {
          const items = grupo.items.filter((item) => !item.soloSuperadmin || superadmin)
          if (!items.length) return null
          return (
            <div key={grupo.titulo}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{grupo.titulo}</p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavegar}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-800 px-5 py-4">
        {superadmin && clinicaActiva && (
          <p className="text-xs text-slate-500">
            Operando: <span className="text-slate-300">{clinicaActiva.nombre}</span>
          </p>
        )}
        <p className="truncate text-xs text-slate-400" title={user?.email}>{user?.email}</p>
        <button
          onClick={handleLogout}
          className="-mx-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>
    </div>
  )
}

export default function ConsoleProtectedLayout({ children }: { children: React.ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false)

  return (
    <ConsoleGuard>
      <div className="min-h-screen bg-slate-50">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800 lg:block">
          <ConsoleSidebar />
        </aside>

        {/* Móvil y tablet: barra con botón de menú y el mismo menú en un panel. */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-[#0b0d12] px-4 lg:hidden">
          <button
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/brand/cliniq-logo-on-dark.svg" alt="CliniQ" width={88} height={28} className="h-auto w-[88px] object-contain" />
        </header>
        {menuAbierto && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMenuAbierto(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">
              <button
                onClick={() => setMenuAbierto(false)}
                aria-label="Cerrar menú"
                className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
              <ConsoleSidebar onNavegar={() => setMenuAbierto(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 px-4 py-8 sm:px-6 lg:ml-60 lg:px-10">
          <div className="mx-auto max-w-screen-2xl">{children}</div>
        </main>
      </div>
    </ConsoleGuard>
  )
}

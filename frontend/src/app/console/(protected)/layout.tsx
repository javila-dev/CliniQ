'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ShieldCheck, Building2, CreditCard, PersonStanding, Layers, LifeBuoy, Users, LogOut,
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

  useEffect(() => {
    if (!hasCheckedAuth || isLoading) return
    if (!isAuthenticated) {
      router.replace('/console/login')
    } else if (user && !allowed) {
      router.replace(defaultRoute(user))
    }
  }, [hasCheckedAuth, isLoading, isAuthenticated, user, allowed, router])

  if (!hasCheckedAuth || isLoading || !isAuthenticated || !allowed) {
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

const NAV = [
  { href: '/console/clinicas',      label: 'Clínicas',      icon: Building2 },
  { href: '/console/planes',        label: 'Planes',         icon: CreditCard },
  { href: '/console/diagramas',     label: 'Diagramas',      icon: PersonStanding },
  { href: '/console/grupos-zonas',  label: 'Grupos zonas',   icon: Layers },
  { href: '/console/usuarios',      label: 'Usuarios',       icon: Users },
  { href: '/console/plataforma',    label: 'Plataforma',     icon: LifeBuoy },
]

function ConsoleTopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const { clinicaActiva } = useSuperadminClinicaStore()

  async function handleLogout() {
    await logout()
    router.replace('/console/login')
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0b0d12]">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/console/clinicas" className="flex shrink-0 items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 ring-1 ring-white/10">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-300" />
          </div>
          <span className="text-sm font-semibold text-slate-100">Console</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          {isSuperAdmin(user) && clinicaActiva && (
            <span className="hidden text-xs text-slate-500 sm:inline">
              Operando: <span className="text-slate-300">{clinicaActiva.nombre}</span>
            </span>
          )}
          <span className="hidden text-xs text-slate-500 md:inline">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

export default function ConsoleProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleGuard>
      <div className="min-h-screen bg-slate-50">
        <ConsoleTopBar />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      </div>
    </ConsoleGuard>
  )
}

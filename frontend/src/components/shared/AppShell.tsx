'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Receipt,
  Settings2,
  Stethoscope,
  ClipboardList,
  Wallet,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { NavigationProgress } from './NavigationProgress'
import { ImpersonationBanner } from './ImpersonationBanner'
import { ThemeApplier } from './ThemeApplier'
import { hasPermission, isProfesional, canAccess, PERM } from '@/lib/permissions'
import { resolveMediaUrl } from '@/lib/utils/media'
import type { AuthUser } from '@/types/auth'

type NavItem = { href: string; label: string; icon: React.ElementType }
type NavGroup = { section: string; items: NavItem[] }
type NavEntry = NavItem | NavGroup

// Definición de todos los items de nav con su clave de permiso requerida.
// items sin permission se muestran siempre (ej: perfil, no aplica aquí).
const NAV = {
  dashboard:      { href: '/dashboard',      label: 'Dashboard',       icon: LayoutDashboard, perm: PERM.REPORTES_VER       },
  atenciones:     { href: '/atenciones',     label: 'Mis atenciones',  icon: Stethoscope,     perm: PERM.HISTORIA_ESCRIBIR  },
  agenda:         { href: '/agenda',         label: 'Agenda',          icon: CalendarDays,    perm: PERM.AGENDA_VER         },
  pacientes:      { href: '/pacientes',      label: 'Pacientes',       icon: Users,           perm: PERM.PACIENTES_VER      },
  cotizaciones:   { href: '/cotizaciones',   label: 'Cotizaciones',    icon: ClipboardList,   perm: PERM.COTIZACIONES_VER   },
  cartera:        { href: '/cartera',        label: 'Cartera',         icon: Wallet,          perm: PERM.COBROS_VER         },
  consentimientos:{ href: '/consentimientos',label: 'Consentimientos', icon: FileText,        perm: PERM.CONSENTIMIENTOS_VER},
  cobros:         { href: '/ingresos',        label: 'Ingresos',        icon: Receipt,         perm: PERM.COBROS_VER         },
  configuracion:  { href: '/configuracion',  label: 'Configuración',   icon: Settings2,       perm: PERM.CLINICAS_EDITAR    },
}

function allow(user: AuthUser | null, item: typeof NAV[keyof typeof NAV]): boolean {
  if (item.href === '/atenciones') return isProfesional(user) || hasPermission(user, item.perm)
  if (item.href === '/configuracion') return canAccess.configuracion(user)
  return hasPermission(user, item.perm)
}

function buildNav(user: AuthUser | null): NavEntry[] {
  const n = NAV
  const vis = (item: typeof NAV[keyof typeof NAV]) => allow(user, item)

  // Items de sección "Atención"
  const atencionItems: NavItem[] = [n.agenda, n.pacientes, n.cotizaciones, n.cartera, n.cobros].filter(vis)

  const entries: NavEntry[] = []

  if (vis(n.dashboard))  entries.push(n.dashboard)
  if (vis(n.atenciones)) entries.push(n.atenciones)
  if (atencionItems.length) entries.push({ section: 'Atención', items: atencionItems })
  if (vis(n.configuracion)) entries.push(n.configuracion)

  return entries
}

function NavLink({ href, label, icon: Icon, onClose }: NavItem & { onClose?: () => void }) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150 group',
        active ? 'bg-white/[0.08] text-white' : 'text-white/60 hover:bg-white/[0.05] hover:text-white/90'
      )}
    >
      <div className={cn(
        'flex items-center justify-center h-7 w-7 rounded-md shrink-0 transition-all duration-150',
        active ? 'bg-rose-500/25 ring-1 ring-rose-400/20' : 'group-hover:bg-white/[0.05]'
      )}>
        <Icon className={cn(
          'h-3.5 w-3.5 transition-colors duration-150',
          active ? 'text-rose-300' : 'text-white/50 group-hover:text-white/80'
        )} />
      </div>
      <span className="flex-1">{label}</span>
    </Link>
  )
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, logout } = useAuthStore()
  const router = useRouter()

  const allEntries = buildNav(user)

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

  const rolLabel = user?.role_nombre ?? user?.rol ?? ''

  const handleLogout = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">

      {/* Glow top */}
      <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(334,72%,60%,0.16) 0%, transparent 65%)' }} />
      {/* Glow bottom */}
      <div aria-hidden className="pointer-events-none absolute bottom-24 -left-12 h-40 w-40 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(334,60%,55%,0.08) 0%, transparent 70%)' }} />

      {/* ── Logo ── */}
      <div className="flex items-center justify-between shrink-0 px-5 pt-5 pb-4">
        <Image src="/imagotipo cliniq.png" alt="CliniQ" width={120} height={40} className="object-contain brightness-110" />
        {onClose && (
          <button onClick={onClose} className="text-white/30 hover:text-white/70 lg:hidden transition-colors">
            <X className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* ── Clínica pill ── */}
      {user?.clinica_nombre && (
        <div className="px-4 pb-4 shrink-0">
          <div className="flex items-center gap-2 rounded-lg bg-white/[0.05] border border-white/[0.06] px-3 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-rose-400/70 shrink-0" />
            <p className="text-xs text-white/50 truncate font-medium">{user.clinica_nombre}</p>
          </div>
        </div>
      )}

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent shrink-0" />

      {/* ── Nav ── */}
      <nav className="sidebar-nav flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {allEntries.map((entry) => {
          if ('section' in entry) {
            return (
              <div key={entry.section}>
                <p className="px-2.5 pb-1.5 text-[10px] text-white/35 uppercase tracking-[0.12em] font-semibold">
                  {entry.section}
                </p>
                <div className="space-y-0.5">
                  {entry.items.map((item) => (
                    <NavLink key={item.href} {...item} onClose={onClose} />
                  ))}
                </div>
              </div>
            )
          }
          return <NavLink key={entry.href} {...entry} onClose={onClose} />
        })}
      </nav>

      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent shrink-0" />

      {/* ── Usuario ── */}
      <div className="shrink-0 p-3 space-y-0.5">
        <Link
          href="/perfil"
          onClick={onClose}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 hover:bg-white/[0.05] transition-colors group"
        >
          <Avatar className="h-8 w-8 shrink-0 ring-1 ring-white/[0.12]">
            {user?.foto_perfil && <AvatarImage src={resolveMediaUrl(user.foto_perfil) ?? ''} />}
            <AvatarFallback className="bg-rose-500/20 text-rose-200 text-xs font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/80 truncate leading-tight">{user?.nombre_completo}</p>
            <p className="text-[11px] text-white/45 truncate mt-0.5">{rolLabel}</p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-white/15 group-hover:text-white/40 shrink-0 transition-colors" />
        </Link>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/50 hover:text-red-300/80 hover:bg-red-500/[0.07] transition-colors group"
        >
          <div className="flex items-center justify-center h-7 w-7 rounded-md group-hover:bg-red-500/10 transition-colors shrink-0">
            <LogOut className="h-3.5 w-3.5" />
          </div>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

const SIDEBAR_BG = 'bg-[#1a1118]'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-50 overflow-x-hidden">
      <ThemeApplier />
      <aside className={cn('hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 z-40', SIDEBAR_BG)}>
        <Sidebar />
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className={cn('fixed inset-y-0 left-0 w-64 z-50 lg:hidden flex flex-col', SIDEBAR_BG)}>
            <Sidebar onClose={() => setMobileOpen(false)} />
          </aside>
        </>
      )}

      <div className="min-w-0 flex-1 lg:ml-60 flex flex-col min-h-screen overflow-x-hidden">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b px-4 h-14 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </button>
          <Image src="/logo cliniq.png" alt="CliniQ" width={90} height={32} className="object-contain" />
        </header>

        <NavigationProgress />
        <ImpersonationBanner />
        <main className="min-w-0 flex-1 flex flex-col overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}

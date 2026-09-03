'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { canAccess, hasPermission, PERM } from '@/lib/permissions'
import type { AuthUser } from '@/types/auth'
import { cn } from '@/lib/utils'

const TABS: { href: string; label: string; can: (u: AuthUser | null | undefined) => boolean }[] = [
  { href: '/resultados',         label: 'Resumen',  can: (u) => canAccess.resultadosPyL(u) },
  { href: '/ingresos',           label: 'Ingresos', can: (u) => hasPermission(u, PERM.COBROS_VER) },
  { href: '/resultados/egresos', label: 'Egresos',  can: (u) => hasPermission(u, PERM.CAJA_GASTOS_VER) },
  { href: '/resultados/caja',    label: 'Caja',     can: (u) => hasPermission(u, PERM.CAJA_CIERRE_VER) },
]

export function FinanzasTabs() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  const visibles = TABS.filter((t) => t.can(user))

  return (
    <div className="flex gap-1 border-b border-gray-200">
      {visibles.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

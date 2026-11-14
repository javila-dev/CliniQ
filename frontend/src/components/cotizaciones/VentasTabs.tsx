'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { canAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'

/** Ventas: el listado y, para quien ve reportes financieros, el resumen por asesor. */
export function VentasTabs() {
  const pathname = usePathname()
  const { user } = useAuthStore()
  // Mismo permiso que pide el backend (/reportes/comercial/asesores/).
  if (!canAccess.resultadosPyL(user)) return null
  const tabs = [
    { href: '/ventas', label: 'Listado' },
    { href: '/ventas/asesores', label: 'Por asesor' },
  ]
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-3.5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}

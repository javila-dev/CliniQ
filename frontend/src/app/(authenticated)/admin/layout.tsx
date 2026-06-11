'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { canAccess } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin/tenants', label: 'Clínicas' },
  { href: '/admin/planes',  label: 'Planes'   },
]

function AdminNav() {
  const pathname = usePathname()
  return (
    <div className="flex gap-1 border-b mb-6">
      {TABS.map(t => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            pathname.startsWith(t.href)
              ? 'border-rose-500 text-rose-600'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard check={canAccess.admin}>
      <AdminNav />
      {children}
    </RoleGuard>
  )
}

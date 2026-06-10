'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import type { AuthUser } from '@/types/auth'
import { defaultRoute } from '@/lib/permissions'

interface RoleGuardProps {
  check: (user: AuthUser | null | undefined) => boolean
  children: React.ReactNode
}

export function RoleGuard({ check, children }: RoleGuardProps) {
  const { user, isLoading } = useAuthStore()
  const router = useRouter()

  const allowed = check(user)

  useEffect(() => {
    if (!isLoading && user && !allowed) {
      router.replace(defaultRoute(user))
    }
  }, [isLoading, user, allowed, router])

  if (isLoading || !user) return null
  if (!allowed) return null

  return <>{children}</>
}

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { Skeleton } from '@/components/ui/skeleton'
import { isSuperAdmin } from '@/lib/permissions'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { hasCheckedAuth, isAuthenticated, isLoading, loadUser, logout, user } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  useEffect(() => {
    if (hasCheckedAuth && !isLoading && !isAuthenticated) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [hasCheckedAuth, isLoading, isAuthenticated, router])

  if (!hasCheckedAuth || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  if (!isSuperAdmin(user) && !user?.clinica_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h2 className="text-lg font-semibold">Cuenta sin clínica asignada</h2>
          <p className="text-sm text-muted-foreground">
            Tu cuenta no tiene una clínica asociada. Contacta al administrador para que te asigne una.
          </p>
          <button
            onClick={() => logout()}
            className="text-sm underline text-muted-foreground hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

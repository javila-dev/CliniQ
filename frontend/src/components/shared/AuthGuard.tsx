'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { escucharOtrasPestanas } from '@/lib/api/sesion'
import { Skeleton } from '@/components/ui/skeleton'
import { isSuperAdmin } from '@/lib/permissions'
import { toast } from '@/hooks/use-toast'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { hasCheckedAuth, isAuthenticated, isLoading, loadUser, logout, user, errorConexion, stopImpersonating } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  useEffect(() => {
    if (hasCheckedAuth && !isLoading && !isAuthenticated && !errorConexion) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [hasCheckedAuth, isLoading, isAuthenticated, errorConexion, router])

  // Equipo interno (is_staff, sin clínica) no opera dentro de una clínica —
  // su lugar es /console. No es un error de datos como el caso de abajo.
  useEffect(() => {
    if (hasCheckedAuth && isAuthenticated && user && !isSuperAdmin(user) && !user.clinica_id && user.is_staff) {
      router.replace('/console')
    }
  }, [hasCheckedAuth, isAuthenticated, user, router])


  // Escuchar el evento de sesión expirada del interceptor HTTP
  useEffect(() => {
    const onSessionExpired = () => {
      toast.error('Tu sesión venció', 'Vuelve a ingresar para continuar.')
      logout()
      // El useEffect anterior detectará isAuthenticated=false y redirigirá con ?next=
    }
    window.addEventListener('cliniq:session-expired', onSessionExpired)
    return () => window.removeEventListener('cliniq:session-expired', onSessionExpired)
  }, [logout])

  // La sesión como otro usuario venció (1 hora) o se cerró: el superadmin vuelve
  // a la suya, que sigue en su cookie.
  useEffect(() => {
    const onSuplantacionTerminada = () => {
      // Varias peticiones pueden fallar a la vez: se sale una sola vez.
      if (!useAuthStore.getState().isImpersonating) return
      useAuthStore.setState({ isImpersonating: false })
      toast.error('Terminó la sesión como otro usuario', 'Volviste a tu sesión de superadmin.')
      stopImpersonating().then(() => router.push('/equipo/personal'))
    }
    window.addEventListener('cliniq:suplantacion-terminada', onSuplantacionTerminada)
    return () => window.removeEventListener('cliniq:suplantacion-terminada', onSuplantacionTerminada)
  }, [stopImpersonating, router])

  // Otra pestaña de este navegador cerró o abrió sesión (ver lib/api/sesion.ts).
  useEffect(() => {
    return escucharOtrasPestanas((cambio) => {
      if (cambio === 'logout') {
        if (!useAuthStore.getState().isAuthenticated) return
        toast({ title: 'Sesión cerrada', description: 'Cerraste sesión en otra pestaña.' })
        useAuthStore.getState().cerrarLocal()
      } else if (cambio === 'login') {
        // Puede ser otra persona: se recarga para no mostrar datos de la anterior.
        window.location.reload()
      }
    })
  }, [])

  // Sesión cerrada porque el usuario inició sesión en otro dispositivo
  useEffect(() => {
    const onSessionClosedElsewhere = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      toast.error('Sesión cerrada', message || 'Iniciaste sesión desde otro dispositivo.')
      logout()
    }
    window.addEventListener('cliniq:session-closed-elsewhere', onSessionClosedElsewhere)
    return () => window.removeEventListener('cliniq:session-closed-elsewhere', onSessionClosedElsewhere)
  }, [logout])

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

  if (errorConexion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm px-4">
          <h2 className="text-lg font-semibold">Sin conexión con el servidor</h2>
          <p className="text-sm text-muted-foreground">
            No pudimos verificar tu sesión. Revisa tu internet; tu sesión sigue abierta.
          </p>
          <button
            onClick={() => loadUser()}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  // Redirigiendo a /console (ver el useEffect de arriba) — no mostrar el mensaje de error.
  if (user && !isSuperAdmin(user) && !user.clinica_id && user.is_staff) return null

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

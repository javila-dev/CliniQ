'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { defaultRoute } from '@/lib/permissions'

export function ImpersonationBanner() {
  const { isImpersonating, user, stopImpersonating } = useAuthStore()
  const router = useRouter()

  if (!isImpersonating || !user) return null

  const handleStop = async () => {
    await stopImpersonating()
    router.push('/equipo/personal')
  }

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Estás viendo la sesión de{' '}
          <span className="font-bold">{user.nombre_completo}</span>
          {user.clinica_nombre && (
            <span className="font-normal opacity-80"> — {user.clinica_nombre}</span>
          )}
        </span>
      </div>
      <button
        onClick={handleStop}
        className="flex items-center gap-1.5 rounded-md bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30 transition-colors shrink-0"
      >
        <X className="h-3.5 w-3.5" />
        Salir
      </button>
    </div>
  )
}

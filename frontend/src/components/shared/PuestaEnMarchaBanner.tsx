'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Rocket, ArrowRight, X } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { canAccess } from '@/lib/permissions'
import { Button } from '@/components/ui/button'

/** Banner que invita a cargar los pacientes en curso, visible solo mientras el
 *  superadmin tiene activo el "modo puesta en marcha" de la clínica.
 *  `dismissible` (default true): permite descartarlo por navegador — en el
 *  dashboard sí, en Configuración no (siempre visible). */
export function PuestaEnMarchaBanner({ dismissible = true }: { dismissible?: boolean }) {
  const { user } = useAuthStore()

  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: !!user,
  })

  const key = miClinica?.id ? `pem-banner-dismissed:${miClinica.id}` : null
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined' || !key) return false
    try { return window.localStorage.getItem(key) === '1' } catch { return false }
  })

  if (dismissible && dismissed) return null
  if (!canAccess.puestaEnMarcha(user)) return null
  if (!miClinica?.modo_puesta_en_marcha) return null

  const cerrar = () => {
    setDismissed(true)
    try { if (key) window.localStorage.setItem(key, '1') } catch { /* noop */ }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] p-5">
      <div className="relative z-10 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Trae tus pacientes que ya vienen en tratamiento</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Un asistente carga lo que ya pagaron, las sesiones hechas y el saldo pendiente.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href="/configuracion/puesta-en-marcha">
            Empezar<ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={cerrar}
          aria-label="Descartar"
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground/60 hover:bg-primary/10 hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="pointer-events-none absolute -right-10 -bottom-12 h-32 w-32 rounded-full bg-primary/[0.06]" />
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Rocket } from 'lucide-react'
import { clinicasApi } from '@/lib/api/clinicas'
import { useAuthStore } from '@/store/authStore'
import { canAccess } from '@/lib/permissions'
import { Button } from '@/components/ui/button'

/** Botón fijo (no descartable) que lleva al asistente de puesta en marcha.
 *  Visible para quien tenga el permiso migracion.gestionar (o superadmin)
 *  mientras la clínica tenga activo el toggle `modo_puesta_en_marcha`. */
export function PuestaEnMarchaButton() {
  const { user } = useAuthStore()

  const { data: miClinica } = useQuery({
    queryKey: ['mi-clinica', user?.clinica_id],
    queryFn: () => clinicasApi.miClinica(user?.clinica_id),
    enabled: !!user,
  })

  if (!canAccess.puestaEnMarcha(user)) return null
  if (!miClinica?.modo_puesta_en_marcha) return null

  return (
    <Button asChild variant="outline">
      <Link href="/puesta-en-marcha">
        <Rocket className="h-4 w-4 mr-1.5" />
        Traer pacientes
      </Link>
    </Button>
  )
}

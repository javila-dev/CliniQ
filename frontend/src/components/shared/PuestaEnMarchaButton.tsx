'use client'

import Link from 'next/link'
import { Rocket } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

/** Botón fijo (no descartable) que lleva al asistente de puesta en marcha.
 *  Visible para cualquier usuario mientras la clínica tenga activo el toggle
 *  `modo_puesta_en_marcha` — no depende de ningún permiso. El flag viaja en
 *  el propio perfil del usuario (login/me), así que no exige el permiso
 *  clinicas.ver que un rol personalizado podría no tener. */
export function PuestaEnMarchaButton() {
  const { user } = useAuthStore()

  if (!user?.modo_puesta_en_marcha) return null

  return (
    <Button asChild variant="outline">
      <Link href="/puesta-en-marcha">
        <Rocket className="h-4 w-4 mr-1.5" />
        Traer pacientes
      </Link>
    </Button>
  )
}

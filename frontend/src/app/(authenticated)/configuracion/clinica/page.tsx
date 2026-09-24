'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClinicaConfig } from './ClinicaConfig'

/** Antes todas las secciones vivían aquí como ?tab=…; esos enlaces siguen funcionando. */
const DESTINO_TAB_ANTIGUO: Record<string, string> = {
  agenda:    '/configuracion/agenda#agenda',
  pacientes: '/configuracion/agenda#pacientes',
  atencion:  '/configuracion/recepcion',
  biometria: '/configuracion/biometria',
}

export default function ClinicaDatosPage() {
  const router = useRouter()
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    const destino = tab ? DESTINO_TAB_ANTIGUO[tab] : undefined
    if (destino) router.replace(destino)
    else setListo(true)
  }, [router])

  if (!listo) return null
  return (
    <ClinicaConfig
      secciones={['general']}
      title="Datos de la clínica"
      description="Logo, nombre, NIT y teléfono."
      helpSlug="sedes-horarios-y-turnos"
    />
  )
}

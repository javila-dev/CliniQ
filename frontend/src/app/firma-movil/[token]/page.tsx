'use client'

import { use, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, RotateCcw, Smartphone, XCircle } from 'lucide-react'
import { firmaProfesionalApi } from '@/lib/api/firmaProfesional'
import { LienzoFirma, type LienzoFirmaHandle } from '@/components/firma/LienzoFirma'
import { Button } from '@/components/ui/button'

interface Props {
  params: Promise<{ token: string }>
}

/** Página pública (sin sesión) que abre el celular al escanear el QR del perfil. */
export default function FirmaMovilPage({ params }: Props) {
  const { token } = use(params)
  const lienzoRef = useRef<LienzoFirmaHandle>(null)
  const [vacio, setVacio] = useState(true)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['firma-movil', token],
    queryFn: () => firmaProfesionalApi.captura(token),
    retry: false,
  })

  const enviar = useMutation({
    mutationFn: (imagen: string) => firmaProfesionalApi.enviarCaptura(token, imagen),
  })

  const guardar = () => {
    const png = lienzoRef.current?.obtenerPng()
    if (png) enviar.mutate(png)
  }

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError || !data || enviar.isError) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <XCircle className="h-10 w-10 text-destructive" />
        <p className="font-semibold">Este enlace ya no sirve</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ya se usó o venció. Genera un nuevo código QR desde el computador.
        </p>
      </div>
    )
  }

  if (enviar.isSuccess) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-gray-50 px-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-600" />
        <p className="text-lg font-semibold">Firma guardada</p>
        <p className="text-sm text-muted-foreground max-w-xs">Ya puedes volver al computador. Esta página se puede cerrar.</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50 px-4 py-5 gap-4">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Firma del profesional</p>
        <h1 className="text-lg font-bold leading-tight">{data.nombre}</h1>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5" />
          Dibuja tu firma con el dedo. Si giras el celular tendrás más espacio.
        </p>
      </header>

      <LienzoFirma ref={lienzoRef} alto={260} onCambio={setVacio} />

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" onClick={() => lienzoRef.current?.limpiar()} disabled={enviar.isPending}>
          <RotateCcw className="h-4 w-4 mr-2" /> Limpiar
        </Button>
        <Button size="lg" onClick={guardar} disabled={vacio || enviar.isPending}>
          {enviar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Guardar firma
        </Button>
      </div>
    </div>
  )
}

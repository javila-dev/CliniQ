'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

// Segundos que esperamos a que llegue el aviso automático antes de ofrecer el
// botón para comprobar el estado directamente contra Documenso.
const SEGUNDOS_PARA_COMPROBAR = 25

export interface LinkFirmaInfo {
  enviado: boolean
  signing_url: string
  telefono: string
}

interface Props {
  linkInfo: LinkFirmaInfo
  /** Consulta el estado en Documenso. Devuelve true si el paciente ya firmó. */
  onComprobar: () => Promise<boolean>
  /** Vuelve a la elección del método de firma. */
  onElegirOtro: () => void
}

/** Pantalla de espera tras enviar el link de firma por WhatsApp: el padre detecta la firma
 *  (polling del estado) y este componente ofrece el respaldo manual contra Documenso. */
export function EsperaFirmaLink({ linkInfo, onComprobar, onElegirOtro }: Props) {
  const [copiado, setCopiado] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [puedeComprobar, setPuedeComprobar] = useState(false)

  useEffect(() => {
    setPuedeComprobar(false)
    const t = setTimeout(() => setPuedeComprobar(true), SEGUNDOS_PARA_COMPROBAR * 1000)
    return () => clearTimeout(t)
  }, [linkInfo])

  async function copiarLink() {
    if (!linkInfo.signing_url) return
    await navigator.clipboard.writeText(linkInfo.signing_url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function handleComprobar() {
    setComprobando(true)
    try {
      const firmado = await onComprobar()
      if (firmado) {
        toast.success('Firma confirmada', 'El paciente ya firmó el documento.')
      } else {
        toast({ title: 'Todavía sin firmar', description: 'El paciente aún no ha firmado. Espera un momento e inténtalo de nuevo.' })
      }
    } catch {
      toast.error('No se pudo comprobar', 'Vuelve a intentarlo en un momento.')
    } finally {
      setComprobando(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-6">
      <div className="relative">
        <Smartphone className="h-10 w-10 text-primary" />
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground absolute -bottom-1 -right-1" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {linkInfo.enviado
            ? `Le enviamos el documento por WhatsApp al ${linkInfo.telefono}`
            : 'Enlace de firma listo para compartir'}
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          {linkInfo.enviado
            ? 'Cuando el paciente lo firme desde su celular, esta pantalla lo detecta sola y podrás continuar.'
            : 'El paciente no tiene teléfono registrado. Copia el enlace y compártelo con él.'}
        </p>
      </div>

      {linkInfo.signing_url && (
        <div className="flex items-center gap-2 w-full max-w-sm">
          <div className="flex-1 min-w-0 rounded-md border bg-muted/40 px-2.5 py-1.5">
            <p className="text-[11px] text-muted-foreground truncate font-mono">{linkInfo.signing_url}</p>
          </div>
          <Button variant="outline" size="sm" onClick={copiarLink}>
            {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Esperando la firma del paciente…
      </div>

      <Button
        variant={puedeComprobar ? 'default' : 'outline'}
        size="sm"
        onClick={handleComprobar}
        disabled={!puedeComprobar || comprobando}
      >
        {comprobando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
        {puedeComprobar ? 'El paciente ya firmó — comprobar ahora' : 'Comprobar en unos segundos…'}
      </Button>

      <button
        type="button"
        onClick={onElegirOtro}
        className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        Elegir otra forma de firmar
      </button>
    </div>
  )
}

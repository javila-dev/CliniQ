'use client'

import { useState } from 'react'
import { Check, CheckCircle2, Copy, Loader2, MessageCircle, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'

interface LinkResult {
  enviado: boolean
  signing_url: string
  telefono: string
}

interface ElegirMetodoFirmaProps {
  /** Frase del documento, p. ej. "el consentimiento", "el registro de asistencia". */
  documentoLabel: string
  /** Firmar en pantalla (embed Documenso). */
  onFirmarAqui: () => void | Promise<void>
  /** Genera el envelope y envía el link por WhatsApp. Devuelve el resultado del backend. */
  enviarLink: () => Promise<LinkResult>
  /**
   * Si se pasa, tras enviar el link el componente NO muestra su pantalla interna
   * de "enlace generado": delega en el padre (que suele mostrar una pantalla de
   * espera con verificación de estado).
   */
  onEnviado?: (r: LinkResult) => void
}

export function ElegirMetodoFirma({ documentoLabel, onFirmarAqui, enviarLink, onEnviado }: ElegirMetodoFirmaProps) {
  const [preparando, setPreparando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [info, setInfo] = useState<LinkResult | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function handleFirmarAqui() {
    setPreparando(true)
    try {
      await onFirmarAqui()
    } catch (err: any) {
      toast.error('No se pudo abrir la firma', err?.response?.data?.error ?? 'Intenta de nuevo.')
      setPreparando(false)
    }
  }

  async function handleEnviar() {
    setEnviando(true)
    try {
      const r = await enviarLink()
      if (r.enviado) toast.success('Link enviado', `Se envió por WhatsApp a ${r.telefono}.`)
      if (onEnviado) {
        onEnviado(r)
      } else {
        setInfo(r)
      }
    } catch (err: any) {
      toast.error('No se pudo enviar el link', err?.response?.data?.error ?? 'Intenta de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    if (!info?.signing_url) return
    await navigator.clipboard.writeText(info.signing_url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  if (info) {
    return (
      <div className="flex flex-col items-center gap-4 pt-[10%] text-center px-6">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {info.enviado ? 'Link enviado por WhatsApp' : 'Enlace de firma generado'}
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {info.enviado
              ? `Se envió a ${info.telefono}. El paciente firma desde su teléfono y el estado se actualiza solo.`
              : 'El paciente no tiene teléfono registrado. Copia el enlace y compártelo.'}
          </p>
        </div>
        {info.signing_url && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <div className="flex-1 min-w-0 rounded-md border bg-muted/40 px-2.5 py-1.5">
              <p className="text-[11px] text-muted-foreground truncate font-mono">{info.signing_url}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copiar}>
              {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 pt-[10%] text-center px-6">
      <div className="space-y-1">
        <p className="text-sm font-medium">Firma del documento</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          ¿Cómo va a firmar {documentoLabel} el paciente?
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs pt-2">
        <Button onClick={handleFirmarAqui} disabled={preparando || enviando} className="w-full">
          {preparando
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Abriendo…</>
            : <><PenLine className="h-4 w-4 mr-2" />Firmar aquí ahora</>}
        </Button>
        <Button variant="outline" onClick={handleEnviar} disabled={preparando || enviando} className="w-full">
          {enviando
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando enlace…</>
            : <><MessageCircle className="h-4 w-4 mr-2" />Enviar link por WhatsApp</>}
        </Button>
      </div>
    </div>
  )
}

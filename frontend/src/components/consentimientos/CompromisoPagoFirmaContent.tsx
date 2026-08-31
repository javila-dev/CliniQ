'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CheckCircle2, Copy, FileSignature, Loader2, MessageCircle, PenLine, RefreshCw } from 'lucide-react'
import { EmbedSignDocument } from '@documenso/embed-react'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

// Segundos de espera antes de ofrecer el botón para comprobar el estado en Documenso.
const SEGUNDOS_PARA_COMPROBAR = 25

interface CompromisoPagoFirmaContentProps {
  consentimientoId: string
  initialSigningToken?: string | null
  onFirmado?: () => void
  onCancel?: () => void
}

type Modo = 'elegir' | 'firmar' | 'enviado'

export function CompromisoPagoFirmaContent({ consentimientoId, initialSigningToken, onFirmado, onCancel }: CompromisoPagoFirmaContentProps) {
  const queryClient = useQueryClient()
  const [modo, setModo] = useState<Modo>(initialSigningToken ? 'firmar' : 'elegir')
  const [signingToken, setSigningToken] = useState<string | null>(initialSigningToken ?? null)
  const [generando, setGenerando] = useState(false)
  const [firmado, setFirmado] = useState(false)
  const autoAbiertoRef = useRef(false)
  // Evita doble llamada a iniciarFirmaDocumenso en React StrictMode (dev).
  const generacionDisparadaRef = useRef(false)

  // Envío de link
  const [enviando, setEnviando] = useState(false)
  const [linkInfo, setLinkInfo] = useState<{ enviado: boolean; signing_url: string; telefono: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [puedeComprobar, setPuedeComprobar] = useState(false)

  // Mientras esperamos que el paciente firme en su celular, consultamos el
  // estado cada 4s hasta que llegue el aviso automático (webhook).
  const { data: estadoConsentimiento } = useQuery({
    queryKey: ['consentimiento', consentimientoId],
    queryFn: () => consentimientosApi.get(consentimientoId),
    enabled: modo === 'enviado' && !firmado,
    refetchInterval: modo === 'enviado' && !firmado ? 4000 : false,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (estadoConsentimiento?.estado === 'firmado' && !firmado) {
      setFirmado(true)
      queryClient.invalidateQueries({ queryKey: ['consentimientos'] })
      onFirmado?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoConsentimiento?.estado])

  useEffect(() => {
    if (modo !== 'enviado' || firmado) return
    setPuedeComprobar(false)
    const t = setTimeout(() => setPuedeComprobar(true), SEGUNDOS_PARA_COMPROBAR * 1000)
    return () => clearTimeout(t)
  }, [modo, firmado])

  async function handleComprobarEnDocumenso() {
    setComprobando(true)
    try {
      const c = await consentimientosApi.verificarFirmaDocumenso(consentimientoId)
      if (c.estado === 'firmado') {
        setFirmado(true)
        queryClient.invalidateQueries({ queryKey: ['consentimientos'] })
        onFirmado?.()
        toast.success('Firma confirmada', 'El paciente ya firmó el compromiso de pago.')
      } else {
        toast({ title: 'Todavía sin firmar', description: 'El paciente aún no ha firmado. Espera un momento e inténtalo de nuevo.' })
      }
    } catch {
      toast.error('No se pudo comprobar', 'Vuelve a intentarlo en un momento.')
    } finally {
      setComprobando(false)
    }
  }

  useEffect(() => {
    if (modo === 'firmar' && !signingToken && !firmado && !generacionDisparadaRef.current) {
      generacionDisparadaRef.current = true
      autoAbiertoRef.current = true
      handleGenerar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])

  async function handleGenerar() {
    setGenerando(true)
    try {
      const { signing_token } = await consentimientosApi.iniciarFirmaDocumenso(consentimientoId)
      setSigningToken(signing_token)
    } catch (err: any) {
      autoAbiertoRef.current = false
      const msg = err?.response?.data?.error ?? 'No se pudo generar el documento'
      toast.error('Error al generar firma', msg)
    } finally {
      setGenerando(false)
    }
  }

  async function handleEnviarLink() {
    setEnviando(true)
    try {
      const info = await consentimientosApi.enviarLinkDocumenso(consentimientoId)
      setLinkInfo(info)
      setModo('enviado')
      if (info.enviado) {
        toast.success('Link enviado', `Se envió por WhatsApp a ${info.telefono}.`)
      }
      queryClient.invalidateQueries({ queryKey: ['consentimientos'] })
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'No se pudo generar el enlace de firma'
      toast.error('Error al enviar el link', msg)
    } finally {
      setEnviando(false)
    }
  }

  async function copiarLink() {
    if (!linkInfo?.signing_url) return
    await navigator.clipboard.writeText(linkInfo.signing_url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function handleFirmado() {
    autoAbiertoRef.current = false
    setSigningToken(null)
    setFirmado(true)
    try {
      await consentimientosApi.confirmarFirmaDocumenso(consentimientoId)
    } catch {
      // no-op — el webhook de Documenso confirmará el estado igualmente
    }
    queryClient.invalidateQueries({ queryKey: ['consentimientos'] })
    toast.success('Compromiso de pago firmado', 'El paciente firmó el documento.')
    onFirmado?.()
  }

  function handleError(err: string) {
    setSigningToken(null)
    if (autoAbiertoRef.current) {
      autoAbiertoRef.current = false
      setFirmado(true)
      onFirmado?.()
    } else {
      toast.error('Error al firmar', err)
    }
  }

  return (
    <div className="flex flex-col h-[520px]">
      {!firmado && modo !== 'elegir' && (
        <div className="shrink-0 pb-2">
          <button
            type="button"
            onClick={() => (modo === 'enviado' ? onCancel?.() : setModo('elegir'))}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {firmado ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center h-full">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="text-sm font-medium">Compromiso de pago firmado</p>
            <p className="text-xs text-muted-foreground max-w-xs">El paciente firmó el documento correctamente.</p>
          </div>
        ) : modo === 'elegir' ? (
          <div className="flex flex-col items-center gap-4 pt-[8%] text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Compromiso de pago</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                ¿Cómo va a firmar el paciente el compromiso de pago?
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs pt-2">
              <Button onClick={() => setModo('firmar')} className="w-full">
                <PenLine className="h-4 w-4 mr-2" />
                Firmar aquí ahora
              </Button>
              <Button variant="outline" onClick={handleEnviarLink} disabled={enviando} className="w-full">
                {enviando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando enlace…</>
                ) : (
                  <><MessageCircle className="h-4 w-4 mr-2" />Enviar link por WhatsApp</>
                )}
              </Button>
            </div>
          </div>
        ) : modo === 'enviado' ? (
          <div className="flex flex-col items-center gap-4 pt-[8%] text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {linkInfo?.enviado
                  ? `Le enviamos el documento por WhatsApp al ${linkInfo.telefono}`
                  : 'Enlace de firma listo para compartir'}
              </p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {linkInfo?.enviado
                  ? 'Cuando el paciente lo firme desde su celular, esta pantalla lo detecta sola.'
                  : 'El paciente no tiene teléfono registrado. Copia el enlace y compártelo con él.'}
              </p>
            </div>
            {linkInfo?.signing_url && (
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
              onClick={handleComprobarEnDocumenso}
              disabled={!puedeComprobar || comprobando}
            >
              {comprobando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              {puedeComprobar ? 'El paciente ya firmó — comprobar ahora' : 'Comprobar en unos segundos…'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>Cerrar</Button>
          </div>
        ) : !signingToken ? (
          <div className="flex flex-col items-center gap-4 pt-[10%] text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Compromiso de pago</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                El paciente debe firmar el compromiso de pago para completar la aceptación.
              </p>
            </div>
            <Button onClick={handleGenerar} disabled={generando}>
              {generando ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generando documento…</>
              ) : (
                <><FileSignature className="h-4 w-4 mr-2" />Generar y firmar</>
              )}
            </Button>
          </div>
        ) : (
          <div className="h-full w-full">
            <EmbedSignDocument
              token={signingToken}
              host={process.env.NEXT_PUBLIC_DOCUMENSO_URL}
              onDocumentCompleted={handleFirmado}
              onDocumentError={handleError}
              className="w-full h-full border-0"
            />
          </div>
        )}
      </div>
    </div>
  )
}

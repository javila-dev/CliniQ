'use client'

import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, CheckCircle2, Copy, FileSignature, Loader2, MessageCircle, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { EmbedSignDocument } from '@documenso/embed-react'
import { agendaApi } from '@/lib/api/agenda'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { ElegirMetodoFirma } from '@/components/shared/ElegirMetodoFirma'
import type { Cita } from '@/types/agenda'

// Segundos que esperamos a que llegue el aviso automático antes de ofrecer el
// botón para comprobar el estado directamente contra Documenso.
const SEGUNDOS_PARA_COMPROBAR = 25

interface LinkInfo {
  enviado: boolean
  signing_url: string
  telefono: string
}

interface FirmaAsistenciaContentProps {
  citaId: string
  initialSigningToken?: string | null
  // Cuando el backend ya tiene estado 'enviada' (documento creado pero webhook pendiente),
  // auto-llama iniciarRegistroAsistencia al montar para recuperar el token sin requerir click.
  // Esto cubre el caso de re-apertura del wizard antes de que llegue el webhook.
  autoIniciar?: boolean
  onFirmada?: () => void
  esperaLenta?: boolean
  onVerificarAhora?: () => Promise<unknown>
  /** Estado actual de la firma en la cita (lo refresca el polling del wizard). */
  estadoActual?: string | null
  /** Avisa al padre de que el link se envió por WhatsApp (para arrancar el polling). */
  onLinkEnviado?: () => void
  /** Consulta el estado directamente en Documenso y reconcilia. Devuelve la cita. */
  onComprobarEnDocumenso?: () => Promise<Cita>
}

export function FirmaAsistenciaContent({
  citaId,
  initialSigningToken,
  autoIniciar,
  onFirmada,
  esperaLenta,
  onVerificarAhora,
  estadoActual,
  onLinkEnviado,
  onComprobarEnDocumenso,
}: FirmaAsistenciaContentProps) {
  const queryClient = useQueryClient()
  const [signingToken, setSigningToken] = useState<string | null>(initialSigningToken ?? null)
  const [generando, setGenerando] = useState(false)
  const [firmada, setFirmada] = useState(false)
  const [verificando, setVerificando] = useState(false)
  // Si ya hay token o el wizard se reabrió con estado 'enviada', saltamos la elección.
  const [metodoElegido, setMetodoElegido] = useState(Boolean(initialSigningToken) || Boolean(autoIniciar))
  // Indica que el embed fue abierto automáticamente (no por acción explícita del usuario).
  // Si el embed falla en ese caso, es probable que el documento ya esté firmado en Documenso
  // (webhook aún no llegó), así que transitamos a "esperando confirmación" en vez de mostrar
  // el botón "Generar y firmar" de nuevo.
  const autoAbiertoRef = useRef(false)

  // Camino "enviar link por WhatsApp": el paciente firma en su teléfono.
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null)
  const [rechazada, setRechazada] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [puedeComprobar, setPuedeComprobar] = useState(false)

  useEffect(() => {
    if (autoIniciar && !signingToken && !firmada) {
      autoAbiertoRef.current = true
      handleGenerar()
    }
  }, [])

  // Habilita el botón de "comprobar ahora" tras unos segundos de espera.
  useEffect(() => {
    if (!linkInfo || firmada || rechazada) return
    setPuedeComprobar(false)
    const t = setTimeout(() => setPuedeComprobar(true), SEGUNDOS_PARA_COMPROBAR * 1000)
    return () => clearTimeout(t)
  }, [linkInfo, firmada, rechazada])

  // El polling del wizard refresca `estadoActual`: reaccionamos a lo que ya llegó.
  useEffect(() => {
    if (estadoActual === 'firmada' && !firmada) {
      setFirmada(true)
      onFirmada?.()
    } else if (estadoActual === 'rechazada' && !rechazada) {
      setRechazada(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoActual])

  async function handleVerificarAhora() {
    setVerificando(true)
    try {
      await onVerificarAhora?.()
    } finally {
      setVerificando(false)
    }
  }

  async function handleGenerar() {
    setGenerando(true)
    try {
      const { signing_token } = await agendaApi.citas.iniciarRegistroAsistencia(citaId)
      setSigningToken(signing_token)
      queryClient.invalidateQueries({ queryKey: ['citas', citaId] })
    } catch (err: any) {
      autoAbiertoRef.current = false
      const msg = err?.response?.data?.detail ?? err?.response?.data?.error ?? 'No se pudo generar el documento'
      toast.error('Error al generar firma', msg)
    } finally {
      setGenerando(false)
    }
  }

  async function handleFirmado() {
    autoAbiertoRef.current = false
    setSigningToken(null)
    setFirmada(true)
    // Confirmar el estado en el backend de forma eager sin esperar el webhook de Documenso.
    // Si falla, el wizard padre aún puede recuperarse vía polling mientras esperaLenta esté activo.
    try {
      await agendaApi.citas.confirmarFirmaAsistencia(citaId)
    } catch {
      // no-op
    }
    queryClient.invalidateQueries({ queryKey: ['citas'] })
    toast.success('Asistencia registrada', 'El paciente firmó el registro de asistencia.')
    onFirmada?.()
  }

  function handleError(err: string) {
    setSigningToken(null)
    if (autoAbiertoRef.current) {
      // El embed auto-abierto falló: el documento probablemente ya fue firmado en Documenso
      // pero el webhook aún no llegó al backend. Transitamos a "esperando confirmación"
      // en vez de mostrar "Generar y firmar" (que crearía un loop si el doc está completo).
      autoAbiertoRef.current = false
      setFirmada(true)
      onFirmada?.()
    } else {
      toast.error('Error al firmar', err)
    }
  }

  function handleLinkEnviado(r: LinkInfo) {
    setLinkInfo(r)
    setRechazada(false)
    onLinkEnviado?.()
  }

  async function copiarLink() {
    if (!linkInfo?.signing_url) return
    await navigator.clipboard.writeText(linkInfo.signing_url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  async function handleComprobarEnDocumenso() {
    if (!onComprobarEnDocumenso) return
    setComprobando(true)
    try {
      const cita = await onComprobarEnDocumenso()
      if (cita?.firma_asistencia_estado === 'firmada') {
        setFirmada(true)
        onFirmada?.()
        toast.success('Firma confirmada', 'El paciente ya firmó el documento.')
      } else if (cita?.firma_asistencia_estado === 'rechazada') {
        setRechazada(true)
      } else {
        toast({ title: 'Todavía sin firmar', description: 'El paciente aún no ha firmado. Espera un momento e inténtalo de nuevo.' })
      }
    } catch {
      toast.error('No se pudo comprobar', 'Vuelve a intentarlo en un momento.')
    } finally {
      setComprobando(false)
    }
  }

  function reenviar() {
    setLinkInfo(null)
    setRechazada(false)
    setSigningToken(null)
    setMetodoElegido(false)
  }

  return (
    <div className="h-full">
      {firmada ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Firma registrada</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              El paciente ya firmó. Confirmando con el servidor para continuar...
            </p>
          </div>
          {esperaLenta ? (
            <>
              <p className="text-xs text-amber-600 max-w-xs">
                La confirmación está tardando más de lo normal.
              </p>
              <Button variant="outline" size="sm" onClick={handleVerificarAhora} disabled={verificando}>
                {verificando ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Verificar de nuevo
              </Button>
            </>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      ) : rechazada ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <XCircle className="h-10 w-10 text-destructive" />
          <div className="space-y-1">
            <p className="text-sm font-medium">El paciente no firmó el documento</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Rechazó la firma desde su teléfono. Puedes volver a enviarlo o firmarlo aquí en pantalla.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reenviar}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Volver a enviar
          </Button>
        </div>
      ) : linkInfo ? (
        <div className="flex flex-col items-center gap-4 pt-[8%] text-center px-6">
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

          <button
            type="button"
            onClick={reenviar}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Elegir otra forma de firmar
          </button>
        </div>
      ) : !signingToken && !metodoElegido ? (
        <ElegirMetodoFirma
          documentoLabel="el registro de asistencia"
          onFirmarAqui={() => { setMetodoElegido(true); handleGenerar() }}
          enviarLink={() => agendaApi.citas.enviarLinkFirmaAsistencia(citaId)}
          onEnviado={handleLinkEnviado}
        />
      ) : !signingToken ? (
        <div className="flex flex-col items-center gap-4 pt-[15%] text-center">
          <FileSignature className="h-10 w-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Firma de asistencia</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              El paciente debe firmar el registro de asistencia para finalizar el ingreso.
            </p>
          </div>
          <Button onClick={handleGenerar} disabled={generando}>
            {generando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generando documento...
              </>
            ) : (
              <>
                <FileSignature className="h-4 w-4 mr-2" />
                Generar y firmar
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={() => setMetodoElegido(false)}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 flex items-center gap-1"
          >
            <MessageCircle className="h-3 w-3" />
            Mejor enviar link por WhatsApp
          </button>
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
  )
}

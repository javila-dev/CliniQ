'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldCheck, Maximize2, Minimize2, X, AlertCircle, FileSignature } from 'lucide-react'
import { EmbedSignDocument } from '@documenso/embed-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Button } from '@/components/ui/button'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'

interface ConsentimientoFirmaSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pacienteId: string
  pacienteNombre: string
  token: string
  templateNombre: string
  consentimientoId?: string | null
  vigenciaMeses?: number
  onCompleted?: () => void
}

const DOCUMENSO_URL = process.env.NEXT_PUBLIC_DOCUMENSO_URL ?? 'http://localhost:3000'

export function ConsentimientoFirmaSheet({
  open,
  onOpenChange,
  pacienteId,
  pacienteNombre,
  token,
  templateNombre,
  consentimientoId,
  vigenciaMeses,
  onCompleted,
}: ConsentimientoFirmaSheetProps) {
  const queryClient = useQueryClient()
  const [signed, setSigned] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [embedReady, setEmbedReady] = useState(false)
  const [embedError, setEmbedError] = useState<string | null>(null)
  const [signingToken, setSigningToken] = useState<string | null>(null)
  const embedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    mutate: crearConsentimiento,
    data: consentimientoCreado,
    isPending: creando,
    reset: resetCrear,
  } = useMutation({
    mutationFn: () =>
      historiaClinicaApi.consentimientosInformados.create({
        paciente: pacienteId,
        documenso_template_token: token,
        documenso_template_nombre: templateNombre,
        ...(vigenciaMeses !== undefined && { vigencia_meses: vigenciaMeses }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consentimientos-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['consentimientos-lista', pacienteId] })
    },
  })

  const { mutate: iniciarFirma, isPending: iniciando } = useMutation({
    mutationFn: (id: string) => historiaClinicaApi.consentimientosInformados.iniciarFirma(id),
    onSuccess: ({ signing_token }) => {
      setSigningToken(signing_token)
    },
    onError: () => {
      setEmbedError('No se pudo iniciar la firma en Documenso. Intenta de nuevo.')
    },
  })

  const { mutate: completarFirma, isPending: completando } = useMutation({
    mutationFn: ({ id, docId }: { id: string; docId: string }) =>
      historiaClinicaApi.consentimientosInformados.completarFirma(id, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consentimientos-resumen', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['consentimientos-lista', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['citas'] })
      setSigned(true)
      onCompleted?.()
    },
  })

  const targetConsentimientoId = consentimientoId ?? consentimientoCreado?.id

  // Auto-call iniciarFirma once we have a consentimientoId and no token yet
  useEffect(() => {
    if (targetConsentimientoId && !signingToken && !iniciando && !embedError && !signed) {
      iniciarFirma(targetConsentimientoId)
    }
  }, [targetConsentimientoId, signingToken, iniciando, embedError, signed, iniciarFirma])

  // 15-second timeout after signingToken is obtained
  useEffect(() => {
    if (signingToken && !embedReady && !embedError && !signed) {
      embedTimeoutRef.current = setTimeout(() => {
        setEmbedError(
          'El documento no pudo cargarse. Verifica que el consentimiento esté activo en Documenso.'
        )
      }, 15000)
    }
    return () => {
      if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current)
    }
  }, [signingToken, embedReady, embedError, signed])

  function handleDocumentCompleted(data: { token: string; documentId: number; recipientId: number }) {
    if (!targetConsentimientoId) return
    completarFirma({ id: targetConsentimientoId, docId: String(data.documentId) })
  }

  function handleOpen(isOpen: boolean) {
    if (!isOpen) {
      setSigned(false)
      setMaximized(false)
      setEmbedReady(false)
      setEmbedError(null)
      setSigningToken(null)
      if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current)
      resetCrear()
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent
        hideClose
        trapFocus={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={`flex flex-col gap-0 p-0 transition-all duration-200 ${
          maximized
            ? '!fixed !inset-3 !left-3 !top-3 !translate-x-0 !translate-y-0 max-w-none !w-[calc(100vw-1.5rem)] !h-[calc(100vh-1.5rem)] rounded-xl'
            : 'max-w-4xl w-full h-[85vh]'
        }`}
      >
        <VisuallyHidden.Root>
          <DialogTitle>Consentimiento informado — {templateNombre}</DialogTitle>
        </VisuallyHidden.Root>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Consentimiento informado</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {templateNombre} · {pacienteNombre}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setMaximized((v) => !v)}
              title={maximized ? 'Restaurar tamaño' : 'Maximizar'}
            >
              {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleOpen(false)}
              title="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden min-h-0">
          {signed ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <ShieldCheck className="h-12 w-12 text-green-500" />
              <div>
                <p className="font-semibold text-lg">Consentimiento firmado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  El documento ha sido firmado correctamente. El PDF llegará en breve.
                </p>
              </div>
              <Button onClick={() => handleOpen(false)}>Cerrar</Button>
            </div>

          ) : embedError ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-semibold">No se pudo cargar el formulario de firma</p>
                <p className="text-sm text-muted-foreground mt-1">{embedError}</p>
              </div>
              <Button variant="outline" onClick={() => {
                setEmbedError(null)
                setEmbedReady(false)
                setSigningToken(null)
              }}>
                Reintentar
              </Button>
            </div>

          ) : !targetConsentimientoId ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 px-8 py-10 text-center">
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-amber-50 border border-amber-200">
                <FileSignature className="h-6 w-6 text-amber-600" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <p className="font-semibold text-base">Firma pendiente</p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{pacienteNombre}</span> debe firmar el siguiente consentimiento antes de continuar:
                </p>
              </div>
              <div className="w-full max-w-xs rounded-lg border bg-muted/40 px-4 py-3 text-left">
                <p className="text-xs text-muted-foreground mb-0.5">Documento requerido</p>
                <p className="text-sm font-medium leading-snug">{templateNombre}</p>
              </div>
              <Button onClick={() => crearConsentimiento()} disabled={creando} className="gap-2">
                {creando
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileSignature className="h-4 w-4" />
                }
                {creando ? 'Preparando documento…' : 'Abrir formulario de firma'}
              </Button>
            </div>

          ) : (
            <div className="relative h-full">
              {(!signingToken || !embedReady) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {completando && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {signingToken && (
                <EmbedSignDocument
                  host={DOCUMENSO_URL}
                  token={signingToken}
                  name={pacienteNombre}
                  lockName
                  onDocumentReady={() => {
                    setEmbedReady(true)
                    if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current)
                  }}
                  onDocumentError={(err) => {
                    setEmbedError(err ?? 'Error al cargar el documento de firma.')
                    if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current)
                  }}
                  onDocumentCompleted={handleDocumentCompleted}
                  className="w-full h-full border-0"
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

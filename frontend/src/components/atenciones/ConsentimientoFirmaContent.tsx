'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, ShieldCheck, AlertCircle, FileSignature } from 'lucide-react'
import { EmbedSignDocument } from '@documenso/embed-react'
import { Button } from '@/components/ui/button'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { ElegirMetodoFirma } from '@/components/shared/ElegirMetodoFirma'

interface ConsentimientoFirmaContentProps {
  pacienteId: string
  pacienteNombre: string
  token: string
  templateNombre: string
  consentimientoId?: string | null
  vigenciaMeses?: number
  onCompleted?: () => void
  onInicioFirma?: () => void
  onFinFirma?: () => void
}

const DOCUMENSO_URL = process.env.NEXT_PUBLIC_DOCUMENSO_URL ?? 'http://localhost:3000'

export function ConsentimientoFirmaContent({
  pacienteId,
  pacienteNombre,
  token,
  templateNombre,
  consentimientoId,
  vigenciaMeses,
  onCompleted,
  onInicioFirma,
  onFinFirma,
}: ConsentimientoFirmaContentProps) {
  const queryClient = useQueryClient()
  const [signed, setSigned] = useState(false)
  const [embedReady, setEmbedReady] = useState(false)
  const [embedError, setEmbedError] = useState<string | null>(null)
  const [signingToken, setSigningToken] = useState<string | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [pendingDocId, setPendingDocId] = useState<string | null>(null)
  const [metodoElegido, setMetodoElegido] = useState(false)
  const embedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    mutate: crearConsentimiento,
    mutateAsync: crearConsentimientoAsync,
    data: consentimientoCreado,
    isPending: creando,
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
      setSyncError(false)
      setPendingDocId(null)
      setSigned(true)
      onCompleted?.()
    },
    onError: () => {
      // La firma ya quedó en Documenso; solo falló la sincronización con nuestro backend
      setSyncError(true)
    },
  })

  const targetConsentimientoId = consentimientoId ?? consentimientoCreado?.id

  // Auto-call iniciarFirma once the user eligió "firmar aquí" y hay consentimientoId
  useEffect(() => {
    if (metodoElegido && targetConsentimientoId && !signingToken && !iniciando && !embedError && !signed) {
      iniciarFirma(targetConsentimientoId)
    }
  }, [metodoElegido, targetConsentimientoId, signingToken, iniciando, embedError, signed, iniciarFirma])

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
    const docId = String(data.documentId)
    setPendingDocId(docId)
    completarFirma({ id: targetConsentimientoId, docId })
  }

  return (
    <div className="h-full">
      {signed ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <ShieldCheck className="h-12 w-12 text-green-500" />
          <div>
            <p className="font-semibold text-lg">Consentimiento firmado</p>
            <p className="text-sm text-muted-foreground mt-1">
              El documento ha sido firmado correctamente. El PDF llegará en breve.
            </p>
          </div>
        </div>

      ) : syncError ? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <div>
            <p className="font-semibold text-base">Firma registrada — sincronización pendiente</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              La firma quedó guardada en Documenso, pero no se pudo sincronizar con el sistema.
              Intenta de nuevo; si el problema persiste, recarga la página e inicia sesión.
            </p>
          </div>
          <Button
            onClick={() => {
              if (targetConsentimientoId && pendingDocId) {
                setSyncError(false)
                completarFirma({ id: targetConsentimientoId, docId: pendingDocId })
              }
            }}
            disabled={completando || !targetConsentimientoId || !pendingDocId}
          >
            {completando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reintentar sincronización
          </Button>
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

      ) : !metodoElegido ? (
        <ElegirMetodoFirma
          documentoLabel="el consentimiento"
          onFirmarAqui={async () => {
            if (!targetConsentimientoId) await crearConsentimientoAsync()
            setMetodoElegido(true)
          }}
          enviarLink={async () => {
            let id = targetConsentimientoId
            if (!id) id = (await crearConsentimientoAsync()).id
            return historiaClinicaApi.consentimientosInformados.enviarLinkFirma(id)
          }}
        />
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
                onInicioFirma?.()
              }}
              onDocumentError={(err) => {
                setEmbedError(err ?? 'Error al cargar el documento de firma.')
                if (embedTimeoutRef.current) clearTimeout(embedTimeoutRef.current)
                onFinFirma?.()
              }}
              onDocumentCompleted={(data) => {
                onFinFirma?.()
                handleDocumentCompleted(data)
              }}
              className="w-full h-full border-0"
            />
          )}
        </div>
      )}
    </div>
  )
}

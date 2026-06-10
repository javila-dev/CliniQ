'use client'

import { use, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  CheckCircle2, XCircle, Stethoscope, FileText,
  ExternalLink, RotateCcw, PenLine,
} from 'lucide-react'
import SignatureCanvas from 'react-signature-canvas'
import { consentimientosApi } from '@/lib/api/consentimientos'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ token: string }>
}

export default function FirmarConsentimientoPage({ params }: Props) {
  const { token } = use(params)
  const sigRef = useRef<SignatureCanvas>(null)
  const [firmaVacia, setFirmaVacia] = useState(true)
  const [firmado, setFirmado] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: consentimiento, isLoading, isError } = useQuery({
    queryKey: ['consentimiento-publico', token],
    queryFn: () => consentimientosApi.getPublicoPorToken(token),
    retry: false,
  })

  const { mutate: firmar, isPending: firmando } = useMutation({
    mutationFn: () => {
      const firmaBase64 = sigRef.current!.toDataURL('image/png')
      return consentimientosApi.firmarPorToken(token, firmaBase64)
    },
    onSuccess: (data) => {
      setFirmado(true)
      setPdfUrl(data.pdf_url)
    },
    onError: () => {
      setErrorMsg('No se pudo registrar la firma. Intenta de nuevo o contacta a la clínica.')
    },
  })

  const limpiarFirma = () => {
    sigRef.current?.clear()
    setFirmaVacia(true)
    setErrorMsg(null)
  }

  const handleFirmar = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setErrorMsg('Dibuja tu firma antes de confirmar.')
      return
    }
    firmar()
  }

  const yaFirmado = consentimiento?.estado === 'firmado' || firmado
  const revocado = consentimiento?.estado === 'revocado'

  // ── Pantalla: ya firmado ───────────────────────────────────
  if (yaFirmado) {
    return (
      <Wrapper>
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 px-6">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-green-700">Consentimiento firmado</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hola <strong>{consentimiento?.paciente_nombre}</strong>, tu firma quedó registrada.
            </p>
          </div>
          {(pdfUrl || consentimiento?.pdf_url) && (
            <a
              href={pdfUrl ?? consentimiento?.pdf_url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Descargar PDF del consentimiento
            </a>
          )}
        </div>
      </Wrapper>
    )
  }

  // ── Pantalla: revocado o inválido ──────────────────────────
  if (isError || revocado) {
    return (
      <Wrapper>
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 px-6">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-red-100">
            <XCircle className="h-8 w-8 text-red-500" />
          </div>
          <p className="text-lg font-semibold text-foreground">
            {revocado ? 'Consentimiento revocado' : 'Enlace inválido o expirado'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {revocado
              ? 'Este consentimiento fue revocado y ya no es válido.'
              : 'Este enlace no es válido o ha expirado. Contacta a la clínica para que generen uno nuevo.'}
          </p>
        </div>
      </Wrapper>
    )
  }

  // ── Pantalla: cargando ─────────────────────────────────────
  if (isLoading) {
    return (
      <Wrapper>
        <div className="space-y-3 p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Wrapper>
    )
  }

  // ── Pantalla: firmar ───────────────────────────────────────
  return (
    <Wrapper>
      <div className="space-y-5 p-5">

        {/* Info del paciente y documento */}
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 shrink-0 mt-0.5">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{consentimiento?.plantilla_nombre}</p>
            <p className="text-sm text-muted-foreground">Paciente: {consentimiento?.paciente_nombre}</p>
          </div>
        </div>

        {/* Contenido del consentimiento */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Contenido del documento
          </p>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 max-h-64 overflow-y-auto text-sm text-foreground leading-relaxed whitespace-pre-line">
            {consentimiento?.contenido_snapshot}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Hash del documento: <span className="font-mono">{consentimiento?.hash_contenido?.slice(0, 16)}…</span>
          </p>
        </div>

        {/* Área de firma */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <PenLine className="h-3.5 w-3.5" />
              Firma aquí
            </p>
            <button
              onClick={limpiarFirma}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Limpiar
            </button>
          </div>

          <div className={cn(
            'rounded-xl border-2 transition-colors overflow-hidden bg-white',
            firmaVacia ? 'border-dashed border-gray-300' : 'border-primary/40'
          )}>
            <SignatureCanvas
              ref={sigRef}
              canvasProps={{
                className: 'w-full',
                style: { height: 160, touchAction: 'none' },
              }}
              backgroundColor="white"
              penColor="#1a1a2e"
              onBegin={() => { setFirmaVacia(false); setErrorMsg(null) }}
            />
          </div>

          {firmaVacia && (
            <p className="text-xs text-muted-foreground text-center mt-1.5">
              Usa tu dedo o el mouse para dibujar tu firma
            </p>
          )}
        </div>

        {/* Declaración */}
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
          Al firmar confirmas que leíste, comprendiste y aceptas el consentimiento informado
          descrito en este documento, y autorizas el procedimiento indicado.
        </div>

        {errorMsg && (
          <p className="text-sm text-red-500 text-center">{errorMsg}</p>
        )}

        {/* Botón */}
        <Button
          className="w-full h-12 text-base font-semibold"
          onClick={handleFirmar}
          disabled={firmando || firmaVacia}
        >
          {firmando ? 'Registrando firma…' : 'Firmar y aceptar'}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Este documento queda firmado con tu firma, la fecha, hora y tu dirección IP como respaldo legal
          bajo la Ley 527 de 1999 y Decreto 2364 de 2012.
        </p>
      </div>
    </Wrapper>
  )
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-rose-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10">
            <Stethoscope className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground">CliniQ</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}

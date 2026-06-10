'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle, Mail, FileDown, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { cn } from '@/lib/utils'
import type { CanalEnvio } from '@/types/cotizaciones'

// ── Channel card ──────────────────────────────────────────────────────────────

interface ChannelCardProps {
  selected: boolean
  onClick: () => void
  icon: React.ElementType
  label: string
  description: string
  color: string
}

function ChannelCard({ selected, onClick, icon: Icon, label, description, color }: ChannelCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 w-full rounded-xl border-2 p-4 text-left transition-all',
        selected
          ? `border-current ${color} ring-2 ring-current/20`
          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/60',
      )}
    >
      <div className={cn('flex items-center justify-center h-9 w-9 rounded-lg shrink-0', selected ? color : 'bg-gray-100')}>
        <Icon className={cn('h-4.5 w-4.5', selected ? 'opacity-100' : 'text-gray-400')} />
      </div>
      <div>
        <p className={cn('text-sm font-semibold', selected ? '' : 'text-gray-700')}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ── Feedback inline ───────────────────────────────────────────────────────────

type FeedbackState = { type: 'success' | 'error'; message: string } | null

function Feedback({ state }: { state: FeedbackState }) {
  if (!state) return null
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm',
      state.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600',
    )}>
      {state.type === 'success'
        ? <CheckCircle2 className="h-4 w-4 shrink-0" />
        : <AlertCircle className="h-4 w-4 shrink-0" />}
      {state.message}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
  cotizacionId: string
  pacienteTelefono?: string
  pacienteEmail?: string
}

const CHANNELS: {
  canal: CanalEnvio
  icon: React.ElementType
  label: string
  description: string
  color: string
}[] = [
  {
    canal: 'whatsapp',
    icon: MessageCircle,
    label: 'WhatsApp',
    description: 'Envía la cotización con PDF adjunto al número del paciente vía n8n',
    color: 'text-green-600 bg-green-50',
  },
  {
    canal: 'email',
    icon: Mail,
    label: 'Correo electrónico',
    description: 'Envía un email con la cotización adjunta en PDF',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    canal: 'pdf',
    icon: FileDown,
    label: 'Descargar PDF',
    description: 'Descarga el PDF para compartirlo manualmente',
    color: 'text-gray-600 bg-gray-100',
  },
]

export function EnviarCotizacionModal({ open, onClose, cotizacionId, pacienteTelefono, pacienteEmail }: Props) {
  const qc = useQueryClient()
  const [canal, setCanal] = useState<CanalEnvio>('whatsapp')
  const [emailDest, setEmailDest] = useState(pacienteEmail ?? '')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  function resetAndClose() {
    setCanal('whatsapp')
    setEmailDest(pacienteEmail ?? '')
    setFeedback(null)
    setLoading(false)
    onClose()
  }

  async function handleEnviar() {
    setFeedback(null)
    setLoading(true)

    try {
      if (canal === 'whatsapp') {
        await cotizacionesApi.enviarWhatsapp(cotizacionId)
        setFeedback({ type: 'success', message: 'Cotización enviada por WhatsApp correctamente.' })

      } else if (canal === 'email') {
        if (!emailDest.trim()) {
          setFeedback({ type: 'error', message: 'Ingresa el correo electrónico del destinatario.' })
          setLoading(false)
          return
        }
        await cotizacionesApi.enviarEmail(cotizacionId, { destinatario: emailDest.trim() })
        setFeedback({ type: 'success', message: `Cotización enviada a ${emailDest.trim()}.` })

      } else {
        // PDF download + register
        const blob = await cotizacionesApi.descargarPdf(cotizacionId)
        const url = URL.createObjectURL(blob)
        Object.assign(document.createElement('a'), {
          href: url,
          download: `cotizacion-${cotizacionId.slice(0, 8)}.pdf`,
        }).click()
        URL.revokeObjectURL(url)
        // Register the download event (best-effort, non-blocking)
        cotizacionesApi.registrarEnvioPdf(cotizacionId).catch(() => null)
        setFeedback({ type: 'success', message: 'PDF descargado y envío registrado.' })
      }

      qc.invalidateQueries({ queryKey: ['cotizacion', cotizacionId] })
      qc.invalidateQueries({ queryKey: ['cotizacion-envios', cotizacionId] })

    } catch {
      const msgs: Record<CanalEnvio, string> = {
        whatsapp: 'No se pudo enviar por WhatsApp. Revisa la configuración de n8n.',
        email: 'No se pudo enviar el correo. Revisa la configuración de email.',
        pdf: 'No se pudo descargar el PDF. Intenta de nuevo.',
      }
      setFeedback({ type: 'error', message: msgs[canal] })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar cotización</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Channel selector */}
          <div className="space-y-2">
            {CHANNELS.map((ch) => (
              <ChannelCard
                key={ch.canal}
                selected={canal === ch.canal}
                onClick={() => { setCanal(ch.canal); setFeedback(null) }}
                icon={ch.icon}
                label={ch.label}
                description={ch.description}
                color={ch.color}
              />
            ))}
          </div>

          {/* Extra field for email */}
          {canal === 'email' && (
            <div className="space-y-1.5">
              <Label className="text-sm">
                Correo del destinatario
                {pacienteTelefono && <span className="text-muted-foreground font-normal ml-1">(paciente)</span>}
              </Label>
              <Input
                type="email"
                placeholder="correo@ejemplo.com"
                value={emailDest}
                onChange={(e) => setEmailDest(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* WhatsApp info: show phone if available */}
          {canal === 'whatsapp' && pacienteTelefono && (
            <p className="text-xs text-muted-foreground bg-gray-50 rounded-lg px-3 py-2">
              Se enviará al número: <span className="font-medium text-foreground">{pacienteTelefono}</span>
            </p>
          )}

          {/* Feedback */}
          <Feedback state={feedback} />

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={resetAndClose} disabled={loading}>
              {feedback?.type === 'success' ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!feedback?.type || feedback.type === 'error' ? (
              <Button type="button" className="flex-1" onClick={handleEnviar} disabled={loading}>
                {loading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Enviando…</>
                  : canal === 'pdf' ? 'Descargar PDF' : 'Enviar'}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

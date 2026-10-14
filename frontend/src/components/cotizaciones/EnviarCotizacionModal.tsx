'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  MessageCircle, Mail, CheckCircle2, AlertCircle, Loader2,
} from 'lucide-react'
import { mensajeDeError } from '@/lib/errores'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cotizacionesApi } from '@/lib/api/cotizaciones'
import { cn } from '@/lib/utils'
import type { CanalEnvio } from '@/types/cotizaciones'

// Descargar el PDF no es una opción de envío: se hace con el botón PDF de la
// cotización, que también deja registrado el envío.
type CanalModal = Exclude<CanalEnvio, 'pdf'>

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
  canal: CanalModal
  icon: React.ElementType
  label: string
  description: string
  color: string
}[] = [
  {
    canal: 'whatsapp',
    icon: MessageCircle,
    label: 'WhatsApp',
    description: 'Envía la cotización con PDF adjunto al teléfono registrado del paciente',
    color: 'text-green-600 bg-green-50',
  },
  {
    canal: 'email',
    icon: Mail,
    label: 'Correo electrónico',
    description: 'Envía un email con la cotización adjunta en PDF',
    color: 'text-blue-600 bg-blue-50',
  },
]

export function EnviarCotizacionModal({ open, onClose, cotizacionId, pacienteTelefono, pacienteEmail }: Props) {
  const qc = useQueryClient()
  const [canal, setCanal] = useState<CanalModal>('whatsapp')
  // Con el correo enmascarado (sin permiso de datos sensibles) no se precarga:
  // si se deja vacío, el backend usa el correo registrado del paciente.
  const emailOculto = Boolean(pacienteEmail?.includes('•'))
  const emailInicial = emailOculto ? '' : (pacienteEmail ?? '')
  const [emailDest, setEmailDest] = useState(emailInicial)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)

  function resetAndClose() {
    setCanal('whatsapp')
    setEmailDest(emailInicial)
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

      } else {
        if (!emailDest.trim() && !emailOculto) {
          setFeedback({ type: 'error', message: 'Ingresa el correo electrónico del destinatario.' })
          setLoading(false)
          return
        }
        await cotizacionesApi.enviarEmail(cotizacionId, emailDest.trim() ? { destinatario: emailDest.trim() } : {})
        setFeedback({ type: 'success', message: `Cotización enviada a ${emailDest.trim() || pacienteEmail}.` })
      }

      qc.invalidateQueries({ queryKey: ['cotizacion', cotizacionId] })
      qc.invalidateQueries({ queryKey: ['cotizacion-envios', cotizacionId] })
      qc.invalidateQueries({ queryKey: ['cotizaciones'] })
      qc.invalidateQueries({ queryKey: ['seguimiento'] })

    } catch (err) {
      const porDefecto: Record<CanalModal, string> = {
        whatsapp: 'No se pudo enviar por WhatsApp. Intenta de nuevo.',
        email: 'No se pudo enviar el correo. Revisa la configuración de email.',
      }
      setFeedback({ type: 'error', message: mensajeDeError(err, porDefecto[canal]) })
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
                {pacienteEmail && <span className="text-muted-foreground font-normal ml-1">(paciente)</span>}
              </Label>
              <Input
                type="email"
                placeholder={emailOculto ? 'Déjalo vacío para usar el del paciente' : 'correo@ejemplo.com'}
                value={emailDest}
                onChange={(e) => setEmailDest(e.target.value)}
                autoFocus
              />
              {emailOculto && !emailDest.trim() && (
                <p className="text-xs text-muted-foreground">Se enviará al correo registrado: {pacienteEmail}</p>
              )}
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
                  : 'Enviar'}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

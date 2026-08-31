'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RotateCcw, AlertTriangle, UserCheck, XCircle, Info, CheckCircle2 } from 'lucide-react'
import { pacientesApi } from '@/lib/api/pacientes'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api/client'
import { CamaraCaptura } from '@/components/shared/CamaraCaptura'
import { resolveMediaUrl } from '@/lib/utils/media'

interface Props {
  pacienteId: string
  citaId: string | null
  onCompletado: () => void
}

type ResultadoConfianza = 'alta' | 'media' | 'baja'

interface CheckinResult {
  match: boolean
  confidence: ResultadoConfianza
  score: number
  requiere_confirmacion: boolean
}

type State = 'camara' | 'procesando' | 'resultado' | 'sin_enrollment' | 'enrollment_camara' | 'enrollment_uploading' | 'enrollment_ok'

export function VerificacionFacialContent({ pacienteId, citaId, onCompletado }: Props) {
  const [state, setState] = useState<State>('camara')
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [resultado, setResultado] = useState<CheckinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrollErrors, setEnrollErrors] = useState<string[]>([])
  const [enrollWarnings, setEnrollWarnings] = useState<string[]>([])
  const [badgeVisible, setBadgeVisible] = useState(false)

  const { data: paciente } = useQuery({
    queryKey: ['pacientes', pacienteId],
    queryFn: () => pacientesApi.get(pacienteId),
    staleTime: 60_000,
  })
  const fotoControlUrl: string | null = resolveMediaUrl((paciente as any)?.foto_control_url ?? null)

  useEffect(() => {
    if (state === 'resultado') {
      const t = setTimeout(() => setBadgeVisible(true), 300)
      return () => clearTimeout(t)
    } else {
      setBadgeVisible(false)
    }
  }, [state])

  async function enviarFoto(file: File) {
    setFotoPreview(URL.createObjectURL(file))
    setState('procesando')
    setError(null)
    try {
      const form = new FormData()
      form.append('live_photo', file)
      if (citaId) form.append('cita_id', citaId)
      const res = await apiClient.post<CheckinResult>(`/pacientes/${pacienteId}/checkin/`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResultado(res.data)
      setState('resultado')
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { code?: string; error?: string } } }
      if (e?.response?.status === 428 || e?.response?.data?.code === 'ENROLLMENT_REQUIRED') {
        setState('sin_enrollment')
      } else {
        setError(e?.response?.data?.error ?? 'Error al verificar la identidad. Intenta de nuevo.')
        setState('camara')
      }
    }
  }

  async function enrollarYVerificar(file: File) {
    setState('enrollment_uploading')
    setError(null)
    try {
      await pacientesApi.enrollment(pacienteId, file)
      setState('enrollment_ok')
      // Reutilizar la misma foto para la verificación
      setTimeout(async () => {
        setState('procesando')
        try {
          const form = new FormData()
          form.append('live_photo', file)
          if (citaId) form.append('cita_id', citaId)
          const res = await apiClient.post<CheckinResult>(`/pacientes/${pacienteId}/checkin/`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          setResultado(res.data)
          setState('resultado')
        } catch {
          onCompletado()
        }
      }, 1200)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { errors?: string[]; warnings?: string[]; error?: string } } }
      const errs = e?.response?.data?.errors ?? []
      const warns = e?.response?.data?.warnings ?? []
      if (errs.length > 0 || warns.length > 0) {
        setEnrollErrors(errs)
        setEnrollWarnings(warns)
        setError(null)
      } else {
        setError(e?.response?.data?.error ?? 'No se pudo procesar la foto.')
        setEnrollErrors([])
        setEnrollWarnings([])
      }
      setState('enrollment_camara')
    }
  }

  // ── Sin enrollment ────────────────────────────────────────────────────────
  if (state === 'sin_enrollment' || state === 'enrollment_camara') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Sin foto de control</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Toma la foto de control ahora. Se usará también para verificar la identidad en esta visita.
            </p>
          </div>
        </div>
        {/* Errores específicos por parámetro */}
        {(enrollErrors.length > 0 || enrollWarnings.length > 0) && (
          <div className="space-y-1.5">
            {enrollErrors.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
                <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{msg}</p>
              </div>
            ))}
            {enrollWarnings.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <Info className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">{msg}</p>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        <CamaraCaptura
          onCaptura={enrollarYVerificar}
          labelCapturar="Tomar foto de control"
        />
      </div>
    )
  }

  // ── Uploading enrollment ──────────────────────────────────────────────────
  if (state === 'enrollment_uploading') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Procesando foto de control…</p>
      </div>
    )
  }

  // ── Enrollment ok (transición) ────────────────────────────────────────────
  if (state === 'enrollment_ok') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
          <UserCheck className="h-7 w-7 text-green-600" />
        </div>
        <p className="font-semibold text-gray-800">Foto registrada</p>
        <p className="text-sm text-muted-foreground">Verificando identidad…</p>
      </div>
    )
  }

  // ── Procesando ────────────────────────────────────────────────────────────
  if (state === 'procesando') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verificando identidad…</p>
      </div>
    )
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  if (state === 'resultado' && resultado) {
    const cfg = {
      alta:  {
        badge: <CheckCircle2 className="h-8 w-8 text-white" />,
        badgeBg: 'bg-green-500',
        ring: 'ring-green-400',
        label: 'Identidad verificada',
        desc: 'La similitud facial es alta. El paciente fue identificado correctamente.',
        labelColor: 'text-green-600',
      },
      media: {
        badge: <AlertTriangle className="h-8 w-8 text-white" />,
        badgeBg: 'bg-amber-400',
        ring: 'ring-amber-300',
        label: 'Verificar manualmente',
        desc: 'La similitud es moderada. Confirma la identidad visualmente antes de continuar.',
        labelColor: 'text-amber-600',
      },
      baja: {
        badge: <ShieldX className="h-8 w-8 text-white" />,
        badgeBg: 'bg-red-500',
        ring: 'ring-red-400',
        label: 'Identidad no verificada',
        desc: 'La similitud es baja. El paciente no coincide con la foto de control.',
        labelColor: 'text-red-600',
      },
    }[resultado.confidence]

    return (
      <div className="flex flex-col items-center gap-5 py-4">

        {/* Fotos comparadas */}
        <div className="flex items-center gap-4 w-full justify-center">
          {/* Foto de control */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-36 h-36 rounded-xl overflow-hidden border-2 border-border bg-muted">
              {fotoControlUrl
                ? <img src={fotoControlUrl} alt="Foto de control" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Sin foto</div>
              }
            </div>
            <span className="text-[11px] text-muted-foreground">Control</span>
          </div>

          {/* Badge central animado */}
          <div
            className={cn(
              'flex flex-col items-center gap-1 transition-all duration-500',
              badgeVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
            )}
          >
            <div className={cn('h-14 w-14 rounded-full flex items-center justify-center shadow-lg ring-4', cfg.badgeBg, cfg.ring)}>
              {cfg.badge}
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">{Math.round(resultado.score * 100)}%</span>
          </div>

          {/* Foto live */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-36 h-36 rounded-xl overflow-hidden border-2 border-border bg-muted">
              {fotoPreview
                ? <img src={fotoPreview} alt="Foto capturada" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">—</div>
              }
            </div>
            <span className="text-[11px] text-muted-foreground">En visita</span>
          </div>
        </div>

        {/* Texto resultado */}
        <div
          className={cn(
            'text-center transition-all duration-500 delay-200',
            badgeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
          )}
        >
          <p className={cn('font-semibold text-base', cfg.labelColor)}>{cfg.label}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">{cfg.desc}</p>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 flex-wrap justify-center">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setState('camara')}>
            <RotateCcw className="h-3.5 w-3.5" />Reintentar
          </Button>
          {resultado.confidence !== 'baja' && (
            <Button size="sm" onClick={onCompletado}>Continuar</Button>
          )}
        </div>
      </div>
    )
  }

  // ── Cámara (estado inicial) ───────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-gray-800">Verificación de identidad</p>
        <p className="text-xs text-muted-foreground">
          Captura una foto del paciente para compararla con su foto de control.
        </p>
      </div>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <CamaraCaptura onCaptura={enviarFoto} labelCapturar="Capturar y verificar" />
    </div>
  )
}

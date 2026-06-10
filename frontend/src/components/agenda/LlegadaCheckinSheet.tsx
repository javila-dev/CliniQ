'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Smartphone, Camera, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { agendaApi } from '@/lib/api/agenda'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Cita } from '@/types/agenda'

// ─── Countdown ────────────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0)
  useEffect(() => {
    if (!expiresAt) { setRemaining(0); return }
    const calc = () => setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)))
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [expiresAt])
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  return { remaining, label: `${mm}:${ss}` }
}

// ─── OTP input ────────────────────────────────────────────────────────────────

function OtpInput({ onComplete, disabled }: { onComplete: (code: string) => void; disabled: boolean }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const refs = Array.from({ length: 6 }, () => useRef<HTMLInputElement>(null))

  const handleChange = (i: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]; next[i] = digit; setDigits(next)
    if (digit && i < 5) refs[i + 1].current?.focus()
    if (next.every((d) => d !== '')) onComplete(next.join(''))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) { setDigits(pasted.split('')); onComplete(pasted) }
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className={cn(
            'h-12 w-10 text-center text-lg font-bold rounded-lg border-2 outline-none transition-colors',
            'focus:border-primary disabled:opacity-50 bg-background',
            d ? 'border-primary/70' : 'border-input',
          )}
        />
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

type CheckinMode = 'otp' | 'foto'
type OtpUIState  = 'idle' | 'enviando' | 'esperando_codigo' | 'verificando' | 'expirado' | 'bloqueado' | 'ok'
type FotoUIState = 'idle' | 'preview' | 'subiendo' | 'ok'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  cita: Cita
  onCheckinSuccess: () => void
}

export function LlegadaCheckinSheet({ open, onOpenChange, cita, onCheckinSuccess }: Props) {
  const [mode, setMode]           = useState<CheckinMode>('otp')
  const [otpState, setOtpState]   = useState<OtpUIState>('idle')
  const [fotoState, setFotoState] = useState<FotoUIState>('idle')
  const [expiraEn, setExpiraEn]   = useState<string | null>(null)
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile, setFotoFile]   = useState<File | null>(null)
  const [fotoHabilitada, setFotoHabilitada] = useState(false)
  const [telefonoMascarado, setTelefonoMascarado] = useState<string | null>(null)
  const [otpYaActivo, setOtpYaActivo] = useState(false)
  const [cooldown, setCooldown]   = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const { remaining, label: countdown } = useCountdown(expiraEn)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  useEffect(() => {
    if (remaining === 0 && otpState === 'esperando_codigo' && expiraEn !== null) {
      if (new Date(expiraEn).getTime() <= Date.now()) setOtpState('expirado')
    }
  }, [remaining, otpState, expiraEn])

  const reset = () => {
    setOtpState('idle'); setFotoState('idle'); setExpiraEn(null)
    setErrorMsg(null); setFotoPreview(null); setFotoFile(null)
    setFotoHabilitada(false); setTelefonoMascarado(null)
    setOtpYaActivo(false); setCooldown(0)
  }

  const iniciarMut = useMutation({
    mutationFn: () => agendaApi.citas.iniciarCheckin(cita.id),
    onMutate: () => setOtpState('enviando'),
    onSuccess: (data) => {
      setExpiraEn(data.expira_en ?? null)
      setOtpState('esperando_codigo')
      setOtpYaActivo(data.otp_activo ?? false)
      if (data.telefono_enmascarado) setTelefonoMascarado(data.telefono_enmascarado)
      if (!data.otp_activo) setCooldown(60)
      setErrorMsg(null)
    },
    onError: () => {
      setOtpState('idle')
      setFotoHabilitada(true)
      setErrorMsg('No se pudo enviar el código. Usa la foto de respaldo.')
    },
  })

  const verificarMut = useMutation({
    mutationFn: (codigo: string) => agendaApi.citas.verificarOtp(cita.id, { codigo }),
    onMutate: () => setOtpState('verificando'),
    onSuccess: () => { setOtpState('ok'); setTimeout(onCheckinSuccess, 800) },
    onError: (err: any) => {
      const data = err?.response?.data
      if (data?.intentos_restantes === 0) {
        setOtpState('bloqueado'); setErrorMsg('Demasiados intentos incorrectos.')
      } else {
        setOtpState('esperando_codigo')
        setErrorMsg(`Código incorrecto.${data?.intentos_restantes != null ? ` ${data.intentos_restantes} intento(s) restante(s).` : ''}`)
      }
    },
  })

  const fotoMut = useMutation({
    mutationFn: (file: File) => agendaApi.citas.checkinFoto(cita.id, file),
    onMutate: () => setFotoState('subiendo'),
    onSuccess: () => { setFotoState('ok'); setTimeout(onCheckinSuccess, 800) },
    onError: () => { setFotoState('preview'); setErrorMsg('No se pudo subir la foto. Intenta de nuevo.') },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
    setFotoState('preview')
    setErrorMsg(null)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <SheetContent className="sm:max-w-md flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="text-base">Registrar llegada</SheetTitle>
          <p className="text-xs text-muted-foreground leading-snug">{cita.paciente_nombre}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Selector de modo */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'otp' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setMode('otp'); setFotoState('idle'); setFotoPreview(null); setFotoFile(null) }}
            >
              <Smartphone className="h-4 w-4" />
              Código WhatsApp
            </button>
            <button
              disabled={!fotoHabilitada}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                !fotoHabilitada
                  ? 'text-muted-foreground/40 cursor-not-allowed'
                  : mode === 'foto'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => { if (fotoHabilitada) { setMode('foto'); setErrorMsg(null) } }}
            >
              <Camera className="h-4 w-4" />
              Foto de respaldo
            </button>
          </div>

          {/* ── Modo OTP ── */}
          {mode === 'otp' && (
            <div className="space-y-5">
              {otpState === 'ok' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-green-700">Presencia verificada</p>
                </div>
              ) : (
                <>
                  {/* Info: número destino */}
                  <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground space-y-0.5">
                    <p>Se enviará un código de 6 dígitos al WhatsApp del paciente.</p>
                    {telefonoMascarado && (
                      <p className="font-mono font-medium text-foreground">{telefonoMascarado}</p>
                    )}
                  </div>

                  {(otpState === 'idle' || otpState === 'expirado' || otpState === 'bloqueado') && (
                    <Button
                      className="w-full gap-2"
                      onClick={() => iniciarMut.mutate()}
                      disabled={otpState === 'bloqueado' || iniciarMut.isPending || cooldown > 0}
                    >
                      {iniciarMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {otpState === 'expirado' ? <RefreshCw className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                      {cooldown > 0
                        ? `Reenviar código (${cooldown}s)`
                        : otpState === 'expirado'
                          ? 'Reenviar código'
                          : 'Enviar código'
                      }
                    </Button>
                  )}

                  {otpState === 'enviando' && (
                    <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Enviando por WhatsApp…</span>
                    </div>
                  )}

                  {(otpState === 'esperando_codigo' || otpState === 'verificando') && (
                    <div className="space-y-4">
                      <div className="text-center space-y-1">
                        {otpYaActivo ? (
                          <p className="text-sm text-muted-foreground">
                            El código anterior sigue siendo válido, ingrésalo.
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Ingresa el código recibido
                            {telefonoMascarado && (
                              <> en <span className="font-mono font-medium text-foreground">{telefonoMascarado}</span></>
                            )}
                          </p>
                        )}
                        <p className={cn('text-xs font-mono', remaining < 60 ? 'text-amber-500' : 'text-muted-foreground')}>
                          Válido por {countdown}
                        </p>
                      </div>
                      <OtpInput
                        onComplete={(code) => verificarMut.mutate(code)}
                        disabled={otpState === 'verificando'}
                      />
                      {otpState === 'verificando' && (
                        <div className="flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Modo Foto ── */}
          {mode === 'foto' && (
            <div className="space-y-4">
              {fotoState === 'ok' ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-green-700">Foto registrada</p>
                </div>
              ) : (
                <>
                  {fotoPreview && (
                    <div className="rounded-lg overflow-hidden border">
                      <img src={fotoPreview} alt="Preview" className="w-full h-48 object-cover" />
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFileChange} />

                  {fotoState === 'idle' && (
                    <Button className="w-full gap-2" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Camera className="h-4 w-4" />
                      Abrir cámara
                    </Button>
                  )}

                  {fotoState === 'preview' && (
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1 gap-1" onClick={() => fileRef.current?.click()} disabled={fotoMut.isPending}>
                        <Camera className="h-4 w-4" />Retomar
                      </Button>
                      <Button className="flex-1 gap-1" onClick={() => fotoFile && fotoMut.mutate(fotoFile)} disabled={fotoMut.isPending}>
                        {fotoMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmar
                      </Button>
                    </div>
                  )}

                  {fotoState === 'subiendo' && (
                    <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Guardando foto…</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{errorMsg}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

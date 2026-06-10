'use client'

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Smartphone, Camera, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { protocolosApi } from '@/lib/api/protocolos'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SesionProcedimiento } from '@/types/protocolos'

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!expiresAt) { setRemaining(0); return }

    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setRemaining(diff)
    }
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
    const next = [...digits]
    next[i] = digit
    setDigits(next)
    if (digit && i < 5) refs[i + 1].current?.focus()
    if (next.every((d) => d !== '')) onComplete(next.join(''))
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs[i - 1].current?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      setDigits(pasted.split(''))
      onComplete(pasted)
    }
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
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

type CheckinMode  = 'otp' | 'foto'
type OtpUIState   = 'idle' | 'enviando' | 'esperando_codigo' | 'verificando' | 'expirado' | 'bloqueado' | 'ok'
type FotoUIState  = 'idle' | 'preview' | 'subiendo' | 'ok'

interface CheckinSheetProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  sesion: SesionProcedimiento
  tratamientoId: string
}

export function CheckinSheet({ open, onOpenChange, sesion, tratamientoId }: CheckinSheetProps) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<CheckinMode>('otp')
  const [otpState, setOtpState] = useState<OtpUIState>('idle')
  const [fotoState, setFotoState] = useState<FotoUIState>('idle')
  const [expiraEn, setExpiraEn] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { remaining, label: countdown } = useCountdown(expiraEn)

  useEffect(() => {
    if (remaining === 0 && otpState === 'esperando_codigo') setOtpState('expirado')
  }, [remaining, otpState])

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['tratamiento', tratamientoId] })
    onOpenChange(false)
  }

  const iniciarMut = useMutation({
    mutationFn: () => protocolosApi.sesiones.iniciarCheckin(sesion.id),
    onMutate: () => setOtpState('enviando'),
    onSuccess: (data) => {
      if (data.otp_activo) {
        setExpiraEn(data.expira_en ?? null)
        setOtpState('esperando_codigo')
      } else {
        setExpiraEn(data.expira_en ?? null)
        setOtpState('esperando_codigo')
      }
      setErrorMsg(null)
    },
    onError: () => { setOtpState('idle'); setErrorMsg('No se pudo enviar el código. Intenta de nuevo.') },
  })

  const verificarMut = useMutation({
    mutationFn: (codigo: string) => protocolosApi.sesiones.verificarOtp(sesion.id, { codigo }),
    onMutate: () => setOtpState('verificando'),
    onSuccess: () => { setOtpState('ok'); setTimeout(invalidar, 1000) },
    onError: (err: any) => {
      const data = err?.response?.data
      if (data?.intentos_restantes === 0) { setOtpState('bloqueado'); setErrorMsg('Demasiados intentos incorrectos.') }
      else { setOtpState('esperando_codigo'); setErrorMsg(`Código incorrecto. ${data?.intentos_restantes ?? ''} intento(s) restante(s).`) }
    },
  })

  const fotoMut = useMutation({
    mutationFn: (file: File) => protocolosApi.sesiones.checkinFoto(sesion.id, file),
    onMutate: () => setFotoState('subiendo'),
    onSuccess: () => { setFotoState('ok'); setTimeout(invalidar, 800) },
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

  const reset = () => {
    setOtpState('idle')
    setFotoState('idle')
    setExpiraEn(null)
    setErrorMsg(null)
    setFotoPreview(null)
    setFotoFile(null)
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <SheetContent className="sm:max-w-md flex flex-col p-0 overflow-hidden">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <SheetTitle className="text-base">Verificar presencia</SheetTitle>
          <p className="text-xs text-muted-foreground leading-snug">
            {sesion.paso_orden}. {sesion.paso_nombre}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Tabs modo */}
          <div className="flex rounded-lg border p-1 gap-1">
            <button
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'otp' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setMode('otp'); reset() }}
            >
              <Smartphone className="h-4 w-4" />
              Código WhatsApp
            </button>
            <button
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors',
                mode === 'foto' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => { setMode('foto'); reset() }}
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
                  <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                    Se enviará un código de 6 dígitos al WhatsApp del paciente.
                  </div>

                  {(otpState === 'idle' || otpState === 'expirado' || otpState === 'bloqueado') && (
                    <Button
                      className="w-full gap-2"
                      onClick={() => iniciarMut.mutate()}
                      disabled={otpState === 'bloqueado' || iniciarMut.isPending}
                    >
                      {iniciarMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {otpState === 'expirado' ? <RefreshCw className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                      {otpState === 'expirado' ? 'Reenviar código' : 'Enviar código'}
                    </Button>
                  )}

                  {(otpState === 'enviando') && (
                    <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Enviando por WhatsApp…</span>
                    </div>
                  )}

                  {(otpState === 'esperando_codigo' || otpState === 'verificando') && (
                    <div className="space-y-4">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Ingresa el código recibido</p>
                        <p className={cn(
                          'text-xs font-mono mt-1',
                          remaining < 60 ? 'text-amber-500' : 'text-muted-foreground',
                        )}>
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

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  {fotoState === 'idle' && (
                    <Button className="w-full gap-2" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Camera className="h-4 w-4" />
                      Abrir cámara
                    </Button>
                  )}

                  {fotoState === 'preview' && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 gap-1"
                        onClick={() => fileRef.current?.click()}
                        disabled={fotoMut.isPending}
                      >
                        <Camera className="h-4 w-4" />
                        Retomar
                      </Button>
                      <Button
                        className="flex-1 gap-1"
                        onClick={() => fotoFile && fotoMut.mutate(fotoFile)}
                        disabled={fotoMut.isPending}
                      >
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

          {/* Error global */}
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

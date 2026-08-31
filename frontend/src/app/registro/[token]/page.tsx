'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Loader2, AlertCircle, ShieldCheck } from 'lucide-react'
import { CamaraCaptura } from '@/components/shared/CamaraCaptura'
import Image from 'next/image'
import { PacienteForm } from '@/components/pacientes/PacienteForm'
import { registroPublicoApi, type RegistroPublicoResponse } from '@/lib/api/registroPublico'
import type { CreatePacienteRequest } from '@/types/pacientes'
import { resolveMediaUrl } from '@/lib/utils/media'

export default function RegistroPublicoPage() {
  const { token } = useParams<{ token: string }>()
  const [registrado, setRegistrado] = useState<RegistroPublicoResponse | null>(null)
  const [yaExiste, setYaExiste] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [fotoLista, setFotoLista] = useState(false)

  const { data: clinica, isLoading, isError } = useQuery({
    queryKey: ['registro-publico-clinica', token],
    queryFn: () => registroPublicoApi.getClinica(token),
    retry: false,
  })

  async function handleSubmit(data: CreatePacienteRequest) {
    setServerError(null)
    setYaExiste(null)
    try {
      const res = await registroPublicoApi.registrar({ ...data, token })
      setRegistrado(res)
    } catch (err: any) {
      const code = err?.response?.data?.code
      if (code === 'PACIENTE_YA_EXISTE') {
        const campo = err?.response?.data?.campo ?? 'dato'
        const mensajes: Record<string, string> = {
          telefono: 'Ya existe un paciente registrado con ese número de teléfono.',
          email: 'Ya existe un paciente registrado con ese correo electrónico.',
          numero_documento: 'Ya existe un paciente registrado con ese número de documento.',
        }
        setYaExiste(mensajes[campo] ?? 'Ya estás registrado en esta clínica.')
      } else {
        setServerError(
          err?.response?.data?.error ?? 'Ocurrió un error al registrarte. Inténtalo de nuevo.'
        )
      }
    }
  }

  // ── Loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1a1118' }}>
        <Loader2 className="h-7 w-7 animate-spin text-rose-300/60" />
      </div>
    )
  }

  // ── Token inválido ─────────────────────────────────────────────
  if (isError || !clinica) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#1a1118' }}>
        <div className="max-w-xs text-center space-y-4">
          <div className="h-14 w-14 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
            <AlertCircle className="h-6 w-6 text-rose-400" />
          </div>
          <h1 className="text-lg font-semibold text-white">Enlace no válido</h1>
          <p className="text-sm text-white/40 leading-relaxed">
            Este enlace de registro no es válido o ha expirado. Comunícate con la clínica para obtener uno nuevo.
          </p>
          <p className="text-[11px] text-white/20 pt-2">Powered by CliniQ</p>
        </div>
      </div>
    )
  }

  // ── Registro exitoso ───────────────────────────────────────────
  if (registrado) {
    const necesitaFoto = clinica?.paso_verificacion_facial && !fotoLista
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#1a1118' }}>
        <Blobs />
        <div className="flex-1 flex items-center justify-center px-6">
          {necesitaFoto ? (
            <div className="relative z-10 w-full max-w-sm">
              <EnrollmentFoto
                pacienteId={registrado.id}
                token={token}
                nombre={registrado.nombre_completo}
                clinicaNombre={clinica.clinica_nombre}
                onDone={() => setFotoLista(true)}
              />
            </div>
          ) : (
            <div className="relative z-10 text-center space-y-5 max-w-xs">
              <div className="h-20 w-20 rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-9 w-9 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">¡Listo!</h1>
                <p className="text-sm text-white/50 mt-2 leading-relaxed">
                  Hola <span className="text-white/80 font-medium">{registrado.nombre_completo}</span>,
                  ya quedaste registrado en{' '}
                  <span className="text-white/80 font-medium">{registrado.clinica_nombre}</span>.
                  El equipo te contactará pronto.
                </p>
              </div>
              <p className="text-[11px] text-white/20 pt-4">Powered by CliniQ</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const logoUrl = clinica.logo_url ? resolveMediaUrl(clinica.logo_url) : null

  // ── Formulario ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#1a1118' }}>
      <Blobs />

      {/* Header */}
      <div className="relative z-10 pt-10 pb-16 px-6">

        {/* Top bar: CliniQ izq — logo clínica der */}
        <div className="flex items-center justify-between mb-8">
          <Image
            src="/imagotipo cliniq.png"
            alt="CliniQ"
            width={72}
            height={24}
            className="object-contain opacity-55"
          />
          {logoUrl ? (
            <div className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 overflow-hidden flex items-center justify-center shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={clinica.clinica_nombre} className="h-full w-full object-contain p-0.5" />
            </div>
          ) : (
            <div className="h-11 w-11 rounded-xl bg-rose-500/10 ring-1 ring-rose-400/20 flex items-center justify-center">
              <span className="text-base font-bold text-rose-300/80">{clinica.clinica_nombre.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>

        {/* Clinic name + tagline */}
        <div>
          <h1 className="text-2xl font-bold text-white leading-tight">{clinica.clinica_nombre}</h1>
          <p className="text-lg font-semibold text-white/60 mt-1 leading-snug tracking-tight">
            Regístrate como paciente
          </p>
        </div>
      </div>

      {/* Form drawer */}
      <div className="relative z-10 flex-1 rounded-t-3xl bg-white px-5 pt-7 pb-10 -mt-6 shadow-2xl">

        {/* Pill handle */}
        <div className="w-10 h-1 rounded-full bg-gray-200 mx-auto mb-6" />

        {yaExiste && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">{yaExiste}</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Comunícate directamente con la clínica si necesitas actualizar tus datos.
              </p>
            </div>
          </div>
        )}

        {serverError && (
          <div className="mb-5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{serverError}</p>
          </div>
        )}

        <PacienteForm
          onSubmit={handleSubmit}
          submitLabel="Registrarme"
          tabsRequeridos={{
            personal: clinica.tab_personal_requerido ?? false,
            salud: clinica.tab_salud_requerido ?? false,
          }}
        />

        <p className="text-center text-[11px] text-muted-foreground/50 mt-8">
          Tus datos son tratados con confidencialidad por {clinica.clinica_nombre} · Powered by CliniQ
        </p>
      </div>
    </div>
  )
}

function EnrollmentFoto({
  pacienteId, token, nombre, clinicaNombre, onDone,
}: {
  pacienteId: string
  token: string
  nombre: string
  clinicaNombre: string
  onDone: () => void
}) {
  const [step, setStep]   = useState<'info' | 'camara' | 'uploading' | 'ok' | 'error'>('info')
  const [aceptado, setAceptado]             = useState(false)
  const [enrollErrors, setEnrollErrors]     = useState<string[]>([])
  const [enrollWarnings, setEnrollWarnings] = useState<string[]>([])
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)

  async function subir(file: File) {
    setStep('uploading')
    try {
      await registroPublicoApi.enrollment(pacienteId, token, file)
      setStep('ok')
      setTimeout(onDone, 1800)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { errors?: string[]; warnings?: string[]; error?: string } } }
      const errs  = e?.response?.data?.errors   ?? []
      const warns = e?.response?.data?.warnings ?? []
      if (errs.length > 0 || warns.length > 0) {
        setEnrollErrors(errs)
        setEnrollWarnings(warns)
        setErrorMsg(null)
      } else {
        setErrorMsg(e?.response?.data?.error ?? 'No se pudo procesar la foto. Intenta de nuevo.')
        setEnrollErrors([])
        setEnrollWarnings([])
      }
      setStep('error')
    }
  }

  // ── Pantalla de información y consentimiento ──────────────────────────────
  if (step === 'info') {
    return (
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-5">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-rose-500/10 ring-1 ring-rose-400/20 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-7 w-7 text-rose-300" />
          </div>
          <p className="text-base font-semibold text-white">Verificación de identidad facial</p>
          <p className="text-xs text-white/50 leading-relaxed">
            {clinicaNombre} utiliza reconocimiento facial para confirmar tu identidad en cada cita, agilizar tu llegada y proteger tu información médica.
          </p>
        </div>

        {/* Qué se recopila */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4 space-y-3">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">¿Qué se hace con tu foto?</p>
          <ul className="space-y-2">
            {[
              'Se captura una fotografía de tu rostro como foto de referencia.',
              'Se genera una representación matemática (embedding) de tu cara — no se guarda la foto en cada visita, solo el resultado de la comparación.',
              'Tu foto se almacena de forma segura y solo es accesible por el personal autorizado de la clínica.',
              'No se comparte con terceros ni se usa con fines distintos a la verificación de identidad en tus citas.',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-rose-300/70 shrink-0 mt-0.5">•</span>
                <p className="text-xs text-white/50 leading-relaxed">{item}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Derechos */}
        <div className="rounded-xl bg-white/[0.04] border border-white/[0.07] p-4 space-y-2">
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wide">Tus derechos (Ley 1581 de 2012)</p>
          <p className="text-xs text-white/45 leading-relaxed">
            Como titular de datos sensibles tienes derecho a conocer, actualizar, rectificar y solicitar la supresión de tu foto y embedding facial en cualquier momento, contactando directamente a {clinicaNombre}.
          </p>
        </div>

        {/* Checkbox de consentimiento */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={aceptado}
              onChange={e => setAceptado(e.target.checked)}
              className="sr-only"
            />
            <div className={`h-4 w-4 rounded border transition-colors ${aceptado ? 'bg-rose-500 border-rose-500' : 'border-white/20 bg-white/5 group-hover:border-white/30'}`}>
              {aceptado && (
                <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">
            He leído la información anterior y <span className="text-white/80 font-medium">autorizo voluntariamente</span> el tratamiento de mi dato biométrico (fotografía facial) por parte de {clinicaNombre} con el fin exclusivo de verificar mi identidad en mis citas.
          </p>
        </label>

        {/* Acciones */}
        <button
          type="button"
          disabled={!aceptado}
          onClick={() => setStep('camara')}
          className="w-full rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-rose-500 hover:bg-rose-600 text-white"
        >
          Continuar y tomar foto
        </button>

      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 space-y-5">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2 text-white/80">
          <ShieldCheck className="h-5 w-5 text-rose-300" />
          <p className="text-sm font-semibold">Foto de referencia, {nombre.split(' ')[0]}</p>
        </div>
        <p className="text-xs text-white/40 leading-relaxed">
          Centra tu rostro en el óvalo y asegúrate de tener buena iluminación.
        </p>
      </div>

      {step === 'camara' && (
        <CamaraCaptura onCaptura={subir} labelCapturar="Tomar foto de control" />
      )}

      {step === 'uploading' && (
        <div className="flex flex-col items-center gap-2 py-6">
          <Loader2 className="h-7 w-7 animate-spin text-rose-300/60" />
          <p className="text-xs text-white/40">Procesando foto…</p>
        </div>
      )}

      {step === 'ok' && (
        <div className="flex flex-col items-center gap-2 py-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-sm text-emerald-300 font-medium">Foto registrada</p>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-3">
          {(enrollErrors.length > 0 || enrollWarnings.length > 0) && (
            <div className="space-y-1.5">
              {enrollErrors.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-400/20 px-3 py-2">
                  <span className="text-red-300 shrink-0 mt-0.5 text-sm">✕</span>
                  <p className="text-xs text-red-200">{msg}</p>
                </div>
              ))}
              {enrollWarnings.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-400/20 px-3 py-2">
                  <span className="text-amber-300 shrink-0 mt-0.5 text-sm">!</span>
                  <p className="text-xs text-amber-200">{msg}</p>
                </div>
              ))}
            </div>
          )}
          {errorMsg && <p className="text-xs text-rose-300 text-center">{errorMsg}</p>}
          <CamaraCaptura onCaptura={subir} labelCapturar="Reintentar foto" />
        </div>
      )}

      {step === 'error' && (
        <button
          type="button"
          onClick={onDone}
          className="w-full text-xs text-white/25 hover:text-white/40 transition-colors pt-1 text-center"
        >
          Continuar sin foto — podrás registrarla en recepción
        </button>
      )}
    </div>
  )
}

function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(334,72%,60%,0.18) 0%, transparent 65%)' }} />
      <div className="absolute top-1/3 -left-20 h-56 w-56 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(334,55%,50%,0.10) 0%, transparent 68%)' }} />
      <div className="absolute -bottom-10 right-8 h-44 w-44 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(334,60%,55%,0.08) 0%, transparent 70%)' }} />
    </div>
  )
}

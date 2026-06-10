'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Eye, EyeOff, Sparkles, CalendarDays, FileText, Users, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/lib/api/auth'
import { defaultRoute } from '@/lib/permissions'
import type { AuthUser } from '@/types/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

const recoverySchema = z.object({
  email: z.string().email('Correo inválido'),
})

type LoginForm = z.infer<typeof loginSchema>
type RecoveryForm = z.infer<typeof recoverySchema>

const features = [
  { icon: CalendarDays, label: 'Agenda inteligente', desc: 'Vistas día, semana y mes' },
  { icon: Users,        label: 'Gestión de pacientes', desc: 'Historial clínico completo' },
  { icon: FileText,     label: 'Consentimientos', desc: 'Firma digital y trazabilidad' },
  { icon: Sparkles,     label: 'Clínica estética', desc: 'Diseñado para tu especialidad' },
]

function getSafeNextPath() {
  if (typeof window === 'undefined') return null

  const next = new URLSearchParams(window.location.search).get('next')
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null
  if (next === '/login' || next.startsWith('/login?')) return null

  return next
}

function getPostLoginRoute(user: AuthUser) {
  return getSafeNextPath() ?? defaultRoute(user)
}

export default function LoginPage() {
  const { hasCheckedAuth, isAuthenticated, isLoading, loadUser, login, user } = useAuthStore()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const {
    register: registerRecovery,
    handleSubmit: handleSubmitRecovery,
    reset: resetRecovery,
    formState: { errors: recoveryErrors, isSubmitting: isRecoverySubmitting },
  } = useForm<RecoveryForm>({ resolver: zodResolver(recoverySchema) })

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  useEffect(() => {
    if (hasCheckedAuth && isAuthenticated && user) router.replace(getPostLoginRoute(user))
  }, [hasCheckedAuth, isAuthenticated, user, router])

  const onSubmit = async ({ email, password }: LoginForm) => {
    setServerError(null)
    try {
      await login(email, password)
      const freshUser = useAuthStore.getState().user
      setIsNavigating(true)
      router.replace(freshUser ? getPostLoginRoute(freshUser) : getSafeNextPath() ?? '/agenda')
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        'Credenciales incorrectas. Verifica e intenta de nuevo.'
      setServerError(msg)
    }
  }

  const onRecoverySubmit = async ({ email }: RecoveryForm) => {
    setRecoveryError(null)
    try {
      await authApi.recuperarPassword(email)
      setRecoverySent(true)
    } catch {
      setRecoveryError('No pudimos procesar la solicitud. Verifica el correo e intenta de nuevo.')
    }
  }

  const handleOpenRecovery = () => {
    setRecoverySent(false)
    setRecoveryError(null)
    resetRecovery()
    setShowRecovery(true)
  }

  const handleBackToLogin = () => {
    setShowRecovery(false)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: brand ── */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[45%] flex-col bg-[#1a1118] relative overflow-hidden">

        {/* Decorative blobs */}
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,72%,60%,0.20) 0%, transparent 65%)' }} />
        <div aria-hidden className="pointer-events-none absolute top-1/2 -left-16 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,55%,50%,0.12) 0%, transparent 68%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,60%,55%,0.10) 0%, transparent 70%)' }} />

        {/* Content */}
        <div className="relative flex flex-col h-full px-10 py-6">

          {/* Logo */}
          <div className="flex items-center justify-center">
            <Image
              src="/imagotipo cliniq.png"
              alt="CliniQ"
              width={350}
              height={350}
              className="object-contain brightness-[1.15]"
            />
          </div>

          {/* Hero text */}
          <div className="flex-1 flex flex-col justify-center mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400/70 mb-3">
              Plataforma de gestión clínica
            </p>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              Todo lo que tu<br />clínica necesita,<br />
              <span className="text-rose-300">en un solo lugar.</span>
            </h2>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-xs">
              Diseñado para clínicas de estética con flujos de trabajo ágiles,
              trazabilidad completa y una experiencia que tu equipo va a amar.
            </p>

            {/* Feature list */}
            <div className="mt-6 space-y-3">
              {features.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/15 shrink-0">
                    <Icon className="h-4 w-4 text-rose-300/80" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">{label}</p>
                    <p className="text-xs text-white/35">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-[11px] text-white/20 mt-8">
            © {new Date().getFullYear()} CliniQ · Clínica Dra. Maroly González
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">

        {/* Sliding container */}
        <div
          className="relative w-full max-w-md overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent 0px, black 28px, black calc(100% - 28px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0px, black 28px, black calc(100% - 28px), transparent 100%)',
          }}
        >
          <div
            className="flex transition-transform duration-500 ease-in-out"
            style={{ transform: showRecovery ? 'translateX(-100%)' : 'translateX(0%)' }}
          >

            {/* ── Slide 1: Login ── */}
            <div className="w-full shrink-0 px-7">

              {/* Mobile logo */}
              <div className="mb-8 lg:hidden">
                <Image src="/imagotipo cliniq.png" alt="CliniQ" width={100} height={100} className="object-contain" />
              </div>

              <div className="mb-8">
                <h1 className="text-2xl font-bold text-foreground">Bienvenida de vuelta</h1>
                <p className="text-sm text-muted-foreground mt-1">Ingresa tus credenciales para continuar</p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@clinica.com"
                    autoComplete="email"
                    className={cn(errors.email && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Contraseña</Label>
                    <button
                      type="button"
                      className="text-xs text-rose-500 hover:text-rose-600 transition-colors"
                      onClick={handleOpenRecovery}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className={cn('pr-10', errors.password && 'border-destructive focus-visible:ring-destructive/30')}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-xs text-destructive">{errors.password.message}</p>
                  )}
                </div>

                {serverError && (
                  <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                    <p className="text-sm text-destructive">{serverError}</p>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-10 font-semibold"
                  disabled={isSubmitting || isLoading || isNavigating}
                >
                  {isSubmitting || isLoading || isNavigating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ingresando...
                    </>
                  ) : (
                    'Ingresar'
                  )}
                </Button>
              </form>
            </div>

            {/* ── Slide 2: Recuperar contraseña ── */}
            <div className="w-full shrink-0 px-7">

              {/* Mobile logo */}
              <div className="mb-8 lg:hidden">
                <Image src="/imagotipo cliniq.png" alt="CliniQ" width={100} height={100} className="object-contain" />
              </div>

              {recoverySent ? (
                <div className="flex flex-col items-center gap-3 text-center py-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                  <h1 className="text-xl font-bold text-foreground">Revisa tu correo</h1>
                  <p className="text-sm text-muted-foreground">
                    Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.
                  </p>
                  <Button className="mt-4 w-full" onClick={handleBackToLogin}>
                    Volver al inicio de sesión
                  </Button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
                    onClick={handleBackToLogin}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                  </button>

                  <div className="mb-8">
                    <h1 className="text-2xl font-bold text-foreground">Recuperar contraseña</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ingresa tu correo y te enviaremos un enlace para restablecerla.
                    </p>
                  </div>

                  <form onSubmit={handleSubmitRecovery(onRecoverySubmit)} className="space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="recovery-email">Correo electrónico</Label>
                      <Input
                        id="recovery-email"
                        type="email"
                        placeholder="usuario@clinica.com"
                        autoComplete="email"
                        className={cn(recoveryErrors.email && 'border-destructive focus-visible:ring-destructive/30')}
                        {...registerRecovery('email')}
                      />
                      {recoveryErrors.email && (
                        <p className="text-xs text-destructive">{recoveryErrors.email.message}</p>
                      )}
                    </div>

                    {recoveryError && (
                      <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                        <p className="text-sm text-destructive">{recoveryError}</p>
                      </div>
                    )}

                    <Button type="submit" className="w-full h-10 font-semibold" disabled={isRecoverySubmitting}>
                      {isRecoverySubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        'Enviar enlace'
                      )}
                    </Button>
                  </form>
                </>
              )}
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}

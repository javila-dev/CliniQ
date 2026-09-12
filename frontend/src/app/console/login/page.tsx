'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { isSuperAdmin } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})
type FormValues = z.infer<typeof schema>

export default function ConsoleLoginPage() {
  const { hasCheckedAuth, isAuthenticated, isLoading, loadUser, login, logout, user } = useAuthStore()
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!hasCheckedAuth) loadUser()
  }, [hasCheckedAuth, loadUser])

  // Si ya hay sesión y tiene acceso a consola, saltar directo — evita el
  // paso extra de re-tipear credenciales en una pestaña ya logueada.
  useEffect(() => {
    if (hasCheckedAuth && isAuthenticated && user && (isSuperAdmin(user) || user.is_staff)) {
      router.replace('/console')
    }
  }, [hasCheckedAuth, isAuthenticated, user, router])

  const onSubmit = async ({ email, password }: FormValues) => {
    setServerError(null)
    try {
      await login(email.trim(), password)
      const freshUser = useAuthStore.getState().user
      if (!freshUser || !(isSuperAdmin(freshUser) || freshUser.is_staff)) {
        setServerError('Esta cuenta no tiene acceso a la consola.')
        await logout()
        return
      }
      setIsNavigating(true)
      router.replace('/console')
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        'Credenciales incorrectas. Verifica e intenta de nuevo.'
      setServerError(msg)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0d12] px-4">
      <div aria-hidden className="pointer-events-none fixed -top-24 -left-24 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(220,70%,55%,0.14) 0%, transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none fixed -bottom-24 -right-24 h-96 w-96 rounded-full"
        style={{ background: 'radial-gradient(circle, hsla(260,60%,55%,0.10) 0%, transparent 70%)' }} />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 ring-1 ring-white/10">
            <ShieldCheck className="h-5 w-5 text-slate-300" />
          </div>
          <h1 className="text-lg font-semibold text-slate-100">CliniQ Console</h1>
          <p className="mt-1 text-sm text-slate-500">Acceso para superadmin y equipo interno</p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 shadow-2xl backdrop-blur"
        >
          <div className="space-y-1.5">
            <Label className="text-slate-300">Correo</Label>
            <Input
              type="email"
              autoComplete="email"
              placeholder="tu@cliniq.com"
              className="border-white/10 bg-slate-950/60 text-slate-100 placeholder:text-slate-600"
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-300">Contraseña</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="border-white/10 bg-slate-950/60 pr-10 text-slate-100 placeholder:text-slate-600"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || isNavigating}
            className={cn('w-full bg-slate-100 text-slate-900 hover:bg-white')}
          >
            {isSubmitting || isNavigating ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ingresando…</>
            ) : 'Ingresar'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-600">
          ¿Sos parte del equipo de una clínica?{' '}
          <a href="/login" className="text-slate-400 underline hover:text-slate-200">Ingresá por acá</a>
        </p>
      </div>
    </div>
  )
}

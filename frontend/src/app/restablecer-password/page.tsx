'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const resetSchema = z
  .object({
    nueva_password: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmar_password: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((d) => d.nueva_password === d.confirmar_password, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmar_password'],
  })

type ResetForm = z.infer<typeof resetSchema>

type PageState = 'loading' | 'valid' | 'invalid' | 'success'

function RestablecerPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [pageState, setPageState] = useState<PageState>('loading')
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(resetSchema) })

  useEffect(() => {
    if (!token) {
      setPageState('invalid')
      return
    }
    authApi
      .validarTokenRecuperacion(token)
      .then((res) => setPageState(res.ok ? 'valid' : 'invalid'))
      .catch(() => setPageState('invalid'))
  }, [token])

  const onSubmit = async ({ nueva_password, confirmar_password }: ResetForm) => {
    setServerError(null)
    try {
      await authApi.restablecerPassword(token, nueva_password, confirmar_password)
      setPageState('success')
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'No fue posible restablecer la contraseña. Intenta de nuevo.'
      setServerError(msg)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Image
            src="/logo cliniq.png"
            alt="CliniQ"
            width={120}
            height={40}
            className="object-contain"
          />
        </div>

        {pageState === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Verificando enlace...</p>
          </div>
        )}

        {pageState === 'invalid' && (
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <XCircle className="h-10 w-10 text-destructive" />
            <h1 className="text-lg font-semibold text-foreground">Enlace inválido o expirado</h1>
            <p className="text-sm text-muted-foreground">
              Este enlace de recuperación ya no es válido. Puedes solicitar uno nuevo desde el
              inicio de sesión.
            </p>
            <Button className="mt-2 w-full" onClick={() => router.replace('/login')}>
              Volver al inicio de sesión
            </Button>
          </div>
        )}

        {pageState === 'success' && (
          <div className="flex flex-col items-center gap-3 text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <h1 className="text-lg font-semibold text-foreground">Contraseña actualizada</h1>
            <p className="text-sm text-muted-foreground">
              Tu contraseña fue restablecida correctamente. Ya puedes iniciar sesión con tus
              nuevas credenciales.
            </p>
            <Button className="mt-2 w-full" onClick={() => router.replace('/login')}>
              Iniciar sesión
            </Button>
          </div>
        )}

        {pageState === 'valid' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground">Nueva contraseña</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Elige una contraseña segura de al menos 8 caracteres.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nueva_password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="nueva_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn('pr-10', errors.nueva_password && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('nueva_password')}
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
                {errors.nueva_password && (
                  <p className="text-xs text-destructive">{errors.nueva_password.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmar_password">Confirmar contraseña</Label>
                <div className="relative">
                  <Input
                    id="confirmar_password"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className={cn('pr-10', errors.confirmar_password && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('confirmar_password')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmar_password && (
                  <p className="text-xs text-destructive">{errors.confirmar_password.message}</p>
                )}
              </div>

              {serverError && (
                <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                  <p className="text-sm text-destructive">{serverError}</p>
                </div>
              )}

              <Button type="submit" className="w-full h-10 font-semibold" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar nueva contraseña'
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

export default function RestablecerPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <RestablecerPasswordContent />
    </Suspense>
  )
}

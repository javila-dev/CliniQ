'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, FileText, Users, Sparkles, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import { cn } from '@/lib/utils'
import { registroPublicoApi } from '@/lib/api/clinicas'

const schema = z.object({
  nombre_clinica: z.string().min(2, 'Mínimo 2 caracteres'),
  nit: z.string().min(5, 'NIT inválido'),
  nombre_admin: z.string().min(2, 'Mínimo 2 caracteres'),
  apellido_admin: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo inválido'),
  telefono: z.string().min(6, 'Teléfono requerido'),
})

type FormData = z.infer<typeof schema>

const features = [
  { icon: CalendarDays, label: 'Agenda inteligente', desc: 'Vistas día, semana y mes' },
  { icon: Users,        label: 'Gestión de pacientes', desc: 'Historial clínico completo' },
  { icon: FileText,     label: 'Consentimientos', desc: 'Firma digital y trazabilidad' },
  { icon: Sparkles,     label: '14 días gratis', desc: 'Sin tarjeta de crédito' },
]

export default function RegistroClinicaPage() {
  const [submitted, setSubmitted] = useState(false)
  const [confirmedEmail, setConfirmedEmail] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      const res = await registroPublicoApi.registrarClinica(data)
      setConfirmedEmail(res.email)
      setSubmitted(true)
    } catch (err: any) {
      const detail = err?.response?.data
      if (detail && typeof detail === 'object') {
        const firstKey = Object.keys(detail)[0]
        const msg = Array.isArray(detail[firstKey]) ? detail[firstKey][0] : detail[firstKey]
        setServerError(msg || 'Ocurrió un error. Intenta de nuevo.')
      } else {
        setServerError('Ocurrió un error. Intenta de nuevo.')
      }
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left panel: brand ── */}
      <div className="hidden lg:flex lg:w-[42%] xl:w-[45%] flex-col bg-[#1a1118] relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,72%,60%,0.20) 0%, transparent 65%)' }} />
        <div aria-hidden className="pointer-events-none absolute top-1/2 -left-16 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,55%,50%,0.12) 0%, transparent 68%)' }} />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-48 w-48 rounded-full"
          style={{ background: 'radial-gradient(circle, hsla(334,60%,55%,0.10) 0%, transparent 70%)' }} />

        <div className="relative flex flex-col h-full px-10 py-6">
          <div className="flex items-center justify-center">
            <Image src="/imagotipo cliniq.png" alt="CliniQ" width={350} height={350} className="object-contain brightness-[1.15]" />
          </div>

          <div className="flex-1 flex flex-col justify-center mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-400/70 mb-3">
              Prueba gratis por 14 días
            </p>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
              Tu clínica lista<br />para trabajar<br />
              <span className="text-rose-300">desde el día uno.</span>
            </h2>
            <p className="mt-4 text-sm text-white/40 leading-relaxed max-w-xs">
              Sin tarjeta de crédito. Cancela cuando quieras.
              Configura tu equipo y empieza a agendar en minutos.
            </p>

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

          <p className="text-[11px] text-white/20 mt-8">© {new Date().getFullYear()} CliniQ</p>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <Image src="/imagotipo cliniq.png" alt="CliniQ" width={100} height={100} className="object-contain" />
          </div>

          {submitted ? (
            <div className="flex flex-col items-center gap-4 text-center py-6">
              <div className="flex items-center justify-center h-14 w-14 rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Revisa tu correo</h1>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Enviamos un enlace de confirmación a{' '}
                <span className="font-semibold text-foreground">{confirmedEmail}</span>.
                Haz clic en el enlace para verificar tu dirección y activar tu cuenta.
              </p>
              <p className="text-xs text-muted-foreground">
                El enlace vence en 24 horas. Revisa también tu carpeta de spam.
              </p>
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver al login
              </Link>

              <div className="mb-7">
                <h1 className="text-2xl font-bold text-foreground">Crea tu clínica</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Empieza tu prueba gratuita de 14 días. Sin compromisos.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre_clinica">Nombre de la clínica</Label>
                  <Input
                    id="nombre_clinica"
                    placeholder="Clínica Estética Ejemplo"
                    className={cn(errors.nombre_clinica && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('nombre_clinica')}
                  />
                  {errors.nombre_clinica && <p className="text-xs text-destructive">{errors.nombre_clinica.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="nit">NIT</Label>
                  <Input
                    id="nit"
                    placeholder="900123456-7"
                    className={cn(errors.nit && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('nit')}
                  />
                  {errors.nit && <p className="text-xs text-destructive">{errors.nit.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="nombre_admin">Nombre</Label>
                    <Input
                      id="nombre_admin"
                      placeholder="Ana"
                      className={cn(errors.nombre_admin && 'border-destructive focus-visible:ring-destructive/30')}
                      {...register('nombre_admin')}
                    />
                    {errors.nombre_admin && <p className="text-xs text-destructive">{errors.nombre_admin.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="apellido_admin">Apellido</Label>
                    <Input
                      id="apellido_admin"
                      placeholder="García"
                      className={cn(errors.apellido_admin && 'border-destructive focus-visible:ring-destructive/30')}
                      {...register('apellido_admin')}
                    />
                    {errors.apellido_admin && <p className="text-xs text-destructive">{errors.apellido_admin.message}</p>}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="ana@miclinica.com"
                    autoComplete="email"
                    className={cn(errors.email && 'border-destructive focus-visible:ring-destructive/30')}
                    {...register('email')}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Controller
                    name="telefono"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput
                        id="telefono"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        error={!!errors.telefono}
                      />
                    )}
                  />
                  {errors.telefono && <p className="text-xs text-destructive">{errors.telefono.message}</p>}
                </div>

                {serverError && (
                  <div className="rounded-lg bg-destructive/8 border border-destructive/15 px-3.5 py-2.5">
                    <p className="text-sm text-destructive">{serverError}</p>
                  </div>
                )}

                <Button type="submit" className="w-full h-10 font-semibold mt-1" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear mi clínica gratis'
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground pt-1">
                  Al registrarte aceptas los{' '}
                  <span className="text-rose-500">términos de servicio</span> de CliniQ.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

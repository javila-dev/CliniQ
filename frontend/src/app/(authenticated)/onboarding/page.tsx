'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Building2, UserPlus, Stethoscope, Rocket, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { clinicasApi } from '@/lib/api/clinicas'
import { usuariosApi } from '@/lib/api/usuarios'
import { useAuthStore } from '@/store/authStore'

// ── Schemas ──────────────────────────────────────────────

const paso1Schema = z.object({
  telefono: z.string().min(7, 'Teléfono inválido'),
  direccion: z.string().min(5, 'Dirección requerida').optional().or(z.literal('')),
})

const paso2Schema = z.object({
  first_name: z.string().min(2, 'Nombre requerido'),
  last_name: z.string().min(2, 'Apellido requerido'),
  email: z.string().email('Correo inválido'),
  rol: z.literal('profesional'),
})

const paso3Schema = z.object({
  nombre: z.string().min(2, 'Nombre del servicio requerido'),
  duracion_min: z.string().min(1, 'Requerido'),
  precio: z.string().optional(),
})

type Paso1Data = z.infer<typeof paso1Schema>
type Paso2Data = z.infer<typeof paso2Schema>
type Paso3Data = z.infer<typeof paso3Schema>

// ── Step indicator ────────────────────────────────────────

const STEPS = [
  { icon: Building2,    label: 'Clínica' },
  { icon: UserPlus,     label: 'Profesional' },
  { icon: Stethoscope,  label: 'Servicio' },
  { icon: Rocket,       label: '¡Listo!' },
]

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              'flex items-center justify-center h-8 w-8 rounded-full text-xs font-semibold transition-colors',
              done  && 'bg-emerald-500 text-white',
              active && 'bg-rose-500 text-white ring-4 ring-rose-500/20',
              !done && !active && 'bg-muted text-muted-foreground',
            )}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn(
              'text-xs hidden sm:block',
              active ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-border" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Paso 1: Perfil de clínica ─────────────────────────────

function Paso1({ onNext }: { onNext: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Paso1Data>({
    resolver: zodResolver(paso1Schema),
  })

  const onSubmit = async (data: Paso1Data) => {
    setError(null)
    try {
      await clinicasApi.miClinicaUpdate({ telefono: data.telefono })
      onNext()
    } catch {
      setError('No se pudo guardar. Intenta de nuevo.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Completa el perfil de tu clínica</h2>
        <p className="text-sm text-muted-foreground mt-1">Solo los datos básicos para empezar.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telefono">Teléfono de contacto</Label>
        <Input
          id="telefono"
          placeholder="6012345678"
          className={cn(errors.telefono && 'border-destructive')}
          {...register('telefono')}
        />
        {errors.telefono && <p className="text-xs text-destructive">{errors.telefono.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="direccion">Dirección <span className="text-muted-foreground">(opcional)</span></Label>
        <Input id="direccion" placeholder="Calle 100 # 15-20" {...register('direccion')} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Guardando...</> : 'Continuar'}
      </Button>
    </form>
  )
}

// ── Paso 2: Primer profesional ────────────────────────────

function Paso2({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Paso2Data>({
    resolver: zodResolver(paso2Schema),
    defaultValues: { rol: 'profesional' },
  })

  const onSubmit = async (data: Paso2Data) => {
    setError(null)
    try {
      await usuariosApi.create({
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        password: '',
        rol: 'profesional',
      })
      onNext()
    } catch (err: any) {
      const detail = err?.response?.data
      if (detail?.email) setError(detail.email[0])
      else setError('No se pudo crear el profesional. Intenta de nuevo.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Agrega tu primer profesional</h2>
        <p className="text-sm text-muted-foreground mt-1">Recibirá un email para crear su contraseña.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Nombre</Label>
          <Input
            placeholder="Laura"
            className={cn(errors.first_name && 'border-destructive')}
            {...register('first_name')}
          />
          {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Apellido</Label>
          <Input
            placeholder="Ramírez"
            className={cn(errors.last_name && 'border-destructive')}
            {...register('last_name')}
          />
          {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Correo electrónico</Label>
        <Input
          type="email"
          placeholder="laura@miclinica.com"
          className={cn(errors.email && 'border-destructive')}
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onSkip}>
          Omitir por ahora
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : 'Continuar'}
        </Button>
      </div>
    </form>
  )
}

// ── Paso 3: Primer servicio ───────────────────────────────

function Paso3({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Paso3Data>({
    resolver: zodResolver(paso3Schema),
  })

  const onSubmit = async (data: Paso3Data) => {
    setError(null)
    const duracion = parseInt(data.duracion_min, 10)
    if (isNaN(duracion) || duracion < 5) {
      setError('La duración debe ser al menos 5 minutos.')
      return
    }
    try {
      await clinicasApi.servicios.create({
        nombre: data.nombre,
        duracion_min: duracion,
        precio: data.precio ? parseFloat(data.precio) : null,
        requiere_consentimiento: false,
      })
      onNext()
    } catch {
      setError('No se pudo crear el servicio. Intenta de nuevo.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Crea tu primer servicio</h2>
        <p className="text-sm text-muted-foreground mt-1">Podrás agregar más desde Configuración en cualquier momento.</p>
      </div>

      <div className="space-y-1.5">
        <Label>Nombre del servicio</Label>
        <Input
          placeholder="Limpieza facial profunda"
          className={cn(errors.nombre && 'border-destructive')}
          {...register('nombre')}
        />
        {errors.nombre && <p className="text-xs text-destructive">{errors.nombre.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Duración (minutos)</Label>
          <Input
            type="number"
            placeholder="60"
            className={cn(errors.duracion_min && 'border-destructive')}
            {...register('duracion_min')}
          />
          {errors.duracion_min && <p className="text-xs text-destructive">{errors.duracion_min.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Precio <span className="text-muted-foreground">(opcional)</span></Label>
          <Input type="number" placeholder="150000" {...register('precio')} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onSkip}>
          Omitir por ahora
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creando...</> : 'Continuar'}
        </Button>
      </div>
    </form>
  )
}

// ── Paso 4: Éxito ─────────────────────────────────────────

function Paso4({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 text-center py-4">
      <div className="flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/10 ring-4 ring-emerald-500/20">
        <Rocket className="h-8 w-8 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">¡Tu clínica está lista!</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-xs">
          Ya puedes agendar citas, gestionar pacientes y empezar a usar todas las funciones de CliniQ.
        </p>
      </div>
      <Button className="w-full max-w-xs mt-2" onClick={onFinish}>
        Ir al dashboard
      </Button>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────

export default function OnboardingPage() {
  const [step, setStep] = useState(0)
  const [completing, setCompleting] = useState(false)
  const router = useRouter()
  const { user } = useAuthStore()

  const markCompleted = async () => {
    if (!user?.clinica_id) return
    setCompleting(true)
    try {
      await clinicasApi.update(user.clinica_id, { onboarding_completado: true } as any)
    } catch {
      // non-blocking
    } finally {
      setCompleting(false)
    }
  }

  const handleFinish = async () => {
    await markCompleted()
    router.replace('/dashboard')
  }

  const next = () => setStep((s) => s + 1)

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-rose-500/70 mb-1">
            Configuración inicial
          </p>
          <h1 className="text-3xl font-bold text-foreground">Bienvenida a CliniQ</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Te tomará menos de 2 minutos dejarlo todo listo.
          </p>
        </div>

        <StepIndicator current={step} />

        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          {step === 0 && <Paso1 onNext={next} />}
          {step === 1 && <Paso2 onNext={next} onSkip={next} />}
          {step === 2 && <Paso3 onNext={next} onSkip={next} />}
          {step === 3 && <Paso4 onFinish={handleFinish} />}
        </div>

        {step < 3 && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Paso {step + 1} de 3 — Puedes completar el resto desde Configuración.
          </p>
        )}
      </div>
    </div>
  )
}

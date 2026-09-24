'use client'

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, CalendarDays, Check, IdCard, KeyRound, Mail, PenLine, Shield, UserRound, X } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { usuariosApi } from '@/lib/api/usuarios'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { HelpButton } from '@/components/ayuda/HelpButton'
import { CapturaFirmaProfesional } from '@/components/firma/CapturaFirmaProfesional'

const ROL_CONFIG: Record<string, { label: string; className: string }> = {
  superadmin:  { label: 'Super Admin',   className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  admin:       { label: 'Administrador', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
  profesional: { label: 'Profesional',   className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  recepcion:   { label: 'Recepción',     className: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
}

const datosSchema = z.object({
  first_name: z.string().trim().min(1, 'Requerido'),
  last_name: z.string().trim().min(1, 'Requerido'),
  telefono: z.string().optional(),
})
type Datos = z.infer<typeof datosSchema>

const passwordSchema = z.object({
  nueva_password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmar: z.string(),
}).refine(d => d.nueva_password === d.confirmar, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmar'],
})

function CardHeader({ icon: Icon, titulo, descripcion }: { icon: typeof Mail; titulo: string; descripcion?: string }) {
  return (
    <div className="flex items-start gap-3 px-6 py-4 border-b border-gray-100">
      <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-rose-500" />
      </div>
      <div>
        <h2 className="text-sm font-semibold leading-8">{titulo}</h2>
        {descripcion && <p className="text-xs text-muted-foreground -mt-1">{descripcion}</p>}
      </div>
    </div>
  )
}

function Campo({ label, error, children, className }: {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-medium text-gray-700">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function PerfilPage() {
  const { user, setUser } = useAuthStore()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [cambiandoFirma, setCambiandoFirma] = useState(false)
  const [firmaGuardada, setFirmaGuardada] = useState(false)

  const atiende = Boolean(user?.es_profesional || user?.es_admin)

  const datosForm = useForm<Datos>({
    resolver: zodResolver(datosSchema),
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      telefono: user?.telefono ?? '',
    },
  })

  const datosMut = useMutation({
    mutationFn: (data: Datos) =>
      authApi.updateMe({
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        telefono: data.telefono ?? '',
      }),
    onSuccess: updated => {
      setUser(updated)
      datosForm.reset({
        first_name: updated.first_name,
        last_name: updated.last_name,
        telefono: updated.telefono ?? '',
      })
    },
  })

  const passwordForm = useForm({ resolver: zodResolver(passwordSchema) })
  const passwordMut = useMutation({
    mutationFn: ({ nueva_password }: { nueva_password: string }) =>
      usuariosApi.cambiarPassword(user!.id, nueva_password),
    onSuccess: () => {
      passwordForm.reset()
      setPasswordOpen(false)
    },
  })

  const [tp, setTp] = useState(user?.registro_profesional ?? '')
  const tpMut = useMutation({
    mutationFn: () => authApi.updateMe({ registro_profesional: tp.trim() }),
    onSuccess: updated => { setUser(updated); setTp(updated.registro_profesional ?? '') },
  })

  const eliminarFirma = useMutation({
    mutationFn: () => authApi.updateMeProfesional({ firma_digital: null }),
    onSuccess: updated => setUser(updated),
  })

  // "Guardado" se muestra solo hasta el siguiente cambio.
  const { isDirty } = datosForm.formState
  useEffect(() => { if (isDirty) datosMut.reset() }, [isDirty]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null

  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() || '?'
  const rolCfg = ROL_CONFIG[user.rol ?? ''] ?? { label: user.rol ?? '', className: 'bg-gray-50 text-gray-700 ring-1 ring-gray-200' }
  const miembroDesde = user.created_at
    ? new Date(user.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'
  const errores = datosForm.formState.errors

  return (
    <div className="w-full max-w-6xl space-y-5">
      <div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-bold">Mi perfil</h1>
          <HelpButton slug="tu-perfil-y-la-seguridad-de-tu-cuenta" />
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">Tu información, tu contraseña y tu firma.</p>
      </div>

      {/* Identidad */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-400 flex items-center justify-center text-xl font-bold text-white shrink-0 select-none">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold leading-tight truncate">{user.nombre_completo}</p>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', rolCfg.className)}>
              <Shield className="h-3 w-3" />
              {rolCfg.label}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{user.email}</span></span>
            <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 shrink-0" />{user.clinica_nombre ?? '—'}</span>
            <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />Desde el {miembroDesde}</span>
          </div>
        </div>
      </div>

      <div className={cn('grid gap-5 items-start', atiende && 'lg:grid-cols-[3fr_2fr]')}>
        {/* Columna izquierda: información personal y contraseña */}
        <div className="space-y-5">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <CardHeader icon={UserRound} titulo="Información personal" />

          <form onSubmit={datosForm.handleSubmit(d => datosMut.mutate(d))} className="px-6 py-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo label="Nombre" error={errores.first_name?.message}>
                <Input {...datosForm.register('first_name')} className={cn(errores.first_name && 'border-red-400')} />
              </Campo>
              <Campo label="Apellido" error={errores.last_name?.message}>
                <Input {...datosForm.register('last_name')} className={cn(errores.last_name && 'border-red-400')} />
              </Campo>
              <Campo label="Teléfono">
                <Input placeholder="3001234567" inputMode="tel" {...datosForm.register('telefono')} />
              </Campo>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {datosMut.isError && <p className="text-xs text-red-600 mr-auto">No se pudieron guardar los cambios.</p>}
              {datosMut.isSuccess && !isDirty && (
                <p className="flex items-center gap-1 text-xs text-emerald-700 mr-auto">
                  <Check className="h-3.5 w-3.5" /> Cambios guardados
                </p>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={!isDirty || datosMut.isPending} onClick={() => datosForm.reset()}>
                Descartar
              </Button>
              <Button type="submit" size="sm" disabled={!isDirty || datosMut.isPending}>
                {datosMut.isPending ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>

        </div>

          {/* Contraseña */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Contraseña</p>
                {!passwordOpen && <p className="text-xs text-muted-foreground">••••••••••</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setPasswordOpen(v => !v); passwordForm.reset() }}
              >
                {passwordOpen ? 'Cancelar' : 'Cambiar'}
              </Button>
            </div>

            {passwordOpen && (
              <form onSubmit={passwordForm.handleSubmit(d => passwordMut.mutate(d))} className="mt-4 grid gap-4 sm:grid-cols-2">
                <Campo label="Nueva contraseña" error={passwordForm.formState.errors.nueva_password?.message}>
                  <Input type="password" placeholder="Mínimo 8 caracteres" {...passwordForm.register('nueva_password')} />
                </Campo>
                <Campo label="Confirmar contraseña" error={passwordForm.formState.errors.confirmar?.message}>
                  <Input type="password" placeholder="Repetir contraseña" {...passwordForm.register('confirmar')} />
                </Campo>
                <div className="sm:col-span-2 flex items-center justify-end gap-3">
                  {passwordMut.isError && <p className="text-xs text-red-600 mr-auto">No se pudo cambiar la contraseña.</p>}
                  <Button type="submit" size="sm" disabled={passwordMut.isPending}>
                    {passwordMut.isPending ? 'Guardando…' : 'Cambiar contraseña'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Columna derecha: firma y TP */}
        {atiende && (
        <div className="space-y-5">
        {/* Firma */}
        {atiende && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <CardHeader
              icon={PenLine}
              titulo="Firma"
              descripcion="Para los consentimientos que firmas como profesional y las órdenes médicas."
            />
            <div className="px-6 py-5 space-y-3">
              {user.firma_digital_url && !cambiandoFirma ? (
                <>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-center h-32">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={user.firma_digital_url} alt="Tu firma" className="max-h-full object-contain" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setCambiandoFirma(true)}>
                      Cambiar firma
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-red-50"
                      disabled={eliminarFirma.isPending}
                      onClick={() => eliminarFirma.mutate()}
                    >
                      <X className="h-3.5 w-3.5 mr-1" /> Eliminar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {!user.firma_digital_url && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Aún no tienes firma. Sin ella no podrás iniciar las atenciones que requieren tu firma.
                    </p>
                  )}
                  <CapturaFirmaProfesional
                    onGuardada={() => {
                      setCambiandoFirma(false)
                      setFirmaGuardada(true)
                      setTimeout(() => setFirmaGuardada(false), 2500)
                    }}
                  />
                  {cambiandoFirma && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setCambiandoFirma(false)}>
                      Cancelar
                    </Button>
                  )}
                </>
              )}
              {firmaGuardada && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700"><Check className="h-3.5 w-3.5" /> Firma guardada</p>
              )}
              {eliminarFirma.isError && <p className="text-xs text-red-600">No se pudo eliminar la firma.</p>}
            </div>
          </div>
        )}

        {/* Tarjeta profesional */}
        {atiende && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
            <CardHeader
              icon={IdCard}
              titulo="Tarjeta profesional"
              descripcion="Solo si aplica. La piden los consentimientos de procedimientos que la exigen."
            />
            <form
              onSubmit={e => { e.preventDefault(); tpMut.mutate() }}
              className="px-6 py-5 flex gap-2"
            >
              <Input placeholder="TP-12345" value={tp} onChange={e => { setTp(e.target.value); tpMut.reset() }} />
              <Button type="submit" size="sm" className="shrink-0" disabled={tp.trim() === (user.registro_profesional ?? '') || tpMut.isPending}>
                {tpMut.isPending ? 'Guardando…' : tpMut.isSuccess ? <><Check className="h-3.5 w-3.5 mr-1" />Guardado</> : 'Guardar'}
              </Button>
            </form>
            {tpMut.isError && <p className="px-6 pb-4 -mt-2 text-xs text-red-600">No se pudo guardar la tarjeta profesional.</p>}
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  )
}

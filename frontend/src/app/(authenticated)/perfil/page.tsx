'use client'

import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Shield, Phone, Mail, Building2, CalendarDays, KeyRound, Check, Stethoscope, Upload, X, UserPen, Palette } from 'lucide-react'
import { authApi } from '@/lib/api/auth'
import { usuariosApi } from '@/lib/api/usuarios'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'
import { PALETTES } from '@/lib/themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const ROL_CONFIG: Record<string, { label: string; className: string }> = {
  superadmin:  { label: 'Super Admin',   className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  admin:       { label: 'Administrador', className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' },
  profesional: { label: 'Profesional',   className: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
  recepcion:   { label: 'Recepción',     className: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
}

const nombreSchema = z.object({
  first_name: z.string().min(1, 'Requerido'),
  last_name:  z.string().min(1, 'Requerido'),
})

const telefonoSchema = z.object({
  telefono: z.string().optional(),
})

const passwordSchema = z.object({
  nueva_password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmar:      z.string(),
}).refine(d => d.nueva_password === d.confirmar, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmar'],
})

export default function PerfilPage() {
  const { user, setUser } = useAuthStore()
  const { paletteId, setPalette } = useThemeStore()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [firmaPreview, setFirmaPreview] = useState<string | null>(user?.firma_digital_url ?? null)
  const [firmaFile, setFirmaFile] = useState<File | null>(null)
  const [firmaGuardada, setFirmaGuardada] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [registroProfesional, setRegistroProfesional] = useState(user?.registro_profesional ?? '')

  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '?'

  const rolCfg = ROL_CONFIG[user?.rol ?? ''] ?? {
    label: user?.rol ?? '',
    className: 'bg-gray-50 text-gray-600 ring-1 ring-gray-200',
  }

  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  const nombreForm = useForm({
    resolver: zodResolver(nombreSchema),
    defaultValues: { first_name: user?.first_name ?? '', last_name: user?.last_name ?? '' },
  })

  const nombreMut = useMutation({
    mutationFn: (data: { first_name: string; last_name: string }) =>
      usuariosApi.update(user!.id, data),
    onSuccess: (updated) => {
      setUser({ ...user!, first_name: updated.first_name, last_name: updated.last_name, nombre_completo: updated.nombre_completo })
      nombreForm.reset({ first_name: updated.first_name, last_name: updated.last_name })
    },
  })

  const telefonoForm = useForm({
    resolver: zodResolver(telefonoSchema),
    defaultValues: { telefono: user?.telefono ?? '' },
  })

  const telefonoMut = useMutation({
    mutationFn: (data: { telefono?: string }) => authApi.updateMe(data),
    onSuccess: (updated) => {
      setUser(updated)
      telefonoForm.reset({ telefono: updated.telefono ?? '' })
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

  const profesionalMut = useMutation({
    mutationFn: (data: { firma_digital?: File | null; registro_profesional?: string }) =>
      authApi.updateMeProfesional(data),
    onSuccess: (updated) => {
      setUser(updated)
      setFirmaFile(null)
      setFirmaPreview(updated.firma_digital_url)
      setRegistroProfesional(updated.registro_profesional ?? '')
      setFirmaGuardada(true)
      setTimeout(() => setFirmaGuardada(false), 2500)
    },
  })

  if (!user) return null

  return (
    <div className="w-full space-y-5">
      <div>
        <h1 className="text-xl font-bold">Mi perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Información de tu cuenta y preferencias</p>
      </div>

      {/* ── Grid principal: identidad + cards de edición ── */}
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">

        {/* Tarjeta de identidad — ocupa toda la altura del grid */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
          <div className="relative rounded-t-xl overflow-hidden bg-gradient-to-br from-rose-500 via-rose-400 to-pink-300 px-6 py-6 shrink-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_55%)]" aria-hidden />
            <div className="relative flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm ring-2 ring-white/40 flex items-center justify-center text-2xl font-bold text-white shrink-0 select-none">
                {initials}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">{user.nombre_completo}</h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-1.5 bg-white/20 text-white ring-1 ring-white/30">
                  <Shield className="h-3 w-3" />
                  {rolCfg.label}
                </span>
              </div>
            </div>
          </div>

          {/* Info items — se distribuyen para llenar el espacio restante */}
          <div className="flex-1 flex flex-col justify-around divide-y divide-gray-100">
            <div className="flex items-center gap-3 px-5 py-4">
              <Mail className="h-4 w-4 text-rose-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Correo electrónico</p>
                <p className="text-sm font-medium truncate">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <Building2 className="h-4 w-4 text-rose-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Clínica</p>
                <p className="text-sm font-medium truncate">{user.clinica_nombre ?? '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <CalendarDays className="h-4 w-4 text-rose-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Miembro desde</p>
                <p className="text-sm font-medium">{joinedDate}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: 3 cards que juntas igualan la altura de la identidad */}
        <div className="flex flex-col gap-3">

          {/* Nombre y apellido */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                <UserPen className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <h3 className="text-sm font-semibold">Nombre y apellido</h3>
            </div>
            <form onSubmit={nombreForm.handleSubmit(d => nombreMut.mutate(d))} className="flex flex-col gap-2.5 flex-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nombre</Label>
                  <Input
                    placeholder="Juan"
                    {...nombreForm.register('first_name')}
                    className={cn(nombreForm.formState.errors.first_name && 'border-red-400')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Apellido</Label>
                  <Input
                    placeholder="Pérez"
                    {...nombreForm.register('last_name')}
                    className={cn(nombreForm.formState.errors.last_name && 'border-red-400')}
                  />
                </div>
              </div>
              <div className="mt-auto">
                <Button type="submit" size="sm" className="w-full" disabled={nombreMut.isPending || !nombreForm.formState.isDirty}>
                  {nombreMut.isSuccess && !nombreForm.formState.isDirty
                    ? <><Check className="h-3.5 w-3.5 mr-1.5" />Guardado</>
                    : nombreMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
                {nombreMut.isError && <p className="text-xs text-red-500 mt-1.5">No se pudo guardar.</p>}
              </div>
            </form>
          </div>

          {/* Teléfono */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                <Phone className="h-3.5 w-3.5 text-rose-500" />
              </div>
              <h3 className="text-sm font-semibold">Teléfono</h3>
            </div>
            <form onSubmit={telefonoForm.handleSubmit(d => telefonoMut.mutate(d))} className="flex flex-col gap-2.5 flex-1">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Número de contacto</Label>
                <Input placeholder="3001234567" {...telefonoForm.register('telefono')} />
              </div>
              <div className="mt-auto">
                <Button type="submit" size="sm" className="w-full" disabled={telefonoMut.isPending || !telefonoForm.formState.isDirty}>
                  {telefonoMut.isSuccess && !telefonoForm.formState.isDirty
                    ? <><Check className="h-3.5 w-3.5 mr-1.5" />Guardado</>
                    : telefonoMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
                {telefonoMut.isError && <p className="text-xs text-red-500 mt-1.5">No se pudo guardar.</p>}
              </div>
            </form>
          </div>

          {/* Contraseña */}
          <div className="flex-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
                  <KeyRound className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <h3 className="text-sm font-semibold">Contraseña</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                onClick={() => { setPasswordOpen(v => !v); passwordForm.reset() }}
              >
                {passwordOpen ? 'Cancelar' : 'Cambiar'}
              </Button>
            </div>

            {!passwordOpen && (
              <p className="text-xs text-muted-foreground mt-2 ml-10">••••••••••••</p>
            )}

            {passwordOpen && (
              <form onSubmit={passwordForm.handleSubmit(d => passwordMut.mutate(d))} className="mt-3 flex flex-col gap-2.5 flex-1">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nueva contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    {...passwordForm.register('nueva_password')}
                    className={cn(passwordForm.formState.errors.nueva_password && 'border-red-400')}
                  />
                  {passwordForm.formState.errors.nueva_password && (
                    <p className="text-xs text-red-500">{passwordForm.formState.errors.nueva_password.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Confirmar contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Repetir contraseña"
                    {...passwordForm.register('confirmar')}
                    className={cn(passwordForm.formState.errors.confirmar && 'border-red-400')}
                  />
                  {passwordForm.formState.errors.confirmar && (
                    <p className="text-xs text-red-500">{passwordForm.formState.errors.confirmar.message}</p>
                  )}
                </div>
                <div className="mt-auto">
                  <Button type="submit" size="sm" disabled={passwordMut.isPending} className="w-full">
                    {passwordMut.isPending ? 'Guardando…' : 'Cambiar contraseña'}
                  </Button>
                  {passwordMut.isError && <p className="text-xs text-red-500 mt-1.5">No se pudo cambiar la contraseña.</p>}
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* ── Apariencia ── */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Palette className="h-3.5 w-3.5 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">Apariencia</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4 ml-10">Elige el color de acento de la interfaz. Se guarda solo en este navegador.</p>
        <div className="flex flex-wrap gap-4 ml-10">
          {PALETTES.map(p => (
            <button
              key={p.id}
              title={p.label}
              onClick={() => setPalette(p.id)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span
                className="h-9 w-9 rounded-full block transition-transform group-hover:scale-110"
                style={{
                  backgroundColor: p.swatch,
                  outline: paletteId === p.id ? `3px solid ${p.swatch}` : '3px solid transparent',
                  outlineOffset: '2px',
                }}
              >
                {paletteId === p.id && (
                  <span className="flex h-full items-center justify-center">
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cn(
                'text-[10px] transition-colors',
                paletteId === p.id ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Datos profesionales ── */}
      {user.es_profesional && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Stethoscope className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold">Datos profesionales</h3>
          </div>

          <div className="p-6 grid gap-8 sm:grid-cols-2">
            {/* Registro profesional */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Registro profesional</p>
              <p className="text-xs text-muted-foreground">Número de tarjeta profesional o registro habilitante.</p>
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="TP-12345"
                  value={registroProfesional}
                  onChange={e => setRegistroProfesional(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={profesionalMut.isPending || registroProfesional === (user.registro_profesional ?? '')}
                  onClick={() => profesionalMut.mutate({ registro_profesional: registroProfesional })}
                >
                  {profesionalMut.isSuccess && registroProfesional === (user.registro_profesional ?? '')
                    ? <><Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />Guardado</>
                    : profesionalMut.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>

            {/* Firma digital */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firma digital</p>
              <p className="text-xs text-muted-foreground">Se incrustará en las órdenes médicas generadas en PDF.</p>

              <div className="pt-1">
                {firmaPreview ? (
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 flex-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={firmaPreview} alt="Firma digital" className="max-h-20 object-contain mx-auto" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-destructive hover:text-destructive hover:bg-red-50 h-8 shrink-0"
                      disabled={profesionalMut.isPending}
                      onClick={() => {
                        setFirmaPreview(null)
                        setFirmaFile(null)
                        profesionalMut.mutate({ firma_digital: null })
                      }}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Eliminar
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 p-5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
                    onClick={() => fileRef.current?.click()}
                  >
                    <div className="h-9 w-9 rounded-full bg-white shadow-sm flex items-center justify-center mb-2 group-hover:shadow-md transition-shadow">
                      <Upload className="h-4 w-4 text-blue-400" />
                    </div>
                    <p className="text-xs font-medium text-gray-600">Subir firma</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">JPEG, PNG o WEBP</p>
                  </div>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setFirmaFile(file)
                  setFirmaPreview(URL.createObjectURL(file))
                  e.target.value = ''
                }}
              />

              {firmaFile && (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={profesionalMut.isPending}
                  onClick={() => profesionalMut.mutate({ firma_digital: firmaFile })}
                >
                  {firmaGuardada
                    ? <><Check className="h-3.5 w-3.5 mr-1.5" />Guardado</>
                    : profesionalMut.isPending ? 'Subiendo…' : 'Guardar firma'}
                </Button>
              )}

              {profesionalMut.isError && (
                <p className="text-xs text-red-500">No se pudo guardar. Intenta de nuevo.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft, Building2, Users, MapPin, Crown, Mail, Copy, Check, AlertCircle,
  Sparkles, LogIn, History, ChevronLeft, ChevronRight, Power,
} from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { usuariosApi } from '@/lib/api/usuarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useSuperadminClinicaStore } from '@/store/superadminClinicaStore'
import type { AdminTenant, AdminTenantUsuario, AdminTenantHistorialGrupo } from '@/types/admin'
import {
  serverErrorMessage, ESTADO_BADGE, HISTORIAL_PAGE_SIZE, HISTORIAL_GRUPOS, HistorialFila,
} from '../_shared'

// ─── Schema del formulario "General" ──────────────────────────

const generalSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  nit:      z.string().optional(),
  email:    z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  plan:     z.string().optional(),
})
type GeneralFormValues = z.infer<typeof generalSchema>

// ─── Dialog reenviar invitación ────────────────────────────────

type InvitacionResult = { ok: boolean; url: string; email_enviado: boolean }

function InvitacionDialog({
  usuario, open, onClose,
}: {
  usuario: { id: string; email: string } | null
  open: boolean
  onClose: () => void
}) {
  const [result, setResult] = useState<InvitacionResult | null>(null)
  const [copied, setCopied]   = useState(false)

  const mutation = useMutation({
    mutationFn: () => usuariosApi.reenviarInvitacion(usuario!.id),
    onSuccess: (data) => setResult(data),
  })

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => { setResult(null); setCopied(false); mutation.reset(); onClose() }

  const isAlreadyActivated =
    mutation.isError &&
    (mutation.error as any)?.response?.data?.code === 'USER_ALREADY_ACTIVATED'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar invitación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                Se generará un nuevo link de activación para{' '}
                <span className="font-medium text-foreground">{usuario?.email}</span>.
                El link anterior quedará invalidado.
              </p>

              {isAlreadyActivated ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">Este usuario ya activó su cuenta y puede iniciar sesión.</p>
                </div>
              ) : mutation.isError ? (
                <p className="text-sm text-red-500">Error al generar el link. Intenta de nuevo.</p>
              ) : null}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={mutation.isPending || isAlreadyActivated}
                  onClick={() => mutation.mutate()}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {mutation.isPending ? 'Generando…' : 'Generar y enviar'}
                </Button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              {result.email_enviado ? (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700">
                    Email enviado a <span className="font-medium">{usuario?.email}</span>.
                    Si no llega, comparte el link manualmente.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    El email no se envió (servidor de correo no configurado). Copia el link y compártelo manualmente.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Link de activación</p>
                <div className="flex items-center gap-2 rounded-lg border bg-gray-50 p-2.5">
                  <p className="text-xs text-muted-foreground flex-1 truncate font-mono">{result.url}</p>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 px-2 gap-1.5" onClick={handleCopy}>
                    {copied
                      ? <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-600">Copiado</span></>
                      : <><Copy className="h-3.5 w-3.5" /><span className="text-xs">Copiar</span></>}
                  </Button>
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={handleClose}>Cerrar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Dialog crear administrador (tenant huérfano) ─────────────

function CrearAdminDialog({
  tenant, open, onClose,
}: {
  tenant: AdminTenant | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [email, setEmail]   = useState('')
  const [result, setResult] = useState<{ url: string; email_enviado: boolean; email: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const mutation = useMutation({
    mutationFn: () => adminApi.tenants.crearAdmin(tenant!.id, email.trim()),
    onSuccess: (data) => {
      setResult({ url: data.url, email_enviado: data.email_enviado, email: data.usuario.email })
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenant?.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
  })

  const handleClose = () => { setEmail(''); setResult(null); setCopied(false); mutation.reset(); onClose() }
  const handleCopy  = () => {
    if (!result) return
    navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear administrador</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!result && (
            <>
              <p className="text-sm text-muted-foreground">
                La clínica <span className="font-medium text-foreground">{tenant?.nombre}</span> no tiene
                ningún usuario administrador. Ingresa un email para crearlo y enviarle la invitación de
                activación.
              </p>
              <div className="space-y-1.5">
                <Label>Email del administrador</Label>
                <Input
                  type="email"
                  placeholder="admin@clinica.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              {mutation.isError && (
                <p className="text-sm text-red-500">
                  {serverErrorMessage(mutation.error) ?? 'No se pudo crear el administrador.'}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={!emailValido || mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {mutation.isPending ? 'Creando…' : 'Crear y enviar'}
                </Button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-4">
              {result.email_enviado ? (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                  <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700">
                    Administrador <span className="font-medium">{result.email}</span> creado. Email de
                    invitación enviado.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    Administrador <span className="font-medium">{result.email}</span> creado. El email no
                    se envió (servidor de correo no configurado); copia el link y compártelo.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Link de activación</p>
                <div className="flex items-center gap-2 rounded-lg border bg-gray-50 p-2.5">
                  <p className="text-xs text-muted-foreground flex-1 truncate font-mono">{result.url}</p>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 px-2 gap-1.5" onClick={handleCopy}>
                    {copied
                      ? <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-600">Copiado</span></>
                      : <><Copy className="h-3.5 w-3.5" /><span className="text-xs">Copiar</span></>}
                  </Button>
                </div>
              </div>

              <Button className="w-full" variant="outline" onClick={handleClose}>Cerrar</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Control de anulación de addon (hereda del plan / forzar sí / forzar no) ──

function AddonOverrideRow({
  label,
  descripcion,
  defaultDelPlan,
  value,
  onChange,
}: {
  label: string
  descripcion: string
  defaultDelPlan: boolean
  value: boolean | null
  onChange: (v: boolean | null) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{descripcion}</p>
      </div>
      <Select
        value={value === null ? '__plan__' : String(value)}
        onValueChange={v => onChange(v === '__plan__' ? null : v === 'true')}
      >
        <SelectTrigger className="w-56 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__plan__">Según el plan ({defaultDelPlan ? 'incluido' : 'no incluido'})</SelectItem>
          <SelectItem value="true">Forzar activado</SelectItem>
          <SelectItem value="false">Forzar desactivado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ─── Tab: General (datos + add-ons, editable inline) ──────────

function GeneralTab({ tenant }: { tenant: AdminTenant }) {
  const qc = useQueryClient()

  const { data: planesData } = useQuery({
    queryKey: ['admin-planes'],
    queryFn: () => adminApi.planes.list(),
  })
  const planes = planesData?.results ?? []

  const { register, handleSubmit, setValue, watch, formState: { errors, isDirty } } = useForm<GeneralFormValues>({
    resolver: zodResolver(generalSchema),
    values: {
      nombre:   tenant.nombre,
      nit:      tenant.nit ?? '',
      email:    tenant.email ?? '',
      telefono: tenant.telefono ?? '',
      plan:     tenant.plan?.id ?? '',
    },
  })
  const planValue = watch('plan')

  const [facialOverride, setFacialOverride]         = useState<boolean | null>(tenant.facial_verificacion_override)
  const [esteticoOverride, setEsteticoOverride]     = useState<boolean | null>(tenant.modulo_estetico_override)
  const [obesidadOverride, setObesidadOverride]     = useState<boolean | null>(tenant.modulo_obesidad_override)
  const [otpOverride, setOtpOverride]               = useState<boolean | null>(tenant.otp_checkin_override)
  const [puestaEnMarcha, setPuestaEnMarcha]         = useState(tenant.modo_puesta_en_marcha)

  useEffect(() => {
    setFacialOverride(tenant.facial_verificacion_override)
    setEsteticoOverride(tenant.modulo_estetico_override)
    setObesidadOverride(tenant.modulo_obesidad_override)
    setOtpOverride(tenant.otp_checkin_override)
    setPuestaEnMarcha(tenant.modo_puesta_en_marcha)
  }, [tenant.id, tenant.facial_verificacion_override, tenant.modulo_estetico_override, tenant.modulo_obesidad_override, tenant.otp_checkin_override, tenant.modo_puesta_en_marcha])

  const addonsDirty =
    facialOverride   !== tenant.facial_verificacion_override ||
    esteticoOverride !== tenant.modulo_estetico_override ||
    obesidadOverride !== tenant.modulo_obesidad_override ||
    otpOverride      !== tenant.otp_checkin_override ||
    puestaEnMarcha   !== tenant.modo_puesta_en_marcha

  const mutation = useMutation({
    mutationFn: (data: GeneralFormValues) => adminApi.tenants.update(tenant.id, {
      nombre:   data.nombre,
      nit:      data.nit || undefined,
      email:    data.email || undefined,
      telefono: data.telefono || undefined,
      plan:     data.plan || undefined,
      facial_verificacion_override: facialOverride,
      modulo_estetico_override: esteticoOverride,
      modulo_obesidad_override: obesidadOverride,
      otp_checkin_override: otpOverride,
      modo_puesta_en_marcha: puestaEnMarcha,
    }),
    onSuccess: (data) => {
      qc.setQueryData(['admin-tenant', tenant.id], data)
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
    },
  })

  const hayCambios = isDirty || addonsDirty
  const planSeleccionado = planes.find(p => p.id === planValue)

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="max-w-2xl space-y-6">
      <div className="rounded-xl border bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Datos de la clínica</h3>

        <div className="space-y-1.5">
          <Label>Nombre *</Label>
          <Input placeholder="Clínica Ejemplo" {...register('nombre')} className={cn(errors.nombre && 'border-red-400')} />
          {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>NIT</Label>
            <Input placeholder="900123456-1" {...register('nit')} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input placeholder="3001234567" {...register('telefono')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" placeholder="admin@clinica.com" {...register('email')} className={cn(errors.email && 'border-red-400')} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Plan</Label>
          <Select value={planValue ?? ''} onValueChange={v => setValue('plan', v === '__none__' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Sin plan asignado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sin plan</SelectItem>
              {planes.filter(p => p.activo).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-5 space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 mb-1">
          <Sparkles className="h-3.5 w-3.5" />
          Add-ons
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Vienen del plan «{planSeleccionado?.nombre ?? 'sin plan'}». Anula uno puntual acá solo
          si esta clínica necesita algo distinto a su plan.
        </p>

        <AddonOverrideRow
          label="Verificación facial biométrica"
          descripcion="Permite comparar la identidad del paciente con su foto de control en cada cita."
          defaultDelPlan={planSeleccionado?.facial_verificacion_habilitada ?? false}
          value={facialOverride}
          onChange={setFacialOverride}
        />

        <div className="border-t border-violet-100" />

        <AddonOverrideRow
          label="Módulo estético"
          descripcion="Procedimientos, zonas corporales, diagramas y notas clínicas estéticas."
          defaultDelPlan={planSeleccionado?.modulo_estetico_habilitado ?? false}
          value={esteticoOverride}
          onChange={setEsteticoOverride}
        />

        <div className="border-t border-violet-100" />

        <AddonOverrideRow
          label="Módulo obesidad"
          descripcion="Tratamientos, sesiones de seguimiento y control de peso."
          defaultDelPlan={planSeleccionado?.modulo_obesidad_habilitado ?? false}
          value={obesidadOverride}
          onChange={setObesidadOverride}
        />

        <div className="border-t border-violet-100" />

        <AddonOverrideRow
          label="Check-in por OTP (WhatsApp)"
          descripcion="Verificación de llegada del paciente por código de WhatsApp, con foto de respaldo."
          defaultDelPlan={planSeleccionado?.otp_checkin_habilitado ?? false}
          value={otpOverride}
          onChange={setOtpOverride}
        />

        <div className="border-t border-violet-100" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Modo puesta en marcha</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Habilita el asistente para cargar pacientes en curso y saldos previos mientras la
              clínica migra sus datos. Apágalo cuando termine.
            </p>
          </div>
          <Switch checked={puestaEnMarcha} onCheckedChange={setPuestaEnMarcha} />
        </div>
      </div>

      {mutation.isError && (
        <p className="text-sm text-red-500">
          {serverErrorMessage(mutation.error) ?? 'Error al guardar. Intenta de nuevo.'}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!hayCambios || mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
        {mutation.isSuccess && !hayCambios && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Check className="h-3.5 w-3.5" /> Guardado
          </span>
        )}
      </div>
    </form>
  )
}

// ─── Tab: Usuarios ─────────────────────────────────────────────

function UsuariosTab({ tenant }: { tenant: AdminTenant }) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant-usuarios', tenant.id],
    queryFn:  () => adminApi.tenants.usuarios(tenant.id),
  })
  const usuarios = data ?? []

  const [target, setTarget] = useState<AdminTenantUsuario | null>(null)
  const accion: 'activar' | 'desactivar' = target?.activo ? 'desactivar' : 'activar'

  const mutation = useMutation({
    mutationFn: () =>
      accion === 'activar' ? usuariosApi.activar(target!.id) : usuariosApi.desactivar(target!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant-usuarios', tenant.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['admin-tenant', tenant.id] })
      setTarget(null)
    },
  })

  return (
    <div>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-red-500">No se pudo cargar el listado de usuarios.</p>
      ) : usuarios.length === 0 ? (
        <div className="py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Esta clínica todavía no tiene usuarios.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último acceso</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell>
                    <p className="font-medium text-sm leading-tight">
                      {u.nombre_completo?.trim() || u.email}
                    </p>
                    {u.nombre_completo?.trim() && (
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.rol_nombre}</TableCell>
                  <TableCell>
                    <Badge variant={ESTADO_BADGE[u.estado].variant}>
                      {ESTADO_BADGE[u.estado].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.last_login
                      ? new Date(u.last_login).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
                      : <span className="text-gray-300">Nunca</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={u.activo ? 'outline' : 'default'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setTarget(u)}
                    >
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {mutation.isError && (
        <p className="mt-3 text-sm text-red-500">
          {serverErrorMessage(mutation.error) ?? 'No se pudo aplicar el cambio.'}
        </p>
      )}

      <ConfirmDialog
        open={!!target}
        onOpenChange={v => { if (!v && !mutation.isPending) { setTarget(null); mutation.reset() } }}
        title={accion === 'activar' ? 'Activar usuario' : 'Desactivar usuario'}
        description={
          target
            ? accion === 'activar'
              ? `Se reactivará el acceso de ${target.nombre_completo?.trim() || target.email} a la clínica.`
              : `${target.nombre_completo?.trim() || target.email} perderá el acceso a la clínica hasta que se reactive.`
            : undefined
        }
        confirmLabel={accion === 'activar' ? 'Activar' : 'Desactivar'}
        variant={accion === 'desactivar' ? 'destructive' : 'default'}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </div>
  )
}

// ─── Tab: Historial de acciones ────────────────────────────────

function HistorialTab({ tenant }: { tenant: AdminTenant }) {
  const [grupo, setGrupo] = useState<AdminTenantHistorialGrupo>('gestion')
  const [page, setPage]   = useState(1)

  useEffect(() => { setPage(1) }, [grupo])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant-historial', tenant.id, grupo, page],
    queryFn:  () => adminApi.tenants.historial(tenant.id, { grupo, page }),
    placeholderData: (prev) => prev,
  })

  const eventos      = data?.results ?? []
  const total        = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / HISTORIAL_PAGE_SIZE))

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex rounded-lg border bg-white overflow-hidden">
          {HISTORIAL_GRUPOS.map(g => (
            <button
              key={g.key}
              onClick={() => setGrupo(g.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                grupo === g.key
                  ? 'bg-rose-500 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-gray-50',
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {isLoading ? 'Cargando…' : `${total} evento${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border bg-white">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-red-500">No se pudo cargar el historial.</p>
        ) : eventos.length === 0 ? (
          <div className="py-16 text-center">
            <History className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Sin acciones registradas en esta vista.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {eventos.map(ev => (
              <HistorialFila key={ev.id} evento={ev} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between pt-3">
        <span className="text-xs text-muted-foreground">Página {page} de {totalPaginas}</span>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Anteriores
          </Button>
          <Button
            variant="outline" size="sm"
            disabled={!data?.next || isLoading}
            onClick={() => setPage(p => p + 1)}
          >
            Siguientes
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const qc = useQueryClient()
  const { entrarClinica } = useSuperadminClinicaStore()

  const [crearAdminOpen, setCrearAdminOpen] = useState(false)
  const [invitacionOpen, setInvitacionOpen] = useState(false)
  const [toggleOpen, setToggleOpen]         = useState(false)

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn:  () => adminApi.tenants.get(id),
    enabled:  !!id,
  })

  const toggleMutation = useMutation({
    mutationFn: () => adminApi.tenants.update(id, { activo: !tenant!.activo }),
    onSuccess: (data) => {
      qc.setQueryData(['admin-tenant', id], data)
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setToggleOpen(false)
    },
  })

  const handleEntrar = () => {
    if (!tenant) return
    entrarClinica({ id: tenant.id, nombre: tenant.nombre, logo: null })
    router.push('/dashboard')
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 rounded bg-gray-100 animate-pulse" />
        <div className="h-24 rounded-xl bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (isError || !tenant) {
    return (
      <div className="py-16 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No se pudo cargar esta clínica.</p>
        <Link href="/console/clinicas" className="mt-3 inline-block text-sm text-rose-600 hover:underline">
          Volver al listado
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link
        href="/console/clinicas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Clínicas
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
            tenant.activo ? 'bg-rose-50' : 'bg-gray-100',
          )}>
            <Building2 className={cn('h-5 w-5', tenant.activo ? 'text-rose-500' : 'text-gray-400')} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{tenant.nombre}</h1>
              <Badge variant={tenant.activo ? 'success' : 'muted'}>
                {tenant.activo ? 'Activa' : 'Inactiva'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tenant.nit ? `NIT ${tenant.nit} · ` : ''}
              {tenant.email ?? 'Sin email registrado'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleEntrar}>
            <LogIn className="h-4 w-4 mr-1.5" />
            Entrar como clínica
          </Button>
          <Button
            variant="outline"
            className={tenant.activo ? 'text-red-600 hover:text-red-600' : 'text-green-600 hover:text-green-600'}
            onClick={() => setToggleOpen(true)}
          >
            <Power className="h-4 w-4 mr-1.5" />
            {tenant.activo ? 'Inactivar' : 'Activar'}
          </Button>
        </div>
      </div>

      {/* Avisos */}
      {tenant.sin_admin && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-amber-700">Esta clínica no tiene ningún usuario administrador.</p>
          </div>
          <Button size="sm" onClick={() => setCrearAdminOpen(true)} className="shrink-0">
            Crear administrador
          </Button>
        </div>
      )}
      {tenant.admin_usuario_pendiente && (
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3">
          <div className="flex items-start gap-2">
            <Mail className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              El administrador <span className="font-medium text-foreground">{tenant.admin_usuario_pendiente.email}</span> aún no activó su cuenta.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setInvitacionOpen(true)} className="shrink-0">
            Reenviar invitación
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-white p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Plan</p>
          <div className="flex items-center gap-1.5 mt-1">
            {tenant.plan ? (
              <>
                <Crown className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-semibold">{tenant.plan.nombre}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Sin plan</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Usuarios</p>
          <div className="flex items-center gap-1.5 mt-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={cn(
              'text-sm font-semibold',
              tenant.plan && tenant.plan.max_usuarios > 0 && tenant.usuarios_activos >= tenant.plan.max_usuarios && 'text-amber-600',
            )}>
              {tenant.usuarios_activos}
            </span>
            <span className="text-sm text-muted-foreground">
              / {tenant.plan && tenant.plan.max_usuarios > 0 ? tenant.plan.max_usuarios : '∞'}
            </span>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Sedes</p>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold">{tenant.total_sedes}</span>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-3.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Creada</p>
          <p className="text-sm font-semibold mt-1">
            {new Date(tenant.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-4">
          <GeneralTab tenant={tenant} />
        </TabsContent>
        <TabsContent value="usuarios" className="pt-4">
          <UsuariosTab tenant={tenant} />
        </TabsContent>
        <TabsContent value="historial" className="pt-4">
          <HistorialTab tenant={tenant} />
        </TabsContent>
      </Tabs>

      <CrearAdminDialog tenant={tenant} open={crearAdminOpen} onClose={() => setCrearAdminOpen(false)} />
      <InvitacionDialog
        usuario={tenant.admin_usuario_pendiente}
        open={invitacionOpen}
        onClose={() => setInvitacionOpen(false)}
      />
      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={v => { if (!v && !toggleMutation.isPending) setToggleOpen(false) }}
        title={tenant.activo ? 'Inactivar clínica' : 'Activar clínica'}
        description={
          tenant.activo
            ? `Los usuarios de ${tenant.nombre} no podrán iniciar sesión mientras la clínica esté inactiva.`
            : `Se restablecerá el acceso de los usuarios de ${tenant.nombre}.`
        }
        confirmLabel={tenant.activo ? 'Inactivar' : 'Activar'}
        variant={tenant.activo ? 'destructive' : 'default'}
        loading={toggleMutation.isPending}
        onConfirm={() => toggleMutation.mutate()}
      />
    </div>
  )
}

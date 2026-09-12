'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, MoreHorizontal, Building2,
  Users, MapPin, Crown, Mail, Copy, Check, AlertCircle, Sparkles, LogIn,
  History, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { adminApi } from '@/lib/api/admin'
import { usuariosApi } from '@/lib/api/usuarios'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import type {
  AdminTenant, AdminTenantUsuario, AdminTenantUsuarioEstado,
  AdminTenantLogAccion, AdminTenantHistorialGrupo,
} from '@/types/admin'
import { useSuperadminClinicaStore } from '@/store/superadminClinicaStore'

// ─── Helpers ──────────────────────────────────────────────────

/** Extrae el mensaje de error legible de una respuesta DRF (string suelto o {campo: [msg]}). */
function serverErrorMessage(err: unknown): string | null {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (!data) return null
  if (typeof data === 'string') return data
  const obj = data as Record<string, unknown>
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.detail === 'string') return obj.detail
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && typeof v[0] === 'string') return v[0]
    if (typeof v === 'string') return v
  }
  return null
}

// ─── Schema ───────────────────────────────────────────────────

const tenantBaseSchema = z.object({
  nombre:   z.string().min(2, 'Mínimo 2 caracteres'),
  nit:      z.string().optional(),
  email:    z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  plan:     z.string().optional(),
})

// Al crear, el email del admin inicial es obligatorio: un tenant siempre nace
// con su administrador. Al editar el campo no se muestra.
const tenantCreateSchema = tenantBaseSchema.extend({
  admin_email: z.string().min(1, 'El email del admin es obligatorio').email('Email inválido'),
})
const tenantEditSchema = tenantBaseSchema.extend({
  admin_email: z.string().email('Email inválido').optional().or(z.literal('')),
})

type TenantFormValues = z.infer<typeof tenantEditSchema>

type FiltroActivo = 'todos' | 'activos' | 'inactivos'

// ─── Sheet crear / editar tenant ─────────────────────────────

function TenantSheet({
  tenant,
  open,
  onClose,
}: {
  tenant: AdminTenant | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!tenant

  const { data: planesData } = useQuery({
    queryKey: ['admin-planes'],
    queryFn: () => adminApi.planes.list(),
  })
  const planes = planesData?.results ?? []

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<TenantFormValues>({
    resolver: zodResolver(isEdit ? tenantEditSchema : tenantCreateSchema),
    values: tenant ? {
      nombre:   tenant.nombre,
      nit:      tenant.nit ?? '',
      email:    tenant.email ?? '',
      telefono: tenant.telefono ?? '',
      plan:     tenant.plan?.id ?? '',
    } : undefined,
  })

  const planValue = watch('plan')

  const [facialHabilitado, setFacialHabilitado]       = useState(tenant?.facial_verificacion_habilitada ?? false)
  const [moduloEstetico, setModuloEstetico]           = useState(tenant?.modulo_estetico_habilitado ?? true)
  const [moduloObesidad, setModuloObesidad]           = useState(tenant?.modulo_obesidad_habilitado ?? false)
  const [puestaEnMarcha, setPuestaEnMarcha]           = useState(tenant?.modo_puesta_en_marcha ?? false)

  useEffect(() => {
    setFacialHabilitado(tenant?.facial_verificacion_habilitada ?? false)
    setModuloEstetico(tenant?.modulo_estetico_habilitado ?? true)
    setModuloObesidad(tenant?.modulo_obesidad_habilitado ?? false)
    setPuestaEnMarcha(tenant?.modo_puesta_en_marcha ?? false)
  }, [tenant?.id])

  const mutation = useMutation({
    mutationFn: (data: TenantFormValues) => {
      const payload = {
        nombre:   data.nombre,
        nit:      data.nit || undefined,
        email:    data.email || undefined,
        telefono: data.telefono || undefined,
        plan:     data.plan || undefined,
        ...(isEdit ? {
          facial_verificacion_habilitada: facialHabilitado,
          modulo_estetico_habilitado: moduloEstetico,
          modulo_obesidad_habilitado: moduloObesidad,
          modo_puesta_en_marcha: puestaEnMarcha,
        } : {}),
      }
      if (isEdit) return adminApi.tenants.update(tenant!.id, payload)
      return adminApi.tenants.create({
        ...payload,
        admin_email: (data.admin_email ?? '').trim(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      reset()
      onClose()
    },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <SheetContent className="w-full sm:max-w-lg p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar clínica' : 'Nueva clínica'}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="mt-6 space-y-5">

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
            <Select value={planValue ?? ''} onValueChange={v => setValue('plan', v === '__none__' ? '' : v)}>
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

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Email del admin inicial *</Label>
              <Input
                type="email"
                placeholder="admin@clinica.com"
                {...register('admin_email')}
                className={cn(errors.admin_email && 'border-red-400')}
              />
              {errors.admin_email && <p className="text-xs text-red-500">{errors.admin_email.message}</p>}
              <p className="text-xs text-muted-foreground">Se crea el usuario administrador de la clínica y se le envía la invitación por email.</p>
            </div>
          )}

          {isEdit && (
            <div className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 mb-3">
                <Sparkles className="h-3.5 w-3.5" />
                Add-ons
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Verificación facial biométrica</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Permite comparar la identidad del paciente con su foto de control en cada cita.
                  </p>
                </div>
                <Switch
                  checked={facialHabilitado}
                  onCheckedChange={setFacialHabilitado}
                />
              </div>

              <div className="border-t border-violet-100 my-1" />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Módulo estético</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Procedimientos, zonas corporales, diagramas y notas clínicas estéticas.
                  </p>
                </div>
                <Switch
                  checked={moduloEstetico}
                  onCheckedChange={setModuloEstetico}
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Módulo obesidad</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tratamientos, sesiones de seguimiento y control de peso.
                  </p>
                </div>
                <Switch
                  checked={moduloObesidad}
                  onCheckedChange={setModuloObesidad}
                />
              </div>

              <div className="border-t border-violet-100 my-1" />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">Modo puesta en marcha</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Habilita el asistente para cargar pacientes en curso y saldos previos
                    mientras la clínica migra sus datos. Apágalo cuando termine.
                  </p>
                </div>
                <Switch
                  checked={puestaEnMarcha}
                  onCheckedChange={setPuestaEnMarcha}
                />
              </div>
            </div>
          )}

          {mutation.isError && (
            <p className="text-sm text-red-500">
              {serverErrorMessage(mutation.error) ?? 'Error al guardar. Intenta de nuevo.'}
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear clínica'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

// ─── Dialog reenviar invitación ──────────────────────────────

type InvitacionResult = { ok: boolean; url: string; email_enviado: boolean }

function InvitacionDialog({
  usuario,
  open,
  onClose,
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

  const handleClose = () => {
    setResult(null)
    setCopied(false)
    onClose()
  }

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
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 h-7 px-2 gap-1.5"
                    onClick={handleCopy}
                  >
                    {copied
                      ? <><Check className="h-3.5 w-3.5 text-green-600" /><span className="text-xs text-green-600">Copiado</span></>
                      : <><Copy className="h-3.5 w-3.5" /><span className="text-xs">Copiar</span></>
                    }
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

// ─── Dialog crear administrador (tenant huérfano) ────────────

function CrearAdminDialog({
  tenant,
  open,
  onClose,
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

// ─── Sheet listado de usuarios del tenant ────────────────────

const ESTADO_BADGE: Record<AdminTenantUsuarioEstado, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  activo:     { label: 'Activo',                 variant: 'success' },
  pendiente:  { label: 'Invitación pendiente',   variant: 'warning' },
  inactivo:   { label: 'Inactivo',               variant: 'muted'   },
}

function UsuariosSheet({
  tenant,
  open,
  onClose,
}: {
  tenant: AdminTenant | null
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant-usuarios', tenant?.id],
    queryFn:  () => adminApi.tenants.usuarios(tenant!.id),
    enabled:  open && !!tenant,
  })

  const usuarios = data ?? []

  const [target, setTarget] = useState<AdminTenantUsuario | null>(null)
  const accion: 'activar' | 'desactivar' = target?.activo ? 'desactivar' : 'activar'

  const mutation = useMutation({
    mutationFn: () =>
      accion === 'activar'
        ? usuariosApi.activar(target!.id)
        : usuariosApi.desactivar(target!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tenant-usuarios', tenant?.id] })
      qc.invalidateQueries({ queryKey: ['admin-tenants'] })
      setTarget(null)
    },
  })

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-2xl p-6 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Usuarios de {tenant?.nombre}</SheetTitle>
        </SheetHeader>

        <div className="mt-6">
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
            <div className="rounded-xl border overflow-hidden">
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
        </div>
      </SheetContent>

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
    </Sheet>
  )
}

// ─── Modal historial de acciones del tenant ──────────────────

const HISTORIAL_PAGE_SIZE = 25

const ACCION_LABEL: Record<string, string> = {
  'tenant.crear':                'Clínica creada',
  'tenant.editar':               'Datos de la clínica actualizados',
  'tenant.activar':              'Clínica activada',
  'tenant.desactivar':           'Clínica desactivada',
  'tenant.plan_cambiar':         'Plan cambiado',
  'tenant.modulo':               'Add-on modificado',
  'usuario.crear':               'Usuario creado',
  'usuario.editar':              'Usuario actualizado',
  'usuario.eliminar':            'Usuario eliminado',
  'usuario.activar':             'Usuario activado',
  'usuario.desactivar':          'Usuario desactivado',
  'usuario.reenviar_invitacion': 'Invitación reenviada',
  'usuario.cambiar_password':    'Contraseña cambiada',
  'rol.crear':                   'Rol creado',
  'rol.editar':                  'Rol actualizado',
  'rol.eliminar':                'Rol eliminado',
  'rol.permisos':                'Permisos de rol actualizados',
  'auth.login':                  'Inicio de sesión',
}

function accionChipClass(accion: string): string {
  if (accion.startsWith('auth.'))     return 'bg-blue-50 text-blue-600'
  if (accion.startsWith('usuario.'))  return 'bg-emerald-50 text-emerald-600'
  if (accion.startsWith('rol.'))      return 'bg-violet-50 text-violet-600'
  if (accion === 'tenant.desactivar') return 'bg-red-50 text-red-600'
  if (accion.startsWith('tenant.'))   return 'bg-amber-50 text-amber-600'
  return 'bg-gray-100 text-gray-600'
}

const HISTORIAL_GRUPOS: { key: AdminTenantHistorialGrupo; label: string }[] = [
  { key: 'gestion', label: 'Gestión'  },
  { key: 'accesos', label: 'Accesos'  },
  { key: 'todo',    label: 'Todo'     },
]

function HistorialDialog({
  tenant,
  open,
  onClose,
}: {
  tenant: AdminTenant | null
  open: boolean
  onClose: () => void
}) {
  const [grupo, setGrupo] = useState<AdminTenantHistorialGrupo>('gestion')
  const [page, setPage]   = useState(1)

  useEffect(() => { setPage(1) }, [grupo, tenant?.id, open])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-tenant-historial', tenant?.id, grupo, page],
    queryFn:  () => adminApi.tenants.historial(tenant!.id, { grupo, page }),
    enabled:  open && !!tenant,
    placeholderData: (prev) => prev,
  })

  const eventos      = data?.results ?? []
  const total        = data?.count ?? 0
  const totalPaginas = Math.max(1, Math.ceil(total / HISTORIAL_PAGE_SIZE))

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Historial de acciones · {tenant?.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
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
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPaginas}
          </span>
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
      </DialogContent>
    </Dialog>
  )
}

function HistorialFila({ evento }: { evento: AdminTenantLogAccion }) {
  const [abierto, setAbierto] = useState(false)
  const resumen = (evento.detalle?.resumen as string | undefined)
    ?? ACCION_LABEL[evento.accion]
    ?? evento.accion
  const cambios = evento.detalle?.cambios
  const tieneCambios = cambios && Object.keys(cambios).length > 0
  const fecha = new Date(evento.created_at)

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
          accionChipClass(evento.accion),
        )}>
          {ACCION_LABEL[evento.accion] ?? evento.accion}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-800">{resumen}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {evento.usuario_nombre}
            {evento.usuario_email && evento.usuario_email !== evento.usuario_nombre
              ? ` · ${evento.usuario_email}` : ''}
            {' · '}
            {fecha.toLocaleString('es-CO', {
              day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {evento.ip ? ` · ${evento.ip}` : ''}
          </p>
          {tieneCambios && (
            <>
              <button
                onClick={() => setAbierto(a => !a)}
                className="mt-1 text-xs font-medium text-rose-600 hover:underline"
              >
                {abierto ? 'Ocultar cambios' : 'Ver cambios'}
              </button>
              {abierto && (
                <div className="mt-1.5 rounded-lg border bg-gray-50 p-2.5 text-xs space-y-1">
                  {Object.entries(cambios!).map(([campo, val]) => (
                    <div key={campo} className="flex flex-wrap gap-1">
                      <span className="font-medium text-gray-700">{campo}:</span>
                      <span className="text-red-500 line-through">{String(val.antes ?? '—')}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-green-600">{String(val.despues ?? '—')}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  )
}

// ─── Fila de la tabla ────────────────────────────────────────

function TenantRow({
  tenant,
  onEdit,
  onToggle,
  onReenviar,
  onEntrar,
  onVerUsuarios,
  onVerHistorial,
  onCrearAdmin,
}: {
  tenant: AdminTenant
  onEdit: (t: AdminTenant) => void
  onToggle: (t: AdminTenant) => void
  onReenviar: (t: AdminTenant) => void
  onEntrar: (t: AdminTenant) => void
  onVerUsuarios: (t: AdminTenant) => void
  onVerHistorial: (t: AdminTenant) => void
  onCrearAdmin: (t: AdminTenant) => void
}) {
  return (
    <TableRow className={cn(!tenant.activo && 'opacity-60')}>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
            tenant.activo ? 'bg-rose-50' : 'bg-gray-100'
          )}>
            <Building2 className={cn('h-4 w-4', tenant.activo ? 'text-rose-500' : 'text-gray-400')} />
          </div>
          <div>
            <p className="font-medium text-sm leading-tight">{tenant.nombre}</p>
            {tenant.nit && <p className="text-xs text-muted-foreground">NIT {tenant.nit}</p>}
            {tenant.sin_admin && (
              <button
                type="button"
                onClick={() => onCrearAdmin(tenant)}
                className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-200 transition-colors"
                title="Esta clínica no tiene administrador — crear uno"
              >
                <AlertCircle className="h-2.5 w-2.5" />
                Sin admin
              </button>
            )}
          </div>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        {tenant.email ?? <span className="text-gray-300">—</span>}
      </TableCell>

      <TableCell>
        {tenant.plan ? (
          <div className="flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium">{tenant.plan.nombre}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Sin plan</span>
        )}
      </TableCell>

      <TableCell>
        <button
          type="button"
          onClick={() => onVerUsuarios(tenant)}
          className="flex items-center gap-1.5 text-sm rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-gray-100 transition-colors"
          title="Ver usuarios de la clínica"
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.usuarios_activos}</span>
          <span className="text-muted-foreground">/ {tenant.total_usuarios}</span>
        </button>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-1.5 text-sm">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
          <span>{tenant.total_sedes}</span>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant={tenant.activo ? 'success' : 'muted'}>
          {tenant.activo ? 'Activa' : 'Inactiva'}
        </Badge>
      </TableCell>

      <TableCell>
        {tenant.facial_verificacion_habilitada ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            <Sparkles className="h-2.5 w-2.5" />
            Facial
          </span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </TableCell>

      <TableCell className="text-xs text-muted-foreground">
        {new Date(tenant.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
      </TableCell>

      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEntrar(tenant)}>
              <LogIn className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Entrar como clínica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onVerUsuarios(tenant)}>
              <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Ver usuarios
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onVerHistorial(tenant)}>
              <History className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              Historial de acciones
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(tenant)}>Editar</DropdownMenuItem>
            {tenant.sin_admin && (
              <DropdownMenuItem
                onClick={() => onCrearAdmin(tenant)}
                className="text-amber-700 focus:text-amber-700"
              >
                <Mail className="h-3.5 w-3.5 mr-2" />
                Crear administrador
              </DropdownMenuItem>
            )}
            {tenant.admin_usuario_pendiente && (
              <DropdownMenuItem onClick={() => onReenviar(tenant)}>
                <Mail className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Reenviar invitación admin
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggle(tenant)}
              className={tenant.activo ? 'text-red-600 focus:text-red-600' : 'text-green-600 focus:text-green-600'}
            >
              {tenant.activo ? 'Inactivar' : 'Activar'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i} className="animate-pulse">
          <TableCell><div className="h-4 w-40 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-32 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-20 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-16 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-12 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-5 w-16 rounded-full bg-gray-100" /></TableCell>
          <TableCell><div className="h-5 w-14 rounded-full bg-gray-100" /></TableCell>
          <TableCell><div className="h-4 w-24 rounded bg-gray-100" /></TableCell>
          <TableCell><div className="h-8 w-8 rounded bg-gray-100" /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ─── Página principal ─────────────────────────────────────────

const FILTROS: { key: FiltroActivo; label: string }[] = [
  { key: 'todos',    label: 'Todos'    },
  { key: 'activos',  label: 'Activas'  },
  { key: 'inactivos',label: 'Inactivas'},
]

export default function TenantsPage() {
  const qc = useQueryClient()
  const router = useRouter()
  const { entrarClinica } = useSuperadminClinicaStore()
  const [search, setSearch]         = useState('')
  const [filtro, setFiltro]             = useState<FiltroActivo>('todos')
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [editando, setEditando]         = useState<AdminTenant | null>(null)
  const [invitacionOpen, setInvitacionOpen] = useState(false)
  const [reenviarTenant, setReenviarTenant] = useState<AdminTenant | null>(null)
  const [usuariosOpen, setUsuariosOpen]     = useState(false)
  const [usuariosTenant, setUsuariosTenant] = useState<AdminTenant | null>(null)
  const [historialOpen, setHistorialOpen]     = useState(false)
  const [historialTenant, setHistorialTenant] = useState<AdminTenant | null>(null)
  const [crearAdminOpen, setCrearAdminOpen]     = useState(false)
  const [crearAdminTenant, setCrearAdminTenant] = useState<AdminTenant | null>(null)
  const [toggleTenant, setToggleTenant]         = useState<AdminTenant | null>(null)

  const params = {
    search:  search || undefined,
    activo:  filtro === 'todos' ? undefined : filtro === 'activos',
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', params],
    queryFn:  () => adminApi.tenants.list(params),
  })

  const toggleMutation = useMutation({
    mutationFn: (t: AdminTenant) => adminApi.tenants.update(t.id, { activo: !t.activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-tenants'] }),
  })

  const handleEdit          = (t: AdminTenant) => { setEditando(t); setSheetOpen(true) }
  const handleClose         = () => { setSheetOpen(false); setEditando(null) }
  const handleReenviar      = (t: AdminTenant) => { setReenviarTenant(t); setInvitacionOpen(true) }
  const handleCloseInvitacion = () => { setInvitacionOpen(false); setReenviarTenant(null) }
  const handleVerUsuarios   = (t: AdminTenant) => { setUsuariosTenant(t); setUsuariosOpen(true) }
  const handleCloseUsuarios = () => { setUsuariosOpen(false); setUsuariosTenant(null) }
  const handleVerHistorial   = (t: AdminTenant) => { setHistorialTenant(t); setHistorialOpen(true) }
  const handleCloseHistorial = () => { setHistorialOpen(false); setHistorialTenant(null) }
  const handleCrearAdmin     = (t: AdminTenant) => { setCrearAdminTenant(t); setCrearAdminOpen(true) }
  const handleCloseCrearAdmin = () => { setCrearAdminOpen(false); setCrearAdminTenant(null) }
  const handleConfirmToggle  = () => {
    if (toggleTenant) toggleMutation.mutate(toggleTenant, { onSettled: () => setToggleTenant(null) })
  }
  const handleEntrar        = (t: AdminTenant) => {
    entrarClinica({ id: t.id, nombre: t.nombre, logo: null })
    router.push('/dashboard')
  }

  const tenants = data?.results ?? []
  const sinAdminCount = tenants.filter(t => t.sin_admin).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Clínicas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? 'Cargando…' : `${data?.count ?? 0} clínica${(data?.count ?? 0) !== 1 ? 's' : ''} registradas`}
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setSheetOpen(true) }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nueva clínica
        </Button>
      </div>

      {/* Filtros y búsqueda */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, NIT o email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>

        <div className="flex rounded-lg border bg-white overflow-hidden">
          {FILTROS.map(f => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                filtro === f.key
                  ? 'bg-rose-500 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso de tenants huérfanos */}
      {sinAdminCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">
            {sinAdminCount === 1
              ? '1 clínica no tiene administrador.'
              : `${sinAdminCount} clínicas no tienen administrador.`}{' '}
            Usa <span className="font-medium">Crear administrador</span> en la fila para resolverlo.
          </p>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Clínica</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Usuarios</TableHead>
              <TableHead>Sedes</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Add-ons</TableHead>
              <TableHead>Creada</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-16 text-center">
                  <Building2 className="h-10 w-10 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No hay clínicas{search ? ' que coincidan con la búsqueda' : ''}</p>
                </TableCell>
              </TableRow>
            ) : (
              tenants.map(t => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  onEdit={handleEdit}
                  onToggle={t => setToggleTenant(t)}
                  onReenviar={handleReenviar}
                  onEntrar={handleEntrar}
                  onVerUsuarios={handleVerUsuarios}
                  onVerHistorial={handleVerHistorial}
                  onCrearAdmin={handleCrearAdmin}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TenantSheet tenant={editando} open={sheetOpen} onClose={handleClose} />
      <InvitacionDialog
        usuario={reenviarTenant?.admin_usuario_pendiente ?? null}
        open={invitacionOpen}
        onClose={handleCloseInvitacion}
      />
      <UsuariosSheet tenant={usuariosTenant} open={usuariosOpen} onClose={handleCloseUsuarios} />
      <HistorialDialog tenant={historialTenant} open={historialOpen} onClose={handleCloseHistorial} />
      <CrearAdminDialog tenant={crearAdminTenant} open={crearAdminOpen} onClose={handleCloseCrearAdmin} />
      <ConfirmDialog
        open={!!toggleTenant}
        onOpenChange={v => { if (!v && !toggleMutation.isPending) setToggleTenant(null) }}
        title={toggleTenant?.activo ? 'Inactivar clínica' : 'Activar clínica'}
        description={
          toggleTenant?.activo
            ? `Los usuarios de ${toggleTenant?.nombre} no podrán iniciar sesión mientras la clínica esté inactiva.`
            : `Se restablecerá el acceso de los usuarios de ${toggleTenant?.nombre}.`
        }
        confirmLabel={toggleTenant?.activo ? 'Inactivar' : 'Activar'}
        variant={toggleTenant?.activo ? 'destructive' : 'default'}
        loading={toggleMutation.isPending}
        onConfirm={handleConfirmToggle}
      />
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Copy, Search } from 'lucide-react'

import { adminApi } from '@/lib/api/admin'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { AdminTenant, AdminTenantUsuario, CambiarCorreoResultado } from '@/types/admin'

import { BuscarClinica, CampoMotivo, EncabezadoHerramienta, MOTIVO_MINIMO, Opcion, Paso } from '../_componentes'

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ESTADO_TEXTO: Record<AdminTenantUsuario['estado'], string> = {
  activo: 'Activo',
  pendiente: 'Invitación pendiente',
  inactivo: 'Desactivado',
}

function ElegirUsuario({ clinicaId, onSelect }: { clinicaId: string; onSelect: (u: AdminTenantUsuario) => void }) {
  const [q, setQ] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['soporte-usuarios-clinica', clinicaId],
    queryFn: () => adminApi.tenants.usuarios(clinicaId),
  })
  if (isLoading) return <LoadingState />
  if (isError) return <ErrorState onRetry={refetch} />

  const texto = q.trim().toLowerCase()
  const usuarios = (data ?? []).filter(
    (u) => !texto || u.nombre_completo.toLowerCase().includes(texto) || u.email.toLowerCase().includes(texto),
  )
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {usuarios.map((u) => (
          <Opcion key={u.id} seleccionada={false} onSelect={() => onSelect(u)}>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium">{u.nombre_completo || u.email}</span>
              <span className="text-xs text-muted-foreground">{u.rol_nombre}</span>
              {u.estado !== 'activo' && <Badge variant="secondary">{ESTADO_TEXTO[u.estado]}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </Opcion>
        ))}
        {usuarios.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados.</p>}
      </div>
    </div>
  )
}

function FormularioCambio({
  usuario, onListo,
}: { usuario: AdminTenantUsuario; onListo: (r: CambiarCorreoResultado) => void }) {
  const queryClient = useQueryClient()
  const desactivado = usuario.estado === 'inactivo'
  const [correo, setCorreo] = useState('')
  const [enviarEnlace, setEnviarEnlace] = useState(!desactivado)
  const [cerrarSesiones, setCerrarSesiones] = useState(true)
  const [verificado, setVerificado] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [confirmando, setConfirmando] = useState(false)

  const correoNuevo = correo.trim().toLowerCase()
  const correoValido = CORREO_VALIDO.test(correoNuevo)
  const igual = correoNuevo === usuario.email.toLowerCase()

  const cambiar = useMutation({
    mutationFn: () => adminApi.soporte.cambiarCorreo({
      usuario: usuario.id,
      correo_nuevo: correoNuevo,
      motivo: motivo.trim(),
      enviar_enlace: enviarEnlace && !desactivado,
      cerrar_sesiones: cerrarSesiones,
    }),
    onSuccess: (r) => {
      toast.success('Correo cambiado', `Ahora entra con ${r.email}.`)
      queryClient.invalidateQueries({ queryKey: ['soporte-usuarios-clinica'] })
      queryClient.invalidateQueries({ queryKey: ['soporte-cambios-correo'] })
      onListo(r)
    },
    onError: (err) => {
      setConfirmando(false)
      toast.error('No se pudo cambiar el correo', mensajeDeError(err))
    },
  })

  const listo = correoValido && !igual && verificado && motivo.trim().length >= MOTIVO_MINIMO

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="correo-nuevo">Correo nuevo *</Label>
        <Input
          id="correo-nuevo"
          type="email"
          autoComplete="off"
          placeholder="correo@ejemplo.com"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          autoFocus
        />
        {correoNuevo && !correoValido && <p className="text-xs text-destructive">Ese correo no es válido.</p>}
        {correoValido && igual && <p className="text-xs text-destructive">Es el mismo correo que tiene ahora.</p>}
        <p className="text-xs text-muted-foreground">
          Con este correo inicia sesión desde ahora. Su contraseña, rol y todo lo que ha hecho en la clínica se conservan.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <Checkbox
          id="enviar-enlace"
          label="Enviar al correo nuevo un enlace para crear contraseña"
          checked={enviarEnlace && !desactivado}
          disabled={desactivado}
          onChange={(e) => setEnviarEnlace(e.target.checked)}
        />
        {desactivado && (
          <p className="pl-6 text-xs text-muted-foreground">
            El usuario está desactivado en su clínica: se cambia el correo, pero no se envía enlace hasta que lo reactiven.
          </p>
        )}
        <Checkbox
          id="cerrar-sesiones"
          label="Cerrar las sesiones que tenga abiertas"
          checked={cerrarSesiones}
          onChange={(e) => setCerrarSesiones(e.target.checked)}
        />
        <p className="pl-6 text-xs text-muted-foreground">
          Los enlaces de contraseña que se hayan enviado al correo anterior dejan de funcionar siempre.
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 text-amber-600" /> Confirma que es la persona
        </p>
        <p className="text-sm">
          Quien controle el correo nuevo queda dueño de la cuenta. Confírmalo con alguien de la clínica que la conozca
          (por ejemplo, el administrador por WhatsApp o llamada), no solo con quien lo pide.
        </p>
        <div className="pt-1 text-sm">
          <Checkbox
            id="identidad-verificada"
            label="Lo confirmé con la clínica"
            checked={verificado}
            onChange={(e) => setVerificado(e.target.checked)}
          />
        </div>
      </div>

      <CampoMotivo value={motivo} onChange={setMotivo} />

      <div className="flex justify-end">
        <Button disabled={!listo || cambiar.isPending} onClick={() => setConfirmando(true)}>
          Cambiar correo
        </Button>
      </div>

      <ConfirmDialog
        open={confirmando}
        onOpenChange={setConfirmando}
        title="¿Cambiar el correo de acceso?"
        description={`${usuario.nombre_completo || usuario.email} dejará de entrar con ${usuario.email} y entrará con ${correoNuevo}.`}
        confirmLabel="Sí, cambiar"
        loading={cambiar.isPending}
        onConfirm={() => cambiar.mutate()}
      />
    </div>
  )
}

function Resultado({ resultado, onOtro }: { resultado: CambiarCorreoResultado; onOtro: () => void }) {
  const { enlace } = resultado
  async function copiar() {
    if (!enlace) return
    try {
      await navigator.clipboard.writeText(enlace.url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar', 'Selecciónalo y cópialo a mano.')
    }
  }
  return (
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>Ahora entra con <strong>{resultado.email}</strong> (antes {resultado.correo_anterior}).</span>
        </p>
        <Button size="sm" variant="outline" onClick={onOtro}>Hacer otro</Button>
      </div>
      {enlace && (
        <div className="space-y-1.5 pl-6">
          <p>
            {enlace.email_enviado
              ? `Se envió ${enlace.tipo === 'invitacion' ? 'la invitación' : 'el enlace para crear contraseña'} al correo nuevo`
              : 'No se pudo enviar el correo. Pásale este enlace por otro medio'}
            {' '}(vence el {formatDateTime(enlace.vence)}):
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={enlace.url} className="h-8 font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={copiar}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CambiosRecientes({ clinicaId }: { clinicaId: string }) {
  const { data } = useQuery({
    queryKey: ['soporte-cambios-correo', clinicaId],
    queryFn: () => adminApi.soporte.cambiosDeCorreo(clinicaId),
  })
  if (!data?.length) return null
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">Hechos en esta clínica</h2>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Hecho por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{c.usuario_nombre || '—'}</TableCell>
                <TableCell className="text-xs">{c.correo_anterior} → {c.correo_nuevo}</TableCell>
                <TableCell className="max-w-xs truncate text-xs" title={c.motivo}>{c.motivo}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.hecho_por || '—'} · {formatDateTime(c.fecha)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

export default function CambiarCorreoPage() {
  const [clinica, setClinica] = useState<AdminTenant | null>(null)
  const [usuario, setUsuario] = useState<AdminTenantUsuario | null>(null)
  const [resultado, setResultado] = useState<CambiarCorreoResultado | null>(null)

  function reiniciarDesde(paso: 1 | 2) {
    if (paso <= 1) setClinica(null)
    setUsuario(null)
    setResultado(null)
  }

  return (
    <div className="max-w-3xl space-y-4">
      <EncabezadoHerramienta
        titulo="Cambiar correo de acceso"
        descripcion="Para un usuario que perdió el acceso a su correo y no puede recuperar la contraseña. Cambia el correo con el que inicia sesión y le envía al nuevo el enlace para crear contraseña."
      />

      {resultado && <Resultado resultado={resultado} onOtro={() => reiniciarDesde(2)} />}

      <Paso numero={1} titulo="Clínica" resumen={clinica?.nombre} onCambiar={() => reiniciarDesde(1)}>
        <BuscarClinica onSelect={setClinica} />
      </Paso>

      {clinica && !resultado && (
        <>
          <Paso
            numero={2}
            titulo="Usuario"
            resumen={usuario && `${usuario.nombre_completo || usuario.email} · ${usuario.email}`}
            onCambiar={() => reiniciarDesde(2)}
          >
            <ElegirUsuario clinicaId={clinica.id} onSelect={setUsuario} />
          </Paso>

          {usuario && (
            <Paso numero={3} titulo="Correo nuevo y confirmación">
              <FormularioCambio usuario={usuario} onListo={setResultado} />
            </Paso>
          )}
        </>
      )}

      {clinica && <CambiosRecientes clinicaId={clinica.id} />}
    </div>
  )
}

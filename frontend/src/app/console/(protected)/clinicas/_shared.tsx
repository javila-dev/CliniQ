// Helpers compartidos entre el listado de clínicas y la página de detalle de
// un tenant. Prefijo `_` para que Next.js no lo trate como ruta.

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { AdminTenantLogAccion, AdminTenantUsuarioEstado, AdminTenantHistorialGrupo } from '@/types/admin'

/** Extrae el mensaje de error legible de una respuesta DRF (string suelto o {campo: [msg]}). */
export function serverErrorMessage(err: unknown): string | null {
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

export const ESTADO_BADGE: Record<AdminTenantUsuarioEstado, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  activo:     { label: 'Activo',                 variant: 'success' },
  pendiente:  { label: 'Invitación pendiente',   variant: 'warning' },
  inactivo:   { label: 'Inactivo',               variant: 'muted'   },
}

export const HISTORIAL_PAGE_SIZE = 25

export const ACCION_LABEL: Record<string, string> = {
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

export function accionChipClass(accion: string): string {
  if (accion.startsWith('auth.'))     return 'bg-blue-50 text-blue-600'
  if (accion.startsWith('usuario.'))  return 'bg-emerald-50 text-emerald-600'
  if (accion.startsWith('rol.'))      return 'bg-violet-50 text-violet-600'
  if (accion === 'tenant.desactivar') return 'bg-red-50 text-red-600'
  if (accion.startsWith('tenant.'))   return 'bg-amber-50 text-amber-600'
  return 'bg-gray-100 text-gray-600'
}

export const HISTORIAL_GRUPOS: { key: AdminTenantHistorialGrupo; label: string }[] = [
  { key: 'gestion', label: 'Gestión'  },
  { key: 'accesos', label: 'Accesos'  },
  { key: 'todo',    label: 'Todo'     },
]

export function HistorialFila({ evento }: { evento: AdminTenantLogAccion }) {
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

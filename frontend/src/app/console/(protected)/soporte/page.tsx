'use client'

import Link from 'next/link'
import { ArrowLeftRight, AtSign, ChevronRight, ListChecks, Replace, Trash2, Wallet, type LucideIcon } from 'lucide-react'

// Cada error común de los usuarios que soporte corrige tiene su herramienta:
// una tarjeta aquí y su página en /console/soporte/<herramienta>.
const HERRAMIENTAS: { href: string; titulo: string; descripcion: string; icon: LucideIcon }[] = [
  {
    href: '/console/soporte/trasladar-atencion',
    titulo: 'Trasladar atención',
    descripcion: 'Se documentó en el paciente equivocado. Pasa la atención al paciente que realmente se atendió.',
    icon: ArrowLeftRight,
  },
  {
    href: '/console/soporte/eliminar-atencion',
    titulo: 'Eliminar atención',
    descripcion: 'Una atención que no debió existir. Devuelve insumos y la sesión del paquete, y resuelve la cita y el cobro.',
    icon: Trash2,
  },
  {
    href: '/console/soporte/sesiones-previas',
    titulo: 'Corregir paquete migrado',
    descripcion: 'Al migrar un paciente se cargó otro tratamiento o se marcaron mal las sesiones que ya había hecho. Se corrige mientras no haya hecho ninguna en la app.',
    icon: ListChecks,
  },
  {
    href: '/console/soporte/cambiar-tratamiento',
    titulo: 'Cambiar tratamiento de una venta',
    descripcion: 'Se cotizó otro tratamiento y la venta ya se aceptó, con citas hechas o agendadas. Pasa al tratamiento correcto sin cambiar lo cobrado.',
    icon: Replace,
  },
  {
    href: '/console/soporte/cerrar-cartera',
    titulo: 'Cerrar cartera de una venta terminada',
    descripcion: 'La venta se terminó pero su cartera quedó con saldo por error. Se perdona lo pendiente y la cartera queda en $0.',
    icon: Wallet,
  },
  {
    href: '/console/soporte/cambiar-correo',
    titulo: 'Cambiar correo de acceso',
    descripcion: 'Un usuario perdió el acceso a su correo y no puede recuperar la contraseña. Se cambia el correo con el que entra y se le envía el enlace al nuevo.',
    icon: AtSign,
  },
]

export default function SoportePage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Soporte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Correcciones que las clínicas no pueden hacer solas. Cada una muestra qué va a pasar antes de
          confirmar y queda registrada con tu usuario y el motivo.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {HERRAMIENTAS.map(({ href, titulo, descripcion, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{titulo}</p>
              <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  )
}

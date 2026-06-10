'use client'

import Link from 'next/link'
import {
  Settings2, Building2, Stethoscope, Users, ShieldCheck,
  ClipboardList, ScrollText, Package2, ChevronRight, Bell,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { hasPermission, PERM } from '@/lib/permissions'
import { cn } from '@/lib/utils'

// ── Definición de secciones ───────────────────────────────────

interface ConfigItem {
  href: string
  label: string
  description: string
  icon: React.ElementType
  color: string     // color del ícono
  bg: string        // fondo del ícono
  perm?: 'clinicas_editar' | 'usuarios_ver' | 'roles_ver'
}

interface ConfigSection {
  title: string
  description: string
  items: ConfigItem[]
}

const SECTIONS: ConfigSection[] = [
  {
    title: 'Tu clínica',
    description: 'Información general y ubicaciones',
    items: [
      {
        href: '/configuracion/clinica',
        label: 'General',
        description: 'Logo, nombre, NIT, teléfono y frecuencia de turnos.',
        icon: Settings2,
        color: 'text-rose-500',
        bg: 'bg-rose-50',
        perm: 'clinicas_editar',
      },
      {
        href: '/configuracion/sedes',
        label: 'Sedes',
        description: 'Sucursales, horarios de atención y contacto.',
        icon: Building2,
        color: 'text-violet-500',
        bg: 'bg-violet-50',
        perm: 'clinicas_editar',
      },
      {
        href: '/configuracion/recordatorios',
        label: 'Recordatorios',
        description: 'Activa recordatorios automáticos y configura con cuánta anticipación se envían.',
        icon: Bell,
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        perm: 'clinicas_editar',
      },
    ],
  },
  {
    title: 'Catálogo de servicios',
    description: 'Qué ofreces y cómo lo agrupas',
    items: [
      {
        href: '/configuracion/procedimientos',
        label: 'Procedimientos',
        description: 'Unidades clínicas: duración, protocolo de pasos y consentimientos.',
        icon: Stethoscope,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        perm: 'clinicas_editar',
      },
      {
        href: '/configuracion/tratamientos',
        label: 'Tratamientos',
        description: 'Planes que agrupan procedimientos con precio estimado.',
        icon: Package2,
        color: 'text-cyan-600',
        bg: 'bg-cyan-50',
        perm: 'clinicas_editar',
      },
    ],
  },
  {
    title: 'Historia clínica',
    description: 'Plantillas, secciones activas y documentos',
    items: [
      {
        href: '/configuracion/historia-clinica',
        label: 'Historia clínica',
        description: 'Activa o desactiva las pestañas de la historia de cada paciente.',
        icon: ClipboardList,
        color: 'text-teal-600',
        bg: 'bg-teal-50',
        perm: 'clinicas_editar',
      },
      {
        href: '/configuracion/atencion',
        label: 'Pantalla de atención',
        description: 'Elige qué pestañas ve el profesional durante una atención.',
        icon: Stethoscope,
        color: 'text-rose-500',
        bg: 'bg-rose-50',
        perm: 'clinicas_editar',
      },
      {
        href: '/configuracion/plantillas-ordenes',
        label: 'Plantillas de órdenes',
        description: 'Plantillas reutilizables para órdenes médicas, laboratorios e imágenes.',
        icon: ScrollText,
        color: 'text-orange-500',
        bg: 'bg-orange-50',
        perm: 'clinicas_editar',
      },
    ],
  },
  {
    title: 'Equipo y accesos',
    description: 'Quién puede hacer qué',
    items: [
      {
        href: '/equipo',
        label: 'Usuarios',
        description: 'Crea y gestiona las cuentas del equipo.',
        icon: Users,
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        perm: 'usuarios_ver',
      },
      {
        href: '/configuracion/roles',
        label: 'Roles y permisos',
        description: 'Define roles personalizados y sus privilegios.',
        icon: ShieldCheck,
        color: 'text-sky-500',
        bg: 'bg-sky-50',
        perm: 'roles_ver',
      },
    ],
  },
]

// ── Componentes ───────────────────────────────────────────────

function ConfigCard({ item }: { item: ConfigItem }) {
  return (
    <Link
      href={item.href}
      className="group flex items-start gap-3.5 rounded-xl border border-gray-100 bg-white p-4
                 hover:border-gray-200 hover:shadow-sm transition-all duration-150"
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', item.bg)}>
        <item.icon className={cn('h-4.5 w-4.5', item.color)} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-gray-900 leading-tight">{item.label}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{item.description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-400 shrink-0 mt-1 transition-colors" />
    </Link>
  )
}

function ConfigSection({ section, visibleHrefs }: { section: ConfigSection; visibleHrefs: Set<string> }) {
  const visibleItems = section.items.filter((item) => visibleHrefs.has(item.href))
  if (visibleItems.length === 0) return null

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-sm font-semibold text-gray-800">{section.title}</h2>
        <span className="text-xs text-gray-400">{section.description}</span>
      </div>

      {/* Cards en grid: 1 col móvil, 2 col sm+, 3 col si hay 3 items */}
      <div className={cn(
        'grid gap-2.5',
        visibleItems.length >= 3
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2',
      )}>
        {visibleItems.map((item) => (
          <ConfigCard key={item.href} item={item} />
        ))}
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const { user } = useAuthStore()

  const visibleHrefs = new Set(
    SECTIONS.flatMap((s) => s.items).filter((item) => {
      if (item.perm === 'usuarios_ver') return hasPermission(user, PERM.USUARIOS_VER)
      if (item.perm === 'roles_ver')    return hasPermission(user, PERM.ROLES_VER)
      return hasPermission(user, PERM.CLINICAS_EDITAR)
    }).map((item) => item.href)
  )

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configuración"
        description="Administra los parámetros de tu clínica."
      />

      {SECTIONS.map((section) => (
        <ConfigSection key={section.title} section={section} visibleHrefs={visibleHrefs} />
      ))}
    </div>
  )
}

import {
  Building2, CalendarClock, Workflow, Stethoscope, FileSignature, Wallet, ShieldCheck,
} from 'lucide-react'
import type { AuthUser } from '@/types/auth'
import { hasPermission, PERM } from '@/lib/permissions'

// Mapa de Configuración: el menú lateral muestra categorías y cada categoría
// agrupa ajustes que se ven como pestañas (o secciones) dentro de su página.
// Lo usan el layout, el resumen y el buscador.

export interface AjusteConfig {
  href: string
  label: string
  description: string
  /** Palabras con las que alguien buscaría este ajuste (solo para el buscador). */
  keywords?: string
  perm?: string
}

export interface CategoriaConfig {
  id: string
  label: string
  description: string
  icon: React.ElementType
  ajustes: AjusteConfig[]
}

export const CATEGORIAS: CategoriaConfig[] = [
  {
    id: 'clinica',
    label: 'Clínica',
    description: 'Identidad, sedes y tu plan',
    icon: Building2,
    ajustes: [
      {
        href: '/configuracion/clinica',
        label: 'Datos',
        description: 'Logo, nombre, NIT y teléfono.',
        keywords: 'identidad logo nombre nit telefono contacto datos de la clinica',
        perm: PERM.CLINICAS_EDITAR,
      },
      {
        href: '/configuracion/sedes',
        label: 'Sedes',
        description: 'Sucursales, horarios de atención y contacto.',
        keywords: 'sucursal horario direccion ciudad apertura cierre',
        perm: PERM.SEDES_VER,
      },
      {
        href: '/configuracion/plan',
        label: 'Plan',
        description: 'Lo que incluye tu plan y cuánto llevas usado este mes.',
        keywords: 'plan whatsapp envios limite cupo consumo mensajes usuarios sedes add-on addon modulos prueba',
        perm: PERM.CLINICAS_EDITAR,
      },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda y pacientes',
    description: 'Turnos, recordatorios y autoregistro',
    icon: CalendarClock,
    ajustes: [
      {
        href: '/configuracion/agenda#agenda',
        label: 'Agenda y recordatorios',
        description: 'Frecuencia de turnos, recordatorios y profesionales por procedimiento.',
        keywords: 'turnos intervalo citas recordatorio whatsapp confirmar anticipacion filtrar profesionales procedimiento',
        perm: PERM.CLINICAS_EDITAR,
      },
      {
        href: '/configuracion/agenda#pacientes',
        label: 'Registro de pacientes',
        description: 'Formulario y link para que los pacientes se registren solos.',
        keywords: 'autoregistro formulario link qr publico datos personales salud eps',
        perm: PERM.CLINICAS_EDITAR,
      },
    ],
  },
  {
    id: 'recepcion',
    label: 'Recepción',
    description: 'Lo que pasa cuando llega el paciente',
    icon: Workflow,
    ajustes: [
      {
        href: '/configuracion/recepcion',
        label: 'Pasos de recepción',
        description: 'Pasos antes de atender: llegada por código, pago y firma de asistencia.',
        keywords: 'llegada checkin check-in otp codigo whatsapp verificacion pago firma asistencia flujo pasos preparar paciente iniciar atencion',
        perm: PERM.CLINICAS_EDITAR,
      },
      {
        href: '/configuracion/biometria',
        label: 'Biometría',
        description: 'Verificación facial del paciente, umbrales y check-in automático.',
        keywords: 'facial rostro foto de control identidad umbral confianza verificacion biometrica',
        perm: PERM.CLINICAS_EDITAR,
      },
    ],
  },
  {
    id: 'atencion',
    label: 'Atención clínica',
    description: 'Lo que ve y usa el profesional al atender',
    icon: Stethoscope,
    ajustes: [
      {
        href: '/configuracion/atencion',
        label: 'Pantalla del profesional',
        description: 'Elige qué pestañas ve el profesional durante una atención.',
        keywords: 'pestañas profesional atencion historia nota consulta',
        perm: PERM.CLINICAS_EDITAR,
      },
      {
        href: '/configuracion/historia-clinica',
        label: 'Historia clínica',
        description: 'Activa o desactiva las pestañas de la historia de cada paciente.',
        keywords: 'pestañas secciones modulos estetico obesidad',
        perm: PERM.CLINICAS_EDITAR,
      },
      {
        href: '/configuracion/plantillas-ordenes',
        label: 'Plantillas de órdenes',
        description: 'Plantillas reutilizables para órdenes médicas, laboratorios e imágenes.',
        keywords: 'ordenes medicas laboratorio imagenes recetas',
        perm: PERM.CLINICAS_EDITAR,
      },
    ],
  },
  {
    id: 'documentos',
    label: 'Documentos',
    description: 'Firmas electrónicas de pacientes',
    icon: FileSignature,
    ajustes: [
      {
        href: '/configuracion/consentimientos',
        label: 'Consentimientos',
        description: 'Sube PDFs, mapea campos de firma y asócialos a procedimientos.',
        keywords: 'firma pdf plantillas documenso campos consentimiento informado',
        perm: PERM.CONSENTIMIENTOS_PLANTILLAS_VER,
      },
      {
        href: '/configuracion/cartera',
        label: 'Otros documentos',
        description: 'Aceptación y compromiso de pago al aceptar una cotización.',
        keywords: 'compromiso de pago cartera cuotas cotizacion aceptacion mora deuda',
        perm: PERM.CLINICAS_EDITAR,
      },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    description: 'Medios de pago y caja física',
    icon: Wallet,
    ajustes: [
      {
        href: '/configuracion/formas-pago',
        label: 'Formas de pago',
        description: 'Los medios de pago que se usan al cobrar y al declarar el plan de pagos de una cotización.',
        keywords: 'medio de pago efectivo transferencia tarjeta credito cuotas financiamiento',
        perm: PERM.FORMAS_PAGO_VER,
      },
      {
        href: '/configuracion/cajas',
        label: 'Cajas y categorías',
        description: 'Fondo inicial y responsable de la caja de cada sede, y el catálogo de categorías de gasto.',
        keywords: 'caja fondo inicial categorias gasto egresos responsable',
        perm: PERM.CAJA_CAJAS_GESTIONAR,
      },
    ],
  },
  {
    id: 'equipo',
    label: 'Equipo',
    description: 'Quién puede hacer qué',
    icon: ShieldCheck,
    ajustes: [
      {
        href: '/configuracion/usuarios',
        label: 'Usuarios',
        description: 'Crea y gestiona las cuentas del equipo.',
        keywords: 'equipo personal colaboradores invitar profesional recepcion cuentas',
        perm: PERM.USUARIOS_VER,
      },
      {
        href: '/configuracion/roles',
        label: 'Roles y permisos',
        description: 'Define roles personalizados y sus privilegios.',
        keywords: 'permisos acceso privilegios',
        perm: PERM.ROLES_VER,
      },
      {
        href: '/configuracion/log-acciones',
        label: 'Log de acciones',
        description: 'Historial auditable de quién hizo qué y cuándo en el sistema.',
        keywords: 'auditoria historial registro cambios actividad',
        perm: PERM.CORE_VER_LOG_ACCIONES,
      },
    ],
  },
]

/** Ruta del ajuste sin el #ancla (las secciones apiladas comparten página). */
export const rutaDe = (href: string) => href.split('#')[0]

/** Categorías con solo los ajustes que el usuario puede ver; las vacías se omiten. */
export function categoriasVisibles(user: AuthUser | null | undefined): CategoriaConfig[] {
  return CATEGORIAS
    .map((c) => ({ ...c, ajustes: c.ajustes.filter((a) => !a.perm || hasPermission(user, a.perm)) }))
    .filter((c) => c.ajustes.length > 0)
}

/** Categoría a la que pertenece una ruta (incluye subrutas como /consentimientos/nuevo). */
export function categoriaDeRuta(categorias: CategoriaConfig[], pathname: string): CategoriaConfig | undefined {
  return categorias.find((c) => c.ajustes.some((a) => {
    const ruta = rutaDe(a.href)
    return pathname === ruta || pathname.startsWith(`${ruta}/`)
  }))
}

/** Pestañas de la categoría: una por ruta distinta (las secciones apiladas no generan pestañas). */
export function pestanasDe(categoria: CategoriaConfig): AjusteConfig[] {
  const vistas = new Set<string>()
  return categoria.ajustes.filter((a) => {
    const ruta = rutaDe(a.href)
    if (vistas.has(ruta)) return false
    vistas.add(ruta)
    return true
  })
}

/** Minúsculas y sin tildes, para que "recepcion" encuentre "Recepción". */
function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function buscarAjustes(categorias: CategoriaConfig[], consulta: string) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  return categorias.flatMap((c) =>
    c.ajustes
      .filter((a) => {
        const texto = normalizar(`${a.label} ${a.description} ${a.keywords ?? ''} ${c.label}`)
        return palabras.every((p) => texto.includes(p))
      })
      .map((ajuste) => ({ ajuste, categoria: c })),
  )
}

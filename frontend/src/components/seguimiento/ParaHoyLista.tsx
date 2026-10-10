'use client'

import type { ComponentType, ReactNode } from 'react'
import Link from 'next/link'
import {
  CalendarPlus, ClipboardCheck, ClipboardPen, FileText, Footprints, MoreHorizontal, NotebookPen,
  Phone, PhoneCall, Repeat, Sparkles, Stethoscope, UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon'
import { ScrollSuperpuesto } from '@/components/shared/ScrollSuperpuesto'
import { colorAvatar, iniciales } from '@/components/shared/TablaDatos'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, formatFechaLocal } from '@/lib/utils'
import type { CanalGestion, Oportunidad } from '@/types/seguimiento'

// ── Grupos: la lista se lee como "qué hay que hacer hoy", no como una tabla ──

export type GrupoClave = 'paquete' | 'nuevo' | 'valoracion' | 'cotizado' | 'otro'

export const GRUPOS: { clave: GrupoClave; titulo: string; ayuda: string; icono: LucideIcon; tono: string }[] = [
  {
    clave: 'paquete', titulo: 'Sesiones por retomar', icono: Repeat,
    ayuda: 'Compraron un paquete y ya les tocaba su siguiente sesión.',
    tono: 'bg-rose-50 text-rose-600',
  },
  {
    clave: 'nuevo', titulo: 'Interesados sin cita', icono: Sparkles,
    ayuda: 'Preguntaron por un servicio. Ofréceles una cita de valoración.',
    tono: 'bg-amber-50 text-amber-600',
  },
  {
    clave: 'valoracion', titulo: 'Después de la valoración', icono: Stethoscope,
    ayuda: 'Ya vinieron a valoración. Envíales la cotización o resuelve sus dudas.',
    tono: 'bg-sky-50 text-sky-600',
  },
  {
    clave: 'cotizado', titulo: 'Cotizaciones por cerrar', icono: FileText,
    ayuda: 'Ya tienen su cotización. Pregúntales si quieren empezar.',
    tono: 'bg-emerald-50 text-emerald-600',
  },
  {
    clave: 'otro', titulo: 'Para retomar contacto', icono: UserRound,
    ayuda: 'Pacientes a los que conviene volver a escribir.',
    tono: 'bg-violet-50 text-violet-600',
  },
]

export function grupoDe(op: Oportunidad): GrupoClave {
  if (op.tipo === 'paquete') return 'paquete'
  if (op.es_venta && op.etapa) return op.etapa
  return 'otro'
}

// ── Utilidades de presentación ──

function abrevCOP(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace('.0', '')}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`
  return `$${value.toFixed(0)}`
}

function haceDias(dias: number): string {
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

function diasEsperando(fecha: string | null): number {
  if (!fecha) return 0
  const hoy = new Date(new Date().toLocaleDateString('en-CA') + 'T00:00:00')
  return Math.round((hoy.getTime() - new Date(fecha + 'T00:00:00').getTime()) / 86_400_000)
}

const ICONO_CANAL: Partial<Record<CanalGestion, ComponentType<{ className?: string }>>> = {
  llamada: Phone,
  whatsapp_manual: WhatsAppIcon,
  whatsapp_plantilla: WhatsAppIcon,
  whatsapp_automatico: WhatsAppIcon,
  presencial: Footprints,
  nota: NotebookPen,
}

/** Link de WhatsApp (wa.me). Sin teléfono o enmascarado -> null. */
export function linkWhatsapp(op: Oportunidad): string | null {
  if (!op.telefono || op.telefono.includes('•')) return null
  const digitos = op.telefono.replace(/\D/g, '')
  if (digitos.length < 7) return null
  const numero = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola ${op.nombre.split(' ')[0]}, `)}`
}

/** Tiene sentido agendar desde la bandeja: valoración de un interesado o sesión de un paquete. */
export function puedeAgendar(op: Oportunidad): boolean {
  return (op.es_venta && op.etapa === 'nuevo') || (op.tipo === 'paquete' && !!op.item_cotizacion)
}

// ── Piezas visuales ──

/** Sesiones del paquete: hechas, la que toca y las que faltan. */
function SesionesPaquete({ sesion, total }: { sesion: number; total: number }) {
  // Un paquete de una sola sesión no necesita barra de avance.
  if (total <= 1) return null
  if (total > 12) return <span className="text-[11px] text-muted-foreground">Sesión {sesion} de {total}</span>
  return (
    <div className="flex items-center gap-2" aria-label={`Le toca la sesión ${sesion} de ${total}`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => {
          const n = i + 1
          return (
            <span
              key={n}
              className={cn(
                'h-2 w-2 rounded-full',
                n < sesion && 'bg-primary',
                n === sesion && 'bg-white ring-2 ring-amber-400',
                n > sesion && 'bg-gray-200',
              )}
            />
          )
        })}
      </div>
      <span className="text-[11px] text-muted-foreground">Sesión {sesion} de {total}</span>
    </div>
  )
}

// ── Tarjeta de una persona ──

export interface AccionesContacto {
  canGestionar: boolean
  onWhatsapp: (op: Oportunidad) => void
  onAgendar: (op: Oportunidad) => void
  onGestion: (op: Oportunidad) => void
  onPosponer: (op: Oportunidad) => void
  onPerder: (op: Oportunidad) => void
}

const AYUDA_SIN_FICHA = 'Aún no es paciente: no tiene ficha creada. Se crea al agendar su valoración.'

function Avatar({ nombre, size = 'md', sinFicha = false }: { nombre: string; size?: 'sm' | 'md'; sinFicha?: boolean }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'md' ? 'h-9 w-9 text-xs' : 'h-8 w-8 text-xs',
        sinFicha ? 'bg-gray-100 text-sm text-gray-500' : colorAvatar(nombre),
      )}
      aria-hidden
    >
      {sinFicha ? '?' : iniciales(nombre)}
    </div>
  )
}

/** Avatar y nombre. Sin ficha: avatar gris con "?" y la explicación en un tooltip. */
function Persona({ op, nombreClassName }: { op: Oportunidad; nombreClassName: string }) {
  const sinFicha = !op.paciente
  const contenido = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar nombre={op.nombre} size="sm" sinFicha={sinFicha} />
      <p className={cn('min-w-0', nombreClassName)}>
        {op.nombre}
        {sinFicha && <span className="sr-only"> ({AYUDA_SIN_FICHA})</span>}
      </p>
    </div>
  )
  if (!sinFicha) return contenido
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="min-w-0 cursor-help" tabIndex={0}>{contenido}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{AYUDA_SIN_FICHA}</TooltipContent>
    </Tooltip>
  )
}

function Etiquetas({ op }: { op: Oportunidad }) {
  const esperando = diasEsperando(op.proximo_contacto)
  return (
    <>
      {esperando > 0 && op.proximo_contacto && (
        <span
          className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
          title={`Debía contactarse el ${formatFechaLocal(op.proximo_contacto)}`}
        >
          Sin gestionar · {esperando} {esperando === 1 ? 'día' : 'días'}
        </span>
      )}
    </>
  )
}

/** Avance de un paquete: sesiones hechas y la que toca. (La etapa de una venta ya la dice el grupo.) */
function Avance({ op }: { op: Oportunidad }) {
  if (op.tipo === 'paquete' && op.detalle?.sesion && op.detalle?.total) {
    return <SesionesPaquete sesion={op.detalle.sesion} total={op.detalle.total} />
  }
  return null
}

function UltimoContacto({ op }: { op: Oportunidad }) {
  const g = op.ultima_gestion
  const IconoCanal = g ? ICONO_CANAL[g.canal] ?? PhoneCall : ClipboardCheck
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <IconoCanal className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {g
          ? `${g.resultado_nombre} · ${haceDias(op.dias_sin_movimiento)}${g.usuario_nombre ? ` · ${g.usuario_nombre}` : ''}`
          : `Nadie le ha escrito todavía · llegó ${haceDias(op.dias_sin_movimiento)}`}
      </span>
    </p>
  )
}

/** El motivo sin "sesión X de Y" cuando la barra de sesiones ya lo muestra. */
function motivoCorto(op: Oportunidad): string {
  if (op.tipo === 'paquete' && (op.detalle?.total ?? 0) > 1) {
    return op.frase.replace(/ · sesión \d+ de \d+/, '')
  }
  return op.frase
}

function valorDe(op: Oportunidad): number | null {
  return op.valor_estimado && Number(op.valor_estimado) > 0 ? Number(op.valor_estimado) : null
}

/** Botón de solo ícono con su nombre en un tooltip (y para lectores de pantalla). */
function BotonIcono({ etiqueta, className, disabled, onClick, children, variant = 'outline' }: {
  etiqueta: string
  className?: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
  variant?: 'outline' | 'default'
}) {
  const boton = (
    <Button size="icon" variant={variant} className={cn('h-8 w-8', className)} disabled={disabled} onClick={onClick} aria-label={etiqueta}>
      {children}
    </Button>
  )
  return (
    <Tooltip>
      {/* Un botón deshabilitado no recibe el mouse: el span permite ver por qué. */}
      <TooltipTrigger asChild>{disabled ? <span tabIndex={0} className="inline-flex">{boton}</span> : boton}</TooltipTrigger>
      <TooltipContent>{etiqueta}</TooltipContent>
    </Tooltip>
  )
}

/** WhatsApp, Agendar y Anotar resultado: iguales en tarjeta y en tabla. */
function AccionesRapidas({ op, acciones }: { op: Oportunidad; acciones: AccionesContacto }) {
  if (!acciones.canGestionar) return null
  const wa = linkWhatsapp(op)
  return (
    <>
      <BotonIcono
        etiqueta={wa ? 'Escribir por WhatsApp' : 'Sin teléfono para WhatsApp'}
        className="border-[#25D366]/40 text-[#25D366] hover:bg-[#25D366]/10 hover:text-[#1da851]"
        disabled={!wa}
        onClick={() => acciones.onWhatsapp(op)}
      >
        <WhatsAppIcon className="h-4 w-4" />
      </BotonIcono>
      {puedeAgendar(op) && (
        <BotonIcono
          etiqueta={op.tipo === 'paquete' ? 'Agendar su siguiente sesión' : 'Agendar cita de valoración'}
          onClick={() => acciones.onAgendar(op)}
        >
          <CalendarPlus className="h-4 w-4" />
        </BotonIcono>
      )}
      <BotonIcono etiqueta="Anotar resultado del contacto" variant="default" onClick={() => acciones.onGestion(op)}>
        <ClipboardPen className="h-4 w-4" />
      </BotonIcono>
    </>
  )
}

/** Menú de "más opciones": fecha, ficha, cotización y sacar de la lista. */
function MenuOpciones({ op, acciones }: { op: Oportunidad; acciones: AccionesContacto }) {
  const { canGestionar } = acciones
  if (!canGestionar && !op.paciente && !op.cotizacion) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground" aria-label={`Más opciones para ${op.nombre}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canGestionar && <DropdownMenuItem onClick={() => acciones.onPosponer(op)}>Cambiar fecha de contacto…</DropdownMenuItem>}
        {op.paciente && (
          <DropdownMenuItem asChild><Link href={`/pacientes/${op.paciente}`}>Ver ficha del paciente</Link></DropdownMenuItem>
        )}
        {op.cotizacion && (
          <DropdownMenuItem asChild><Link href={`/cotizaciones/${op.cotizacion}`}>Ver cotización</Link></DropdownMenuItem>
        )}
        {canGestionar && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => acciones.onPerder(op)}>Ya no le interesa…</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TarjetaContacto({ op, acciones, compacta = false }: { op: Oportunidad; acciones: AccionesContacto; compacta?: boolean }) {
  const valor = valorDe(op)
  return (
    <li className={cn(
      'flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-md',
      compacta ? 'p-3' : 'p-3.5',
    )}>
      {/* Encabezado: avatar, nombre, valor y menú. El resto usa todo el ancho. */}
      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <Persona op={op} nombreClassName="text-[13px] font-semibold leading-tight" />
          <Etiquetas op={op} />
        </div>
        {valor !== null && (
          <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-900" title="Valor estimado">
            {abrevCOP(valor)}
          </span>
        )}
        <div className="-mr-1.5"><MenuOpciones op={op} acciones={acciones} /></div>
      </div>

      <div className={cn('space-y-2', compacta ? 'mb-2.5 mt-2' : 'mb-3 mt-2.5')}>
        <p className="text-xs leading-snug text-gray-600">{motivoCorto(op)}</p>
        <Avance op={op} />
        <UltimoContacto op={op} />
      </div>

      {acciones.canGestionar && (
        <div className={cn('mt-auto flex items-center justify-end gap-1.5 border-t border-gray-100', compacta ? 'pt-2.5' : 'pt-3')}>
          <AccionesRapidas op={op} acciones={acciones} />
        </div>
      )}
    </li>
  )
}

/** Vista tabla: una fila por persona, para quien prefiere ver más a la vez. */
function TablaContactos({ personas, acciones }: { personas: Oportunidad[]; acciones: AccionesContacto }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <ScrollSuperpuesto className="max-h-[32rem]">
      <table className="w-full table-fixed text-xs">
        <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-[26%] px-4 py-2.5 font-medium">Persona</th>
            <th className="px-3 py-2.5 font-medium">Por qué</th>
            <th className="hidden w-[22%] px-3 py-2.5 font-medium xl:table-cell">Último contacto</th>
            <th className="w-20 px-3 py-2.5 text-right font-medium">Valor</th>
            <th className="w-40 px-4 py-2.5"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {personas.map((op) => {
            const valor = valorDe(op)
            return (
              <tr key={op.id} className="align-top transition-colors hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <Persona op={op} nombreClassName="truncate font-medium leading-tight" />
                    <div className="flex flex-wrap gap-1 pl-[2.625rem]"><Etiquetas op={op} /></div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <p className="text-gray-600">{motivoCorto(op)}</p>
                  <div className="mt-1.5"><Avance op={op} /></div>
                </td>
                <td className="hidden px-3 py-3 xl:table-cell"><UltimoContacto op={op} /></td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{valor !== null ? abrevCOP(valor) : '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    <AccionesRapidas op={op} acciones={acciones} />
                    <MenuOpciones op={op} acciones={acciones} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </ScrollSuperpuesto>
    </div>
  )
}

// ── Lista agrupada ──

export type VistaParaHoy = 'tarjetas' | 'columnas' | 'tabla'

function EncabezadoGrupo({ id, g, cantidad, conAyuda = true }: {
  id: string
  g: (typeof GRUPOS)[number]
  cantidad: number
  conAyuda?: boolean
}) {
  const Icono = g.icono
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', g.tono)}>
        <Icono className="h-3.5 w-3.5" />
      </span>
      <h2 id={id} className="truncate text-sm font-semibold">
        {g.titulo} <span className="font-normal text-muted-foreground tabular-nums">· {cantidad}</span>
      </h2>
      {conAyuda && <p className="hidden truncate text-xs text-muted-foreground sm:block">— {g.ayuda}</p>}
    </div>
  )
}

/** Un grupo en tarjetas o tabla. Muestra hasta 5 tarjetas (o ~8 filas en la
 * tabla) y el resto se desplaza por dentro (barra flotante): la página no se alarga. */
function GrupoLista({ g, personas, acciones, vista }: {
  g: (typeof GRUPOS)[number]
  personas: Oportunidad[]
  acciones: AccionesContacto
  vista: 'tarjetas' | 'tabla'
}) {
  return (
    <section aria-labelledby={`grupo-${vista}-${g.clave}`} className="space-y-2.5">
      <EncabezadoGrupo id={`grupo-${vista}-${g.clave}`} g={g} cantidad={personas.length} />
      {vista === 'tabla' ? (
        <TablaContactos personas={personas} acciones={acciones} />
      ) : (
        <ScrollSuperpuesto maxElementos={5}>
          {/* El margen deja ver la sombra de las tarjetas en los bordes. */}
          <ul className="grid grid-cols-1 gap-3 p-1 md:grid-cols-2 xl:grid-cols-3">
            {personas.map((op) => <TarjetaContacto key={op.id} op={op} acciones={acciones} />)}
          </ul>
        </ScrollSuperpuesto>
      )}
    </section>
  )
}

/** Columnas por tipo: solo las que tienen personas y se reparten el ancho
 * (con pocas, cada una es más ancha; si no caben, pasan a otra fila). */
function ColumnasPorTipo({ grupos, porGrupo, acciones }: {
  grupos: (typeof GRUPOS)[number][]
  porGrupo: Map<GrupoClave, Oportunidad[]>
  acciones: AccionesContacto
}) {
  return (
    <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))]">
      {grupos.map((g) => {
        const personas = porGrupo.get(g.clave)!
        return (
          <section
            key={g.clave}
            aria-labelledby={`grupo-columnas-${g.clave}`}
            className="flex max-h-[calc(100vh-15rem)] min-h-[16rem] flex-col rounded-2xl bg-gray-50/80"
          >
            <div className="px-3 pb-2 pt-3" title={g.ayuda}>
              <EncabezadoGrupo id={`grupo-columnas-${g.clave}`} g={g} cantidad={personas.length} conAyuda={false} />
            </div>
            {/* Cada columna se desplaza por su cuenta (barra flotante, sin quitar
                ancho): la página no crece con la lista. */}
            <ScrollSuperpuesto maxElementos={5}>
              <ul className="space-y-2.5 px-3 pb-3">
                {personas.map((op) => <TarjetaContacto key={op.id} op={op} acciones={acciones} compacta />)}
              </ul>
            </ScrollSuperpuesto>
          </section>
        )
      })}
    </div>
  )
}

export function ParaHoyLista({ lista, acciones, vista = 'tarjetas' }: {
  lista: Oportunidad[]
  acciones: AccionesContacto
  vista?: VistaParaHoy
}) {
  const porGrupo = new Map<GrupoClave, Oportunidad[]>()
  for (const op of lista) {
    const clave = grupoDe(op)
    porGrupo.set(clave, [...(porGrupo.get(clave) ?? []), op])
  }
  const grupos = GRUPOS.filter((g) => porGrupo.has(g.clave))

  // Columnas y tabla necesitan ancho: en pantallas angostas se ven las tarjetas.
  const tarjetas = (
    <div className="space-y-6">
      {grupos.map((g) => (
        <GrupoLista key={g.clave} g={g} personas={porGrupo.get(g.clave)!} acciones={acciones} vista="tarjetas" />
      ))}
    </div>
  )

  return (
    <TooltipProvider delayDuration={200}>
      {vista === 'tarjetas' ? tarjetas : (
        <>
          <div className="lg:hidden">{tarjetas}</div>
          <div className="hidden lg:block">
            {vista === 'columnas' ? (
              <ColumnasPorTipo grupos={grupos} porGrupo={porGrupo} acciones={acciones} />
            ) : (
              <div className="space-y-6">
                {grupos.map((g) => (
                  <GrupoLista key={g.clave} g={g} personas={porGrupo.get(g.clave)!} acciones={acciones} vista="tabla" />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </TooltipProvider>
  )
}

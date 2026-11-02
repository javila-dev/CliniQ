'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilaTarjeta, TarjetaCita } from '@/types/tarjeta'

// La hoja del paquete como la que la clínica lleva en papel: una fila por
// sesión con lo que se hizo, cuándo, quién y la firma del paciente. La hoja
// nunca pasa del alto de su columna: con pocas sesiones las filas se reparten
// ese alto (sin pasar de FILA_MAX), y con muchas (hay paquetes de 50) se
// desplaza solo la lista, que abre con la sesión de hoy como tercera visible.

const FILA_MIN = 44
const FILA_MAX = 80

function fecha(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a.slice(2)}`
}

function hora(hhmm: string | null) {
  if (!hhmm) return '—'
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

function nombreCorto(nombre: string) {
  const [primero, segundo] = nombre.split(' ')
  return segundo ? `${primero} ${segundo[0]}.` : primero
}

export interface HoyEnVivo {
  /** Lo marcado ahora en "Qué se hizo". */
  procedimientos: string[]
  /** Diagramas con marcas ahora. */
  zonas: string[]
  horaActual: string
}

/** En una hoja angosta (pantallas de 1024 px con el menú abierto) la fecha y la
 *  hora van en una sola columna, para no aplastar los procedimientos. */
const ANCHO_MINIMO_COMPLETO = 560

export function HojaPaquete({ tarjeta, hoy }: { tarjeta: TarjetaCita; hoy: HoyEnVivo }) {
  const conFirma = tarjeta.mostrar_firma_paciente
  const muchas = tarjeta.filas.length > 8
  const ref = useRef<HTMLDivElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const [angosta, setAngosta] = useState(false)
  const [altoLista, setAltoLista] = useState(0)
  // Se mide antes de pintar: si no, el primer cuadro sale con las columnas anchas.
  useLayoutEffect(() => {
    const el = ref.current
    const lista = listaRef.current
    if (!el || !lista) return
    const medir = () => {
      setAngosta(el.clientWidth < ANCHO_MINIMO_COMPLETO)
      setAltoLista(lista.clientHeight)
    }
    medir()
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    observer.observe(lista)
    return () => observer.disconnect()
  }, [])
  // Cada fila toma su parte del alto, entre FILA_MIN y FILA_MAX; una fila con
  // más contenido crece lo que necesite.
  const altoFila = altoLista
    ? Math.max(FILA_MIN, Math.min(FILA_MAX, Math.floor(altoLista / tarjeta.filas.length)))
    : FILA_MIN

  // Si la lista no cabe, se abre con la sesión de hoy como tercera fila visible
  // (dos de contexto arriba), sin mover la página.
  const indiceActual = tarjeta.filas.findIndex((f) => f.es_actual)
  const ubicada = useRef(false)
  useLayoutEffect(() => {
    const lista = listaRef.current
    if (!lista || !altoLista || ubicada.current || indiceActual < 0) return
    ubicada.current = true
    if (lista.scrollHeight <= lista.clientHeight) return
    const ancla = lista.children[Math.max(0, indiceActual - 2)] as HTMLElement | undefined
    if (ancla) lista.scrollTop = ancla.offsetTop
  }, [altoLista, indiceActual])

  const columnas = angosta
    ? (conFirma ? 'grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_3.75rem]' : 'grid-cols-[minmax(0,1fr)_4.5rem_4.5rem]')
    : (conFirma ? 'grid-cols-[minmax(0,1fr)_4.25rem_4.75rem_6.5rem_5rem]' : 'grid-cols-[minmax(0,1fr)_4.25rem_4.75rem_6.5rem]')

  return (
    <div ref={ref} className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white">
      <div className={cn('grid shrink-0 gap-x-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground', columnas)}>
        <span>Procedimientos</span>
        {angosta ? <span>Cuándo</span> : <><span>Fecha</span><span>Hora</span></>}
        <span>Profesional</span>
        {conFirma && <span>Paciente</span>}
      </div>
      <div ref={listaRef} className="relative min-h-0 flex-1 divide-y overflow-y-auto">
        {tarjeta.filas.map((fila) => (
          <Fila
            key={fila.sesion_id ?? fila.cita_id ?? fila.numero}
            fila={fila}
            columnas={columnas}
            conFirma={conFirma}
            firmaActiva={tarjeta.firma_asistencia_activa}
            compacta={muchas}
            angosta={angosta}
            altoMinimo={altoFila}
            hoy={fila.es_actual ? hoy : null}
          />
        ))}
      </div>
    </div>
  )
}

function Fila({
  fila, columnas, conFirma, firmaActiva, compacta, angosta, altoMinimo, hoy,
}: {
  fila: FilaTarjeta
  columnas: string
  conFirma: boolean
  firmaActiva: boolean
  compacta: boolean
  angosta: boolean
  altoMinimo: number
  hoy: HoyEnVivo | null
}) {
  const hecha = fila.estado === 'completado'
  const noAsistio = fila.estado === 'inasistencia'
  const pendiente = !hoy && !hecha && !noAsistio

  // Hechas: lo que se realizó (si una sesión vieja no lo guardó, lo planeado).
  // Hoy: lo marcado en este momento. Pendientes: lo planeado.
  const realizados = fila.procedimientos.filter((p) => p.realizado)
  const procedimientos = hoy
    ? fila.procedimientos.filter((p) => !p.id || hoy.procedimientos.includes(p.id))
    : hecha && realizados.length ? realizados : fila.procedimientos
  const zonas = hoy ? hoy.zonas : fila.zonas

  const firmaPaciente = fila.firma_paciente === 'firmada'
    ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-3.5 w-3.5" />Firmó</span>
    : hecha || hoy
      ? <span className="leading-tight text-muted-foreground">{firmaActiva ? 'Sin firma' : 'No se pidió'}</span>
      : <span className="text-muted-foreground">—</span>

  return (
    <div
      className={cn(
        'grid items-center gap-x-2 px-3',
        compacta ? 'py-1 text-xs' : 'py-1.5 text-[13px]',
        columnas,
        hoy && 'border-l-[3px] border-l-primary bg-primary/5',
        pendiente && 'text-muted-foreground',
      )}
      style={{ minHeight: altoMinimo }}
    >
      <div className="min-w-0">
        <p className={cn('leading-snug', hoy && 'font-medium')}>
          {procedimientos.length ? procedimientos.map((p) => p.nombre).join(' + ') : 'Sin procedimientos marcados'}
          {fila.obsequio && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-violet-50 px-1 text-[11px] font-medium text-violet-700 align-middle">
              <Gift className="h-3 w-3" />Obsequio
            </span>
          )}
        </p>
        {zonas.length > 0 && <p className="text-xs leading-snug text-muted-foreground">{zonas.join(', ')}</p>}
        {noAsistio && <p className="text-xs text-amber-700">No asistió</p>}
      </div>
      {angosta ? (
        <span className="tabular-nums leading-tight">
          {hoy ? 'Hoy' : fecha(fila.fecha)}
          {(hoy || fila.hora) && <span className="block text-muted-foreground">{hoy ? hoy.horaActual : hora(fila.hora)}</span>}
        </span>
      ) : (
        <>
          <span className="tabular-nums">{hoy ? 'Hoy' : fecha(fila.fecha)}</span>
          <span className="tabular-nums">{hoy ? hoy.horaActual : hora(fila.hora)}</span>
        </>
      )}
      <span className="min-w-0">
        {fila.profesional && (hecha || hoy) ? (
          fila.profesional.firma_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fila.profesional.firma_url}
              alt={`Firma de ${fila.profesional.nombre}`}
              title={fila.profesional.nombre}
              className="h-7 max-w-full object-contain"
            />
          ) : (
            <span className="block truncate" title={fila.profesional.nombre}>{nombreCorto(fila.profesional.nombre)}</span>
          )
        ) : '—'}
      </span>
      {conFirma && <span>{firmaPaciente}</span>}
    </div>
  )
}

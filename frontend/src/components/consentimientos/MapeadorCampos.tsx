'use client'

import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  Trash2, Loader2, GripVertical, PenLine, User, Mail, Calendar, AlignLeft,
  Hash, CheckSquare, IdCard, ArrowLeft, ArrowRight, CheckCircle2, Circle, Stethoscope, Save,
} from 'lucide-react'
import type { CampoPlantilla, RolCampoProfesional } from '@/lib/api/configuracion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

const TIPOS_PACIENTE = [
  { value: 'SIGNATURE', label: 'Firma', icon: PenLine },
  { value: 'NAME', label: 'Nombre', icon: User },
  { value: 'EMAIL', label: 'Email', icon: Mail },
  { value: 'DATE', label: 'Fecha', icon: Calendar },
  { value: 'TEXT', label: 'Texto libre', icon: AlignLeft },
  { value: 'NUMBER', label: 'Número', icon: Hash },
  { value: 'CHECKBOX', label: 'Casilla', icon: CheckSquare },
] as const

type TipoCampo = CampoPlantilla['type']

// Solo la firma es obligatoria. Nombre y TP son opcionales; la TP se ubica en consentimientos que
// la exigen (procedimientos médicos) y, si el documento la tiene, solo firma quien tenga TP cargada.
const ROLES_PROFESIONAL: { rol: RolCampoProfesional; type: TipoCampo; label: string; icon: typeof PenLine; width: number; height: number; opcional?: boolean }[] = [
  { rol: 'firma', type: 'SIGNATURE', label: 'Firma', icon: PenLine, width: 30, height: 5 },
  { rol: 'nombre', type: 'NAME', label: 'Nombre', icon: User, width: 30, height: 3, opcional: true },
  { rol: 'tp', type: 'TEXT', label: 'Tarjeta profesional (TP)', icon: IdCard, width: 30, height: 3, opcional: true },
]

// Tamaño inicial en % de la página: campos de texto delgados, como una línea del documento;
// la firma algo más alta para que quepa el trazo. La casilla queda cuadrada (la página es más alta que ancha).
const TAMANO_POR_TIPO: Record<TipoCampo, { width: number; height: number }> = {
  SIGNATURE: { width: 30, height: 5 },
  NAME: { width: 30, height: 3 },
  EMAIL: { width: 30, height: 3 },
  DATE: { width: 20, height: 3 },
  TEXT: { width: 30, height: 3 },
  NUMBER: { width: 15, height: 3 },
  CHECKBOX: { width: 3, height: 2.2 },
}

const ESTILO_FIRMANTE = {
  paciente: 'bg-sky-100/90 border-sky-500 text-sky-800',
  profesional: 'bg-violet-100/90 border-violet-500 text-violet-800',
} as const

export interface Campo extends CampoPlantilla {
  id: string
}

type Paso = 1 | 2

function nuevoId() {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function esProfesional(campo: CampoPlantilla) {
  return campo.firmante === 'profesional'
}

function normalizar(campos: CampoPlantilla[]): Campo[] {
  return campos.map(c => ({
    ...c,
    id: c.id || nuevoId(),
    firmante: c.firmante === 'profesional' ? 'profesional' : 'paciente',
  }))
}

function tieneFirmaPaciente(campos: Campo[]) {
  return campos.some(c => !esProfesional(c) && c.type === 'SIGNATURE')
}

interface MapeadorCamposProps {
  pdfUrl: string | null
  campos: CampoPlantilla[]
  requiereFirmaProfesional: boolean
  /** Paso con el que abre: una plantilla que ya tiene campos del paciente arranca en el 2. */
  pasoInicial?: Paso
  /** Parte superior del panel izquierdo (volver, nombre, archivo). */
  encabezado: ReactNode
  guardando: boolean
  guardado?: boolean
  error?: string | null
  onGuardar: (campos: CampoPlantilla[], requiereFirmaProfesional: boolean) => void
}

export function MapeadorCampos({
  pdfUrl,
  campos: camposIniciales,
  requiereFirmaProfesional: requiereInicial,
  pasoInicial = 1,
  encabezado,
  guardando,
  guardado = false,
  error,
  onGuardar,
}: MapeadorCamposProps) {
  const [campos, setCampos] = useState<Campo[]>(() => normalizar(camposIniciales))
  const [requiereProfesional, setRequiereProfesional] = useState(requiereInicial)
  const [paso, setPaso] = useState<Paso>(() =>
    pasoInicial === 2 && tieneFirmaPaciente(normalizar(camposIniciales)) ? 2 : 1,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tipoPaciente, setTipoPaciente] = useState<TipoCampo>('SIGNATURE')
  const [rolActivo, setRolActivo] = useState<RolCampoProfesional>('firma')
  const [numPages, setNumPages] = useState(0)
  // El PDF ocupa el ancho disponible de la columna central (el layout de configuración la angosta).
  const centroRef = useRef<HTMLDivElement>(null)
  const [pageWidth, setPageWidth] = useState(680)
  useEffect(() => {
    const el = centroRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const disponible = Math.floor(entries[0].contentRect.width) - 32
      setPageWidth(Math.max(320, Math.min(760, disponible)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragging = useRef<{ id: string; page: number; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizing = useRef<{ id: string; page: number; startX: number; startY: number; origW: number; origH: number } | null>(null)

  // Los campos iniciales llegan después de cargar la plantilla (página de edición).
  const camposKey = JSON.stringify(camposIniciales)
  useEffect(() => {
    const normalizados = normalizar(camposIniciales)
    setCampos(normalizados)
    setRequiereProfesional(requiereInicial)
    setPaso(pasoInicial === 2 && tieneFirmaPaciente(normalizados) ? 2 : 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camposKey, requiereInicial, pasoInicial])

  const camposPaciente = campos.filter(c => !esProfesional(c))
  const camposProfesional = campos.filter(esProfesional)
  const rolesUbicados = new Set(camposProfesional.map(c => c.rol))
  const faltanRoles = ROLES_PROFESIONAL.filter(r => !r.opcional && !rolesUbicados.has(r.rol))
  const puedeCompletarPaso1 = tieneFirmaPaciente(campos)
  const puedeGuardar = puedeCompletarPaso1 && (!requiereProfesional || faltanRoles.length === 0) && !guardando

  const editable = (campo: Campo) =>
    paso === 1 ? !esProfesional(campo) : esProfesional(campo) && requiereProfesional

  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    const el = pageRefs.current.get(pageNum)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = Math.min(((e.clientX - rect.left) / rect.width) * 100, 95)
    const y = Math.min(((e.clientY - rect.top) / rect.height) * 100, 95)

    if (paso === 1) {
      const tipo = TIPOS_PACIENTE.find(t => t.value === tipoPaciente)
      const campo: Campo = {
        id: nuevoId(), type: tipoPaciente, page: pageNum, positionX: x, positionY: y,
        ...TAMANO_POR_TIPO[tipoPaciente],
        label: tipo?.label ?? tipoPaciente, required: true, firmante: 'paciente',
      }
      setCampos(prev => [...prev, campo])
      setSelectedId(campo.id)
      return
    }

    if (!requiereProfesional) return
    const rol = ROLES_PROFESIONAL.find(r => r.rol === rolActivo)!
    const existente = campos.find(c => esProfesional(c) && c.rol === rol.rol)
    if (existente) {
      // Cada campo del profesional va una sola vez: un clic lo mueve.
      setCampos(prev => prev.map(c => c.id === existente.id ? { ...c, page: pageNum, positionX: x, positionY: y } : c))
      setSelectedId(existente.id)
      return
    }
    const campo: Campo = {
      id: nuevoId(), type: rol.type, page: pageNum, positionX: x, positionY: y,
      width: rol.width, height: rol.height, label: rol.label, required: true,
      firmante: 'profesional', rol: rol.rol,
    }
    const restantes = ROLES_PROFESIONAL.filter(r => r.rol !== rol.rol && !r.opcional && !rolesUbicados.has(r.rol))
    setCampos(prev => [...prev, campo])
    setSelectedId(campo.id)
    if (restantes.length > 0) setRolActivo(restantes[0].rol)
  }, [paso, tipoPaciente, requiereProfesional, rolActivo, campos, rolesUbicados])

  const onMouseDownDrag = (e: React.MouseEvent, campo: Campo) => {
    e.stopPropagation()
    if (!editable(campo)) return
    dragging.current = { id: campo.id, page: campo.page, startX: e.clientX, startY: e.clientY, origX: campo.positionX, origY: campo.positionY }
    setSelectedId(campo.id)
  }

  const onMouseDownResize = (e: React.MouseEvent, campo: Campo) => {
    e.stopPropagation()
    if (!editable(campo)) return
    resizing.current = { id: campo.id, page: campo.page, startX: e.clientX, startY: e.clientY, origW: campo.width, origH: campo.height }
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragging.current
      if (drag) {
        const el = pageRefs.current.get(drag.page)
        if (el) {
          const rect = el.getBoundingClientRect()
          const dx = ((e.clientX - drag.startX) / rect.width) * 100
          const dy = ((e.clientY - drag.startY) / rect.height) * 100
          setCampos(prev => prev.map(c =>
            c.id === drag.id
              ? { ...c, positionX: Math.max(0, Math.min(95, drag.origX + dx)), positionY: Math.max(0, Math.min(95, drag.origY + dy)) }
              : c,
          ))
        }
      }
      const resize = resizing.current
      if (resize) {
        const el = pageRefs.current.get(resize.page)
        if (el) {
          const rect = el.getBoundingClientRect()
          const dw = ((e.clientX - resize.startX) / rect.width) * 100
          const dh = ((e.clientY - resize.startY) / rect.height) * 100
          setCampos(prev => prev.map(c =>
            c.id === resize.id
              ? { ...c, width: Math.max(2, resize.origW + dw), height: Math.max(1.5, resize.origH + dh) }
              : c,
          ))
        }
      }
    }
    const onUp = () => { dragging.current = null; resizing.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const updateCampo = (id: string, patch: Partial<Campo>) =>
    setCampos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))

  const deleteCampo = (id: string) => {
    setCampos(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const irAPaso = (nuevo: Paso) => {
    setPaso(nuevo)
    setSelectedId(null)
    if (nuevo === 2 && faltanRoles.length > 0) setRolActivo(faltanRoles[0].rol)
  }

  const irACampo = (campo: Campo) => {
    setSelectedId(campo.id)
    pageRefs.current.get(campo.page)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const guardar = () => {
    const finales = requiereProfesional ? campos : camposPaciente
    onGuardar(finales.map(({ ...c }) => c), requiereProfesional)
  }

  const selected = campos.find(c => c.id === selectedId)
  const selectedEditable = selected ? editable(selected) : false

  return (
    // Editor a pantalla completa: dentro del layout de configuración el PDF queda sin espacio.
    <div className="fixed inset-0 z-[60] flex overflow-hidden bg-white">
      {/* Panel izquierdo — pasos */}
      <aside className="w-60 shrink-0 border-r bg-white flex flex-col">
        <div className="px-3 py-3 border-b">{encabezado}</div>

        <ol className="px-3 py-3 border-b space-y-1.5">
          {([
            { n: 1 as Paso, titulo: 'Campos del paciente', listo: puedeCompletarPaso1 },
            { n: 2 as Paso, titulo: 'Campos del profesional', listo: !requiereProfesional || faltanRoles.length === 0 },
          ]).map(({ n, titulo, listo }) => (
            <li
              key={n}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs',
                paso === n ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground',
              )}
            >
              <span className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                paso === n && 'bg-primary text-primary-foreground',
                paso !== n && listo && paso > n && 'bg-emerald-500 text-white',
                paso !== n && !(listo && paso > n) && 'bg-gray-200 text-gray-800',
              )}>
                {listo && paso > n ? '✓' : n}
              </span>
              {titulo}
            </li>
          ))}
        </ol>

        {paso === 1 ? (
          <>
            <div className="px-3 py-3 space-y-1 flex-1 overflow-y-auto">
              <p className="text-xs text-muted-foreground mb-2">
                Elige el tipo y haz clic en el PDF donde debe ir. Necesitas al menos una <strong>firma del paciente</strong>.
              </p>
              {TIPOS_PACIENTE.map(t => {
                const Icon = t.icon
                const active = tipoPaciente === t.value
                return (
                  <button
                    key={t.value}
                    onClick={() => setTipoPaciente(t.value)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2.5',
                      active ? ESTILO_FIRMANTE.paciente : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', active ? 'bg-white/60' : 'bg-gray-100')}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {t.label}
                  </button>
                )
              })}
            </div>
            <div className="px-3 py-3 border-t space-y-2">
              <Button className="w-full" size="sm" disabled={!puedeCompletarPaso1} onClick={() => irAPaso(2)}>
                Completar campos del paciente
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
              {!puedeCompletarPaso1 && (
                <p className="text-[11px] text-center text-amber-700">Falta ubicar la firma del paciente.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="px-3 py-3 space-y-3 flex-1 overflow-y-auto">
              <label className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer">
                <span className="text-xs font-medium leading-snug">
                  Esta plantilla no requiere firma del profesional
                </span>
                <Switch
                  checked={!requiereProfesional}
                  onCheckedChange={checked => { setRequiereProfesional(!checked); setSelectedId(null) }}
                />
              </label>

              {requiereProfesional ? (
                <>
                  <div className="space-y-1.5">
                    {ROLES_PROFESIONAL.map(r => {
                      const Icon = r.icon
                      const ubicado = camposProfesional.find(c => c.rol === r.rol)
                      const active = rolActivo === r.rol
                      return (
                        <button
                          key={r.rol}
                          onClick={() => { setRolActivo(r.rol); if (ubicado) irACampo(ubicado) }}
                          className={cn(
                            'w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2.5',
                            active ? ESTILO_FIRMANTE.profesional : 'bg-white border-gray-100 text-gray-700 hover:bg-gray-50',
                          )}
                        >
                          <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', active ? 'bg-white/60' : 'bg-gray-100')}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="flex-1">{r.label}</span>
                          {ubicado
                            ? <span className="flex items-center gap-1 text-[10px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Ubicado</span>
                            : r.opcional
                              ? <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Circle className="h-3.5 w-3.5" />Opcional</span>
                              : <span className="flex items-center gap-1 text-[10px] text-amber-700"><Circle className="h-3.5 w-3.5" />Pendiente</span>}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Selecciona un campo y haz clic en el PDF para ubicarlo. Solo la <strong>firma</strong> es obligatoria;
                    todos se completan automáticamente con los datos del profesional que atienda la primera cita.
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Ubica la <strong>TP</strong> solo si el procedimiento la exige (por ejemplo, uno médico): así solo
                    podrá firmarlo un profesional con tarjeta profesional. Déjala sin ubicar para consentimientos que
                    firman cosmetólogas u otro personal sin TP.
                  </p>
                </>
              ) : (
                <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground flex gap-2">
                  <Stethoscope className="h-4 w-4 shrink-0 mt-0.5" />
                  El documento se sellará solo con la firma del paciente.
                </div>
              )}
            </div>

            <div className="px-3 py-3 border-t space-y-2">
              <Button className="w-full" size="sm" disabled={!puedeGuardar} onClick={guardar}>
                {guardando
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</>
                  : guardado
                    ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-300" />Guardado</>
                    : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar plantilla</>}
              </Button>
              {requiereProfesional && faltanRoles.length > 0 && (
                <p className="text-[11px] text-center text-amber-700">
                  Falta ubicar: {faltanRoles.map(r => r.label).join(', ')}.
                </p>
              )}
              {error && <p className="text-[11px] text-center text-destructive">{error}</p>}
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => irAPaso(1)}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                Volver a campos del paciente
              </Button>
            </div>
          </>
        )}
      </aside>

      {/* Centro — PDF */}
      <div ref={centroRef} className="flex-1 flex flex-col min-w-0 bg-gray-100 overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center justify-center gap-4 bg-white/90 backdrop-blur border-b px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2 border-sky-500 bg-sky-100" />Paciente</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border-2 border-violet-500 bg-violet-100" />Profesional</span>
          <span className="truncate">
            {paso === 1
              ? 'Estás ubicando los campos del paciente.'
              : requiereProfesional
                ? `Estás ubicando del profesional: ${ROLES_PROFESIONAL.find(r => r.rol === rolActivo)?.label}.`
                : 'Sin campos del profesional.'}
          </span>
        </div>
        <Document
          file={pdfUrl ?? undefined}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={
            <div className="flex items-center justify-center h-96">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {numPages > 0 && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
            const camposEnPagina = campos.filter(c => c.page === pageNum)
            return (
              <div key={pageNum} className="flex justify-center py-4">
                <div className="relative shadow-xl" style={{ width: pageWidth }}>
                  <Page pageNumber={pageNum} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  <div
                    ref={el => { if (el) pageRefs.current.set(pageNum, el); else pageRefs.current.delete(pageNum) }}
                    className={cn('absolute inset-0', paso === 2 && !requiereProfesional ? 'cursor-default' : 'cursor-crosshair')}
                    style={{ zIndex: 10 }}
                    onClick={e => handlePageClick(e, pageNum)}
                  >
                    {camposEnPagina.map(campo => {
                      const puedeEditar = editable(campo)
                      const seleccionado = selectedId === campo.id
                      const oculto = paso === 2 && esProfesional(campo) && !requiereProfesional
                      if (oculto) return null
                      return (
                        <div
                          key={campo.id}
                          onMouseDown={e => onMouseDownDrag(e, campo)}
                          onClick={e => { e.stopPropagation(); if (puedeEditar) setSelectedId(campo.id) }}
                          className={cn(
                            'absolute border-2 rounded select-none flex items-center justify-center',
                            ESTILO_FIRMANTE[esProfesional(campo) ? 'profesional' : 'paciente'],
                            puedeEditar ? 'cursor-move' : 'opacity-35 pointer-events-none',
                            seleccionado ? 'overflow-visible ring-2 ring-offset-1 ring-primary' : 'overflow-hidden',
                          )}
                          style={{
                            left: `${campo.positionX}%`,
                            top: `${campo.positionY}%`,
                            width: `${campo.width}%`,
                            height: `${campo.height}%`,
                          }}
                        >
                          {seleccionado && puedeEditar && (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); deleteCampo(campo.id) }}
                              className="absolute -top-2.5 -right-2.5 z-20 h-5 w-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-colors"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                          {campo.type === 'CHECKBOX'
                            ? <span className="pointer-events-none flex items-center justify-center w-full h-full"><span className="w-3 h-3 border-2 rounded-sm border-current" /></span>
                            : <span className="text-[10px] font-semibold truncate px-1 pointer-events-none">
                                {esProfesional(campo) ? `Profesional · ${campo.label}` : campo.label}
                              </span>}
                          {puedeEditar && (
                            <div
                              onMouseDown={e => onMouseDownResize(e, campo)}
                              className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-60 hover:opacity-100"
                              style={{ background: 'currentColor', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="absolute -bottom-5 left-0 right-0 flex justify-center">
                    <span className="text-[10px] text-muted-foreground">Página {pageNum} de {numPages}</span>
                  </div>
                </div>
              </div>
            )
          })}
          {numPages > 0 && <div className="h-8" />}
        </Document>
      </div>

      {/* Panel derecho — propiedades (en pantallas angostas se oculta: el campo se borra con la X) */}
      <aside className="hidden xl:flex w-60 shrink-0 border-l bg-white flex-col">
        <div className="px-3 py-3 border-b">
          <p className="font-semibold text-sm">Propiedades</p>
        </div>

        {selected && selectedEditable ? (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {esProfesional(selected) ? (
              <div className="space-y-1">
                <Label className="text-xs">Campo del profesional</Label>
                <p className="text-sm font-medium">{selected.label}</p>
                <p className="text-[11px] text-muted-foreground">Se completa automáticamente al firmar.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo</Label>
                  <select
                    className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                    value={selected.type}
                    onChange={e => updateCampo(selected.id, { type: e.target.value as TipoCampo })}
                  >
                    {TIPOS_PACIENTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Etiqueta</Label>
                  <Input
                    className="text-xs h-8"
                    value={selected.label ?? ''}
                    onChange={e => updateCampo(selected.id, { label: e.target.value })}
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Página</Label>
              <Input
                type="number"
                className="text-xs h-8"
                min={1}
                max={numPages}
                value={selected.page}
                onChange={e => updateCampo(selected.id, { page: Number(e.target.value) })}
              />
            </div>

            {!esProfesional(selected) && selected.type !== 'SIGNATURE' && (
              <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer">
                <span className="text-xs font-medium">Obligatorio</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={selected.required !== false}
                  onChange={e => updateCampo(selected.id, { required: e.target.checked })}
                />
              </label>
            )}

            <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteCampo(selected.id)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Eliminar campo
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2 text-muted-foreground">
            <GripVertical className="h-6 w-6 opacity-30" />
            <p className="text-xs">Haz clic en un campo para editar sus propiedades</p>
          </div>
        )}

        {(paso === 1 ? camposPaciente : requiereProfesional ? camposProfesional : []).length > 0 && (
          <div className="border-t px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {paso === 1 ? 'Campos del paciente' : 'Campos del profesional'}
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(paso === 1 ? camposPaciente : camposProfesional).map(c => (
                <button
                  key={c.id}
                  onClick={() => irACampo(c)}
                  className={cn(
                    'w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors',
                    selectedId === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50',
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', esProfesional(c) ? 'bg-violet-500' : 'bg-sky-500')} />
                  <span className="truncate flex-1">{c.label}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">p.{c.page}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}

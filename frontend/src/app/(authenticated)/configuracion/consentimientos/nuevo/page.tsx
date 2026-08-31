'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeft, Trash2, Save,
  Loader2, CheckCircle2, GripVertical,
  PenLine, User, Mail, Calendar, AlignLeft,
  Hash, CheckSquare, Upload, FileText, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { configuracionApi, type CampoPlantilla } from '@/lib/api/configuracion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

const FIELD_TYPES = [
  { value: 'SIGNATURE', label: 'Firma',       icon: PenLine,    color: 'bg-primary/15 border-primary/60 text-primary',       dot: 'bg-primary' },
  { value: 'NAME',      label: 'Nombre',      icon: User,       color: 'bg-blue-100 border-blue-400 text-blue-700',          dot: 'bg-blue-400' },
  { value: 'EMAIL',     label: 'Email',       icon: Mail,       color: 'bg-cyan-100 border-cyan-400 text-cyan-700',          dot: 'bg-cyan-400' },
  { value: 'DATE',      label: 'Fecha',       icon: Calendar,   color: 'bg-amber-100 border-amber-400 text-amber-700',       dot: 'bg-amber-400' },
  { value: 'TEXT',      label: 'Texto libre', icon: AlignLeft,  color: 'bg-slate-100 border-slate-400 text-slate-700',       dot: 'bg-slate-400' },
  { value: 'NUMBER',    label: 'Número',      icon: Hash,       color: 'bg-orange-100 border-orange-400 text-orange-700',    dot: 'bg-orange-400' },
  { value: 'CHECKBOX',  label: 'Casilla',     icon: CheckSquare,color: 'bg-emerald-100 border-emerald-400 text-emerald-700', dot: 'bg-emerald-400' },
] as const

type FieldType = typeof FIELD_TYPES[number]['value']

function getFieldStyle(type: FieldType) {
  return FIELD_TYPES.find(f => f.value === type)?.color ?? 'bg-gray-100 border-gray-400 text-gray-700'
}
function getFieldDot(type: FieldType) {
  return FIELD_TYPES.find(f => f.value === type)?.dot ?? 'bg-gray-400'
}

interface Campo extends CampoPlantilla { id: string }

function newCampo(type: FieldType, page: number, positionX: number, positionY: number): Campo {
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type, page, positionX, positionY,
    width: type === 'CHECKBOX' ? 4 : type === 'SIGNATURE' ? 35 : 30,
    height: type === 'CHECKBOX' ? 4 : 7,
    label: FIELD_TYPES.find(f => f.value === type)?.label ?? type,
    required: true,
  }
}

export default function NuevaPlantillaPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // — Form state
  const [nombre, setNombre] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  // — Mapper state
  const [campos, setCampos] = useState<Campo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth] = useState(680)
  const [addingType, setAddingType] = useState<FieldType>('SIGNATURE')
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragging = useRef<{ id: string; page: number; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizing = useRef<{ id: string; page: number; startX: number; startY: number; origW: number; origH: number } | null>(null)

  // Crear blob URL local cuando el usuario elige un archivo
  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Solo se aceptan archivos PDF.')
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      setFileError('El archivo no puede superar 20 MB.')
      return
    }
    setFileError(null)
    setFile(f)
    if (!nombre) setNombre(f.name.replace(/\.pdf$/i, ''))
    if (pdfBlob) URL.revokeObjectURL(pdfBlob)
    setPdfBlob(URL.createObjectURL(f))
  }

  useEffect(() => () => { if (pdfBlob) URL.revokeObjectURL(pdfBlob) }, [])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!file || !nombre.trim()) throw new Error('Falta nombre o archivo.')
      const plantilla = await configuracionApi.plantillasConsentimiento.upload(nombre.trim(), file)
      if (campos.length > 0) {
        await configuracionApi.plantillasConsentimiento.guardarCampos(plantilla.id, campos)
      }
      return plantilla
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
      router.push('/configuracion/consentimientos')
    },
  })

  // — Drag / resize / click handlers (idénticos al mapper existente)
  const handlePageClick = useCallback((e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    const el = pageRefs.current.get(pageNum)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    const campo = newCampo(addingType, pageNum, Math.min(x, 95), Math.min(y, 95))
    setCampos(prev => [...prev, campo])
    setSelectedId(campo.id)
  }, [addingType])

  const onMouseDownDrag = (e: React.MouseEvent, campoId: string) => {
    e.stopPropagation()
    const c = campos.find(f => f.id === campoId)
    if (!c) return
    dragging.current = { id: campoId, page: c.page, startX: e.clientX, startY: e.clientY, origX: c.positionX, origY: c.positionY }
    setSelectedId(campoId)
  }
  const onMouseDownResize = (e: React.MouseEvent, campoId: string) => {
    e.stopPropagation()
    const c = campos.find(f => f.id === campoId)
    if (!c) return
    resizing.current = { id: campoId, page: c.page, startX: e.clientX, startY: e.clientY, origW: c.width, origH: c.height }
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
              : c
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
              ? { ...c, width: Math.max(4, resize.origW + dw), height: Math.max(3, resize.origH + dh) }
              : c
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

  const selected = campos.find(c => c.id === selectedId)
  const canSave = !!file && !!nombre.trim() && !saveMutation.isPending

  // ── Sin PDF: pantalla de carga ──────────────────────────────────────────────
  if (!pdfBlob) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-gray-50">
        <div className="w-full max-w-md space-y-6 px-4">
          <div>
            <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
              <ChevronLeft className="h-4 w-4" /> Volver
            </Link>
            <h1 className="text-xl font-bold">Nueva plantilla de consentimiento</h1>
            <p className="text-sm text-muted-foreground mt-1">Sube el PDF y luego mapea los campos directamente sobre él.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Nombre de la plantilla</Label>
            <Input
              placeholder="Ej: Consentimiento toxina botulínica"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
            />
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors border-gray-200 hover:border-primary/40 hover:bg-primary/5"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium">Haz clic para seleccionar un PDF</p>
            <p className="text-xs text-muted-foreground mt-1">Máximo 20 MB</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          {fileError && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" /> {fileError}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Con PDF: mapper completo ────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* Panel izquierdo */}
      <aside className="w-52 shrink-0 border-r bg-white flex flex-col">
        <div className="px-3 py-3 border-b">
          <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver
          </Link>

          {/* Nombre editable */}
          <input
            className="mt-2 w-full text-sm font-semibold bg-transparent border-0 border-b border-dashed border-gray-200 focus:outline-none focus:border-primary pb-0.5 truncate"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Nombre de la plantilla"
          />

          {/* Cambiar PDF */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText className="h-3 w-3" />
            {file?.name ?? 'archivo.pdf'}
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

          <p className="text-[10px] text-muted-foreground mt-2">Haz clic en el PDF para agregar un campo</p>
        </div>

        <div className="px-3 py-3 space-y-1 flex-1 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tipo de campo</p>
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon
            const active = addingType === ft.value
            return (
              <button
                key={ft.value}
                onClick={() => setAddingType(ft.value)}
                className={cn(
                  'w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center gap-2.5',
                  active ? ft.color : 'bg-white border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50',
                )}
              >
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', active ? 'bg-white/60' : 'bg-gray-100')}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {ft.label}
              </button>
            )
          })}
        </div>

        <div className="px-3 py-3 border-t space-y-2">
          <Button className="w-full" size="sm" onClick={() => saveMutation.mutate()} disabled={!canSave}>
            {saveMutation.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</>
              : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar plantilla</>
            }
          </Button>
          {saveMutation.isError && (
            <p className="text-[10px] text-destructive text-center">
              {(saveMutation.error as any)?.message ?? 'Error al guardar'}
            </p>
          )}
          <p className="text-[10px] text-center text-muted-foreground">
            {campos.length} campo{campos.length !== 1 ? 's' : ''} definido{campos.length !== 1 ? 's' : ''}
          </p>
        </div>
      </aside>

      {/* Centro — PDF scroll continuo */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-100 overflow-y-auto">
        <Document
          file={pdfBlob}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<div className="flex items-center justify-center h-96"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        >
          {numPages > 0 && Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
            const camposEnPagina = campos.filter(c => c.page === pageNum)
            return (
              <div key={pageNum} className="flex justify-center py-4">
                <div className="relative shadow-xl" style={{ width: pageWidth }}>
                  <Page pageNumber={pageNum} width={pageWidth} renderTextLayer={false} renderAnnotationLayer={false} />
                  <div
                    ref={el => { if (el) pageRefs.current.set(pageNum, el); else pageRefs.current.delete(pageNum) }}
                    className="absolute inset-0 cursor-crosshair"
                    style={{ zIndex: 10 }}
                    onClick={e => handlePageClick(e, pageNum)}
                  >
                    {camposEnPagina.map(campo => (
                      <div
                        key={campo.id}
                        onMouseDown={e => onMouseDownDrag(e, campo.id)}
                        onClick={e => { e.stopPropagation(); setSelectedId(campo.id) }}
                        className={cn(
                          'absolute border-2 rounded select-none cursor-move flex items-center justify-center',
                          selectedId === campo.id ? 'overflow-visible' : 'overflow-hidden',
                          getFieldStyle(campo.type),
                          selectedId === campo.id ? 'ring-2 ring-offset-1 ring-primary' : '',
                        )}
                        style={{ left: `${campo.positionX}%`, top: `${campo.positionY}%`, width: `${campo.width}%`, height: `${campo.height}%` }}
                      >
                        {selectedId === campo.id && (
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
                          : <span className="text-[10px] font-semibold truncate px-1 pointer-events-none">{campo.label}</span>
                        }
                        <div
                          onMouseDown={e => onMouseDownResize(e, campo.id)}
                          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-60 hover:opacity-100"
                          style={{ background: 'currentColor', clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
                        />
                      </div>
                    ))}
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

      {/* Panel derecho — propiedades */}
      <aside className="w-60 shrink-0 border-l bg-white flex flex-col">
        <div className="px-3 py-3 border-b">
          <p className="font-semibold text-sm">Propiedades</p>
        </div>

        {selected ? (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <select className="w-full text-xs border rounded-md px-2 py-1.5 bg-background" value={selected.type} onChange={e => updateCampo(selected.id, { type: e.target.value as FieldType })}>
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Etiqueta</Label>
              <Input className="text-xs h-8" value={selected.label ?? ''} onChange={e => updateCampo(selected.id, { label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Página</Label>
              <Input type="number" className="text-xs h-8" min={1} max={numPages} value={selected.page} onChange={e => updateCampo(selected.id, { page: Number(e.target.value) })} />
            </div>
            {selected.type !== 'SIGNATURE' && (
              <label className="flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer">
                <span className="text-xs font-medium">Obligatorio</span>
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={selected.required !== false} onChange={e => updateCampo(selected.id, { required: e.target.checked })} />
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

        {campos.length > 0 && (
          <div className="border-t px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Todos los campos</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {campos.map(c => (
                <button key={c.id} onClick={() => setSelectedId(c.id)} className={cn('w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors', selectedId === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50')}>
                  <span className={cn('w-2 h-2 rounded-full shrink-0', getFieldDot(c.type))} />
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

'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  ChevronLeft, Trash2, Save,
  Loader2, CheckCircle2, GripVertical,
  PenLine, User, Mail, Calendar, AlignLeft,
  Hash, CheckSquare,
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

interface Campo extends CampoPlantilla {
  id: string
}

function newCampo(type: FieldType, page: number, positionX: number, positionY: number): Campo {
  return {
    id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    page,
    positionX,
    positionY,
    width: type === 'CHECKBOX' ? 4 : type === 'SIGNATURE' || type === 'FREE_SIGNATURE' ? 35 : 30,
    height: type === 'CHECKBOX' ? 4 : 7,
    label: FIELD_TYPES.find(f => f.value === type)?.label ?? type,
    required: true,
  }
}

export default function CamposMapperPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()

  const [campos, setCampos] = useState<Campo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(680)
  const [addingType, setAddingType] = useState<FieldType>('SIGNATURE')
  const [saved, setSaved] = useState(false)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const dragging = useRef<{ id: string; page: number; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizing = useRef<{ id: string; page: number; startX: number; startY: number; origW: number; origH: number } | null>(null)

  const { data: plantilla, isLoading: loadingPlantilla } = useQuery({
    queryKey: ['plantillas-consentimiento', id],
    queryFn: async () => {
      const list = await configuracionApi.plantillasConsentimiento.list()
      return list.find(p => p.id === id) ?? null
    },
  })

  useEffect(() => {
    if (plantilla?.campos?.length) {
      setCampos(plantilla.campos.map(c => ({ ...c, id: c.id || `field-${Math.random().toString(36).slice(2)}` })))
    }
  }, [plantilla])

  const saveMutation = useMutation({
    mutationFn: () => configuracionApi.plantillasConsentimiento.guardarCampos(id, campos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plantillas-consentimiento'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  const [pdfBlob, setPdfBlob] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    import('@/lib/api/client').then(({ apiClient }) => {
      apiClient.get(`/configuracion/plantillas-consentimiento/${id}/pdf/`, { responseType: 'blob' })
        .then(res => setPdfBlob(URL.createObjectURL(res.data)))
        .catch(() => {})
    })
    return () => { if (pdfBlob) URL.revokeObjectURL(pdfBlob) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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

  // Drag handlers
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

  const updateCampo = (id: string, patch: Partial<Campo>) => {
    setCampos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const deleteCampo = (id: string) => {
    setCampos(prev => prev.filter(c => c.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const selected = campos.find(c => c.id === selectedId)

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* Panel izquierdo — tipo de campo */}
      <aside className="w-52 shrink-0 border-r bg-white flex flex-col">
        <div className="px-3 py-3 border-b">
          <Link href="/configuracion/consentimientos" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <p className="font-semibold text-sm mt-2 truncate">{plantilla?.nombre ?? 'Cargando…'}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Haz clic en el PDF para agregar un campo</p>
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
                <span className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                  active ? 'bg-white/60' : 'bg-gray-100',
                )}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {ft.label}
              </button>
            )
          })}
        </div>

        <div className="px-3 py-3 border-t space-y-2">
          <Button
            className="w-full"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</>
              : saved
                ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />Guardado</>
                : <><Save className="h-3.5 w-3.5 mr-1.5" />Guardar campos</>
            }
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            {campos.length} campo{campos.length !== 1 ? 's' : ''} definido{campos.length !== 1 ? 's' : ''}
          </p>
        </div>
      </aside>

      {/* Centro — PDF páginas en scroll continuo */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-100 overflow-y-auto">
        <Document
          file={pdfBlob ?? undefined}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
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
                  <Page
                    pageNumber={pageNum}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                  {/* Overlay por página */}
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
                        style={{
                          left: `${campo.positionX}%`,
                          top: `${campo.positionY}%`,
                          width: `${campo.width}%`,
                          height: `${campo.height}%`,
                        }}
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
                  {/* Indicador de página */}
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

      {/* Panel derecho — propiedades del campo seleccionado */}
      <aside className="w-60 shrink-0 border-l bg-white flex flex-col">
        <div className="px-3 py-3 border-b">
          <p className="font-semibold text-sm">Propiedades</p>
        </div>

        {selected ? (
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <select
                className="w-full text-xs border rounded-md px-2 py-1.5 bg-background"
                value={selected.type}
                onChange={e => updateCampo(selected.id, { type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
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

            {selected.type !== 'SIGNATURE' && (
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

            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => deleteCampo(selected.id)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Eliminar campo
            </Button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2 text-muted-foreground">
            <GripVertical className="h-6 w-6 opacity-30" />
            <p className="text-xs">Haz clic en un campo para editar sus propiedades</p>
          </div>
        )}

        {/* Lista de todos los campos */}
        {campos.length > 0 && (
          <div className="border-t px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Todos los campos</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {campos.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setPage(c.page) }}
                  className={cn(
                    'w-full text-left px-2 py-1 rounded text-xs flex items-center gap-2 transition-colors',
                    selectedId === c.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50',
                  )}
                >
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

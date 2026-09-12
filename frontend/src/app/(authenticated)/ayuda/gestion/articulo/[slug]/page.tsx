'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Check, Loader2, Eye } from 'lucide-react'

import { ayudaApi, ayudaAdminApi } from '@/lib/api/ayuda'
import type { ArticuloAyudaInput } from '@/types/ayuda'
import { LoadingState } from '@/components/shared/LoadingState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/hooks/use-toast'
import { MarkdownEditor } from '@/components/ayuda/gestion/MarkdownEditor'
import { MetadataPanel, type ArticuloFormState } from '@/components/ayuda/gestion/MetadataPanel'
import { ArticuloView } from '@/components/ayuda/ArticuloView'

const VACIO: ArticuloFormState = {
  categoria: '', titulo: '', slug: '', resumen: '', contenido: '',
  video_url: '', keywords: '', area: '', destacado: false, estado: 'borrador',
}

function toPayload(f: ArticuloFormState): ArticuloAyudaInput {
  return {
    categoria: f.categoria,
    titulo: f.titulo.trim(),
    slug: f.slug.trim() || undefined,
    resumen: f.resumen.trim(),
    contenido: f.contenido,
    video_url: f.video_url.trim(),
    keywords: f.keywords.trim(),
    area: f.area,
    destacado: f.destacado,
    estado: f.estado,
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

export default function EditorArticuloPage({ params }: Props) {
  const { slug } = use(params)
  const esNuevo = slug === 'nuevo'
  const router = useRouter()
  const qc = useQueryClient()
  const { toast } = useToast()

  const categoriasQ = useQuery({ queryKey: ['ayuda', 'gestion', 'categorias'], queryFn: ayudaApi.categorias })
  const articuloQ = useQuery({
    queryKey: ['ayuda', 'gestion', 'articulo', slug],
    queryFn: () => ayudaApi.articulo(slug, { preview: true }),
    enabled: !esNuevo,
  })

  const [form, setForm] = useState<ArticuloFormState>(VACIO)
  const guardadoRef = useRef<string>(JSON.stringify(VACIO))
  const [slugActual, setSlugActual] = useState<string | null>(esNuevo ? null : slug)
  const [slugPublicado, setSlugPublicado] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ultimoGuardado, setUltimoGuardado] = useState<Date | null>(null)
  const [confirmarSalida, setConfirmarSalida] = useState<null | (() => void)>(null)

  // Hidratar el form cuando llega el artículo
  useEffect(() => {
    if (esNuevo || !articuloQ.data) return
    const a = articuloQ.data
    const next: ArticuloFormState = {
      categoria: a.categoria, titulo: a.titulo, slug: a.slug, resumen: a.resumen,
      contenido: a.contenido, video_url: a.video_url, keywords: a.keywords,
      area: a.area, destacado: a.destacado, estado: a.estado,
    }
    setForm(next)
    guardadoRef.current = JSON.stringify(next)
    setSlugActual(a.slug)
    setSlugPublicado(a.estado === 'publicado' ? a.slug : null)
  }, [esNuevo, articuloQ.data])

  const dirty = JSON.stringify(form) !== guardadoRef.current
  const puedeGuardar = !!form.titulo.trim() && !!form.categoria && !guardando

  const patch = useCallback((p: Partial<ArticuloFormState>) => setForm((f) => ({ ...f, ...p })), [])

  const guardar = useCallback(
    async (opts?: { silencioso?: boolean }): Promise<void> => {
      if (!form.titulo.trim() || !form.categoria) return
      setGuardando(true)
      try {
        const payload = toPayload(form)
        let resultSlug: string
        if (slugActual) {
          const res = await ayudaAdminApi.actualizarArticulo(slugActual, payload)
          resultSlug = res.slug
          setSlugPublicado(res.estado === 'publicado' ? res.slug : null)
        } else {
          const res = await ayudaAdminApi.crearArticulo(payload)
          resultSlug = res.slug
          setSlugPublicado(res.estado === 'publicado' ? res.slug : null)
        }
        guardadoRef.current = JSON.stringify({ ...form, slug: resultSlug })
        setForm((f) => ({ ...f, slug: resultSlug }))
        setSlugActual(resultSlug)
        setUltimoGuardado(new Date())
        qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'articulos'] })
        qc.invalidateQueries({ queryKey: ['ayuda', 'gestion', 'categorias'] })
        if (!opts?.silencioso) toast({ title: 'Guardado' })
        if (esNuevo || resultSlug !== slug) {
          router.replace(`/ayuda/gestion/articulo/${resultSlug}`)
        }
      } catch (e) {
        const data = (e as { response?: { data?: Record<string, unknown> } })?.response?.data
        const msg =
          (data?.error as string) ||
          (typeof data === 'object' && data ? Object.values(data).flat()[0] : null) ||
          'No se pudo guardar'
        toast({ title: String(msg), variant: 'destructive' })
      } finally {
        setGuardando(false)
      }
    },
    [form, slugActual, esNuevo, slug, router, qc, toast],
  )

  // Autosave: solo cuando el artículo ya existe (tiene slug real)
  useEffect(() => {
    if (!slugActual || !dirty || guardando) return
    const t = setTimeout(() => void guardar({ silencioso: true }), 3000)
    return () => clearTimeout(t)
  }, [form, slugActual, dirty, guardando, guardar])

  // Aviso al cerrar la pestaña con cambios sin guardar
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const navegarConGuardia = useCallback(
    (fn: () => void) => {
      if (dirty) setConfirmarSalida(() => fn)
      else fn()
    },
    [dirty],
  )

  const categorias = categoriasQ.data ?? []
  const estadoGuardado = useMemo(() => {
    if (guardando) return { icon: Loader2, texto: 'Guardando…', spin: true }
    if (dirty) return { icon: null, texto: 'Cambios sin guardar', spin: false }
    if (ultimoGuardado) return { icon: Check, texto: 'Guardado', spin: false }
    return null
  }, [guardando, dirty, ultimoGuardado])

  if (!esNuevo && articuloQ.isLoading) return <LoadingState rows={6} />
  if (!esNuevo && articuloQ.isError) return <ErrorState message="No encontramos este artículo." onRetry={() => articuloQ.refetch()} />

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={() => navegarConGuardia(() => router.push('/ayuda/gestion'))}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Gestión del centro de ayuda
        </button>

        <div className="flex items-center gap-3">
          {estadoGuardado && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {estadoGuardado.icon && (
                <estadoGuardado.icon className={estadoGuardado.spin ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5 text-emerald-600'} />
              )}
              {estadoGuardado.texto}
            </span>
          )}
          {slugActual && (
            <Button variant="outline" size="sm" asChild>
              <a href={`/ayuda/articulo/${slugActual}?preview=1`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Previsualizar como staff
              </a>
            </Button>
          )}
          <Button size="sm" onClick={() => void guardar()} disabled={!puedeGuardar}>
            Guardar
          </Button>
        </div>
      </div>

      <Input
        value={form.titulo}
        onChange={(e) => patch({ titulo: e.target.value })}
        placeholder="Título del artículo"
        className="mb-4 h-auto border-0 border-b bg-transparent px-0 py-2 text-2xl font-bold tracking-tight focus-visible:ring-0"
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <Tabs defaultValue="editar" className="lg:hidden">
            <TabsList className="mb-3">
              <TabsTrigger value="editar">Editar</TabsTrigger>
              <TabsTrigger value="preview"><Eye className="mr-1.5 h-3.5 w-3.5" />Vista previa</TabsTrigger>
            </TabsList>
            <TabsContent value="editar">
              <MarkdownEditor value={form.contenido} onChange={(v) => patch({ contenido: v })} />
            </TabsContent>
            <TabsContent value="preview">
              <div className="rounded-xl border bg-card p-4">
                <ArticuloView contenido={form.contenido} videoUrl={form.video_url} />
              </div>
            </TabsContent>
          </Tabs>

          <div className="hidden gap-4 lg:grid lg:grid-cols-2">
            <MarkdownEditor value={form.contenido} onChange={(v) => patch({ contenido: v })} />
            <div className="min-h-[380px] overflow-y-auto rounded-xl border bg-card p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista previa</p>
              <ArticuloView contenido={form.contenido} videoUrl={form.video_url} />
            </div>
          </div>
        </div>

        <MetadataPanel value={form} onPatch={patch} categorias={categorias} slugPublicado={slugPublicado} />
      </div>

      <ConfirmDialog
        open={!!confirmarSalida}
        onOpenChange={(v) => !v && setConfirmarSalida(null)}
        title="Salir sin guardar"
        description="Tienes cambios sin guardar. Si sales ahora se perderán."
        confirmLabel="Salir sin guardar"
        variant="destructive"
        onConfirm={() => { const fn = confirmarSalida; setConfirmarSalida(null); fn?.() }}
      />
    </div>
  )
}

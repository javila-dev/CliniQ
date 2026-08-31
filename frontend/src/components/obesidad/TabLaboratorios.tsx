'use client'

import { useRef, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Loader2, FlaskConical, FileText, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { obesidadApi } from '@/lib/api/obesidad'
import { formatDate } from '@/lib/utils'
import type { ResultadoLaboratorioInput, TipoLaboratorio } from '@/types/obesidad'

const TIPO_LABELS: Record<TipoLaboratorio, string> = {
  glucosa:   'Glucosa / Insulina',
  hba1c:     'HbA1c',
  lipidos:   'Perfil lipídico',
  hepatico:  'Función hepática',
  tiroideo:  'Perfil tiroideo',
  hemograma: 'Hemograma',
  otro:      'Otro',
}

const TIPO_COLORS: Record<TipoLaboratorio, string> = {
  glucosa:   'bg-amber-50 text-amber-700 border-amber-200',
  hba1c:     'bg-orange-50 text-orange-700 border-orange-200',
  lipidos:   'bg-blue-50 text-blue-700 border-blue-200',
  hepatico:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  tiroideo:  'bg-violet-50 text-violet-700 border-violet-200',
  hemograma: 'bg-rose-50 text-rose-700 border-rose-200',
  otro:      'bg-gray-50 text-gray-700 border-gray-200',
}

interface Props {
  pacienteId: string
}

interface FormValues {
  fecha: string
  tipo: TipoLaboratorio | ''
  observaciones: string
}

const EMPTY: FormValues = {
  fecha: new Date().toISOString().slice(0, 10),
  tipo: '',
  observaciones: '',
}

export function TabLaboratorios({ pacienteId }: Props) {
  const [open, setOpen] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['obesidad-laboratorios', pacienteId],
    queryFn: () => obesidadApi.laboratorios.list(pacienteId),
    enabled: Boolean(pacienteId),
    staleTime: 30_000,
  })

  const laboratorios = data?.results ?? []

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ defaultValues: EMPTY })

  const { mutate, isPending } = useMutation({
    mutationFn: (values: FormValues) => {
      const payload: ResultadoLaboratorioInput = {
        paciente: pacienteId,
        fecha: values.fecha,
        tipo: values.tipo as TipoLaboratorio,
        observaciones: values.observaciones,
        archivo: archivo ?? undefined,
      }
      return obesidadApi.laboratorios.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obesidad-laboratorios', pacienteId] })
      toast({ title: 'Resultado registrado' })
      reset(EMPTY)
      setArchivo(null)
      setOpen(false)
    },
    onError: () => {
      toast({ title: 'Error al guardar el laboratorio', variant: 'destructive' })
    },
  })

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Resultados de laboratorio</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{laboratorios.length} resultado{laboratorios.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Registrar resultado
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-16 rounded-lg bg-muted" />)}
        </div>
      ) : laboratorios.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin resultados registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {laboratorios.map((lab) => (
            <div key={lab.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${TIPO_COLORS[lab.tipo]}`}>
                      {TIPO_LABELS[lab.tipo]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(lab.fecha)}</span>
                  </div>
                  {lab.observaciones && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{lab.observaciones}</p>
                  )}
                </div>
                {lab.archivo_url && (
                  <a
                    href={lab.archivo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar resultado de laboratorio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((v) => mutate(v))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha <span className="text-destructive">*</span></Label>
                <Input type="date" {...register('fecha', { required: true })} />
                {errors.fecha && <p className="text-xs text-destructive">Requerida</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Tipo <span className="text-destructive">*</span></Label>
                <Controller
                  control={control}
                  name="tipo"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(TIPO_LABELS) as [TipoLaboratorio, string][]).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.tipo && <p className="text-xs text-destructive">Requerido</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Archivo PDF (opcional)</Label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Seleccionar archivo
                </Button>
                {archivo && <span className="text-xs text-muted-foreground truncate max-w-40">{archivo.name}</span>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Observaciones</Label>
              <Textarea
                rows={3}
                placeholder="Hallazgos relevantes, valores fuera de rango, interpretación clínica…"
                {...register('observaciones')}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

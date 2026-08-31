'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { pacientesApi } from '@/lib/api/pacientes'
import type { CargaMasivaResultado } from '@/lib/api/pacientes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'

interface CargaMasivaPacientesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CargaMasivaPacientesModal({ open, onOpenChange }: CargaMasivaPacientesModalProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<CargaMasivaResultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setArchivo(null)
    setResultado(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleClose(v: boolean) {
    if (!v) {
      if (resultado && resultado.creados > 0) {
        queryClient.invalidateQueries({ queryKey: ['pacientes'] })
      }
      reset()
    }
    onOpenChange(v)
  }

  async function handleCargar() {
    if (!archivo) return
    setCargando(true)
    setError(null)
    try {
      const res = await pacientesApi.cargaMasiva(archivo)
      setResultado(res)
      if (res.creados > 0) {
        toast.success(`${res.creados} paciente${res.creados !== 1 ? 's' : ''} creado${res.creados !== 1 ? 's' : ''}`)
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'No se pudo procesar el archivo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4.5 w-4.5 text-primary" />
            Carga masiva de pacientes
          </DialogTitle>
        </DialogHeader>

        {!resultado ? (
          <div className="space-y-4">
            <a
              href="/plantillas/plantilla_carga_pacientes.xlsx"
              download
              className="flex items-center gap-2 text-sm text-primary hover:underline w-fit"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar plantilla de ejemplo
            </a>

            <div className="rounded-lg border border-dashed p-5 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Upload className="h-7 w-7 text-muted-foreground/40 mx-auto mb-2" />
              {archivo ? (
                <p className="text-sm font-medium">{archivo.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Selecciona el archivo .xlsx ya diligenciado</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fileInputRef.current?.click()}
              >
                {archivo ? 'Cambiar archivo' : 'Elegir archivo'}
              </Button>
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg bg-muted/40 border px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <p className="text-sm">
                <span className="font-semibold">{resultado.creados}</span> de{' '}
                <span className="font-semibold">{resultado.total_filas}</span> pacientes creados correctamente.
              </p>
            </div>

            {resultado.errores.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  {resultado.errores.length} fila{resultado.errores.length !== 1 ? 's' : ''} con errores — corrígelas y vuelve a cargar solo esas filas
                </p>
                <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Fila</th>
                        <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Documento</th>
                        <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resultado.errores.map((e) => (
                        <tr key={e.fila}>
                          <td className="px-2.5 py-1.5 tabular-nums">{e.fila}</td>
                          <td className="px-2.5 py-1.5">{e.documento ?? '—'}</td>
                          <td className="px-2.5 py-1.5 text-destructive">{e.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!resultado ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button onClick={handleCargar} disabled={!archivo || cargando}>
                {cargando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Cargar
              </Button>
            </>
          ) : (
            <>
              {resultado.errores.length > 0 && (
                <Button variant="outline" onClick={reset}>Cargar otro archivo</Button>
              )}
              <Button onClick={() => handleClose(false)}>Listo</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

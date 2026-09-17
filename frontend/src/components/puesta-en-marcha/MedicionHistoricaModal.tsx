'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MEDICION_FIELDS, type FieldKey } from '@/components/obesidad/medicionFields'
import type { MedicionHistoricaInput } from '@/types/migracion'

const today = () => new Date().toLocaleDateString('en-CA')

type FormValues = { fecha: string } & Record<FieldKey, string>

const vacio = (fecha = ''): FormValues => ({
  fecha,
  peso_kg: '', talla_cm: '', presion_sistolica: '', presion_diastolica: '',
  frecuencia_cardiaca: '', frecuencia_respiratoria: '', temperatura_c: '', saturacion_oxigeno: '',
  cintura_cm: '', cadera_cm: '', brazo_cm: '', muslo_cm: '',
  abdomen_alto_cm: '', abdomen_medio_cm: '', abdomen_bajo_cm: '',
  pierna_derecha_alto_cm: '', pierna_derecha_bajo_cm: '',
  pierna_izquierda_alto_cm: '', pierna_izquierda_bajo_cm: '',
  grasa_corporal_pct: '', masa_muscular_kg: '', grasa_visceral: '', agua_corporal_pct: '',
})

/** Mismo formulario de medidas antropométricas que la pestaña Seguimiento
 *  (mismos campos, mismo toggle), pero en vez de guardar directo contra la
 *  API, devuelve el registro para que el wizard lo mande junto con el resto
 *  de la carga — así queda dentro de la misma transacción y del manifest
 *  del lote (se puede revertir con el resto). */
export function MedicionHistoricaModal({ initial, onSave, onClose }: {
  initial?: MedicionHistoricaInput | null
  onSave: (m: MedicionHistoricaInput) => void
  onClose: () => void
}) {
  const [values, setValues] = useState<FormValues>(() => {
    if (!initial) return vacio(today())
    const base = vacio(initial.fecha)
    for (const f of MEDICION_FIELDS) {
      const v = initial[f.key]
      if (v != null) base[f.key] = String(v)
    }
    return base
  })
  const [activeFields, setActiveFields] = useState<Set<FieldKey>>(() => {
    const s = new Set<FieldKey>(['peso_kg'])
    if (initial) for (const f of MEDICION_FIELDS) if (initial[f.key] != null) s.add(f.key)
    return s
  })

  const setCampo = (key: FieldKey, v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const toggleField = (key: FieldKey) => {
    setActiveFields((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
        setCampo(key, '')
      } else {
        next.add(key)
      }
      return next
    })
  }

  const activos = MEDICION_FIELDS.filter((f) => activeFields.has(f.key))
  const hayDatos = activos.some((f) => values[f.key].trim() !== '')
  const puedeGuardar = !!values.fecha && hayDatos

  const guardar = () => {
    const registro: MedicionHistoricaInput = { fecha: values.fecha }
    for (const f of activos) {
      const v = values[f.key].trim()
      if (v !== '') registro[f.key] = v
    }
    onSave(registro)
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar medición' : 'Nueva medición'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Fecha</Label>
            <Input type="date" max={today()} value={values.fecha} onChange={(e) => setValues((prev) => ({ ...prev, fecha: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Medidas</p>
            <div className="flex gap-1.5 flex-wrap">
              {MEDICION_FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleField(f.key)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    activeFields.has(f.key)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {activos.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}{f.unit ? ` (${f.unit})` : ''}</Label>
                <Input
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  placeholder={f.placeholder}
                  value={values[f.key]}
                  onChange={(e) => setCampo(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" disabled={!puedeGuardar} onClick={guardar}>
              <Save className="h-3.5 w-3.5 mr-1.5" />Guardar
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

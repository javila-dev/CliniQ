'use client'

import Link from 'next/link'
import { LayoutList } from 'lucide-react'
import { useVistaAtencionClinica } from '@/hooks/usePestanasClinica'
import type { VistaAtencion } from '@/types/usuarios'
import { avisarGuardado, FilaAjuste, NotaAjuste, SeccionAjustes, SelectAjuste } from './ajustes'
import { DESCRIPCION_VISTA, NOMBRE_VISTA } from './vistaAtencion'

const OPCIONES = (['completa', 'sencilla'] as const).map((v) => ({ value: v, label: NOMBRE_VISTA[v] }))

/** Vista de la atención para toda la clínica (el rol y el usuario la pueden cambiar). */
export function VistaAtencionAjuste() {
  const { vista, cargando, guardando, error, cambiar } = useVistaAtencionClinica()

  function elegir(nueva: VistaAtencion, conDeshacer = true) {
    const anterior = vista
    cambiar(nueva, () => avisarGuardado(conDeshacer ? () => elegir(anterior, false) : undefined))
  }

  return (
    <div className="space-y-2">
      <SeccionAjustes titulo="Vista al atender" descripcion="Con qué pantalla registra la atención tu equipo.">
        <FilaAjuste icono={LayoutList} titulo={`Vista ${NOMBRE_VISTA[vista].toLowerCase()}`} descripcion={DESCRIPCION_VISTA[vista]}>
          <SelectAjuste
            valor={vista}
            opciones={OPCIONES}
            onCambiar={(v) => elegir(v as VistaAtencion)}
            deshabilitado={cargando || guardando}
            etiqueta="Vista al atender"
          />
        </FilaAjuste>
        <NotaAjuste>
          Es la de toda la clínica. Un rol o una persona pueden usar otra: se cambia en{' '}
          <Link href="/configuracion/roles" className="font-medium text-primary hover:underline">Roles</Link> o en la
          ficha de cada usuario en{' '}
          <Link href="/equipo/personal" className="font-medium text-primary hover:underline">Personal</Link>. Las dos
          vistas guardan lo mismo, así que cambiar no borra nada. Las pestañas de abajo solo aplican a la vista completa.
        </NotaAjuste>
      </SeccionAjustes>
      {Boolean(error) && <p className="text-sm text-destructive">No se pudo guardar el cambio. Intenta de nuevo.</p>}
    </div>
  )
}

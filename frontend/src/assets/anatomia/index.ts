import RostroFrontal   from './ROSTRO_FRONTAL.svg'
import RostroLateral   from './ROSTRO_LATERAL.svg'
import CuelloEscote    from './CUELLO_ESCOTE.svg'
import CuerpoAnterior  from './CUERPO_ANTERIOR.svg'
import CuerpoPosterior from './CUERPO_POSTERIOR.svg'

export { RostroFrontal, RostroLateral, CuelloEscote, CuerpoAnterior, CuerpoPosterior }

export const VISTAS_DISPONIBLES = {
  ROSTRO_FRONTAL:   'Rostro frontal',
  ROSTRO_LATERAL:   'Rostro lateral',
  CUELLO_ESCOTE:    'Cuello y escote',
  CUERPO_ANTERIOR:  'Cuerpo anterior',
  CUERPO_POSTERIOR: 'Cuerpo posterior',
} as const

export type VistaAnatomica = keyof typeof VISTAS_DISPONIBLES

export const SVG_POR_VISTA: Record<VistaAnatomica, React.FC<React.SVGProps<SVGSVGElement>>> = {
  ROSTRO_FRONTAL:   RostroFrontal,
  ROSTRO_LATERAL:   RostroLateral,
  CUELLO_ESCOTE:    CuelloEscote,
  CUERPO_ANTERIOR:  CuerpoAnterior,
  CUERPO_POSTERIOR: CuerpoPosterior,
}

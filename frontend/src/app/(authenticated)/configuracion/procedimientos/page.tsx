import { redirect } from 'next/navigation'

// Procedimientos se movió a su propia sección de primer nivel (Ventas > Catálogo),
// junto con Tratamientos: es el catálogo de lo que la clínica vende, no una configuración.
export default function ProcedimientosRedirect() {
  redirect('/catalogo?tab=procedimientos')
}

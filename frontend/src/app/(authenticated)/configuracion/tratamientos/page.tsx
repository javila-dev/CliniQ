import { redirect } from 'next/navigation'

// Tratamientos se movió a su propia sección de primer nivel (Ventas > Catálogo),
// junto con Procedimientos: es el catálogo de lo que la clínica vende, no una configuración.
export default function TratamientosRedirect() {
  redirect('/catalogo?tab=tratamientos')
}

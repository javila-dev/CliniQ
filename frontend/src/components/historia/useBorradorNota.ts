'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'

type Campo = 'motivo_consulta' | 'plan_manejo'
export type EstadoBorrador = 'sin-cambios' | 'pendiente' | 'guardando' | 'guardado' | 'error'

// Lo escrito y aún no confirmado por el servidor, por nota y campo. Vive fuera
// del componente: al cambiar de pestaña la pestaña se desmonta, y antes el texto
// sin guardar se perdía.
const BORRADORES = new Map<string, string>()
const ESPERA_AUTOGUARDADO_MS = 1500

/**
 * Texto de un campo de la nota en la atención, con autoguardado.
 * Guarda solo tras unos segundos sin escribir, y lo pendiente al salir de la
 * pestaña. Si falla, avisa y conserva el texto para reintentar.
 */
export function useBorradorNota(
  notaId: string | undefined, campo: Campo, valorServidor: string, historiaId?: string,
) {
  const queryClient = useQueryClient()
  const clave = notaId ? `${notaId}:${campo}` : ''
  const [texto, setTextoState] = useState(() => (clave && BORRADORES.get(clave)) ?? valorServidor)
  const [ultimoGuardado, setUltimoGuardado] = useState(valorServidor)
  const [estado, setEstado] = useState<EstadoBorrador>('sin-cambios')
  const textoRef = useRef(texto)
  const guardadoRef = useRef(ultimoGuardado)
  textoRef.current = texto
  guardadoRef.current = ultimoGuardado

  // El valor del servidor llega después del primer render: se usa si no hay borrador.
  useEffect(() => {
    if (!clave || BORRADORES.has(clave)) return
    setTextoState(valorServidor)
    setUltimoGuardado(valorServidor)
  }, [clave, valorServidor])

  const setTexto = (valor: string) => {
    setTextoState(valor)
    if (clave) BORRADORES.set(clave, valor)
    setEstado('pendiente')
  }

  const guardar = useCallback(async (valor: string) => {
    if (!notaId) return
    setEstado('guardando')
    try {
      await historiaClinicaApi.notas.patch(notaId, { [campo]: valor } as Partial<Record<Campo, string>>)
      setUltimoGuardado(valor)
      if (BORRADORES.get(clave) === valor) BORRADORES.delete(clave)
      setEstado('guardado')
      // Las notas en caché quedan con el texto nuevo: al volver a la pestaña no
      // reaparece el valor viejo.
      if (historiaId) queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
    } catch (err) {
      setEstado('error')
      toast.error('No se guardó lo escrito', mensajeDeError(err, 'Revisa tu conexión y vuelve a intentar.'))
    }
  }, [notaId, campo, clave, historiaId, queryClient])

  // Autoguardado tras dejar de escribir.
  useEffect(() => {
    if (!notaId || texto === ultimoGuardado) return
    const t = setTimeout(() => guardar(texto), ESPERA_AUTOGUARDADO_MS)
    return () => clearTimeout(t)
  }, [notaId, texto, ultimoGuardado, guardar])

  // Al salir de la pestaña, guardar lo pendiente.
  useEffect(() => () => {
    if (notaId && textoRef.current !== guardadoRef.current) {
      const valor = textoRef.current
      historiaClinicaApi.notas.patch(notaId, { [campo]: valor } as Partial<Record<Campo, string>>)
        .then(() => {
          if (BORRADORES.get(clave) === valor) BORRADORES.delete(clave)
          if (historiaId) queryClient.invalidateQueries({ queryKey: ['historia', historiaId, 'notas'] })
        })
        .catch(() => { /* el borrador queda en memoria y se reintenta al volver */ })
    }
  }, [notaId, campo, clave, historiaId, queryClient])

  return {
    texto,
    setTexto,
    estado,
    hayCambios: texto !== ultimoGuardado,
    guardarAhora: () => guardar(texto),
  }
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { historiaClinicaApi } from '@/lib/api/historiaClinica'
import { toast } from '@/hooks/use-toast'
import { mensajeDeError } from '@/lib/errores'
import type { NotaClinica } from '@/types/historia'

type Campo = 'motivo_consulta' | 'plan_manejo'
export type EstadoBorrador = 'sin-cambios' | 'pendiente' | 'guardando' | 'guardado' | 'error'

// Lo escrito y aún no confirmado por el servidor, por nota y campo. Vive fuera
// del componente: al cambiar de pestaña la pestaña se desmonta, y antes el texto
// sin guardar se perdía.
const BORRADORES = new Map<string, string>()
// Guardados en curso y avisos a los campos montados, por nota y campo: permiten
// esperar todo lo pendiente antes de completar la atención (AT-13).
const EN_VUELO = new Map<string, Promise<unknown>>()
const AL_GUARDAR = new Map<string, (valor: string) => void>()
const ESPERA_AUTOGUARDADO_MS = 1500

function enviar(notaId: string, campo: Campo, valor: string): Promise<void> {
  const clave = `${notaId}:${campo}`
  const envio = historiaClinicaApi.notas.patch(notaId, { [campo]: valor } as Partial<Record<Campo, string>>)
    .then(() => {
      if (BORRADORES.get(clave) === valor) BORRADORES.delete(clave)
      AL_GUARDAR.get(clave)?.(valor)
    })
  EN_VUELO.set(clave, envio)
  return envio.finally(() => { if (EN_VUELO.get(clave) === envio) EN_VUELO.delete(clave) })
}

/**
 * Envía lo escrito y aún no guardado en la nota, y espera los guardados en curso.
 * Se llama antes de completar la atención: antes, completar justo después de
 * escribir perdía lo último (el autoguardado espera unos segundos). Si algo no
 * se guarda, lanza el error para no cerrar la atención sin ese texto.
 */
export async function guardarBorradoresDeNota(notaId: string): Promise<void> {
  const prefijo = `${notaId}:`
  const enCurso = [...EN_VUELO.entries()].filter(([c]) => c.startsWith(prefijo)).map(([, p]) => p)
  await Promise.allSettled(enCurso)
  const pendientes = [...BORRADORES.entries()].filter(([c]) => c.startsWith(prefijo))
  await Promise.all(pendientes.map(([c, valor]) => enviar(notaId, c.slice(prefijo.length) as Campo, valor)))
}

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

  // Un guardado hecho desde fuera del campo (guardarBorradoresDeNota) también lo
  // deja al día, para que el autoguardado no lo vuelva a enviar.
  useEffect(() => {
    if (!clave) return
    const alGuardar = (valor: string) => {
      setUltimoGuardado(valor)
      if (textoRef.current === valor) setEstado('guardado')
    }
    AL_GUARDAR.set(clave, alGuardar)
    return () => { if (AL_GUARDAR.get(clave) === alGuardar) AL_GUARDAR.delete(clave) }
  }, [clave])

  const setTexto = (valor: string) => {
    setTextoState(valor)
    if (clave) BORRADORES.set(clave, valor)
    setEstado('pendiente')
  }

  const actualizarCache = useCallback((valor: string) => {
    if (!historiaId || !notaId) return
    queryClient.setQueryData<NotaClinica[]>(['historia', historiaId, 'notas'], (notas) =>
      notas?.map((n) => (n.id === notaId ? { ...n, [campo]: valor } : n)))
  }, [historiaId, notaId, campo, queryClient])

  const guardar = useCallback(async (valor: string) => {
    if (!notaId) return
    setEstado('guardando')
    try {
      await enviar(notaId, campo, valor)
      setUltimoGuardado(valor)
      setEstado('guardado')
      // Las notas en caché quedan con el texto nuevo: al volver a la pestaña no
      // reaparece el valor viejo. Se cambia solo ese campo; antes se recargaba
      // la historia completa en cada autoguardado (AT-18).
      actualizarCache(valor)
    } catch (err) {
      setEstado('error')
      toast.error('No se guardó lo escrito', mensajeDeError(err, 'Revisa tu conexión y vuelve a intentar.'))
    }
  }, [notaId, campo, actualizarCache])

  // Autoguardado tras dejar de escribir.
  useEffect(() => {
    if (!notaId || texto === ultimoGuardado) return
    const t = setTimeout(() => guardar(texto), ESPERA_AUTOGUARDADO_MS)
    return () => clearTimeout(t)
  }, [notaId, texto, ultimoGuardado, guardar])

  // Al salir de la pestaña, guardar lo pendiente. Solo si sigue pendiente: al
  // completar la atención ya se guardó todo y la nota ya no admite cambios.
  useEffect(() => () => {
    if (notaId && textoRef.current !== guardadoRef.current && BORRADORES.get(clave) === textoRef.current) {
      enviar(notaId, campo, textoRef.current)
        .then(() => actualizarCache(textoRef.current))
        .catch(() => { /* el borrador queda en memoria y se reintenta al volver */ })
    }
  }, [notaId, campo, clave, actualizarCache])

  return {
    texto,
    setTexto,
    estado,
    hayCambios: texto !== ultimoGuardado,
    guardarAhora: () => guardar(texto),
  }
}

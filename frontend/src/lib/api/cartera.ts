import { apiClient } from './client'
import type { Cartera, ResumenCartera, RegistrarPagoPayload, CuotaCartera, CuotaVencida } from '@/types/cartera'

export const carteraApi = {
  list: async (params?: { paciente?: string; estado?: string }): Promise<Cartera[]> => {
    const res = await apiClient.get<Cartera[]>('/cartera/', { params })
    return res.data
  },

  get: async (id: string): Promise<Cartera> => {
    const res = await apiClient.get<Cartera>(`/cartera/${id}/`)
    return res.data
  },

  resumen: async (params?: { sede_id?: string }): Promise<ResumenCartera> => {
    const res = await apiClient.get<ResumenCartera>('/cartera/resumen/', { params })
    return res.data
  },

  registrarPago: async (cuotaId: string, data: RegistrarPagoPayload): Promise<CuotaCartera> => {
    const res = await apiClient.patch<CuotaCartera>(`/cartera/cuotas/${cuotaId}/registrar_pago/`, data)
    return res.data
  },

  cuotasVencidas: async (): Promise<CuotaVencida[]> => {
    const lista = await carteraApi.list()
    const pendientes = lista.filter((c) => c.cuotas_pagadas < c.cuotas_total)
    const detalles = await Promise.all(pendientes.map((c) => carteraApi.get(c.id)))
    const hoy = new Date()
    const vencidas: CuotaVencida[] = []
    for (const cartera of detalles) {
      const cuotasCartera = cartera.cuotas ?? []
      cuotasCartera.forEach((cuota, idx) => {
        if (cuota.pagada || !cuota.fecha_esperada) return
        const fechaEsperada = new Date(cuota.fecha_esperada)
        if (fechaEsperada >= hoy) return
        const dias = Math.floor((hoy.getTime() - fechaEsperada.getTime()) / 86_400_000)
        vencidas.push({
          id: cuota.id,
          cartera_id: cartera.id,
          paciente_nombre: cartera.paciente_nombre,
          cotizacion_id: cartera.cotizacion_id,
          tipo: cuota.tipo,
          descripcion: cuota.descripcion,
          valor_esperado: cuota.valor_esperado,
          fecha_esperada: cuota.fecha_esperada,
          dias_vencida: dias,
          numero_cuota: idx + 1,
          total_cuotas: cuotasCartera.length,
        })
      })
    }
    return vencidas.sort((a, b) => b.dias_vencida - a.dias_vencida)
  },
}

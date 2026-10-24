import { apiClient } from './client'
import type {
  Ciclo,
  CobroSuscripcion,
  ConfigPago,
  DatosFacturacion,
  EmbudoActivacion,
  ExtenderPruebaRequest,
  FiltroSeguimiento,
  FiltrosPagos,
  FilaSeguimiento,
  FormularioFacturacion,
  MiSuscripcion,
  NotaSeguimiento,
  PagoManualRequest,
  PagosConsola,
  PerfilBienvenida,
  Suscripcion,
  SuscripcionAdmin,
  TarjetaNueva,
  TarjetaVista,
} from '@/types/suscripciones'

export interface DatosTarjeta {
  numero: string
  cvc: string
  expira_mes: string
  expira_anio: string
  titular: string
}

/** Tokeniza la tarjeta directo en Wompi con la llave pública: el número nunca
 *  pasa por el servidor de CliniQ. Devuelve el token y lo que sirve para mostrarla. */
export async function tokenizarTarjeta(urlApi: string, llavePublica: string, t: DatosTarjeta): Promise<{ token: string; tarjeta: TarjetaVista }> {
  const res = await fetch(`${urlApi}/tokens/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llavePublica}` },
    body: JSON.stringify({
      number: t.numero.replace(/\D/g, ''),
      cvc: t.cvc,
      exp_month: t.expira_mes.padStart(2, '0'),
      exp_year: t.expira_anio.slice(-2),
      card_holder: t.titular.trim(),
    }),
  })
  const cuerpo = await res.json().catch(() => ({}))
  if (!res.ok || cuerpo?.status !== 'CREATED') {
    const mensajes = cuerpo?.error?.messages as Record<string, string[]> | undefined
    const primero = mensajes ? Object.values(mensajes).flat()[0] : null
    throw new Error(primero ? `Revisa la tarjeta: ${primero}` : 'No pudimos validar la tarjeta. Revisa los datos.')
  }
  const d = cuerpo.data
  return {
    token: d.id,
    tarjeta: {
      marca: d.brand ?? '',
      ultimos4: d.last_four ?? '',
      expira_mes: d.exp_month ?? t.expira_mes,
      expira_anio: d.exp_year ?? t.expira_anio,
      titular: d.card_holder ?? d.name ?? t.titular,
    },
  }
}

export const suscripcionesApi = {
  mia: async (): Promise<MiSuscripcion> => {
    const res = await apiClient.get<MiSuscripcion>('/suscripcion/')
    return res.data
  },
  configPago: async (): Promise<ConfigPago> => {
    const res = await apiClient.get<ConfigPago>('/suscripcion/pago/config/')
    return res.data
  },
  contratar: async (data: TarjetaNueva & {
    plan: string
    ciclo: Ciclo
    acepta_terminos: boolean
    datos_facturacion: DatosFacturacion
  }): Promise<CobroSuscripcion> => {
    const res = await apiClient.post<CobroSuscripcion>('/suscripcion/pago/contratar/', data)
    return res.data
  },
  datosFacturacion: async (): Promise<FormularioFacturacion> => {
    const res = await apiClient.get<FormularioFacturacion>('/suscripcion/pago/facturacion/')
    return res.data
  },
  guardarFacturacion: async (data: DatosFacturacion): Promise<FormularioFacturacion> => {
    const res = await apiClient.put<FormularioFacturacion>('/suscripcion/pago/facturacion/', data)
    return res.data
  },
  cobros: async (): Promise<CobroSuscripcion[]> => {
    const res = await apiClient.get<CobroSuscripcion[]>('/suscripcion/pago/cobros/')
    return res.data
  },
  cobro: async (referencia: string): Promise<CobroSuscripcion & { suscripcion: Suscripcion }> => {
    const res = await apiClient.get<CobroSuscripcion & { suscripcion: Suscripcion }>(`/suscripcion/pago/cobros/${referencia}/`)
    return res.data
  },
  cambiarTarjeta: async (data: TarjetaNueva): Promise<Suscripcion> => {
    const res = await apiClient.post<Suscripcion>('/suscripcion/pago/tarjeta/', data)
    return res.data
  },
  cambiarPlan: async (data: { plan: string; ciclo: Ciclo }): Promise<{ cobro: CobroSuscripcion | null; suscripcion: Suscripcion }> => {
    const res = await apiClient.post<{ cobro: CobroSuscripcion | null; suscripcion: Suscripcion }>('/suscripcion/pago/cambiar-plan/', data)
    return res.data
  },
  /** Cobra ya, con la tarjeta guardada, el periodo que quedó sin pagar (mora o solo lectura). */
  reintentarPago: async (): Promise<CobroSuscripcion & { suscripcion: Suscripcion }> => {
    const res = await apiClient.post<CobroSuscripcion & { suscripcion: Suscripcion }>('/suscripcion/pago/reintentar/')
    return res.data
  },
  cancelarRenovacion: async (cancelar: boolean): Promise<Suscripcion> => {
    const res = await apiClient.post<Suscripcion>('/suscripcion/pago/cancelar/', { cancelar })
    return res.data
  },
  /** Enlace del PDF de la factura (Alegra lo da en el momento). */
  facturaPdf: async (referencia: string): Promise<{ url: string; numero: string }> => {
    const res = await apiClient.get<{ url: string; numero: string }>(`/suscripcion/pago/cobros/${referencia}/factura/`)
    return res.data
  },
  facturaPdfAdmin: async (referencia: string): Promise<{ url: string; numero: string }> => {
    const res = await apiClient.get<{ url: string; numero: string }>(`/suscripcion/admin/cobros/${referencia}/factura/`)
    return res.data
  },
  reintentarFactura: async (referencia: string): Promise<CobroSuscripcion> => {
    const res = await apiClient.post<CobroSuscripcion>(`/suscripcion/admin/cobros/${referencia}/factura/`)
    return res.data
  },
  pagosConsola: async (filtros: FiltrosPagos): Promise<PagosConsola> => {
    const params = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '' && v !== undefined))
    const res = await apiClient.get<PagosConsola>('/suscripcion/admin/pagos/', { params })
    return res.data
  },
  cobrosClinica: async (clinicaId: string): Promise<CobroSuscripcion[]> => {
    const res = await apiClient.get<CobroSuscripcion[]>(`/suscripcion/admin/${clinicaId}/cobros/`)
    return res.data
  },
  guardarPerfil: async (data: Omit<PerfilBienvenida, 'visto'>): Promise<{ perfil: PerfilBienvenida }> => {
    const res = await apiClient.post<{ perfil: PerfilBienvenida }>('/suscripcion/perfil/', data)
    return res.data
  },
  extenderPrueba: async (clinicaId: string, data: ExtenderPruebaRequest): Promise<SuscripcionAdmin> => {
    const res = await apiClient.post<SuscripcionAdmin>(`/suscripcion/admin/${clinicaId}/extender-prueba/`, data)
    return res.data
  },
  pagoManual: async (clinicaId: string, data: PagoManualRequest): Promise<SuscripcionAdmin> => {
    const res = await apiClient.post<SuscripcionAdmin>(`/suscripcion/admin/${clinicaId}/pago-manual/`, data)
    return res.data
  },
  seguimiento: async (filtro: FiltroSeguimiento): Promise<FilaSeguimiento[]> => {
    const res = await apiClient.get<FilaSeguimiento[]>('/suscripcion/admin/seguimiento/', { params: { filtro } })
    return res.data
  },
  embudo: async (semanas = 12): Promise<EmbudoActivacion> => {
    const res = await apiClient.get<EmbudoActivacion>('/suscripcion/admin/embudo/', { params: { semanas } })
    return res.data
  },
  notas: async (clinicaId: string): Promise<NotaSeguimiento[]> => {
    const res = await apiClient.get<NotaSeguimiento[]>(`/suscripcion/admin/${clinicaId}/notas/`)
    return res.data
  },
  crearNota: async (
    clinicaId: string,
    data: Pick<NotaSeguimiento, 'canal' | 'texto' | 'proximo_contacto'>,
  ): Promise<NotaSeguimiento> => {
    const res = await apiClient.post<NotaSeguimiento>(`/suscripcion/admin/${clinicaId}/notas/`, data)
    return res.data
  },
}

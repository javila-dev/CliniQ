import { apiClient } from './client'
import type {
  Proveedor, OrdenCompra,
  CreateProveedorRequest, CreateOrdenCompraRequest, RecibirOrdenRequest,
} from '@/types/proveedores'
import type { Paginated } from '@/types/common'

export interface ProveedoresFilter {
  search?: string
  categoria?: string
  activo?: boolean
  page?: number
  page_size?: number
}

export interface OrdenesFilter {
  search?: string
  estado?: string
  proveedor?: string
  sede?: string
  fecha?: string
  activo?: boolean
  page?: number
  page_size?: number
}

export const proveedoresApi = {
  listProveedores: async (params?: ProveedoresFilter): Promise<Paginated<Proveedor>> => {
    const res = await apiClient.get<Paginated<Proveedor>>('/proveedores/proveedores/', { params })
    return res.data
  },

  getProveedor: async (id: string): Promise<Proveedor> => {
    const res = await apiClient.get<Proveedor>(`/proveedores/proveedores/${id}/`)
    return res.data
  },

  createProveedor: async (data: CreateProveedorRequest): Promise<Proveedor> => {
    const res = await apiClient.post<Proveedor>('/proveedores/proveedores/', data)
    return res.data
  },

  updateProveedor: async (id: string, data: Partial<CreateProveedorRequest>): Promise<Proveedor> => {
    const res = await apiClient.patch<Proveedor>(`/proveedores/proveedores/${id}/`, data)
    return res.data
  },

  deleteProveedor: async (id: string): Promise<void> => {
    await apiClient.delete(`/proveedores/proveedores/${id}/`)
  },

  listOrdenes: async (params?: OrdenesFilter): Promise<Paginated<OrdenCompra>> => {
    const res = await apiClient.get<Paginated<OrdenCompra>>('/proveedores/ordenes-compra/', { params })
    return res.data
  },

  getOrden: async (id: string): Promise<OrdenCompra> => {
    const res = await apiClient.get<OrdenCompra>(`/proveedores/ordenes-compra/${id}/`)
    return res.data
  },

  createOrden: async (data: CreateOrdenCompraRequest): Promise<OrdenCompra> => {
    const res = await apiClient.post<OrdenCompra>('/proveedores/ordenes-compra/', data)
    return res.data
  },

  updateOrden: async (id: string, data: Partial<CreateOrdenCompraRequest>): Promise<OrdenCompra> => {
    const res = await apiClient.patch<OrdenCompra>(`/proveedores/ordenes-compra/${id}/`, data)
    return res.data
  },

  cancelarOrden: async (id: string): Promise<void> => {
    await apiClient.delete(`/proveedores/ordenes-compra/${id}/`)
  },

  recibirOrden: async (id: string, data: RecibirOrdenRequest): Promise<OrdenCompra> => {
    const res = await apiClient.post<OrdenCompra>(`/proveedores/ordenes-compra/${id}/recibir/`, data)
    return res.data
  },
}

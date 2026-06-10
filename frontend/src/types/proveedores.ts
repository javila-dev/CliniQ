export type CategoriaProveedor = 'insumos_medicos' | 'productos_belleza' | 'equipos' | 'papeleria' | 'otro'
export type EstadoOrdenCompra = 'borrador' | 'enviada' | 'recibida_parcial' | 'recibida_total' | 'cancelada'

export interface Proveedor {
  id: string
  clinica: string
  nombre: string
  nit: string
  contacto: string
  telefono: string
  email: string
  categoria: CategoriaProveedor
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ItemOrdenCompra {
  id: string
  orden: string
  insumo: string
  insumo_nombre?: string
  cantidad: string
  precio_unitario: string
  cantidad_recibida: string
  subtotal: string
  pendiente_recibir: string
}

export interface OrdenCompra {
  id: string
  proveedor: string
  proveedor_nombre?: string
  sede: string
  sede_nombre?: string
  numero: string
  fecha: string
  fecha_entrega_esperada: string | null
  estado: EstadoOrdenCompra
  notas: string
  total: string
  items: ItemOrdenCompra[]
  created_by: string
  created_at: string
  updated_at: string
  activo: boolean
}

export interface CreateProveedorRequest {
  nombre: string
  nit: string
  contacto?: string
  telefono?: string
  email?: string
  categoria: CategoriaProveedor
}

export interface CreateOrdenCompraRequest {
  proveedor: string
  sede: string
  fecha: string
  fecha_entrega_esperada?: string
  estado?: EstadoOrdenCompra
  notas?: string
  items: {
    id?: string
    insumo: string
    cantidad: string
    precio_unitario: string
  }[]
}

export interface RecibirOrdenRequest {
  items_recibidos: {
    item_id: string
    cantidad: string
  }[]
}

export type UserId = string
export type SellerId = string
export type OrderId = string
export type ProductId = string

export interface User {
  id: UserId
  email: string
  name: string
  role: 'seller' | 'admin' | 'customer'
  createdAt: string
}

export interface Seller {
  id: SellerId
  userId: UserId
  shopName: string
  status: 'pending' | 'approved' | 'suspended'
  createdAt: string
}

export interface Product {
  id: ProductId
  sellerId: SellerId
  name: string
  price: number
  stock: number
  status: 'draft' | 'active' | 'inactive'
  createdAt: string
}

export interface Order {
  id: OrderId
  userId: UserId
  sellerId: SellerId
  productId: ProductId
  quantity: number
  totalPrice: number
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  createdAt: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasNext: boolean
}

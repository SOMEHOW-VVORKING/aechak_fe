import type { Order } from '@aechak/domain'

export const MOCK_ORDERS: Order[] = [
  {
    id: '20260616-0091',
    buyerId: 'user-1',
    sellerId: 'seller-1',
    productId: 'prod-1',
    productName: '고양이 자동 급식기 스마트 5L (1개)',
    quantity: 1,
    buyerName: '김보호',
    recipientName: '김보호',
    totalPrice: 59000,
    status: 'new_order',
    createdAt: '2026-06-16T09:24:00.000Z',
  },
  {
    id: '20260616-0088',
    buyerId: 'user-2',
    sellerId: 'seller-1',
    productId: 'prod-3',
    productName: '동결건조 간식 100g (2개)',
    quantity: 2,
    buyerName: '이수민',
    recipientName: '이수민',
    totalPrice: 25000,
    status: 'preparing',
    createdAt: '2026-06-16T08:10:00.000Z',
  },
  {
    id: '20260615-0074',
    buyerId: 'user-3',
    sellerId: 'seller-1',
    productId: 'prod-2',
    productName: '대용량 모래 8.5L (1개)',
    quantity: 1,
    buyerName: '박지훈',
    recipientName: '박서연',
    totalPrice: 18900,
    status: 'shipping',
    courier: 'CJ대한통운',
    trackingNumber: '6012345678',
    createdAt: '2026-06-15T13:02:00.000Z',
  },
  {
    id: '20260613-0182',
    buyerId: 'user-4',
    sellerId: 'seller-1',
    productId: 'prod-4',
    productName: '관절 영양제 90정 (1개)',
    quantity: 1,
    buyerName: '최은영',
    recipientName: '최은영',
    totalPrice: 32000,
    status: 'delivered',
    purchaseConfirmDeadline: 'D-5',
    createdAt: '2026-06-13T10:41:00.000Z',
  },
]

const DELAY_MS = 300

export function mockFetchOrders(): Promise<Order[]> {
  return new Promise(resolve => {
    setTimeout(() => resolve(MOCK_ORDERS), DELAY_MS)
  })
}

export interface ShipmentInput {
  orderId: string
  courier: string
  trackingNumber: string
}

export function mockMarkShipped({ orderId, courier, trackingNumber }: ShipmentInput): Promise<void> {
  return new Promise(resolve => {
    setTimeout(() => {
      const order = MOCK_ORDERS.find(o => o.id === orderId)
      if (order) {
        order.status = 'shipping'
        order.courier = courier
        order.trackingNumber = trackingNumber
      }
      resolve()
    }, DELAY_MS)
  })
}

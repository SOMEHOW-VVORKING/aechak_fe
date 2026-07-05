import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrderStatus } from '@aechak/domain'
import { mockFetchOrders, mockMarkShipped, type ShipmentInput } from './orders.mock'

export const ORDERS_QUERY_KEY = ['orders'] as const

export const useOrders = () =>
  useQuery({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: mockFetchOrders,
  })

export const useMarkShipped = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ShipmentInput) => mockMarkShipped(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY }),
  })
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new_order: '신규 주문',
  preparing: '상품준비중',
  shipping: '배송중',
  delivered: '배송완료',
}

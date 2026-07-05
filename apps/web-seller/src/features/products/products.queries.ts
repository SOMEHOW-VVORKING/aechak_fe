import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Product, ProductInspectionStatus, ProductSaleStatus } from '@aechak/domain'
import {
  mockFetchProducts,
  mockRequestReinspection,
  mockSubmitAppeal,
  type AppealRequest,
  type ReinspectionRequest,
} from './products.mock'

export const PRODUCTS_QUERY_KEY = ['products'] as const

export const useProducts = () =>
  useQuery({
    queryKey: PRODUCTS_QUERY_KEY,
    queryFn: mockFetchProducts,
  })

export const useRequestReinspection = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ReinspectionRequest) => mockRequestReinspection(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  })
}

export const useSubmitAppeal = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AppealRequest) => mockSubmitAppeal(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PRODUCTS_QUERY_KEY }),
  })
}

export const SALE_STATUS_LABEL: Record<ProductSaleStatus, string> = {
  selling: '판매중',
  sold_out: '품절',
  pending: '판매 대기',
  ended: '판매종료',
  blinded: '자동 블라인드',
  suspended: '판매 중지',
}

export const INSPECTION_STATUS_LABEL: Record<ProductInspectionStatus, string> = {
  approved: '검수 통과',
  pending: '검수 대기',
  rejected: '반려',
  revision_needed: '수정 필요',
}

export function needsAttention(product: Product): boolean {
  return product.inspectionStatus === 'rejected' || product.inspectionStatus === 'revision_needed'
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ShippingPolicy } from '@aechak/domain'
import { mockFetchShippingPolicy, mockUpdateShippingPolicy } from './shipping-policy.mock'

export const SHIPPING_POLICY_QUERY_KEY = ['shipping-policy'] as const

export const useShippingPolicy = () =>
  useQuery({
    queryKey: SHIPPING_POLICY_QUERY_KEY,
    queryFn: mockFetchShippingPolicy,
  })

export const useUpdateShippingPolicy = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (policy: ShippingPolicy) => mockUpdateShippingPolicy(policy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SHIPPING_POLICY_QUERY_KEY }),
  })
}

// 택배사 목록은 더 이상 여기에 없다 — 서버 마스터(GET /sellers/couriers)가 정본이고 `@/shared/couriers`가
// 유일한 통로다. 하드코딩 배열은 코드를 소문자로 들고 있어 저장이 404/50303으로 깨졌고,
// trackingFormatPattern(송장 형식 선검증)을 지어낼 수도 없었다.

export const AVG_DISPATCH_DAY_OPTIONS = [
  { value: '1', label: '1영업일' },
  { value: '2', label: '2영업일' },
  { value: '3', label: '3영업일' },
]

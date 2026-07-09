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

export const COURIER_OPTIONS = [
  { value: 'cj', label: 'CJ대한통운' },
  { value: 'lotte', label: '롯데택배' },
  { value: 'hanjin', label: '한진택배' },
  { value: 'logen', label: '로젠택배' },
  { value: 'post', label: '우체국택배' },
]

export const AVG_DISPATCH_DAY_OPTIONS = [
  { value: '1', label: '1영업일' },
  { value: '2', label: '2영업일' },
  { value: '3', label: '3영업일' },
]

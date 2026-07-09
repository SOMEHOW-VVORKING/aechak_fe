import { useQuery } from '@tanstack/react-query'
import type { SettlementStatus } from '@aechak/domain'
import { mockFetchSettlements } from './settlements.mock'

export const SETTLEMENTS_QUERY_KEY = ['settlements'] as const

export const useSettlements = () =>
  useQuery({
    queryKey: SETTLEMENTS_QUERY_KEY,
    queryFn: mockFetchSettlements,
  })

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  pending: '정산 대기',
  scheduled: '정산 예정',
  completed: '정산 완료',
  held: '정산 보류',
}

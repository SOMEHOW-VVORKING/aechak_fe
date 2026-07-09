import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SellerApplication,
  SellerApplicationDocumentStatus,
  SellerApplicationStatus,
  SellerLegalType,
} from '@aechak/domain'
import type { StatusPillVariant } from '@aechak/design-system/web'
import { mockFetchSellerApplication, mockResubmitApplication } from './store-settings.mock'

export const SELLER_APPLICATION_QUERY_KEY = ['store-settings', 'application'] as const

// status를 안 넘기면 항상 'rejected' 픽스처(프로덕션 라우트 기본 동작, 회귀 테스트 전제) —
// 다른 상태 렌더링을 확인하고 싶을 때만 호출부에서 명시적으로 넘긴다.
export const useSellerApplication = (status?: SellerApplicationStatus) =>
  useQuery({
    queryKey: [...SELLER_APPLICATION_QUERY_KEY, status ?? 'rejected'],
    queryFn: () => mockFetchSellerApplication(status),
  })

export const useResubmitApplication = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (application: SellerApplication) => mockResubmitApplication(application),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SELLER_APPLICATION_QUERY_KEY }),
  })
}

// 셀러 유형 세분류(개인 일반/개인 사업자/법인 사업자) 옵션 — SegmentedControl에서 사용.
export const LEGAL_TYPE_OPTIONS: { value: SellerLegalType; label: string }[] = [
  { value: 'individual', label: '개인 일반' },
  { value: 'individual-business', label: '개인 사업자' },
  { value: 'corporate-business', label: '법인 사업자' },
]

export const BANK_OPTIONS = [
  { value: 'kb', label: '국민은행' },
  { value: 'shinhan', label: '신한은행' },
  { value: 'woori', label: '우리은행' },
  { value: 'hana', label: '하나은행' },
  { value: 'nh', label: 'NH농협은행' },
]

export const DOCUMENT_STATUS_META: Record<
  SellerApplicationDocumentStatus,
  { label: string; variant: StatusPillVariant }
> = {
  submitted: { label: '제출 완료', variant: 'success' },
  'resubmission-required': { label: '재제출 필요', variant: 'error' },
  'not-applicable': { label: '해당 없음', variant: 'neutral' },
}

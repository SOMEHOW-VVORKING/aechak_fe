import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSellerApplication,
  saveSellerApplicationDraft,
  submitSellerApplication,
  type SellerApplicationDetail,
} from '@aechak/api'
import type { SellerApplication, SellerLegalType } from '@aechak/domain'
import { toSaveDraftRequest, toSellerApplication, type SaveDraftInput } from './store-settings.contract'

// 입점 신청(신청자 측)을 실서버(GET/POST /seller-applications · POST /submit)에 붙이는 얇은
// 어댑터. breeds 관례대로 생성된 react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체
// useQuery/useMutation으로 감싼다. 캐시에는 와이어(SellerApplicationDetail | null)를 두고
// 도메인 변환은 읽기 시점에 한다 — saveDraft 응답(신청서 전체)을 setQueryData로 바로 반영.

export const SELLER_APPLICATION_QUERY_KEY = ['store-settings', 'application'] as const

function isApplicationNotFound(error: unknown): boolean {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return response?.status === 404 && response?.data?.errorCode === 10100
}

/**
 * 내 신청 현황. 404/10100(신청 이력 없음)은 오류가 아니라 '신규 신청 전' 상태라 null로
 * 정규화한다 — application이 undefined면 로딩/오류, null이면 아직 신청서가 없는 것.
 */
export function useSellerApplication() {
  const query = useQuery({
    queryKey: SELLER_APPLICATION_QUERY_KEY,
    queryFn: async ({ signal }): Promise<SellerApplicationDetail | null> => {
      try {
        const response = await getSellerApplication(signal)
        return response.data
      } catch (error) {
        if (isApplicationNotFound(error)) return null
        throw error
      }
    },
  })
  const application: SellerApplication | null | undefined =
    query.data === undefined ? undefined : query.data === null ? null : toSellerApplication(query.data)
  return {
    application,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  }
}

interface MutateOptions<T = void> {
  onSuccess?: (result: T) => void
  onError?: (error: unknown) => void
}

/** 임시저장(upsert). 응답이 저장된 신청서 전체라 재조회 없이 캐시에 바로 반영한다. */
export function useSaveDraft() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: SaveDraftInput) => saveSellerApplicationDraft(toSaveDraftRequest(input)),
    onSuccess: response => {
      queryClient.setQueryData(SELLER_APPLICATION_QUERY_KEY, response.data)
    },
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: SaveDraftInput, opts?: MutateOptions<SellerApplication>) =>
      mutation.mutate(input, {
        onSuccess: response => opts?.onSuccess?.(toSellerApplication(response.data)),
        onError: opts?.onError,
      }),
  }
}

/** 제출(DRAFT → SUBMITTED, 204). 성공 시 재조회로 심사 대기 화면으로 넘어간다. */
export function useSubmitApplication() {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => submitSellerApplication(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SELLER_APPLICATION_QUERY_KEY }),
  })
  return {
    isPending: mutation.isPending,
    mutate: (opts?: MutateOptions) =>
      mutation.mutate(undefined, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: opts?.onError,
      }),
  }
}

// 셀러 유형 세분류(개인 일반/개인 사업자/법인 사업자) 옵션 — SegmentedControl에서 사용.
export const LEGAL_TYPE_OPTIONS: { value: SellerLegalType; label: string }[] = [
  { value: 'individual', label: '개인 일반' },
  { value: 'individual-business', label: '개인 사업자' },
  { value: 'corporate-business', label: '법인 사업자' },
]

// 은행 코드(금융결제원 표준) — value가 BE bankCode로 그대로 저장된다.
export const BANK_OPTIONS = [
  { value: '004', label: '국민은행' },
  { value: '088', label: '신한은행' },
  { value: '020', label: '우리은행' },
  { value: '081', label: '하나은행' },
  { value: '011', label: 'NH농협은행' },
]

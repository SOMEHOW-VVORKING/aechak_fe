import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveSellerClaim,
  completeSellerClaimCollection,
  getSellerClaim,
  getSellerClaims,
  rejectSellerClaim,
  reshipSellerClaim,
  startSellerClaimCollection,
  updateSellerClaimMemo,
} from '@aechak/api'
import type { ReturnCostBearer, SellerClaimListData } from './claims.contract'
import { normalizeClaimSearchParams, type SellerClaimSearchInput } from './claims.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(breeds·products 관례) 이 파일이 자체
// useQuery/useMutation으로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로 여기서
// 벗기고, 204 경로는 본문이 없어 벗길 것이 없다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

// 목록·상세가 이 접두를 공유한다 — 처리 뒤 접두 무효화 한 번으로 목록, 열려 있는 상세 Drawer,
// 탭 배지까지 갱신된다(main.tsx staleTime 60초라 무효화가 필수).
export const CLAIMS_QUERY_KEY = ['claims'] as const

export const useClaims = (input: SellerClaimSearchInput) => {
  // 정규화한 값으로 키를 만든다 — `{ status: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const params = normalizeClaimSearchParams(input)
  // 제네릭을 명시한다 — `placeholderData: keepPreviousData`와 `queryFn`의 구조 분해가 겹치면
  // 추론이 TData에 keepPreviousData의 함수 타입까지 섞어 넣는다(products와 같은 함정).
  return useQuery<SellerClaimListData>({
    queryKey: [...CLAIMS_QUERY_KEY, 'list', params],
    queryFn: ({ signal }) => getSellerClaims(params, signal).then(response => response.data),
    // 필터/페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
}

/**
 * 상세. 목록 행에 없는 것이 셋 들어 있다 — 구매자 사유 상세의 전문, 수령인·주소, 진행 이력이다.
 * 이력의 `COLLECTION_STARTED` 유무가 회수 중 클레임의 단계를 가르는 유일한 응답 근거다.
 */
export const useClaimDetail = (claimPublicId: string | null | undefined) =>
  useQuery({
    queryKey: [...CLAIMS_QUERY_KEY, 'detail', claimPublicId],
    queryFn: claimPublicId
      ? ({ signal }) => getSellerClaim(claimPublicId, signal).then(response => response.data)
      : skipToken,
  })

function useClaimMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    // 목록 건수·탭 배지·상세가 한 번에 바뀐다(승인은 상태를, 회수 완료는 상태와 환불 축을 움직인다).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY }),
  })
}

export interface ApproveClaimVariables {
  claimPublicId: string
  /**
   * 반품비 부담 주체 — 반품·교환만 싣는다. 취소는 서버가 저장하지 않으므로(Claim.approveBySeller)
   * 호출부가 빈 값으로 두고, 빈 객체를 보내 "지정하지 않았다"를 분명히 한다.
   */
  returnCostBearer?: ReturnCostBearer | null
}

export const useApproveClaim = () =>
  useClaimMutation(({ claimPublicId, returnCostBearer }: ApproveClaimVariables) =>
    approveSellerClaim(claimPublicId, returnCostBearer ? { returnCostBearer } : {}),
  )

export const useRejectClaim = () =>
  useClaimMutation(({ claimPublicId, rejectionReason }: { claimPublicId: string; rejectionReason: string }) =>
    rejectSellerClaim(claimPublicId, { rejectionReason }),
  )

/** 메모는 덮어쓰기고 공백은 삭제다 — 서버가 trim 후 빈 값을 null로 저장한다. */
export const useUpdateClaimMemo = () =>
  useClaimMutation(({ claimPublicId, sellerMemo }: { claimPublicId: string; sellerMemo: string }) =>
    updateSellerClaimMemo(claimPublicId, { sellerMemo }),
  )

export interface ClaimInvoiceVariables {
  claimPublicId: string
  courierCode: string
  trackingNumber: string
}

export const useStartClaimCollection = () =>
  useClaimMutation(({ claimPublicId, courierCode, trackingNumber }: ClaimInvoiceVariables) =>
    startSellerClaimCollection(claimPublicId, { courierCode, trackingNumber }),
  )

export const useCompleteClaimCollection = () =>
  useClaimMutation(({ claimPublicId }: { claimPublicId: string }) =>
    completeSellerClaimCollection(claimPublicId),
  )

export const useReshipClaim = () =>
  useClaimMutation(({ claimPublicId, courierCode, trackingNumber }: ClaimInvoiceVariables) =>
    reshipSellerClaim(claimPublicId, { courierCode, trackingNumber }).then(response => response.data),
  )

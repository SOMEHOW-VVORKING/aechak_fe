import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminSellerDetail,
  getAdminSellers,
  releaseAdminSellerSuspension,
  saveAdminSellerMemo,
  suspendAdminSeller,
  type AdminSellerDetailData,
  type AdminSellerListData,
  type GetAdminSellersParams,
  type SellerSanctionReasonCode,
} from '@aechak/api'
import type { SellerAccount } from '@aechak/domain'
import {
  STATUS_FILTER_TO_WIRE,
  TYPE_FILTER_TO_WIRE,
  toSellerAccount,
  toSellerDetail,
  type SellerAction,
  type SellerDetailView,
  type SellerStatusFilterValue,
  type SellerTypeFilterValue,
} from './sellers.map'

// 어드민 셀러 관리 5종(목록·상세·판매정지·해제·메모)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다
// (AGENTS 6-2). 캐시 키 접두를 공유해, 조치 한 번의 무효화가 목록과 열린 상세를 함께 갱신한다.
//
// 접두를 `['sellers']`로 넓히지 않는 이유: 입점 심사가 `['sellers', 'applications']`를 쓰고 있어
// 넓히면 셀러 조치마다 심사 목록·nav 배지까지 다시 받는다(서로 다른 업무다).

export const SELLER_ACCOUNTS_QUERY_KEY = ['sellers', 'accounts'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

export interface SellerListParams {
  status: SellerStatusFilterValue
  sellerType: SellerTypeFilterValue
  /** 상호명 부분일치. 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  page: number
  size?: number
}

function listParams({ status, sellerType, keyword, page, size }: SellerListParams): GetAdminSellersParams {
  const trimmed = keyword.trim()
  return {
    // 값이 빈 파라미터는 키째 뺀다(AGENTS 6-6). 'all'은 조건 없음이라 키 자체가 없어야 한다 —
    // 소문자 'all'을 그대로 보내면 서버가 조용히 전체로 보정해 필터가 동작하는 것처럼 보인다.
    ...(status === 'all' ? {} : { status: STATUS_FILTER_TO_WIRE[status] }),
    ...(sellerType === 'all' ? {} : { sellerType: TYPE_FILTER_TO_WIRE[sellerType] }),
    ...(trimmed === '' ? {} : { keyword: trimmed }),
    page,
    size: size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface SellerListResult {
  rows: SellerAccount[]
  /** 현재 필터 기준 전체 행 수(페이지 크기가 아니다). */
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 오프셋 페이지네이션 목록(커서가 아니다). 정렬은 sellerId 내림차순 고정이라 정렬 파라미터가 없다.
 * page 음수·범위 밖 size는 서버가 보정한다.
 */
export function useSellerAccounts(params: SellerListParams): SellerListResult {
  const query = useQuery<AdminSellerListData>({
    queryKey: [...SELLER_ACCOUNTS_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) =>
      getAdminSellers(listParams(params), signal).then(response => response.data),
    // 필터·페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  return {
    rows: (query.data?.items ?? []).map(toSellerAccount),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface SellerDetailResult {
  detail: SellerDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/** 상세는 목록 행과 같은 셀러에 현재 정지 사유·운영자 메모·제재 이력(최신순 50건)을 더한다. */
export function useSellerDetail(sellerId: number | null): SellerDetailResult {
  const query = useQuery<AdminSellerDetailData>({
    queryKey: [...SELLER_ACCOUNTS_QUERY_KEY, 'detail', sellerId],
    queryFn:
      sellerId == null
        ? skipToken
        : ({ signal }) => getAdminSellerDetail(sellerId, signal).then(response => response.data),
  })
  return {
    detail: query.data ? toSellerDetail(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface SellerActionInput {
  sellerId: number
  action: SellerAction
  /** 판매정지의 필수 입력. 해제는 고정 어휘 사유가 없어 null이다. */
  reasonCode: SellerSanctionReasonCode | null
  reasonDetail: string
  /** null이면 기간을 보내지 않는다 — 서버가 무기한 정지로 저장한다. */
  durationDays: number | null
  memo: string
}

/**
 * 판매정지·해제. 둘 다 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다
 * (목업 시절에는 `useDetailList`의 edits로 화면에만 겹쳐 보여 줬다).
 *
 * 실패해도 무효화하는 이유는 409(이미 정지·정지 아님·탈퇴 셀러·동시 조치 충돌)가 "화면이
 * 낡았다"는 신호라 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 *
 * 조치에 딸린 `memo`는 **비어 있지 않을 때만** 현재 메모를 덮어쓴다(빈 값으로 지우지 않는다) —
 * 메모를 지우는 경로는 메모 저장뿐이라, 빈 문자열은 키째 빼서 보낸다.
 */
export function useSellerAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SellerActionInput) => {
      const reasonDetail = input.reasonDetail.trim()
      const memo = input.memo.trim()
      const body = {
        ...(reasonDetail === '' ? {} : { reasonDetail }),
        ...(memo === '' ? {} : { memo }),
      }
      if (input.action === 'release') {
        return releaseAdminSellerSuspension(input.sellerId, body)
      }
      if (input.reasonCode == null) {
        // 사유는 판매정지의 필수 입력이다 — 화면이 막지만 요청을 만들 수 있는 자리에서도 끊는다.
        return Promise.reject(new Error('판매정지 사유를 선택해 주세요.'))
      }
      return suspendAdminSeller(input.sellerId, {
        reasonCode: input.reasonCode,
        ...(input.durationDays == null ? {} : { durationDays: input.durationDays }),
        ...body,
      })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SELLER_ACCOUNTS_QUERY_KEY }),
  })
}

export interface SellerMemoInput {
  sellerId: number
  memo: string
}

/**
 * 내부 메모 저장. 덮어쓰기이고 **공백이면 메모를 지운다** — 제재에 딸린 memo와 규칙이 반대이므로
 * 여기서는 빈 문자열을 그대로 보낸다(키를 빼도 서버가 같이 지운다).
 *
 * 제재 이력 행은 남지 않고 누가 언제 바꿨는지는 감사 로그(SELLER_MEMO_UPDATED)가 받는다.
 */
export function useSaveSellerMemo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sellerId, memo }: SellerMemoInput) =>
      saveAdminSellerMemo(sellerId, { memo: memo.trim() }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SELLER_ACCOUNTS_QUERY_KEY }),
  })
}

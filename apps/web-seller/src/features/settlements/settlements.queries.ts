import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import {
  getSellerSettlement,
  getSellerSettlementMonths,
  getSellerSettlements,
  type GetSellerSettlementsParams,
  type SellerSettlementDetailData,
  type SellerSettlementListData,
} from '@aechak/api'

// 정산 조회(GET /sellers/me/settlements · /months · /{orderPublicId}, seller 호스트)를 실서버에
// 붙이는 얇은 어댑터. breeds·상품 관례대로 생성된 react-query 훅은 쓰지 않고 fetcher만 소비한다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

export const SETTLEMENTS_QUERY_KEY = ['settlements'] as const

/**
 * 화면 필터 상태 그대로의 입력 — '전체'를 빈 문자열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeSearchParams`가 한 곳에서 책임진다.
 */
export interface SettlementSearchInput {
  month?: string
  status?: string
  page?: number
  size?: number
}

/**
 * 빈 값 파라미터를 키째 뺀다.
 *
 * BE는 `?month=`를 "미입력"으로 보지 않고 `yyyy-MM` 형식 위반(400 errorCode 90001)으로 거절하고,
 * `?status=`도 네 어휘 밖이라 같은 400이 된다. 화면 필터는 '전체'를 빈 문자열로 들고 있으므로
 * 그대로 넘기면 전체 조회가 깨진다. 숫자 0(`page=0`)은 값이 있는 것이므로 남긴다.
 */
export function normalizeSearchParams(input: SettlementSearchInput): GetSellerSettlementsParams {
  const params: GetSellerSettlementsParams = {}
  const month = input.month?.trim()
  if (month) params.month = month
  const status = input.status?.trim()
  if (status) params.status = status as GetSellerSettlementsParams['status']
  if (input.page != null) params.page = input.page
  if (input.size != null) params.size = input.size
  return params
}

export function useSettlements(input: SettlementSearchInput) {
  // 정규화한 값으로 키를 만든다 — `{ month: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const params = normalizeSearchParams(input)
  return useQuery<SellerSettlementListData>({
    queryKey: [...SETTLEMENTS_QUERY_KEY, 'list', params],
    queryFn: ({ signal }) => getSellerSettlements(params, signal).then(response => response.data),
    // 필터·페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다(상품 목록과 같은 결).
    placeholderData: keepPreviousData,
  })
}

/** 월 필터 선택지. 정산 행이 있는 월만 오고, 세션 중 거의 바뀌지 않아 한 번 받아 둔다. */
export function useSettlementMonths() {
  return useQuery({
    queryKey: [...SETTLEMENTS_QUERY_KEY, 'months'],
    queryFn: ({ signal }) => getSellerSettlementMonths(signal).then(response => response.data.months),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * 건별 상세. 목록 행을 눌러 Drawer를 열 때만 나간다(`skipToken`) — 목록 응답에는 금액 분해와
 * 품목 내역이 없으므로 행 데이터로 Drawer를 채울 수 없다.
 */
export function useSettlementDetail(orderPublicId: string | null) {
  return useQuery<SellerSettlementDetailData>({
    queryKey: [...SETTLEMENTS_QUERY_KEY, 'detail', orderPublicId],
    queryFn:
      orderPublicId == null
        ? skipToken
        : ({ signal }) => getSellerSettlement(orderPublicId, signal).then(response => response.data),
  })
}

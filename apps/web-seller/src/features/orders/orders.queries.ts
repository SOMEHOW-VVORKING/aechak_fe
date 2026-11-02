import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  acceptSellerOrder,
  completeSellerOrderDelivery,
  getSellerOrderDetail,
  getSellerOrders,
  registerSellerOrderShipment,
} from '@aechak/api'
import type {
  SellerOrderListResponse,
  SellerOrderSearchParams,
  ShipmentRegisterRequest,
} from './orders.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(products·store-settings 관례) 이 파일이 자체
// useQuery/useMutation으로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로 여기서 벗긴다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`가 전부 seller 모듈(8081)이라 이
// 파일에는 호스트를 지정하는 코드가 한 줄도 없어야 한다.

// 목록과 상세가 이 접두를 공유한다 — 처리 뒤 접두 무효화 한 번으로 목록과 열려 있는 상세 Drawer가
// 함께 갱신된다(main.tsx staleTime 60초라 무효화가 필수).
export const ORDERS_QUERY_KEY = ['orders'] as const

/**
 * 화면 필터 상태 그대로의 목록 파라미터 — 미선택을 빈 문자열로 들고 있어도 된다.
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeOrderSearchParams`가 한 곳에서 책임진다.
 */
export type SellerOrderSearchInput = {
  [K in keyof SellerOrderSearchParams]?: NonNullable<SellerOrderSearchParams[K]> | ''
}

/**
 * 빈 값 파라미터를 키째 빼고 문자열을 trim한다(products의 `normalizeSearchParams`와 같은 규칙).
 *
 * BE는 값이 빈 파라미터를 "미입력"으로 보지 않고 형식 오류로 거절하는 자리가 있다 — `?status=`는
 * `SellerOrderStatusFilter.from("")`이 400/90001이고 `?orderedFrom=`·`?orderedTo=`는 날짜 파싱이
 * 같은 400이다. `keyword`만 서버가 trim 후 빈 값을 미적용으로 접지만 그것도 함께 뺀다 —
 * `{ keyword: '' }`와 `{}`가 같은 요청이므로 캐시 키도 같아야 한다. 숫자 0(`page=0`)은 값이 있는
 * 것이므로 남긴다.
 */
export function normalizeOrderSearchParams(params: SellerOrderSearchInput): SellerOrderSearchParams {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (value == null) continue
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed !== '') normalized[key] = trimmed
      continue
    }
    normalized[key] = value
  }
  return normalized as SellerOrderSearchParams
}

export const useSellerOrders = (params: SellerOrderSearchInput) => {
  // 정규화한 값으로 키를 만든다 — `{ keyword: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const query = normalizeOrderSearchParams(params)
  // 제네릭을 명시한다 — `placeholderData: keepPreviousData`와 `queryFn`의 구조 분해(`{ signal }`)가
  // 겹치면 추론이 TData에 keepPreviousData의 함수 타입까지 섞어 넣어 `data.totalPages`가 깨진다
  // (products.queries에서 실제로 겪은 자리다).
  return useQuery<SellerOrderListResponse>({
    queryKey: [...ORDERS_QUERY_KEY, 'list', query],
    queryFn: ({ signal }) => getSellerOrders(query, signal).then(r => r.data),
    // 필터/페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
}

/** 상세 Drawer. 열려 있지 않으면(`null`) 네트워크를 타지 않는다. */
export const useSellerOrderDetail = (orderPublicId: string | null | undefined) =>
  useQuery({
    queryKey: [...ORDERS_QUERY_KEY, 'detail', orderPublicId],
    queryFn: orderPublicId
      ? ({ signal }) => getSellerOrderDetail(orderPublicId, signal).then(r => r.data)
      : skipToken,
  })

/**
 * 세 처리가 공유하는 뮤테이션 껍데기. 끝나면(성공이든 실패든) 주문 접두를 통째로 무효화한다 —
 * 상태가 바뀌면 목록의 세그먼트 집계와 상세가 동시에 낡는다.
 *
 * **실패에도 무효화한다.** 전이 거절(409/50004·50005·50301·50302)은 대개 다른 탭·다른 사람이
 * 먼저 처리해서 내 목록이 낡았다는 뜻이고, 성공만 무효화하면 사라져야 할 버튼이 그대로 남아 같은
 * 요청을 다시 보낸다. 거절 문구가 "목록을 새로고침해 주세요"라고 말하는 일을 코드가 대신한다.
 *
 * 라우트가 `isPending`을 읽어 목록의 다른 행 버튼까지 잠근다(AGENTS 확인 Modal 패턴). 그래서 각
 * Modal이 자기 뮤테이션을 만들지 않고 라우트에서 받는다.
 */
function useOrdersMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY }),
  })
}

/** 발주 확인 — 204라 응답 본문이 없다. */
export const useAcceptOrder = () =>
  useOrdersMutation((orderPublicId: string) => acceptSellerOrder(orderPublicId))

/** 송장 등록 — 201 + `{ shipmentId, dispatchedAt, orderStatus }`. 정정이 아니라 최초 등록 한 번뿐이다. */
export const useRegisterShipment = () =>
  useOrdersMutation(({ orderPublicId, body }: { orderPublicId: string; body: ShipmentRegisterRequest }) =>
    registerSellerOrderShipment(orderPublicId, body).then(r => r.data),
  )

/** 배송 완료 — 204. 이때 구매확정 기한이 부여된다. */
export const useCompleteDelivery = () =>
  useOrdersMutation((orderPublicId: string) => completeSellerOrderDelivery(orderPublicId))

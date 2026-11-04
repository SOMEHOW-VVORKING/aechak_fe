import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getAdminOrderDetail,
  getAdminOrderMetrics,
  getAdminOrders,
  nudgeAdminOrderDispatch,
  type AdminOrderDetailData,
  type AdminOrderListData,
  type AdminOrderMetricsData,
  type GetAdminOrdersParams,
} from '@aechak/api'
import { useMetricValue } from '@/shared/hooks/useMetricValue'
import {
  STATUS_FILTER_TO_WIRE,
  toDetailView,
  toKstDateParam,
  toMonitorRow,
  type AdminOrderDetailView,
  type AdminOrderMonitorRow,
  type AdminOrderStatusFilterValue,
} from './order-monitoring.map'

// 어드민 주문 모니터링 4종(목록·지표·상세·발송 독촉)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다
// (AGENTS 6-2). 캐시 키 접두를 공유해, 독촉 한 번의 무효화가 목록·지표·열린 상세를 함께 갱신한다.

export const ORDER_MONITORING_QUERY_KEY = ['admin-order-monitoring'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 검증한다(범위 밖은 400/90001). */
export const DEFAULT_PAGE_SIZE = 20

export interface OrderListParams {
  status: AdminOrderStatusFilterValue
  /** 지연 신호가 붙은 행만. 판정은 서버가 한다. */
  delayedOnly: boolean
  /**
   * 주문번호 / 셀러 상호 / 상품명 / 옵션명. 빈 문자열이면 파라미터를 보내지 않는다.
   *
   * **구매자는 검색 대상이 아니다**(`AdminOrderMonitoringQueryAdapter.keywordMatches`) — 닉네임은
   * user BC 테이블에 있어 이 포트가 조인하지 못하고, 주문에 남은 수령인명은 암호문이라 LIKE가
   * 불가능하다. 검색창 안내 문구가 구매자를 적으면 운영자가 닉네임을 넣고 0건을 "주문이 없다"로
   * 읽는다(교차검토 지적).
   */
  keyword: string
  size?: number
}

function listParams(params: OrderListParams, cursor?: string): GetAdminOrdersParams {
  const keyword = params.keyword.trim()
  return {
    // 값이 빈 파라미터는 키째 뺀다(AGENTS 6-6) — 서버가 형식 오류로 보는 자리가 있다.
    ...(params.status === 'all' ? {} : { status: STATUS_FILTER_TO_WIRE[params.status] }),
    ...(params.delayedOnly ? { delayedOnly: true } : {}),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface OrderListResult {
  rows: AdminOrderMonitorRow[]
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  /**
   * 표에 보이는 행이 **아직 이전 조건의 결과**다. `keepPreviousData`가 표를 비우지 않는 대가로
   * 생기는 구간이고, 말하지 않으면 운영자가 "배송 중"을 골라 놓고 결제완료 행을 배송 중으로 읽는다
   * (교차검토 지적).
   */
  isStaleRows: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록. 커서에 필터가 실리지 않아 서버가 거부하지는 않지만, 앵커가 새 필터 집합과
 * 무관해 결과가 섞인다 — **필터·검색어를 쿼리 키에 넣어** 필터가 바뀌는 순간 커서 사슬이 새로
 * 시작되게 한다.
 *
 * `totalCount`를 돌려주지 않는다 — 서버가 항상 null을 주기 때문이다(전체 주문 건수를 매 페이지
 * 세지 않는다). 건수가 필요한 자리는 지표 카드다.
 */
export function useAdminOrderMonitorList(params: OrderListParams): OrderListResult {
  const query = useInfiniteQuery<AdminOrderListData>({
    queryKey: [...ORDER_MONITORING_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminOrders(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    // 필터를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toMonitorRow)),
    hasNext: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isStaleRows: query.isPlaceholderData,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

export interface OrderMetricsResult {
  metrics: AdminOrderMetricsData | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 지표 카드 넷. **목록과 다른 경로이고 상태·지연·키워드를 받지 않는다** — 카드가 그 축으로 모수를
 * 쪼개 보여주므로 상태로 좁히면 카드 넷 중 셋이 0으로 눌린다(서버 주석의 설계 판단).
 *
 * 그래서 목록 필터를 여기 넘기지 않고 파라미터 없이 부른다. 서버가 받는 셀러·기간 축은 이 화면이
 * 아직 필터로 두지 않았다.
 *
 * **금액은 서버 응답을 그대로 쓴다.** `totalOrderAmount`는 취소 주문이 빠져 목록 행의
 * `payableAmount`를 더해 재현할 수 없고, 뜻이 바뀌면 서버가 바꾼다.
 */
export function useAdminOrderMonitorMetrics(): OrderMetricsResult {
  const query = useQuery<AdminOrderMetricsData>({
    queryKey: [...ORDER_MONITORING_QUERY_KEY, 'metrics'],
    queryFn: ({ signal }) => getAdminOrderMetrics(undefined, signal).then(response => response.data),
  })
  return {
    // 재조회가 실패하면 캐시된 숫자를 돌려주지 않는다 — 서버에 없는 건수를 카드가 가리킨다.
    metrics: query.isError ? null : (query.data ?? null),
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * 오늘(KST) 주문 금액 하나. 대시보드 첫 화면의 `오늘 거래액` 칸이 쓴다.
 *
 * **지표 경로를 날짜로 좁힌 별도 쿼리다.** 모니터링 화면의 `useAdminOrderMonitorMetrics`는
 * 파라미터 없이 플랫폼 전체를 받으므로 같은 키를 재사용하면 그 화면의 카드 넷이 오늘로 눌린다 —
 * 키에 날짜를 실어 가른다(날짜가 바뀌면 키가 바뀌어 다시 받는다).
 *
 * 금액은 서버 `totalOrderAmount`를 그대로 쓴다 — 취소 주문과 취소·반품으로 종결된 품목이 빠지고
 * 적립금이 빠지지 않아 **수납액이 아니다**. 카드가 그 뜻을 footer로 말해야 한다.
 */
export function useTodayOrderAmount(): number | null {
  const today = toKstDateParam(new Date())
  const params = { orderedFrom: today, orderedTo: today }
  return useMetricValue([...ORDER_MONITORING_QUERY_KEY, 'metrics', params], signal =>
    getAdminOrderMetrics(params, signal).then(response => response.data.totalOrderAmount),
  )
}

export interface OrderDetailResult {
  detail: AdminOrderDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useAdminOrderDetail(orderId: string | null): OrderDetailResult {
  const query = useQuery<AdminOrderDetailData>({
    queryKey: [...ORDER_MONITORING_QUERY_KEY, 'detail', orderId],
    queryFn:
      orderId == null
        ? skipToken
        : ({ signal }) => getAdminOrderDetail(orderId, signal).then(response => response.data),
  })
  return {
    detail: query.data ? toDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface NudgeInput {
  orderId: string
  memo: string
}

/**
 * 셀러 발송 독촉 **기록**. 서버가 알림도 메일도 보내지 않는다 — 어드민 실행 모듈이 발송 어댑터를
 * 조립하지 않아 보낼 수단이 없고, 응답에 발송 여부 필드도 없다.
 *
 * 실패해도 무효화하는 이유는 409 둘(발송 전 상태 아님·쿨다운)이 모두 "화면이 낡았다"는 신호라
 * 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useNudgeOrderDispatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: NudgeInput) => {
      const memo = input.memo.trim()
      // 공백만 들어온 메모는 서버가 null로 접는다 — 키째 빼서 보내 같은 뜻을 명시한다.
      return nudgeAdminOrderDispatch(input.orderId, memo === '' ? {} : { memo })
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDER_MONITORING_QUERY_KEY }),
  })
}

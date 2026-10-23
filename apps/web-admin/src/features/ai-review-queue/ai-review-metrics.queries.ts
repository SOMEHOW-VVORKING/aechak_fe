import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  getAdminInspectionMetrics,
  type AdminInspectionMetricsData,
  type GetAdminInspectionMetricsParams,
} from '@aechak/api'
import { toMetricsView, type InspectionMetricsView, type MetricsQuery } from './ai-review-metrics.map'

// 운영 지표 1종(`GET /admin/inspection-metrics`)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅이 아니라 fetcher만 소비하고 이 파일이 자체 useQuery로 감싼다(AGENTS 규약).

export const AI_REVIEW_METRICS_QUERY_KEY = ['products', 'ai-review-metrics'] as const

// 값이 빈 파라미터는 키째 빼서 보낸다(AGENTS 6-6) — 서버가 `?policyVersion=`을 미입력이 아니라
// 형식 오류로 읽는 자리가 있어서다. 정규화는 이 층이 맡고 라우트는 null만 넘긴다.
function metricsParams({ from, to, policyVersion }: MetricsQuery): GetAdminInspectionMetricsParams {
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(policyVersion ? { policyVersion } : {}),
  }
}

export interface MetricsResult {
  view: InspectionMetricsView | null
  isLoading: boolean
  /** 재조회 중인가. 이전 결과를 들고 있으므로 표를 비우지 않고 흐리게만 한다 */
  isFetching: boolean
  isError: boolean
  error: unknown
  refetch: () => void
}

export function useInspectionMetrics(query: MetricsQuery): MetricsResult {
  const result = useQuery<AdminInspectionMetricsData>({
    queryKey: [...AI_REVIEW_METRICS_QUERY_KEY, metricsParams(query)],
    queryFn: ({ signal }) =>
      getAdminInspectionMetrics(metricsParams(query), signal).then(response => response.data),
    // 기간·정책 버전을 바꾸는 동안 화면이 비지 않게 이전 결과를 유지한다(재조회에 스켈레톤을
    // 띄우면 카드 높이가 튀면서 읽던 숫자가 사라진다).
    placeholderData: keepPreviousData,
  })
  return {
    // 뷰 변환이 질의 창을 함께 받는 이유: "요청한 창"과 "서버가 집계한 창"을 맞춰 봐야
    // 서버가 선택을 무시했다는 사실을 화면이 알 수 있다.
    view: result.data ? toMetricsView(result.data, query) : null,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
    error: result.error,
    refetch: () => void result.refetch(),
  }
}

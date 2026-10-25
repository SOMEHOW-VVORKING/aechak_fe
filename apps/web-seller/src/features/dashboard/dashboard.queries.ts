import { useQuery } from '@tanstack/react-query'
import { getSellerDashboardSummary } from '@aechak/api'
import type { SellerDashboardPeriod, SellerDashboardSummaryData } from './dashboard.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(products·store-settings 관례) 이 파일이
// 자체 useQuery로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로 여기서 벗긴다.
// 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

export const DASHBOARD_QUERY_KEY = ['dashboard'] as const

/**
 * 셀러센터 첫 화면 집계. 기간을 주지 않으면 서버가 전체 기간으로 보므로 `all`은 파라미터를 뺀다 —
 * `?period=all`도 받아 주지만 빈 요청과 캐시 키가 갈리지 않게 와이어 모양을 하나로 맞춘다.
 *
 * `staleTime`을 0으로 둔다(main.tsx 기본값 60초를 덮는다). 셀러가 발주 확인·송장 등록을 하고
 * 돌아왔을 때 "처리했는데 숫자가 안 줄었다"로 보이면 그 자체가 결함 신고가 되고, 서버도 같은 이유로
 * 이 집계를 캐시하지 않는다.
 */
export const useDashboardSummary = (period: SellerDashboardPeriod) =>
  useQuery<SellerDashboardSummaryData>({
    queryKey: [...DASHBOARD_QUERY_KEY, 'summary', period],
    queryFn: ({ signal }) =>
      getSellerDashboardSummary(period === 'all' ? undefined : { period }, signal).then(r => r.data),
    staleTime: 0,
  })

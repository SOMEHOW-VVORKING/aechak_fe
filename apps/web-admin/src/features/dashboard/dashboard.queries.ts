import { useQuery } from '@tanstack/react-query'
import { adminDashboardSummaryMock, type AdminDashboardSummary } from './dashboard.mock'

/**
 * 집계 경로가 없는 칸의 예시 데이터를 쿼리 캐시에 태워 내려준다 — 서버로 나가는 요청이 없다.
 * 실 집계를 쓰는 칸은 각 feature의 건수 훅이 따로 받아 오고(라우트가 조립한다), 그 경로가 생기면
 * `dashboard.mock.ts` 머리글의 조건대로 칸을 하나씩 옮긴다.
 */
export const useAdminDashboardSummary = () =>
  useQuery<AdminDashboardSummary>({
    queryKey: ['admin-dashboard-summary'],
    queryFn: () => Promise.resolve(adminDashboardSummaryMock),
  })

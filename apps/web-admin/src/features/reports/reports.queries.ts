import { useQuery } from '@tanstack/react-query'
import { adminReportsMock, type AdminReport } from './reports.mock'

/**
 * 예시 데이터를 쿼리 캐시에 태워 내려준다 — 서버로 나가는 요청이 없다.
 * `GET /admin/reports`(SCRUM-241)가 생기면 queryFn만 생성 fetcher로 바꾼다(화면은 그대로).
 */
export const useAdminReports = () =>
  useQuery<AdminReport[]>({
    queryKey: ['admin-reports'],
    queryFn: () => Promise.resolve(adminReportsMock),
  })

import { useQuery } from '@tanstack/react-query'
import { adminAuditEntriesMock, type AdminAuditEntry } from './audit-log.mock'

/**
 * 예시 데이터를 쿼리 캐시에 태워 내려준다 — 서버로 나가는 요청이 없다.
 * `GET /admin/audit-logs`가 생기면 queryFn만 생성 fetcher로 바꾼다(화면은 그대로).
 */
export const useAdminAuditEntries = () =>
  useQuery<AdminAuditEntry[]>({
    queryKey: ['admin-audit-log'],
    queryFn: () => Promise.resolve(adminAuditEntriesMock),
  })

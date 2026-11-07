import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import {
  getAdminAuditLogs,
  type AdminAuditLogListData,
  type GetAdminAuditLogsParams,
} from '@aechak/api'
import {
  toAuditRow,
  type AdminAuditRow,
  type AuditAction,
  type AuditResult,
  type AuditTargetType,
} from './audit-log.map'

// `GET /admin/audit-logs` 하나를 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이 아니라
// fetcher만 소비한다(AGENTS 6-2). 감사 로그는 조회뿐이라 뮤테이션이 없다 — 운영자가 고칠 수 있는
// 기록이면 기록의 의미가 없다.

export const AUDIT_LOG_QUERY_KEY = ['admin-audit-log'] as const

/** 서버 기본값과 같은 페이지 크기. 범위가 스펙에 없어 화면은 이 값만 보낸다. */
export const DEFAULT_PAGE_SIZE = 20

export interface AuditLogListParams {
  targetType: AuditTargetType | 'all'
  action: AuditAction | 'all'
  result: AuditResult | 'all'
  /** 매칭 범위가 서버 스펙에 없다 — 빈 문자열이면 파라미터를 보내지 않는다. */
  keyword: string
  size?: number
}

function listParams(params: AuditLogListParams, cursor?: string): GetAdminAuditLogsParams {
  const keyword = params.keyword.trim()
  return {
    ...(params.targetType === 'all' ? {} : { targetType: params.targetType }),
    ...(params.action === 'all' ? {} : { action: params.action }),
    ...(params.result === 'all' ? {} : { result: params.result }),
    ...(keyword === '' ? {} : { keyword }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface AuditLogListResult {
  rows: AdminAuditRow[]
  totalCount: number | null
  /**
   * 감사 기록을 모으기 시작한 시각. 목록이 비어도 화면이 이 값을 말해야 한다 — 감사 로그에서
   * '없다'와 '그 전은 기록이 없다'는 전혀 다른 사실이다.
   */
  recordingSince: string | null
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록.
 *
 * **필터를 쿼리 키에 넣는다** — 조건이 바뀐 채 옛 커서를 보내면 엉뚱한 앵커에서 이어 읽어 섞인
 * 목록이 나오고, 감사 로그 커서의 거절 계약은 스펙에 없으니 서버가 끊어 줄 것으로 기대할 수 없다.
 * 키에 넣으면 조건이 바뀌는 순간 커서 사슬이 새로 시작해 FE가 애초에 옛 커서를 보내지 않는다.
 *
 * `더 보기`는 `query.hasNextPage`로만 열고 **응답 본문의 `hasNext`로 열지 않는다**. placeholder
 * 구간에는 `data`가 이전 조건의 페이지라, 본문 값을 읽으면 버튼이 열려 있고 그 버튼이 옛 커서를
 * 요구한다. `totalCount`·`recordingSince`는 커서 페이지에도 실리는지 스펙에 없어 `pages[0]`에서만
 * 읽는다 — 어느 쪽이어도 맞는 꼴이다.
 */
export function useAdminAuditLogs(params: AuditLogListParams): AuditLogListResult {
  const query = useInfiniteQuery<AdminAuditLogListData>({
    queryKey: [...AUDIT_LOG_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminAuditLogs(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toAuditRow)),
    totalCount: pages[0]?.totalCount ?? null,
    recordingSince: pages[0]?.recordingSince ?? null,
    hasNext: query.hasNextPage && !query.isPlaceholderData && !query.isError,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchNextPage: () => {
      void query.fetchNextPage()
    },
  }
}

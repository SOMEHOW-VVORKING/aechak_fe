import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getAdminClaimDetail,
  getAdminClaimInterventionReasons,
  getAdminClaims,
  interveneAdminClaim,
} from '@aechak/api'
import type {
  AdminClaimDetailData,
  AdminClaimFaultDecision,
  AdminClaimFaultDecisionReasons,
  AdminClaimInterventionReason,
  AdminClaimListData,
  AdminClaimSummary,
  ReturnCostBearer,
} from './claims.contract'
import {
  DEFAULT_PAGE_SIZE,
  normalizeClaimSearchParams,
  type AdminClaimSearchInput,
} from './claims.contract'

// 어드민 클레임 4종(목록·사유 카탈로그·상세·개입)을 실서버에 붙이는 얇은 어댑터. 생성된
// react-query 훅은 쓰지 않고 fetcher만 소비한다(AGENTS 6-2). fetcher는 `{ data }` 한 겹
// (ApiResponse)을 돌려주므로 여기서 벗긴다. 호스트는 공유 클라이언트가 `/admin` 접두로 가른다.

/** 목록·상세·카탈로그가 이 접두를 공유한다 — 개입 한 번의 무효화가 셋을 함께 갱신한다. */
export const ADMIN_CLAIMS_QUERY_KEY = ['admin-claims'] as const

export interface AdminClaimListResult {
  rows: AdminClaimSummary[]
  totalCount: number | null
  hasNext: boolean
  isLoading: boolean
  isFetchingNextPage: boolean
  isError: boolean
  error: unknown
  fetchNextPage: () => void
}

/**
 * 커서 페이징 목록. 필터를 쿼리 키에 넣어 조건이 바뀌는 순간 커서 사슬이 새로 시작되게 한다
 * (커서에 정렬축이 실려 있어 조건과 함께 재사용하면 서버가 커서를 믿고 정렬을 덮는다).
 *
 * `keepPreviousData`를 쓰므로 `isPlaceholderData`일 때 `hasNext`를 내린다 — 이전 조건의
 * `hasNext`로 더 보기를 열어 두면 새 조건의 첫 페이지가 오기 전에 옛 커서를 요구해 페이지를
 * 건너뛴다. 실패는 행을 지우지 않고 `isError`로 알려 화면이 처리 버튼을 잠그게 한다(AGENTS 6-7).
 */
export function useAdminClaims(input: AdminClaimSearchInput): AdminClaimListResult {
  // 정규화한 값으로 키를 만든다 — `{ orderPublicId: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const params = normalizeClaimSearchParams(input)
  const query = useInfiniteQuery<AdminClaimListData>({
    queryKey: [...ADMIN_CLAIMS_QUERY_KEY, 'list', params],
    queryFn: ({ pageParam, signal }) =>
      getAdminClaims(
        {
          ...params,
          ...(pageParam ? { cursor: pageParam as string } : {}),
          size: params.size ?? DEFAULT_PAGE_SIZE,
        },
        signal,
      ).then(response => response.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items),
    totalCount: pages[0]?.totalCount ?? null,
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

export interface AdminClaimDetailResult {
  detail: AdminClaimDetailData | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

export function useAdminClaimDetail(claimPublicId: string | null): AdminClaimDetailResult {
  const query = useQuery<AdminClaimDetailData>({
    queryKey: [...ADMIN_CLAIMS_QUERY_KEY, 'detail', claimPublicId],
    queryFn: claimPublicId
      ? ({ signal }) => getAdminClaimDetail(claimPublicId, signal).then(response => response.data)
      : skipToken,
  })
  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface InterventionReasonCatalog {
  byDecision: Record<AdminClaimFaultDecision, AdminClaimFaultDecisionReasons | undefined>
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 귀책 판정별 개입 사유 선택지. 고정 어휘라 자주 바뀌지 않지만 **화면이 enum으로 조립하지 않는다** —
 * 판정과 사유의 짝은 서버가 정하고(어긋나면 400/50415) 문구와 상세 필수 여부도 서버가 준다.
 */
export function useInterventionReasons(): InterventionReasonCatalog {
  const query = useQuery({
    queryKey: [...ADMIN_CLAIMS_QUERY_KEY, 'intervention-reasons'],
    queryFn: ({ signal }) =>
      getAdminClaimInterventionReasons(signal).then(response => response.data),
    // 고정 어휘라 세션 동안 다시 받을 이유가 없다.
    staleTime: Infinity,
  })
  const byDecision = {} as Record<AdminClaimFaultDecision, AdminClaimFaultDecisionReasons | undefined>
  for (const entry of query.data?.faultDecisions ?? []) {
    byDecision[entry.faultDecision] = entry
  }
  return {
    byDecision,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface InterveneInput {
  claimPublicId: string
  faultDecision: AdminClaimFaultDecision
  reason: AdminClaimInterventionReason
  reasonDetail: string
  /** 취소 유형·클레임 불가 판정에서는 null로 보낸다(서버가 비우는 자리라 보낼 이유가 없다). */
  returnCostBearer: ReturnCostBearer | null
  internalMemo: string
}

/**
 * 개입. 성공하면 뒤집힌 상태와 개입 기록을 돌려주지만 목록·상세를 그 값으로 덮지 않고 무효화한다 —
 * 목록 행은 네 축 + 경과일을 함께 들고 있어 응답만으로 재구성할 수 없다.
 * 실패해도 무효화하는 이유는 409 둘이 모두 "화면이 낡았다"는 신호이기 때문이다.
 */
export function useInterveneClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: InterveneInput) =>
      interveneAdminClaim(input.claimPublicId, {
        faultDecision: input.faultDecision,
        reason: input.reason,
        ...(input.reasonDetail.trim() === '' ? {} : { reasonDetail: input.reasonDetail.trim() }),
        ...(input.returnCostBearer == null ? {} : { returnCostBearer: input.returnCostBearer }),
        ...(input.internalMemo.trim() === '' ? {} : { internalMemo: input.internalMemo.trim() }),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADMIN_CLAIMS_QUERY_KEY }),
  })
}

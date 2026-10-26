import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  approveAdminSellerApplication,
  getAdminSellerApplicationDetail,
  getAdminSellerApplications,
  rejectAdminSellerApplication,
  type AdminApplicationListData,
  type GetAdminSellerApplicationsParams,
} from '@aechak/api'
import type { SellerApplicationStatus } from '@aechak/domain'
import {
  toApplicationDetail,
  toApplicationRow,
  toWireStatus,
  type ApplicationDetailView,
  type ApplicationRowView,
} from './seller-applications.map'

// 어드민 심사 4종(목록·상세·승인·반려)을 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이
// 아니라 fetcher만 소비하고 이 파일이 자체 useQuery/useMutation으로 감싼다(AGENTS 규약).
// 캐시 키는 접두를 공유해, 결정 한 번의 무효화가 목록·심사 대기 수·열린 상세까지 함께 갱신한다.

export const SELLER_APPLICATIONS_QUERY_KEY = ['sellers', 'applications'] as const

/** 서버 기본값과 같은 페이지 크기(BE PageQuery). 서버는 1~100으로 절삭한다. */
export const DEFAULT_PAGE_SIZE = 20

export interface ApplicationListParams {
  /** null이면 status 파라미터 자체를 보내지 않는다(전체 조회). */
  status: SellerApplicationStatus | null
  page: number
  size?: number
}

export interface ApplicationListResult {
  rows: ApplicationRowView[]
  /** status를 주지 않으면 DRAFT·CANCELLED까지 포함한 전체 건수다(BE 계약). */
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
}

function listParams({ status, page, size }: ApplicationListParams): GetAdminSellerApplicationsParams {
  return {
    ...(status ? { status: toWireStatus(status) } : {}),
    page,
    size: size ?? DEFAULT_PAGE_SIZE,
  }
}

/** 오프셋 페이지네이션 목록(커서가 아니다). page 음수·범위 밖 size는 서버가 보정한다. */
export function useSellerApplications(params: ApplicationListParams): ApplicationListResult {
  const query = useQuery<AdminApplicationListData>({
    queryKey: [...SELLER_APPLICATIONS_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) =>
      getAdminSellerApplications(listParams(params), signal).then(response => response.data),
    // 필터·페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
  return {
    rows: (query.data?.items ?? []).map(toApplicationRow),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * 심사 대기 건수. 목록 응답의 totalCount는 현재 필터 기준이라 "심사 대기 N"을 만들 수 없어,
 * SUBMITTED만 세는 1건짜리 조회를 따로 둔다(REVIEWING으로 가는 전이가 서버에 없어 SUBMITTED가
 * 곧 대기 전부다).
 */
export function usePendingApplicationCount(): number | null {
  const query = useQuery({
    queryKey: [...SELLER_APPLICATIONS_QUERY_KEY, 'pending-count'],
    queryFn: ({ signal }) =>
      getAdminSellerApplications({ status: 'SUBMITTED', page: 0, size: 1 }, signal).then(
        response => response.data.totalCount,
      ),
  })
  // 실패하면 직전 성공 값을 흘려보내지 않고 null을 돌려준다 — react-query는 재조회가 403·5xx로
  // 실패해도 캐시된 `data`를 그대로 들고 있어, 그대로 반환하면 권한이 끊긴 뒤에도 nav에 옛 숫자가
  // 남는다(상세 재조회의 ApplicationDetailRefetch와 같은 판단).
  if (query.isError) return null
  return query.data ?? null
}

/**
 * 재조회 결과. 성공 여부를 뷰와 함께 올리는 이유: react-query v5의 `refetch()`는 **실패해도
 * reject하지 않고** `QueryObserverResult`로 resolve하며 그 `data`에는 캐시된 직전 값이 남는다.
 * 뷰만 돌려주면 호출부가 실패를 성공과 구별할 수 없어, 만료된 presigned URL을 그대로 열게 된다.
 */
export interface ApplicationDetailRefetch {
  /** 재조회가 성공했을 때의 최신 상세. 실패하면 null이다(직전 값을 흘려보내지 않는다). */
  detail: ApplicationDetailView | null
  isError: boolean
}

export interface ApplicationDetailResult {
  detail: ApplicationDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
  /** 서류 열기 전에 상세를 다시 불러 5분 만료 presigned URL을 새로 받는다. */
  refetch: () => Promise<ApplicationDetailRefetch>
}

export function useSellerApplicationDetail(
  applicationId: number | null,
): ApplicationDetailResult {
  const query = useQuery({
    queryKey: [...SELLER_APPLICATIONS_QUERY_KEY, 'detail', applicationId],
    queryFn:
      applicationId == null
        ? skipToken
        : ({ signal }) =>
            getAdminSellerApplicationDetail(applicationId, signal).then(
              response => response.data,
            ),
  })
  return {
    detail: query.data ? toApplicationDetail(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: () =>
      query.refetch().then(result =>
        result.isError
          ? { detail: null, isError: true }
          : { detail: result.data ? toApplicationDetail(result.data) : null, isError: false },
      ),
  }
}

export type ApplicationDecision = 'approve' | 'reject'

export interface DecisionInput {
  applicationId: number
  decision: ApplicationDecision
  /** 반려일 때만 쓰는 자유 문자열(500자 이하). 승인 요청에는 본문이 없다. */
  reason?: string
}

/**
 * 승인·반려. 둘 다 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
 * 실패해도 무효화하는 이유는 409(이미 처리됨·다른 운영자 선점)가 "화면이 낡았다"는 신호라
 * 그 자리에서 최신 상태를 다시 받아야 하기 때문이다.
 */
export function useDecideApplication() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ applicationId, decision, reason }: DecisionInput) =>
      decision === 'approve'
        ? approveAdminSellerApplication(applicationId)
        : rejectAdminSellerApplication(applicationId, { reason: reason ?? '' }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: SELLER_APPLICATIONS_QUERY_KEY }),
  })
}

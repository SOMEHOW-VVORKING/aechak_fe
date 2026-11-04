import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  decideAdminReport,
  getAdminReportDetail,
  getAdminReports,
  type AdminReportDetailData,
  type AdminReportListData,
  type DecideReportRequest,
  type GetAdminReportsParams,
} from '@aechak/api'
import { useMetricValue } from '@/shared/hooks/useMetricValue'
import {
  toReportDetailView,
  toReportRow,
  type AdminReportDetailView,
  type AdminReportRow,
  type ReportStatusValue,
  type ReportTargetTypeValue,
} from './reports.map'

// `/admin/reports` 셋(목록·상세·처리)을 실서버에 붙이는 얇은 어댑터. 생성된 react-query 훅이
// 아니라 fetcher만 소비한다(AGENTS 6-2).
//
// 상세·처리 경로는 `{targetType}/{reportId}` 두 조각을 받는다 — 세 신고 표가 각자
// AUTO_INCREMENT라 번호만으로는 행을 가릴 수 없어, 목록 행의 `targetType`을 함께 쥐고 있어야 한다.

export const REPORTS_QUERY_KEY = ['admin-reports'] as const

/** 서버 기본값과 같은 페이지 크기. 형식 오류는 서버가 보정한다(400이 아니다). */
export const DEFAULT_PAGE_SIZE = 20

export interface ReportListParams {
  targetType: ReportTargetTypeValue | 'all'
  status: ReportStatusValue | 'all'
  size?: number
}

function listParams(params: ReportListParams, cursor?: string): GetAdminReportsParams {
  return {
    ...(params.targetType === 'all' ? {} : { targetType: params.targetType }),
    ...(params.status === 'all' ? {} : { status: params.status }),
    ...(cursor ? { cursor } : {}),
    size: params.size ?? DEFAULT_PAGE_SIZE,
  }
}

export interface ReportListResult {
  rows: AdminReportRow[]
  /** 현재 필터 기준 전체 수. 못 받으면 null이고 그때 화면은 숫자를 띄우지 않는다. */
  totalCount: number | null
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
 * **필터를 쿼리 키에 넣는다** — 조건이 바뀐 채 옛 커서를 보내면 서버가 400(90002)으로 끊는다.
 * 키에 넣으면 조건이 바뀌는 순간 커서 사슬이 새로 시작해 FE가 애초에 옛 커서를 보내지 않는다.
 *
 * `더 보기`는 `query.hasNextPage`로만 열고 **응답 본문의 `hasNext`로 열지 않는다**. placeholder
 * 구간에는 `data`가 이전 조건의 페이지라, 본문 값을 읽으면 버튼이 열려 있고 그 버튼이 옛 커서를
 * 요구한다. `totalCount`는 커서 페이지에도 실리는지 스펙에 없어 `pages[0]`에서만 읽는다 —
 * 어느 쪽이어도 맞는 꼴이다.
 */
export function useAdminReports(params: ReportListParams): ReportListResult {
  const query = useInfiniteQuery<AdminReportListData>({
    queryKey: [...REPORTS_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ pageParam, signal }) =>
      getAdminReports(listParams(params, pageParam as string | undefined), signal).then(
        response => response.data,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  })
  const pages = query.data?.pages ?? []
  return {
    rows: pages.flatMap(page => page.items.map(toReportRow)),
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

/**
 * 미처리(`RECEIVED`) 신고 건수. 대시보드 첫 화면의 칸과 할 일 줄이 쓴다.
 *
 * 미처리 신고는 전부 `RECEIVED`다(`reports.map.ts`의 상태 3값 중 나머지 둘은 처리가 끝난 뒤의
 * 결과다). 대상 종류로 좁히지 않아 상품·리뷰·회원 신고를 합쳐 센다 — 운영자의 할 일은 종류와
 * 무관하게 하나의 줄이다.
 */
export function useReceivedReportCount(): number | null {
  const params: GetAdminReportsParams = { status: 'RECEIVED', size: 1 }
  return useMetricValue([...REPORTS_QUERY_KEY, 'received-count'], signal =>
    getAdminReports(params, signal).then(response => response.data.totalCount),
  )
}

/** 상세를 여는 좌표. 번호 하나로는 행이 갈리지 않아 종류를 함께 쥔다. */
export interface ReportRef {
  targetType: ReportTargetTypeValue
  reportId: number
}

export interface ReportDetailResult {
  report: AdminReportDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 상세 조회.
 *
 * 목록 행에 없는 것이 셋이다 — 신고자가 적은 상세 내용(`reasonText`), 같은 대상의 누적 신고
 * 이력(`history`), 이미 내려진 결정(`decision`). 운영자가 제재를 고르기 전에 읽어야 하는 값이
 * 거기 있으므로 드로어를 열 때마다 이 경로를 따로 부른다.
 */
export function useAdminReportDetail(ref: ReportRef | null): ReportDetailResult {
  const query = useQuery<AdminReportDetailData>({
    queryKey: [...REPORTS_QUERY_KEY, 'detail', ref?.targetType ?? null, ref?.reportId ?? null],
    queryFn:
      ref == null
        ? skipToken
        : ({ signal }) =>
            getAdminReportDetail(ref.targetType, ref.reportId, signal).then(
              response => response.data,
            ),
  })
  return {
    report: query.data ? toReportDetailView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

export interface ReportDecideInput extends ReportRef {
  body: DecideReportRequest
}

/**
 * 처리 결정.
 *
 * 204 본문 없음이라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다. **실패해도 무효화한다** —
 * 409(140001 이미 처리됨)와 400(140002 비공개 전환 불가)은 전부 "화면이 낡았다"는 신호라 그
 * 자리에서 서버 상태를 다시 받아야 드로어가 맞는 쪽으로 바뀐다.
 */
export function useDecideReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ targetType, reportId, body }: ReportDecideInput) =>
      decideAdminReport(targetType, reportId, body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: REPORTS_QUERY_KEY }),
  })
}

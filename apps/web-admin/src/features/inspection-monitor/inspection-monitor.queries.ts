import { keepPreviousData, skipToken, useQuery } from '@tanstack/react-query'
import {
  getAdminInspectionDetail,
  getAdminInspections,
  type AdminInspectionListData,
  type GetAdminInspectionsParams,
  type InspectionJudgment,
  type InspectionProcessingState,
  type InspectionTargetType,
} from '@aechak/api'
import {
  inProgressFirst,
  isInProgress,
  toInspectionDetail,
  toInspectionRow,
  type InspectionDetailView,
  type InspectionRowView,
} from './inspection-monitor.map'

// 검수 진행 현황 둘(목록·상세)을 실서버에 붙이는 어댑터. 생성된 react-query 훅이 아니라 fetcher만
// 소비한다(AGENTS 6-2). 쓰기가 없다 — 이 화면은 보는 화면이고, 조치는 AI 검수 큐가 받는다.

export const INSPECTION_MONITOR_QUERY_KEY = ['admin-inspections'] as const

/** 서버 기본값과 같은 페이지 크기. 서버는 1~100으로 절삭한다(상한을 넘겨도 400이 아니다). */
export const DEFAULT_PAGE_SIZE = 20

/** 미선택 센티넬. 세 필터 축 모두 도메인 값에 `'all'`이 없어 그대로 쓸 수 있다(AGENTS 4 함정). */
export const ALL = 'all'

/**
 * 진행 중인 건이 있을 때의 폴링 주기.
 *
 * 검수는 보통 10초 안쪽에 끝난다. 그보다 긴 주기를 쓰면 한 건이 대기 → 처리 중 → 종결을 지나는
 * 동안 화면이 중간 상태를 한 번도 못 보고 "눌렀더니 이미 끝나 있다"가 된다 — 지금 어디까지 왔는지
 * 보려고 들어오는 화면에서 그건 기능이 없는 것과 같다. 3초면 10초 구간에서 두세 번은 잡힌다.
 * 더 짧게 가지 않는 이유는 이 목록의 정렬이 파일소트라(서버에 `requested_at` 인덱스가 없다)
 * 주기를 줄인 만큼 그 비용이 그대로 늘기 때문이다.
 */
export const ACTIVE_POLL_MS = 3_000

/**
 * 진행 중인 건이 하나도 없을 때의 주기.
 *
 * **멈추지 않고 늦춘다.** 완전히 멈추면 운영자가 화면을 열어 둔 채 새로 등록된 상품의 검수가
 * 들어오는 것을 영원히 못 본다(실시간으로 보려고 들어온 화면에서 가장 기다리는 장면이 그것이다).
 * 30초면 새 건이 들어온 뒤 한 주기 안에 보이고, 그때 위의 빠른 주기로 스스로 돌아간다 — 빈 화면을
 * 3초마다 다시 받는 낭비만 걷어 낸다.
 */
export const IDLE_POLL_MS = 30_000

export interface InspectionMonitorListParams {
  processingState: InspectionProcessingState | typeof ALL
  targetType: InspectionTargetType | typeof ALL
  /** 판정 축에 "없음"이 없다 — 판정 전인 건은 처리 상태(QUEUED·IN_FLIGHT)로 고른다. */
  judgment: InspectionJudgment | typeof ALL
  page: number
}

/** 전체는 파라미터를 **키째 빼서** 보낸다(AGENTS 6-6). 서버는 알 수 없는 열거 값을 400/90001로 끊는다. */
function listParams(params: InspectionMonitorListParams): GetAdminInspectionsParams {
  return {
    ...(params.processingState === ALL ? {} : { processingState: params.processingState }),
    ...(params.targetType === ALL ? {} : { targetType: params.targetType }),
    ...(params.judgment === ALL ? {} : { judgment: params.judgment }),
    page: params.page,
    size: DEFAULT_PAGE_SIZE,
  }
}

/** 받아 온 페이지에 아직 끝나지 않은 건이 있는가 — 폴링 주기를 가르는 유일한 판정이다. */
const hasInProgress = (data: AdminInspectionListData | undefined): boolean =>
  (data?.items ?? []).some(item => isInProgress(item.processingState))

export interface InspectionMonitorListResult {
  rows: InspectionRowView[]
  totalCount: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  /** 지금 적용된 폴링 주기(ms). 화면이 "몇 초마다 갱신 중"을 그 값으로 말한다. */
  pollMs: number
}

/**
 * 목록 — 폴링으로 갱신한다. SSE·웹소켓은 백엔드 인프라 작업이 따로 필요해 이번 범위가 아니다.
 *
 * 주기를 응답에 따라 가른다(위 두 상수). 그리고 **화면이 보이지 않을 때는 받지 않는다** —
 * `refetchIntervalInBackground`는 react-query 기본값이 이미 `false`지만 명시해 둔다. 이 화면은
 * 주기 조회가 유일한 동작이라, 기본값이 바뀌거나 누가 켜면 탭을 뒤에 둔 운영자가 모르는 사이
 * 요청이 계속 쌓인다(query-core가 주기마다 `focusManager.isFocused()`를 보고 건너뛴다).
 *
 * `keepPreviousData`로 직전 페이지를 들고 있다가 바꾼다 — 주기마다 표가 빈 상태를 거치면 숫자가
 * 깜빡여 읽을 수 없다.
 */
export function useInspectionMonitorList(
  params: InspectionMonitorListParams,
): InspectionMonitorListResult {
  const query = useQuery<AdminInspectionListData>({
    queryKey: [...INSPECTION_MONITOR_QUERY_KEY, 'list', listParams(params)],
    queryFn: ({ signal }) => getAdminInspections(listParams(params), signal).then(r => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: current => (hasInProgress(current.state.data) ? ACTIVE_POLL_MS : IDLE_POLL_MS),
    refetchIntervalInBackground: false,
  })
  return {
    // 진행 중인 건을 페이지 안에서 위로 올린다. 서버 정렬은 요청 시각 내림차순 고정이다.
    rows: inProgressFirst((query.data?.items ?? []).map(toInspectionRow)),
    totalCount: query.data?.totalCount ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    pollMs: hasInProgress(query.data) ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  }
}

export interface InspectionDetailResult {
  detail: InspectionDetailView | null
  isLoading: boolean
  isError: boolean
  error: unknown
}

/**
 * 상세 — 열어 둔 건이 아직 진행 중일 때만 다시 받는다.
 *
 * 종결된 건의 상세는 더 바뀌지 않으므로(판정·관점 기록이 그 자리에서 끝난다) 주기를 끈다. 목록과
 * 달리 "새 건이 들어오는 것"을 기다릴 이유도 없다 — 이 쿼리는 한 건만 본다.
 */
export function useInspectionDetail(inspectionId: number | null): InspectionDetailResult {
  const query = useQuery({
    queryKey: [...INSPECTION_MONITOR_QUERY_KEY, 'detail', inspectionId],
    queryFn:
      inspectionId == null
        ? skipToken
        : ({ signal }) => getAdminInspectionDetail(inspectionId, signal).then(r => r.data),
    refetchInterval: current =>
      current.state.data != null && isInProgress(current.state.data.processingState)
        ? ACTIVE_POLL_MS
        : false,
    refetchIntervalInBackground: false,
  })
  return {
    detail: query.data ? toInspectionDetail(query.data) : null,
    // enabled 대신 skipToken이라 isPending이 영구 true가 되지 않는다(AGENTS 7 react-query v5 조항).
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  }
}

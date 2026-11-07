import type {
  AdminInspectionDetail,
  AdminInspectionPerspective,
  AdminInspectionSummary,
  InspectionJudgment,
  InspectionPerspectiveKind,
  InspectionProcessingState,
  InspectionTargetType,
  PerspectiveOutcome,
} from '@aechak/api'
import type { StatusPillVariant } from '@aechak/design-system/web'

// `GET /admin/inspections` 둘(목록·상세)의 응답을 화면 모델로 옮기는 매퍼. 서버 열거는 이 파일과
// queries에만 가두고 화면은 여기서 나온 뷰 타입과 라벨만 읽는다(AGENTS 6-2·6-5).
//
// 이 feature가 지켜야 하는 것이 셋이고, 하나라도 어기면 운영자가 "검수를 마쳤다"로 잘못 읽는다.
//
//   1. 판정 널은 **아직 판정이 없다**는 뜻이고 PASS가 아니다.
//   2. UNJUDGED(기한 초과)·FAILED(처리 실패)도 통과가 아니다 — 그 셋을 PASS와 한 칸에 묶지 않는다.
//   3. 관점의 UNCHECKED(갔지만 못 봄)는 CLEAR(통과)와 다르고, **칸이 아예 없는 관점**(파이프라인이
//      거기까지 못 감)은 또 그 둘과 다르다. 셋을 같은 모양으로 그리지 않는다.
//
// 그래서 라벨·색을 고르는 자리를 한곳에 모았다. 화면 여러 곳에서 각자 고르면 한 곳만 고쳐도
// 통과와 미검사가 같은 색이 되는 회귀가 조용히 들어온다.

/** 처리 상태 — 판정과 **다른 축**이다. 종결됐는데 통과가 아닌 건이 있어 둘을 한 칸에 합치지 않는다. */
export const PROCESSING_STATE_META: Record<
  InspectionProcessingState,
  { label: string; variant: StatusPillVariant }
> = {
  QUEUED: { label: '대기', variant: 'neutral' },
  IN_FLIGHT: { label: '처리 중', variant: 'info' },
  SETTLED: { label: '종결', variant: 'muted' },
}

export const PROCESSING_STATE_FILTER_VALUES: InspectionProcessingState[] = [
  'QUEUED',
  'IN_FLIGHT',
  'SETTLED',
]

/**
 * 판정 칸. 서버 판정 넷에 **널 자리(`NONE`)를 화면에서만** 더한다.
 *
 * 서버 열거에 "없음"이 없는 것은 의도된 것이다 — 판정 축에 그 값을 끼우면 기한 초과(UNJUDGED)와
 * 아직 안 끝난 건이 같은 칸에 섞인다. 필터로도 고를 수 없다(그 축은 처리 상태다). 여기서 `NONE`을
 * 두는 이유는 그 반대다: 그릴 때 **빈 칸으로 두거나 통과처럼 보이게 하지 않으려고** 이름을 준다.
 */
export type JudgmentCell = InspectionJudgment | 'NONE'

export const JUDGMENT_META: Record<
  JudgmentCell,
  { label: string; variant: StatusPillVariant; caption?: string }
> = {
  NONE: { label: '판정 전', variant: 'neutral', caption: '아직 판정이 없어요' },
  PASS: { label: '통과', variant: 'success' },
  FLAG: { label: '문제 발견', variant: 'warning' },
  // 통과가 아니다. muted(휴면)로 두면 운영자가 넘겨도 되는 값으로 읽어 기한 초과가 묻힌다.
  UNJUDGED: { label: '기한 초과', variant: 'error', caption: '판정을 받지 못한 채 기한이 지났어요' },
  FAILED: { label: '판정 실패', variant: 'error', caption: '판정 과정이 실패했어요' },
}

/** 판정으로 고를 수 있는 값 — 널은 여기 없다(처리 상태 축으로 고른다). */
export const JUDGMENT_FILTER_VALUES: InspectionJudgment[] = ['PASS', 'FLAG', 'UNJUDGED', 'FAILED']

export const TARGET_TYPE_META: Record<InspectionTargetType, { label: string }> = {
  PRODUCT: { label: '상품' },
  REVIEW: { label: '리뷰' },
}

export const TARGET_TYPE_FILTER_VALUES: InspectionTargetType[] = ['PRODUCT', 'REVIEW']

/**
 * 관점을 그리는 순서 — 파이프라인 순서다(규칙 → 선별 → 표시·광고 → 거래 행위 → 통합).
 *
 * 응답도 이 순서로 오지만 화면이 그 순서에 기대지 않는다. 다섯 칸을 **항상 전부 그리고** 응답에
 * 없는 관점은 '기록 없음'으로 채우기 때문이다 — 그러지 않으면 "그 관점까지 가지 못했다"가 화면에서
 * 사라져 운영자가 본 것만 보고 전부 봤다고 읽는다.
 */
export const PERSPECTIVE_ORDER: InspectionPerspectiveKind[] = [
  'RULE',
  'TRIAGE',
  'DISPLAY_ADS',
  'CONDUCT_TRADE',
  'ALL',
]

export const PERSPECTIVE_META: Record<InspectionPerspectiveKind, { label: string }> = {
  RULE: { label: '규칙' },
  TRIAGE: { label: '선별' },
  DISPLAY_ADS: { label: '표시 / 광고' },
  CONDUCT_TRADE: { label: '거래 행위' },
  ALL: { label: '통합' },
}

/** 관점 칸에 그릴 수 있는 값 — 서버 결과 셋에 **응답에 없음**(`ABSENT`)을 더한 넷이다. */
export type PerspectiveCellOutcome = PerspectiveOutcome | 'ABSENT'

/**
 * 넷을 전부 다른 색·다른 글자로 둔다. 이 화면의 핵심이 이 구분이다.
 *
 * - `CLEAR`는 **봤고 괜찮았다**.
 * - `UNCHECKED`는 **갔지만 보지 못했다**(선별이 건너뛰었거나 호출이 실패했다). 통과가 아니다.
 * - `ABSENT`는 **파이프라인이 거기까지 가지 못했다**. UNCHECKED와도 다르다 — 앞단에서 끝났다는
 *   뜻이라 그 관점에 대해 아무 기록이 없다.
 */
export const PERSPECTIVE_OUTCOME_META: Record<
  PerspectiveCellOutcome,
  { label: string; variant: StatusPillVariant; hint: string }
> = {
  VIOLATION: { label: '위반', variant: 'error', hint: '이 관점에서 위반을 찾았어요' },
  CLEAR: { label: '통과', variant: 'success', hint: '이 관점으로 보고 문제를 찾지 못했어요' },
  UNCHECKED: {
    label: '미검사',
    variant: 'warning',
    hint: '이 관점까지는 갔지만 내용을 보지 못했어요. 통과가 아니에요',
  },
  ABSENT: {
    label: '기록 없음',
    variant: 'muted',
    hint: '파이프라인이 이 관점까지 가지 않아 기록이 없어요',
  },
}

export interface PerspectiveCellView {
  perspective: InspectionPerspectiveKind
  label: string
  outcome: PerspectiveCellOutcome
  /** 미검사 사유. 서버는 UNCHECKED에만 싣는다. */
  skipReason: string | null
  /** 위반 상세 JSON **원문 문자열**. 파싱하지 않는다 — 모양은 AI 레포가 쥐고 있다. */
  violations: string | null
}

export interface InspectionRowView {
  inspectionId: number
  targetType: InspectionTargetType
  targetRef: number
  /** 대상이 상품이고 그 행이 남아 있을 때만 있다. */
  productId: string | null
  /** 같은 조건. 없으면 화면이 종류 + targetRef로 대상을 가리킨다. */
  productName: string | null
  processingState: InspectionProcessingState
  judgment: JudgmentCell
  attempt: number
  /** 와이어 원문(타임존 없는 LocalDateTime). 경과 시간 계산이 이 값을 쓴다. */
  requestedAt: string
  settledAt: string | null
  policyVersion: string
}

export interface InspectionDetailView extends InspectionRowView {
  promptVersion: string | null
  contentHash: string
  reasonCode: string | null
  reasonSummary: string | null
  sellerNotice: string | null
  leaseOwner: string | null
  leaseExpiresAt: string | null
  /** 항상 다섯 칸(+ 알 수 없는 관점). 응답에 없는 관점은 `ABSENT`로 채워 그린다. */
  perspectives: PerspectiveCellView[]
}

/** 진행 중 = 아직 종결되지 않음. 폴링 주기와 행 정렬이 같은 판정을 쓴다. */
export function isInProgress(state: InspectionProcessingState): boolean {
  return state !== 'SETTLED'
}

/** 널을 `'NONE'`으로 바꾼다 — 그려야 할 칸이 비면 운영자가 통과로 읽는다. */
const judgmentCell = (judgment: InspectionJudgment | null | undefined): JudgmentCell =>
  judgment ?? 'NONE'

/** 통과가 아닌 종결 — 종결 뱃지 옆에 경고를 함께 세우는 자리의 판정이다. */
export function isUnsettledOutcome(row: InspectionRowView): boolean {
  return row.judgment === 'UNJUDGED' || row.judgment === 'FAILED' || row.judgment === 'NONE'
}

export function toInspectionRow(summary: AdminInspectionSummary): InspectionRowView {
  return {
    inspectionId: summary.inspectionId,
    targetType: summary.targetType,
    targetRef: summary.targetRef,
    productId: summary.productId ?? null,
    productName: summary.productName ?? null,
    processingState: summary.processingState,
    judgment: judgmentCell(summary.judgment),
    attempt: summary.attempt,
    requestedAt: summary.requestedAt,
    settledAt: summary.settledAt ?? null,
    policyVersion: summary.policyVersion,
  }
}

/**
 * 관점 다섯 칸을 만든다. **응답에 없는 관점을 빼지 않고 `ABSENT`로 채운다.**
 *
 * 응답 배열을 그대로 그리면 "거기까지 가지 못했다"가 화면에서 사라진다 — 규칙 한 줄만 적힌 건이
 * 전부 통과한 건과 같은 모양이 된다. 그리고 우리가 모르는 관점 값이 오면 **뒤에 덧붙인다**:
 * 서버가 관점을 더했을 때 조용히 지워 버리면 그 관점이 돌았다는 사실 자체가 가려진다.
 */
export function toPerspectiveCells(
  perspectives: AdminInspectionPerspective[],
): PerspectiveCellView[] {
  const byKind = new Map<InspectionPerspectiveKind, AdminInspectionPerspective>()
  // 같은 관점이 둘 오면 먼저 온 것을 남긴다(응답이 파이프라인 순서라 앞이 그 관점의 기록이다).
  for (const item of perspectives) {
    if (!byKind.has(item.perspective)) byKind.set(item.perspective, item)
  }
  const known = PERSPECTIVE_ORDER.map(perspective => {
    const found = byKind.get(perspective)
    return {
      perspective,
      label: PERSPECTIVE_META[perspective].label,
      outcome: (found?.outcome ?? 'ABSENT') as PerspectiveCellOutcome,
      skipReason: found?.skipReason ?? null,
      violations: found?.violations ?? null,
    }
  })
  const extra = [...byKind.values()]
    .filter(item => !PERSPECTIVE_ORDER.includes(item.perspective))
    .map(item => ({
      perspective: item.perspective,
      label: PERSPECTIVE_META[item.perspective]?.label ?? item.perspective,
      outcome: item.outcome as PerspectiveCellOutcome,
      skipReason: item.skipReason ?? null,
      violations: item.violations ?? null,
    }))
  return [...known, ...extra]
}

export function toInspectionDetail(detail: AdminInspectionDetail): InspectionDetailView {
  return {
    ...toInspectionRow(detail),
    promptVersion: detail.promptVersion ?? null,
    contentHash: detail.contentHash,
    reasonCode: detail.reasonCode ?? null,
    reasonSummary: detail.reasonSummary ?? null,
    sellerNotice: detail.sellerNotice ?? null,
    leaseOwner: detail.leaseOwner ?? null,
    leaseExpiresAt: detail.leaseExpiresAt ?? null,
    perspectives: toPerspectiveCells(detail.perspectives),
  }
}

/**
 * 진행 중인 건을 위로 올린다. **서버 정렬(requestedAt 내림차순)을 바꾸지 않고 페이지 안에서만** 한다.
 *
 * 운영자가 이 화면에 들어오는 이유가 지금 돌고 있는 건이라 그것이 맨 위에 있어야 한다. 서버는
 * 정렬 파라미터를 받지 않으므로(요청 시각 내림차순 고정) 그 뜻을 여기서 더한다 — 버킷 안의 순서는
 * 받은 그대로 두니 요청 시각 내림차순이 유지된다.
 *
 * **한계를 분명히 해 둔다**: 이 정렬은 받아 온 페이지 안에서만이다. 오래전에 요청돼 QUEUED로 멈춘
 * 건은 요청 시각이 낡아 뒤 페이지에 있고 이 정렬로는 올라오지 않는다 — 그 건을 보는 통로는
 * 처리 상태 필터다(그래서 필터가 장식이 아니다).
 */
export function inProgressFirst(rows: InspectionRowView[]): InspectionRowView[] {
  const inProgress = rows.filter(row => isInProgress(row.processingState))
  const settled = rows.filter(row => !isInProgress(row.processingState))
  return [...inProgress, ...settled]
}

/**
 * 타임존이 없는 서버 LocalDateTime을 **브라우저 로컬 시각으로** 읽는다.
 *
 * 서버가 오프셋을 싣지 않으므로 다른 해석이 없다 — 운영자 브라우저의 타임존이 서버와 다르면 경과
 * 시간이 그 차이만큼 어긋난다(두 값 모두 서버 시각이라 **시각 표시**는 멀쩡하고, 지금과 비교하는
 * 경과만 틀어진다). 어긋남을 숨기지 않으려고 음수는 0으로 끊기만 하고 값을 지어내지 않는다.
 */
export function parseWireDateTime(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * 경과 시간(밀리초). 끝점은 종결 시각이고, 진행 중이면 **지금**이다.
 *
 * 서버가 준 경과 숫자를 그대로 두면 갱신 주기만큼 늦은 값이 보인다 — 그래서 화면이 센다.
 */
export function elapsedMs(row: InspectionRowView, now: number): number | null {
  const start = parseWireDateTime(row.requestedAt)
  if (start == null) return null
  const end = parseWireDateTime(row.settledAt) ?? now
  return Math.max(0, end - start)
}

/** `12초` · `3분 20초` · `2시간 5분` · `1일 3시간`. 값이 없으면 줄표다(0이 아니다). */
export function formatElapsed(ms: number | null): string {
  if (ms == null) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}초`
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}분 ${totalSeconds % 60}초`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) return `${totalHours}시간 ${totalMinutes % 60}분`
  return `${Math.floor(totalHours / 24)}일 ${totalHours % 24}시간`
}

/** ISO-8601 local(초·나노 포함)에서 분까지만 남긴다. feature 경계 때문에 feature마다 같은 함수를 둔다. */
export function formatWireDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time] = value.split('T')
  if (!date) return '—'
  return time ? `${date} ${time.slice(0, 5)}` : date
}

/** 대상 표시 — 상품명이 없으면(리뷰 검수·지워진 상품) 종류와 내부 식별자로 가리킨다. */
export function targetLabel(row: InspectionRowView): string {
  if (row.productName) return row.productName
  return `${TARGET_TYPE_META[row.targetType].label} ${row.targetRef}`
}

/** 임차가 이미 풀렸는지 — 지난 시각이면 다음 주기의 재발행 대상이다. */
export function isLeaseExpired(detail: InspectionDetailView, now: number): boolean {
  const expiresAt = parseWireDateTime(detail.leaseExpiresAt)
  return expiresAt != null && expiresAt <= now
}

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

export function listErrorMessage(error: unknown): string {
  if (toWireError(error).status === 403) {
    return '어드민 권한이 없어 검수 현황을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  }
  return '검수 현황을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  // 40508 — 그 검수 행이 없다. 목록이 낡았다는 뜻이라 닫고 다시 고르면 된다.
  if (status === 404 && errorCode === 40508) return '이 검수를 찾을 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 403) return '어드민 권한이 없어 검수 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  return '검수 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

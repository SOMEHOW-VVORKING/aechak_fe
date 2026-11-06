import type {
  AdminReportDetailData,
  AdminReportSummary,
  ReportDecisionReason,
  ReportDecisionType,
  ReportHandlingStatus,
  ReportReasonCode,
  ReportTargetType,
  SanctionAction,
  SanctionReasonCode,
} from '@aechak/api'
import type { HistoryEntry } from '@aechak/domain'

// 와이어 enum·필드는 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 view 타입 어휘만 쓴다.
//
// 이 화면이 다루는 열거가 **여섯**이다 — 대상 4 · 상태 3 · 접수 사유 8 · 처리 사유 6 ·
// 제재 조치 5 · 제재 사유 4. 값들은 그대로 서버 필터와 요청 본문으로 되돌아가야 하는 불투명한
// 코드라 FE 소문자 어휘로 다시 이름 짓지 않고, 타입만 feature 이름으로 다시 내보낸다.
export type ReportTargetTypeValue = ReportTargetType
export type ReportStatusValue = ReportHandlingStatus
export type ReportReasonValue = ReportReasonCode
export type ReportDecisionValue = ReportDecisionType
export type ReportDecisionReasonValue = ReportDecisionReason
export type ReportSanctionActionValue = SanctionAction
export type ReportSanctionReasonValue = SanctionReasonCode

/**
 * 대상 종류 라벨 4값. 경로의 첫 세그먼트이기도 해서 값 자체가 화면 밖으로 나간다.
 * SNS 프로필 사용자 신고는 리뷰 화면의 사용자 신고와 같은 USER로 온다.
 */
export const REPORT_TARGET_TYPE_LABELS = {
  PRODUCT: '상품',
  REVIEW: '리뷰',
  USER: '회원',
  SNS_POST: 'SNS 게시물',
} satisfies Record<ReportTargetTypeValue, string>

/**
 * 처리 상태 라벨 3값.
 *
 * 어드민 응답의 상태는 구매자 접수 측 `ReportStatus`(RECEIVED·FORWARDED·RESOLVED·DISMISSED)와
 * **다른 열거**다. 미처리 신고가 전부 `RECEIVED`라 이 표에서 그 값이 빠지면 거의 모든 행이
 * 라벨을 잃고, `StatusMetaPill`의 구조분해가 TypeError를 내 **표가 통째로 사라진다**.
 * `satisfies`로 적어 두면 서버가 값을 늘린 날 `pnpm openapi:generate` 결과가 그 자리에서
 * 타입 오류를 낸다.
 */
export const REPORT_STATUS_LABELS = {
  RECEIVED: '접수',
  DISMISSED: '제재 없음',
  SANCTIONED: '제재 완료',
} satisfies Record<ReportStatusValue, string>

/**
 * **접수** 사유 라벨 8값 — 신고한 사람이 고른 값이다.
 *
 * 아래 처리 사유와 **다른 표여야 한다.** `FALSE_AD`·`ABUSE`·`ILLEGAL` 셋이 양쪽에 다 있어
 * 한 표로 다루면 섞어 써도 라벨이 나오고, 그래서 조용히 틀린다 — 접수 칸에 처리 사유 라벨이
 * 찍히거나 처리 선택지에 서버가 받지 않는 `SPAM`이 올라간다.
 *
 * 여덟은 대상 종류별 어휘의 **합집합**이다(PRODUCT=FALSE_AD·INFO_ERROR·ILLEGAL·INAPPROPRIATE·
 * OTHER, REVIEW·USER=FRAUD·ABUSE·SPAM·INAPPROPRIATE·OTHER). 그래서 이 표는 **그리는 데만** 쓰고
 * 필터 옵션으로 깔지 않는다 — 서버에 `reasonCode` 파라미터가 아예 없고, 있다 해도 여덟을 한 줄에
 * 깔면 그 종류에 없는 값을 고를 수 있다.
 */
export const REPORT_REASON_LABELS = {
  ABUSE: '욕설/비방',
  FALSE_AD: '허위/과장 광고',
  FRAUD: '사기 의심',
  ILLEGAL: '불법/미취급 상품',
  INAPPROPRIATE: '부적절한 내용',
  INFO_ERROR: '상품 정보 오류',
  OTHER: '기타',
  SPAM: '스팸/도배',
} satisfies Record<ReportReasonValue, string>

/** 처리 결정 라벨 3값. SNS 게시물의 비공개 전환은 `decisionLabel`이 게시물 삭제로 바꿔 그린다. */
export const REPORT_DECISION_LABELS = {
  DISMISS: '제재 없음',
  HIDE_TARGET: '비공개 전환',
  SANCTION_ACCOUNT: '계정 제재',
} satisfies Record<ReportDecisionValue, string>

/** **처리** 사유 라벨 6값 — 운영자가 고르는 값이다(위 접수 사유와 다른 어휘). */
export const REPORT_DECISION_REASON_LABELS = {
  FALSE_AD: '허위/과장 광고',
  ABUSE: '욕설/비방',
  EXTERNAL_TRADE: '외부 거래 유도',
  ILLEGAL: '불법/미취급 상품',
  FALSE_REPORT: '허위 신고 반복',
  NOT_CONFIRMED: '신고 내용 확인 불가',
} satisfies Record<ReportDecisionReasonValue, string>

/**
 * 제재 조치 라벨 5값과 제재 사유 라벨 4값.
 *
 * 회원 관리 화면(`features/members`)이 같은 서버 열거에 같은 라벨을 들고 있지만 feature 간 직접
 * import가 금지라(AGENTS 1-1) 여기 다시 적는다. 어휘를 맞춰 두는 것이 중요하다 — 같은 제재가
 * 두 화면에서 다른 이름으로 보이면 운영자가 다른 처리라고 읽는다.
 */
export const REPORT_SANCTION_ACTION_LABELS = {
  RESTRICT: '이용 제한',
  SUSPEND: '임시 정지',
  BAN: '영구 정지',
  FORCE_WITHDRAW: '탈퇴 처리',
  RELEASE: '제재 해제',
} satisfies Record<ReportSanctionActionValue, string>

export const REPORT_SANCTION_REASON_LABELS = {
  ABUSIVE_REVIEW: '리뷰 욕설/비방 반복',
  CHAT_DISPUTE: '채팅 분쟁 반복',
  FALSE_REPORT: '허위 신고 반복',
  OTHER: '기타 (상세 사유 필수)',
} satisfies Record<ReportSanctionReasonValue, string>

/** 필터·선택 옵션 순서 — 표의 키 순서가 그대로 옵션 순서다. */
export const REPORT_TARGET_TYPES = Object.keys(
  REPORT_TARGET_TYPE_LABELS,
) as ReportTargetTypeValue[]
export const REPORT_STATUSES = Object.keys(REPORT_STATUS_LABELS) as ReportStatusValue[]
export const REPORT_SANCTION_REASONS = Object.keys(
  REPORT_SANCTION_REASON_LABELS,
) as ReportSanctionReasonValue[]

/**
 * 제재 조치 선택지 — `RELEASE`를 빼고 넷만 내준다.
 *
 * 해제는 제재가 아니라 되돌리기이고 서버에도 별 경로가 있다(회원 제재 해제). 스펙이 못박은 대로
 * 제재 요청에 `RELEASE`를 실으면 400/90001이라, 선택지로 두면 운영자가 못 쓰는 항목을 고른다.
 */
export const REPORT_SANCTION_ACTIONS = (
  Object.keys(REPORT_SANCTION_ACTION_LABELS) as ReportSanctionActionValue[]
).filter(action => action !== 'RELEASE')

/**
 * 비공개 전환을 걸 수 있는 대상 종류.
 *
 * 서버 `ReportTargetType.hasHidableTarget()`이 **리뷰와 SNS 게시물에서만 참**이다 — 사용자는 숨길
 * 콘텐츠가 아니고, 상품은 노출을 되돌릴 수단이 없다(판매 상태는 셀러가 되돌리고 검수 상태는 검수
 * 큐가 신고 결정을 보지 않고 되돌린다). 그 밖의 대상에 `HIDE_TARGET`을 보내면 400(140002)이라
 * 화면이 선택지를 내주지 않는다.
 */
export const canHideTarget = (targetType: ReportTargetTypeValue): boolean =>
  targetType === 'REVIEW' || targetType === 'SNS_POST'

/**
 * SNS 게시물은 블라인드 상태가 없어 비공개 전환이 운영자 삭제다(작성자가 지운 것과 같이 사라진다).
 * 계정 제재도 그 게시물을 함께 지운다.
 */
export const decisionLabel = (
  targetType: ReportTargetTypeValue,
  decision: ReportDecisionValue,
): string =>
  targetType === 'SNS_POST' && decision === 'HIDE_TARGET'
    ? '게시물 삭제'
    : (REPORT_DECISION_LABELS[decision] ?? decision)

/**
 * 제재와 함께 보낼 수 없는 처리 사유 둘.
 *
 * `NOT_CONFIRMED`·`FALSE_REPORT`는 "대상에게 위반이 없었다"는 판정이라(서버
 * `indicatesNoViolationByTarget`) 계정 제재와 같은 요청에 실으면 400(140003·140004)이다.
 */
const NO_VIOLATION_REASONS: ReportDecisionReasonValue[] = ['FALSE_REPORT', 'NOT_CONFIRMED']

/** 그 결정으로 보낼 수 있는 처리 사유. 조합을 서버가 아니라 화면이 먼저 막는다. */
export const decisionReasonsFor = (
  decision: ReportDecisionValue,
): ReportDecisionReasonValue[] => {
  const all = Object.keys(REPORT_DECISION_REASON_LABELS) as ReportDecisionReasonValue[]
  return decision === 'SANCTION_ACCOUNT'
    ? all.filter(reason => !NO_VIOLATION_REASONS.includes(reason))
    : all
}

/**
 * 목록·상세의 시각 — `MM-DD HH:mm`.
 *
 * 서버가 주는 값은 오프셋 없는 LocalDateTime(KST 벽시계)이라 `new Date()`로 파싱하면 브라우저
 * 타임존만큼 밀린다 — 자리를 잘라 읽는다. 날짜 라벨은 feature마다 따로 두는 것이 이 레포 관례다.
 */
export function toDateTimeLabel(isoLocal: string): string {
  return `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`
}

/** 이력 행의 날짜만 — `MM-DD`. */
export const toDateLabel = (isoLocal: string): string => isoLocal.slice(5, 10)

export interface AdminReportRow {
  /**
   * 표의 행 키이자 상세·조치 경로의 앞 두 조각(`PRODUCT/31`).
   *
   * 세 신고 표가 각자 AUTO_INCREMENT라 `reportId`만으로는 행이 갈리지 않는다 — 번호만 키로 쓰면
   * 상품 31번과 리뷰 31번이 한 행으로 뭉개진다.
   */
  rowKey: string
  targetType: ReportTargetTypeValue
  reportId: number
  /** 대상을 다시 여는 식별자. 상품은 ULID, SNS 게시물은 publicId, 리뷰와 사용자는 내부 번호라 뜻이 종류마다 다르다. */
  targetKey: string
  /** 상품명, 리뷰 본문, SNS 게시물 캡션. **사용자 신고와 지운 SNS 게시물에는 없다.** */
  targetName: string | null
  targetOwnerUserId: number
  /** 탈퇴·삭제된 계정은 비어 온다. */
  targetOwnerNickname: string | null
  /** **접수** 사유다(운영자가 고르는 처리 사유가 아니다). */
  reasonCode: ReportReasonValue
  /** 같은 대상에 쌓인 누적 신고 수 — 서버가 세 준다. */
  reportCount: number
  reportedAt: string
  status: ReportStatusValue
  /** 미처리 신고는 null이다. */
  decision: ReportDecisionValue | null
  decisionReasonCode: ReportDecisionReasonValue | null
  decidedAt: string | null
}

export const reportRowKey = (targetType: ReportTargetTypeValue, reportId: number): string =>
  `${targetType}/${reportId}`

export const toReportRow = (wire: AdminReportSummary): AdminReportRow => ({
  rowKey: reportRowKey(wire.targetType, wire.reportId),
  targetType: wire.targetType,
  reportId: wire.reportId,
  targetKey: wire.targetKey,
  targetName: wire.targetName,
  targetOwnerUserId: wire.targetOwnerUserId,
  targetOwnerNickname: wire.targetOwnerNickname,
  reasonCode: wire.reasonCode,
  reportCount: wire.reportCount,
  reportedAt: wire.reportedAt,
  status: wire.status,
  decision: wire.decision,
  decisionReasonCode: wire.decisionReasonCode,
  decidedAt: wire.decidedAt,
})

/**
 * 대상 이름이 없는 신고(사용자 신고)는 닉네임으로, 그것도 없으면 종류+식별자로 읽게 한다.
 * 캡션이 없는 SNS 게시물(지운 게시물)은 닉네임으로 떨어지면 회원 신고로 읽혀 종류+식별자로 그린다.
 */
export const targetTitle = (row: AdminReportRow): string =>
  row.targetName ??
  (row.targetType === 'SNS_POST' ? null : row.targetOwnerNickname) ??
  `${REPORT_TARGET_TYPE_LABELS[row.targetType] ?? row.targetType} ${row.targetKey}`

/** 이미 내려진 결정. 미처리 신고에는 없다. */
export interface ReportDecisionView {
  decision: ReportDecisionValue
  reasonCode: ReportDecisionReasonValue
  reasonDetail: string | null
  /** 신고 **대상자**에게 쓴 안내. 저장만 되는 값이다(발송 경로가 플랫폼에 없다). */
  noticeToOwner: string | null
  internalMemo: string | null
  decidedAt: string
}

/** 같은 대상에 쌓인 신고 한 건. `HistoryList`가 `label`·`date`를 읽는다. */
export interface ReportHistoryRow extends HistoryEntry {
  reportId: number
  /** 신고자가 적은 상세. 고르기만 한 신고는 비어 온다. */
  reasonText: string | null
  status: ReportStatusValue
}

export interface AdminReportDetailView {
  report: AdminReportRow
  /** 신고한 사람. **제재 대상이 아니다** — 제재는 `targetOwnerUserId`에 걸린다. */
  reporterId: number
  reasonText: string | null
  history: ReportHistoryRow[]
  decision: ReportDecisionView | null
}

export const toReportDetailView = (wire: AdminReportDetailData): AdminReportDetailView => ({
  report: toReportRow(wire.report),
  reporterId: wire.reporterId,
  reasonText: wire.reasonText,
  history: wire.history.map(entry => ({
    reportId: entry.reportId,
    label: REPORT_REASON_LABELS[entry.reasonCode] ?? entry.reasonCode,
    date: toDateLabel(entry.reportedAt),
    reasonText: entry.reasonText,
    status: entry.status,
  })),
  decision:
    wire.decision == null
      ? null
      : {
          decision: wire.decision.decision,
          reasonCode: wire.decision.reasonCode,
          reasonDetail: wire.decision.reasonDetail,
          noticeToOwner: wire.decision.noticeToOwner,
          internalMemo: wire.decision.internalMemo,
          decidedAt: wire.decision.decidedAt,
        },
})

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

const FORBIDDEN_BY_ROLE = 20011
const REPORT_NOT_FOUND = 140000
const ALREADY_DECIDED = 140001
const NOT_HIDABLE = 140002
/** 결정과 제재 입력이 어긋남. 어느 코드가 필수이고 어느 쪽이 금지인지는 확인하지 못했다. */
const SANCTION_MISMATCH = [140003, 140004]
const OTHER_NEEDS_DETAIL = 30800
const SUSPEND_NEEDS_DURATION = 30801
const DURATION_NOT_ALLOWED = 30802

/** 세 경로가 같은 계약을 쓰는 인증·권한 분기(20004·20011). 없으면 null이다. */
function authMessage(status?: number): string | null {
  if (status === 403) return '어드민 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.'
  return null
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 403 && errorCode === FORBIDDEN_BY_ROLE)
    return '어드민 권한이 없어 신고를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  // 90002는 조건을 바꾼 채 옛 커서를 보낸 경우다 — 필터를 바꾸면 커서 사슬이 새로 시작되므로
  // 정상 흐름에서는 나오지 않지만, 나오면 처음부터 다시 받아야 한다는 사실을 알려야 한다.
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 필터를 다시 선택해 주세요.'
  return '신고 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 404 || errorCode === REPORT_NOT_FOUND)
    return '이미 사라진 신고예요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  return '신고 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 처리 실패 문구.
 *
 * 409(140001)는 멱등이 아니라 거절이다 — 다른 운영자가 먼저 처리한 신고라 재시도를 권하면
 * 같은 409를 다시 받는다. 140002·140003·140004는 화면이 미리 막는 조합이라 여기로 오면
 * "화면이 낡았다"는 신호다. **140003과 140004를 가르지 않는다** — 둘 중 어느 코드가 제재 필수이고
 * 어느 쪽이 금지인지 스펙에서 확인하지 못해, 가르면 반대로 적힐 수 있다.
 */
export function decideErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (errorCode === ALREADY_DECIDED)
    return '이미 처리된 신고예요. 목록을 다시 불러왔어요.'
  if (errorCode === NOT_HIDABLE)
    return '리뷰와 SNS 게시물 신고에만 비공개 전환을 걸 수 있어요. 다른 결정을 골라 주세요.'
  if (errorCode != null && SANCTION_MISMATCH.includes(errorCode))
    return '처리 결정과 제재 입력이 서로 맞지 않아요. 결정과 사유, 제재 내용을 다시 확인해 주세요.'
  if (errorCode === OTHER_NEEDS_DETAIL)
    return '기타 사유를 고르면 상세 사유를 적어야 해요.'
  if (errorCode === SUSPEND_NEEDS_DURATION) return '임시 정지는 제재 기간을 골라야 해요.'
  if (errorCode === DURATION_NOT_ALLOWED)
    return '임시 정지가 아닌 제재에는 기간을 지정할 수 없어요.'
  if (status === 404 || errorCode === REPORT_NOT_FOUND)
    return '이미 사라진 신고예요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 사유와 제재 내용을 확인해 주세요.'
  return '신고를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

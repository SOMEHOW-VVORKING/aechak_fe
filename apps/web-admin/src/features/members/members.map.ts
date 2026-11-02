import type {
  AdminMemberStatus,
  AdminMemberSummary,
  AdminSanctionHistory,
  SanctionAction,
  SanctionReasonCode,
} from '@aechak/api'
import type { HistoryEntry, MemberAccount, MemberAccountStatus } from '@aechak/domain'

// 와이어 enum은 이 파일 안에 가둔다(AGENTS 6-2). 화면은 MemberAccountStatus 어휘만 쓰고,
// 서버 UserStatus·SanctionAction·SanctionReasonCode는 여기서만 등장한다.

const STATUS_FROM_WIRE: Record<AdminMemberStatus, MemberAccountStatus> = {
  PENDING_ONBOARDING: 'pending',
  ACTIVE: 'normal',
  RESTRICTED: 'restricted',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
  WITHDRAWN: 'withdrawing',
}

/** 목록 상태 필터의 와이어 값. 'all'은 파라미터 자체를 보내지 않는다. */
export const STATUS_FILTER_TO_WIRE = {
  normal: 'NORMAL',
  restricted: 'RESTRICTED',
  suspended: 'SUSPENDED',
  banned: 'BANNED',
  withdrawing: 'WITHDRAWN',
} as const satisfies Partial<Record<MemberAccountStatus, string>>

export type MemberStatusFilterValue = 'all' | keyof typeof STATUS_FILTER_TO_WIRE

/**
 * 제재 결정 → 서버 조치. 'normal'은 조치가 아니라 **해제**라 별도 경로(.../sanctions/release)로
 * 나가므로 이 표에 없다. 'pending'은 운영자가 만들 수 있는 상태가 아니다.
 */
export const DECISION_TO_ACTION = {
  restricted: 'RESTRICT',
  suspended: 'SUSPEND',
  banned: 'BAN',
  withdrawing: 'FORCE_WITHDRAW',
} as const satisfies Partial<Record<MemberAccountStatus, SanctionAction>>

export type SanctionDecision = keyof typeof DECISION_TO_ACTION

export function isSanctionDecision(value: MemberAccountStatus): value is SanctionDecision {
  return value in DECISION_TO_ACTION
}

/** 제재 사유 고정 어휘의 화면 라벨. 서버가 라벨을 주지 않아 FE가 소유한다. */
export const SANCTION_REASON_LABELS: Record<SanctionReasonCode, string> = {
  ABUSIVE_REVIEW: '리뷰 욕설/비방 반복',
  CHAT_DISPUTE: '채팅 분쟁 반복',
  FALSE_REPORT: '허위 신고 반복',
  OTHER: '기타 (상세 사유 필수)',
}

/** 이력 행의 조치 라벨 — 계정 상태 라벨과 어휘를 맞춘다. */
const ACTION_LABELS: Record<SanctionAction, string> = {
  RESTRICT: '이용 제한',
  SUSPEND: '임시 정지',
  BAN: '영구 정지',
  FORCE_WITHDRAW: '탈퇴 처리',
  RELEASE: '제재 해제',
}

export function toMemberAccount(wire: AdminMemberSummary): MemberAccount {
  return {
    userId: wire.userId,
    publicId: wire.publicId,
    nickname: wire.nickname,
    accountStatus: STATUS_FROM_WIRE[wire.status],
    storedAccountStatus: STATUS_FROM_WIRE[wire.storedStatus],
    sanctionUntil: wire.sanctionUntil,
    warningCount: wire.warningCount,
    reportCount: wire.reportCount,
    joinedAt: wire.joinedAt,
  }
}

export interface SanctionEntryView extends HistoryEntry {
  sanctionId: number
  /** 사유 어휘 + 상세를 합친 한 줄. 해제 행은 어휘가 없어 상세만 남는다. */
  reason: string | null
  /** 임시 정지의 만료 시각(날짜). 다른 조치는 null */
  effectiveUntil: string | null
  memo: string | null
  actedByAdminId: number
}

/** 오프셋 없는 LocalDateTime의 날짜 부분만 쓴다 — 목록·이력은 날짜 단위로 읽는다. */
export function toDateLabel(isoLocal: string): string {
  return isoLocal.slice(0, 10)
}

export function toSanctionEntry(wire: AdminSanctionHistory): SanctionEntryView {
  const code = wire.reasonCode ? SANCTION_REASON_LABELS[wire.reasonCode] : null
  const detail = wire.reasonDetail?.trim() || null
  return {
    sanctionId: wire.sanctionId,
    label: ACTION_LABELS[wire.action],
    date: toDateLabel(wire.actedAt),
    reason: [code, detail].filter(Boolean).join(' / ') || null,
    effectiveUntil: wire.effectiveUntil ? toDateLabel(wire.effectiveUntil) : null,
    memo: wire.memo,
    actedByAdminId: wire.actedByAdminId,
  }
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

const FORBIDDEN_BY_ROLE = 20011

function isForbiddenByRole(error: unknown): boolean {
  const { status, errorCode } = toWireError(error)
  return status === 403 && errorCode === FORBIDDEN_BY_ROLE
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 회원 목록을 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  // 90002는 상태 필터를 바꾼 채 옛 커서를 보낸 경우다 — 필터를 바꾸면 커서 사슬이 새로 시작되므로
  // 정상 흐름에서는 나오지 않지만, 나오면 처음부터 다시 받아야 한다는 사실을 알려야 한다.
  if (status === 400 && errorCode === 90002)
    return '목록 조건이 바뀌었어요. 필터를 다시 선택해 처음부터 불러와 주세요.'
  return '회원 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status } = toWireError(error)
  if (isForbiddenByRole(error))
    return '어드민 권한이 없어 회원 상세를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  // 404는 없는 계정과 관리자 계정이 같은 응답이다(관리자는 이 목록의 대상이 아니다).
  if (status === 404) return '회원을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  return '회원 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 제재·해제 실패 문구. 409 셋은 운영자가 할 일이 서로 달라 한 문구로 묶지 않는다 —
 * 영구 정지·탈퇴는 되돌릴 수 없고, 제재 없음은 애초에 풀 것이 없다.
 */
export function sanctionErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 409 && errorCode === 30018)
    return '이미 영구 정지된 계정이라 상태를 바꿀 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 30003)
    return '이미 탈퇴한 계정이에요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 30019)
    return '해제할 제재가 없어요. 목록을 다시 불러왔어요.'
  if (status === 409 && errorCode === 30021)
    return '관리자 계정은 제재할 수 없어요. 관리자 명부에서 먼저 강등해 주세요.'
  if (status === 409 && errorCode === 30023)
    return '가입을 마치지 않은 계정에는 이용 제한·임시 정지를 걸 수 없어요. 영구 정지나 탈퇴 처리를 사용해 주세요.'
  if (status === 403 && errorCode === 30020) return '자신을 제재할 수 없어요.'
  if (status === 403) return '이 작업을 처리할 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 404) return '회원을 찾을 수 없어요. 목록을 다시 불러와 주세요.'
  if (status === 400 && errorCode === 30800) return '기타 사유를 고르면 상세 사유를 적어야 해요.'
  if (status === 400 && errorCode === 30801) return '임시 정지는 제재 기간을 골라야 해요.'
  if (status === 400 && errorCode === 30802)
    return '임시 정지가 아닌 제재에는 기간을 지정할 수 없어요.'
  if (status === 400) return '입력한 값을 서버가 받지 못했어요. 사유와 기간을 확인해 주세요.'
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

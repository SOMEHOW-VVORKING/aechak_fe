import type {
  AdminAuditAction,
  AdminAuditActorRole,
  AdminAuditLogEntry,
  AdminAuditResult,
  AdminAuditTargetType,
} from '@aechak/api'

// 와이어 enum·필드는 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 view 타입 어휘만 쓴다.
//
// 리뷰·문의는 서버 enum을 소문자 FE 어휘로 1:1 변환해 두는데 감사 로그는 **그렇게 하지 않는다.**
// 세 축(action 24 · targetType 11 · result 2)을 한 번 더 베끼면 변환표 둘과 라벨 표가 서로 어긋날
// 자리만 늘어나고, 이 축들의 값은 그대로 서버 필터로 되돌아가야 하는 **불투명한 코드**라 FE가 다시
// 이름 지을 것이 없다. 그래서 타입만 feature 이름으로 다시 내보내 화면이 `@aechak/api`를 직접
// 보지 않게 한다.
export type AuditAction = AdminAuditAction
export type AuditTargetType = AdminAuditTargetType
export type AuditResult = AdminAuditResult

/**
 * 액션 한글 라벨 24값.
 *
 * 열에는 서버 `actionLabel`을 그대로 쓴다 — FE 표로 덮으면 서버가 열거를 늘린 날 빈 칸이 되거나
 * 틀린 한글이 찍힌다. 이 표가 있어야 하는 이유는 **필터 옵션**이다: 옵션은 데이터가 오기 전에
 * 존재해야 해서 서버 라벨로 만들 수 없다. `satisfies`로 적어 두면 서버가 값을 늘렸을 때
 * `pnpm openapi:generate` 결과가 타입 오류를 내 옵션에서 빠진 것이 그 자리에서 드러난다.
 */
export const AUDIT_ACTION_LABELS = {
  SELLER_APPLICATION_APPROVED: '셀러 입점 승인',
  SELLER_APPLICATION_REJECTED: '셀러 입점 반려',
  SELLER_SUSPENDED: '셀러 판매정지',
  SELLER_SUSPENSION_RELEASED: '셀러 판매정지 해제',
  SELLER_MEMO_UPDATED: '셀러 내부 메모 수정',
  ADMIN_PROMOTED: '관리자 권한 부여',
  ADMIN_DEMOTED: '관리자 권한 회수',
  PRODUCT_INSPECTION_APPROVED: '상품 검수 통과',
  PRODUCT_INSPECTION_REJECTED: '상품 검수 반려',
  PRODUCT_SALE_SUSPENDED: '상품 판매중지',
  PRODUCT_SALE_RESUMED: '상품 판매 재개',
  CLAIM_INTERVENED: '클레임 개입',
  MEMBER_SANCTIONED: '회원 이용 제한',
  MEMBER_SANCTION_RELEASED: '회원 이용 제한 해제',
  MEMBER_PROFILE_RESET: '회원 프로필 초기화',
  INQUIRY_ANSWERED: '문의 답변',
  REVIEW_BLINDED: '리뷰 블라인드',
  REVIEW_UNBLINDED: '리뷰 블라인드 해제',
  REVIEW_DELETED: '리뷰 삭제',
  ORDER_DISPATCH_NUDGED: '발송 독촉',
  NOTICE_UPDATED: '공지 수정',
  NOTICE_PUBLISHED: '공지 게시',
  NOTICE_UNPUBLISHED: '공지 게시 중단',
  REPORT_DECIDED: '신고 처리',
} satisfies Record<AuditAction, string>

/** 대상 종류 한글 라벨 11값. 쓰임은 위 액션 표와 같다(열은 서버 라벨, 옵션은 이 표). */
export const AUDIT_TARGET_TYPE_LABELS = {
  SELLER_APPLICATION: '입점 신청',
  SELLER: '셀러',
  ADMIN_USER: '관리자',
  MEMBER: '회원',
  PRODUCT: '상품',
  CLAIM: '클레임',
  INQUIRY: '문의',
  REVIEW: '리뷰',
  ORDER: '주문',
  NOTICE: '공지',
  REPORT: '신고',
} satisfies Record<AuditTargetType, string>

export const AUDIT_RESULT_LABELS = {
  SUCCESS: '성공',
  FAILURE: '실패',
} satisfies Record<AuditResult, string>

/**
 * `targetId`의 **종류를 글자로 앞세우는** 접두.
 *
 * 서버는 `targetId` 문자열 하나만 주고 뜻은 종류마다 다르다 — 셀러·입점 신청·관리자·회원·문의·리뷰는
 * 내부 int64 번호, PRODUCT·CLAIM은 ULID, ORDER는 주문번호, NOTICE는 공지 식별자, REPORT는
 * `PRODUCT/12` 꼴의 종류/번호다. 번호만 그대로 찍으면 회원 내부
 * PK `19023`과 클레임 ULID가 **같은 종류의 값처럼** 읽혀, 운영자가 회원 번호를 어딘가에 붙여
 * 넣으려 한다. 'APP-' 같은 접두를 발명하는 대신(서버가 만들지 않는 값이다) 무엇인지만 말한다.
 */
const TARGET_ID_KIND_LABELS = {
  SELLER_APPLICATION: '내부 번호',
  SELLER: '내부 번호',
  ADMIN_USER: '내부 번호',
  MEMBER: '내부 번호',
  PRODUCT: '공개 식별자',
  CLAIM: '공개 식별자',
  INQUIRY: '내부 번호',
  REVIEW: '내부 번호',
  ORDER: '주문번호',
  NOTICE: '공지 식별자',
  REPORT: '신고 종류/번호',
} satisfies Record<AuditTargetType, string>

const ACTOR_ROLE_LABELS = {
  GENERAL: '일반 회원',
  ADMIN: '관리자',
} satisfies Record<AdminAuditActorRole, string>

/** 필터 옵션 순서 — 표의 키 순서가 그대로 옵션 순서다. */
export const AUDIT_TARGET_TYPES = Object.keys(AUDIT_TARGET_TYPE_LABELS) as AuditTargetType[]
export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]
export const AUDIT_RESULTS = Object.keys(AUDIT_RESULT_LABELS) as AuditResult[]

const lookup = (table: Record<string, string>, wire: string): string | undefined => table[wire]

/**
 * 화면에 그리는 한 낱말.
 *
 * 서버 라벨 → FE 표 → 원문 순으로 고른다. 셋 다 비는 경우는 없고, **서버 라벨도 없고 FE 표에도
 * 없는 코드**만 `unknownCode`로 표시해 원문을 경고와 함께 그린다(`metaOf` 관례) — 빈 칸으로 두면
 * 운영자는 그 행에 액션이 없는 줄 안다.
 */
export interface AuditTerm {
  label: string
  unknownCode: string | null
}

function termOf(serverLabel: string, wire: string, table: Record<string, string>): AuditTerm {
  const known = lookup(table, wire)
  const trimmed = serverLabel.trim()
  return {
    label: trimmed || known || wire,
    unknownCode: trimmed === '' && known == null ? wire : null,
  }
}

/**
 * 목록의 시각 — `MM-DD HH:mm:ss`.
 *
 * 감사 로그만 **초 단위**다(같은 분 안의 순서가 조사에 필요하다). 다른 feature는 분 단위
 * `slice(11, 16)`을 쓰지만 여기서는 자리를 자르면 안 된다 — Jackson의 LocalDateTime 직렬화는
 * 초·나노가 0이면 초를 생략하므로(`2026-10-26T20:31`) 그 행만 `20:31`로 짧게 나온다. 그래서
 * 시·분·초를 나눠 읽고 없는 초를 `00`으로 채운다. 날짜 라벨은 feature마다 따로 두는 것이 이 레포
 * 관례라 이 포맷터도 여기 안에만 둔다.
 */
export function toDateTimeLabel(isoLocal: string): string {
  const [date = '', time = ''] = isoLocal.split('T')
  const [hour = '00', minute = '00', second = '00'] = time.split(':')
  const pad = (value: string) => value.slice(0, 2).padStart(2, '0')
  return `${date.slice(5, 10)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}

export interface AdminAuditRow {
  id: string
  /** 이미 포맷된 표시 문자열이 아니라 서버 원본(오프셋 없는 LocalDateTime)이다. */
  actedAt: string
  /** 탈퇴·삭제된 계정은 null이다. */
  actorNickname: string | null
  actorPublicId: string
  /** `GENERAL|ADMIN` 둘뿐이다 — 서버에 직무 구분이 없다. */
  actorRoleLabel: string
  action: AuditTerm
  targetType: AuditTerm
  /** 삭제된 대상은 null이다 — 그때는 종류+식별자로 읽게 한다. */
  targetLabel: string | null
  /** 종류를 글자로 앞세운 식별자. 눌러서 가는 곳이 없으므로 링크로 만들지 않는다. */
  targetIdText: string
  result: AuditResult
  /** 실패 행이 왜 실패했는지가 남는 유일한 자리다(`reason`은 운영자 메모라 비어 있을 수 있다). */
  httpStatus: number
  reason: string | null
  clientIp: string | null
  requestId: string
}

export function toAuditRow(wire: AdminAuditLogEntry): AdminAuditRow {
  const kind = lookup(TARGET_ID_KIND_LABELS, wire.targetType)
  return {
    id: wire.id,
    actedAt: wire.actedAt,
    actorNickname: wire.actorNickname,
    actorPublicId: wire.actorPublicId,
    actorRoleLabel: lookup(ACTOR_ROLE_LABELS, wire.actorRole) ?? wire.actorRole,
    action: termOf(wire.actionLabel, wire.action, AUDIT_ACTION_LABELS),
    targetType: termOf(wire.targetTypeLabel, wire.targetType, AUDIT_TARGET_TYPE_LABELS),
    targetLabel: wire.targetLabel,
    targetIdText: kind == null ? wire.targetId : `${kind} ${wire.targetId}`,
    result: wire.result,
    httpStatus: wire.httpStatus,
    reason: wire.reason,
    clientIp: wire.clientIp,
    requestId: wire.requestId,
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

/**
 * 조회 실패 문구.
 *
 * **errorCode를 발명하지 않는다** — 감사 로그 전용 errorCode는 스펙에 하나도 없다. 문구는 HTTP
 * status로만 가르고, 403에만 admin 모듈 전역 계약인 20011을 함께 본다. 403을 '로그가 없다'로
 * 보여주면 그 자체가 운영 사고라 이 자리가 이 화면의 핵심 분기다.
 */
export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 403 && errorCode === FORBIDDEN_BY_ROLE)
    return '어드민 권한이 없어 액션 로그를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 403) return '액션 로그를 볼 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 필터를 다시 선택해 주세요.'
  return '액션 로그를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

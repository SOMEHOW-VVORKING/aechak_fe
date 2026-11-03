import type {
  AdminNoticeDetailData,
  AdminNoticeSummary,
  NoticeAudience,
  NoticeCategory,
  NoticeStatus,
} from '@aechak/api'

// 와이어 enum·필드는 이 파일 안에 가둔다(AGENTS 6-2). 화면은 아래 view 타입 어휘만 쓴다.
//
// 세 축(status 3 · category 5 · audience 3)은 FE 소문자 어휘로 다시 이름 짓지 않는다 — 그 값들이
// 그대로 서버 필터와 PUT 본문으로 되돌아가야 하고, 변환표를 한 번 더 베끼면 라벨 표와 어긋날 자리만
// 늘어난다. 타입만 feature 이름으로 다시 내보내 화면이 `@aechak/api`를 직접 보지 않게 한다.
export type NoticeStatusValue = NoticeStatus
export type NoticeCategoryValue = NoticeCategory
export type NoticeAudienceValue = NoticeAudience

/**
 * 게시 상태 라벨 3값.
 *
 * **`SCHEDULED`('게시 예약')와 종료 상태가 없다.** 시각이 되면 상태를 옮겨 줄 배치가 서버에 없어
 * 일부러 두지 않은 열거라, 옵션으로 두면 영구히 0건인 필터가 된다(AGENTS 2절이 금지한 장식 UI).
 *
 * `satisfies`로 적어 두면 서버가 값을 늘렸을 때 `pnpm openapi:generate` 결과가 그 자리에서 타입
 * 오류를 낸다 — 표에 빠진 값이 오면 `StatusMetaPill`의 구조분해가 TypeError로 표를 통째로 날린다.
 */
export const NOTICE_STATUS_LABELS = {
  DRAFT: '초안',
  PUBLISHED: '게시 중',
  UNPUBLISHED: '게시 중단',
} satisfies Record<NoticeStatusValue, string>

/** 분류 라벨 5값. SETTLEMENT(정산)는 셀러 정산 안내가 바로 그것이라 실제로 온다. */
export const NOTICE_CATEGORY_LABELS = {
  SERVICE: '서비스',
  MAINTENANCE: '점검',
  POLICY: '정책',
  EVENT: '이벤트',
  SETTLEMENT: '정산',
} satisfies Record<NoticeCategoryValue, string>

/**
 * 노출 대상 라벨 3값.
 *
 * `ALL`은 '전체 회원 대상 공지'라는 **실제 값**이고 필터 미선택이 아니다 — 다른 어드민 화면의
 * `'all'` 센티넬 관례를 이 축에 그대로 쓰면 두 뜻이 겹쳐, "전체 대상"을 골라도 미선택으로 읽혀
 * 필터가 조용히 무동작이 된다(2026-10-27 실측).
 */
export const NOTICE_AUDIENCE_LABELS = {
  ALL: '전체',
  BUYER: '구매자',
  SELLER: '셀러',
} satisfies Record<NoticeAudienceValue, string>

/** 필터·편집 옵션 순서 — 표의 키 순서가 그대로 옵션 순서다. */
export const NOTICE_STATUSES = Object.keys(NOTICE_STATUS_LABELS) as NoticeStatusValue[]
export const NOTICE_CATEGORIES = Object.keys(NOTICE_CATEGORY_LABELS) as NoticeCategoryValue[]
export const NOTICE_AUDIENCES = Object.keys(NOTICE_AUDIENCE_LABELS) as NoticeAudienceValue[]

/**
 * 목록·상세의 시각 — `MM-DD HH:mm`.
 *
 * 서버가 주는 값은 오프셋 없는 LocalDateTime(KST 벽시계)이라 `new Date()`로 파싱하면 브라우저
 * 타임존만큼 밀린다 — 자리를 잘라 읽는다. 날짜 라벨은 feature마다 따로 두는 것이 이 레포 관례다.
 */
export function toDateTimeLabel(isoLocal: string): string {
  return `${isoLocal.slice(5, 10)} ${isoLocal.slice(11, 16)}`
}

export interface AdminNoticeRow {
  noticeId: string
  title: string
  category: NoticeCategoryValue
  audience: NoticeAudienceValue
  status: NoticeStatusValue
  pinned: boolean
  /** 한 번도 게시되지 않은 초안은 null이다. 내린 공지에는 남는다(서버가 지우지 않는다). */
  publishedAt: string | null
  /** 서버 정렬 기준(createdAt 내림차순 고정). 초안 행이 시각을 말할 수 있는 유일한 값이다. */
  createdAt: string
}

export const toNoticeRow = (wire: AdminNoticeSummary): AdminNoticeRow => ({
  noticeId: wire.noticeId,
  title: wire.title,
  category: wire.category,
  audience: wire.audience,
  status: wire.status,
  pinned: wire.pinned,
  publishedAt: wire.publishedAt,
  createdAt: wire.createdAt,
})

/** 상세에만 있는 두 필드(`content`·`internalMemo`)가 편집 폼의 내용이다 — 목록에는 없다. */
export interface AdminNoticeDetailView extends AdminNoticeRow {
  content: string
  internalMemo: string | null
  updatedAt: string
}

export const toNoticeDetailView = (wire: AdminNoticeDetailData): AdminNoticeDetailView => ({
  noticeId: wire.noticeId,
  title: wire.title,
  category: wire.category,
  audience: wire.audience,
  status: wire.status,
  pinned: wire.pinned,
  publishedAt: wire.publishedAt,
  createdAt: wire.createdAt,
  content: wire.content,
  internalMemo: wire.internalMemo,
  updatedAt: wire.updatedAt,
})

/**
 * 상태별로 서버가 받아 주는 전이.
 *
 * 게시 중 공지에 또 게시를 보내면 409(150006)이고, 게시 중이 아닌 공지를 내리면 409(150007)다 —
 * 멱등이 아니라 거절이라 화면이 버튼을 남기면 운영자가 못 쓰는 버튼을 누른다.
 */
export const allowedTransition = (status: NoticeStatusValue): 'publish' | 'unpublish' =>
  status === 'PUBLISHED' ? 'unpublish' : 'publish'

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
const NOTICE_NOT_FOUND = 150000
const ALREADY_PUBLISHED = 150006
const NOT_PUBLISHED = 150007

/** 네 경로가 같은 계약을 쓰는 인증·권한 분기(20004·20011). 없으면 null이다. */
function authMessage(status?: number): string | null {
  if (status === 403) return '어드민 권한이 없어요. 관리자 권한을 확인해 주세요.'
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.'
  return null
}

export function listErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 403 && errorCode === FORBIDDEN_BY_ROLE)
    return '어드민 권한이 없어 공지를 볼 수 없어요. 관리자 권한을 확인해 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  // 90002(깨진 커서)는 운영자가 고칠 수 없는 내부 상태다 — 다시 불러오면 커서 없이 나간다.
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 필터를 다시 선택해 주세요.'
  return '공지 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

export function detailErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 404 || errorCode === NOTICE_NOT_FOUND)
    return '이미 삭제된 공지예요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  return '공지 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 저장(생성·수정) 실패 문구.
 *
 * 길이·필수 거절(400)은 운영자가 그 자리에서 고칠 수 있는 것이라 무엇을 고쳐야 하는지 말한다.
 * 화면이 `maxLength`로 막지만 서버 한도와 어긋날 수 있어 이 분기를 남긴다.
 */
export function saveErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 404 || errorCode === NOTICE_NOT_FOUND)
    return '이미 삭제된 공지예요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  if (status === 400)
    return '제목·내용·분류를 서버가 받지 못했어요. 제목 200자, 내용 2000자, 메모 300자까지 보낼 수 있어요.'
  return '공지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 게시·내림 실패 문구.
 *
 * **409 둘을 한 문구로 묶지 않는다** — 150006(이미 게시됨)과 150007(게시되지 않아 내릴 수 없음)은
 * 운영자가 할 일이 다르다. 둘 다 "화면이 낡았다"는 신호라 재시도를 권하지 않고 목록을 다시 받았다고
 * 알린다(눌러도 같은 409다). 이 화면에서 전이는 늘 저장 뒤에 오므로 바깥으로 내보내지 않고
 * 아래 `savedButNotTransitionedMessage`가 감싸 쓴다.
 */
function transitionErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (errorCode === ALREADY_PUBLISHED) return '이미 게시된 공지예요. 목록을 다시 불러왔어요.'
  if (errorCode === NOT_PUBLISHED) return '게시 중이 아니어서 내릴 수 없어요. 목록을 다시 불러왔어요.'
  if (status === 404 || errorCode === NOTICE_NOT_FOUND)
    return '이미 삭제된 공지예요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  return '공지 상태를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 저장은 들어갔고 상태 변경이 실패한 구간의 문구.
 *
 * PUT과 publish·unpublish는 다른 경로라 "고치고 게시하기"는 두 요청이다. 그 사이에서 실패했을 때
 * 토스트가 하나뿐이면 운영자는 저장도 안 됐다고 읽고 같은 내용을 다시 쓴다 — 어느 쪽이 들어갔는지를
 * 먼저 말한다.
 */
export const savedButNotTransitionedMessage = (
  error: unknown,
  action: 'publish' | 'unpublish',
): string =>
  `내용은 저장됐고 ${action === 'publish' ? '게시는' : '내림은'} 안 됐어요. ${transitionErrorMessage(error)}`

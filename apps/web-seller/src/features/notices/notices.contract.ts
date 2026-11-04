// 셀러가 읽는 서비스 공지 BE(`boot/seller/.../notice/SellerNoticeController`)와 화면 사이의 순수
// 타입·라벨·규칙. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만
// 붙인다 — 서버 enum은 이 feature 밖으로 새지 않게 여기 가둔다(inquiries·reviews.contract 관례).
//
// 독자용 응답에는 `status`·`audience`가 **오지 않는다**(게시된 것만 내려오고 대상은 경로가 고정한다).
// 어드민 map의 `NOTICE_STATUS_LABELS`·`NOTICE_AUDIENCE_LABELS`를 베껴 오면 영구히 안 쓰이는 표가 된다.
import type { StatusPillVariant } from '@aechak/design-system/web'
import type { NoticeCategory } from '@aechak/api'

export type {
  /** 목록 한 행. `content`가 없다 — 전문은 상세 경로로만 온다. */
  NoticeSummary,
  NoticeListData,
  NoticeDetailData,
  NoticeCategory,
} from '@aechak/api'

// ─── 분류 라벨 ───────────────────────────────────────────────────────────────

/**
 * 분류 라벨 5값.
 *
 * `satisfies`로 적어 두면 서버가 값을 늘렸을 때 `pnpm openapi:generate` 결과가 그 자리에서 타입
 * 오류를 낸다. **SETTLEMENT(정산)를 빼지 말 것** — 셀러 정산 안내가 바로 그것이라 실제로 온다.
 *
 * 앱 경계를 넘어 import할 수 없어 어드민(`web-admin/features/notices/notices.map.ts`)과 같은 다섯
 * 값을 여기 다시 적는다(packages/domain에는 공지 관련이 아무것도 없다).
 */
export const NOTICE_CATEGORY_LABEL = {
  SERVICE: '서비스',
  MAINTENANCE: '점검',
  POLICY: '정책',
  EVENT: '이벤트',
  SETTLEMENT: '정산',
} satisfies Record<NoticeCategory, string>

const NOTICE_CATEGORY_VARIANT = {
  SERVICE: 'neutral',
  MAINTENANCE: 'warning',
  POLICY: 'info',
  EVENT: 'accent',
  SETTLEMENT: 'brand',
} satisfies Record<NoticeCategory, StatusPillVariant>

/** 필터 옵션 순서 — 라벨 표의 키 순서가 그대로 옵션 순서다. */
export const NOTICE_CATEGORIES = Object.keys(NOTICE_CATEGORY_LABEL) as NoticeCategory[]

export interface NoticeCategoryMeta {
  label: string
  variant: StatusPillVariant
}

/**
 * 분류 pill에 그릴 라벨·색. 표에 없는 값은 **원문을 그대로 경고로** 그린다(`metaOf` 관례).
 *
 * 호출부가 `{ label, variant }`를 구조분해하므로 표에서 값 하나가 빠진 채 그 분류 공지가 오면
 * undefined 구조분해가 TypeError가 되어 **표가 통째로 사라진다** — 정산 공지 한 건이 화면을
 * 날리는 모양이다. 분기를 여기 두어 그 자리를 막는다.
 */
export function noticeCategoryMeta(category: NoticeCategory): NoticeCategoryMeta {
  const label = (NOTICE_CATEGORY_LABEL as Record<string, string | undefined>)[category]
  const variant = (NOTICE_CATEGORY_VARIANT as Record<string, StatusPillVariant | undefined>)[
    category
  ]
  if (label == null || variant == null) return { label: category, variant: 'warning' }
  return { label, variant }
}

// ─── 날짜 표시 ───────────────────────────────────────────────────────────────

/**
 * `2026-10-26T10:00:00` → `2026-10-26 10:00`.
 *
 * 서버가 주는 값은 **오프셋 없는 LocalDateTime(KST 벽시계)**이라 `new Date()`로 파싱하면 브라우저
 * 타임존만큼 밀린다 — 자리를 잘라 읽는다. 날짜 라벨은 feature마다 따로 두는 것이 이 레포 관례다.
 *
 * 독자용 `publishedAt`은 **비지 않는다**(조회 조건이 게시 시각 있는 행만 고른다) — 어드민 행과
 * 달리 null 분기를 두지 않는다.
 */
export function formatNoticeDateTime(isoLocal: string): string {
  return `${isoLocal.slice(0, 10)} ${isoLocal.slice(11, 16)}`
}

// ─── 에러 문구 ───────────────────────────────────────────────────────────────
// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).

interface WireError {
  status?: number
  errorCode?: number
}

function toWireError(error: unknown): WireError {
  const response = (error as { response?: { status?: number; data?: { errorCode?: number } } })
    ?.response
  return { status: response?.status, errorCode: response?.data?.errorCode }
}

/** SellerErrorCode.NOT_SELLER — 자격 판정이 공지 조회보다 앞서므로 공지가 있어도 403이다. */
const NOT_SELLER = 10004
/** NoticeErrorCode.NOTICE_NOT_FOUND. */
const NOTICE_NOT_FOUND = 150000

function authMessage(status?: number): string | null {
  if (status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.'
  return null
}

export function noticeListErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 403 && errorCode === NOT_SELLER)
    return '셀러로 등록되지 않은 계정이라 공지를 볼 수 없어요. 스토어 설정에서 입점 상태를 확인해 주세요.'
  if (status === 403) return '공지를 볼 권한이 없어요. 스토어 설정에서 입점 상태를 확인해 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  // 90002(깨진 커서)는 셀러가 고칠 수 없는 내부 상태다 — 분류를 다시 고르면 커서 없이 나간다.
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 분류를 다시 골라 주세요.'
  return '공지 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 상세 실패 문구.
 *
 * 404(150000)는 **초안·내린 공지·다른 대상 공지를 모두 같은 코드로** 끊는다 — 코드가 갈리지 않으니
 * 화면도 세 경우를 구분해 말할 수 없다. "사라졌다"고 단정하지 않고 지금 볼 수 없다고만 적는다.
 */
export function noticeDetailErrorMessage(error: unknown): string {
  const { status, errorCode } = toWireError(error)
  if (status === 404 || errorCode === NOTICE_NOT_FOUND)
    return '지금은 볼 수 없는 공지예요. 운영자가 내렸을 수 있어요. 목록을 다시 불러와 주세요.'
  const shared = authMessage(status)
  if (shared != null) return shared
  return '공지 내용을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
}

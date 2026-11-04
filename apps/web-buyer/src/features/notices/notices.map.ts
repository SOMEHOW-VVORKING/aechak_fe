import type { StatusPillVariant } from '@aechak/design-system/web'
import { errorResponse, type NoticeCategory } from '@aechak/api'

// 구매자가 읽는 서비스 공지 BE(`boot/api/.../notice/NoticeController`)와 화면 사이의 순수
// 타입·라벨·날짜 라벨. 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 서버 enum은 이
// feature 안에 가둔다(product.map·productInquiry.labels 관례).
//
// 독자용 응답에는 `status`·`audience`가 **오지 않는다** — 게시된 것만 내려오고 대상은 경로가
// 고정한다. 어드민 map의 `NOTICE_STATUS_LABELS`·`NOTICE_AUDIENCE_LABELS`를 베껴 오면 영구히
// 안 쓰이는 표가 된다.

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
 * 오류를 낸다. **SETTLEMENT(정산)를 빼지 말 것** — 대상이 ALL인 정산 공지가 구매자에게도 온다.
 *
 * 앱 경계를 넘어 import할 수 없어 셀러센터·어드민과 같은 다섯 값을 여기 다시 적는다
 * (packages/domain에는 공지 관련이 아무것도 없다). 문구를 바꿀 때 세 앱을 함께 본다.
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

/** 필터 칩 순서 — 라벨 표의 키 순서가 그대로 칩 순서다. */
export const NOTICE_CATEGORIES = Object.keys(NOTICE_CATEGORY_LABEL) as NoticeCategory[]

export interface NoticeCategoryMeta {
  label: string
  variant: StatusPillVariant
}

/**
 * 분류 pill에 그릴 라벨·색. 표에 없는 값은 **원문을 그대로 경고로** 그린다(`metaOf` 관례).
 *
 * 호출부가 `{ label, variant }`를 구조분해하므로 표에서 값 하나가 빠진 채 그 분류 공지가 오면
 * undefined 구조분해가 TypeError가 되어 **목록이 통째로 사라진다** — 정산 공지 한 건이 화면을
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
 * `2026-10-26T10:00:00` → `2026.10.26 10:00`.
 *
 * 서버가 주는 값은 **오프셋 없는 LocalDateTime(KST 벽시계)**이라 `new Date()`로 파싱하면 브라우저
 * 타임존만큼 밀린다 — 자리를 잘라 읽는다. 날짜 라벨은 feature마다 따로 두는 것이 이 레포
 * 관례라 셀러·어드민과 공용화하지 않는다(구매자는 `.` 구분자를 쓴다 — productInquiry.labels).
 *
 * 독자용 `publishedAt`은 **비지 않는다**(조회 조건이 게시 시각 있는 행만 고른다) — 어드민 행과
 * 달리 null 분기를 두지 않는다.
 */
export function formatNoticeDateTime(isoLocal: string): string {
  return `${isoLocal.slice(0, 10).replace(/-/g, '.')} ${isoLocal.slice(11, 16)}`
}

// ─── 에러 문구 ───────────────────────────────────────────────────────────────
// BE errorCode → FE 문구. 서버 message는 -습니다 격식체라 띄우지 않는다(카피 규칙).
//
// **401(20004)과 온보딩 미완(403/20006)은 여기 오지 않는다** — 인터셉터가 refresh를 거쳐
// 전역 콜백(`setOnAuthExpired`·`setOnOnboardingRequired`)으로 화면을 옮긴다(main.tsx).
// 비회원은 애초에 요청을 보내지 않는다(라우트가 `AuthRequiredScreen`을 그린다). 셀러 자격
// 403(10004)은 셀러 경로에만 있어 이쪽 분기에 없다.

/** NoticeErrorCode.NOTICE_NOT_FOUND. */
const NOTICE_NOT_FOUND = 150000

export function noticeListErrorMessage(error: unknown): string {
  const status = errorResponse(error)?.status
  // 90002(깨진 커서)는 구매자가 고칠 수 없는 내부 상태다 — 분류를 다시 고르면 커서 없이 나간다.
  if (status === 400) return '조회 조건을 서버가 받지 못했어요. 분류를 다시 골라 주세요.'
  return '잠시 후 다시 시도해주세요.'
}

/**
 * 상세 실패 문구.
 *
 * 404(150000)는 **초안·내린 공지·구매자 대상이 아닌 공지를 모두 같은 코드로** 끊는다 — 코드가
 * 갈리지 않으니 화면도 세 경우를 구분해 말할 수 없다. "사라졌다"고 단정하지 않고 지금 볼 수
 * 없다고만 적는다.
 */
export function noticeDetailErrorMessage(error: unknown): string {
  const failure = errorResponse(error)
  if (failure?.status === 404 || failure?.data?.errorCode === NOTICE_NOT_FOUND)
    return '운영자가 내렸을 수 있어요. 목록을 다시 불러와 주세요.'
  return '잠시 후 다시 시도해주세요.'
}

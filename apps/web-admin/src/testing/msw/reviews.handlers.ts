import { http, HttpResponse } from 'msw'
import { adminBase, decodeCursorPayload, encodeCursorPayload, errorBody } from './base'

// `/admin/reviews` 다섯(목록·상세·블라인드·해제·삭제)의 서버 흉내. BE
// `boot/admin/.../review/AdminReviewController` + `domain/.../review/review/Review.kt`의 계약을
// 그대로 옮긴다 — 특히 **되돌릴 수 없는 삭제**의 거절 분기(이미 삭제됨)와 블라인드·해제의 409
// 둘은 화면이 고를 수 있게 둔 결정과 어긋나면 안 되는 자리다.

export const ADMIN_REVIEWS_URL = `${adminBase}/admin/reviews`
export const ADMIN_REVIEW_DETAIL_URL = `${ADMIN_REVIEWS_URL}/:reviewId`
export const ADMIN_REVIEW_BLIND_URL = `${ADMIN_REVIEW_DETAIL_URL}/blind`
export const ADMIN_REVIEW_UNBLIND_URL = `${ADMIN_REVIEW_DETAIL_URL}/unblind`

export type WireReviewStatus = 'PUBLIC' | 'MASKED' | 'BLOCKED' | 'HIDDEN' | 'DELETED'
export type WireBlindActor = 'AI' | 'ADMIN'
export type WireBlindReason =
  | 'PROFANITY'
  | 'ABUSE'
  | 'EXTERNAL_TRADE'
  | 'AD_SPAM'
  | 'PRIVACY'
  | 'IRRELEVANT'
  | 'OTHER'
export type WireReportReason = 'FRAUD' | 'ABUSE' | 'SPAM' | 'INAPPROPRIATE' | 'OTHER'

const BLIND_REASONS: WireBlindReason[] = [
  'PROFANITY',
  'ABUSE',
  'EXTERNAL_TRADE',
  'AD_SPAM',
  'PRIVACY',
  'IRRELEVANT',
  'OTHER',
]

const REASON_TEXT_MAX = 500
const BLINDED_CONTENT = '블라인드 처리된 리뷰입니다.'
const ACTING_ADMIN_ID = 1

export interface AdminReviewWire {
  reviewId: number
  productPublicId: string
  productName: string
  sellerName: string
  authorUserId: number
  authorNickname: string
  authorWithdrawn: boolean
  rating: number
  content: string
  /** 마스킹 대체 본문. 있으면 해제가 PUBLIC이 아니라 MASKED로 되돌린다. */
  displayContent: string | null
  optionName: string
  reviewStatus: WireReviewStatus
  blindActor: WireBlindActor | null
  blindReasonCode: WireBlindReason | null
  blindReasonText: string | null
  blindedAt: string | null
  blindedByAdminId: number | null
  deletedByAdminId: number | null
  deletedAt: string | null
  createdAt: string
  images: { imageUrl: string; sortOrder: number }[]
  reports: {
    reportId: number
    reporterId: number
    reasonCode: WireReportReason
    reasonText: string | null
    status: 'PENDING' | 'RESOLVED' | 'REJECTED'
    reportedAt: string
  }[]
}

let reviews: AdminReviewWire[] = []

export function makeAdminReviewWire(overrides: Partial<AdminReviewWire> = {}): AdminReviewWire {
  return {
    reviewId: 51204,
    productPublicId: '01HZXP0000000000000000001',
    productName: '저알러지 건식사료 5kg',
    sellerName: '보리펫샵',
    authorUserId: 1001,
    authorNickname: '초코집사',
    authorWithdrawn: false,
    rating: 1,
    content: '사료 바꾸고 애가 아팠어요.',
    displayContent: null,
    optionName: '5kg',
    reviewStatus: 'PUBLIC',
    blindActor: null,
    blindReasonCode: null,
    blindReasonText: null,
    blindedAt: null,
    blindedByAdminId: null,
    deletedByAdminId: null,
    deletedAt: null,
    createdAt: '2026-10-25T21:32:00',
    images: [],
    reports: [],
    ...overrides,
  }
}

const clone = (row: AdminReviewWire): AdminReviewWire => ({
  ...row,
  images: row.images.map(image => ({ ...image })),
  reports: row.reports.map(report => ({ ...report })),
})

export function seedAdminReviews(rows: AdminReviewWire[] = []): void {
  reviews = rows.map(clone)
}

/** 핸들러가 반영한 현재 리뷰 상태 — 테스트가 블라인드·해제·삭제의 부작용을 읽는다. */
export function currentAdminReview(reviewId: number): AdminReviewWire | null {
  const found = reviews.find(row => row.reviewId === reviewId)
  return found ? clone(found) : null
}

/** BE Review.visibleContent — MASKED만 대체 본문을 보여 준다. */
const visibleContentOf = (row: AdminReviewWire): string =>
  row.reviewStatus === 'MASKED' ? (row.displayContent ?? BLINDED_CONTENT) : row.content

function summaryOf(row: AdminReviewWire) {
  return {
    reviewId: row.reviewId,
    productPublicId: row.productPublicId,
    productName: row.productName,
    sellerName: row.sellerName,
    authorUserId: row.authorUserId,
    authorNickname: row.authorNickname,
    authorWithdrawn: row.authorWithdrawn,
    rating: row.rating,
    content: row.content,
    visibleContent: visibleContentOf(row),
    photoCount: row.images.length,
    reportCount: row.reports.length,
    reviewStatus: row.reviewStatus,
    blindActor: row.blindActor,
    blindReasonCode: row.blindReasonCode,
    blindReasonText: row.blindReasonText,
    blindedAt: row.blindedAt,
    createdAt: row.createdAt,
  }
}

/** 상세 응답에는 photoCount·reportCount가 **없다** — 배열 길이가 그 수다(목록만 집계를 싣는다). */
function detailOf(row: AdminReviewWire) {
  return {
    reviewId: row.reviewId,
    productPublicId: row.productPublicId,
    productName: row.productName,
    sellerName: row.sellerName,
    authorUserId: row.authorUserId,
    authorNickname: row.authorNickname,
    authorWithdrawn: row.authorWithdrawn,
    rating: row.rating,
    content: row.content,
    visibleContent: visibleContentOf(row),
    optionName: row.optionName,
    reviewStatus: row.reviewStatus,
    blindActor: row.blindActor,
    blindReasonCode: row.blindReasonCode,
    blindReasonText: row.blindReasonText,
    blindedAt: row.blindedAt,
    blindedByAdminId: row.blindedByAdminId,
    deletedByAdminId: row.deletedByAdminId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    images: row.images.map(image => ({ ...image })),
    reports: [...row.reports].sort((a, b) => b.reportId - a.reportId),
  }
}

/** BE AdminReviewCursorCodec가 쓰는 구분자(unit separator) — 검색어에 섞일 수 없는 글자여야 한다. */
const FINGERPRINT_SEPARATOR = '\u001f'

/**
 * 커서에 **필터 지문**을 싣는다 — 조건이 바뀐 채 옛 커서를 보내면 400(90002)이다.
 * 지문을 싣지 않으면 "별점 1점"에서 받은 커서를 "전체"에 끼워 넣어 앞쪽 페이지가 조용히 건너뛰어진다.
 *
 * **지문은 요약값이고 필터 원문이 아니다.** 서버가 그렇게 한다 — `AdminReviewCursorCodec`는
 * 정규화 문자열을 SHA-256으로 접어 앞 16자만 싣고 "커서에 필터 원문(검색어)이 실리지 않는다"고
 * 못박는다. 원문을 싣던 이전 모양은 두 가지를 틀리게 했다. ① 검색어가 그대로 커서에 들어가
 * 서버가 숨기는 값을 테스트 더블이 노출했다. ② 한글 검색어가 들어가면 base64 인코딩이
 * 터져(`btoa`는 latin1만 받는다) **검색 + 두 쪽 이상**이라는 조합을 아예 테스트할 수 없었다.
 * 암호 강도는 필요 없으므로(지문이 맞는지만 본다) 동기로 접을 수 있는 FNV-1a를 쓴다.
 */
const fingerprintOf = (params: URLSearchParams): string =>
  foldToHex(
    [
      params.get('productId') ?? '',
      params.get('rating') ?? '',
      params.get('status') ?? '',
      params.get('reported') === 'true' ? 'true' : 'false',
      params.get('keyword')?.trim() ?? '',
    ].join(FINGERPRINT_SEPARATOR),
  )

/** UTF-8 바이트 위의 FNV-1a 32비트 — 아스키 16진수 8자로 접는다. */
function foldToHex(canonical: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const CURSOR_TAG = 'arv'

const encodeCursor = (fingerprint: string, lastReviewId: number) =>
  encodeCursorPayload(`${CURSOR_TAG}|${fingerprint}|${lastReviewId}`)

function decodeCursor(raw: string, fingerprint: string): number | null {
  const decoded = decodeCursorPayload(raw)
  if (decoded == null) return null
  const parts = decoded.split('|')
  if (parts.length !== 3 || parts[0] !== CURSOR_TAG || parts[1] !== fingerprint) return null
  const lastReviewId = Number(parts[2])
  return Number.isFinite(lastReviewId) && lastReviewId > 0 ? lastReviewId : null
}

function findForWrite(rawId: string | readonly string[] | undefined) {
  const reviewId = Number(rawId)
  const row = reviews.find(item => item.reviewId === reviewId)
  if (!row) {
    return HttpResponse.json(errorBody(110000, '리뷰를 찾을 수 없습니다.'), { status: 404 })
  }
  return row
}

const isRejection = (result: AdminReviewWire | Response): result is Response =>
  result instanceof Response

/** 사유 본문 검증 — 누락·미지 코드는 @Valid의 90001, 길이는 애그리거트의 110022다. */
function validateReasonBody(body: { reasonCode?: string; reasonText?: string } | null) {
  if (body?.reasonCode == null || !BLIND_REASONS.includes(body.reasonCode as WireBlindReason)) {
    return HttpResponse.json(errorBody(90001, '잘못된 요청입니다.'), { status: 400 })
  }
  if ((body.reasonText ?? '').length > REASON_TEXT_MAX) {
    return HttpResponse.json(errorBody(110022, '처리 사유 메모는 500자 이하여야 합니다.'), {
      status: 400,
    })
  }
  return null
}

export const reviewHandlers = [
  http.get(ADMIN_REVIEWS_URL, ({ request }) => {
    const params = new URL(request.url).searchParams
    const ratingParam = params.get('rating')
    const rating = ratingParam == null ? null : Number(ratingParam)
    // rating·size는 @Range라 범위를 벗어나면 **절삭하지 않고 400**이다(문의·클레임과 다르다).
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return HttpResponse.json(errorBody(90001, 'rating은 1~5 사이여야 합니다.'), { status: 400 })
    }
    const sizeParam = params.get('size')
    const size = sizeParam == null ? 20 : Number(sizeParam)
    if (!Number.isInteger(size) || size < 1 || size > 100) {
      return HttpResponse.json(errorBody(90001, 'size는 1~100 사이여야 합니다.'), { status: 400 })
    }
    const status = params.get('status')
    const reportedOnly = params.get('reported') === 'true'
    const keyword = params.get('keyword')?.trim() || null
    const productId = params.get('productId')
    const fingerprint = fingerprintOf(params)
    const cursorParam = params.get('cursor')
    let lastReviewId: number | null = null
    if (cursorParam != null) {
      lastReviewId = decodeCursor(cursorParam, fingerprint)
      // 망가진 커서와 필터가 바뀐 커서는 같은 400/90002다.
      if (lastReviewId == null) {
        return HttpResponse.json(errorBody(90002, '유효하지 않은 커서입니다.'), { status: 400 })
      }
    }

    const matched = reviews
      .filter(row => productId == null || row.productPublicId === productId)
      .filter(row => rating == null || row.rating === rating)
      // 노출 상태로 걸러내지 않는다 — 블라인드·삭제된 리뷰도 목록에 나온다.
      .filter(row => status == null || row.reviewStatus === status)
      .filter(row => !reportedOnly || row.reports.length > 0)
      .filter(
        row => keyword == null || row.content.includes(keyword) || row.productName.includes(keyword),
      )
    const sorted = [...matched].sort((a, b) => b.reviewId - a.reviewId)
    const afterCursor =
      lastReviewId == null ? sorted : sorted.filter(row => row.reviewId < lastReviewId!)
    const page = afterCursor.slice(0, size)
    const hasNext = afterCursor.length > size
    return HttpResponse.json({
      data: {
        items: page.map(summaryOf),
        totalCount: cursorParam == null ? matched.length : null,
        nextCursor: hasNext ? encodeCursor(fingerprint, page[page.length - 1]!.reviewId) : null,
        hasNext,
      },
    })
  }),

  http.get(ADMIN_REVIEW_DETAIL_URL, ({ params }) => {
    const found = findForWrite(params['reviewId'])
    if (isRejection(found)) return found
    return HttpResponse.json({ data: detailOf(found) })
  }),

  http.post(ADMIN_REVIEW_BLIND_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      reasonCode?: string
      reasonText?: string
    } | null
    const invalid = validateReasonBody(body)
    if (invalid) return invalid
    const found = findForWrite(params['reviewId'])
    if (isRejection(found)) return found
    // 삭제된 리뷰는 전이 자체가 거절된다(400/110002) — 이미 블라인드는 409/110020이다.
    if (found.reviewStatus === 'DELETED') {
      return HttpResponse.json(errorBody(110002, '허용되지 않는 리뷰 상태 전이입니다.'), {
        status: 400,
      })
    }
    if (found.reviewStatus === 'BLOCKED') {
      return HttpResponse.json(errorBody(110020, '이미 블라인드된 리뷰입니다.'), { status: 409 })
    }
    found.reviewStatus = 'BLOCKED'
    found.blindActor = 'ADMIN'
    found.blindReasonCode = body!.reasonCode as WireBlindReason
    found.blindReasonText = body!.reasonText?.trim() || null
    found.blindedAt = '2026-10-30T09:00:00'
    found.blindedByAdminId = ACTING_ADMIN_ID
    return new HttpResponse(null, { status: 204 })
  }),

  http.post(ADMIN_REVIEW_UNBLIND_URL, ({ params }) => {
    const found = findForWrite(params['reviewId'])
    if (isRejection(found)) return found
    // 삭제된 리뷰도 "블라인드가 아님"으로 같은 409/110021이다.
    if (found.reviewStatus !== 'BLOCKED') {
      return HttpResponse.json(
        errorBody(110021, '블라인드되지 않은 리뷰는 해제할 수 없습니다.'),
        { status: 409 },
      )
    }
    // 마스킹 대체 본문이 남아 있으면 MASKED로, 없으면 PUBLIC으로 되돌린다.
    found.reviewStatus = found.displayContent != null ? 'MASKED' : 'PUBLIC'
    found.blindActor = null
    found.blindReasonCode = null
    found.blindReasonText = null
    found.blindedAt = null
    found.blindedByAdminId = null
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(ADMIN_REVIEW_DETAIL_URL, async ({ params, request }) => {
    const body = (await request.json().catch(() => null)) as {
      reasonCode?: string
      reasonText?: string
    } | null
    const invalid = validateReasonBody(body)
    if (invalid) return invalid
    const found = findForWrite(params['reviewId'])
    if (isRejection(found)) return found
    if (found.reviewStatus === 'DELETED') {
      return HttpResponse.json(errorBody(110002, '허용되지 않는 리뷰 상태 전이입니다.'), {
        status: 400,
      })
    }
    found.reviewStatus = 'DELETED'
    found.deletedAt = '2026-10-30T09:00:00'
    found.deletedByAdminId = ACTING_ADMIN_ID
    found.blindActor = 'ADMIN'
    found.blindReasonCode = body!.reasonCode as WireBlindReason
    found.blindReasonText = body!.reasonText?.trim() || null
    // 삭제는 블라인드 시각을 비운다 — 삭제 시각은 deletedAt이다(BE deleteByAdmin).
    found.blindedAt = null
    return new HttpResponse(null, { status: 204 })
  }),
]

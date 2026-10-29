// 셀러 리뷰 BE(`boot/seller/.../review/SellerReviewController`)와 화면 사이의 순수 타입·매핑.
// 와이어 타입은 전부 생성물(@aechak/api)에서 가져오고 이 파일은 FE 쪽 이름만 붙인다 — OpenAPI
// 스펙이 바뀌면 재생성만으로 여기서 타입 오류가 드러난다(claims.contract·products.contract 관례).
//
// 날짜는 BE LocalDateTime(오프셋 없는 KST 벽시계, 예: 2026-10-26T10:00:00)이다.
import type { GetSellerReviewsParams, SellerReviewItemResponse } from '@aechak/api'

export type {
  /** 목록 한 행. 내 답글(reply)이 같은 행에 실려 온다. */
  SellerReviewItemResponse as SellerReview,
  SellerReviewListData,
  SellerReviewReplyResponse as SellerReviewReply,
  SellerReviewSummaryResponse as SellerReviewSummary,
} from '@aechak/api'

export type SellerReviewSearchParams = GetSellerReviewsParams

/** 별점은 1~5만 유효하고 서버가 범위 밖을 400으로 거절한다. */
export const RATING_VALUES = [5, 4, 3, 2, 1] as const
export type ReviewRating = (typeof RATING_VALUES)[number]

/** 답글 내용 상한 — BE `ReviewReply.CONTENT_MAX`와 같은 값이다. */
export const REPLY_CONTENT_MAX = 500

/**
 * 화면 필터 상태 그대로의 목록 파라미터. 세 Select가 '전체'를 빈 문자열로 들고 있어도 되고,
 * 와이어 모양으로 좁히는 일은 화면이 아니라 `normalizeReviewSearchParams`가 한 곳에서 책임진다.
 */
export interface SellerReviewSearchInput {
  productId?: string
  /** Select 값이라 문자열로 들어온다. '' = 전체 */
  rating?: string
  /** Select 값. '' = 전체, 'DONE' = 답글 완료, 'NONE' = 답글 없음 */
  reply?: string
}

export const REPLY_FILTER_DONE = 'DONE'
export const REPLY_FILTER_NONE = 'NONE'

/**
 * 빈 값 파라미터를 키째 뺀다.
 *
 * 서버는 값이 빈 파라미터를 "미입력"으로 보지 않는다 — `?rating=`은 Int 바인딩이 터져
 * 400 errorCode 90001이 되고, `?hasReply=`도 Boolean 바인딩에서 같은 400이 된다. 화면 필터는
 * '전체'를 빈 문자열로 들고 있으므로 그대로 넘기면 전 목록 조회가 400으로 깨진다.
 *
 * `hasReply: false`는 값이 있는 것이므로 남긴다 — "답글 없음" 필터가 그 값이다.
 */
export function normalizeReviewSearchParams(
  input: SellerReviewSearchInput,
): SellerReviewSearchParams {
  const params: SellerReviewSearchParams = {}
  const productId = input.productId?.trim()
  if (productId) params.productId = productId

  const rating = Number(input.rating)
  if (
    input.rating !== '' &&
    input.rating != null &&
    Number.isInteger(rating) &&
    rating >= 1 &&
    rating <= 5
  ) {
    params.rating = rating as SellerReviewSearchParams['rating']
  }

  if (input.reply === REPLY_FILTER_DONE) params.hasReply = true
  else if (input.reply === REPLY_FILTER_NONE) params.hasReply = false

  return params
}

/** 평균 별점 표기 — 리뷰가 없으면 서버가 null을 주므로 숫자로 꾸며내지 않는다. */
export function formatAverageRating(average: number | null): string | null {
  return average == null ? null : average.toFixed(1)
}

/**
 * 5★→1★ 순 건수. 서버 `ratingDistribution`은 키가 문자열('1'~'5')이고 없는 별점도 0을 담지만,
 * 키가 빠진 응답에도 0으로 버틴다(막대가 사라지면 분포가 아니라 다른 모양이 된다).
 */
export function ratingBars(
  distribution: Record<string, number> | undefined,
): { rating: ReviewRating; count: number }[] {
  return RATING_VALUES.map(rating => ({ rating, count: distribution?.[String(rating)] ?? 0 }))
}

/** 사진 장수 — 화면은 썸네일을 깔지 않고 장수 배지만 보여준다(목업과 같은 모양). */
export function photoCountOf(review: SellerReviewItemResponse): number {
  return review.images.length
}

/** `useMutation` 결과 중 이 판정에 필요한 부분만. */
export interface ReplyMutationState {
  isPending: boolean
  variables?: { reviewId: number } | undefined
}

/**
 * 지금 처리 중인 답글 요청의 대상 리뷰. 없으면 null이다.
 *
 * react-query의 `variables`는 mutation이 **끝난 뒤에도 남는다**. 그래서 `isPending`을 먼저 보지
 * 않으면 리뷰 A에 답글을 쓴 다음 리뷰 B를 지울 때 A가 처리 중인 행으로 잠긴다(엉뚱한 행의 버튼이
 * 멈춘다).
 */
export function pendingReplyReviewId(mutations: readonly ReplyMutationState[]): number | null {
  return mutations.find(mutation => mutation.isPending)?.variables?.reviewId ?? null
}

/**
 * 답글 요청이 하나라도 날아가 있는지. 그동안은 **모든 행**의 답글 버튼을 잠근다.
 *
 * 처리 중인 행 하나만 잠그면 모자란다 — mutation 하나로 A행 삭제가 날아간 상태에서 B행 삭제를
 * 누르면 같은 observer의 `variables`가 B로 바뀌어 A의 버튼이 다시 열리고, 거기서 또 누르면
 * 이미 지워진 답글에 DELETE가 한 번 더 나간다(404/110200). 한 셀러가 한 번에 답글 하나를
 * 다루는 화면이라 전체를 잠그는 쪽이 맞다.
 */
export function anyReplyPending(mutations: readonly ReplyMutationState[]): boolean {
  return mutations.some(mutation => mutation.isPending)
}

/** 날짜만 쓰는 자리(목록 행·답글 머리). 서버 값이 벽시계라 앞 10자가 곧 날짜다. */
export function toDateLabel(localDateTime: string): string {
  return localDateTime.slice(0, 10)
}

// ─── 오류 문구 ───────────────────────────────────────────────────────────────
// 리뷰 조회는 탈퇴·정지 셀러만 막으므로(휴점·탈퇴신청은 통과) 110011이 목록에서 날 수 있고,
// 답글 쓰기는 탈퇴신청까지 막으므로 목록은 되는데 답글만 110011이 되는 조합도 있다.
const ERROR_MESSAGE: Record<number, string> = {
  20004: '로그인이 필요해요. 다시 로그인해 주세요.',
  20005: '이용이 제한된 계정이에요. 고객센터에 문의해 주세요.',
  20006: '구매자 앱에서 온보딩(약관/닉네임)을 완료한 뒤 이용할 수 있어요.',
  40006: '판매 활동이 가능한 계정만 상품을 볼 수 있어요.',
  110000: '리뷰를 찾을 수 없어요. 목록을 새로고침해 주세요.',
  110011: '판매 활동이 가능한 계정만 리뷰에 답글을 쓸 수 있어요.',
  110200: '답글이 이미 지워졌어요. 목록을 새로고침해 주세요.',
  110201: '이미 답글이 있어요. 목록을 새로고침한 뒤 수정해 주세요.',
  90000: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  90001: '입력한 내용을 다시 확인해 주세요.',
  90002: '목록을 새로고침해 주세요. 조건이 바뀌어 이어보기를 다시 시작해야 해요.',
}

// axios 타입을 안 끌어오려고 duck-typing(claims·products 관례). 본문은 `{ errorCode, message }`.
export function reviewErrorMessage(error: unknown): string {
  const code = (error as { response?: { data?: { errorCode?: number } } }).response?.data?.errorCode
  return (
    (code !== undefined && ERROR_MESSAGE[code]) ||
    '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  )
}

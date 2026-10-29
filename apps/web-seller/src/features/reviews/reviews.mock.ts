/**
 * 리뷰 관리 화면의 예시 데이터 단일 원본 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * **BE가 생기면 갈아끼우는 방법**: seller 호스트에 셀러 시점 목록(`GET /sellers/me/reviews`,
 * 별점 요약 포함)과 답글(`POST /sellers/me/reviews/{reviewPublicId}/reply`)이 열리면
 * `reviews.queries.ts`를 만들어 `SAMPLE_REVIEWS`·`SAMPLE_RATING_SUMMARY` 자리에 그 응답을 넣고,
 * 라우트에서 `SampleDataNotice`를 떼고 `isError` 경로를 더한다(AGENTS.md 규약 7).
 *
 * 실측(2026-10-26): 리뷰 경로는 구매자 호스트에만 있고(`/products/{id}/reviews`·`/users/me/reviews`)
 * 둘 다 구매자 시점이라 "내가 판 상품 전체"로 묶을 수 없다. 셀러 답글 경로도 없다.
 */

export type ReviewRating = 1 | 2 | 3 | 4 | 5

export interface SampleReview {
  reviewPublicId: string
  productName: string
  rating: ReviewRating
  authorMasked: string
  writtenAt: string
  content: string
  /** 포토 리뷰 장수 — 예시에서는 이미지 URL을 지어내지 않고 장수만 둔다. */
  photoCount: number
  reply: { content: string; repliedAt: string } | null
  reported: boolean
}

export interface RatingSummary {
  average: number
  total: number
  /** 최근 30일에 쌓인 리뷰 건수 — 지표 카드가 쓴다. */
  recent30Days: number
  /** 5점부터 1점까지의 건수. */
  distribution: Record<ReviewRating, number>
}

export const SAMPLE_REVIEWS: SampleReview[] = [
  {
    reviewPublicId: 'REV-2026-1180',
    productName: '자동 급식기 5L',
    rating: 5,
    authorMasked: '김**',
    writtenAt: '2026-10-26',
    content:
      '출근이 늦어지는 날에도 정해진 시간에 밥이 나와서 마음이 놓여요. 소리가 거의 안 나서 겁 많은 아이도 잘 먹어요.',
    photoCount: 2,
    reply: null,
    reported: false,
  },
  {
    reviewPublicId: 'REV-2026-1176',
    productName: '원목 캣타워 3단',
    rating: 4,
    authorMasked: '이**',
    writtenAt: '2026-10-25',
    content: '조립은 혼자서 30분쯤 걸렸어요. 튼튼한데 설명서 그림이 조금 작아서 아쉬웠어요.',
    photoCount: 1,
    reply: null,
    reported: false,
  },
  {
    reviewPublicId: 'REV-2026-1171',
    productName: '방수 하네스 (M)',
    rating: 2,
    authorMasked: '박**',
    writtenAt: '2026-10-24',
    content: '사이즈표보다 작게 나왔어요. 중형견 M인데 목둘레가 안 맞아서 결국 교환했어요.',
    photoCount: 0,
    reply: {
      content:
        '불편을 드려 죄송해요. 사이즈표를 실측값으로 다시 올렸고, 교환은 바로 처리해 드렸어요. 알려 주셔서 감사해요.',
      repliedAt: '2026-10-24',
    },
    reported: false,
  },
  {
    reviewPublicId: 'REV-2026-1168',
    productName: '동결건조 간식 100g',
    rating: 5,
    authorMasked: '최**',
    writtenAt: '2026-10-23',
    content: '부스러짐이 적어서 훈련용으로 쪼개 쓰기 좋아요. 재구매했어요.',
    photoCount: 0,
    reply: {
      content: '훈련용으로 잘 쓰신다는 말씀이 반가워요. 다음에도 신선한 물량으로 보내 드릴게요.',
      repliedAt: '2026-10-23',
    },
    reported: false,
  },
  {
    reviewPublicId: 'REV-2026-1162',
    productName: '자동 급식기 5L',
    rating: 1,
    authorMasked: '익명',
    writtenAt: '2026-10-22',
    content: '다른 곳이 더 싸요. 여기서 사지 마세요.',
    photoCount: 0,
    reply: null,
    reported: true,
  },
  {
    reviewPublicId: 'REV-2026-1159',
    productName: '원목 캣타워 3단',
    rating: 3,
    authorMasked: '정**',
    writtenAt: '2026-10-21',
    content: '고양이는 좋아하는데 원목 냄새가 며칠 났어요. 환기하고 나서는 괜찮아요.',
    photoCount: 1,
    reply: null,
    reported: false,
  },
]

export const SAMPLE_RATING_SUMMARY: RatingSummary = {
  average: 4.3,
  total: 318,
  recent30Days: 47,
  distribution: { 5: 196, 4: 71, 3: 29, 2: 14, 1: 8 },
}

/** 필터 Select에 쓰는 상품 목록 — 서버가 생기면 상품 목록 조회로 바뀐다. */
export const SAMPLE_REVIEW_PRODUCTS = [
  '자동 급식기 5L',
  '원목 캣타워 3단',
  '방수 하네스 (M)',
  '동결건조 간식 100g',
]

import type { BuyerOrder, Review } from '@aechak/domain'
import { findProduct, placeholderImage } from '@/shared/catalog'

// 리뷰 화면(b4-st-2 작성 / b4-st-3 목록 / b4-st-6 내 리뷰) 공용 상수·목업·파생 로직.

export const REVIEW_REWARD = 500 // 포토 리뷰 적립금(원)
export const MIN_REVIEW_LENGTH = 10
export const MAX_REVIEW_LENGTH = 1000

// 금칙어(비속어·외부 채널 유도). 목업이라 대표 몇 개만 둔다 — 입력에 포함되면 등록을 막는다.
const PROHIBITED_WORDS = ['바보', '멍청이', '직거래', '계좌이체', '카톡', '외부채널', '개인거래']

/** 본문에 금칙어가 포함됐는지. */
export function containsProhibitedWord(text: string): boolean {
  const normalized = text.replace(/\s/g, '')
  return PROHIBITED_WORDS.some(w => normalized.includes(w))
}

export type ReviewValidation =
  | { ok: true }
  | { ok: false; reason: 'rating' | 'too-short' | 'prohibited'; message: string }

// 등록 가능 여부(별점 필수 + 최소 글자 + 금칙어 검사). 등록 버튼 활성/에러 메시지의 단일 원본.
export function validateReview(rating: number, content: string): ReviewValidation {
  if (rating < 1) return { ok: false, reason: 'rating', message: '별점을 선택해 주세요.' }
  if (content.trim().length < MIN_REVIEW_LENGTH) {
    return {
      ok: false,
      reason: 'too-short',
      message: `리뷰 내용을 최소 ${MIN_REVIEW_LENGTH}자 이상 작성해 주세요.`,
    }
  }
  if (containsProhibitedWord(content)) {
    return {
      ok: false,
      reason: 'prohibited',
      message: '금지어가 포함돼 등록할 수 없어요. 비속어/외부 채널 유도 표현을 빼고 다시 작성해 주세요.',
    }
  }
  return { ok: true }
}

// ── 상품 리뷰 목록(b4-st-3) ──

export type ReviewSort = 'latest' | 'rating' | 'photo'

export const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'rating', label: '별점높은순' },
  { value: 'photo', label: '포토리뷰만' },
]

// 정렬/필터 규칙은 Phase 1 상품 상세의 정렬 칩과 동일하게 맞춘다(포토리뷰만=필터, 나머지=정렬).
// 제네릭으로 둬서 Review에 태그를 얹은 뷰 모델(ProductReviewItem 등)도 정렬 후 태그를 잃지 않는다.
export function sortReviews<T extends Review>(reviews: T[], sort: ReviewSort): T[] {
  if (sort === 'photo') return reviews.filter(r => r.images.length > 0)
  const copy = [...reviews]
  if (sort === 'rating') return copy.sort((a, b) => b.rating - a.rating)
  return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface ProductReviewData {
  productId: string
  name: string
  storeName: string
  average: number
  total: number
  /** 5★→1★ 순 비율(%). */
  distribution: [number, number, number, number, number]
  reviews: Review[] // 다른 구매자들의 목업 리뷰(사용자 본인 리뷰는 스토어에서 합친다)
}

// 평균 별점으로 대략적인 분포를 만든다(목업 — 평균이 높을수록 5★ 비중이 큼).
function distributionFor(average: number): [number, number, number, number, number] {
  if (average >= 4.6) return [84, 11, 3, 1, 1]
  if (average >= 4.2) return [68, 20, 8, 2, 2]
  return [52, 26, 13, 6, 3]
}

interface Template {
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  content: string
  photo?: boolean
  date: string
}

// 상품 무관 공용 목업 리뷰 풀(작성자 마스킹). 상품별로 개수를 잘라 쓴다.
const REVIEW_TEMPLATES: Template[] = [
  { author: '집사**', rating: 5, content: '기대 이상이에요. 마감도 꼼꼼하고 우리 아이가 잘 써요. 재구매 의사 있어요.', photo: true, date: '2026.06.11' },
  { author: '멍토끼', rating: 5, content: '배송도 빠르고 포장도 튼튼했어요. 실물이 더 좋아요.', photo: true, date: '2026.06.10' },
  { author: '코코****', rating: 4, content: '가격 대비 만족스러워요. 조금 더 컸으면 하는 아쉬움은 있어요.', date: '2026.06.08' },
  { author: '하늘**', rating: 5, content: '두 번째 구매예요. 믿고 쓰는 제품이라 계속 살 것 같아요.', date: '2026.06.06' },
  { author: '보리맘', rating: 4, content: '무난하게 좋아요. 사진처럼 색감도 예뻐요.', photo: true, date: '2026.06.03' },
  { author: '냥집사', rating: 3, content: '기능은 괜찮은데 소음이 조금 있어요. 적응하면 쓸 만해요.', date: '2026.05.30' },
  { author: '토리***', rating: 5, content: '아이가 정말 좋아해요. 다음에 또 주문할게요.', date: '2026.05.27' },
]

// 상품 리뷰 데이터(요약 + 다른 구매자 리뷰). 알 수 없는 상품은 null.
export function getProductReviewData(productId: string): ProductReviewData | null {
  const product = findProduct(productId)
  if (!product) return null
  const total = product.reviewCount ?? 0
  const average = product.rating ?? 0
  const count = total > 0 ? Math.min(REVIEW_TEMPLATES.length, 6) : 0
  const reviews: Review[] = REVIEW_TEMPLATES.slice(0, count).map((t, i) => ({
    id: `${productId}-base-${i}`,
    productId,
    orderId: `mock-${i}`,
    author: t.author,
    rating: t.rating,
    content: t.content,
    images: t.photo ? [placeholderImage(40 + i * 30), placeholderImage(120 + i * 20)] : [],
    option: product.category,
    verifiedPurchase: true,
    createdAt: t.date,
  }))
  return {
    productId,
    name: product.name,
    storeName: product.storeName ?? '',
    average,
    total,
    distribution: total > 0 ? distributionFor(average) : [0, 0, 0, 0, 0],
    reviews,
  }
}

export function fetchProductReviewData(productId: string): Promise<ProductReviewData | null> {
  return new Promise(resolve => {
    setTimeout(() => resolve(getProductReviewData(productId)), 300)
  })
}

// ── 내 리뷰 · 작성 대기(b4-st-6) ──

export interface PendingReview {
  orderId: string
  productId: string
  name: string
  option: string
  thumbnailUrl?: string
  /** "구매확정 06.10" / "배송완료 06.05" 안내. */
  since: string
}

// 배송완료/구매확정 주문 상품 중 아직 리뷰를 쓰지 않은 항목(작성 대기). isReviewed는 리뷰 스토어 판정.
export function buildPendingReviews(
  orders: readonly BuyerOrder[],
  isReviewed: (orderId: string, productId: string) => boolean,
): PendingReview[] {
  const pending: PendingReview[] = []
  for (const order of orders) {
    if (order.status !== 'delivered' && order.status !== 'confirmed') continue
    const sinceDate =
      order.status === 'confirmed'
        ? confirmLabel('구매확정', order.confirmedAt)
        : confirmLabel('배송완료', order.deliveredAt)
    for (const group of order.groups) {
      for (const item of group.items) {
        if (isReviewed(order.id, item.productId)) continue
        pending.push({
          orderId: order.id,
          productId: item.productId,
          name: item.name,
          option: item.option,
          // 시드/mock 주문 항목은 thumbnailUrl을 안 담아 "빈 이미지" 아이콘으로 빠지던 걸,
          // 상품 id로 카탈로그를 참조해 완료 리뷰/카탈로그와 동일한 실루엣 썸네일로 통일한다.
          thumbnailUrl: item.thumbnailUrl ?? findProduct(item.productId)?.thumbnailUrl,
          since: sinceDate,
        })
      }
    }
  }
  return pending
}

function confirmLabel(prefix: string, date: string | undefined): string {
  const m = date?.match(/^\d{4}\.(\d{2})\.(\d{2})/)
  return m ? `${prefix} ${m[1]}.${m[2]}` : prefix
}

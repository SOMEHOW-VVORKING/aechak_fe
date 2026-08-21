import { useMemo } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { getProductReviews, type ReviewItemResponse } from '@aechak/api'
import type { Review } from '@aechak/domain'
import { findMockProduct } from '@/shared/catalog'
import { useOrders } from '@/shared/order'
import { addReview, removeReview, updateReview, useReviews } from '@/shared/review'
import {
  buildPendingReviews,
  filterPhotoReviews,
  getProductReviewData,
  sortReviews,
  type PendingReview,
  type ReviewSort,
} from './review.mock'

const PAGE_SIZE = 20

// 상품 리뷰 목록 항목 — 서버/목업 리뷰를 도메인 Review 형태로 정규화하고 "내가 쓴 리뷰"인지(isMine)
// 태그를 얹은 뷰 모델. 서버 리뷰는 응답의 isMine(SCRUM-210)을 그대로 신뢰하고, 아직 서버에 없는
// 로컬 목업 작성분만 true로 얹는다 — 소비 측(ProductReviewsScreen)이 이 플래그로 닉네임 표기·
// 수정/삭제 노출을 구분한다. 작성자 닉네임 비교 같은 추측 판별은 쓰지 않는다.
export interface ProductReviewItem extends Review {
  isMine: boolean
}

/**
 * 서버에 저장된 리뷰의 로컬 id 접두. 서버 리뷰(`srv-<reviewId>`)와 아직 서버에 없는 목업 작성분을
 * 구분하는 유일한 표식이라, 목록 머지와 수정 노출 판정이 이 접두를 함께 본다.
 */
const SERVER_ID_PREFIX = 'srv-'

export function serverReviewId(localId: string): number | null {
  if (!localId.startsWith(SERVER_ID_PREFIX)) return null
  const parsed = Number(localId.slice(SERVER_ID_PREFIX.length))
  return Number.isSafeInteger(parsed) ? parsed : null
}

export interface ProductReviewsView {
  average: number
  /** 평점 요약 기준 전체 리뷰 수(별점 분포/평균의 모수, photoOnly와 무관). */
  total: number
  /** 현재 필터(photoOnly)를 반영한 목록 총 개수 — 헤더 "리뷰 N" 라벨용. 필터 off면 total과 같다. */
  filteredTotal: number
  /** 5★→1★ 순 비율(%). */
  distribution: [number, number, number, number, number]
  reviews: ProductReviewItem[]
}

type Distribution = [number, number, number, number, number]

// 정규화된 한 페이지 — 실 API와 목업 폴백이 같은 형태를 만들어 select/머지 로직을 하나로 둔다.
interface ReviewPage {
  summary: { average: number; total: number; distribution: Distribution } | null
  items: ProductReviewItem[]
  /** photoOnly를 반영한 총 개수(첫 페이지에만, 이후 null) — 헤더 라벨용. */
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
  notFound: boolean
}

// 서버 리뷰 항목 -> 화면 뷰 모델(도메인 Review 형태). author/createdAt/images 필드명이 서버와 달라
// 여기서 흡수한다(author=authorNickname, createdAt='YYYY.MM.DD', images=imageUrl 정렬 배열).
function toReviewItem(productId: string, r: ReviewItemResponse): ProductReviewItem {
  const rating = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5
  return {
    id: `${SERVER_ID_PREFIX}${r.reviewId}`,
    productId,
    orderId: '',
    author: r.authorNickname,
    rating,
    content: r.content,
    images: [...r.images].sort((a, b) => a.sortOrder - b.sortOrder).map(img => img.imageUrl),
    option: r.optionName,
    // 서버는 구매 인증을 주지 않고, '구매' pill은 Phase 9에서 이미 제거됨.
    verifiedPurchase: false,
    createdAt: r.createdAt.slice(0, 10).replace(/-/g, '.'), // ISO 'YYYY-MM-DD...' -> 'YYYY.MM.DD'
    isMine: r.isMine,
  }
}

// 별점별 개수({'1':n..'5':n}) -> 5★→1★ 비율(%). reviewCount 0이면 전부 0.
function toDistribution(ratingDistribution: Record<string, number>, reviewCount: number): Distribution {
  const pct = (star: number) =>
    reviewCount > 0 ? Math.round(((ratingDistribution[String(star)] ?? 0) / reviewCount) * 100) : 0
  return [pct(5), pct(4), pct(3), pct(2), pct(1)]
}

function isNotFound(e: unknown): boolean {
  return (e as { response?: { status?: number } } | null)?.response?.status === 404
}

const NOT_FOUND_PAGE: ReviewPage = {
  summary: null,
  items: [],
  totalCount: null,
  nextCursor: null,
  hasNext: false,
  notFound: true,
}

// 목업 카탈로그 상품(홈/검색/찜 등 목업 진입점) 전용 — 목업 리뷰를 한 페이지로 감싼다.
// sort/photoOnly는 서버가 아니라 여기서 클라이언트로 적용한다.
function mockPage(productId: string, sort: ReviewSort, photoOnly: boolean): ReviewPage {
  const mock = getProductReviewData(productId)
  if (!mock) return NOT_FOUND_PAGE
  const base = photoOnly ? filterPhotoReviews(mock.reviews) : mock.reviews
  const items: ProductReviewItem[] = sortReviews(base, sort).map(r => ({ ...r, isMine: false }))
  return {
    summary: { average: mock.average, total: mock.total, distribution: mock.distribution },
    items,
    // 목업은 페이지네이션이 없어 보이는 목록이 곧 전체다 — 헤더가 실제 렌더 개수와 어긋나지 않게
    // 카탈로그의 리뷰 집계(mock.total)가 아니라 렌더되는 목업 리뷰 수를 쓴다.
    totalCount: items.length,
    nextCursor: null,
    hasNext: false,
    notFound: false,
  }
}

async function fetchReviewPage(
  productId: string,
  sort: ReviewSort,
  photoOnly: boolean,
  cursor: string | undefined,
  signal: AbortSignal | undefined,
): Promise<ReviewPage> {
  // 목업 카탈로그 id(p-*)는 서버에 없다 — 네트워크 없이 바로 목업으로 간다. findProduct가 아니라
  // findMockProduct를 쓰는 이유: 이전에 조회돼 레지스트리에 등록된 실 상품(ULID)을 목업으로
  // 되살려 백엔드가 미존재/비노출로 판정한 상품을 가짜 리뷰로 보여주는 회귀를 막는다.
  if (findMockProduct(productId)) return mockPage(productId, sort, photoOnly)
  try {
    const res = await getProductReviews(productId, { sort, photoOnly, cursor, size: PAGE_SIZE }, signal)
    const d = res.data
    return {
      summary: d.summary
        ? {
            average: d.summary.averageRating ?? 0,
            total: d.summary.reviewCount,
            distribution: toDistribution(d.summary.ratingDistribution, d.summary.reviewCount),
          }
        : null,
      items: d.reviews.map(r => toReviewItem(productId, r)),
      totalCount: d.totalCount,
      nextCursor: d.nextCursor,
      hasNext: d.hasNext,
      notFound: false,
    }
  } catch (e) {
    // 실 상품의 첫 페이지 404는 not-found로 처리(가짜 목업 리뷰로 위장하지 않는다).
    // 다른 오류(500 등)는 그대로 던진다.
    if (isNotFound(e) && cursor === undefined) return NOT_FOUND_PAGE
    throw e
  }
}

// 상품 리뷰 목록 — 실 API(GET /products/{id}/reviews, 커서 페이지네이션)를 소비하고, 미존재/목업
// 상품(404)은 목업 리뷰로 폴백한다. 내가 방금 쓴 리뷰(스토어)를 상단에 얹어 즉시 반영한다 —
// 서버 목록엔 mock 작성 리뷰가 없어 중복되지 않는다. 정렬/포토 필터는 서버 파라미터로 넘긴다.
export function useProductReviews(
  productId: string,
  sort: ReviewSort,
  photoOnly: boolean,
): {
  data: ProductReviewsView | null | undefined
  isLoading: boolean
  isError: boolean
  /** 지금 보이는 data가 이전 쿼리의 placeholder인지(정렬/포토 토글 로딩 중 깜빡임 방지용). */
  isPlaceholderData: boolean
  refetch: () => void
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
} {
  const query = useInfiniteQuery({
    queryKey: ['reviews', 'product', productId, sort, photoOnly],
    queryFn: ({ pageParam, signal }) => fetchReviewPage(productId, sort, photoOnly, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
    enabled: productId !== '',
    // 정렬/포토 토글은 queryKey가 바뀌어 새 쿼리로 전환되는데, 이전 데이터를 유지해 전체 화면이
    // 스켈레톤으로 깜빡이지 않고 목록만 제자리에서 갱신되게 한다(예전 클라이언트 즉시 정렬 UX 보존).
    // 단 productId가 바뀌면(다른 상품 리뷰로 전환) 이전 상품 데이터를 재활용하지 않고 새로 로딩한다.
    placeholderData: (prev, prevQuery) =>
      prevQuery && prevQuery.queryKey[2] === productId ? prev : undefined,
  })
  const userReviews = useReviews()

  const data = useMemo<ProductReviewsView | null | undefined>(() => {
    const pages = query.data?.pages
    if (!pages) return undefined // 로딩
    const first = pages[0]
    if (first?.notFound) return null // 미존재 상품
    const summary = first?.summary ?? { average: 0, total: 0, distribution: [0, 0, 0, 0, 0] as Distribution }
    const others = pages.flatMap(p => p.items)
    // 내 리뷰(스토어)는 isMine=true로 얹되, mine+others를 활성 정렬로 함께 정렬한다 — 내 리뷰가
    // 정렬과 무관하게 상단에 고정되지 않도록. 포토 필터는 mine에도 동일 적용(others는 서버가 필터).
    let mine: ProductReviewItem[] = userReviews
      .filter(r => r.productId === productId)
      .map(r => ({ ...r, isMine: true }))
    if (photoOnly) mine = filterPhotoReviews(mine)
    return {
      average: summary.average,
      total: summary.total,
      // 헤더 개수는 실제로 보이는 목록(서버/목업 집계 + 내 리뷰)과 맞춘다 — 요약 카드의 서버 평점
      // 모수(total)와 달리 내 리뷰까지 더해 "리뷰 N"이 카드 수와 어긋나지 않게 한다.
      filteredTotal: (first?.totalCount ?? summary.total) + mine.length,
      distribution: summary.distribution,
      reviews: sortReviews([...mine, ...others], sort),
    }
  }, [query.data, userReviews, productId, sort, photoOnly])

  return {
    data,
    isLoading: query.isLoading,
    isError: query.isError,
    isPlaceholderData: query.isPlaceholderData,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

// 리뷰 작성 mutation(신규). 리뷰 스토어에 반영되면 내 리뷰/상품 리뷰에 즉시 나타난다.
export function useCreateReview() {
  return useMutation<void, Error, Review>({
    mutationFn: review =>
      new Promise(resolve => {
        setTimeout(() => {
          addReview(review)
          resolve()
        }, 500)
      }),
  })
}

// 리뷰 수정 mutation.
export function useEditReview() {
  return useMutation<void, Error, { id: string; patch: Pick<Review, 'rating' | 'content' | 'images'> }>({
    mutationFn: ({ id, patch }) =>
      new Promise(resolve => {
        setTimeout(() => {
          updateReview(id, patch)
          resolve()
        }, 500)
      }),
  })
}

// 리뷰 삭제 mutation.
export function useDeleteReview() {
  return useMutation<void, Error, string>({
    mutationFn: id =>
      new Promise(resolve => {
        setTimeout(() => {
          removeReview(id)
          resolve()
        }, 400)
      }),
  })
}

// 내 리뷰(b4-st-6) — 작성 대기(배송완료/구매확정 미작성) + 작성 완료(내가 쓴 리뷰).
export function useMyReviews(): { pending: PendingReview[]; completed: Review[] } {
  const orders = useOrders()
  const reviews = useReviews()
  return useMemo(() => {
    const isReviewed = (orderId: string, productId: string) =>
      reviews.some(r => r.orderId === orderId && r.productId === productId)
    return { pending: buildPendingReviews(orders, isReviewed), completed: [...reviews] }
  }, [orders, reviews])
}

// 리뷰 하나를 조회한다(수정 진입 시 프리필용).
export function useReviewById(id: string | undefined): Review | undefined {
  const reviews = useReviews()
  return useMemo(() => (id ? reviews.find(r => r.id === id) : undefined), [reviews, id])
}

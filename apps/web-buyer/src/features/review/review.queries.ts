import { useMemo } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createReview,
  deleteReview as deleteReviewApi,
  errorResponse,
  getMyReviews,
  getProductReviews,
  type MyReviewTab as ServerMyReviewTab,
  type ReviewItemResponse,
  type ReviewStatus,
  type UnreviewedOrderItemResponse,
  type WrittenReviewItemResponse,
} from '@aechak/api'
import type { Review } from '@aechak/domain'
import { findMockProduct, findProduct, placeholderImage } from '@/shared/catalog'
import { removeReview, updateReview, useReviews } from '@/shared/review'
import {
  filterPhotoReviews,
  getProductReviewData,
  sortReviews,
  type PendingReview,
  type ReviewSort,
} from './review.mock'
import { uploadReviewPhoto } from './review.upload'

const PAGE_SIZE = 20

/** 내 리뷰 탭 쿼리 접두. 뒤에 서버 탭 이름(written/unreviewed)이 붙는다. */
const MY_REVIEWS_KEY = ['reviews', 'mine'] as const

// 상품 리뷰 목록 항목 — 서버/목업 리뷰를 도메인 Review 형태로 정규화하고 "내가 쓴 리뷰"인지(isMine)
// 태그를 얹은 뷰 모델. 서버 리뷰는 응답의 isMine(SCRUM-210)을 그대로 신뢰하고, 아직 서버에 없는
// 로컬 목업 작성분만 true로 얹는다 — 소비 측(ProductReviewsScreen)이 이 플래그로 닉네임 표기·
// 수정/삭제 노출을 구분한다. 작성자 닉네임 비교 같은 추측 판별은 쓰지 않는다.
export interface ProductReviewItem extends Review {
  isMine: boolean
  /**
   * 셀러가 이 리뷰에 남긴 답글(SCRUM-315). 리뷰당 하나이고 없으면 null이다.
   * 목업 카탈로그 리뷰에는 답글 개념이 없어 늘 null이다 — 서버 리뷰에만 값이 실린다.
   */
  sellerReply: { content: string; repliedAt: string } | null
}

/**
 * 서버에 저장된 리뷰의 로컬 id 접두. 서버 리뷰(`srv-<reviewId>`)와 아직 서버에 없는 목업 작성분을
 * 하나의 스토어에서 구분하는 유일한 표식이라, 목록 머지와 수정 노출 판정, 삭제 경로가 이 접두를
 * 함께 본다.
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
// rating은 응답 스키마가 enum(1~5)이라 그대로 쓴다 — BE 도메인(Review.kt)이 그 밖의 값은 생성 시점에 거절한다.
function toReviewItem(productId: string, r: ReviewItemResponse): ProductReviewItem {
  return {
    id: `${SERVER_ID_PREFIX}${r.reviewId}`,
    productId,
    orderId: '',
    author: r.authorNickname,
    rating: r.rating,
    content: r.content,
    images: [...r.images].sort((a, b) => a.sortOrder - b.sortOrder).map(img => img.imageUrl),
    option: r.optionName,
    // 서버는 구매 인증을 주지 않고, '구매' pill은 Phase 9에서 이미 제거됨.
    verifiedPurchase: false,
    createdAt: r.createdAt.slice(0, 10).replace(/-/g, '.'), // ISO 'YYYY-MM-DD...' -> 'YYYY.MM.DD'
    isMine: r.isMine,
    // 답글 등록 시각도 카드 표기와 같은 'YYYY.MM.DD'로 맞춘다.
    sellerReply: r.sellerReply && {
      content: r.sellerReply.content,
      repliedAt: r.sellerReply.repliedAt.slice(0, 10).replace(/-/g, '.'),
    },
  }
}

// 별점별 개수({'1':n..'5':n}) -> 5★→1★ 비율(%). reviewCount 0이면 전부 0.
function toDistribution(ratingDistribution: Record<string, number>, reviewCount: number): Distribution {
  const pct = (star: number) =>
    reviewCount > 0 ? Math.round(((ratingDistribution[String(star)] ?? 0) / reviewCount) * 100) : 0
  return [pct(5), pct(4), pct(3), pct(2), pct(1)]
}

function isNotFound(e: unknown): boolean {
  return errorResponse(e)?.status === 404
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
  // 목업 리뷰에는 셀러 답글 개념이 없다 — 지어내지 않고 null로 둔다.
  const items: ProductReviewItem[] = sortReviews(base, sort).map(r => ({ ...r, isMine: false, sellerReply: null }))
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
    // 서버에 저장된 리뷰(srv-)는 서버 페이지가 이미 담고 있어 로컬에서 또 얹으면 두 번 보인다 —
    // 아직 서버에 없는 목업 작성분만 올린다.
    let mine: ProductReviewItem[] = userReviews
      .filter(r => r.productId === productId && serverReviewId(r.id) == null)
      .map(r => ({ ...r, isMine: true, sellerReply: null }))
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

/**
 * 리뷰가 바뀌면 목록·상세 미리보기(`['reviews','product',id]` 접두)뿐 아니라 상품 상세
 * (`['product','detail',id]`)도 무효화한다 — 리뷰 수와 평균 별점의 원본이 상세 응답이라,
 * 이걸 빼면 전역 staleTime(60초) 동안 헤더 숫자만 낡은 채 남아 미리보기 카드 수와 어긋난다
 * (마지막 리뷰를 지우면 "전체보기"가 빈 목록으로 안내하는 상태까지 간다).
 * 키 문자열은 product feature와 공유하는 계약이라 한쪽만 바꾸지 말 것.
 */
function invalidateReviewCaches(queryClient: QueryClient, productId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['reviews', 'product', productId] })
  void queryClient.invalidateQueries({ queryKey: ['product', 'detail', productId] })
  // 내 리뷰 두 탭(작성 대기 개수, 작성 완료 목록)도 같은 리뷰를 담고 있다.
  void queryClient.invalidateQueries({ queryKey: MY_REVIEWS_KEY })
}

/**
 * 삭제한 서버 리뷰를 무한쿼리 캐시의 모든 페이지에서 즉시 빼낸다. 서버 리뷰는 로컬 스토어에 없어
 * `removeReview`가 no-op이라, 이게 없으면 "삭제했어요" 토스트가 뜬 뒤에도 재조회가 끝날 때까지
 * 카드가 남는다 — 여러 페이지를 펼쳐 뒀으면 그 왕복이 페이지 수만큼 이어진다.
 * 헤더 개수의 모수인 첫 페이지 totalCount도 같이 줄여 카드 수와 어긋나지 않게 한다.
 * 정렬/포토 조합마다 키가 달라 접두 매칭(setQueriesData)으로 전부 손본다. 내 리뷰 작성 완료 탭
 * 캐시도 같은 모양(items[].id, totalCount)이라 같은 함수로 뺀다.
 */
function dropReviewFromPages(queryClient: QueryClient, queryKey: readonly unknown[], localId: string): void {
  queryClient.setQueriesData<{
    pages: { items: { id: string }[]; totalCount: number | null }[]
    pageParams: unknown[]
  }>(
    { queryKey },
    old => {
      // 상세 미리보기 쿼리는 같은 접두를 쓰지만 배열이라 pages가 없다 — 그건 무효화에 맡긴다.
      if (!old?.pages) return old
      const pages = old.pages.map(page => {
        const items = page.items.filter(item => item.id !== localId)
        return items.length === page.items.length ? page : { ...page, items }
      })
      // 어느 페이지에도 없었으면 참조를 그대로 둬 불필요한 리렌더를 막는다.
      if (pages.every((page, i) => page === old.pages[i])) return old
      const [first, ...rest] = pages
      return {
        ...old,
        pages:
          first && first.totalCount != null
            ? [{ ...first, totalCount: Math.max(0, first.totalCount - 1) }, ...rest]
            : pages,
      }
    },
  )
}

export interface CreateReviewInput {
  /** 화면이 조립한 리뷰(별점·본문·상품/주문). 서버 경로에서도 응답값으로 덮어 스토어에 넣는다. */
  review: Review
  /** 서버 주문 품목 id(작성 대기 항목). 리뷰는 서버에만 저장한다 — 없으면 작성 화면이 진입을 막는다. */
  orderItemId: number
  /** 첨부 사진 원본. 서버 경로에서만 presigned 업로드해 imageKeys로 바꾼다. */
  files?: File[]
}

// 리뷰 작성 mutation(POST /reviews). 성공하면 내 리뷰·상품 리뷰 캐시를 무효화한다.
export function useCreateReview() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, CreateReviewInput>({
    mutationFn: async ({ review, orderItemId, files = [] }) => {
      // 사진은 S3로 직접 올리고 tmp 키만 본문에 싣는다. 한 장이라도 실패하면 리뷰를 만들지 않는다
      // (반쪽 리뷰가 남지 않게) — 업로드 실패는 그대로 mutation 에러로 올라간다.
      const imageKeys = await Promise.all(files.map(uploadReviewPhoto))
      // 서버 리뷰는 로컬 스토어에 두지 않는다. 내 리뷰와 상품 리뷰 모두 서버 목록이 원본이다.
      await createReview({
        orderItemId,
        rating: review.rating,
        content: review.content,
        imageKeys,
      })
    },
    onSuccess: (_, variables) => {
      invalidateReviewCaches(queryClient, variables.review.productId)
      // 작성 화면에서 돌아가면 내 리뷰 캐시는 비활성이라 무효화만으로는 마운트 직후 이전 목록
      // (방금 쓴 품목이 아직 작성 대기에 있고 작성 완료에는 없는 상태)이 재조회 전까지 보인다.
      // 캐시를 비워 마운트 시 로딩을 거쳐 새 목록을 받게 한다.
      void queryClient.resetQueries({ queryKey: MY_REVIEWS_KEY })
    },
  })
}

// 리뷰 작성·삭제 실패 문구. 401은 axios 인터셉터의 refresh + 전역 리다이렉트가 처리하므로 여기 오지 않는다.
// 같은 status에 사유가 여러 개라 errorCode로 분기한다. 사진 presign 거절(100000)도 작성 mutation 에러로
// 올라오므로 여기서 함께 안내한다. 서버 message는 -습니다체라 그대로 쓰지 않는다.
export function reviewErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 100000:
      return 'PNG, JPG, WEBP 형식만 올릴 수 있어요'
    case 110004:
      return '이미 리뷰를 쓴 주문이에요.'
    case 110005:
      return '리뷰를 쓸 수 있는 주문을 찾지 못했어요.'
    case 110007:
      return '구매확정한 주문만 리뷰를 쓸 수 있어요.'
    case 110008:
      return '구매확정 30일이 지나 리뷰를 쓸 수 없어요.'
    case 110009:
      return '사진은 최대 5장까지 올릴 수 있어요.'
    case 110010:
      return '취소하거나 반품한 주문은 리뷰를 쓸 수 없어요.'
    case 110003:
      return '본인이 쓴 리뷰만 삭제할 수 있어요.'
    case 110000:
      return '이미 삭제된 리뷰예요.'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
  }
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

// 리뷰 삭제 mutation. 서버에 저장된 리뷰(srv- 접두)는 실제로 지우고, 목업 작성분은 스토어에서만
// 뺀다. 대상 Review를 통째로 받는 이유는 삭제 후 무효화할 상품 캐시 키(productId)가 필요해서다.
export function useDeleteReview() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, Review>({
    mutationFn: async review => {
      const serverId = serverReviewId(review.id)
      if (serverId == null) {
        await new Promise(resolve => setTimeout(resolve, 400))
        removeReview(review.id)
        return
      }
      try {
        await deleteReviewApi(serverId)
      } catch (e) {
        // 404(110000)는 이미 지워진 리뷰라 사용자가 할 일이 없다 — 로컬에서도 빼고 성공으로 닫는다.
        // 403(110003 본인 리뷰 아님)이나 서버 오류는 그대로 던져 화면이 사유를 안내하게 한다.
        if (!isNotFound(e)) throw e
      }
      // 서버 리뷰는 로컬 스토어에 없다. 상품 리뷰와 내 리뷰 캐시에서 바로 빼서 토스트와 목록이
      // 어긋나지 않게 한 뒤, 재집계된 요약과 개수는 아래 무효화로 맞춘다. 지운 품목은 재작성할 수
      // 없어(서버가 작성 대기에서도 뺀다) 작성 대기 캐시는 건드리지 않는다.
      dropReviewFromPages(queryClient, ['reviews', 'product', review.productId], review.id)
      dropReviewFromPages(queryClient, [...MY_REVIEWS_KEY, 'written'], review.id)
    },
    onSuccess: (_, review) => invalidateReviewCaches(queryClient, review.productId),
  })
}

// ── 내 리뷰(b4-st-6) ──

/** 내 리뷰 작성 완료 항목. 서버 리뷰는 주문 시점 상품 스냅샷과 노출 상태를 함께 싣는다. */
export interface MyWrittenReview extends Review {
  productName?: string
  thumbnailUrl?: string
  /** 서버 리뷰만 있다. PUBLIC이 아니면 화면이 다른 구매자에게 어떻게 보이는지 안내한다. */
  reviewStatus?: ReviewStatus
}

interface MyReviewPage<T> {
  items: T[]
  /** 첫 페이지에만 실린다(이후 null). */
  totalCount: number | null
  nextCursor: string | null
  hasNext: boolean
}

/** 'YYYY-MM-DD...' -> 'MM.DD' */
function monthDay(iso: string): string {
  return iso.slice(5, 10).replace('-', '.')
}

function toWrittenReview(r: WrittenReviewItemResponse): MyWrittenReview {
  return {
    id: `${SERVER_ID_PREFIX}${r.reviewId}`,
    productId: r.productPublicId,
    orderId: '',
    author: '나',
    rating: r.rating,
    content: r.content,
    images: [...r.images].sort((a, b) => a.sortOrder - b.sortOrder).map(img => img.imageUrl),
    option: r.optionName,
    verifiedPurchase: true,
    createdAt: r.createdAt.slice(0, 10).replace(/-/g, '.'),
    productName: r.productName,
    thumbnailUrl: r.productThumbnailUrl ?? placeholderImage(),
    reviewStatus: r.reviewStatus,
  }
}

function toPendingReview(r: UnreviewedOrderItemResponse): PendingReview {
  return {
    orderId: '',
    productId: r.productPublicId,
    name: r.productName,
    option: r.optionName,
    thumbnailUrl: r.productThumbnailUrl ?? placeholderImage(),
    since: `구매확정 ${monthDay(r.purchaseConfirmedAt)}`,
    orderItemId: r.orderItemId,
    reviewableUntil: monthDay(r.reviewableUntil),
    canReview: r.canReview,
  }
}

export interface MyReviewTabView<T> {
  /** 서버 항목 뒤에 목업 주문 항목을 붙인 목록. 서버 첫 페이지를 받기 전(로딩/실패)에는 null. */
  items: T[] | null
  /** 탭 라벨 개수(서버 totalCount + 목업 항목 수). 첫 페이지를 받기 전에는 null. */
  count: number | null
  isError: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
}

function useMyReviewTab<T>(
  tab: ServerMyReviewTab,
  toItem: (item: WrittenReviewItemResponse | UnreviewedOrderItemResponse) => T[],
  local: T[],
): MyReviewTabView<T> {
  const query = useInfiniteQuery({
    queryKey: [...MY_REVIEWS_KEY, tab],
    queryFn: async ({ pageParam, signal }): Promise<MyReviewPage<T>> => {
      const { data } = await getMyReviews({ tab, cursor: pageParam, size: PAGE_SIZE }, signal)
      return {
        items: data.items.flatMap(toItem),
        totalCount: data.totalCount,
        nextCursor: data.nextCursor,
        hasNext: data.hasNext,
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => (last.hasNext ? (last.nextCursor ?? undefined) : undefined),
  })
  const pages = query.data?.pages
  const items = useMemo(() => (pages ? [...pages.flatMap(p => p.items), ...local] : null), [pages, local])
  return {
    items,
    count: pages ? (pages[0]?.totalCount ?? 0) + local.length : null,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

const NO_LOCAL_PENDING: PendingReview[] = []

/**
 * 내 리뷰 두 탭. 작성 대기는 GET /users/me/reviews?tab=unreviewed, 작성 완료는 tab=written이 원본이다.
 * 작성 대기는 서버 항목뿐이다(목업 주문 스토어 폐기). 작성 완료는 아직 로컬 스토어 리뷰(시드·수정분)를
 * 서버 항목 뒤에 붙인다.
 */
export function useMyReviews(): {
  pending: MyReviewTabView<PendingReview>
  completed: MyReviewTabView<MyWrittenReview>
} {
  const reviews = useReviews()
  const localCompleted = useMemo<MyWrittenReview[]>(
    () =>
      reviews.map(r => {
        const product = findProduct(r.productId)
        return { ...r, productName: product?.name, thumbnailUrl: product?.thumbnailUrl }
      }),
    [reviews],
  )
  return {
    pending: useMyReviewTab('unreviewed', i => (i.type === 'UNREVIEWED' ? [toPendingReview(i)] : []), NO_LOCAL_PENDING),
    completed: useMyReviewTab('written', i => (i.type === 'WRITTEN' ? [toWrittenReview(i)] : []), localCompleted),
  }
}

// 리뷰 하나를 조회한다(수정 진입 시 프리필용).
export function useReviewById(id: string | undefined): Review | undefined {
  const reviews = useReviews()
  return useMemo(() => (id ? reviews.find(r => r.id === id) : undefined), [reviews, id])
}

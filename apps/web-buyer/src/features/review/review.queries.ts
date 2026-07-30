import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { Review } from '@aechak/domain'
import { useOrders } from '@/shared/order'
import { addReview, removeReview, updateReview, useReviews } from '@/shared/review'
import {
  buildPendingReviews,
  fetchProductReviewData,
  type PendingReview,
  type ProductReviewData,
} from './review.mock'

// 상품 리뷰 목록 항목 — 목업 리뷰에 "내가 쓴 리뷰"인지(isMine) 태그를 얹은 뷰 모델.
// 내 리뷰는 author 문자열('나')이 아니라 스토어의 결정적 id를 신뢰 원본으로 삼아 판별한다 —
// 소비 측(ProductReviewsScreen)이 이 플래그로 닉네임 표기·수정/삭제 노출 대상을 구분한다.
export interface ProductReviewItem extends Review {
  isMine: boolean
}

export type ProductReviewsView = Omit<ProductReviewData, 'reviews'> & {
  reviews: ProductReviewItem[]
}

// 리뷰 목록은 "다른 구매자 목업 리뷰(비동기 mock)"와 "내가 쓴 리뷰(스토어)"를 합쳐서 보여준다.
// 내가 방금 쓴 리뷰가 즉시 이 상품 목록에 반영되도록 스토어 구독을 함께 사용한다.
export function useProductReviews(productId: string): {
  data: ProductReviewsView | null | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => void
} {
  const base = useQuery<ProductReviewData | null>({
    queryKey: ['reviews', 'product', productId],
    queryFn: () => fetchProductReviewData(productId),
    enabled: productId !== '',
  })
  const userReviews = useReviews()

  const data = useMemo<ProductReviewsView | null | undefined>(() => {
    if (!base.data) return base.data // null(없음) 또는 undefined(로딩)
    // 내 리뷰(스토어)는 isMine=true, 목업 리뷰는 false로 태그해 소비 측이 신뢰할 수 있게 한다.
    const mine: ProductReviewItem[] = userReviews
      .filter(r => r.productId === productId)
      .map(r => ({ ...r, isMine: true }))
    const others: ProductReviewItem[] = base.data.reviews.map(r => ({ ...r, isMine: false }))
    return { ...base.data, reviews: [...mine, ...others] }
  }, [base.data, userReviews, productId])

  return { data, isLoading: base.isLoading, isError: base.isError, refetch: () => void base.refetch() }
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

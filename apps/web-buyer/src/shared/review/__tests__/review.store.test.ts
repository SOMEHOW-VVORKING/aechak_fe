import { beforeEach, describe, it, expect } from 'vitest'
import type { Review } from '@aechak/domain'
import {
  addReview,
  getReviews,
  hasReviewFor,
  removeReview,
  resetReviews,
  updateReview,
} from '../review.store'

function makeReview(id: string, overrides: Partial<Review> = {}): Review {
  return {
    id,
    productId: 'p1',
    orderId: 'o1',
    author: '나',
    rating: 5,
    content: '좋아요, 재구매 의사 있어요.',
    images: [],
    verifiedPurchase: true,
    createdAt: '2026.07.10',
    ...overrides,
  }
}

describe('review.store', () => {
  beforeEach(() => resetReviews())

  it('[AC-REVIEW-STORE-001] addReview는 최신을 앞에 넣고 같은 id는 교체(upsert)한다', () => {
    const before = getReviews().length
    addReview(makeReview('rv-1'))
    expect(getReviews()[0]?.id).toBe('rv-1')
    expect(getReviews()).toHaveLength(before + 1)
    addReview(makeReview('rv-1', { content: '수정된 내용' }))
    expect(getReviews().filter(r => r.id === 'rv-1')).toHaveLength(1)
    expect(getReviews()[0]?.content).toBe('수정된 내용')
  })

  it('[AC-REVIEW-STORE-002] hasReviewFor는 주문 상품 단위로 판정한다', () => {
    addReview(makeReview('rv-o2', { orderId: 'o2', productId: 'p9' }))
    expect(hasReviewFor('o2', 'p9')).toBe(true)
    expect(hasReviewFor('o2', 'p1')).toBe(false)
  })

  it('[AC-REVIEW-STORE-003] updateReview/removeReview가 동작한다', () => {
    addReview(makeReview('rv-x'))
    updateReview('rv-x', { rating: 3, content: '별로였어요', images: [] })
    expect(getReviews().find(r => r.id === 'rv-x')?.rating).toBe(3)
    removeReview('rv-x')
    expect(getReviews().find(r => r.id === 'rv-x')).toBeUndefined()
  })
})

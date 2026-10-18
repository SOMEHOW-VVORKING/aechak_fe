import { describe, it, expect } from 'vitest'
import type { Review } from '@aechak/domain'
import {
  containsProhibitedWord,
  filterPhotoReviews,
  sortReviews,
  validateReview,
} from '../review.mock'

function review(overrides: Partial<Review>): Review {
  return {
    id: 'r',
    productId: 'p1',
    orderId: 'o1',
    author: '나',
    rating: 5,
    content: '좋아요',
    images: [],
    verifiedPurchase: true,
    createdAt: '2026.06.10',
    ...overrides,
  }
}

describe('review.mock 등록 검증', () => {
  it('[AC-REVIEW-001] 별점 미선택이면 등록 불가', () => {
    const v = validateReview(0, '충분히 긴 리뷰 내용이에요')
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason).toBe('rating')
  })

  it('[AC-REVIEW-002] 최소 10자 미만이면 등록 불가', () => {
    expect(validateReview(5, '짧아요').ok).toBe(false)
    expect(validateReview(5, '충분히 긴 리뷰 내용이에요').ok).toBe(true)
  })

  it('[AC-REVIEW-003] 금칙어가 포함되면 등록 불가', () => {
    expect(containsProhibitedWord('직거래 하실 분 연락 주세요')).toBe(true)
    expect(containsProhibitedWord('배송도 빠르고 품질도 좋아요')).toBe(false)
    const v = validateReview(5, '카톡으로 연락 주시면 싸게 드려요')
    expect(v.ok === false && v.reason).toBe('prohibited')
  })
})

describe('review.mock 정렬/필터', () => {
  // 날짜순과 별점순 결과가 서로 달라야 정렬 기준을 구분할 수 있다(최신=낮은 별점, 오래됨=높은 별점).
  const reviews: Review[] = [
    review({ id: 'a', rating: 3, createdAt: '2026.06.10', images: [] }), // 최신, 최저 별점
    review({ id: 'b', rating: 5, createdAt: '2026.06.05', images: ['img1'] }), // 최고 별점, 가장 오래됨
    review({ id: 'c', rating: 4, createdAt: '2026.06.08', images: [] }), // 중간
  ]

  it('[AC-REVIEW-004] 최신순은 작성일 내림차순', () => {
    expect(sortReviews(reviews, 'latest').map(r => r.id)).toEqual(['a', 'c', 'b'])
  })

  it('[AC-REVIEW-005] 별점높은순은 별점 내림차순', () => {
    expect(sortReviews(reviews, 'rating_desc').map(r => r.id)).toEqual(['b', 'c', 'a'])
  })

  it('[AC-REVIEW-006] 포토리뷰만은 이미지가 있는 리뷰만 남긴다', () => {
    expect(filterPhotoReviews(reviews).map(r => r.id)).toEqual(['b'])
  })
})

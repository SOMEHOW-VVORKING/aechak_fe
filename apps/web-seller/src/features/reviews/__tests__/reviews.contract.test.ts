import { describe, expect, it } from 'vitest'
import {
  formatAverageRating,
  normalizeReviewSearchParams,
  ratingBars,
  reviewErrorMessage,
  REPLY_FILTER_DONE,
  REPLY_FILTER_NONE,
} from '../reviews.contract'

describe('normalizeReviewSearchParams', () => {
  it("[AC-SELLER-REVIEW-001] '전체'(빈 문자열) 필터는 키째 빠진다", () => {
    // 빈 값을 그대로 보내면 서버가 미입력이 아니라 형식 오류(400 errorCode 90001)로 거절한다.
    expect(normalizeReviewSearchParams({ productId: '', rating: '', reply: '' })).toEqual({})
    expect(normalizeReviewSearchParams({})).toEqual({})
  })

  it('[AC-SELLER-REVIEW-002] 답글 없음 필터는 hasReply=false로 남는다', () => {
    // false는 "값이 없다"가 아니라 "답글 없는 것만"이라서 떨어뜨리면 필터가 사라진다.
    expect(normalizeReviewSearchParams({ reply: REPLY_FILTER_NONE })).toEqual({ hasReply: false })
    expect(normalizeReviewSearchParams({ reply: REPLY_FILTER_DONE })).toEqual({ hasReply: true })
  })

  it('[AC-SELLER-REVIEW-003] 별점은 1~5 정수만 넘긴다', () => {
    expect(normalizeReviewSearchParams({ rating: '5' })).toEqual({ rating: 5 })
    expect(normalizeReviewSearchParams({ rating: '0' })).toEqual({})
    expect(normalizeReviewSearchParams({ rating: '6' })).toEqual({})
    expect(normalizeReviewSearchParams({ rating: '3.5' })).toEqual({})
    expect(normalizeReviewSearchParams({ rating: 'abc' })).toEqual({})
  })

  it('[AC-SELLER-REVIEW-004] 상품 식별자는 trim하고 공백만이면 뺀다', () => {
    expect(normalizeReviewSearchParams({ productId: '  01JABC  ' })).toEqual({
      productId: '01JABC',
    })
    expect(normalizeReviewSearchParams({ productId: '   ' })).toEqual({})
  })
})

describe('분포·평균 표기', () => {
  it('[AC-SELLER-REVIEW-005] 리뷰가 없으면 평균을 숫자로 꾸미지 않는다', () => {
    expect(formatAverageRating(null)).toBeNull()
    expect(formatAverageRating(4.31)).toBe('4.3')
  })

  it('[AC-SELLER-REVIEW-006] 막대는 5점부터 1점까지 다섯 칸이고 빠진 별점은 0이다', () => {
    expect(ratingBars({ '5': 2, '2': 1 })).toEqual([
      { rating: 5, count: 2 },
      { rating: 4, count: 0 },
      { rating: 3, count: 0 },
      { rating: 2, count: 1 },
      { rating: 1, count: 0 },
    ])
    expect(ratingBars(undefined).map(bar => bar.count)).toEqual([0, 0, 0, 0, 0])
  })
})

describe('reviewErrorMessage', () => {
  it('[AC-SELLER-REVIEW-007] 답글 계약 오류를 코드별 문구로 바꾼다', () => {
    const at = (errorCode: number) => reviewErrorMessage({ response: { data: { errorCode } } })
    expect(at(110201)).toContain('이미 답글이 있어요')
    expect(at(110200)).toContain('답글이 이미 지워졌어요')
    expect(at(110000)).toContain('리뷰를 찾을 수 없어요')
    expect(at(110011)).toContain('판매 활동이 가능한 계정만')
    // 모르는 코드와 네트워크 오류는 같은 기본 문구로 떨어진다(빈 화면으로 흘리지 않는다).
    expect(at(99999)).toContain('요청을 처리하지 못했어요')
    expect(reviewErrorMessage(new Error('network'))).toContain('요청을 처리하지 못했어요')
  })
})

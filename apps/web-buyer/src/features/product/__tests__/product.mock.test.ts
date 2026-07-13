import { describe, it, expect } from 'vitest'
import { getProductDetailMock } from '../product.mock'

describe('getProductDetailMock', () => {
  it('[AC-PRODUCT-001] 상세는 이미지 캐러셀·스펙·옵션·리뷰 요약을 포함한다', () => {
    const detail = getProductDetailMock('p-feeder-5l')
    expect(detail).not.toBeNull()
    expect(detail!.images.length).toBe(4)
    expect(detail!.specs.length).toBeGreaterThan(0)
    expect(detail!.options).toContain('용량 5L / 화이트')
    expect(detail!.reviewSummary.total).toBeGreaterThan(0)
    expect(detail!.reviews.length).toBeGreaterThan(0)
  })

  it('[AC-PRODUCT-002] 세일 상품은 원가가 현재가보다 크다(할인율 계산 근거)', () => {
    const detail = getProductDetailMock('p-feeder-5l')
    expect(detail!.originalPrice).toBeGreaterThan(detail!.price)
  })

  it('[AC-PRODUCT-003] 알 수 없는 id는 null을 반환한다(not-found 렌더 근거)', () => {
    expect(getProductDetailMock('nope')).toBeNull()
  })

  it('[AC-PRODUCT-004] 무료배송 여부가 상세에 계산돼 있다(검색 필터와 동일 규칙)', () => {
    // 64,000원(임계 30,000 이상) → 무료배송
    expect(getProductDetailMock('p-feeder-5l')!.freeShipping).toBe(true)
    // 12,500원(임계 미만) → 배송비 부과
    expect(getProductDetailMock('p-water-550')!.freeShipping).toBe(false)
  })
})

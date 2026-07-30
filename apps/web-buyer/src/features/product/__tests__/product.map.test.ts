import { describe, it, expect } from 'vitest'
import type { ProductDetailResponse, ProductOptionsResponse } from '@aechak/api'
import { mapProductDetail, mapProductOptions, mockOptionsFromDetail } from '../product.map'

function detail(overrides: Partial<ProductDetailResponse> = {}): ProductDetailResponse {
  return {
    productId: '01DETAIL',
    name: '리얼 급식기',
    description: '설명이에요',
    representativeImageKey: null,
    images: [],
    regularPrice: 89000,
    discountPrice: 64000,
    discountRate: 28,
    saleStatus: 'ON_SALE',
    shipping: { baseShippingFee: 3000, freeShippingThreshold: 50000 },
    seller: { storeName: '리얼상점', profileImageKey: null },
    review: { reviewCount: 128, averageRating: 4.7 },
    categories: [
      { categoryId: 1, name: '강아지', depth: 1 },
      { categoryId: 11, name: '사료/간식', depth: 2 },
    ],
    isLiked: true,
    ...overrides,
  }
}

describe('mapProductDetail', () => {
  it('[AC-PRODUCT-MAP-001] 가격 분리·품절·설명·isLiked를 매핑한다', () => {
    const d = mapProductDetail(detail())
    expect(d.price).toBe(64000)
    expect(d.originalPrice).toBe(89000)
    expect(d.isSoldOut).toBe(false)
    expect(d.description).toBe('설명이에요')
    expect(d.isLiked).toBe(true)
  })

  it('[AC-PRODUCT-MAP-002] breadcrumb는 반려동물용품 + depth 오름차순 카테고리명', () => {
    const d = mapProductDetail(detail())
    expect(d.breadcrumb).toEqual(['반려동물용품', '강아지', '사료/간식'])
  })

  it('[AC-PRODUCT-MAP-003] 배송비/무료배송은 실 shipping을 따른다', () => {
    // 판매가 64000 >= 임계 50000 → 무료배송
    expect(mapProductDetail(detail()).freeShipping).toBe(true)
    // 임계가 100000이면 미달 → 유료, deliveryFee=baseShippingFee
    const paid = mapProductDetail(detail({ shipping: { baseShippingFee: 3000, freeShippingThreshold: 100000 } }))
    expect(paid.freeShipping).toBe(false)
    expect(paid.deliveryFee).toBe(3000)
  })

  it('[AC-PRODUCT-MAP-004] 리뷰 요약만 실 review에서 오고, 리뷰 카드/분포/사양/도서산간비는 위장하지 않는다', () => {
    const d = mapProductDetail(detail())
    // 신뢰 가능한 집계 요약(건수/평균)은 실 데이터로 노출한다.
    expect(d.reviewSummary.total).toBe(128)
    expect(d.reviewSummary.average).toBe(4.7)
    // 실 API 소스가 없는 것들은 목업으로 위장하지 않고 비운다(codex 리뷰 #13).
    expect(d.reviews).toHaveLength(0)
    expect(d.reviewSummary.distribution).toBeUndefined()
    expect(d.specs).toHaveLength(0)
    expect(d.remoteAreaFee).toBeUndefined()
  })

  it('[AC-PRODUCT-MAP-005] images가 비면 대표 이미지 폴백으로 최소 1장을 만든다', () => {
    expect(mapProductDetail(detail({ images: [] })).images).toHaveLength(1)
  })
})

describe('mapProductOptions / mockOptionsFromDetail', () => {
  const options: ProductOptionsResponse = {
    optionGroups: [],
    optionCombinations: [
      { optionCombinationId: 1, name: '기본형', additionalPrice: 0, optionValueIds: [1], remainingStock: 10, soldOut: false },
      { optionCombinationId: 2, name: '프리미엄형', additionalPrice: 5000, optionValueIds: [2], remainingStock: 3, soldOut: false },
      { optionCombinationId: 3, name: '한정형', additionalPrice: 0, optionValueIds: [3], remainingStock: 0, soldOut: true },
    ],
  }

  it('[AC-PRODUCT-MAP-006] 조합을 선택 항목으로 평탄화한다(key=조합명, 추가금/재고/품절 반영)', () => {
    const view = mapProductOptions(options)
    expect(view.choices).toHaveLength(3)
    expect(view.choices[1]).toMatchObject({ key: '프리미엄형', additionalPrice: 5000, remainingStock: 3, soldOut: false })
    expect(view.choices[2]).toMatchObject({ key: '한정형', soldOut: true })
  })

  it('[AC-PRODUCT-MAP-007] 목업 상세 옵션(string[])도 동일 형태로 변환한다', () => {
    const view = mockOptionsFromDetail({
      options: ['용량 5L / 화이트', '용량 8L / 화이트'],
      stockCount: 12,
      isSoldOut: false,
    } as Parameters<typeof mockOptionsFromDetail>[0])
    expect(view.choices.map(c => c.key)).toEqual(['용량 5L / 화이트', '용량 8L / 화이트'])
    expect(view.choices[0]).toMatchObject({ additionalPrice: 0, remainingStock: 12, soldOut: false })
  })
})

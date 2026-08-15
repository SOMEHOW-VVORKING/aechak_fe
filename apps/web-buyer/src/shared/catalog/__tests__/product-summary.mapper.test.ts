import { describe, it, expect } from 'vitest'
import type { ProductSummaryResponse } from '@aechak/api'
import { toCatalogProduct } from '../product-summary.mapper'

function summary(overrides: Partial<ProductSummaryResponse> = {}): ProductSummaryResponse {
  return {
    productId: '01ABCDEF',
    name: '테스트 상품',
    sellerName: '리얼상점',
    thumbnailImageKey: null,
    regularPrice: 30000,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: 4.5,
    reviewCount: 10,
    isLiked: false,
    ...overrides,
  }
}

describe('toCatalogProduct', () => {
  it('[AC-CATALOG-MAP-001] 할인가가 있으면 price=할인가, originalPrice=정가로 분리한다', () => {
    const p = toCatalogProduct(summary({ regularPrice: 89000, discountPrice: 64000, discountRate: 28 }))
    expect(p.price).toBe(64000)
    expect(p.originalPrice).toBe(89000)
  })

  it('[AC-CATALOG-MAP-002] 할인가가 없으면 price=정가, originalPrice는 미설정', () => {
    const p = toCatalogProduct(summary({ regularPrice: 30000, discountPrice: null }))
    expect(p.price).toBe(30000)
    expect(p.originalPrice).toBeUndefined()
  })

  it('[AC-CATALOG-MAP-003] saleStatus가 ON_SALE이 아니면 품절/sold_out으로 매핑한다', () => {
    expect(toCatalogProduct(summary({ saleStatus: 'OUT_OF_STOCK' })).isSoldOut).toBe(true)
    expect(toCatalogProduct(summary({ saleStatus: 'OUT_OF_STOCK' })).status).toBe('sold_out')
    expect(toCatalogProduct(summary({ saleStatus: 'ON_SALE' })).isSoldOut).toBe(false)
    expect(toCatalogProduct(summary({ saleStatus: 'ON_SALE' })).status).toBe('selling')
  })

  it('[AC-CATALOG-MAP-004] 이미지 키가 있어도 media base URL이 없으면 placeholder data-URI로 폴백한다', () => {
    const p = toCatalogProduct(summary({ thumbnailImageKey: 'products/abc.jpg' }))
    expect(p.thumbnailUrl).toMatch(/^data:image\/svg\+xml/)
  })

  it('[AC-CATALOG-MAP-005] averageRating null이면 rating 미설정, sellerId는 seller-<이름>', () => {
    const p = toCatalogProduct(summary({ averageRating: null, sellerName: '냥이상점' }))
    expect(p.rating).toBeUndefined()
    expect(p.sellerId).toBe('seller-냥이상점')
  })
})

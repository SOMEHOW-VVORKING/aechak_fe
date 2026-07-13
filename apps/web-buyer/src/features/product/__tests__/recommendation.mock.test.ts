import { describe, it, expect } from 'vitest'
import { CATALOG_PRODUCTS } from '@/shared/catalog'
import { getCartRecommendations } from '../recommendation.mock'

describe('getCartRecommendations', () => {
  it('[AC-CART-RECO-001] 모든 상품이 추천 목록이 비어있지 않다', () => {
    for (const p of CATALOG_PRODUCTS) {
      expect(getCartRecommendations(p.id).length, `recommendations for ${p.id}`).toBeGreaterThan(0)
    }
  })

  it('[AC-CART-RECO-002] 현재 상품은 추천 목록에서 제외된다', () => {
    for (const p of CATALOG_PRODUCTS) {
      const recommended = getCartRecommendations(p.id)
      expect(recommended.some(x => x.id === p.id), `recommendations include self ${p.id}`).toBe(false)
    }
  })

  it('[AC-CART-RECO-003] 품절 상품(p-scratcher)은 추천 목록에서 제외된다', () => {
    for (const p of CATALOG_PRODUCTS) {
      const recommended = getCartRecommendations(p.id)
      expect(recommended.every(x => !x.isSoldOut)).toBe(true)
      expect(recommended.some(x => x.id === 'p-scratcher')).toBe(false)
    }
  })
})

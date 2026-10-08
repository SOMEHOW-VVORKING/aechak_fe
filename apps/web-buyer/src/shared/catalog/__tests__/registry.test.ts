import { describe, it, expect, beforeEach } from 'vitest'
import type { CatalogProduct } from '@/shared/catalog'
import { findProduct, registerProducts, resetRegistry } from '@/shared/catalog'

function realProduct(id: string): CatalogProduct {
  return {
    id,
    sellerId: 'seller-리얼상점',
    code: id,
    name: '리얼 상품',
    category: '',
    price: 12000,
    stock: 99,
    status: 'selling',
    inspectionStatus: 'approved',
    createdAt: '',
    storeName: '리얼상점',
    thumbnailUrl: 'https://cdn.example/real.png',
    reviewCount: 0,
    isSoldOut: false,
    mainCategory: 'all',
  }
}

describe('shared/catalog 실 상품 레지스트리', () => {
  beforeEach(() => resetRegistry())

  it('[AC-REGISTRY-001] 등록한 실 상품(ULID)을 findProduct가 우선 조회한다', () => {
    expect(findProduct('01REALTEST0000000000000000')).toBeUndefined()
    registerProducts([realProduct('01REALTEST0000000000000000')])
    expect(findProduct('01REALTEST0000000000000000')?.name).toBe('리얼 상품')
  })

  it('[AC-REGISTRY-002] 미등록 목업 id는 목업 카탈로그로 폴백한다', () => {
    expect(findProduct('p-feeder-5l')?.name).toContain('자동 급식기')
  })

  it('[AC-REGISTRY-003] resetRegistry가 캐시를 비운다', () => {
    registerProducts([realProduct('01REALTEST0000000000000000')])
    resetRegistry()
    expect(findProduct('01REALTEST0000000000000000')).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { buildCatalog } from '../catalog.mock'

describe('buildCatalog', () => {
  it('[AC-CATALOG-001] 품절 제외가 켜져 있으면 품절 상품이 빠진다(기본 정책)', () => {
    const { products } = buildCatalog({
      mainCategory: 'all',
      subCategory: '전체',
      sort: 'popular',
      excludeSoldOut: true,
    })
    expect(products.length).toBeGreaterThan(0)
    expect(products.every(p => !p.isSoldOut)).toBe(true)
  })

  it('[AC-CATALOG-002] 대분류로 필터링하면 해당 대분류 상품만 남는다', () => {
    const { products } = buildCatalog({
      mainCategory: 'cat',
      subCategory: '전체',
      sort: 'popular',
      excludeSoldOut: true,
    })
    expect(products.length).toBeGreaterThan(0)
    expect(products.every(p => p.mainCategory === 'cat')).toBe(true)
  })

  it('[AC-CATALOG-003] 중분류로 필터링하면 해당 카테고리 상품만 남는다', () => {
    const { products } = buildCatalog({
      mainCategory: 'all',
      subCategory: '산책용품',
      sort: 'popular',
      excludeSoldOut: true,
    })
    expect(products.length).toBeGreaterThan(0)
    expect(products.every(p => p.category === '산책용품')).toBe(true)
  })

  it('[AC-CATALOG-004] 낮은가격 정렬은 가격 오름차순이다', () => {
    const { products } = buildCatalog({
      mainCategory: 'all',
      subCategory: '전체',
      sort: 'price-asc',
      excludeSoldOut: true,
    })
    const prices = products.map(p => p.price)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))
  })

  it('[AC-CATALOG-006] 품절 제외를 끄면 품절 상품이 목록에 포함된다', () => {
    const params = { mainCategory: 'all', subCategory: '전체', sort: 'popular' } as const

    const excluded = buildCatalog({ ...params, excludeSoldOut: true })
    const included = buildCatalog({ ...params, excludeSoldOut: false })

    // 품절 제외 on일 때는 품절 상품이 하나도 없고,
    expect(excluded.products.some(p => p.isSoldOut)).toBe(false)
    // off일 때는 품절 상품이 최소 1개 이상 다시 나타난다(카탈로그에 품절 시드 존재).
    expect(included.products.some(p => p.isSoldOut)).toBe(true)
    expect(included.total).toBeGreaterThan(excluded.total)
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { getSellerProducts } from '@aechak/api'
import { lastSellerProductsQuery, seedSellerProducts } from '@/testing/msw/server'
import { normalizeSearchParams, type SellerProductSearchInput } from '../products.queries'

// 목록 쿼리 직렬화는 BE가 형식 오류로 거절하는 자리가 많아 queries 층에서 고정한다 — 빈 값 제거는
// normalizeSearchParams, 반복 파라미터는 공유 클라이언트의 paramsSerializer가 책임진다. 두 책임이
// 합쳐진 결과를 MSW가 받은 실제 쿼리 문자열로 단언한다.

describe('normalizeSearchParams', () => {
  it('[AC-SPRD-039] 값이 빈 파라미터는 키째 빼고 문자열은 trim한다', () => {
    const input: SellerProductSearchInput = {
      keyword: '  급식기  ',
      saleStatus: [],
      inspectionStatus: ['APPROVED'],
      createdFrom: '',
      createdTo: undefined,
      stock: undefined,
      sort: 'latest',
      // 0과 false는 "값이 없는 것"이 아니다 — page=0은 반드시 나가야 한다.
      page: 0,
      size: 20,
    }
    const params = normalizeSearchParams(input)

    expect(params).toEqual({
      keyword: '급식기',
      inspectionStatus: ['APPROVED'],
      sort: 'latest',
      page: 0,
      size: 20,
    })
    expect(Object.keys(params)).not.toContain('saleStatus')
    expect(Object.keys(params)).not.toContain('createdFrom')
    expect(Object.keys(params)).not.toContain('createdTo')
    expect(Object.keys(params)).not.toContain('stock')
  })

  it('[AC-SPRD-039b] 공백만 있는 키워드도 미적용으로 본다', () => {
    expect(normalizeSearchParams({ keyword: '   ', page: 0 })).toEqual({ page: 0 })
  })
})

describe('GET /sellers/me/products 쿼리 직렬화', () => {
  beforeEach(() => {
    seedSellerProducts([])
  })

  it('[AC-SPRD-040] 빈 값은 나가지 않고 배열은 반복 파라미터로 직렬화된다', async () => {
    const input: SellerProductSearchInput = {
      keyword: '',
      saleStatus: ['ON_SALE', 'SUSPENDED'],
      inspectionStatus: ['APPROVED', 'REJECTED'],
      createdFrom: '',
      stock: '',
      sort: 'price_desc',
      page: 0,
      size: 20,
    }
    await getSellerProducts(normalizeSearchParams(input))

    const raw = lastSellerProductsQuery()
    expect(raw).not.toBeNull()
    // 값이 빈 파라미터(`?stock=`)는 BE가 형식 오류(400/90001)로 거절한다 — 키째 빠졌어야 한다.
    expect(raw).not.toMatch(/(^|&)[^=&]+=(&|$)/)
    // axios 기본값(`saleStatus[]=A`)으로 나가면 BE 바인딩이 "지원하지 않는 값"으로 400을 준다.
    expect(raw).not.toContain('%5B%5D')

    const sent = new URLSearchParams(raw ?? '')
    expect(sent.getAll('saleStatus')).toEqual(['ON_SALE', 'SUSPENDED'])
    expect(sent.getAll('inspectionStatus')).toEqual(['APPROVED', 'REJECTED'])
    expect(sent.has('keyword')).toBe(false)
    expect(sent.has('createdFrom')).toBe(false)
    expect(sent.has('stock')).toBe(false)
    expect(sent.get('sort')).toBe('price_desc')
    expect(sent.get('page')).toBe('0')
  })
})

import { describe, it, expect } from 'vitest'
import { ALL_CATEGORY_LABEL, buildHomeFeed, filterRankingByCategory } from '../home.mock'

describe('buildHomeFeed', () => {
  it('[AC-HOME-001] 펫이 등록되면 펫 이름을, 미등록이면 null을 반환한다(1-A/1-B 분기)', () => {
    expect(buildHomeFeed(true).pet).toEqual({ name: '코코' })
    expect(buildHomeFeed(false).pet).toBeNull()
  })

  it('[AC-HOME-002] 인기 랭킹은 순위가 매겨지고 품절 상품도 포함된다', () => {
    const feed = buildHomeFeed()
    expect(feed.ranking.length).toBeGreaterThanOrEqual(2)
    expect(feed.ranking.map(r => r.rank)).toEqual(feed.ranking.map((_, i) => i + 1))
    expect(feed.ranking.some(r => r.product.isSoldOut)).toBe(true)
  })

  it('[AC-HOME-003] 프로모션 배너와 카테고리 칩이 제공된다', () => {
    const feed = buildHomeFeed()
    expect(feed.promo.badge).toBe('SALE')
    expect(feed.categoryChips.length).toBeGreaterThan(0)
  })

  it('[AC-HOME-010] 추천 캐러셀은 6~8개 판매중 상품을 큐레이션한다', () => {
    const feed = buildHomeFeed()
    expect(feed.recommended.length).toBeGreaterThanOrEqual(6)
    expect(feed.recommended.length).toBeLessThanOrEqual(8)
    // 큐레이션은 판매중 위주 — 품절 상품은 캐러셀 이동 불가라 제외한다.
    expect(feed.recommended.every(p => !p.isSoldOut)).toBe(true)
  })

  it('[AC-HOME-011] 추천 큐레이션은 인기 랭킹과 다른 별개 목록이다', () => {
    const feed = buildHomeFeed()
    const rankingIds = new Set(feed.ranking.map(r => r.product.id))
    // 추천에는 랭킹에 없는 상품도 섞여 있어 "추천 ≠ 인기 랭킹"임을 드러낸다.
    expect(feed.recommended.some(p => !rankingIds.has(p.id))).toBe(true)
  })

  it('[AC-HOME-012] 추천 캐러셀은 펫 등록 여부와 무관하게 항상 채워진다', () => {
    expect(buildHomeFeed(true).recommended.length).toBeGreaterThan(0)
    expect(buildHomeFeed(false).recommended.length).toBeGreaterThan(0)
  })
})

describe('filterRankingByCategory (홈 칩 인플레이스 필터)', () => {
  const ranking = buildHomeFeed().ranking

  it('[AC-HOME-004] 특정 카테고리를 선택하면 그 category의 랭킹만 남긴다', () => {
    const filtered = filterRankingByCategory(ranking, '위생/미용')
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every(item => item.product.category === '위생/미용')).toBe(true)
    // 다른 카테고리(사료/간식) 상품은 걸러진다
    expect(filtered.some(item => item.product.category === '사료/간식')).toBe(false)
  })

  it('[AC-HOME-005] 전체는 랭킹 전체를 그대로 반환한다', () => {
    expect(filterRankingByCategory(ranking, ALL_CATEGORY_LABEL)).toEqual(ranking)
  })

  it('[AC-HOME-006] 매칭 랭킹이 없는 카테고리는 빈 배열을 반환한다(빈 안내 조건)', () => {
    // 산책용품은 인기 랭킹에 포함된 상품이 없어 빈 결과 → 화면은 빈 안내로 방어한다
    expect(filterRankingByCategory(ranking, '산책용품')).toHaveLength(0)
  })

  it('[AC-HOME-007] 전체를 제외한 모든 칩이 최소 1개의 인기 상품을 가진다(빈 화면 방지)', () => {
    const chips = buildHomeFeed().categoryChips.filter(chip => chip.label !== ALL_CATEGORY_LABEL)
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(filterRankingByCategory(ranking, chip.label).length).toBeGreaterThanOrEqual(1)
    }
  })
})

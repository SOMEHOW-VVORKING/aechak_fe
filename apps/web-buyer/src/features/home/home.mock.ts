import { productsByIds, type CatalogProduct } from '@/shared/catalog'

export interface HomeCategoryChip {
  key: string
  label: string
}

export interface HomePromoBanner {
  badge: string
  title: string
  period: string
  tone: number
}

export interface HomeRankingItem {
  rank: number
  product: CatalogProduct
}

export interface HomeFeed {
  // 펫 등록 상태 분기용 — 등록됐으면 이름(코코), 미등록이면 null(펫 등록 유도 CTA 노출).
  pet: { name: string } | null
  categoryChips: HomeCategoryChip[]
  promo: HomePromoBanner
  // 비개인화 큐레이션 추천("이런 상품은 어때요?") — SALE 배너 아래 가로 캐러셀. 원래 자리(AI 추천)를
  // 컷하면서 홈이 휑해져 그 자리를 채우는 비개인화 상품 스트립. AI/펫 이름과 무관.
  recommended: CatalogProduct[]
  ranking: HomeRankingItem[]
}

const CATEGORY_CHIPS: HomeCategoryChip[] = [
  { key: 'all', label: '전체' },
  { key: 'food', label: '사료/간식' },
  { key: 'toy', label: '장난감' },
  { key: 'grooming', label: '위생/미용' },
  { key: 'health', label: '건강/영양제' },
]

const PROMO: HomePromoBanner = {
  badge: 'SALE',
  title: '여름맞이 시원 케어 최대 40% 기획전',
  period: '6/13 – 6/20 한정',
  tone: 30,
}

// 인기 랭킹 — 리뷰 수(인기) 기준 상위 상품. 품절 상품(스크래쳐)도 노출하되 품절 표기.
// 홈 상단 칩이 인플레이스 필터가 되면서, '전체' 외 4개 칩(사료/간식·장난감·위생/미용·건강/영양제)이
// 각각 최소 1개씩 걸리도록 노즈워크 장난감(p-nose-toy)을 랭킹에 포함시켰다 — 흔한 칩이 빈 화면으로
// 보이지 않게 하기 위함(그래도 매칭 0개일 때 빈 안내는 방어책으로 유지). 스크래쳐(침구/하우스)는
// 어떤 칩에도 안 걸려 '전체'에서만 보인다.
const RANKING_IDS = ['p-litter-85', 'p-scratcher', 'p-churu', 'p-joint-90', 'p-salmon-food', 'p-nose-toy']

// 추천 캐러셀 큐레이션 — 비개인화. 인기(리뷰 많음)/세일 상품을 섞되 판매중만 뽑는다(품절 상품은
// 캐러셀 이동 불가라 큐레이션에서 제외). RANKING_IDS와 의도적으로 겹치지 않게 골라 "추천"이
// 아래 "인기 랭킹"과 다른 별개 큐레이션임을 화면에서 드러내고(중복 노출 방지), 다양한 카테고리를
// 섞는다. 순서 = 노출 순서. p-feeder-5l(리뷰 1204·세일)은 인기+세일 대표 상품.
const RECOMMENDED_IDS = [
  'p-feeder-5l',
  'p-coolmat',
  'p-feeder-6l',
  'p-dental',
  'p-leash-5m',
  'p-raincoat',
  'p-harness-y',
  'p-cattower',
]

// 홈 칩 인플레이스 필터의 단일 원본 — 선택 칩의 category(서브카테고리) 라벨과 정확히 일치하는
// 랭킹만 남긴다. '전체'는 필터 없음. 별도 매핑 테이블 없이 상품 자신의 category를 그대로 본다.
export const ALL_CATEGORY_LABEL = '전체'

export function filterRankingByCategory(
  ranking: HomeRankingItem[],
  categoryLabel: string,
): HomeRankingItem[] {
  if (categoryLabel === ALL_CATEGORY_LABEL) return ranking
  return ranking.filter(item => item.product.category === categoryLabel)
}

// 개인화(AI) 추천은 OFF — 펫 등록 상태만 1-A/1-B로 분기한다. 대신 비개인화 추천 캐러셀
// (recommended)을 항상 채워 두 상태 모두에서 홈을 채운다.
export function buildHomeFeed(petRegistered = true): HomeFeed {
  return {
    pet: petRegistered ? { name: '코코' } : null,
    categoryChips: CATEGORY_CHIPS,
    promo: PROMO,
    recommended: productsByIds(RECOMMENDED_IDS),
    ranking: productsByIds(RANKING_IDS).map((product, i) => ({ rank: i + 1, product })),
  }
}

export function fetchHomeFeed(petRegistered = true): Promise<HomeFeed> {
  return new Promise(resolve => {
    setTimeout(() => resolve(buildHomeFeed(petRegistered)), 300)
  })
}

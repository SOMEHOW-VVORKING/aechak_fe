import { test, expect, type Page, type Route } from '@playwright/test'
import { stubMemberSession } from './session'

// 검색 입력·최근검색어(b3-st-2) + 결과·필터(b3-st-3) ↔ 실 API 연동 E2E. 실백엔드 없이 page.route
// 스텁으로 서버 계약을 재현한다(마켓 spec과 동일한 CORS/프리플라이트 규칙 — 페이지 5175 → API 8080이
// 교차 출처 + withCredentials라 fulfill 응답에도 정확한 origin의 CORS 헤더가 필요하다). 각 상태에서
// page.screenshot으로 PR 첨부용 캡처를 test-results/pr-c(gitignore)에 남긴다.

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,DELETE', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

const RECENT_KEYWORDS = [
  { id: 1, keyword: '자동 급식기', searchedAt: '2026-08-06T09:00:00' },
  { id: 2, keyword: '고양이 모래', searchedAt: '2026-08-05T09:00:00' },
  { id: 3, keyword: '츄르', searchedAt: '2026-08-04T09:00:00' },
]
const RECOMMENDED_KEYWORDS = [{ keyword: '여름 쿨매트' }, { keyword: '덴탈껌' }, { keyword: '대용량 사료' }]

function keywordsEnvelope(recent: typeof RECENT_KEYWORDS) {
  return { data: { recentKeywords: recent, recommendedKeywords: RECOMMENDED_KEYWORDS } }
}

// 카테고리 트리(대분류 2 + 중분류). 중분류 이름은 트리 안에서 유일하게 둬 테스트에서 칩을 명확히 고른다.
const CATEGORIES = {
  data: [
    {
      categoryId: 1,
      name: '강아지',
      iconUrl: null,
      sortOrder: 1,
      children: [
        { categoryId: 11, name: '사료/간식', iconUrl: null, sortOrder: 1, children: [] },
        { categoryId: 12, name: '산책용품', iconUrl: null, sortOrder: 2, children: [] },
      ],
    },
    {
      categoryId: 2,
      name: '고양이',
      iconUrl: null,
      sortOrder: 2,
      children: [
        { categoryId: 21, name: '모래/위생', iconUrl: null, sortOrder: 1, children: [] },
        { categoryId: 22, name: '캣타워', iconUrl: null, sortOrder: 2, children: [] },
      ],
    },
  ],
}

function product(productId: string, name: string, price: number) {
  return {
    productId,
    name,
    sellerName: '리얼상점',
    thumbnailImageKey: null,
    regularPrice: price,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: 4.6,
    reviewCount: 24,
    // ProductSummaryResponse의 필수 필드(SCRUM-190). 빼면 서버가 절대 주지 않는 응답을 흉내내게
    // 된다 — e2e/는 tsc include 밖이라 손으로 맞출 것.
    isLiked: false,
    isViewable: true,
    isPurchasable: true,
  }
}

// 무결과(3-C) 화면의 추천 검색어는 서버 추천어(RECOMMENDED_KEYWORDS)에서 온다. 그중 결과가 걸리는
// 것 하나를 골라, 칩을 눌러 재검색이 검색창을 동기화하고 새 결과를 부르는지(3-C → 3-A) 검증한다.
const SUGGESTED_QUERY = '대용량 사료'

// keyword로 결과 유무를 가른다 — '사료'(추천어 재검색 포함)는 결과 있음(3-A), 그 외는 빈 결과(3-C).
const SEARCH_HITS = [
  product('p-search-1', '강아지 연어 사료 2kg', 28000),
  product('p-search-2', '고양이 그레인프리 사료 5kg', 42000),
  product('p-search-3', '대형견 대용량 사료 15kg', 68000),
  product('p-search-4', '유기농 오리 사료 1.5kg', 21000),
]
// 상품 -> 중분류 categoryId. 카테고리 필터가 결과를 실제로 좁히는지 검증하는 데 쓴다.
const CATEGORY_OF: Record<string, number> = {
  'p-search-1': 11,
  'p-search-2': 21,
  'p-search-3': 11,
  'p-search-4': 11,
}

function stubProducts(route: Route) {
  const params = new URL(route.request().url()).searchParams
  const keyword = params.get('keyword') ?? ''
  const category = params.get('category')
  let hits = keyword.includes('사료') ? SEARCH_HITS : []
  if (category) hits = hits.filter(p => CATEGORY_OF[p.productId] === Number(category))
  return fulfillJson(route, 200, {
    data: { products: hits, totalCount: hits.length, nextCursor: null, hasNext: false },
  })
}

test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
  // 결과 화면의 카테고리 필터가 조회하는 /categories(로그인 사용자 전용). 결과 화면 진입 시 항상 발사된다.
  await page.route('**/api/v1/categories', route => fulfillJson(route, 200, CATEGORIES))
})

test('[AC-SEARCH-E2E-001] 최근·추천 검색어(2-A)를 렌더하고, 없을 때(2-B) 빈 상태를 보여준다', async ({ page }) => {
  // 2-A: 최근 검색어 있음.
  await page.route('**/api/v1/search/keywords', route => fulfillJson(route, 200, keywordsEnvelope(RECENT_KEYWORDS)))
  await page.goto('/search')
  await expect(page.getByText('최근 검색어')).toBeVisible()
  await expect(page.getByRole('button', { name: '자동 급식기', exact: true })).toBeVisible()
  await expect(page.getByText('추천 검색어')).toBeVisible()
  await expect(page.getByRole('button', { name: '여름 쿨매트' })).toBeVisible()
  await shot(page, `${SHOTS}/01-search-recent.png`)

  // 2-B: 최근 검색어 없음 — 빈 상태 카드.
  await page.route('**/api/v1/search/keywords', route => fulfillJson(route, 200, keywordsEnvelope([])))
  await page.goto('/search')
  await expect(page.getByText('최근 검색한 상품이 여기에 표시돼요')).toBeVisible()
  await shot(page, `${SHOTS}/02-search-empty.png`)
})

test('[AC-SEARCH-E2E-002] 결과 그리드(3-A)·필터 시트(3-B)와 카테고리 필터 적용을 보여준다', async ({ page }) => {
  await page.route('**/api/v1/search/products*', stubProducts)

  // 3-A: 결과 그리드 + 결과 수.
  await page.goto('/search/results?q=사료')
  await expect(page.getByText('강아지 연어 사료 2kg')).toBeVisible()
  await expect(page.getByText('고양이 그레인프리 사료 5kg')).toBeVisible()
  await expect(page.getByText('대형견 대용량 사료 15kg')).toBeVisible()
  // 결과 수 라벨(헤더 "N개")이 stub이 반환한 SEARCH_HITS 개수(4)와 일치한다.
  await expect(page.getByText('4개')).toBeVisible()
  await shot(page, `${SHOTS}/03-results-grid.png`)

  // 3-B: 필터 시트 열림 — 가격대·카테고리 섹션.
  await page.getByRole('button', { name: '필터' }).click()
  await expect(page.getByText('가격대')).toBeVisible()
  await expect(page.getByText('카테고리')).toBeVisible()
  await expect(page.getByRole('button', { name: '사료/간식' })).toBeVisible()
  await shot(page, `${SHOTS}/04-filter-sheet.png`)

  // 카테고리(강아지 > 사료/간식, id 11)를 골라 적용하면 고양이 상품이 걸러진다.
  await page.getByRole('button', { name: '사료/간식' }).click()
  await page.getByRole('button', { name: '결과 보기' }).click()
  await expect(page.getByText('고양이 그레인프리 사료 5kg')).toHaveCount(0)
  await expect(page.getByText('강아지 연어 사료 2kg')).toBeVisible()
})

test('[AC-SEARCH-E2E-003] 결과 없음(3-C)에 빈 상태와 추천 검색어를 보여준다', async ({ page }) => {
  await page.route('**/api/v1/search/products*', stubProducts)
  // 추천 칩의 출처 — 무결과일 때 결과 화면이 /search/keywords를 조회한다(하드코딩 칩을 걷어낸 자리).
  await page.route('**/api/v1/search/keywords', route =>
    fulfillJson(route, 200, keywordsEnvelope(RECENT_KEYWORDS)),
  )

  await page.goto('/search/results?q=없는키워드')
  await expect(page.getByText('검색 결과가 없어요')).toBeVisible()
  await expect(page.getByText('이런 검색어는 어때요?')).toBeVisible()
  await shot(page, `${SHOTS}/05-no-results.png`)

  // 추천 검색어 칩을 눌러 같은 라우트로 재검색하면, 검색창이 새 키워드로 동기화되고(3-C의
  // useEffect(setDraftQuery,[query])) 결과가 다시 로드된다(3-C → 3-A).
  await page.getByRole('button', { name: SUGGESTED_QUERY }).click()
  await expect(page.getByPlaceholder('상품, 브랜드 검색')).toHaveValue(SUGGESTED_QUERY)
  await expect(page.getByText('강아지 연어 사료 2kg')).toBeVisible()
  await shot(page, `${SHOTS}/06-research.png`)
})

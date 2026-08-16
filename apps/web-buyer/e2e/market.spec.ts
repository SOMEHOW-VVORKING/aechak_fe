import { test, expect, type Route } from '@playwright/test'

// 마켓(카테고리 트리 + 상품 목록) ↔ 실 API 연동 E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을
// 재현한다 — 페이지(5175) → API(8080)가 교차 출처 + withCredentials라 fulfill 응답에도 정확한
// origin의 CORS 헤더가 필요하다(와일드카드 불가).

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

const CATEGORIES = {
  data: [
    {
      categoryId: 1,
      name: '강아지',
      iconUrl: null,
      sortOrder: 1,
      children: [{ categoryId: 11, name: '사료/간식', iconUrl: null, sortOrder: 1, children: [] }],
    },
    {
      categoryId: 2,
      name: '고양이',
      iconUrl: null,
      sortOrder: 2,
      children: [{ categoryId: 21, name: '위생/미용', iconUrl: null, sortOrder: 1, children: [] }],
    },
  ],
}

function product(productId: string, name: string) {
  return {
    productId,
    name,
    sellerName: '리얼상점',
    thumbnailImageKey: null,
    regularPrice: 20000,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: 4.5,
    reviewCount: 10,
    // ProductSummaryResponse의 필수 필드(SCRUM-190). 빼면 서버가 절대 주지 않는 응답을 흉내내게
    // 된다 — e2e/는 tsc include 밖이라 손으로 맞출 것.
    isLiked: false,
    isViewable: true,
    isPurchasable: true,
  }
}

// 카테고리별 상품(서버 category.id==it OR parent.id==it 흉내). 11=강아지 사료, 21=고양이 위생.
const BY_CATEGORY: Record<string, ReturnType<typeof product>[]> = {
  '': [product('e-dog-1', '강아지 연어 사료 2kg'), product('e-cat-1', '벤토나이트 고양이 모래 8.5L')],
  '1': [product('e-dog-1', '강아지 연어 사료 2kg')],
  '11': [product('e-dog-1', '강아지 연어 사료 2kg')],
  '2': [product('e-cat-1', '벤토나이트 고양이 모래 8.5L')],
  '21': [product('e-cat-1', '벤토나이트 고양이 모래 8.5L')],
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/categories', route => fulfillJson(route, 200, CATEGORIES))
  await page.route('**/api/v1/products?*', route => {
    const category = new URL(route.request().url()).searchParams.get('category') ?? ''
    const products = BY_CATEGORY[category] ?? []
    return fulfillJson(route, 200, { data: { products, totalCount: products.length, nextCursor: null, hasNext: false } })
  })
})

test('[AC-MARKET-E2E-001] 마켓은 실 API 상품을 보여주고 대분류 전환 시 결과가 걸러진다', async ({ page }) => {
  await page.goto('/market')

  // 전체(필터 없음) — 강아지/고양이 상품이 함께 보인다.
  await expect(page.getByText('강아지 연어 사료 2kg')).toBeVisible()
  await expect(page.getByText('벤토나이트 고양이 모래 8.5L')).toBeVisible()

  // 고양이 대분류로 전환하면 고양이 상품만 남는다. exact 필수 — 비exact 매칭은 상품 카드의
  // stretched 버튼 aria-label('벤토나이트 고양이 모래 8.5L 상세 보기')까지 잡아 strict mode 위반.
  await page.getByRole('button', { name: '고양이', exact: true }).click()
  await expect(page.getByText('벤토나이트 고양이 모래 8.5L')).toBeVisible()
  await expect(page.getByText('강아지 연어 사료 2kg')).toHaveCount(0)
})

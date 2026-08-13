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
  }
}

// 카테고리별 상품(서버 category.id==it OR parent.id==it 흉내). 2=고양이 대분류, 21=고양이 위생/미용.
// 대분류(2)는 고양이 상품 2개를 주고, 하위 중분류(21)는 그 중 1개만 주는 엄격한 부분집합이라 중분류
// 필터가 실제로 결과를 좁히는지 검증할 수 있다. 강아지 서브(11 등)는 어떤 테스트도 클릭하지 않아
// 픽스처를 두지 않는다(죽은 픽스처 제거).
const BY_CATEGORY: Record<string, ReturnType<typeof product>[]> = {
  '': [
    product('e-dog-1', '강아지 연어 사료 2kg'),
    product('e-cat-1', '벤토나이트 고양이 모래 8.5L'),
    product('e-cat-2', '고양이 통살 캔 30개입'),
  ],
  '2': [product('e-cat-1', '벤토나이트 고양이 모래 8.5L'), product('e-cat-2', '고양이 통살 캔 30개입')],
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

test('[AC-MARKET-E2E-002] 중분류(위생/미용) 서브타일을 고르면 category=21로 결과가 부분집합으로 좁혀진다', async ({ page }) => {
  await page.goto('/market')

  // 고양이 대분류(category=2)로 전환하면 고양이 상품 2개가 함께 보인다(중분류 그리드도 함께 펼쳐진다).
  // exact 필수 — 비exact 매칭은 상품 카드 stretched 버튼의 aria-label까지 잡아 strict mode 위반.
  await page.getByRole('button', { name: '고양이', exact: true }).click()
  await expect(page.getByText('벤토나이트 고양이 모래 8.5L')).toBeVisible()
  await expect(page.getByText('고양이 통살 캔 30개입')).toBeVisible()

  // 위생/미용 서브타일을 누르면 category=21 요청이 실제로 발사된다(정말 서버에서 좁히는지 확인).
  // 서브타일 accessible name은 catalog-route.test.tsx의 '위생/미용' 버튼 클릭 방식과 동일하게 라벨로 잡는다.
  const subResponse = page.waitForResponse(
    res => res.request().method() === 'GET' && /\/api\/v1\/products\?.*category=21/.test(res.url()),
  )
  await page.getByRole('button', { name: '위생/미용' }).click()
  await subResponse

  // 부분집합(벤토나이트 1개)만 남고 다른 고양이 상품(통살 캔)은 사라진다.
  await expect(page.getByText('벤토나이트 고양이 모래 8.5L')).toBeVisible()
  await expect(page.getByText('고양이 통살 캔 30개입')).toHaveCount(0)
})

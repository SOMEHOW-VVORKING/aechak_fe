import { test, expect, type Route } from '@playwright/test'

// 상품 상세 + 옵션 ↔ 실 API 연동 E2E. 실백엔드 없이 page.route 스텁으로 재현한다(마켓 spec과 동일한
// CORS/프리플라이트 규칙). 옵션 조합 추가금이 시트 총액에 반영되는지까지 검증한다.

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

const REAL_ID = '01J000000000000000000TEST'

const DETAIL = {
  data: {
    productId: REAL_ID,
    name: '리얼 프리미엄 자동 급식기',
    description: '앱으로 급여 시간을 관리하는 실데이터 급식기예요.',
    representativeImageKey: null,
    images: [],
    regularPrice: 89000,
    discountPrice: 64000,
    discountRate: 28,
    saleStatus: 'ON_SALE',
    shipping: { baseShippingFee: 3000, freeShippingThreshold: 50000 },
    seller: { storeName: '리얼상점', profileImageKey: null },
    review: { reviewCount: 128, averageRating: 4.7 },
    categories: [
      { categoryId: 1, name: '강아지', depth: 1 },
      { categoryId: 11, name: '사료/간식', depth: 2 },
    ],
    isLiked: false,
  },
}

const OPTIONS = {
  data: {
    optionGroups: [],
    optionCombinations: [
      { optionCombinationId: 1, name: '기본형', additionalPrice: 0, optionValueIds: [1], remainingStock: 10, soldOut: false },
      { optionCombinationId: 2, name: '프리미엄형', additionalPrice: 5000, optionValueIds: [2], remainingStock: 5, soldOut: false },
    ],
  },
}

test('[AC-PRODUCT-E2E-001] 실 ULID 상세를 렌더하고 옵션 추가금이 총액에 반영된다', async ({ page }) => {
  await page.route(`**/api/v1/products/${REAL_ID}/options`, route => fulfillJson(route, 200, OPTIONS))
  await page.route(`**/api/v1/products/${REAL_ID}`, route => fulfillJson(route, 200, DETAIL))

  await page.goto(`/products/${REAL_ID}`)
  await expect(page.getByRole('heading', { name: '리얼 프리미엄 자동 급식기' })).toBeVisible()

  // 옵션 시트 → 프리미엄형(+5,000원) 선택 시 기본가 64,000 + 5,000 = 69,000원
  await page.getByRole('button', { name: '장바구니', exact: true }).click()
  await page.getByRole('combobox').selectOption('프리미엄형')
  await expect(page.getByText('69,000원')).toBeVisible()
})

test('[AC-PRODUCT-E2E-002] 존재하지 않는 상품(404)은 not-found 상태를 렌더한다', async ({ page }) => {
  // 실 API가 404 → 화면이 목업 폴백을 시도하고, 목업에도 없으면 not-found.
  await page.route('**/api/v1/products/*/options', route => fulfillJson(route, 404, { message: 'not found' }))
  await page.route('**/api/v1/products/*', route => fulfillJson(route, 404, { message: 'not found' }))

  await page.goto('/products/01JNONEXISTENT00000000000')
  await expect(page.getByText('상품을 찾을 수 없어요')).toBeVisible()
})

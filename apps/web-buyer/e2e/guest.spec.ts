import { test, expect, type Route } from '@playwright/test'
import { stubGuestSession } from './session'

// 비회원 열람 ↔ BE 게스트 카탈로그(permitAll) E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을
// 재현한다(마켓 spec과 동일한 CORS/프리플라이트 규칙).
//
// 지키는 것: 비회원이 열 수 있는 화면은 permitAll 목록(GET /products, /products/*,
// /products/*/options, /search/products, /sns/users/*)이 기준이고, 회원 전용 화면은 막되
// "로그인이 필요해요"가 뜻이 통하게 떠야 한다. 예전에는 로그인 여부 기본값이 true라
// 비회원도 회원 전용 API를 불러 401 → 전역 리다이렉트로 마켓·검색에서 쫓겨났다.

const ORIGIN = 'http://localhost:5175'
const API_ORIGIN = 'http://localhost:8080'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const REAL_ID = '01J000000000000000000TEST'

function fulfillJson(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return route.fulfill({ status, headers: CORS, json })
}

// ProductSummaryResponse — e2e/는 tsc include 밖이라 필수 필드를 손으로 맞춘다.
const LIST = {
  data: {
    products: [
      {
        productId: REAL_ID,
        name: '리얼 프리미엄 자동 급식기',
        sellerName: '리얼상점',
        thumbnailImageKey: null,
        regularPrice: 89000,
        discountPrice: 64000,
        discountRate: 28,
        saleStatus: 'ON_SALE',
        reviewCount: 128,
        averageRating: 4.7,
        isLiked: false,
        isViewable: true,
      },
    ],
    totalCount: 1,
    nextCursor: null,
    hasNext: false,
  },
}

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
    // 리뷰가 있는 상품이어야 미리보기 칸이 그려진다 — 예전엔 여기서 스켈레톤 3장이 영구히 남았다.
    review: { reviewCount: 128, averageRating: 4.7 },
    categories: [{ categoryId: 1, name: '강아지', depth: 1 }],
    isLiked: false,
    isPurchasable: true,
  },
}

test.beforeEach(async ({ page }) => {
  await stubGuestSession(page)
  await page.route('**/api/v1/products?*', route => fulfillJson(route, 200, LIST))
})

test('[AC-GUEST-E2E-001] 비회원이 마켓에서 상품을 보고 로그인 화면으로 튕기지 않는다', async ({
  page,
}) => {
  // 회원 전용 경로가 한 건이라도 나가면 401 → refresh 실패 → 전역 리다이렉트로 마켓을 잃는다.
  const memberCalls: string[] = []
  for (const path of ['categories', 'carts', 'home']) {
    await page.route(`${API_ORIGIN}/api/v1/${path}*`, route => {
      if (route.request().method() !== 'OPTIONS') memberCalls.push(path)
      return fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' })
    })
  }

  await page.goto('/market')

  await expect(page.getByText('리얼 프리미엄 자동 급식기')).toBeVisible()
  await expect(page).toHaveURL(`${ORIGIN}/market`)
  // 카테고리 트리(인증 필요)는 조회하지 않으므로 대분류 칩은 전체만 남는다.
  await expect(page.getByRole('button', { name: '전체' })).toBeVisible()
  expect(memberCalls).toEqual([])
})

test('[AC-GUEST-E2E-002] 비회원 상품 상세는 본문을 끝까지 보여주고 리뷰 칸에 사유를 적는다', async ({
  page,
}) => {
  let reviewCalls = 0
  await page.route(`**/api/v1/products/${REAL_ID}/reviews*`, route => {
    reviewCalls += 1
    return fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' })
  })
  await page.route(`**/api/v1/products/${REAL_ID}`, route => fulfillJson(route, 200, DETAIL))

  await page.goto(`/products/${REAL_ID}`)

  await expect(page.getByText('앱으로 급여 시간을 관리하는 실데이터 급식기예요.')).toBeVisible()
  await expect(page.getByText('리뷰 128', { exact: true })).toBeVisible()
  // 스켈레톤이 영구히 남는 대신 왜 비었는지 적는다.
  await expect(page.getByText('리뷰를 보려면 로그인이 필요해요.')).toBeVisible()
  expect(reviewCalls).toBe(0)
})

test('[AC-GUEST-E2E-003] 비회원이 장바구니로 가면 로그인 안내가 뜨고 장바구니를 조회하지 않는다', async ({
  page,
}) => {
  let cartCalls = 0
  await page.route(`${API_ORIGIN}/api/v1/carts*`, route => {
    if (route.request().method() !== 'OPTIONS') cartCalls += 1
    return fulfillJson(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' })
  })

  await page.goto('/cart')

  await expect(page.getByText('로그인이 필요해요')).toBeVisible()
  await expect(page.getByText('장바구니는 로그인한 회원만 볼 수 있어요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '로그인 / 회원가입' })).toBeVisible()
  expect(cartCalls).toBe(0)

  // 막힌 자리에서 끝나지 않고 비회원이 볼 수 있는 화면으로 돌아갈 길이 있다.
  await page.getByRole('button', { name: '상품 둘러보기' }).click()
  await expect(page).toHaveURL(`${ORIGIN}/market`)
})

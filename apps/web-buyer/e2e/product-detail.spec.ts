import { test, expect, type Route } from '@playwright/test'
import { stubMemberSession } from './session'

// 리뷰 AI 요약은 api 호스트로만 나가야 해서 origin까지 적어 호스트를 가른다
const API_ORIGIN = 'http://localhost:8080'

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
    // ProductDetailResponse의 필수 필드(SCRUM-190) — e2e/는 tsc include 밖이라 손으로 맞출 것.
    isLiked: false,
    isPurchasable: true,
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

// 상세가 함께 부르는 리뷰 미리보기도 스텁한다 — 로컬 8080에 실 BE가 떠 있으면 비로그인 401 → refresh 실패 →
// 로그인 화면으로 튕겨 상세 단언이 깨진다(CI처럼 BE가 없으면 네트워크 오류로 조용히 끝나 드러나지 않는다).
const EMPTY_REVIEWS = {
  data: { summary: null, reviews: [], totalCount: 0, nextCursor: null, hasNext: false },
}
// 리뷰 AI 요약도 같은 이유(JWT 필수)로 스텁한다.
const NO_AI_SUMMARY = { data: { productSummary: null, similarPetSummary: null } }

// 회원 세션 전제 — 첫 진입 세션 확인(refresh)을 스텁하지 않으면 로그인 상태로 조건 건 조회가 안 나간다.
test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
})

test('[AC-PRODUCT-E2E-001] 실 ULID 상세를 렌더하고 옵션 추가금이 총액에 반영된다', async ({ page }) => {
  await page.route(`**/api/v1/products/${REAL_ID}/reviews*`, route => fulfillJson(route, 200, EMPTY_REVIEWS))
  await page.route(`${API_ORIGIN}/api/v1/products/${REAL_ID}/review-summary`, route => fulfillJson(route, 200, NO_AI_SUMMARY))
  await page.route(`**/api/v1/products/${REAL_ID}/options`, route => fulfillJson(route, 200, OPTIONS))
  await page.route(`**/api/v1/products/${REAL_ID}`, route => fulfillJson(route, 200, DETAIL))

  await page.goto(`/products/${REAL_ID}`)
  await expect(page.getByRole('heading', { name: '리얼 프리미엄 자동 급식기' })).toBeVisible()

  // 옵션 시트 → 프리미엄형(+5,000원) 선택 시 기본가 64,000 + 5,000 = 69,000원
  await page.getByRole('button', { name: '장바구니', exact: true }).click()
  await page.getByRole('combobox').selectOption('프리미엄형')
  await expect(page.getByText('69,000원')).toBeVisible()
})

test('[AC-PRODUCT-E2E-004] 리뷰 AI 요약 응답을 봉투째 읽어 카드를 그린다', async ({ page }) => {
  const aiSummary = {
    data: {
      productSummary: {
        analyzedReviewCount: 37,
        pros: [{ aspectCode: 'PALATABILITY', headline: '잘 먹는다는 평이 많아요.', mentionCount: 21, quotes: ['그릇을 싹 비웠어요.'] }],
        cons: [],
        consAbsenceReason: 'BELOW_MENTION_THRESHOLD',
        generatedAt: '2026-10-28T12:00:00',
      },
      similarPetSummary: null,
    },
  }
  await page.route(`**/api/v1/products/${REAL_ID}/reviews*`, route => fulfillJson(route, 200, EMPTY_REVIEWS))
  await page.route(`${API_ORIGIN}/api/v1/products/${REAL_ID}/review-summary`, route => fulfillJson(route, 200, aiSummary))
  await page.route(`**/api/v1/products/${REAL_ID}/options`, route => fulfillJson(route, 200, OPTIONS))
  await page.route(`**/api/v1/products/${REAL_ID}`, route => fulfillJson(route, 200, DETAIL))

  await page.goto(`/products/${REAL_ID}`)

  await expect(page.getByRole('heading', { name: 'AI 리뷰 요약' })).toBeVisible()
  await expect(page.getByText('잘 먹는다는 평이 많아요.')).toBeVisible()
  await expect(page.getByText('리뷰 21건')).toBeVisible()
  await expect(page.getByText('여러 명이 공통으로 말한 아쉬운 점은 아직 없어요.')).toBeVisible()
})

test('[AC-PRODUCT-E2E-003] 옵션 시트 수량 조절이 총액/재고 경계에 반영되고 옵션 변경 시 리셋된다', async ({ page }) => {
  await page.route(`**/api/v1/products/${REAL_ID}/reviews*`, route => fulfillJson(route, 200, EMPTY_REVIEWS))
  await page.route(`${API_ORIGIN}/api/v1/products/${REAL_ID}/review-summary`, route => fulfillJson(route, 200, NO_AI_SUMMARY))
  await page.route(`**/api/v1/products/${REAL_ID}/options`, route => fulfillJson(route, 200, OPTIONS))
  await page.route(`**/api/v1/products/${REAL_ID}`, route => fulfillJson(route, 200, DETAIL))

  await page.goto(`/products/${REAL_ID}`)
  await expect(page.getByRole('heading', { name: '리얼 프리미엄 자동 급식기' })).toBeVisible()

  // 옵션 시트 → 프리미엄형(+5,000원, remainingStock 5) 선택
  await page.getByRole('button', { name: '장바구니', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('combobox').selectOption('프리미엄형')
  await expect(sheet.getByText('69,000원')).toBeVisible()

  // 수량 +로 2개 → (64,000 + 5,000) * 2 = 138,000원
  const increase = sheet.getByRole('button', { name: '증가' })
  await increase.click()
  await expect(sheet.getByText('138,000원')).toBeVisible()

  // 재고 경계 — remainingStock 5까지 올리면 + 버튼이 disabled
  await increase.click() // 3
  await increase.click() // 4
  await increase.click() // 5
  await expect(increase).toBeDisabled()

  // 옵션 변경 리셋 — 기본형(+0)으로 바꾸면 수량이 1로 리셋되어 64,000원
  await sheet.getByRole('combobox').selectOption('기본형')
  await expect(sheet.getByText('64,000원')).toBeVisible()
})

test('[AC-PRODUCT-E2E-002] 존재하지 않는 상품(404)은 not-found 상태를 렌더한다', async ({ page }) => {
  // 실 API가 404 → 화면이 목업 폴백을 시도하고, 목업에도 없으면 not-found.
  // 옵션 스텁은 두지 않는다 — not-found면 하단 액션바(ActionBar)가 렌더되지 않아 옵션 시트를
  // 열 수 없고, useProductOptions는 시트를 열 때만(enabled: sheetOpen) 발사되므로 옵션 요청
  // 자체가 나가지 않는다(죽은 스텁 제거).
  await page.route('**/api/v1/products/*', route => fulfillJson(route, 404, { message: 'not found' }))

  await page.goto('/products/01JNONEXISTENT00000000000')
  await expect(page.getByText('상품을 찾을 수 없어요')).toBeVisible()
})

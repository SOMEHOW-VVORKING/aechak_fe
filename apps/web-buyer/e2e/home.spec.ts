import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  HomeResponse,
  ProductDetailEnvelope,
  ProductSummaryResponse,
  ReviewListEnvelope,
} from '@aechak/api'

// 리뷰 AI 요약은 api 호스트로만 나가야 해서 origin까지 적어 호스트를 가른다
const API_ORIGIN = 'http://localhost:8080'

// 홈(b1-st-1) ↔ GET /home(BE SCRUM-155) 연동 E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을
// 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수).
// page.screenshot으로 PR 첨부용 캡처를 test-results/pr-c(gitignore)에 남긴다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

// 생성 타입을 쓴다 — e2e는 tsc include 밖이라 로컬 인터페이스면 서버 계약 변경을 못 잡는다.
function card(
  productId: string,
  name: string,
  overrides: Partial<ProductSummaryResponse> = {},
): ProductSummaryResponse {
  const saleStatus = overrides.saleStatus ?? 'ON_SALE'
  return {
    productId,
    name,
    sellerName: '애착상점',
    thumbnailImageKey: null,
    regularPrice: 20000,
    discountPrice: null,
    discountRate: null,
    saleStatus,
    averageRating: 4.6,
    reviewCount: 30,
    isViewable: true,
    isPurchasable: saleStatus === 'ON_SALE',
    isLiked: false,
    ...overrides,
  }
}

// BE 계약: recommended는 판매중만 최대 8개, ranking은 품절 포함 상위 최대 5개(리뷰 수>찜 수>최신).
const HOME: HomeResponse = {
  data: {
    recommended: [
      card('01JHOMEREC0000000000000001', '여름 쿨매트 젤 방석 L', { regularPrice: 39000, discountPrice: 29000, discountRate: 26 }),
      card('01JHOMEREC0000000000000002', '자동 급식기 5L 스마트', { isLiked: true }),
      card('01JHOMEREC0000000000000003', '고양이 덴탈껌 30개입'),
    ],
    ranking: [
      card('01JHOMERANK000000000000001', '대용량 모래 8.5L 벤토나이트', { reviewCount: 320 }),
      card('01JHOMERANK000000000000002', '스크래쳐 하우스 2종 세트', { reviewCount: 210, saleStatus: 'OUT_OF_STOCK' }),
      card('01JHOMERANK000000000000003', '츄르 참치맛 40개입', { reviewCount: 180 }),
      card('01JHOMERANK000000000000004', '관절 영양제 코코넛맛 90정', { reviewCount: 95 }),
      card('01JHOMERANK000000000000005', '강아지 사료 연어 2kg', { reviewCount: 40 }),
    ],
  },
}

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

// 새 페이지 로드는 메모리 access가 없어 홈 가드가 refresh 쿠키로 세션부터 복원한다. 회원 시나리오는
// refresh 성공을 스텁한다(안 막으면 실서버로 새어 백엔드 유무에 따라 결과가 갈린다).
async function stubSession(page: Page) {
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } }),
  )
}

async function stubHome(page: Page, status = 200, body: unknown = HOME) {
  await stubSession(page)
  await page.route('**/api/v1/home', route => fulfill(route, status, body))
}

test('[AC-HOME-E2E-001] 회원 홈은 /home의 추천과 인기 랭킹을 그린다', async ({ page }) => {
  await stubHome(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '이런 상품은 어때요?' })).toBeVisible()
  await expect(page.getByRole('button', { name: '여름 쿨매트 젤 방석 L 상세 보기' })).toBeVisible()
  // 서버 isLiked=true는 첫 렌더부터 채워진 하트
  await expect(page.getByRole('button', { name: '찜 해제' })).toHaveCount(1)

  const ranking = page.locator('section', { has: page.getByRole('heading', { name: '지금 인기 있는 상품' }) })
  await expect(ranking.getByText('대용량 모래 8.5L 벤토나이트')).toBeVisible()
  await expect(ranking.getByText('품절')).toBeVisible()
  // 서버가 준 목업 외 섹션(프로모션 배너, 카테고리 칩)은 그리지 않는다
  await expect(page.getByText('SALE')).toHaveCount(0)

  await shot(page, `${SHOTS}/home-01-member.png`)
  // 랭킹은 첫 화면에 거의 다 보여 스크롤 캡처가 01과 같아진다 — 섹션만 잘라 남긴다.
  await ranking.screenshot({ path: `${SHOTS}/home-02-ranking.png`, animations: 'disabled' })
})

test('[AC-HOME-E2E-002] 추천 하트를 누르면 서버에 찜하고 하트가 채워진다', async ({ page }) => {
  await stubHome(page)
  const liked: string[] = []
  await page.route('**/api/v1/products/*/like', route => {
    if (route.request().method() === 'POST') {
      liked.push(new URL(route.request().url()).pathname.split('/')[4] ?? '')
    }
    return fulfill(route, 201)
  })
  await page.goto('/')

  await page.getByRole('button', { name: '찜하기' }).first().click()

  await expect(page.getByRole('button', { name: '찜 해제' })).toHaveCount(2)
  await expect.poll(() => liked).toEqual(['01JHOMEREC0000000000000001'])
})

test('[AC-HOME-E2E-003] 랭킹 행을 누르면 그 상품 상세로 이동한다', async ({ page }) => {
  const id = '01JHOMERANK000000000000003'
  // 이동 뒤 상세가 부르는 GET /products/{id}(JWT 필수)와 리뷰 미리보기(reviewCount>0)도 스텁한다.
  // 안 막으면 실서버로 새서 백엔드가 떠 있으면 401→로그인 리다이렉트와 경합하고, 없으면 URL만으로 통과한다.
  const detail: ProductDetailEnvelope = {
    data: {
      productId: id,
      name: '츄르 참치맛 40개입',
      description: null,
      representativeImageKey: null,
      images: [],
      regularPrice: 20000,
      discountPrice: null,
      discountRate: null,
      saleStatus: 'ON_SALE',
      shipping: { baseShippingFee: 3000, freeShippingThreshold: 50000 },
      seller: { storeName: '애착상점', profileImageKey: null },
      review: { reviewCount: 180, averageRating: 4.6 },
      categories: [],
      isLiked: false,
      isPurchasable: true,
    },
  }
  const reviews: ReviewListEnvelope = {
    data: { summary: null, reviews: [], totalCount: 0, nextCursor: null, hasNext: false },
  }
  await stubHome(page)
  await page.route(`**/api/v1/products/${id}`, route => fulfill(route, 200, detail))
  await page.route(`**/api/v1/products/${id}/reviews**`, route => fulfill(route, 200, reviews))
  await page.route(`${API_ORIGIN}/api/v1/products/${id}/review-summary`, route =>
    fulfill(route, 200, { data: { productSummary: null, similarPetSummary: null } }),
  )
  await page.goto('/')

  await page.getByRole('button', { name: /츄르 참치맛 40개입/ }).click()
  await expect(page).toHaveURL(`${ORIGIN}/products/${id}`)
  await expect(page.getByRole('heading', { name: '츄르 참치맛 40개입' })).toBeVisible()
})

test('[AC-HOME-E2E-004] 서버가 빈 목록을 주면 추천을 숨기고 랭킹 빈 안내를 보여준다', async ({ page }) => {
  await stubHome(page, 200, { data: { recommended: [], ranking: [] } })
  await page.goto('/')

  await expect(page.getByText('아직 인기 상품이 없어요')).toBeVisible()
  await expect(page.getByText('이런 상품은 어때요?')).toHaveCount(0)
  await shot(page, `${SHOTS}/home-03-empty.png`)
})

test('[AC-HOME-E2E-005] 서버 오류(500)는 재시도 버튼 없이 인라인으로 안내한다', async ({ page }) => {
  await stubHome(page, 500, { errorCode: 90000, message: 'server error' })
  await page.goto('/')

  await expect(page.getByText('홈을 불러오지 못했어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 시도' })).toHaveCount(0)
  await shot(page, `${SHOTS}/home-04-error.png`)
})

test('[AC-HOME-E2E-006] 세션 없이 진입하면(refresh 401) /home 없이 로그인 화면으로 보낸다', async ({ page }) => {
  let homeCalls = 0
  await page.route('**/api/v1/home', route => {
    if (route.request().method() === 'GET') homeCalls += 1
    return fulfill(route, 401, { errorCode: 20004, message: '로그인이 필요합니다.' })
  })
  await page.route('**/api/v1/auth/web/refresh', route =>
    fulfill(route, 401, { errorCode: 20002, message: '유효하지 않은 토큰입니다.' }),
  )
  await page.goto('/')

  await expect(page).toHaveURL(/\/onboarding\/login$/)
  await expect(page.getByRole('button', { name: '카카오 로그인' })).toBeVisible()
  expect(homeCalls).toBe(0)
  await shot(page, `${SHOTS}/home-05-logged-out.png`)
})

test('[AC-HOME-E2E-007] 온보딩 미완료(403/20006)면 약관 동의로 보낸다', async ({ page }) => {
  await stubHome(page, 403, { errorCode: 20006, message: '온보딩을 완료해야 이용할 수 있습니다.' })
  await page.goto('/')

  await expect(page).toHaveURL(/\/onboarding\/terms$/)
})

import { test, expect, type Page } from '@playwright/test'

// 실서버(로컬 BE :8080) 연동 검증 — CI/스텁용이 아니라 로컬 수동 검증 전용 스펙.
// 전제: docker(mysql/redis/kafka) + BE bootRun(local, e2e/mint-jwt.sh가 만든 jwt-*.pem을
// AUTH_JWT_* 키로 주입) + 시드(e2e/seed-cart.sql을 mysql에 적용).
// refresh 엔드포인트 하나만 스텁해 손수 서명한 실 access token을 내려주면, 첫 401 이후의
// 모든 요청(products 상세/옵션, carts 담기/조회/개수/수정/삭제)이 실 BE로 나간다.
//
// 자동 검증: CART_LIVE_TOKEN=$(e2e/mint-jwt.sh) pnpm --filter web-buyer exec playwright test e2e/cart-live.spec.ts
// 손으로 둘러보기: 아래 "실서버 수동 둘러보기" 테스트 주석 참고.

const PRODUCT_ID = '01JCART0000000000000000001'
const token = process.env['CART_LIVE_TOKEN']

// 토큰이 없으면(일반 test:e2e 실행) 실서버 전제를 만족하지 못하므로 조용히 스킵한다.
test.skip(!token, 'CART_LIVE_TOKEN env가 없어 실서버 연동 스펙을 건너뛴다')

/**
 * 카카오 로그인 없이 실 세션을 만든다. 앱은 access token을 메모리에만 두므로 첫 요청이 401이 되고,
 * 그때 나가는 refresh를 가로채 손수 서명한 실 토큰을 돌려주면 이후 요청이 전부 실 BE로 나간다.
 */
async function stubRefreshWithMintedToken(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/web/refresh', async route => {
    // fulfill 응답도 브라우저 CORS 검사를 받는다 — 교차 출처 + withCredentials라 와일드카드 불가.
    const cors = {
      'Access-Control-Allow-Origin': 'http://localhost:5175',
      'Access-Control-Allow-Credentials': 'true',
    }
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
          'Access-Control-Allow-Headers': 'authorization,content-type',
        },
      })
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ data: { accessToken: token, tokenType: 'Bearer', expiresIn: 1800 } }),
    })
  })
}

test('[AC-CART-LIVE-E2E-001] 장바구니 담기/조회/개수/수정/삭제 5개 API가 FE 화면 경로로 실서버와 연동된다', async ({
  page,
}) => {
  await stubRefreshWithMintedToken(page)

  // 1) 담기(POST /carts/items) — 상세 → 옵션 시트 → 장바구니 담기 → 확인 시트
  await page.goto(`/products/${PRODUCT_ID}`)
  await expect(page.getByText('고양이 자동 급식기 스마트 5L').first()).toBeVisible()
  await page.getByRole('button', { name: '장바구니', exact: true }).click()
  await page.getByRole('button', { name: '장바구니 담기' }).click()
  await expect(page.getByRole('heading', { name: '함께 보면 좋은 상품' })).toBeVisible()
  await expect(page.getByText('기본형 / 수량 1개')).toBeVisible()

  // 2) 조회(GET /carts) — 장바구니 보기 → 서버 장바구니 렌더
  await page.getByRole('button', { name: '장바구니 보기' }).click()
  await expect(page).toHaveURL(/\/cart/)
  await expect(page.getByText('냥이상점')).toBeVisible()
  await expect(page.getByRole('button', { name: '주문하기 (1)' })).toBeVisible()
  // 시드가 정가 89,000 / 할인가 64,000이라 라인에 원가 취소선이 붙는다(서버 originalPrice).
  await expect(page.getByText('89,000원')).toHaveCSS('text-decoration-line', 'line-through')

  // 3) 수정(PATCH /carts/items/{cartItemId}) — 수량 +1 → 합계 128,000원(무료배송)
  await page.getByRole('button', { name: '증가' }).click()
  await expect(page.getByText('128,000원').first()).toBeVisible()

  // 4) 개수(GET /carts/items/count) — 홈 앱바 배지. 라인 1개에 수량 2라서 배지는 종류 수인 1이고
  //    수량 합계인 2가 아니다. 배지만 필요한 화면이 목록 조회를 안 쓰는 것도 여기서 드러난다.
  await page.goto('/')
  await expect(page.getByRole('button', { name: '장바구니 (1)' })).toBeVisible()

  // 5) 삭제(DELETE /carts/items) — 라인 X → 빈 장바구니
  await page.getByRole('button', { name: '장바구니 (1)' }).click()
  await expect(page).toHaveURL(/\/cart/)
  await page.getByRole('button', { name: '장바구니에서 삭제' }).click()
  await expect(page.getByText('장바구니가 비어 있어요')).toBeVisible()
})

/**
 * 손으로 둘러보기 — 단언 없이 실 세션만 만들어 두고 Playwright Inspector에서 멈춘다.
 * 열린 브라우저를 직접 클릭하며 실 BE 응답으로 화면을 확인할 수 있다. Resume을 누르면 끝난다.
 *
 * CART_LIVE_TOKEN=$(e2e/mint-jwt.sh) CART_LIVE_BROWSE=1 \
 *   pnpm --filter web-buyer exec playwright test e2e/cart-live.spec.ts --headed -g 둘러보기
 */
test('실서버 수동 둘러보기', async ({ page }) => {
  test.skip(!process.env['CART_LIVE_BROWSE'], 'CART_LIVE_BROWSE=1이 아니면 건너뛴다')
  test.setTimeout(0) // 사람이 보는 동안 타임아웃으로 죽지 않게

  await stubRefreshWithMintedToken(page)
  await page.goto('/')
  await page.pause()
})

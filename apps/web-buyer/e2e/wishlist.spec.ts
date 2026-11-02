import { test, expect, type Page, type Route } from '@playwright/test'
import { stubMemberSession } from './session'

// 찜 목록(b3-st-4) ↔ 실 API 연동 E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을 재현한다
// (마켓/검색 spec과 동일한 CORS/프리플라이트 규칙). 서버가 찜 목록에서만 내려주는
// isViewable=false(찜한 뒤 카테고리가 비활성화된 상품)를 화면이 어떻게 다루는지 확인하고,
// 각 상태에서 page.screenshot으로 PR 첨부용 캡처를 test-results/pr-c(gitignore)에 남긴다.

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
  await page.screenshot({ path })
}

function product(
  productId: string,
  name: string,
  price: number,
  overrides: { isViewable?: boolean; saleStatus?: string } = {},
) {
  const saleStatus = overrides.saleStatus ?? 'ON_SALE'
  const isViewable = overrides.isViewable ?? true
  return {
    productId,
    name,
    sellerName: '리얼상점',
    thumbnailImageKey: null,
    regularPrice: price,
    discountPrice: null,
    discountRate: null,
    saleStatus,
    averageRating: 4.6,
    reviewCount: 42,
    // ProductSummaryResponse의 필수 필드(SCRUM-190). 빼면 서버가 절대 주지 않는 응답을 흉내내게
    // 된다 — e2e/는 tsc include 밖이라 손으로 맞출 것.
    isLiked: true,
    isViewable,
    isPurchasable: isViewable && saleStatus === 'ON_SALE',
  }
}

const ALL_VIEWABLE = [
  product('01LIKED0000000000000001', '강아지 연어 사료 2kg', 28000),
  product('01LIKED0000000000000002', '자동 리드줄 5m 대형견용', 33000),
  product('01LIKED0000000000000003', '벤토나이트 고양이 모래 8.5L', 16000),
  product('01LIKED0000000000000004', '참치 츄르 40개입', 13900),
]

// 3번째 상품만 카테고리가 비활성화돼 상세 진입이 막힌 상태.
const WITH_BLOCKED = ALL_VIEWABLE.map((p, i) =>
  i === 2 ? product(p.productId, p.name, p.regularPrice, { isViewable: false }) : p,
)

function likedEnvelope(products: unknown[]) {
  return { data: { products, totalCount: products.length, nextCursor: null, hasNext: false } }
}

// 회원 세션 전제 — 첫 진입 세션 확인(refresh)을 스텁하지 않으면 로그인 상태로 조건 건 조회가 안 나간다.
test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
})

test('[AC-WISH-E2E-001] 찜 목록이 서버 응답 그대로 그리드에 뜬다', async ({ page }) => {
  await page.route('**/api/v1/users/me/liked-products*', route =>
    fulfillJson(route, 200, likedEnvelope(ALL_VIEWABLE)),
  )
  await page.goto('/wishlist')

  await expect(page.getByRole('heading', { name: '찜한 상품' })).toBeVisible()
  await expect(page.getByText('강아지 연어 사료 2kg')).toBeVisible()
  // 전부 진입 가능이라 카드마다 이동 버튼이 있고 오버레이는 없다.
  await expect(page.getByRole('button', { name: '벤토나이트 고양이 모래 8.5L 상세 보기' })).toBeVisible()
  await expect(page.getByText('판매 중단')).toHaveCount(0)
  await shot(page, `${SHOTS}/01-wishlist-viewable.png`)
})

test('[AC-WISH-E2E-002] 진입 불가(isViewable=false) 찜 상품은 카드 탭이 막히고 판매 중단으로 표시된다', async ({
  page,
}) => {
  await page.route('**/api/v1/users/me/liked-products*', route =>
    fulfillJson(route, 200, likedEnvelope(WITH_BLOCKED)),
  )
  await page.goto('/wishlist')

  await expect(page.getByText('벤토나이트 고양이 모래 8.5L')).toBeVisible()
  // 이동 버튼이 아예 렌더되지 않아 상세 404로 빠질 경로가 없다.
  await expect(page.getByRole('button', { name: '벤토나이트 고양이 모래 8.5L 상세 보기' })).toHaveCount(0)
  // 품절과 같은 썸네일 오버레이를 쓰되 사유가 달라 라벨만 바꾼다.
  await expect(page.getByText('판매 중단')).toBeVisible()
  await expect(page.getByText('품절')).toHaveCount(0)
  // 찜 해제 수단(하트)은 그대로 남는다.
  await expect(page.getByRole('button', { name: '찜 해제' })).toHaveCount(4)
  // 나머지 카드는 그대로 상세로 갈 수 있다.
  await expect(page.getByRole('button', { name: '강아지 연어 사료 2kg 상세 보기' })).toBeVisible()
  await shot(page, `${SHOTS}/02-wishlist-blocked.png`)
})

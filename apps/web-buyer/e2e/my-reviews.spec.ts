import { test, expect, type Page, type Route } from '@playwright/test'
import type { UnreviewedOrderItemResponse, WrittenReviewItemResponse } from '@aechak/api'

// 내 리뷰 ↔ GET /users/me/reviews(SCRUM-232, BE SCRUM-182) 연동 E2E. 실백엔드 없이 page.route 스텁으로
// BE MyReviewListResponse 계약(tab=unreviewed|written, 커서 페이지, type 판별 필드)을 재현한다.
// CORS/프리플라이트 규칙은 reviews.spec과 같다(교차출처 8080 + withCredentials).

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
// 캡처에서 서버 썸네일이 실제로 그려졌는지 보이도록 단색 이미지를 쓴다(빈 SVG는 빈 칸과 구분이 안 된다).
const IMG =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Crect width=%2260%22 height=%2260%22 fill=%22%23E8B04B%22/%3E%3C/svg%3E'

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(reviews.spec과 동일).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path, animations: 'disabled' })
}

const PENDING: UnreviewedOrderItemResponse = {
  type: 'UNREVIEWED',
  orderItemId: 501,
  optionName: '2kg / 연어',
  productPublicId: '01J0000000000000000000SRV1',
  productName: '서버 주문 연어 사료',
  productThumbnailUrl: IMG,
  purchaseConfirmedAt: '2026-09-20T09:30:00',
  reviewableUntil: '2026-10-20',
  canReview: true,
}

const EXPIRED: UnreviewedOrderItemResponse = {
  ...PENDING,
  orderItemId: 480,
  productName: '기한 지난 고양이 모래',
  optionName: '6L',
  purchaseConfirmedAt: '2026-07-01T09:00:00',
  reviewableUntil: '2026-07-31',
  canReview: false,
}

const WRITTEN: WrittenReviewItemResponse[] = [
  {
    type: 'WRITTEN',
    reviewId: 701,
    rating: 4,
    content: '서버에 저장된 내 리뷰 본문이에요.',
    reviewStatus: 'PUBLIC',
    optionName: '1kg / 닭고기',
    productPublicId: '01J0000000000000000000SRV2',
    productName: '서버 주문 닭고기 간식',
    productThumbnailUrl: IMG,
    createdAt: '2026-09-25T12:00:00',
    images: [{ imageUrl: IMG, sortOrder: 0 }],
  },
  {
    type: 'WRITTEN',
    reviewId: 690,
    rating: 2,
    // BE 금칙어 마스킹은 걸린 표현만 *로 바꾼 본문을 내려준다(Review.mask + AhoCorasickProfanityScanner).
    content: '포장이 ***해서 아쉬워요.',
    reviewStatus: 'MASKED',
    optionName: '기본형',
    productPublicId: '01J0000000000000000000SRV3',
    productName: '서버 주문 장난감',
    productThumbnailUrl: null,
    createdAt: '2026-09-10T08:00:00',
    images: [],
  },
]

interface ServerState {
  unreviewed: UnreviewedOrderItemResponse[]
  written: WrittenReviewItemResponse[]
  /** 첫 페이지 응답 status. 500이면 로딩 실패 경로. */
  status?: number
}

const preflight = (route: Route, methods: string) =>
  route.fulfill({
    status: 204,
    headers: { ...CORS, 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': '*' },
  })

// state를 그대로 읽어 응답한다. 작성/삭제 스텁이 state를 바꾸면 다음 조회부터 실서버처럼 반영된다.
async function stubMyReviews(page: Page, state: ServerState) {
  await page.route(/\/users\/me\/reviews(\?|$)/, (route: Route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route, 'GET')
    if (state.status && state.status !== 200) {
      return route.fulfill({ status: state.status, headers: CORS, json: { message: 'error' } })
    }
    const tab = new URL(route.request().url()).searchParams.get('tab')
    const items = tab === 'written' ? state.written : tab === 'unreviewed' ? state.unreviewed : null
    if (items == null) {
      return route.fulfill({ status: 400, headers: CORS, json: { errorCode: 90001, message: '잘못된 요청입니다.' } })
    }
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: { data: { items, totalCount: items.length, nextCursor: null, hasNext: false } },
    })
  })
}

test('[AC-MY-REVIEW-E2E-001] 작성 대기/작성 완료 탭이 서버 목록과 상태 안내를 그린다', async ({ page }) => {
  await stubMyReviews(page, { unreviewed: [PENDING, EXPIRED], written: WRITTEN })
  await page.goto('/reviews/mine')

  // 작성 대기는 서버 2건뿐(목업 주문 스토어 폐기).
  await expect(page.getByRole('tab', { name: '작성 대기 2' })).toBeVisible()
  await expect(page.getByText('서버 주문 연어 사료')).toBeVisible()
  await expect(page.getByText('구매확정 09.20 / 10.20까지 작성')).toBeVisible()
  await expect(page.getByText('작성 기간이 지났어요')).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-01-pending.png')

  // 서버 2건 + 로컬 시드 리뷰 2건.
  await page.getByRole('tab', { name: '작성 완료 4' }).click()
  await expect(page.getByText('서버에 저장된 내 리뷰 본문이에요.')).toBeVisible()
  await expect(page.getByText('커뮤니티 정책에 따라 일부 표현이 가려졌어요.')).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-02-written.png')
})

test('[AC-MY-REVIEW-E2E-002] 서버 작성 대기에서 리뷰를 쓰면 POST 뒤 두 탭에 바로 반영된다', async ({ page }) => {
  const state: ServerState = { unreviewed: [PENDING], written: [] }
  await stubMyReviews(page, state)
  let posted: { orderItemId?: number; rating?: number; content?: string } | null = null
  await page.route(/\/api\/v1\/reviews$/, (route: Route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route, 'POST')
    posted = route.request().postDataJSON()
    // 실서버처럼 저장 뒤 조회부터 작성 대기에서 빠지고 작성 완료에 들어간다.
    state.unreviewed = []
    state.written = [
      {
        ...WRITTEN[0]!,
        reviewId: 902,
        rating: 5,
        content: posted!.content!,
        optionName: PENDING.optionName,
        productPublicId: PENDING.productPublicId,
        productName: PENDING.productName,
        images: [],
      },
    ]
    return route.fulfill({
      status: 201,
      headers: CORS,
      json: {
        data: {
          reviewId: 902,
          productId: 1,
          rating: 5,
          content: posted!.content,
          optionName: PENDING.optionName,
          createdAt: '2026-10-01T10:00:00',
          images: [],
        },
      },
    })
  })

  await page.goto('/reviews/mine')
  await page.getByText('서버 주문 연어 사료').waitFor()
  // 서버 항목 카드의 리뷰 쓰기.
  await page.getByRole('button', { name: '리뷰 쓰기' }).first().click()

  await expect(page.getByText('서버 주문 연어 사료')).toBeVisible()
  await expect(page.getByText('2kg / 연어')).toBeVisible()
  await page.getByRole('radio').last().click()
  await page.getByRole('textbox').fill('연어 사료를 아이가 정말 잘 먹어요.')
  await expect(page.getByRole('button', { name: '리뷰 등록' })).toBeEnabled()
  await shot(page, 'test-results/pr-c/my-reviews-03-write-from-server.png')

  await page.getByRole('button', { name: '리뷰 등록' }).click()
  await expect.poll(() => posted?.orderItemId).toBe(501)
  await expect(page).toHaveURL(/\/reviews\/mine/)
  await expect(page.getByText('연어 사료를 아이가 정말 잘 먹어요.')).toBeVisible()
  // 서버 0 + 목업 3, 서버 1 + 목업 2.
  await expect(page.getByRole('tab', { name: '작성 대기 0' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '작성 완료 3' })).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-04-after-write.png')
})

test('[AC-MY-REVIEW-E2E-003] 서버 리뷰를 삭제하면 DELETE를 부르고 목록과 개수에서 빠진다', async ({ page }) => {
  const state: ServerState = { unreviewed: [], written: [...WRITTEN] }
  await stubMyReviews(page, state)
  let deletedId: string | null = null
  await page.route(/\/api\/v1\/reviews\/\d+$/, (route: Route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route, 'DELETE')
    deletedId = new URL(route.request().url()).pathname.split('/').pop() ?? null
    state.written = state.written.filter(r => String(r.reviewId) !== deletedId)
    return route.fulfill({ status: 204, headers: CORS, body: '' })
  })

  await page.goto('/reviews/mine')
  await page.getByRole('tab', { name: '작성 완료 4' }).click()
  const card = page.locator('div.rounded-card', { hasText: '서버에 저장된 내 리뷰 본문이에요.' })
  // 수정 API가 없어 서버 리뷰에는 삭제만 있다.
  await expect(card.getByRole('button', { name: '수정' })).toHaveCount(0)
  await card.getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('리뷰를 삭제할까요?')).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-05-delete-modal.png')

  await page.getByRole('button', { name: '삭제하기' }).click()
  await expect.poll(() => deletedId).toBe('701')
  await expect(page.getByText('서버에 저장된 내 리뷰 본문이에요.')).toBeHidden()
  await expect(page.getByRole('tab', { name: '작성 완료 3' })).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-06-after-delete.png')
})

test('[AC-MY-REVIEW-E2E-004] 목록 조회가 실패(500)하면 재시도 버튼 없이 안내한다', async ({ page }) => {
  await stubMyReviews(page, { unreviewed: [], written: [], status: 500 })
  await page.goto('/reviews/mine')
  await expect(page.getByText('리뷰 목록을 불러오지 못했어요')).toBeVisible()
  await expect(page.getByRole('tab', { name: '작성 대기' })).toBeVisible()
  await shot(page, 'test-results/pr-c/my-reviews-07-error.png')
})

import { test, expect, type Page, type Route } from '@playwright/test'
import { stubMemberSession } from './session'
import type { ReviewItemResponse } from '@aechak/api'

// 리뷰 AI 요약은 api 호스트로만 나가야 해서 origin까지 적어 호스트를 가른다
const API_ORIGIN = 'http://localhost:8080'

// 상품 리뷰 목록 ↔ reviews API(SCRUM-181) 연동 E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을
// 재현한다(product-detail/pet-breeds spec과 동일한 CORS/프리플라이트 규칙). 서버가 sort/photoOnly/cursor를
// 실제로 반영한다고 보고, 스텁이 그 파라미터대로 응답을 만들어 정렬/포토 필터/페이지네이션을 검증한다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const REAL_ID = '01J000000000000000000TEST'
// 브라우저가 렌더링만 하면 되는 빈 SVG(포토리뷰 판정용 — 실제 이미지 내용은 무관).
const IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'

// 로컬 인터페이스가 아니라 생성 타입을 쓴다 — e2e는 tsc include 밖이라 로컬 인터페이스면 서버 계약에
// 필수 필드가 늘어도(isMine 등) 아무도 못 잡고 런타임에만 undefined가 샌다(MSW 픽스처와 같은 이유).
// id 내림차순 = 최신순. 사진 있는 리뷰 3건(505/503/501), 없는 리뷰 2건(504/502)으로 photoOnly를 검증한다.
const REVIEWS: ReviewItemResponse[] = [
  { reviewId: 505, isMine: false, rating: 2, content: '소음이 조금 있어요.', optionName: '기본형', authorNickname: '냥집사리뷰', authorProfileImageUrl: null, createdAt: '2026-08-10T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
  { reviewId: 504, isMine: false, rating: 5, content: '믿고 쓰는 제품이에요.', optionName: '프리미엄형', authorNickname: '하늘둥이', authorProfileImageUrl: null, createdAt: '2026-08-09T09:00:00', images: [] },
  { reviewId: 503, isMine: false, rating: 3, content: '가격 대비 무난해요.', optionName: '기본형', authorNickname: '코코대장', authorProfileImageUrl: null, createdAt: '2026-08-08T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
  { reviewId: 502, isMine: false, rating: 4, content: '배송이 빨라요.', optionName: '프리미엄형', authorNickname: '멍토끼리뷰', authorProfileImageUrl: null, createdAt: '2026-08-07T09:00:00', images: [] },
  { reviewId: 501, isMine: false, rating: 5, content: '기대 이상이에요.', optionName: '프리미엄형', authorNickname: '집사세븐', authorProfileImageUrl: null, createdAt: '2026-08-06T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
]

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, path: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  // animations: 'disabled'로 진입 애니메이션을 끝 프레임으로 고정한 뒤 찍는다 — toBeVisible()은
  // opacity가 0보다 크기만 하면 통과해서, 그냥 찍으면 모달이 반투명한 중간 프레임으로 잡힌다.
  await page.screenshot({ path, animations: 'disabled' })
}

// 평점 요약 — photoOnly와 무관하게 전체 가시 리뷰 기준. 없는 별점도 0.
function summary() {
  const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
  for (const r of REVIEWS) dist[String(r.rating)] += 1
  const averageRating = Math.round((REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length) * 100) / 100
  return { reviewCount: REVIEWS.length, averageRating, ratingDistribution: dist }
}

function reviewsBody(url: URL, pageSize: number) {
  const sort = url.searchParams.get('sort') ?? 'latest'
  const photoOnly = url.searchParams.get('photoOnly') === 'true'
  const cursor = url.searchParams.get('cursor')
  let list = [...REVIEWS]
  if (photoOnly) list = list.filter(r => r.images.length > 0)
  list.sort((a, b) => (sort === 'rating_desc' ? b.rating - a.rating || b.reviewId - a.reviewId : b.reviewId - a.reviewId))
  const start = cursor ? Number(cursor) : 0
  const page = list.slice(start, start + pageSize)
  const nextIndex = start + pageSize
  const hasNext = nextIndex < list.length
  const firstPage = cursor == null
  return {
    data: {
      summary: firstPage ? summary() : null,
      reviews: page,
      totalCount: firstPage ? list.length : null,
      nextCursor: hasNext ? String(nextIndex) : null,
      hasNext,
    },
  }
}

interface StubOptions {
  // 페이지당 리뷰 수. 크게 주면 한 페이지에 다 담기고(정렬/필터 검증), 작게 주면 나뉘어 더보기(페이지네이션)를 검증한다.
  pageSize?: number
  // 첫 페이지(cursor 없음) 응답 status. 404 → 상품 미존재, 500 → 로딩 실패 등 에러 경로 검증.
  firstStatus?: number
  // 다음 페이지(cursor 있음)를 500으로 실패시켜 "더보기 실패 시 기존 목록 유지"를 검증.
  failNextPage?: boolean
}

// 두 번째 인자는 숫자(pageSize) 또는 옵션 객체를 받는다 — 기존 호출(`stubReviews(page, 100)`)과 하위호환.
async function stubReviews(page: Page, opts: number | StubOptions = 100) {
  const { pageSize = 100, firstStatus = 200, failNextPage = false } =
    typeof opts === 'number' ? { pageSize: opts } : opts
  await page.route(new RegExp(`/products/${REAL_ID}/reviews`), (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
      })
    }
    const url = new URL(route.request().url())
    const isFirst = url.searchParams.get('cursor') == null
    if (isFirst && firstStatus !== 200) {
      return route.fulfill({ status: firstStatus, headers: CORS, json: { message: 'error' } })
    }
    if (!isFirst && failNextPage) {
      return route.fulfill({ status: 500, headers: CORS, json: { message: 'error' } })
    }
    return route.fulfill({ status: 200, headers: CORS, json: reviewsBody(url, pageSize) })
  })
}

// 회원 세션 전제 — 첫 진입 세션 확인(refresh)을 스텁하지 않으면 로그인 상태로 조건 건 조회가 안 나간다.
test.beforeEach(async ({ page }) => {
  await stubMemberSession(page)
})

test('[AC-REVIEW-E2E-001] 실 상품 리뷰 요약(평균)과 목록을 렌더한다', async ({ page }) => {
  await stubReviews(page, 100)
  await page.goto(`/reviews/product/${REAL_ID}`)
  // 요약 평균 (2+5+3+4+5)/5 = 3.8
  await expect(page.getByText('3.8')).toBeVisible()
  // 최신순 첫 리뷰(505 냥집사리뷰)와 다른 리뷰가 함께 보인다.
  await expect(page.getByText('냥집사리뷰')).toBeVisible()
  await expect(page.getByText('집사세븐')).toBeVisible()
})

test('[AC-REVIEW-E2E-002] 포토리뷰만 토글은 사진 없는 리뷰를 감춘다', async ({ page }) => {
  await stubReviews(page, 100)
  await page.goto(`/reviews/product/${REAL_ID}`)
  // 사진 없는 리뷰(멍토끼리뷰=502)가 처음엔 보인다.
  await expect(page.getByText('멍토끼리뷰')).toBeVisible()

  await page.getByRole('button', { name: '포토리뷰만' }).click()
  // 서버가 photoOnly로 다시 걸러 사진 없는 리뷰는 사라지고, 사진 있는 리뷰(냥집사리뷰=505)는 남는다.
  await expect(page.getByText('멍토끼리뷰')).toBeHidden()
  await expect(page.getByText('냥집사리뷰')).toBeVisible()
})

test('[AC-REVIEW-E2E-003] 별점높은순 정렬이 목록 순서에 실제로 반영된다', async ({ page }) => {
  // pageSize를 2로 줄여 정렬에 따라 첫 페이지 구성이 달라지게 한다 — 정렬 요청뿐 아니라 재정렬 결과까지 검증.
  await stubReviews(page, 2)
  await page.goto(`/reviews/product/${REAL_ID}`)
  // 최신순 첫 페이지 = [505 냥집사리뷰, 504 하늘둥이] → 냥집사리뷰는 보이고, 뒤 페이지의 집사세븐(501)은 아직 안 보인다.
  await expect(page.getByText('냥집사리뷰')).toBeVisible()
  await expect(page.getByText('집사세븐')).toBeHidden()

  const sorted = page.waitForResponse(
    r => r.url().includes('/reviews') && r.url().includes('rating_desc') && r.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '별점높은순' }).click()
  await sorted
  // 별점높은순 전체 순서 = [504(5), 501(5), 502(4), 503(3), 505(2)] → 첫 페이지 = [504 하늘둥이, 501 집사세븐].
  // 별점 낮은 505(냥집사리뷰)가 뒤 페이지로 밀려 첫 페이지에서 사라진다.
  await expect(page.getByText('집사세븐')).toBeVisible()
  await expect(page.getByText('냥집사리뷰')).toBeHidden()
})

test('[AC-REVIEW-E2E-004] 더보기를 누르면 다음 페이지 리뷰가 이어 붙는다', async ({ page }) => {
  await stubReviews(page, 2) // 페이지당 2건 → 첫 페이지엔 505/504만
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('냥집사리뷰')).toBeVisible() // 505
  await expect(page.getByText('하늘둥이')).toBeVisible() // 504
  await expect(page.getByText('코코대장')).toBeHidden() // 503은 아직 다음 페이지

  await page.getByRole('button', { name: '더보기' }).click()
  await expect(page.getByText('코코대장')).toBeVisible() // 503이 이어 붙는다
  await expect(page.getByText('냥집사리뷰')).toBeVisible() // 첫 페이지도 그대로 유지
})

test('[AC-REVIEW-E2E-005] 첫 페이지 404면 상품을 찾을 수 없다고 안내한다', async ({ page }) => {
  await stubReviews(page, { firstStatus: 404 })
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('상품을 찾을 수 없어요')).toBeVisible()
})

test('[AC-REVIEW-E2E-006] 첫 페이지 500이면 리뷰를 불러오지 못했다고 안내한다', async ({ page }) => {
  await stubReviews(page, { firstStatus: 500 })
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('리뷰를 불러오지 못했어요')).toBeVisible()
})

test('[AC-REVIEW-E2E-007] 더보기가 실패해도 기존 목록은 유지된다', async ({ page }) => {
  // 첫 페이지는 정상, 다음 페이지만 500으로 실패시킨다.
  await stubReviews(page, { pageSize: 2, failNextPage: true })
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('냥집사리뷰')).toBeVisible() // 505(첫 페이지)

  await page.getByRole('button', { name: '더보기' }).click()
  // 다음 페이지 실패는 목록을 통째로 에러 화면으로 교체하지 않는다 — 첫 페이지는 그대로 남고 에러 안내도 뜨지 않는다.
  await expect(page.getByText('냥집사리뷰')).toBeVisible()
  await expect(page.getByText('리뷰를 불러오지 못했어요')).toHaveCount(0)
})

// 서버가 내려준 "내 리뷰"(isMine=true) 한 건짜리 목록. 기본 픽스처는 전부 isMine=false라
// 내 리뷰 카드(닉네임 + 액션)를 지나가지 않는다.
async function stubMyServerReview(page: Page, reviewId = 321, state = { deleted: false }) {
  await page.route(new RegExp(`/products/${REAL_ID}/reviews`), (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
      })
    }
    const mine: ReviewItemResponse = {
      reviewId,
      isMine: true,
      rating: 5,
      content: '서버에 저장된 내 리뷰예요.',
      optionName: '기본형',
      authorNickname: '코코집사',
      authorProfileImageUrl: null,
      createdAt: '2026-08-20T10:00:00',
      images: [],
    }
    // 삭제 뒤 재조회는 실서버처럼 빈 목록을 준다 — 같은 리뷰를 계속 내려주면 캐시에서 뺀 카드가
    // 무효화 재조회로 되살아나 삭제가 안 된 것처럼 보인다.
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: {
        data: {
          summary: state.deleted
            ? { reviewCount: 0, averageRating: null, ratingDistribution: {} }
            : { reviewCount: 1, averageRating: 5, ratingDistribution: { '5': 1 } },
          reviews: state.deleted ? [] : [mine],
          totalCount: state.deleted ? 0 : 1,
          nextCursor: null,
          hasNext: false,
        },
      },
    })
  })
}

test('[AC-REVIEW-E2E-008] 서버가 내 리뷰(isMine)로 표시하면 삭제만 노출하고 수정은 감춘다', async ({ page }) => {
  // 수정은 서버 API가 없어 로컬 스토어 리뷰에서만 가능하다 — 서버 리뷰에 수정 버튼을 노출하면
  // 작성 화면이 대상을 못 찾아 "리뷰할 상품을 찾을 수 없어요"로 빠지는 죽은 진입이 된다.
  await stubMyServerReview(page)
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('서버에 저장된 내 리뷰예요.')).toBeVisible()

  await expect(page.getByRole('button', { name: '삭제' })).toBeVisible()
  await expect(page.getByRole('button', { name: '수정' })).toHaveCount(0)
})
// 상품 상세 스텁 — 상세 응답에는 리뷰 목록이 없고 집계(reviewCount/averageRating)만 있어, 미리보기는
// 리뷰 목록 API 첫 페이지를 따로 부른다. 그 조합을 브라우저에서 그대로 재현한다.
const DETAIL_FOR_PREVIEW = {
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
    review: { reviewCount: REVIEWS.length, averageRating: 4 },
    categories: [
      { categoryId: 1, name: '강아지', depth: 1 },
      { categoryId: 11, name: '사료/간식', depth: 2 },
    ],
    isLiked: false,
    isPurchasable: true,
  },
}

test('[AC-REVIEW-E2E-009] 상품 상세는 리뷰 목록 API로 미리보기 3개를 채운다', async ({ page }) => {
  await stubReviews(page, 100)
  // API 경로를 통째로 지정한다 — `/products/{id}$` 같은 정규식은 페이지 내비게이션 URL
  // (앱 origin의 /products/{id})까지 잡아 앱 대신 JSON이 렌더된다(product-detail spec과 동일한 형태).
  await page.route(`**/api/v1/products/${REAL_ID}`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({
          status: 204,
          headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
        })
      : route.fulfill({ status: 200, headers: CORS, json: DETAIL_FOR_PREVIEW }),
  )
  // 상세가 함께 부르는 리뷰 AI 요약(JWT 필수)도 스텁해 로컬 BE의 401 리다이렉트를 막는다.
  await page.route(`${API_ORIGIN}/api/v1/products/${REAL_ID}/review-summary`, (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({
          status: 204,
          headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
        })
      : route.fulfill({
          status: 200,
          headers: CORS,
          json: { data: { productSummary: null, similarPetSummary: null } },
        }),
  )
  await page.goto(`/products/${REAL_ID}`)
  await expect(page.getByText('리얼 프리미엄 자동 급식기')).toBeVisible()

  // 최신순 상위 3건(505/504/503)만 상세에 뜨고 나머지는 전체보기로 넘어간다.
  await expect(page.getByText('소음이 조금 있어요.')).toBeVisible()
  await expect(page.getByText('믿고 쓰는 제품이에요.')).toBeVisible()
  await expect(page.getByText('가격 대비 무난해요.')).toBeVisible()
  await expect(page.getByText('배송이 빨라요.')).toBeHidden()
  await shot(page, 'test-results/pr-c/01-detail-review-preview.png')
})

test('[AC-REVIEW-E2E-010] 작성 대기에서 쓴 리뷰는 POST /reviews로 저장되고 내 리뷰 완료 탭에 바로 반영된다', async ({
  page,
}) => {
  // 리뷰는 서버에만 저장한다(목업 주문 로컬 폴백 폐기). 작성 대기(unreviewed)에서 orderItemId를 들고
  // 작성 화면으로 가고, 저장 뒤 written 탭이 그 리뷰를 내려준다.
  const state = { saved: false }
  let posted: { orderItemId?: number; content?: string } | null = null
  await page.route(/\/users\/me\/reviews(\?|$)/, (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
      })
    }
    const tab = new URL(route.request().url()).searchParams.get('tab')
    const items =
      tab === 'unreviewed'
        ? state.saved
          ? []
          : [
              {
                type: 'UNREVIEWED',
                orderItemId: 77,
                optionName: '5m / 블랙',
                productPublicId: REAL_ID,
                productName: '자동 리드줄 5m 대형견용',
                productThumbnailUrl: null,
                purchaseConfirmedAt: '2026-09-20T09:30:00',
                reviewableUntil: '2026-10-20',
                canReview: true,
              },
            ]
        : state.saved
          ? [
              {
                type: 'WRITTEN',
                reviewId: 977,
                rating: 5,
                content: '배송도 빠르고 튼튼해서 아이가 잘 쓰고 있어요.',
                reviewStatus: 'PUBLIC',
                optionName: '5m / 블랙',
                productPublicId: REAL_ID,
                productName: '자동 리드줄 5m 대형견용',
                productThumbnailUrl: null,
                createdAt: '2026-10-01T10:00:00',
                images: [],
              },
            ]
          : []
    return route.fulfill({
      status: 200,
      headers: CORS,
      json: { data: { items, totalCount: items.length, nextCursor: null, hasNext: false } },
    })
  })
  await page.route('**/api/v1/reviews', (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': '*' },
      })
    }
    posted = route.request().postDataJSON() as { orderItemId: number; content: string }
    state.saved = true
    return route.fulfill({
      status: 201,
      headers: CORS,
      json: {
        data: {
          reviewId: 977,
          productId: 1,
          rating: 5,
          content: posted.content,
          optionName: '5m / 블랙',
          createdAt: '2026-10-01T10:00:00',
          images: [],
        },
      },
    })
  })
  // 내 리뷰 카드의 작성자 닉네임은 GET /users/me에서 읽는다.
  await page.route('http://localhost:8080/api/v1/users/me', (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({
          status: 204,
          headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
        })
      : route.fulfill({
          status: 200,
          headers: CORS,
          json: {
            data: {
              status: 'ACTIVE',
              nickname: '연어러버',
              profileImageUrl: null,
              profileImageKey: null,
              bio: null,
              email: null,
              phoneNumber: null,
              isPhoneVerified: true,
            },
          },
        }),
  )
  await page.goto('/reviews/mine')
  await page.getByRole('button', { name: '리뷰 쓰기' }).click()
  await expect(page.getByText('상품은 만족하셨나요?')).toBeVisible()
  await expect(page.getByText('자동 리드줄 5m 대형견용')).toBeVisible()

  // 별점 입력은 radio 5개(1~5점) — 마지막이 5점이다.
  await page.getByRole('radio').last().click()
  await page.getByRole('textbox').fill('배송도 빠르고 튼튼해서 아이가 잘 쓰고 있어요.')
  // 캡처 전에 등록 버튼이 실제로 활성인지 기다린다 — fill 직후 바로 찍으면 리렌더 전 상태가 잡혀
  // PR 캡처에서 버튼이 비활성인 것처럼 보인다.
  await expect(page.getByRole('button', { name: '리뷰 등록' })).toBeEnabled()
  await shot(page, 'test-results/pr-c/02-review-write-form.png')

  await page.getByRole('button', { name: '리뷰 등록' }).click()
  await expect(page).toHaveURL(/\/reviews\/mine/)
  await expect(page.getByText('배송도 빠르고 튼튼해서 아이가 잘 쓰고 있어요.')).toBeVisible()
  expect(posted).toMatchObject({ orderItemId: 77 })
  await expect(page.getByText('리뷰가 등록됐어요. 적립금 300원 지급 예정')).toBeVisible()
  await shot(page, 'test-results/pr-c/03-my-reviews-after-write.png')
})

test('[AC-REVIEW-E2E-011] 서버 리뷰를 삭제하면 DELETE를 부르고 목록에서 사라진다', async ({ page }) => {
  const state = { deleted: false }
  await stubMyServerReview(page, 321, state)
  let deletedId: string | null = null
  await page.route('**/api/v1/reviews/*', (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'DELETE', 'Access-Control-Allow-Headers': '*' },
      })
    }
    deletedId = new URL(route.request().url()).pathname.split('/').pop() ?? null
    state.deleted = true
    return route.fulfill({ status: 204, headers: CORS, body: '' })
  })
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('서버에 저장된 내 리뷰예요.')).toBeVisible()
  await shot(page, 'test-results/pr-c/04-product-reviews-mine.png')

  await page.getByRole('button', { name: '삭제' }).click()
  await expect(page.getByText('리뷰를 삭제할까요?')).toBeVisible()
  await shot(page, 'test-results/pr-c/05-delete-confirm-modal.png')

  await page.getByRole('button', { name: '삭제하기' }).click()
  await expect.poll(() => deletedId).toBe('321')
  // 재조회를 기다리지 않고 캐시에서 바로 빠진다.
  await expect(page.getByText('서버에 저장된 내 리뷰예요.')).toBeHidden()
})

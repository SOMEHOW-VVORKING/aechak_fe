import { test, expect, type Page, type Route } from '@playwright/test'

// 상품 리뷰 목록 ↔ reviews API(SCRUM-181) 연동 E2E. 실백엔드 없이 page.route 스텁으로 서버 계약을
// 재현한다(product-detail/pet-breeds spec과 동일한 CORS/프리플라이트 규칙). 서버가 sort/photoOnly/cursor를
// 실제로 반영한다고 보고, 스텁이 그 파라미터대로 응답을 만들어 정렬/포토 필터/페이지네이션을 검증한다.

const ORIGIN = 'http://localhost:5175'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const REAL_ID = '01J000000000000000000TEST'
// 브라우저가 렌더링만 하면 되는 빈 SVG(포토리뷰 판정용 — 실제 이미지 내용은 무관).
const IMG = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'

interface ReviewFixture {
  reviewId: number
  rating: number
  content: string
  optionName: string
  authorNickname: string
  authorProfileImageUrl: string | null
  createdAt: string
  images: { imageUrl: string; sortOrder: number }[]
}

// id 내림차순 = 최신순. 사진 있는 리뷰 3건(505/503/501), 없는 리뷰 2건(504/502)으로 photoOnly를 검증한다.
const REVIEWS: ReviewFixture[] = [
  { reviewId: 505, rating: 2, content: '소음이 조금 있어요.', optionName: '기본형', authorNickname: '냥집사리뷰', authorProfileImageUrl: null, createdAt: '2026-08-10T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
  { reviewId: 504, rating: 5, content: '믿고 쓰는 제품이에요.', optionName: '프리미엄형', authorNickname: '하늘둥이', authorProfileImageUrl: null, createdAt: '2026-08-09T09:00:00', images: [] },
  { reviewId: 503, rating: 3, content: '가격 대비 무난해요.', optionName: '기본형', authorNickname: '코코대장', authorProfileImageUrl: null, createdAt: '2026-08-08T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
  { reviewId: 502, rating: 4, content: '배송이 빨라요.', optionName: '프리미엄형', authorNickname: '멍토끼리뷰', authorProfileImageUrl: null, createdAt: '2026-08-07T09:00:00', images: [] },
  { reviewId: 501, rating: 5, content: '기대 이상이에요.', optionName: '프리미엄형', authorNickname: '집사세븐', authorProfileImageUrl: null, createdAt: '2026-08-06T09:00:00', images: [{ imageUrl: IMG, sortOrder: 0 }] },
]

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

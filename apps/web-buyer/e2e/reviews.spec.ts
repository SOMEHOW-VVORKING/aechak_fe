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

// pageSize를 크게 주면 한 페이지에 다 담기고(정렬/필터 검증), 작게 주면 나뉘어 더보기(페이지네이션)를 검증한다.
async function stubReviews(page: Page, pageSize: number) {
  await page.route(new RegExp(`/products/${REAL_ID}/reviews`), (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' },
      })
    }
    return route.fulfill({ status: 200, headers: CORS, json: reviewsBody(new URL(route.request().url()), pageSize) })
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

test('[AC-REVIEW-E2E-003] 별점높은순 정렬은 서버 요청(sort=rating_desc)에 반영된다', async ({ page }) => {
  await stubReviews(page, 100)
  await page.goto(`/reviews/product/${REAL_ID}`)
  await expect(page.getByText('냥집사리뷰')).toBeVisible()

  const sorted = page.waitForResponse(
    r => r.url().includes('/reviews') && r.url().includes('rating_desc') && r.request().method() === 'GET',
  )
  await page.getByRole('button', { name: '별점높은순' }).click()
  await sorted
  // 정렬 후에도 목록이 그대로 렌더된다(별점 5 리뷰가 상단으로 올라온 새 페이지).
  await expect(page.getByText('하늘둥이')).toBeVisible()
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

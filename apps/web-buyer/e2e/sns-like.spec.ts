import { test, expect, type Page, type Route } from '@playwright/test'
import type { SnsFeedPageResult, SnsLikerItemResult, SnsLikerListResult, SnsPostDetailResult } from '@aechak/api'

// SNS-04 게시물 좋아요와 좋아요한 사람(b7-st-9) E2E. 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml SNS-04의
// 좋아요 켜기와 끄기, 좋아요한 사람 응답을 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과
// Allow-Credentials, OPTIONS 방어 필수). 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': '*' },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

function solid(color: string, width = 600, height = 600) {
  return `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22${width}%22 height=%22${height}%22%3E%3Crect width=%22${width}%22 height=%22${height}%22 fill=%22%23${color}%22/%3E%3C/svg%3E`
}

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const BORI = { publicId: '01K8E2E0SNSUSER000000BORI', nickname: '보리아빠', profileImageUrl: solid('E8B04B', 80, 80) }
const MONG = { publicId: '01K8E2E0SNSUSER000000MONG', nickname: '몽이아빠', profileImageUrl: null }

const postId = (n: number) => `01K8E2E0SNSPOST00000000${String(n).padStart(2, '0')}`

function post(n: number, author: SnsPostDetailResult['author'], fields: Partial<SnsPostDetailResult> = {}) {
  const value: SnsPostDetailResult = {
    publicId: postId(n),
    author,
    pet: null,
    caption: null,
    hashtags: [],
    photoUrls: [],
    video: null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    edited: false,
    createdAt: '2026-11-04T09:00:00',
    isMine: false,
    following: true,
    mutedByMe: false,
    reposted: false,
    saved: false,
    liked: false,
    ...fields,
  }
  return value
}

// 1,204명이 좋아요했고 나도 눌러 둔 글(9-A), 24명 중 2명이 차단 관계인 글(9-B), 좋아요가 없는 글(9-C), 2명이 모두 차단 관계인 글.
const POPULAR = post(1, BORI, {
  pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-01' },
  caption: '보리랑 한강 산책 다녀왔어요',
  hashtags: ['한강산책'],
  photoUrls: [solid('E8B04B'), solid('7BA7D9')],
  likeCount: 1204,
  liked: true,
  commentCount: 12,
  repostCount: 3,
})
const SMALL = post(2, MONG, { caption: '주말 산책 코스 추천받아요', likeCount: 24, commentCount: 2 })
const NONE = post(3, MONG, { caption: '오늘은 비가 와서 집콕', following: false })
const HIDDEN = post(4, BORI, { caption: '보리 생일 파티', photoUrls: [solid('D98B7B')], likeCount: 2 })

const ROWS: [string, string, string | null, boolean][] = [
  ['두부네', '포메라니안', '2023-05', true],
  ['콩이맘', '말티즈', '2022-08', false],
  ['몽이누나', '비숑', '2020-02', false],
  ['초코집사', '코리안숏헤어', '2023-09', true],
  ['토리네', '치와와', null, false],
  ['호두식빵', '스코티시폴드', '2022-01', false],
]
const ME_ROW = 1
const liker = (n: number): SnsLikerItemResult => {
  const [nickname, breedLabel, birthYearMonth, following] = ROWS[n % ROWS.length]!
  return {
    publicId: `01K8E2E0SNSLIKER${String(n).padStart(9, '0')}`,
    nickname: n < ROWS.length ? nickname : `${nickname}${n}`,
    profileImageUrl: null,
    pet: { breedLabel, birthYearMonth },
    isMe: n === ME_ROW,
    following: n !== ME_ROW && following,
  }
}
const LIKERS: Record<string, SnsLikerListResult> = {
  [POPULAR.publicId]: { likeCount: 1204, hasMore: true, items: Array.from({ length: 100 }, (_, i) => liker(i)) },
  [SMALL.publicId]: { likeCount: 24, hasMore: false, items: Array.from({ length: 22 }, (_, i) => liker(i)) },
  [NONE.publicId]: { likeCount: 0, hasMore: false, items: [] },
  [HIDDEN.publicId]: { likeCount: 2, hasMore: false, items: [] },
}

const FEED: SnsFeedPageResult = {
  items: [POPULAR, SMALL, NONE].map(value => ({ post: value, repostedBy: null })),
  nextCursor: null,
  hasNext: false,
}

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, { member = true }: { member?: boolean } = {}) {
  const likes: string[] = []
  const posts = new Map([POPULAR, SMALL, NONE, HIDDEN].map(p => [p.publicId, p]))
  unexpected = []

  // 먼저 등록한 라우트가 나중에 확인된다. 아래 개별 스텁에 걸리지 않은 호출만 여기로 온다.
  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  await page.route(`${API}/auth/web/refresh`, route =>
    member
      ? fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } })
      : fulfill(route, 401, { errorCode: 20002, message: '인증이 필요합니다.' }),
  )
  await page.route(`${API}/sns/feeds/*`, route => fulfill(route, 200, { data: FEED }))
  await page.route(`${API}/sns/posts/*`, route => {
    const found = posts.get(new URL(route.request().url()).pathname.split('/').pop()!)
    return found
      ? fulfill(route, 200, { data: member ? found : { ...found, liked: false, following: false } })
      : fulfill(route, 404, { errorCode: 130400, message: '볼 수 없는 게시물입니다.' })
  })
  // 켜기 201, 끄기 200과 지금의 수. 서버 수는 화면의 수와 같게 둔다.
  await page.route(`${API}/sns/posts/*/like`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    const found = posts.get(id)!
    likes.push(`${method} ${id}`)
    const on = method === 'POST'
    const likeCount = found.likeCount + (on === found.liked ? 0 : on ? 1 : -1)
    posts.set(id, { ...found, liked: on, likeCount })
    return fulfill(route, on ? 201 : 200, { data: { likeCount } })
  })
  await page.route(`${API}/sns/posts/*/likers`, route =>
    fulfill(route, 200, { data: LIKERS[new URL(route.request().url()).pathname.split('/').at(-2)!] }),
  )
  await page.route(`${API}/sns/posts/*/comments*`, route => fulfill(route, 200, { data: { items: [], nextCursor: null, hasNext: false } }))
  return likes
}

const cardOf = (page: Page, nickname: string) =>
  page.getByRole('article').filter({ has: page.getByRole('button', { name: `${nickname}님의 게시물 보기` }) }).first()

test('[AC-SNS04-E2E-001] 피드 카드에 좋아요 수가 나오고 누르면 바로 채워진다', async ({ page }) => {
  const likes = await stubSns(page)
  await page.goto('/sns/feed?tab=explore')

  const card = cardOf(page, '몽이아빠')
  await expect(cardOf(page, '보리아빠').getByRole('button', { name: '좋아요', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(cardOf(page, '보리아빠').getByRole('button', { name: /^좋아요한 사람/ })).toHaveAccessibleName(
    '좋아요한 사람 1,204',
  )
  await card.getByRole('button', { name: '좋아요', exact: true }).click()
  await expect(card.getByRole('button', { name: '좋아요', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(card.getByRole('button', { name: /^좋아요한 사람/ })).toHaveAccessibleName('좋아요한 사람 25')
  await expect.poll(() => likes).toEqual([`POST ${SMALL.publicId}`])
  await shot(page, 'sns-like-02-feed-card')
})

test('[AC-SNS04-E2E-002] 상세의 좋아요는 채워진 하트로 보이고 수를 누르면 좋아요한 사람에 전체 수와 최근 100명 안내가 나온다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${POPULAR.publicId}`)

  const article = page.getByRole('article')
  await expect(article.getByRole('button', { name: '좋아요', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('img', { name: '사진 1/2' })).toBeVisible()
  await shot(page, 'sns-like-01-detail-liked')

  await article.getByRole('button', { name: /^좋아요한 사람/ }).click()
  await expect(page).toHaveURL(new RegExp(`/sns/posts/${POPULAR.publicId}/likers$`))
  await expect(page.getByText('좋아요 1,204')).toBeVisible()
  await expect(page.getByText('나', { exact: true })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(100)
  await shot(page, 'sns-like-03-likers-top')
  await page.getByText('최근 좋아요 100명까지 볼 수 있어요').scrollIntoViewIfNeeded()
  await shot(page, 'sns-like-04-likers-has-more')

  await page.getByRole('searchbox', { name: '닉네임 검색' }).fill('없는이름')
  await expect(page.getByText('검색 결과가 없어요')).toBeVisible()
  await shot(page, 'sns-like-07-search-empty')
})

test('[AC-SNS04-E2E-003] 100명 이하면 보여준 인원을, 좋아요가 없거나 모두 차단 관계면 각 빈 상태를 보여준다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${SMALL.publicId}/likers`)
  await expect(page.getByText('좋아요한 22명을 표시했어요')).toBeVisible()
  await page.getByText('좋아요한 22명을 표시했어요').scrollIntoViewIfNeeded()
  await shot(page, 'sns-like-05-likers-shown-count')

  await page.goto(`/sns/posts/${NONE.publicId}/likers`)
  await expect(page.getByText('아직 좋아요가 없어요')).toBeVisible()
  await shot(page, 'sns-like-06-likers-zero')

  await page.goto(`/sns/posts/${HIDDEN.publicId}/likers`)
  await expect(page.getByText('표시할 사람이 없어요')).toBeVisible()
  await expect(page.getByText('좋아요 2')).toBeVisible()
  await shot(page, 'sns-like-08-likers-all-hidden')
})

test('[AC-SNS04-E2E-004] 비로그인이 좋아요를 누르면 요청 없이 로그인 안내 시트가 열린다', async ({ page }) => {
  const likes = await stubSns(page, { member: false })
  await page.goto(`/sns/posts/${POPULAR.publicId}`)

  await page.getByRole('article').getByRole('button', { name: '좋아요', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('좋아요는 로그인한 회원만 이용할 수 있어요.')).toBeVisible()
  await shot(page, 'sns-like-09-guest-login-sheet')
  expect(likes).toEqual([])
})

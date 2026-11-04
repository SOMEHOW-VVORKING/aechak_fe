import { test, expect, type Locator, type Page, type Route } from '@playwright/test'
import type {
  SnsFeedItemResult,
  SnsFeedPageResult,
  SnsPostDetailResult,
  SnsPostGridItemResult,
  SnsPostGridPageResult,
  SnsProfileResult,
} from '@aechak/api'

// SNS-03 피드(b7-st-1), 리포스트와 저장, 프로필 탭과 저장됨(b7-st-4) E2E. jsdom에서는 볼 수 없는 실제 브라우저 동작,
// 즉 IntersectionObserver로 목록 끝에서 다음 페이지를 부르는지, 같은 게시물의 켜기와 끄기 요청이 앞 요청이 끝난 뒤에
// 나가는지를 여기서 확인한다. 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml 0.4.0을 재현한다(교차 출처 8080 +
// withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수). 하단 SNS 탭은 SNS_SERVER_AVAILABLE=false라
// 피드는 /sns/feed로 연다. 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const BUCKET = 'https://e2e-bucket.s3.local'
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

// 카드 영상 주소는 스텁이 404로 답한다. 컨트롤의 불러오는 중 표시는 브라우저 내부 화면이라 DOM으로 기다릴 수 없어
// 불러오기가 끝난 뒤 화면이 멈출 때까지 기다린다(캡처용).
async function settleVideo(page: Page, video: Locator) {
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.error !== null)).toBe(true)
  await expect.poll(async () => (await page.screenshot()).equals(await page.screenshot())).toBe(true)
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
const BORI = { publicId: '01K8E2E0SNSUSER000000BORI', nickname: '보리언니', profileImageUrl: solid('E8B04B', 80, 80) }
const MONG = { publicId: '01K8E2E0SNSUSER000000MONG', nickname: '몽이아빠', profileImageUrl: null }
const CHOCO = { publicId: '01K8E2E0SNSUSER00000CHOCO', nickname: '초코맘', profileImageUrl: solid('7BA7D9', 80, 80) }
const HODU = { publicId: '01K8E2E0SNSUSER0000HODU01', nickname: '호두아빠', profileImageUrl: null }
const ME_ID = '01K8E2E0SNSUSER00000000ME'

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

const PHOTOS = post(1, BORI, {
  pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-01' },
  caption: '보리랑 한강 산책 다녀왔어요',
  hashtags: ['한강산책', '골든리트리버'],
  photoUrls: [solid('E8B04B'), solid('7BA7D9'), solid('A3C585')],
  likeCount: 128,
  commentCount: 12,
  repostCount: 3,
})
const VIDEO = post(2, CHOCO, {
  caption: '초코 첫 수영',
  video: { url: `${BUCKET}/sns/posts/videos/choco.mp4`, thumbnailUrl: solid('7BA7D9', 720, 1280), durationMs: 42_000 },
  likeCount: 40,
  repostCount: 1,
})
const TEXT = post(3, MONG, { caption: '주말 산책 코스 추천받아요\n한강 말고 다른 곳도 궁금해요', edited: true })
const REPOSTED = post(4, BORI, { caption: '보리 생일 파티', photoUrls: [solid('D98B7B')], repostCount: 2, following: true })
const MORE = [5, 6, 7, 8].map(n => post(n, MONG, { caption: `몽이 일기 ${n}` }))

const item = (value: SnsPostDetailResult, repostedBy: SnsFeedItemResult['repostedBy'] = null): SnsFeedItemResult => ({
  post: value,
  repostedBy,
})

// 팔로잉 첫 페이지 다음 페이지에 이미 본 원글(사진 글)이 다시 온다(G3). 화면은 먼저 받은 자리 하나만 남긴다.
const FOLLOWING: Record<string, SnsFeedPageResult> = {
  '': {
    items: [
      item(REPOSTED, { publicId: HODU.publicId, nickname: HODU.nickname }),
      item(PHOTOS),
      item(VIDEO),
      item(TEXT),
      item(MORE[0]!),
      item(MORE[1]!),
    ],
    nextCursor: 'e2e-following-2',
    hasNext: true,
  },
  'e2e-following-2': { items: [item(PHOTOS), item(MORE[2]!), item(MORE[3]!)], nextCursor: null, hasNext: false },
}
const EXPLORE: SnsFeedPageResult = {
  items: [item(PHOTOS), item(VIDEO), item(TEXT)].map(i => ({ ...i, post: { ...i.post, following: false } })),
  nextCursor: null,
  hasNext: false,
}
// 인기는 원글만 점수순으로 온다. 리포스트 항목이 없다.
const POPULAR: SnsFeedPageResult = { items: [item(PHOTOS), item(REPOSTED), item(VIDEO)], nextCursor: null, hasNext: false }
const EMPTY: SnsFeedPageResult = { items: [], nextCursor: null, hasNext: false }

const grid = (value: SnsPostDetailResult): SnsPostGridItemResult => ({
  publicId: value.publicId,
  mediaType: value.video ? 'VIDEO' : value.photoUrls.length > 0 ? 'PHOTO' : 'TEXT',
  thumbnailUrl: value.video?.thumbnailUrl ?? value.photoUrls[0] ?? null,
  photoCount: value.photoUrls.length,
  captionPreview: value.video || value.photoUrls.length > 0 ? null : value.caption,
})
const gridPage = (items: SnsPostGridItemResult[]): SnsPostGridPageResult => ({ items, nextCursor: null, hasNext: false })

const BORI_PROFILE: SnsProfileResult = {
  publicId: BORI.publicId,
  nickname: BORI.nickname,
  profileImageUrl: BORI.profileImageUrl,
  bio: '골든리트리버 보리랑 살아요',
  pets: [{ breedLabel: '골든리트리버', birthYearMonth: '2021-01' }],
  postCount: 3,
  followerCount: 128,
  followingCount: 57,
  isMe: false,
  following: true,
  blockedByMe: false,
  mutedByMe: false,
  blockingMe: false,
}
const BORI_VIDEO = post(9, BORI, { video: VIDEO.video })
const BORI_TEXT = post(10, BORI, { caption: '오늘은 사진 없이 글만 남겨요. 보리가 낮잠을 길게 잤어요' })
const BORI_TABS: Record<string, SnsPostGridPageResult> = {
  posts: gridPage([grid(BORI_TEXT), grid(BORI_VIDEO), grid(PHOTOS)]),
  videos: gridPage([grid(BORI_VIDEO)]),
  reposts: gridPage([grid(TEXT), grid(VIDEO)]),
}

const ME: SnsProfileResult = {
  ...BORI_PROFILE,
  publicId: ME_ID,
  nickname: '콩이집사',
  profileImageUrl: null,
  bio: null,
  pets: [],
  postCount: 0,
  isMe: true,
  following: false,
}

interface StubOptions {
  member?: boolean
  /** 켜기(POST) 응답을 늦춰 같은 게시물 요청이 차례로 나가는지 본다 */
  slowOn?: number
  emptyFollowing?: boolean
}

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, opts: StubOptions = {}) {
  const member = opts.member ?? true
  const calls = { feeds: [] as URL[], reactions: [] as string[] }
  const posts = new Map([PHOTOS, VIDEO, TEXT, REPOSTED, ...MORE, BORI_VIDEO, BORI_TEXT].map(p => [p.publicId, p]))
  unexpected = []

  // 먼저 등록한 라우트가 나중에 확인된다. 아래 개별 스텁에 걸리지 않은 호출만 여기로 온다.
  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  // 카드 영상은 포스터만 보이면 된다.
  await page.route(`${BUCKET}/**`, route => route.fulfill({ status: 404 }))

  await page.route(`${API}/auth/web/refresh`, route =>
    member
      ? fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } })
      : fulfill(route, 401, { errorCode: 20002, message: '인증이 필요합니다.' }),
  )

  await page.route(`${API}/sns/feeds/*`, route => {
    const url = new URL(route.request().url())
    calls.feeds.push(url)
    const kind = url.pathname.split('/').pop()
    const following = opts.emptyFollowing ? EMPTY : FOLLOWING[url.searchParams.get('cursor') ?? '']!
    const body = kind === 'following' ? following : kind === 'explore' ? EXPLORE : POPULAR
    return fulfill(route, 200, { data: body })
  })

  await page.route(`${API}/sns/posts/*/{repost,save}`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    const path = new URL(route.request().url()).pathname.split('/')
    const name = `${method} ${path.at(-1)} ${path.at(-2)}`
    calls.reactions.push(`start ${name}`)
    if (method === 'POST' && opts.slowOn) await new Promise(resolve => setTimeout(resolve, opts.slowOn))
    calls.reactions.push(`end ${name}`)
    return fulfill(route, method === 'POST' ? 201 : 204)
  })

  await page.route(`${API}/sns/posts/*`, route => {
    const found = posts.get(new URL(route.request().url()).pathname.split('/').pop()!)
    return found
      ? fulfill(route, 200, { data: { ...found, following: member && found.following } })
      : fulfill(route, 404, { errorCode: 130400, message: '볼 수 없는 게시물입니다.' })
  })

  await page.route(`${API}/sns/users/*`, route => fulfill(route, 200, { data: BORI_PROFILE }))
  await page.route(`${API}/sns/me`, route => fulfill(route, 200, { data: ME }))
  await page.route(`${API}/sns/users/*/{posts,videos,reposts}*`, route => {
    const tab = new URL(route.request().url()).pathname.split('/').pop()!
    const owner = new URL(route.request().url()).pathname.split('/').at(-2)
    return fulfill(route, 200, { data: owner === BORI.publicId ? BORI_TABS[tab] : gridPage([]) })
  })
  await page.route(`${API}/sns/me/saves*`, route =>
    fulfill(route, 200, { data: gridPage([grid(PHOTOS), grid(VIDEO), grid(TEXT)]) }),
  )
  return calls
}

const cardOf = (page: Page, nickname: string) =>
  page.getByRole('article').filter({ has: page.getByRole('button', { name: `${nickname}님의 게시물 보기` }) }).first()
const postTabs = (page: Page) => page.getByRole('tablist', { name: '게시물 목록' }).getByRole('tab')
const cells = (page: Page) => page.getByRole('list', { name: '게시물' }).getByRole('button')

test('[AC-SNS03-E2E-001] 비로그인은 탐색 탭으로 열려 사진, 영상, 텍스트 카드를 보고 팔로잉 탭은 로그인 안내다', async ({
  page,
}) => {
  const calls = await stubSns(page, { member: false })
  await page.goto('/sns/feed')

  await expect(page.getByRole('heading', { name: '애착 SNS' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '탐색' })).toHaveAttribute('aria-selected', 'true')
  const photos = cardOf(page, '보리언니')
  // 사진 3장은 처음 2장을 두 칸으로 보이고 남은 장수를 적는다.
  await expect(photos.getByRole('img', { name: /^사진/ })).toHaveCount(2)
  await expect(photos.getByText('+1')).toBeVisible()
  const video = cardOf(page, '초코맘').getByLabel('영상', { exact: true })
  await expect(video).toHaveAttribute('poster', VIDEO.video!.thumbnailUrl)
  await expect(cardOf(page, '몽이아빠').getByText('수정됨')).toBeVisible()
  // 비로그인 카드는 수가 그대로 나오고 버튼은 꺼져 있다.
  await expect(photos.getByRole('button', { name: /^리포스트/ })).toHaveAttribute('aria-pressed', 'false')
  await expect(photos.getByRole('button', { name: '저장' })).toHaveAttribute('aria-pressed', 'false')
  await settleVideo(page, video)
  await shot(page, 'sns-feed-01-explore-guest')

  await page.getByRole('tab', { name: '팔로잉' }).click()
  await expect(page.getByRole('dialog').getByText('팔로잉 피드는 로그인한 회원만 볼 수 있어요.')).toBeVisible()
  expect(calls.feeds.map(url => url.pathname.split('/').pop())).toEqual(['explore'])
  await page.getByRole('button', { name: '둘러보기 계속하기' }).click()

  await photos.getByRole('button', { name: /^리포스트/ }).click()
  await expect(page.getByRole('dialog').getByText('리포스트는 로그인한 회원만 이용할 수 있어요.')).toBeVisible()
  await shot(page, 'sns-feed-02-guest-repost-sheet')
  expect(calls.reactions).toEqual([])
})

test('[AC-SNS03-E2E-002] 팔로잉 피드는 리포스트 표시를 그리고 목록 끝에 닿으면 다음 페이지를 불러 이미 본 글은 빼고 잇는다', async ({
  page,
}) => {
  const calls = await stubSns(page)
  await page.goto('/sns/feed')

  await expect(page.getByRole('tab', { name: '팔로잉' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('호두아빠님이 리포스트했어요')).toBeVisible()
  await shot(page, 'sns-feed-03-following')
  const cards = page.getByRole('button', { name: /님의 게시물 보기$/ })
  await expect(cards).toHaveCount(6)

  // 목록을 끝까지 내리면 감시 요소가 화면에 들어와 다음 페이지를 부른다.
  await page.getByRole('article').first().evaluate(el => {
    const list = el.closest('ul')!.parentElement!
    list.scrollTop = list.scrollHeight
  })
  await expect(cards).toHaveCount(8)
  expect(calls.feeds.map(url => url.searchParams.get('cursor'))).toEqual([null, 'e2e-following-2'])
  await expect(page.getByText('몽이 일기 8')).toBeVisible()
})

test('[AC-SNS03-E2E-003] 카드에서 리포스트와 저장을 누르면 바로 켜지고 같은 게시물의 끄기는 켜기 응답 뒤에 나간다', async ({
  page,
}) => {
  const calls = await stubSns(page, { slowOn: 1500 })
  await page.goto('/sns/feed?tab=explore')

  // 캡처는 켜기 응답을 늦춘 사이에 찍으므로 영상은 누르기 전에 기다린다.
  await settleVideo(page, cardOf(page, '초코맘').getByLabel('영상', { exact: true }))
  const card = cardOf(page, '보리언니')
  const repost = card.getByRole('button', { name: /^리포스트/ })
  await repost.click()
  // 응답을 기다리지 않고 바로 켜지고 수가 1 오른다.
  await expect(repost).toHaveAttribute('aria-pressed', 'true')
  await expect(repost).toHaveAccessibleName('리포스트 4')
  await card.getByRole('button', { name: '저장' }).click()
  await expect(card.getByRole('button', { name: '저장' })).toHaveAttribute('aria-pressed', 'true')
  await shot(page, 'sns-feed-04-card-reposted-saved')

  // 켜기 응답이 오기 전에 다시 누른다.
  expect(calls.reactions).not.toContain(`end POST repost ${PHOTOS.publicId}`)
  await repost.click()
  await expect(repost).toHaveAttribute('aria-pressed', 'false')
  await expect(repost).toHaveAccessibleName('리포스트 3')
  await expect.poll(() => calls.reactions.filter(c => c.startsWith('end')).length).toBe(3)
  const id = PHOTOS.publicId
  // 리포스트 끄기는 리포스트 켜기가 끝난 뒤에 시작한다. 저장은 다른 게시물 요청 묶음이라 기다리지 않는다.
  const order = calls.reactions.filter(c => c.endsWith(`repost ${id}`))
  expect(order).toEqual([`start POST repost ${id}`, `end POST repost ${id}`, `start DELETE repost ${id}`, `end DELETE repost ${id}`])
  expect(calls.reactions).toContain(`end POST save ${id}`)
})

test('[AC-SNS03-E2E-004] 프로필은 아이콘 탭과 하단 탭바를 그리고 칸을 누르면 상세가 열리며 돌아오면 보던 탭이 남는다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/users/${BORI.publicId}`)

  await expect(postTabs(page)).toHaveCount(3)
  await expect(postTabs(page).nth(0)).toHaveAccessibleName('그리드')
  await expect(postTabs(page).nth(1)).toHaveAccessibleName('영상')
  await expect(postTabs(page).nth(2)).toHaveAccessibleName('리포스트')
  await expect(page.getByRole('tab', { name: 'SNS' })).toHaveAttribute('aria-selected', 'true')
  await expect(cells(page)).toHaveCount(3)
  await expect(cells(page).nth(0)).toHaveAccessibleName('오늘은 사진 없이 글만 남겨요. 보리가 낮잠을 길게 잤어요')
  await expect(cells(page).nth(1)).toHaveAccessibleName('영상 게시물')
  await expect(cells(page).nth(2)).toHaveAccessibleName('사진 3장 게시물')
  await shot(page, 'sns-feed-05-profile-grid')

  await postTabs(page).nth(1).click()
  await expect(page).toHaveURL(/tab=video/)
  await expect(cells(page)).toHaveCount(1)
  await shot(page, 'sns-feed-06-profile-video')
  await cells(page).first().click()
  await expect(page).toHaveURL(new RegExp(`/sns/posts/${BORI_VIDEO.publicId}`))
  // 주소가 바뀐 뒤에도 잠시 프로필이 남아 있다. 상세 본문의 영상을 기다린다.
  await expect(page.getByRole('article').getByLabel('영상', { exact: true })).toBeVisible()

  await page.goBack()
  await expect(postTabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(cells(page)).toHaveCount(1)

  await postTabs(page).nth(2).click()
  await expect(page).toHaveURL(/tab=repost/)
  await expect(cells(page)).toHaveCount(2)
  await expect(cells(page).nth(0)).toHaveAccessibleName(/^주말 산책 코스 추천받아요/)
  await shot(page, 'sns-feed-08-profile-repost')
})

test('[AC-SNS03-E2E-005] 내 프로필의 저장됨 탭은 저장한 글을 칸으로 보여준다', async ({ page }) => {
  await stubSns(page)
  await page.goto('/sns/me')

  await expect(postTabs(page)).toHaveCount(4)
  await postTabs(page).nth(3).click()
  await expect(cells(page)).toHaveCount(3)
  await expect(cells(page).nth(0)).toHaveAccessibleName('사진 3장 게시물')
  await expect(cells(page).nth(1)).toHaveAccessibleName('영상 게시물')
  await shot(page, 'sns-feed-07-profile-saved')
})

test('[AC-SNS03-E2E-006] 팔로잉 피드가 비면 탐색 보기 안내가 나오고 인기 탭은 리포스트 표시 없이 카드를 보여준다', async ({
  page,
}) => {
  const calls = await stubSns(page, { emptyFollowing: true })
  await page.goto('/sns/feed')

  await expect(page.getByText('팔로잉 피드에 아직 글이 없어요')).toBeVisible()
  await expect(page.getByRole('button', { name: '탐색 보기' })).toBeVisible()
  await shot(page, 'sns-feed-09-following-empty')

  await page.getByRole('tab', { name: '인기' }).click()
  await expect(page).toHaveURL(/tab=popular/)
  await expect(page.getByRole('button', { name: /님의 게시물 보기$/ })).toHaveCount(3)
  await expect(page.getByText(/리포스트했어요$/)).toHaveCount(0)
  await shot(page, 'sns-feed-10-popular')
  expect(calls.feeds.map(url => url.pathname.split('/').pop())).toEqual(['following', 'popular'])
})

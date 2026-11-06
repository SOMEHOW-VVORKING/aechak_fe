import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  SnsFeedItemResult,
  SnsHashtagPostPageResult,
  SnsHashtagResult,
  SnsPostDetailResult,
  SnsSearchPostPageResult,
  SnsSearchUserItemResult,
} from '@aechak/api'

// SNS-06 통합 검색의 전체 탭 SNS 섹션(b12-st-2), SNS 탭 세 세그먼트(b12-st-4), 해시태그 게시물 목록(b7-st-6 6-D) E2E.
// 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml 0.5.0 SNS-06을 재현한다(교차 출처 8080 + withCredentials라 정확한
// origin과 Allow-Credentials, OPTIONS 방어 필수). 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

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
const HANGANG = { publicId: '01K8E2E0SNSUSER00HANGANG1', nickname: '한강산책클럽', profileImageUrl: solid('A3C585', 80, 80) }
const COCO = { publicId: '01K8E2E0SNSUSER000000COCO', nickname: '코코집사', profileImageUrl: null }
const MONG = { publicId: '01K8E2E0SNSUSER000000MONG', nickname: '멍멍일상', profileImageUrl: solid('7BA7D9', 80, 80) }
const ME_ID = '01K8E2E0SNSUSER00000000ME'

const postId = (n: number) => `01K8E2E0SNSSEARCHPOST00${String(n).padStart(3, '0')}`

function post(n: number, author: SnsPostDetailResult['author'], fields: Partial<SnsPostDetailResult> = {}) {
  const value: SnsPostDetailResult = {
    publicId: postId(n),
    author,
    pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-03' },
    caption: null,
    hashtags: [],
    photoUrls: [],
    video: null,
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    edited: false,
    createdAt: '2026-11-04T18:00:00',
    isMine: false,
    following: false,
    mutedByMe: false,
    reposted: false,
    saved: false,
    ...fields,
  }
  return value
}

const item = (value: SnsPostDetailResult): SnsFeedItemResult => ({ post: value, repostedBy: null })

const WALK_POSTS = [
  post(1, HANGANG, {
    caption: '오늘 한강 산책 모임 다녀왔어요. 날씨가 좋아서 강아지들도 신났네요. 다음 주말 코스 추천받아요!',
    hashtags: ['봄산책', '한강산책', '댕스타그램'],
    photoUrls: [solid('E8B04B')],
    repostCount: 42,
  }),
  // 사진 없이 본문만 있는 글. 미리보기 행의 썸네일 자리에 본문 앞부분이 나온다(A20).
  post(2, COCO, { caption: '산책 코스 추천받아요. 5km 정도가 좋을까요?', pet: null, repostCount: 12, edited: true }),
  // 본문 없이 사진과 해시태그만 단 글. 미리보기 행의 본문 자리에 해시태그가 나온다(P15).
  post(3, MONG, { hashtags: ['산책스타그램', '시바견'], photoUrls: [solid('D98B7B'), solid('7BA7D9')], repostCount: 7 }),
  post(4, HANGANG, { caption: '저녁 산책길 노을이 너무 예뻐서 한 컷', photoUrls: [solid('B48EAD')], repostCount: 5 }),
  post(5, MONG, { caption: '타이머 산책 알림 한 달 사용 후기', photoUrls: [solid('88C0D0')], repostCount: 3 }),
  post(6, COCO, { caption: '비 오는 날 실내 산책 놀이', repostCount: 1 }),
]

function postPage(items: SnsPostDetailResult[], size: number, totalCount: number): SnsSearchPostPageResult {
  const slice = items.slice(0, size)
  return { items: slice.map(item), totalCount, nextCursor: items.length > size ? 'e2e-next' : null, hasNext: items.length > size }
}

const user = (fields: Partial<SnsSearchUserItemResult> & Pick<SnsSearchUserItemResult, 'publicId' | 'nickname'>) => {
  const value: SnsSearchUserItemResult = {
    profileImageUrl: null,
    petSummary: null,
    followerCount: 0,
    isMe: false,
    following: false,
    blockingMe: false,
    ...fields,
  }
  return value
}

// 산책 검색. 같은 닉네임, 검색어로 시작하는 닉네임, 나머지 순이고 나를 차단한 사용자는 기본 프로필 행이다(A7).
const WALK_USERS: SnsSearchUserItemResult[] = [
  user({
    publicId: '01K8E2E0SNSUSER000WALKMATE',
    nickname: '산책메이트',
    petSummary: { breedLabel: '말티즈', activePetCount: 2 },
    followerCount: 3120,
  }),
  user({ publicId: '01K8E2E0SNSUSER0000WALKME0', nickname: '산책하는보리', petSummary: { breedLabel: '푸들', activePetCount: 1 }, followerCount: 57, isMe: true }),
  user({ ...HANGANG, petSummary: { breedLabel: '골든리트리버', activePetCount: 1 }, followerCount: 8940, following: true }),
  user({ publicId: '01K8E2E0SNSUSER000BLOCKING', nickname: '댕댕산책일기', followerCount: null, blockingMe: true }),
]
const WALK_HASHTAGS: SnsHashtagResult[] = [
  { name: '봄산책', postCount: 9210 },
  { name: '산책스타그램', postCount: 4580 },
  { name: '한강산책', postCount: 2140 },
]

const HASHTAG_PAGE: SnsHashtagPostPageResult = {
  hashtag: { name: '봄산책', postCount: 9210 },
  items: [WALK_POSTS[0]!, post(7, MONG, { caption: '벚꽃잎 맞고 신난 몽이', hashtags: ['봄산책', '시바견'], photoUrls: [solid('EBCB8B')] })].map(item),
  nextCursor: null,
  hasNext: false,
}

const PRODUCTS = ['산책 하네스 M', '자동 리드줄 5m', '산책 물병 500ml', '배변봉투 케이스', '야광 목줄', '산책 가방'].map(
  (name, i) => ({
    productId: `p-walk-${i + 1}`,
    name,
    sellerName: '산책상점',
    thumbnailImageKey: null,
    regularPrice: 18000 + i * 3000,
    discountPrice: null,
    discountRate: null,
    saleStatus: 'ON_SALE',
    averageRating: 4.5,
    reviewCount: 12,
    isLiked: false,
    isViewable: true,
    isPurchasable: true,
  }),
)

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSearch(page: Page, { member = true }: { member?: boolean } = {}) {
  const calls = { posts: [] as URL[], follows: [] as string[] }
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
  await page.route(`${API}/categories`, route => fulfill(route, 200, { data: [] }))
  await page.route(`${API}/search/keywords`, route =>
    fulfill(route, 200, { data: { recentKeywords: [], recommendedKeywords: [] } }),
  )
  await page.route(`${API}/search/products*`, route => {
    const hits = new URL(route.request().url()).searchParams.get('keyword')?.includes('산책') ? PRODUCTS : []
    return fulfill(route, 200, { data: { products: hits, totalCount: hits.length, nextCursor: null, hasNext: false } })
  })
  await page.route(`${API}/sns/search/posts*`, route => {
    const url = new URL(route.request().url())
    calls.posts.push(url)
    const walk = url.searchParams.get('keyword')?.includes('산책')
    const size = Number(url.searchParams.get('size') ?? 20)
    return fulfill(route, 200, { data: walk ? postPage(WALK_POSTS, size, 86) : postPage([], size, 0) })
  })
  await page.route(`${API}/sns/search/users*`, route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword') ?? ''
    const items = keyword.includes('산책') ? WALK_USERS : keyword === '코코집사' ? [user({ ...COCO, followerCount: 12 })] : []
    return fulfill(route, 200, { data: { items, nextCursor: null, hasNext: false } })
  })
  await page.route(`${API}/sns/search/hashtags*`, route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword') ?? ''
    return fulfill(route, 200, { data: { items: keyword.includes('산책') ? WALK_HASHTAGS : [], nextCursor: null, hasNext: false } })
  })
  await page.route(`${API}/sns/hashtags/*/posts*`, route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2)!)
    const body: SnsHashtagPostPageResult =
      name === '봄산책' ? HASHTAG_PAGE : { hashtag: { name, postCount: 0 }, items: [], nextCursor: null, hasNext: false }
    return fulfill(route, 200, { data: body })
  })
  await page.route(`${API}/sns/users/*/follow`, route => {
    if (route.request().method() !== 'OPTIONS') calls.follows.push(route.request().method())
    return fulfill(route, route.request().method() === 'POST' ? 201 : 204)
  })
  await page.route(`${API}/sns/users/*`, route =>
    fulfill(route, 200, {
      data: {
        ...HANGANG,
        bio: null,
        pets: [],
        postCount: 2,
        followerCount: 8941,
        followingCount: 3,
        isMe: false,
        following: true,
        blockedByMe: false,
        mutedByMe: false,
        blockingMe: false,
      },
    }),
  )
  await page.route(`${API}/sns/me`, route =>
    fulfill(route, 200, {
      data: {
        publicId: ME_ID,
        nickname: '산책하는보리',
        profileImageUrl: null,
        bio: null,
        pets: [],
        postCount: 0,
        followerCount: 57,
        followingCount: 0,
        isMe: true,
        following: false,
        blockedByMe: false,
        mutedByMe: false,
        blockingMe: false,
      },
    }),
  )
  return calls
}

const snsSection = (page: Page) => page.getByRole('region', { name: 'SNS 검색 결과' })

test('[AC-SNS06-E2E-001] 홈에서 연 검색은 전체 탭에 SNS 섹션(인기순 5개, 결과 수, 더보기)과 마켓 섹션을 보인다', async ({ page }) => {
  const calls = await stubSearch(page)
  await page.goto('/search')
  await page.getByRole('searchbox').fill('산책')
  await page.getByRole('searchbox').press('Enter')

  await expect(page.getByRole('tab', { name: '전체' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: /^SNS\s?86$/ })).toBeVisible()
  await expect(snsSection(page).getByRole('listitem')).toHaveCount(5)
  await expect(snsSection(page).getByText('#산책스타그램 #시바견')).toBeVisible()
  await expect(snsSection(page).getByText('수정됨')).toBeVisible()
  await expect(page.getByRole('region', { name: '마켓 검색 결과' }).getByText('산책 하네스 M')).toBeVisible()
  expect(calls.posts[0]?.searchParams.get('size')).toBe('5')
  expect(calls.posts[0]?.searchParams.get('sort')).toBe('POPULAR')
  await shot(page, 'sns-search-01-all-tab')

  await snsSection(page).getByRole('button', { name: 'SNS 결과 86개 더보기' }).click()
  await expect(page.getByRole('tab', { name: '게시물' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/tab=sns&seg=posts/)
})

test('[AC-SNS06-E2E-002] SNS 탭 게시물 세그먼트는 결과 수, 인기순과 최신순 칩, 피드 카드를 보인다', async ({ page }) => {
  const calls = await stubSearch(page)
  await page.goto('/search/results?q=산책&tab=sns')

  await expect(page.getByText('총 86개')).toBeVisible()
  await expect(page.getByRole('button', { name: '인기순' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '한강산책클럽님의 게시물 보기' }).first()).toBeVisible()
  await shot(page, 'sns-search-02-sns-posts')

  await page.getByRole('button', { name: '최신순' }).click()
  await expect(page.getByRole('button', { name: '최신순' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => calls.posts.some(url => url.searchParams.get('sort') === 'LATEST')).toBe(true)
})

test('[AC-SNS06-E2E-003] 계정 세그먼트는 나를 차단한 사용자를 기본 프로필로, 내 계정은 팔로우 버튼 없이 보인다', async ({ page }) => {
  const calls = await stubSearch(page)
  await page.goto('/search/results?q=산책&tab=sns&seg=users')

  await expect(page.getByText('말티즈 외 1 / 팔로워 3,120')).toBeVisible()
  await expect(page.getByRole('button', { name: '한강산책클럽 팔로잉' })).toBeVisible()
  await expect(page.getByText('댕댕산책일기')).toBeVisible()
  await expect(page.getByRole('button', { name: /댕댕산책일기 팔로/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /산책하는보리 팔로/ })).toHaveCount(0)
  await shot(page, 'sns-search-03-sns-users')

  await page.getByRole('button', { name: '산책메이트 팔로우' }).click()
  await expect.poll(() => calls.follows).toEqual(['POST'])
})

test('[AC-SNS06-E2E-004] #으로 시작하면 해시태그 세그먼트로 열리고 행을 누르면 해시태그 게시물 목록이다', async ({ page }) => {
  await stubSearch(page)
  await page.goto(`/search/results?q=${encodeURIComponent('#산책')}&tab=sns`)

  await expect(page.getByRole('tab', { name: '해시태그' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: /#봄산책/ })).toBeVisible()
  await shot(page, 'sns-search-04-sns-hashtags')

  await page.getByRole('button', { name: /#봄산책/ }).click()
  await expect(page).toHaveURL(/\/sns\/hashtags\//)
  await expect(page.getByText('게시글 9,210')).toBeVisible()
  await expect(page.getByRole('button', { name: '멍멍일상님의 게시물 보기' })).toBeVisible()
  await shot(page, 'sns-search-05-hashtag-posts')
})

test('[AC-SNS06-E2E-005] 결과가 없는 세그먼트는 연관 검색어 없이 빈 상태를 보인다', async ({ page }) => {
  await stubSearch(page)
  await page.goto('/search/results?q=댕댕월드컵&tab=sns')

  await expect(page.getByText('검색 결과가 없어요')).toBeVisible()
  await expect(page.getByText('총 0개')).toBeVisible()
  await expect(page.getByText('이런 검색어는 어때요?')).toHaveCount(0)
  await shot(page, 'sns-search-06-sns-empty')
})

test('[AC-SNS06-E2E-006] 게시물이 없고 계정만 일치하면 전체 탭 SNS 섹션에 계정 결과 링크를 보이고 계정 세그먼트를 연다', async ({ page }) => {
  await stubSearch(page)
  await page.goto('/search/results?q=코코집사')

  await expect(snsSection(page).getByText('검색 결과가 없어요')).toBeVisible()
  await expect(snsSection(page).getByText('0', { exact: true })).toBeVisible()
  await expect(snsSection(page).getByRole('button', { name: '계정 검색 결과 보기' })).toBeVisible()
  await shot(page, 'sns-search-07-all-tab-account-link')

  await snsSection(page).getByRole('button', { name: '계정 검색 결과 보기' }).click()
  await expect(page.getByRole('tab', { name: '계정' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '코코집사 팔로우' })).toBeVisible()
})

test('[AC-SNS06-E2E-007] 비로그인도 해시태그 목록을 보고 글이 없는 태그는 게시글 0과 빈 상태다', async ({ page }) => {
  await stubSearch(page, { member: false })
  await page.goto(`/sns/hashtags/${encodeURIComponent('댕댕월드컵')}`)

  await expect(page.getByText('이 해시태그가 달린 게시물이 없어요')).toBeVisible()
  await expect(page.getByText('게시글 0')).toBeVisible()
  await shot(page, 'sns-search-08-hashtag-empty')
})

test('[AC-SNS06-E2E-008] 비로그인이 계정 세그먼트에서 팔로우를 누르면 요청 없이 로그인 안내 시트가 열린다', async ({ page }) => {
  const calls = await stubSearch(page, { member: false })
  await page.goto('/search/results?q=산책&tab=sns&seg=users')

  await page.getByRole('button', { name: '산책메이트 팔로우' }).click()
  await expect(page.getByText('팔로우는 로그인한 회원만 이용할 수 있어요.')).toBeVisible()
  expect(calls.follows).toEqual([])
  await shot(page, 'sns-search-09-guest-follow-gate')
})

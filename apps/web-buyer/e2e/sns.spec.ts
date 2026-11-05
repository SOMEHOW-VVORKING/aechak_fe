import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  SnsProfileResult,
  SnsRelationItemResult,
  SnsRelationPageResult,
  SnsUserItemResult,
  SnsUserPageResult,
} from '@aechak/api'

// SNS-01 프로필(b7-st-4), 팔로워/팔로잉(b7-st-5), 차단/뮤트 관리(b7-st-8), 로그인 안내 시트(b13-st-2) E2E.
// 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml을 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과
// Allow-Credentials, OPTIONS 방어 필수). 마이 메뉴의 SNS 진입 행은 SNS_SERVER_AVAILABLE=false로 숨어 있어 경로로 바로 연다.
// 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5175'
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

// 캡처에서 프로필 이미지가 실제로 그려졌는지 보이도록 단색 이미지를 쓴다.
function avatar(color: string) {
  return `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22%3E%3Crect width=%2280%22 height=%2280%22 fill=%22%23${color}%22/%3E%3C/svg%3E`
}

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const BORI_ID = '01K8E2E0SNSUSER000000BORI'
const ME_ID = '01K8E2E0SNSUSER00000000ME'
// 1월생이라 오늘 날짜와 관계없이 올해 나이가 정해진다(petAge).
const BORI_AGE = `${new Date().getFullYear() - 2021}살`

const BORI: SnsProfileResult = {
  publicId: BORI_ID,
  nickname: '보리언니',
  profileImageUrl: avatar('E8B04B'),
  bio: '골든리트리버 보리랑 코숏 나비와 살아요\n주말마다 한강 산책',
  pets: [
    { breedLabel: '골든리트리버', birthYearMonth: '2021-01' },
    { breedLabel: '코리안숏헤어', birthYearMonth: null },
  ],
  postCount: 0,
  followerCount: 128,
  followingCount: 57,
  isMe: false,
  following: false,
  blockedByMe: false,
  mutedByMe: false,
}

// 내가 차단한 계정: 닉네임과 이미지만 오고 소개글, 펫, 수는 null(계약 P11).
const BORI_BLOCKED: SnsProfileResult = {
  ...BORI,
  bio: null,
  pets: null,
  postCount: null,
  followerCount: null,
  followingCount: null,
  blockedByMe: true,
}

const ME: SnsProfileResult = {
  publicId: ME_ID,
  nickname: '콩이집사',
  profileImageUrl: avatar('7BA7D9'),
  bio: '말티즈 콩이 기록용',
  pets: [{ breedLabel: '말티즈', birthYearMonth: '2023-01' }],
  postCount: 0,
  followerCount: 12,
  followingCount: 34,
  isMe: true,
  following: false,
  blockedByMe: false,
  mutedByMe: false,
}

const FOLLOWERS: SnsUserItemResult[] = [
  {
    publicId: '01K8E2E0SNSUSER0000HODU01',
    nickname: '호두아빠',
    profileImageUrl: avatar('A3C585'),
    petSummary: { breedLabel: '골든리트리버', activePetCount: 2 },
    isMe: false,
    following: false,
  },
  {
    publicId: '01K8E2E0SNSUSER0000NABI01',
    nickname: '나비네',
    profileImageUrl: null,
    petSummary: { breedLabel: '러시안블루', activePetCount: 1 },
    isMe: false,
    following: true,
  },
  {
    publicId: '01K8E2E0SNSUSER0000NOPET1',
    nickname: '산책러',
    profileImageUrl: avatar('D98B7B'),
    petSummary: null,
    isMe: false,
    following: false,
  },
  {
    publicId: ME_ID,
    nickname: ME.nickname,
    profileImageUrl: ME.profileImageUrl,
    petSummary: { breedLabel: '말티즈', activePetCount: 1 },
    isMe: true,
    following: false,
  },
]

const BLOCKS: SnsRelationItemResult[] = [
  { publicId: '01K8E2E0SNSUSER0000BLK001', nickname: '광고계정', profileImageUrl: null, createdAt: '2026-10-18T21:04:11' },
  {
    publicId: '01K8E2E0SNSUSER0000BLK002',
    nickname: '도배하는사람',
    profileImageUrl: avatar('9B9B9B'),
    createdAt: '2026-09-03T08:15:00',
  },
]

const MUTES: SnsRelationItemResult[] = [
  {
    publicId: '01K8E2E0SNSUSER0000MUT001',
    nickname: '하루세번올림',
    profileImageUrl: avatar('C9A0DC'),
    createdAt: '2026-10-20T12:00:00',
  },
]

interface StubOptions {
  /** false면 refresh 쿠키가 없는 비로그인(refresh 401) */
  member?: boolean
  /** 다른 사용자 프로필 응답. 404면 볼 수 없는 계정(130000) */
  profile?: SnsProfileResult | 404
}

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, opts: StubOptions = {}) {
  const member = opts.member ?? true
  let profile = opts.profile ?? BORI
  const calls = { toggles: [] as string[], followListQueries: [] as URLSearchParams[] }
  unexpected = []

  // 먼저 등록한 라우트가 나중에 확인된다. 아래 개별 스텁에 걸리지 않은 호출만 여기로 온다.
  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })

  // 새 페이지 로드는 메모리 access가 없어 프로필 경로의 beforeLoad가 refresh로 세션을 복원한다.
  await page.route(`${API}/auth/web/refresh`, route =>
    member
      ? fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } })
      : fulfill(route, 401, { errorCode: 20002, message: '인증이 필요합니다.' }),
  )

  await page.route(`${API}/sns/users/*`, route =>
    profile === 404
      ? fulfill(route, 404, { errorCode: 130000, message: '볼 수 없는 사용자입니다.' })
      : fulfill(route, 200, { data: profile }),
  )
  await page.route(`${API}/sns/me`, route => fulfill(route, 200, { data: ME }))

  await page.route(`${API}/sns/users/*/{follow,block,mute}`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    const kind = new URL(route.request().url()).pathname.split('/').pop()
    calls.toggles.push(`${method} ${kind}`)
    // 차단하면 다음 프로필 조회는 차단한 계정 응답이다.
    if (kind === 'block' && method === 'POST') profile = BORI_BLOCKED
    return fulfill(route, method === 'POST' ? 201 : 204)
  })

  await page.route(`${API}/sns/users/*/{followers,followings}*`, route => {
    const url = new URL(route.request().url())
    calls.followListQueries.push(url.searchParams)
    const nickname = url.searchParams.get('nickname')
    const base = url.pathname.endsWith('/followers') ? FOLLOWERS : FOLLOWERS.slice(0, 2)
    const body: SnsUserPageResult = {
      items: nickname ? base.filter(item => item.nickname.includes(nickname)) : base,
      totalCount: null,
      nextCursor: null,
      hasNext: false,
    }
    return fulfill(route, 200, { data: body })
  })

  // 차단 목록은 두 페이지 중 첫 페이지라 탭 수(totalCount)가 받은 행 수보다 크다.
  await page.route(`${API}/sns/me/blocks*`, route => {
    const body: SnsRelationPageResult = { items: BLOCKS, totalCount: 3, nextCursor: 'e2e-next', hasNext: true }
    return fulfill(route, 200, { data: body })
  })
  await page.route(`${API}/sns/me/mutes*`, route => {
    const body: SnsRelationPageResult = { items: MUTES, totalCount: 1, nextCursor: null, hasNext: false }
    return fulfill(route, 200, { data: body })
  })
  return calls
}

const profileUrl = `/sns/users/${BORI_ID}`

test('[AC-SNS01-E2E-001] 비로그인으로 다른 사용자 프로필을 보면 머리말, 펫, 수, 팔로우 버튼, 빈 게시물 탭이 보인다', async ({
  page,
}) => {
  await stubSns(page, { member: false })
  await page.goto(profileUrl)

  await expect(page.getByText('골든리트리버 보리랑 코숏 나비와 살아요')).toBeVisible()
  const pets = page.getByRole('list', { name: '펫' }).getByRole('listitem')
  // 대표 펫이 먼저 오고 생년월이 없는 펫은 품종만 쓴다.
  await expect(pets).toHaveText([`골든리트리버 / ${BORI_AGE}`, '코리안숏헤어'])
  await expect(page.getByRole('button', { name: '128 팔로워' })).toBeVisible()
  await expect(page.getByRole('button', { name: '57 팔로잉' })).toBeVisible()
  await expect(page.getByText('게시물', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '공유' })).toBeVisible()
  // 저장됨은 본인 프로필에만 있다.
  await expect(page.getByRole('tab')).toHaveText(['그리드', '영상', '리포스트'])
  await expect(page.getByText('아직 게시물이 없어요')).toBeVisible()
  await shot(page, 'sns-01-profile-guest')
})

test('[AC-SNS01-E2E-002] 로그인 상태에서 팔로우 중인 프로필은 팔로잉 버튼을 보여준다', async ({ page }) => {
  await stubSns(page, { profile: { ...BORI, following: true } })
  await page.goto(profileUrl)

  await expect(page.getByRole('button', { name: '팔로잉', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0)
  // 팔로우 중(4-B)이어도 메시지, 알림 버튼은 이번 범위에 없다.
  await expect(page.getByRole('button', { name: '메시지' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '더보기' })).toBeVisible()
  await shot(page, 'sns-02-profile-following')
})

test('[AC-SNS01-E2E-003] 내 프로필은 프로필 수정 진입과 저장됨 탭이 있고 팔로우 버튼과 더보기가 없다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto('/sns/me')

  await expect(page.getByRole('button', { name: '프로필 수정' })).toBeVisible()
  await expect(page.getByText('말티즈 콩이 기록용')).toBeVisible()
  await expect(page.getByRole('tab')).toHaveText(['그리드', '영상', '리포스트', '저장됨'])
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '더보기' })).toHaveCount(0)

  await page.getByRole('tab', { name: '저장됨' }).click()
  await expect(page.getByText('저장한 게시물이 없어요')).toBeVisible()
  await shot(page, 'sns-03-profile-me')
})

test('[AC-SNS01-E2E-004] 더보기 시트에서 차단하면 확인 Modal을 거쳐 차단한 계정 안내로 바뀐다', async ({ page }) => {
  const calls = await stubSns(page)
  await page.goto(profileUrl)
  // 공유는 시트가 아니라 프로필 버튼이다(F8).
  await expect(page.getByRole('button', { name: '공유' })).toBeVisible()

  await page.getByRole('button', { name: '더보기' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('차단하기')).toBeVisible()
  await expect(sheet.getByText('뮤트하기')).toBeVisible()
  await shot(page, 'sns-04-more-sheet')

  await sheet.getByText('차단하기').click()
  const modal = page.getByRole('dialog', { name: '차단할까요?' })
  await expect(modal).toContainText('보리언니님은 회원님의 게시물과 프로필을 볼 수 없고 서로 팔로우가 해제돼요.')
  expect(calls.toggles).toEqual([]) // 확인 전에는 차단 요청을 보내지 않는다
  await shot(page, 'sns-05-block-confirm')

  await modal.getByRole('button', { name: '차단', exact: true }).click()
  await expect(page.getByText('차단한 계정이에요')).toBeVisible()
  await expect(page.getByText('차단했어요')).toBeVisible()
  expect(calls.toggles).toEqual(['POST block'])
})

test('[AC-SNS01-E2E-005] 내가 차단한 프로필은 차단 안내와 차단 해제 버튼만 보여준다', async ({ page }) => {
  await stubSns(page, { profile: BORI_BLOCKED })
  await page.goto(profileUrl)

  await expect(page.getByText('차단한 계정이에요')).toBeVisible()
  await expect(page.getByText('차단을 해제하면 프로필을 다시 볼 수 있어요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '차단 해제' })).toBeVisible()
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '더보기' })).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await shot(page, 'sns-06-profile-blocked-by-me')
})

test('[AC-SNS01-E2E-006] 뮤트한 프로필은 뮤트 상태와 해제 버튼을 보여준다', async ({ page }) => {
  await stubSns(page, { profile: { ...BORI, mutedByMe: true } })
  await page.goto(profileUrl)

  await expect(page.getByText('뮤트한 계정이에요')).toBeVisible()
  await expect(page.getByRole('button', { name: '뮤트 해제' })).toBeVisible()
  // 뮤트해도 팔로우 버튼과 머리말은 그대로다.
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toBeVisible()
  await shot(page, 'sns-07-profile-muted')
})

test('[AC-SNS01-E2E-007] 404 130000이면 볼 수 없는 계정 안내만 보여준다', async ({ page }) => {
  await stubSns(page, { profile: 404 })
  await page.goto(profileUrl)

  await expect(page.getByText('볼 수 없는 계정이에요')).toBeVisible()
  await expect(page.getByText('계정이 없거나 지금은 볼 수 없어요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '더보기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '팔로우', exact: true })).toHaveCount(0)
  await shot(page, 'sns-08-profile-unavailable')
})

test('[AC-SNS01-E2E-008] 비로그인으로 팔로우를 누르면 요청 없이 SNS 문구의 로그인 안내 시트가 열린다', async ({
  page,
}) => {
  const calls = await stubSns(page, { member: false })
  await page.goto(profileUrl)

  await page.getByRole('button', { name: '팔로우', exact: true }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('로그인이 필요해요')).toBeVisible()
  await expect(sheet.getByText('팔로우는 로그인한 회원만 이용할 수 있어요.')).toBeVisible()
  await expect(sheet.getByText('로그인하면 보던 화면으로 돌아와 이어서 할 수 있어요.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '로그인 / 회원가입' })).toBeVisible()
  expect(calls.toggles).toEqual([])
  await shot(page, 'sns-09-guest-follow-sheet')
})

test('[AC-SNS01-E2E-009] 팔로워 탭은 프로필의 수를 쓰고 행마다 펫 요약과 팔로우 버튼, 내 행은 버튼이 없다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`${profileUrl}/follows?tab=followers`)

  // 목록 totalCount는 항상 null이라 탭 수는 프로필 응답(128, 57)이다. 수는 라벨 옆 span이라 접근성 이름에 공백이 없다.
  await expect(page.getByRole('tab', { name: '팔로워128' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: '팔로잉57' })).toBeVisible()
  await expect(page.getByText('골든리트리버 외 1')).toBeVisible()
  await expect(page.getByText('러시안블루', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '호두아빠 팔로우' })).toBeVisible()
  await expect(page.getByRole('button', { name: '나비네 팔로잉' })).toBeVisible()
  await expect(page.getByRole('button', { name: '산책러 팔로우' })).toBeVisible()
  await expect(page.getByText(ME.nickname)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(`^${ME.nickname} 팔로`) })).toHaveCount(0)
  await shot(page, 'sns-10-followers')
})

test('[AC-SNS01-E2E-010] 팔로잉 탭에서 맞는 사람이 없는 닉네임을 검색하면 검색 결과 없음 안내를 보여준다', async ({
  page,
}) => {
  const calls = await stubSns(page)
  await page.goto(`${profileUrl}/follows?tab=followings`)
  await expect(page.getByRole('button', { name: '나비네 팔로잉' })).toBeVisible()

  await page.getByRole('searchbox', { name: '닉네임 검색' }).fill('없는닉네임')
  await expect(page.getByText('검색 결과가 없어요')).toBeVisible()
  // 디바운스한 검색어를 커서 없이 첫 페이지부터 보낸다.
  const last = calls.followListQueries.at(-1)
  expect(last?.get('nickname')).toBe('없는닉네임')
  expect(last?.get('cursor')).toBeNull()
  await shot(page, 'sns-11-followings-search-empty')
})

test('[AC-SNS01-E2E-011] 차단/뮤트 관리는 첫 페이지 totalCount를 탭 수로 쓰고 차단일과 뮤트 고정 문구를 보여준다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto('/mypage/sns-relations')

  await expect(page.getByRole('tab', { name: '차단3' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: '뮤트1' })).toBeVisible()
  await expect(page.getByText('차단 / 10월 18일')).toBeVisible()
  await expect(page.getByText('차단 / 9월 3일')).toBeVisible()
  await expect(page.getByRole('button', { name: '광고계정 차단 해제' })).toBeVisible()
  await expect(page.getByRole('button', { name: '더보기' })).toBeVisible()
  await shot(page, 'sns-12-relations-blocks')

  await page.getByRole('tab', { name: '뮤트1' }).click()
  await expect(page.getByText('뮤트한 계정의 게시물은 피드에 보이지 않아요. 상대는 뮤트 사실을 알 수 없어요.')).toBeVisible()
  await expect(page.getByText('뮤트 / 게시물 비노출')).toBeVisible()
  await expect(page.getByRole('button', { name: '하루세번올림 뮤트 해제' })).toBeVisible()
  await shot(page, 'sns-13-relations-mutes')
})

test('[AC-SNS01-E2E-012] 관리 목록에서 차단 해제를 누르면 확인 Modal이 먼저 열린다', async ({ page }) => {
  const calls = await stubSns(page)
  await page.goto('/mypage/sns-relations')

  await page.getByRole('button', { name: '광고계정 차단 해제' }).click()
  const modal = page.getByRole('dialog', { name: '차단을 해제할까요?' })
  await expect(modal).toContainText(
    '광고계정님이 회원님의 게시물과 프로필을 다시 볼 수 있어요. 해제된 팔로우는 되살아나지 않아요.',
  )
  await expect(modal.getByRole('button', { name: '해제' })).toBeVisible()
  expect(calls.toggles).toEqual([])
  await shot(page, 'sns-14-relations-unblock-confirm')
})

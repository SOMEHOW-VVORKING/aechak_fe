import { test, expect, type Page, type Route } from '@playwright/test'
import type {
  SnsFeedPageResult,
  SnsPostDetailResult,
  SnsPostGridPageResult,
  SnsProfileResult,
  SnsRelationPageResult,
  SubmitReportRequest,
} from '@aechak/api'

// SNS-07 신고(b8-st-1 1-A) E2E. 게시물 상세와 피드 카드의 더보기, 프로필 앱바 더보기, 차단 관리 목록 행에서 같은 신고 시트를
// 열고 POST /reports에 SNS_POST, SNS_USER가 나가는지 본다. 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml의 신고 접수를
// 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수). 각 상태를 PR 첨부용으로
// test-results/pr-c(gitignore)에 찍는다.

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
const BORI = { publicId: '01K8E2E0SNSUSER000000BORI', nickname: '보리언니', profileImageUrl: solid('E8B04B', 80, 80) }
const HODU = { publicId: '01K8E2E0SNSUSER0000HODU01', nickname: '호두아빠', profileImageUrl: null }
const SPAM = { publicId: '01K8E2E0SNSUSER0000SPAM01', nickname: '광고계정01', profileImageUrl: null }

const POST: SnsPostDetailResult = {
  publicId: '01K8E2E0SNSPOST0000000001',
  author: BORI,
  pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-01' },
  caption: '보리랑 한강 산책 다녀왔어요. 할인 링크는 프로필에서 확인해 주세요',
  hashtags: ['한강산책'],
  photoUrls: [solid('E8B04B')],
  video: null,
  likeCount: 12,
  commentCount: 3,
  repostCount: 1,
  edited: false,
  createdAt: '2026-11-04T09:00:00',
  isMine: false,
  following: false,
  mutedByMe: false,
  reposted: false,
  saved: false,
}

const FOLLOWING: SnsFeedPageResult = {
  items: [{ post: POST, repostedBy: { publicId: HODU.publicId, nickname: HODU.nickname } }],
  nextCursor: null,
  hasNext: false,
}

const BORI_PROFILE: SnsProfileResult = {
  publicId: BORI.publicId,
  nickname: BORI.nickname,
  profileImageUrl: BORI.profileImageUrl,
  bio: '골든리트리버 보리랑 살아요',
  pets: [{ breedLabel: '골든리트리버', birthYearMonth: '2021-01' }],
  postCount: 1,
  followerCount: 128,
  followingCount: 57,
  isMe: false,
  following: false,
  blockedByMe: false,
  mutedByMe: false,
  blockingMe: false,
}
const EMPTY_GRID: SnsPostGridPageResult = { items: [], nextCursor: null, hasNext: false }

const BLOCKS: SnsRelationPageResult = {
  items: [{ ...SPAM, createdAt: '2026-10-12T10:00:00' }],
  totalCount: 1,
  nextCursor: null,
  hasNext: false,
}
const MUTES: SnsRelationPageResult = { items: [], totalCount: 0, nextCursor: null, hasNext: false }

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

/** 신고 접수 응답. 기본은 201이고 테스트가 409로 바꾼다 */
interface ReportReply {
  status: number
  errorCode?: number
}

async function stubSns(page: Page) {
  const reports: SubmitReportRequest[] = []
  const reply: ReportReply = { status: 201 }
  unexpected = []

  // 먼저 등록한 라우트가 나중에 확인된다. 아래 개별 스텁에 걸리지 않은 호출만 여기로 온다.
  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  await page.route(`${API}/auth/web/refresh`, route =>
    fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } }),
  )
  await page.route(`${API}/sns/feeds/*`, route => fulfill(route, 200, { data: FOLLOWING }))
  await page.route(`${API}/sns/posts/*`, route => fulfill(route, 200, { data: POST }))
  await page.route(`${API}/sns/users/*`, route => fulfill(route, 200, { data: BORI_PROFILE }))
  await page.route(`${API}/sns/users/*/{posts,videos,reposts}*`, route => fulfill(route, 200, { data: EMPTY_GRID }))
  await page.route(`${API}/sns/me/blocks*`, route => fulfill(route, 200, { data: BLOCKS }))
  await page.route(`${API}/sns/me/mutes*`, route => fulfill(route, 200, { data: MUTES }))
  await page.route(`${API}/reports`, route => {
    if (route.request().method() === 'POST') reports.push(route.request().postDataJSON() as SubmitReportRequest)
    return reply.status === 201
      ? fulfill(route, 201)
      : fulfill(route, reply.status, { errorCode: reply.errorCode, message: '' })
  })
  return { reports, reply }
}

const reportSheet = (page: Page) => page.getByRole('dialog', { name: '신고하기' })

async function openPostReport(page: Page) {
  await page.getByRole('button', { name: '더보기' }).click()
  await page.getByRole('dialog', { name: '게시물 더보기' }).getByRole('button', { name: '신고하기' }).click()
  await expect(reportSheet(page).getByText('신고 사유를 선택해 주세요')).toBeVisible()
}

test('[AC-SNS-RPT-E2E-001] 게시물 더보기의 신고하기로 사유와 상세를 적어 제출하면 접수 토스트가 나온다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await expect(page.getByText(POST.caption!)).toBeVisible()
  await page.getByRole('button', { name: '더보기' }).click()
  const more = page.getByRole('dialog', { name: '게시물 더보기' })
  await expect(more.getByRole('button', { name: '신고하기' })).toBeVisible()
  await shot(page, 'sns-report-01-post-more-sheet')

  await more.getByRole('button', { name: '신고하기' }).click()
  const sheet = reportSheet(page)
  await expect(sheet.getByText('보리언니 님의 게시물')).toBeVisible()
  await sheet.getByText('욕설/혐오 표현').click()
  await sheet.getByLabel('상세 내용 (선택)').fill('글마다 할인 링크를 붙이고 댓글에 욕을 해요')
  await expect(sheet.getByRole('button', { name: '신고 제출' })).toBeEnabled()
  await shot(page, 'sns-report-02-post-sheet-filled')

  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  await expect(sheet).toBeHidden()
  await shot(page, 'sns-report-04-success-toast')
  expect(reports).toEqual([
    { targetType: 'SNS_POST', targetId: POST.publicId, reasonCode: 'ABUSE', reasonText: '글마다 할인 링크를 붙이고 댓글에 욕을 해요' },
  ])
})

test('[AC-SNS-RPT-E2E-002] 기타를 고르고 상세를 비우면 필수 안내가 나오고 제출할 수 없다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openPostReport(page)

  const sheet = reportSheet(page)
  await sheet.getByText('기타', { exact: true }).click()
  await expect(sheet.getByLabel('상세 내용 (필수)')).toBeVisible()
  await expect(sheet.getByText('기타 사유는 상세 내용을 적어 주세요.')).toBeVisible()
  await sheet.getByLabel('상세 내용 (필수)').fill('   ')
  await expect(sheet.getByRole('button', { name: '신고 제출' })).toBeDisabled()
  await shot(page, 'sns-report-03-other-empty')
  expect(reports).toEqual([])
})

test('[AC-SNS-RPT-E2E-003] 이미 신고한 게시물은 시트를 닫고 이미 신고했다고 알린다', async ({ page }) => {
  const { reply } = await stubSns(page)
  reply.status = 409
  reply.errorCode = 130802
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openPostReport(page)

  await reportSheet(page).getByText('스팸/광고').click()
  await reportSheet(page).getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('이미 신고한 게시물이에요')).toBeVisible()
  await expect(reportSheet(page)).toBeHidden()
  await shot(page, 'sns-report-05-already-reported')
})

test('[AC-SNS-RPT-E2E-004] 제출이 실패하면 시트에 안내가 남고 다시 제출할 수 있다', async ({ page }) => {
  const { reply, reports } = await stubSns(page)
  reply.status = 500
  reply.errorCode = 90000
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openPostReport(page)

  const sheet = reportSheet(page)
  await sheet.getByText('사기/허위 정보').click()
  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(sheet.getByText('신고를 접수하지 못했어요. 다시 시도해 주세요')).toBeVisible()
  await expect(sheet.getByRole('radio', { name: '사기/허위 정보' })).toBeChecked()
  await shot(page, 'sns-report-08-submit-failed')

  reply.status = 201
  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toHaveLength(2)
})

test('[AC-SNS-RPT-E2E-005] 리포스트 카드 더보기에서 신고하면 원글을 신고한다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto('/sns/feed')

  await expect(page.getByText('호두아빠님이 리포스트했어요')).toBeVisible()
  await openPostReport(page)
  await reportSheet(page).getByText('스팸/광고').click()
  await reportSheet(page).getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toEqual([{ targetType: 'SNS_POST', targetId: POST.publicId, reasonCode: 'SPAM', reasonText: null }])
})

test('[AC-SNS-RPT-E2E-006] 다른 사람 프로필 앱바 더보기에서 사용자를 신고한다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/users/${BORI.publicId}`)

  await expect(page.getByText('골든리트리버 보리랑 살아요')).toBeVisible()
  await page.getByRole('button', { name: '더보기' }).click()
  await page.getByRole('dialog', { name: '프로필 더보기' }).getByRole('button', { name: '신고하기' }).click()
  const sheet = reportSheet(page)
  await expect(sheet.getByText('보리언니 님', { exact: true })).toBeVisible()
  await sheet.getByText('스팸/광고').click()
  await shot(page, 'sns-report-06-profile-sheet')

  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toEqual([{ targetType: 'SNS_USER', targetId: BORI.publicId, reasonCode: 'SPAM', reasonText: null }])
})

test('[AC-SNS-RPT-E2E-007] 차단 관리 목록의 차단 행에서 사용자를 신고한다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto('/mypage/sns-relations')

  await expect(page.getByText('광고계정01')).toBeVisible()
  await shot(page, 'sns-report-07-blocked-row')
  await page.getByRole('button', { name: '광고계정01 신고' }).click()
  const sheet = reportSheet(page)
  await expect(sheet.getByText('광고계정01 님', { exact: true })).toBeVisible()
  await sheet.getByText('스팸/광고').click()
  await shot(page, 'sns-report-07-blocked-row-sheet')

  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toEqual([{ targetType: 'SNS_USER', targetId: SPAM.publicId, reasonCode: 'SPAM', reasonText: null }])
})

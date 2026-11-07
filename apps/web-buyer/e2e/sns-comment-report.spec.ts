import { test, expect, type Page, type Route } from '@playwright/test'
import type { SnsCommentItemResult, SnsPostDetailResult, SubmitReportRequest } from '@aechak/api'

// SNS-07 댓글 신고(b8-st-1 1-A) E2E. 게시물 상세 댓글 목록에서 남의 댓글을 길게 눌러 연 댓글 메뉴의 신고로 신고 시트를 열고
// POST /reports에 SNS_COMMENT가 나가는지 본다. 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml의 신고 접수를 재현한다
// (교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수). 각 상태를 PR 첨부용으로
// test-results/pr-cr(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-cr'

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
  return json === undefined ? route.fulfill({ status, headers: CORS }) : route.fulfill({ status, headers: CORS, json })
}

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const ME = { publicId: '01K8E2E0SNSUSER0000000ME0', nickname: '보리언니', profileImageUrl: null }
const COCO = { publicId: '01K8E2E0SNSUSER000000COCO', nickname: '코코집사', profileImageUrl: null }
const MONG = { publicId: '01K8E2E0SNSUSER000000MONG', nickname: '몽이아빠', profileImageUrl: null }

const POST: SnsPostDetailResult = {
  publicId: '01K8E2E0SNSPOST0000000001',
  author: COCO,
  pet: { breedLabel: '말티즈', birthYearMonth: '2022-03' },
  caption: '코코 오늘 미용했어요',
  hashtags: ['말티즈'],
  photoUrls: [],
  video: null,
  likeCount: 8,
  commentCount: 3,
  repostCount: 0,
  edited: false,
  createdAt: '2026-11-04T09:00:00',
  isMine: false,
  following: true,
  mutedByMe: false,
  reposted: false,
  saved: false,
  liked: false,
}

const commentId = (n: number) => `01K8E2E0SNSCOMMENT0000${String(n).padStart(3, '0')}`

function item(n: number, author: SnsCommentItemResult['author'], fields: Partial<SnsCommentItemResult> = {}): SnsCommentItemResult {
  return {
    publicId: commentId(n),
    parentPublicId: null,
    status: 'ACTIVE',
    author,
    content: null,
    likeCount: 0,
    liked: false,
    edited: false,
    replyable: true,
    isMine: author?.publicId === ME.publicId,
    createdAt: '2026-11-04T10:00:00',
    ...fields,
  }
}

// 대상 카드에서 한 줄로 잘리는지 보려고 몽이아빠 댓글은 길게 쓴다.
const LONG = '사료 반값 할인 링크는 제 프로필에 있어요. 지금 들어가면 오늘만 추가 쿠폰도 드려요. 놓치지 마세요'
const THREAD = (): SnsCommentItemResult[] => [
  item(1, MONG, { content: LONG }),
  item(2, COCO, { parentPublicId: commentId(1), content: '광고는 사양할게요' }),
  item(3, ME, { content: '산책 코스 어디예요?' }),
]

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, { member = true }: { member?: boolean } = {}) {
  const reports: SubmitReportRequest[] = []
  const reply: { status: number; errorCode?: number } = { status: 201 }
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
  await page.route(`${API}/sns/posts/*`, route => fulfill(route, 200, { data: POST }))
  await page.route(`${API}/sns/posts/*/comments*`, route => {
    const items = member ? THREAD() : THREAD().map(i => ({ ...i, isMine: false }))
    return fulfill(route, 200, { data: { items, nextCursor: null, hasNext: false } })
  })
  await page.route(`${API}/reports`, route => {
    if (route.request().method() === 'POST') reports.push(route.request().postDataJSON() as SubmitReportRequest)
    return reply.status === 201
      ? fulfill(route, 201)
      : fulfill(route, reply.status, { errorCode: reply.errorCode, message: '' })
  })
  return { reports, reply }
}

const reportSheet = (page: Page) => page.getByRole('dialog', { name: '신고하기' })
const commentMenu = (page: Page) => page.getByRole('dialog', { name: '댓글 메뉴' })

/** 댓글을 길게 누르는 대신 contextmenu(우클릭)로 댓글 메뉴를 연다. 앱은 둘을 같게 다룬다 */
async function openCommentMenu(page: Page, text: string) {
  await page.getByRole('region', { name: '댓글' }).getByText(text).click({ button: 'right' })
  await expect(commentMenu(page).getByRole('button', { name: '신고', exact: true })).toBeVisible()
}

async function openCommentReport(page: Page, text: string) {
  await openCommentMenu(page, text)
  await commentMenu(page).getByRole('button', { name: '신고', exact: true }).click()
  await expect(reportSheet(page).getByText('신고 사유를 선택해 주세요')).toBeVisible()
}

test('[AC-SNS-RPT-E2E-008] 남의 댓글 메뉴의 신고로 댓글 대상 카드를 보고 제출하면 접수 토스트가 나온다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await openCommentMenu(page, LONG)
  await expect(commentMenu(page).getByRole('button', { name: '차단하기' })).toBeVisible()
  await shot(page, 'sns-comment-report-01-comment-menu')

  await commentMenu(page).getByRole('button', { name: '신고', exact: true }).click()
  const sheet = reportSheet(page)
  await expect(sheet.getByText('몽이아빠 님의 댓글')).toBeVisible()
  await expect(sheet.getByText(LONG)).toHaveCSS('text-overflow', 'ellipsis')
  await sheet.getByText('스팸/광고').click()
  await shot(page, 'sns-comment-report-02-sheet')

  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  await expect(sheet).toBeHidden()
  await shot(page, 'sns-comment-report-04-accepted-toast')
  expect(reports).toEqual([{ targetType: 'SNS_COMMENT', targetId: commentId(1), reasonCode: 'SPAM', reasonText: null }])
})

test('[AC-SNS-RPT-E2E-009] 대댓글은 그 대댓글을 신고하고 내 댓글에는 댓글 메뉴가 없다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await expect(page.getByText('산책 코스 어디예요?')).toBeVisible()
  await page.getByText('산책 코스 어디예요?').click({ button: 'right' })
  await expect(commentMenu(page)).toBeHidden()

  await openCommentReport(page, '광고는 사양할게요')
  await expect(reportSheet(page).getByText('코코집사 님의 댓글')).toBeVisible()
  await reportSheet(page).getByText('욕설/혐오 표현').click()
  await reportSheet(page).getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toEqual([{ targetType: 'SNS_COMMENT', targetId: commentId(2), reasonCode: 'ABUSE', reasonText: null }])
})

test('[AC-SNS-RPT-E2E-010] 기타를 고르고 상세를 비우면 필수 안내가 나오고 제출할 수 없다', async ({ page }) => {
  const { reports } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openCommentReport(page, LONG)

  const sheet = reportSheet(page)
  await sheet.getByText('기타', { exact: true }).click()
  await expect(sheet.getByLabel('상세 내용 (필수)')).toBeVisible()
  await expect(sheet.getByText('기타 사유는 상세 내용을 적어 주세요.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: '신고 제출' })).toBeDisabled()
  await shot(page, 'sns-comment-report-03-other-required')
  expect(reports).toEqual([])
})

test('[AC-SNS-RPT-E2E-011] 이미 신고한 댓글은 시트를 닫고 이미 신고했다고 알린다', async ({ page }) => {
  const { reply } = await stubSns(page)
  reply.status = 409
  reply.errorCode = 130804
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openCommentReport(page, LONG)

  await reportSheet(page).getByText('스팸/광고').click()
  await reportSheet(page).getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('이미 신고한 댓글이에요')).toBeVisible()
  await expect(reportSheet(page)).toBeHidden()
  await shot(page, 'sns-comment-report-05-already-reported-toast')
})

test('[AC-SNS-RPT-E2E-012] 제출이 실패하면 시트에 안내와 입력이 남고 다시 제출할 수 있다', async ({ page }) => {
  const { reply, reports } = await stubSns(page)
  reply.status = 500
  reply.errorCode = 90000
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openCommentReport(page, LONG)

  const sheet = reportSheet(page)
  await sheet.getByText('사기/허위 정보').click()
  await sheet.getByLabel('상세 내용 (선택)').fill('댓글마다 같은 링크를 달아요')
  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(sheet.getByText('신고를 접수하지 못했어요. 다시 시도해 주세요')).toBeVisible()
  await expect(sheet.getByRole('radio', { name: '사기/허위 정보' })).toBeChecked()
  await expect(sheet.getByLabel('상세 내용 (선택)')).toHaveValue('댓글마다 같은 링크를 달아요')
  await shot(page, 'sns-comment-report-06-failure-kept-in-sheet')

  reply.status = 201
  await sheet.getByRole('button', { name: '신고 제출' }).click()
  await expect(page.getByText('신고가 접수되었습니다')).toBeVisible()
  expect(reports).toHaveLength(2)
})

test('[AC-SNS-RPT-E2E-013] 360px 화면에서도 댓글 신고 시트가 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)
  await openCommentReport(page, LONG)

  await reportSheet(page).getByText('스팸/광고').click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await shot(page, 'sns-comment-report-07-sheet-360')
})

test('[AC-SNS-RPT-E2E-014] 비로그인이 댓글 메뉴의 신고를 누르면 로그인 안내 시트를 연다', async ({ page }) => {
  const { reports } = await stubSns(page, { member: false })
  await page.goto(`/sns/posts/${POST.publicId}`)

  await openCommentMenu(page, LONG)
  await commentMenu(page).getByRole('button', { name: '신고', exact: true }).click()
  await expect(page.getByText(/신고는 로그인한 회원만 이용할 수 있어요/)).toBeVisible()
  await expect(reportSheet(page)).toBeHidden()
  await shot(page, 'sns-comment-report-08-guest-login')
  expect(reports).toEqual([])
})

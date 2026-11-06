import { test, expect, type Page, type Route } from '@playwright/test'
import type { AdminReportDetailData, AdminReportSummary } from '@aechak/api'

// SNS-07 어드민 신고 처리의 SNS 게시물 대상 E2E. 목록 유형 pill과 대상 필터에 SNS 게시물이 나오고, 상세의 비공개 전환이
// 게시물 삭제로 적히는지 본다. 실백엔드 없이 page.route 스텁으로 계약을 재현한다. CORS는 admin-roster.spec과 같다 — 어드민
// 경로는 bearer 전용이라 Allow-Credentials를 빼고, refresh만 정확한 origin과 Allow-Credentials를 둔다.
const ORIGIN = 'http://localhost:5174'
const ADMIN_API = 'http://localhost:8082/api/v1'
const API = 'http://localhost:8080/api/v1'

const ADMIN_CORS = { 'Access-Control-Allow-Origin': ORIGIN }
const AUTH_CORS = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Credentials': 'true' }
const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '600',
}

function fulfillAdmin(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...ADMIN_CORS, ...PREFLIGHT_HEADERS } })
  }
  return json === undefined
    ? route.fulfill({ status, headers: ADMIN_CORS })
    : route.fulfill({ status, headers: ADMIN_CORS, json })
}

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const SNS_POST: AdminReportSummary = {
  targetType: 'SNS_POST',
  reportId: 31,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1C3D5J',
  targetName: '오늘 산책 다녀왔어요. 할인 링크는 프로필에 있어요',
  targetOwnerUserId: 3521,
  targetOwnerNickname: '콩이맘',
  reasonCode: 'SPAM',
  reportCount: 2,
  reportedAt: '2026-11-05T10:20:00',
  status: 'RECEIVED',
  decision: null,
  decisionReasonCode: null,
  decidedAt: null,
}
const DELETED_POST: AdminReportSummary = {
  ...SNS_POST,
  reportId: 32,
  targetKey: '01JF9W3Q6R8T2V4X7Z9B1C3D6K',
  targetName: null,
  reportedAt: '2026-11-04T18:00:00',
}
const PRODUCT: AdminReportSummary = {
  ...SNS_POST,
  targetType: 'PRODUCT',
  reportId: 31,
  targetKey: '01HZXP0000000000000000031',
  targetName: '프리미엄 관절 영양제 180정',
  targetOwnerUserId: 2041,
  targetOwnerNickname: '멍멍마켓',
  reasonCode: 'FALSE_AD',
  reportCount: 7,
  reportedAt: '2026-10-26T09:12:00',
}
const ROWS = [SNS_POST, DELETED_POST, PRODUCT]

const DETAIL: AdminReportDetailData = {
  report: SNS_POST,
  reporterId: 5201,
  reasonText: '산책 글마다 같은 할인 링크를 붙여요.',
  history: [
    {
      reportId: 31,
      reasonCode: 'SPAM',
      reasonText: '산책 글마다 같은 할인 링크를 붙여요.',
      reportedAt: '2026-11-05T10:20:00',
      status: 'RECEIVED',
    },
  ],
  decision: null,
}

async function stubAdminApi(page: Page) {
  const listQueries: (string | null)[] = []
  // 셸의 배지와 다른 화면 조회는 빈 목록으로 답한다. 먼저 등록한 라우트가 나중에 확인된다.
  await page.route(`${ADMIN_API}/admin/**`, route =>
    fulfillAdmin(route, 200, { data: { items: [], totalCount: 0, nextCursor: null, hasNext: false } }),
  )
  await page.route(`${ADMIN_API}/admin/reports?*`, route => {
    const url = new URL(route.request().url())
    const targetType = url.searchParams.get('targetType')
    if (route.request().method() === 'GET') listQueries.push(targetType)
    const items = ROWS.filter(row => targetType == null || row.targetType === targetType)
    return fulfillAdmin(route, 200, {
      data: { items, totalCount: url.searchParams.get('size') === '1' ? 1 : items.length, nextCursor: null, hasNext: false },
    })
  })
  await page.route(`${ADMIN_API}/admin/reports/SNS_POST/31`, route => fulfillAdmin(route, 200, { data: DETAIL }))
  await page.route(`${API}/auth/web/refresh`, route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...AUTH_CORS, ...PREFLIGHT_HEADERS } })
    }
    return route.fulfill({
      status: 200,
      headers: AUTH_CORS,
      json: { data: { accessToken: 'e2e-admin-token', tokenType: 'Bearer', expiresIn: 1800 } },
    })
  })
  return { listQueries }
}

test.use({ viewport: { width: 1440, height: 900 } })

// PR 첨부용 캡처(test-results는 gitignore). dev 전용 Query Devtools 버튼이 찍히지 않게 숨긴다.
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `test-results/pr-c/${name}.png`, animations: 'disabled' })
}

test('[AC-SNS-RPT-E2E-020] 신고 목록에 SNS 게시물 행이 나오고 상세의 비공개 전환은 게시물 삭제로 적힌다', async ({ page }) => {
  const { listQueries } = await stubAdminApi(page)
  await page.goto('/reports')

  const table = page.getByRole('table')
  await expect(table.getByRole('button', { name: SNS_POST.targetName! })).toBeVisible()
  // 지운 게시물은 캡션이 없어 닉네임이 아니라 종류와 publicId로 읽힌다.
  await expect(table.getByRole('button', { name: `SNS 게시물 ${DELETED_POST.targetKey}` })).toBeVisible()
  await expect(table.getByText('SNS 게시물', { exact: true })).toHaveCount(2)
  await shot(page, 'admin-sns-report-01-list')

  await table.getByRole('button', { name: SNS_POST.targetName! }).click()
  const drawer = page.getByRole('dialog', { name: '신고 상세' })
  await expect(drawer.getByText('게시물 삭제', { exact: true })).toBeVisible()
  await expect(drawer.getByText('게시물만 운영자 삭제')).toBeVisible()
  await shot(page, 'admin-sns-report-02-detail')
  expect(listQueries[0]).toBeNull()
})

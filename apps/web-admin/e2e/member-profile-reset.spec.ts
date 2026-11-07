import { test, expect, type Page, type Route } from '@playwright/test'
import type { AdminMemberDetailData, AdminMemberSummary } from '@aechak/api'

// SNS-07 운영자 프로필 초기화 E2E. 회원 상세가 현재 프로필 이미지와 소개글을 보여주고, 초기화하면 두 값만 비는지 본다.
// 실백엔드 없이 page.route 스텁으로 계약을 재현한다. CORS는 sns-reports.spec과 같다.
const ORIGIN = 'http://localhost:5174'
const ADMIN_API = 'http://localhost:8082/api/v1'
const API = 'http://localhost:8080/api/v1'
const IMAGE_URL = 'https://cdn.example.com/users/3521/profile.svg'

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
const MEMBER: AdminMemberSummary = {
  userId: 3521,
  publicId: '01JF9W3Q6R8T2V4X7Z9B1C3D5J',
  nickname: '콩이맘',
  status: 'ACTIVE',
  storedStatus: 'ACTIVE',
  sanctionUntil: null,
  warningCount: 0,
  reportCount: 3,
  joinedAt: '2026-05-02T09:00:00',
}

async function stubAdminApi(page: Page) {
  const resets: string[] = []
  let detail: AdminMemberDetailData = {
    member: MEMBER,
    profileImageUrl: IMAGE_URL,
    bio: '할인 링크는 DM 주세요. 010-0000-0000',
    sanctions: [],
  }
  // 셸의 배지와 다른 화면 조회는 빈 목록으로 답한다. 먼저 등록한 라우트가 나중에 확인된다.
  await page.route(`${ADMIN_API}/admin/**`, route =>
    fulfillAdmin(route, 200, { data: { items: [], totalCount: 0, nextCursor: null, hasNext: false } }),
  )
  await page.route(`${ADMIN_API}/admin/members?*`, route =>
    fulfillAdmin(route, 200, { data: { items: [MEMBER], totalCount: 1, nextCursor: null, hasNext: false } }),
  )
  await page.route(`${ADMIN_API}/admin/members/${MEMBER.userId}`, route => fulfillAdmin(route, 200, { data: detail }))
  await page.route(`${ADMIN_API}/admin/members/${MEMBER.userId}/profile/reset`, route => {
    if (route.request().method() === 'POST') {
      resets.push(route.request().url())
      detail = { ...detail, profileImageUrl: null, bio: null }
    }
    return fulfillAdmin(route, 204)
  })
  await page.route(IMAGE_URL, route =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#f4b183"/><circle cx="36" cy="30" r="14" fill="#fff"/><rect x="16" y="48" width="40" height="16" rx="8" fill="#fff"/></svg>',
    }),
  )
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
  return { resets }
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

test('[AC-MEMBER-E2E-012] 회원 상세의 프로필을 초기화하면 이미지와 소개글만 비운다', async ({ page }) => {
  const { resets } = await stubAdminApi(page)
  await page.goto('/members')

  await page.getByRole('table').getByRole('button', { name: String(MEMBER.userId) }).click()
  const drawer = page.getByRole('dialog', { name: '회원 상세' })
  await expect(drawer.getByRole('img', { name: '프로필 이미지' })).toBeVisible()
  await expect(drawer.getByText('할인 링크는 DM 주세요. 010-0000-0000')).toBeVisible()
  await shot(page, 'admin-member-profile-01-detail')

  await drawer.getByRole('button', { name: '프로필 초기화' }).click()
  const confirm = page.getByRole('dialog', { name: '프로필을 초기화할까요?' })
  await expect(confirm).toBeVisible()
  await shot(page, 'admin-member-profile-02-confirm')

  await confirm.getByRole('button', { name: '초기화' }).click()
  await expect(page.getByText('프로필 이미지와 소개글을 초기화했어요.')).toBeVisible()
  await expect(drawer.getByText('소개글이 없어요.', { exact: true })).toBeVisible()
  await expect(drawer.getByText('기본 이미지')).toBeVisible()
  await expect(drawer.getByRole('button', { name: '프로필 초기화' })).toBeDisabled()
  await shot(page, 'admin-member-profile-03-after')
  expect(resets).toHaveLength(1)
})

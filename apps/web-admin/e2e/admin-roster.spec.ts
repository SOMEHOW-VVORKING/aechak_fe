import { test, expect, type Page, type Route } from '@playwright/test'

// 어드민 실로그인 + 관리자 명부 E2E — 이 앱이 dev에서 처음 실제로 동작하는 지점이다.
// 실백엔드 없이 page.route 스텁으로 계약을 재현한다.
//
// CORS가 두 갈래인 이유(seller-applications.spec과 같다): 어드민 API는 bearer 전용이고 BE
// CorsConfiguration이 setAllowCredentials를 호출하지 않는다. 그래서 공유 클라이언트가 `/admin`
// 경로만 withCredentials=false로 보내고, 스텁 응답도 BE와 똑같이 Access-Control-Allow-Credentials를
// **빼야** 한다 — 그 헤더의 부재 자체가 credentials 분기의 회귀 감시다. 반대로 `/auth/web/refresh`는
// httpOnly 쿠키를 왕복하는 credentials 요청이라 정확한 origin + Allow-Credentials가 둘 다 필요하다.
const ORIGIN = 'http://localhost:5174'
const ADMIN_API_ORIGIN = 'http://localhost:8082'
const API_ORIGIN = 'http://localhost:8080'

const ADMIN_CORS = { 'Access-Control-Allow-Origin': ORIGIN }
const AUTH_CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  // 프리플라이트에서 Authorization은 `*` 와일드카드로 덮이지 않는다(Fetch 스펙).
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '600',
}

function fulfillAdmin(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...ADMIN_CORS, ...PREFLIGHT_HEADERS } })
  }
  if (json === null) return route.fulfill({ status, headers: ADMIN_CORS })
  return route.fulfill({ status, headers: ADMIN_CORS, json })
}

interface AdminWire {
  userId: number
  nickname: string | null
  status: 'PENDING_ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
  joinedAt: string
  role: 'ADMIN' | 'GENERAL'
}

const CURRENT_ADMIN_USER_ID = 1

const SEED: AdminWire[] = [
  { userId: 1, nickname: '현재 운영자', status: 'ACTIVE', joinedAt: '2026-10-01T09:00:00', role: 'ADMIN' },
  { userId: 7, nickname: '김운영', status: 'ACTIVE', joinedAt: '2026-10-05T09:00:00', role: 'ADMIN' },
  // 온보딩 전 계정은 nickname이 null이다 — 화면이 식별자로 쓸 수 없다.
  { userId: 9, nickname: null, status: 'ACTIVE', joinedAt: '2026-10-09T09:00:00', role: 'ADMIN' },
  { userId: 45, nickname: '승격대상', status: 'ACTIVE', joinedAt: '2026-10-10T09:00:00', role: 'GENERAL' },
  { userId: 46, nickname: '정지회원', status: 'SUSPENDED', joinedAt: '2026-10-11T09:00:00', role: 'GENERAL' },
]

interface StubOptions {
  /** refresh를 401로 떨어뜨린다(세션 없음) — 전역 핸들러가 로그인으로 보내는 경로. */
  sessionExpired?: boolean
  /** 명부 조회를 403 errorCode 20011로 떨어뜨린다(ADMIN 아닌 계정). */
  forbidden?: boolean
}

/** 명부 3종을 상태 있게 스텁한다. 가드 순서는 BE AdminUserRoleService를 그대로 미러한다. */
async function stubAdminApi(page: Page, options: StubOptions = {}) {
  const roster = SEED.map(row => ({ ...row }))

  await page.route(`${ADMIN_API_ORIGIN}/api/v1/admin/admins**`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfillAdmin(route, 204, null)

    const url = new URL(route.request().url())
    const match = /\/admin\/admins(?:\/(\d+))?$/.exec(url.pathname)
    const pathUserId = match?.[1] == null ? null : Number(match[1])

    if (method === 'GET') {
      if (options.forbidden) {
        return fulfillAdmin(route, 403, { errorCode: 20011, message: '권한이 없습니다.' })
      }
      const admins = roster.filter(row => row.role === 'ADMIN').sort((a, b) => a.userId - b.userId)
      return fulfillAdmin(route, 200, {
        data: {
          items: admins.map(row => ({
            userId: row.userId,
            nickname: row.nickname,
            status: row.status,
            joinedAt: row.joinedAt,
            isSelf: row.userId === CURRENT_ADMIN_USER_ID,
          })),
          totalCount: admins.length,
        },
      })
    }

    if (method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as { userId?: number | null }
      if (body.userId == null) {
        return fulfillAdmin(route, 400, { errorCode: 90001, message: '승격할 사용자 id는 필수입니다.' })
      }
      // 자기 자신 판정이 존재 확인보다 먼저다(BE rejectSelfRoleChange가 getById 앞에 있다).
      if (body.userId === CURRENT_ADMIN_USER_ID) {
        return fulfillAdmin(route, 403, { errorCode: 30014, message: '자신의 역할은 변경할 수 없습니다.' })
      }
      const target = roster.find(row => row.userId === body.userId)
      if (!target) return fulfillAdmin(route, 404, { errorCode: 30000, message: '사용자를 찾을 수 없습니다.' })
      if (target.role === 'ADMIN') {
        return fulfillAdmin(route, 409, { errorCode: 30012, message: '이미 관리자인 계정입니다.' })
      }
      if (target.status !== 'ACTIVE') {
        return fulfillAdmin(route, 409, {
          errorCode: 30017,
          message: '활성 상태인 계정만 관리자로 승격할 수 있습니다.',
        })
      }
      target.role = 'ADMIN'
      return fulfillAdmin(route, 204, null)
    }

    if (method === 'DELETE') {
      if (pathUserId === CURRENT_ADMIN_USER_ID) {
        return fulfillAdmin(route, 403, { errorCode: 30014, message: '자신의 역할은 변경할 수 없습니다.' })
      }
      const target = roster.find(row => row.userId === pathUserId)
      if (!target) return fulfillAdmin(route, 404, { errorCode: 30000, message: '사용자를 찾을 수 없습니다.' })
      if (target.role === 'ADMIN' && roster.filter(row => row.role === 'ADMIN').length <= 1) {
        return fulfillAdmin(route, 409, { errorCode: 30013, message: '마지막 관리자는 강등할 수 없습니다.' })
      }
      target.role = 'GENERAL'
      return fulfillAdmin(route, 204, null)
    }

    return fulfillAdmin(route, 404, { errorCode: 30000, message: '사용자를 찾을 수 없습니다.' })
  })

  // 셸이 부르는 심사 대기 수 — 명부 화면과 무관하지만 스텁이 없으면 실네트워크로 샌다.
  await page.route(`${ADMIN_API_ORIGIN}/api/v1/admin/seller-applications**`, route =>
    fulfillAdmin(route, 200, { data: { items: [], totalCount: 0 } }),
  )

  // 호스트 분기가 무동작이 되면(configureApiHosts 누락) 명부 요청이 api 호스트로 샌다. 같은 경로를
  // api 호스트에도 심되 500으로 떨어뜨려 화면에 오류가 뜨게 만든다.
  await page.route(`${API_ORIGIN}/api/v1/admin/**`, route =>
    route.fulfill({
      status: 500,
      headers: ADMIN_CORS,
      json: { errorCode: 90000, message: '명부 요청이 api 호스트로 샜습니다.' },
    }),
  )

  // 어드민 모듈에는 /auth/*가 없고 refresh는 늘 api 호스트(8080)로 나간다.
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...AUTH_CORS, ...PREFLIGHT_HEADERS } })
    }
    if (options.sessionExpired) {
      return route.fulfill({
        status: 401,
        headers: AUTH_CORS,
        json: { errorCode: 20004, message: '인증이 필요합니다.' },
      })
    }
    return route.fulfill({
      status: 200,
      headers: AUTH_CORS,
      json: { data: { accessToken: 'e2e-admin-token', tokenType: 'Bearer', expiresIn: 1800 } },
    })
  })
}

test.use({ viewport: { width: 1440, height: 900 } })

// PR 첨부용 캡처(test-results는 gitignore). dev 전용 Query Devtools 버튼이 찍히지 않게 숨긴다.
async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `test-results/pr-fe-b/${name}.png`, animations: 'disabled' })
}

test('[AC-ADM-E2E-010] 로그인 화면은 카카오만 열려 있고 SideNav 없이 단독 렌더된다', async ({ page }) => {
  await stubAdminApi(page)
  await page.goto('/login')

  await expect(page.getByRole('button', { name: '카카오로 로그인' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '구글로 로그인 (준비 중)' })).toBeDisabled()
  // BE에 POST /auth/login이 없다 — 이메일/비밀번호 폼은 제거됐다.
  await expect(page.getByLabel('Email')).toHaveCount(0)
  await expect(page.getByLabel('Password')).toHaveCount(0)
  // 로그인 플로우에서는 셸(nav)이 뜨지 않는다.
  await expect(page.getByRole('button', { name: '관리자 관리' })).toHaveCount(0)
  await shot(page, '01-login')

  // 로그인 진입은 API 호출이 아니라 api 호스트로의 페이지 이동이다.
  const [request] = await Promise.all([
    page.waitForRequest(url => url.url().includes('/auth/login/kakao/redirect')),
    page.getByRole('button', { name: '카카오로 로그인' }).click(),
  ])
  expect(request.url()).toContain(`${API_ORIGIN}/api/v1/auth/login/kakao/redirect`)
  expect(request.url()).toContain(encodeURIComponent(`${ORIGIN}/login/complete`))
})

test('[AC-ADM-E2E-011] 콜백 복귀 → refresh로 세션 수령 → 명부에서 승격·강등이 돈다', async ({ page }) => {
  await stubAdminApi(page)

  // access는 쿼리로 오지 않는다 — 복귀 라우트의 refresh가 유일한 수령 경로다.
  await page.goto('/login/complete?status=ACTIVE&isNew=false')
  await expect(page).toHaveURL(`${ORIGIN}/`)

  await page.getByRole('button', { name: '관리자 관리' }).click()
  await expect(page).toHaveURL(/\/admins$/)

  // 서버 정렬(가입 순)을 그대로 쓰고, nickname이 null인 계정은 id로 대신한다.
  await expect(page.getByRole('row')).toHaveCount(4) // 헤더 + 관리자 3명
  await expect(page.getByRole('row').nth(1)).toContainText('현재 운영자')
  await expect(page.getByRole('row').nth(3)).toContainText('이름 없는 계정 (9)')
  // 가입일이다 — '승격일'로 적으면 가입 시각을 승격 시각으로 위장한다.
  await expect(page.getByRole('columnheader', { name: '가입일' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '승격일' })).toHaveCount(0)
  // 승격 직후 재로그인이 필요하다는 안내는 계약의 일부다.
  await expect(page.getByText(/다시 로그인해야 관리자 권한이 반영돼요/)).toBeVisible()
  // 자기 행은 서버 isSelf로 표시되고 권한 해제가 잠긴다(403/30014).
  await expect(page.getByRole('button', { name: '현재 운영자 관리자 권한 해제' })).toBeDisabled()
  await shot(page, '02-roster')

  await page.getByLabel('승격할 사용자 ID').fill('45')
  await page.getByRole('button', { name: '관리자로 승격' }).click()
  await expect(page.getByText('관리자로 승격했어요. 그 계정은 다시 로그인해야 권한이 반영돼요.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '승격대상' })).toBeVisible()

  await page.getByRole('button', { name: '김운영 관리자 권한 해제' }).click()
  const modal = page.getByRole('dialog')
  await expect(modal).toContainText('이미 발급된 토큰은 만료될 때까지 관리자로 통과해요.')
  await shot(page, '03-demote-confirm')
  await modal.getByRole('button', { name: '권한 해제' }).click()
  await expect(page.getByText('관리자 권한을 해제했어요.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '김운영' })).toHaveCount(0)
})

test('[AC-ADM-E2E-012] 비활성 계정 승격은 409 errorCode 30017 사유를 보여준다', async ({ page }) => {
  await stubAdminApi(page)
  await page.goto('/admins')

  await page.getByLabel('승격할 사용자 ID').fill('46')
  await page.getByRole('button', { name: '관리자로 승격' }).click()

  await expect(page.getByText('활성 상태인 계정만 관리자로 승격할 수 있어요.')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '정지회원' })).toHaveCount(0)
})

test('[AC-ADM-E2E-013] 권한 없는 계정(403 errorCode 20011)은 빈 명부가 아니라 사유를 보여준다', async ({
  page,
}) => {
  await stubAdminApi(page, { forbidden: true })
  await page.goto('/admins')

  await expect(page.getByText('관리자 권한이 없는 계정이에요. 관리자 계정으로 다시 로그인해 주세요.')).toBeVisible()
  await expect(page.getByText('관리자 명부를 불러오지 못했어요.')).toBeVisible()
  await expect(page.getByText('등록된 관리자가 없어요.')).toHaveCount(0)
  await shot(page, '04-forbidden')
})

test('[AC-ADM-E2E-014] 세션이 없으면(401 → refresh 실패) 명부 진입이 로그인으로 튕긴다', async ({ page }) => {
  await stubAdminApi(page, { sessionExpired: true })
  await page.route(`${ADMIN_API_ORIGIN}/api/v1/admin/admins**`, route => {
    if (route.request().method() === 'OPTIONS') return fulfillAdmin(route, 204, null)
    return fulfillAdmin(route, 401, { errorCode: 20004, message: '인증이 필요합니다.' })
  })

  await page.goto('/admins')

  // main.tsx가 setupAuthExpiredRedirect를 부르지 않으면 이 경로가 무동작이 되어, 운영자는 명부가
  // 비어 보이기만 하고 왜 안 되는지 알 수 없다.
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: '카카오로 로그인' })).toBeVisible()
})

import { test, expect, type Page, type Route } from '@playwright/test'

// 셀러 입점 심사의 **승인 성공 경로**와 결정 요청 본문 E2E. 기존 seller-applications.spec은 반려
// 성공 경로와 409·403·빈 목록을 덮지만, 승인은 409가 먼저 터지는 선점 시나리오에서만 눌러 봤다 —
// 204가 돌아왔을 때 무엇이 반영되는지, 어떤 본문이 나가는지, 같은 결정을 두 번 눌러도 한 번만
// 나가는지는 아무도 보지 않았다. 상태 필터가 실제 쿼리 파라미터로 나가는지도 비어 있었다.
//
// CORS가 두 갈래인 이유(기존 spec과 같다): 어드민 API는 bearer 전용이고 BE CorsConfiguration이
// setAllowCredentials를 호출하지 않는다. 공유 클라이언트가 `/admin` 경로만 withCredentials=false로
// 보내므로 스텁도 Access-Control-Allow-Credentials를 **빼야** 한다 — 그 헤더의 부재 자체가
// credentials 분기의 회귀 감시다. 반대로 `/auth/web/refresh`는 쿠키를 왕복하는 credentials 요청이라
// 정확한 origin + Allow-Credentials가 둘 다 필요하다.
const ORIGIN = 'http://localhost:5174'
// 글롭에 origin을 박아 호스트를 가른다 — 비우면 요청이 api 호스트(8080)로 잘못 나가도 같은 스텁이
// 받아 주어 E2E가 오배치를 전혀 잡지 못한다.
const ADMIN_API_ORIGIN = 'http://localhost:8082'
const API_ORIGIN = 'http://localhost:8080'

const ADMIN_CORS = { 'Access-Control-Allow-Origin': ORIGIN }
const AUTH_CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
// 프리플라이트에서 Authorization은 `*` 와일드카드로 덮이지 않는다(Fetch 스펙).
const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '600',
}
const SHOTS = 'test-results/pr-e2e-guard'

function fulfillAdmin(route: Route, status: number, json: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...ADMIN_CORS, ...PREFLIGHT_HEADERS } })
  }
  if (json === null) return route.fulfill({ status, headers: ADMIN_CORS })
  return route.fulfill({ status, headers: ADMIN_CORS, json })
}

async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

type WireStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface Wire {
  applicationId: number
  status: WireStatus
  businessType: 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'
  businessName: string | null
  representativeName: string | null
  businessRegNo: string | null
  corpRegNo: string | null
  telesalesNumber: string | null
  bankCode: string | null
  accountNumber: string | null
  accountHolder: string | null
  appliedAt: string
  submittedAt: string | null
  decidedAt: string | null
  rejectionReason: string | null
  documents: { documentType: string; uploadedAt: string }[]
  reviews: { decision: 'APPROVED' | 'REJECTED'; rejectionReason: string | null; reviewedAt: string }[]
  previousApplications: { applicationId: number; status: WireStatus; decidedAt: string | null }[]
}

function wire(overrides: Partial<Wire> = {}): Wire {
  return {
    applicationId: 1,
    status: 'SUBMITTED',
    businessType: 'SOLE_PROPRIETORSHIP',
    businessName: '펫프렌즈상사',
    representativeName: '김민수',
    businessRegNo: '1234567890',
    corpRegNo: null,
    telesalesNumber: '2026-서울강남-0001',
    bankCode: '004',
    accountNumber: '110123456789',
    accountHolder: '김민수',
    appliedAt: '2026-06-17T09:00:00',
    submittedAt: '2026-06-18T10:00:00',
    decidedAt: null,
    rejectionReason: null,
    documents: [
      { documentType: 'BUSINESS_REGISTRATION', uploadedAt: '2026-06-18T09:30:00' },
      { documentType: 'TELESALES_REPORT', uploadedAt: '2026-06-18T09:31:00' },
      { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-06-18T09:32:00' },
      { documentType: 'ID_CARD', uploadedAt: '2026-06-18T09:33:00' },
    ],
    reviews: [],
    previousApplications: [],
    ...overrides,
  }
}

const SEED: Wire[] = [
  wire(),
  wire({
    applicationId: 2,
    businessName: '해피독몰',
    representativeName: '최진호',
    businessRegNo: '1058712345',
    submittedAt: '2026-06-17T10:00:00',
  }),
  wire({
    applicationId: 3,
    status: 'REJECTED',
    businessName: '반려된상점',
    representativeName: '박서윤',
    submittedAt: '2026-06-16T10:00:00',
    decidedAt: '2026-06-17T09:00:00',
    rejectionReason: '서류 누락',
    reviews: [{ decision: 'REJECTED', rejectionReason: '서류 누락', reviewedAt: '2026-06-17T09:00:00' }],
  }),
]

interface Decided {
  /** 메서드를 함께 기록한다 — 경로만 보면 approve가 DELETE로 나가도 테스트가 통과한다. */
  method: string
  path: string
  body: unknown
}

interface Recorded {
  /** 목록 조회에 실제로 실린 쿼리(심사 대기 수 조회 size=1은 제외). */
  listQueries: string[]
  decisions: Decided[]
  /** 어드민 요청이 api 호스트(8080)로 샜는지. 0건이어야 한다. */
  leakedToApiHost: string[]
  /**
   * 계약 밖 요청 — 메서드가 틀렸거나(BE는 조회 GET·결정 POST뿐) 경로가 틀린 것. 스텁이 이걸
   * 안 가르면 생성기가 메서드나 URL을 잘못 바꿔도 아무 테스트가 깨지지 않는다.
   */
  offContract: string[]
}

interface StubOptions {
  applications?: Wire[]
  /** 결정 응답을 붙들어 전송 중 구간을 만든다. */
  holdDecision?: Promise<void>
  /** 상세 조회에 주입할 실패 상태(미지정이면 200). */
  detailFailure?: { status: number; json: unknown }
}

async function stubAdminApi(page: Page, options: StubOptions = {}): Promise<Recorded> {
  const applications = (options.applications ?? SEED).map(row => ({ ...row }))
  const recorded: Recorded = {
    listQueries: [],
    decisions: [],
    leakedToApiHost: [],
    offContract: [],
  }
  let downloadIssue = 0

  /** 계약 밖 메서드는 서버와 같게 405로 떨어뜨리고 기록한다. */
  function rejectMethod(route: Route, method: string, pathname: string) {
    recorded.offContract.push(`${method} ${pathname}`)
    return fulfillAdmin(route, 405, { errorCode: 90000, message: '허용되지 않는 메서드' })
  }

  await page.route(`${ADMIN_API_ORIGIN}/api/v1/admin/seller-applications**`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfillAdmin(route, 204, null)

    const url = new URL(route.request().url())
    const match = /\/admin\/seller-applications(?:\/(\d+)(?:\/(approve|reject))?)?$/.exec(url.pathname)
    // 정규식이 안 맞는 경로(`/seller-applications/typo` 등)를 목록 분기로 흘리면 조회 URL이
    // 틀려도 정상 목록이 돌아와 회귀가 묻힌다 — 서버처럼 404로 떨어뜨리고 기록한다.
    if (!match) {
      recorded.offContract.push(`${method} ${url.pathname}`)
      return fulfillAdmin(route, 404, { errorCode: 90000, message: '없는 경로' })
    }
    const id = match[1] == null ? null : Number(match[1])
    const action = match[2] ?? null

    if (id == null) {
      if (method !== 'GET') return rejectMethod(route, method, url.pathname)
      const status = url.searchParams.get('status')
      const size = url.searchParams.get('size')
      // 심사 대기 수는 size=1짜리 별도 조회다 — 목록 쿼리 기록에서 가른다.
      if (size !== '1') {
        recorded.listQueries.push(url.search)
      }
      const page_ = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
      const pageSize = Math.min(100, Math.max(1, Number(size ?? 20) || 20))
      const matched = status == null ? applications : applications.filter(row => row.status === status)
      const sorted = [...matched].sort((a, b) =>
        a.submittedAt === b.submittedAt
          ? b.applicationId - a.applicationId
          : (a.submittedAt ?? '') < (b.submittedAt ?? '')
            ? 1
            : -1,
      )
      return fulfillAdmin(route, 200, {
        data: {
          items: sorted.slice(page_ * pageSize, page_ * pageSize + pageSize).map(row => ({
            applicationId: row.applicationId,
            status: row.status,
            businessType: row.businessType,
            businessName: row.businessName,
            representativeName: row.representativeName,
            submittedAt: row.submittedAt,
          })),
          totalCount: matched.length,
        },
      })
    }

    const row = applications.find(item => item.applicationId === id)
    if (!row) {
      return fulfillAdmin(route, 404, { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' })
    }

    if (action == null) {
      if (method !== 'GET') return rejectMethod(route, method, url.pathname)
      if (options.detailFailure) {
        return fulfillAdmin(route, options.detailFailure.status, options.detailFailure.json)
      }
      downloadIssue += 1
      return fulfillAdmin(route, 200, {
        data: {
          ...row,
          // 서버는 REJECTED가 아니면 rejectionReason을 null로 내린다.
          rejectionReason: row.status === 'REJECTED' ? row.rejectionReason : null,
          documents: row.documents.map(document => ({
            ...document,
            downloadUrl: `https://files.local/${document.documentType}?issue=${downloadIssue}`,
          })),
        },
      })
    }

    // 승인·반려는 POST뿐이다(생성된 fetcher 계약). 메서드를 기록해 두면 approve가 DELETE로
    // 바뀌어도 "본문 없는 approve" 단언이 조용히 통과하는 일이 없다.
    if (method !== 'POST') return rejectMethod(route, method, url.pathname)
    recorded.decisions.push({
      method,
      path: url.pathname,
      body: route.request().postDataJSON() ?? null,
    })
    if (options.holdDecision) await options.holdDecision

    if (row.status !== 'SUBMITTED' && row.status !== 'REVIEWING') {
      return fulfillAdmin(route, 409, {
        errorCode: 10101,
        message: '현재 신청 상태에서 허용되지 않는 전이입니다.',
      })
    }

    if (action === 'approve') {
      row.status = 'APPROVED'
      row.decidedAt = '2026-06-19T09:00:00'
      row.reviews.push({ decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-19T09:00:00' })
      return fulfillAdmin(route, 204, null)
    }

    const body = (route.request().postDataJSON() ?? {}) as { reason?: string | null }
    const reason = body.reason ?? ''
    if (reason.trim() === '') {
      return fulfillAdmin(route, 400, { errorCode: 10102, message: '반려 사유는 필수입니다.' })
    }
    row.status = 'REJECTED'
    row.decidedAt = '2026-06-19T09:00:00'
    row.rejectionReason = reason
    row.reviews.push({ decision: 'REJECTED', rejectionReason: reason, reviewedAt: '2026-06-19T09:00:00' })
    return fulfillAdmin(route, 204, null)
  })

  // 호스트 분기가 무동작이 되면 심사 요청이 api 호스트로 샌다 — 같은 경로를 8080에도 심어
  // 기록하고 500으로 떨어뜨려 조용히 묻히지 않게 한다.
  await page.route(`${API_ORIGIN}/api/v1/admin/**`, route => {
    recorded.leakedToApiHost.push(`${route.request().method()} ${route.request().url()}`)
    return route.fulfill({
      status: 500,
      headers: ADMIN_CORS,
      json: { errorCode: 90000, message: '심사 요청이 api 호스트로 샜습니다.' },
    })
  })

  // 어드민 모듈에는 /auth/*가 없고 refresh는 늘 api 호스트로 나간다.
  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { ...AUTH_CORS, ...PREFLIGHT_HEADERS } })
    }
    return route.fulfill({
      status: 401,
      headers: AUTH_CORS,
      json: { errorCode: 20004, message: '인증이 필요합니다.' },
    })
  })

  return recorded
}

test.use({ viewport: { width: 1440, height: 900 } })

/**
 * 확인 Modal의 확정 버튼. 전송 중에는 라벨이 스피너로 바뀌어 접근 이름이 사라지므로 위치로 잡는다
 * (취소가 0, 확정이 1). Drawer도 role=dialog라 제목으로 Modal을 먼저 가려 낸다.
 */
function modalConfirm(page: Page, title: string) {
  return page.getByRole('dialog').filter({ hasText: title }).getByRole('button').nth(1)
}

// ── 1. 승인 성공 경로 ────────────────────────────────────────────────────────
test('[AC-ADM-E2E-020] 승인은 본문 없는 approve 한 번으로 끝나고 재조회가 목록·심사 대기 수까지 바꾼다', async ({
  page,
}) => {
  const recorded = await stubAdminApi(page)
  // 경로로 바로 들어가지 않고 **nav를 거친다** — 항목이 빠지거나 다른 라우트로 잘못 걸리면
  // 화면 자체는 멀쩡해도 운영자가 닿을 길이 없어진다(화면이 사라졌다는 지적의 실제 원인).
  await page.goto('/')
  // nav 항목은 **nav 랜드마크 안에서** 집는다. 이름만으로 찾으면 랜딩의 심사 대기 카드(접근성
  // 이름이 "셀러 입점 심사 대기 2건 …")까지 함께 걸려 strict mode로 터진다 — SCRUM-308이 그 카드를
  // 세우면서 드러났다. 배지를 읽을 대상은 nav 버튼이므로 범위를 좁히는 쪽이 맞다.
  const applicationsNav = page.getByRole('navigation').getByRole('button', { name: '셀러 입점 심사' })
  // nav 배지도 심사 대기 수와 같은 쿼리키를 쓴다 — 목록에 들어가기 전부터 서버 값이 실린다.
  await expect(applicationsNav).toContainText('2')
  await applicationsNav.click()
  await expect(page).toHaveURL(/\/sellers\/applications$/)

  await expect(page.getByText('심사 대기 2')).toBeVisible()
  await page.getByRole('button', { name: '펫프렌즈상사' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()
  // 심사 대기 신청의 기본 결정은 승인이다(반려는 사유를 받아야 해서 기본값이 될 수 없다).
  await expect(page.getByText('반려 사유', { exact: true })).toHaveCount(0)
  await shot(page, 'admin-01-detail-approve-default')

  await page.getByRole('button', { name: '제출' }).click()
  const modal = page.getByRole('dialog').filter({ hasText: '입점을 승인할까요?' })
  await expect(modal).toBeVisible()
  await expect(modal.getByText(/승인 즉시 셀러 어드민이 활성화되고/)).toBeVisible()
  // 확인 전에는 요청이 나가지 않는다.
  expect(recorded.decisions).toEqual([])
  await shot(page, 'admin-02-approve-confirm')

  await modal.getByRole('button', { name: '승인' }).click()
  await expect(page.getByText('입점을 승인했어요.')).toBeVisible()

  // 승인은 본문 없는 POST 한 번이다 — 반려와 달리 사유 필드를 싣지 않는다. 메서드까지 단언해야
  // 한다: 경로만 보면 approve가 DELETE로 나가도 이 단언이 통과한다(실측으로 확인했다).
  expect(recorded.decisions).toEqual([
    { method: 'POST', path: '/api/v1/admin/seller-applications/1/approve', body: null },
  ])
  // 204라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다 — Drawer는 닫히고 행이 승인으로 바뀐다.
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toHaveCount(0)
  await expect(
    page.getByRole('row').filter({ hasText: '펫프렌즈상사' }).getByText('승인', { exact: true }),
  ).toBeVisible()
  // 심사 대기 수도 같은 접두 키라 함께 갱신된다(2 → 1) — 화면 머리말과 nav 배지가 같이 줄어든다.
  await expect(page.getByText('심사 대기 1')).toBeVisible()
  await expect(page.getByRole('navigation').getByRole('button', { name: '셀러 입점 심사' })).toContainText('1')
  expect(recorded.leakedToApiHost).toEqual([])
  expect(recorded.offContract).toEqual([])
  await shot(page, 'admin-03-after-approve')
})

// ── 2. 전송 중 중복 확인 차단 ────────────────────────────────────────────────
test('[AC-ADM-E2E-021] 전송 중 확인 버튼이 잠겨, 다시 눌러도 approve가 두 번 나가지 않는다', async ({
  page,
}) => {
  // 초기값을 둔다 — Promise 실행자 안의 대입을 제어 흐름 분석이 못 보고 never로 좁히기 때문이다.
  let release: () => void = () => {}
  const holdDecision = new Promise<void>(resolve => {
    release = resolve
  })
  const recorded = await stubAdminApi(page, { holdDecision })
  await page.goto('/sellers/applications')

  await page.getByRole('button', { name: '펫프렌즈상사' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()
  await page.getByRole('button', { name: '제출' }).click()

  const confirm = modalConfirm(page, '입점을 승인할까요?')
  // 요청이 스텁 핸들러에 **도착한 것까지** 기다린다 — click()은 브라우저에서 이벤트를 쏜 시점에
  // 끝나므로, 바로 기록 배열을 읽으면 정상 구현에서도 아직 0건일 수 있다(경합).
  const firstApprove = page.waitForRequest(
    request =>
      request.method() === 'POST' &&
      request.url().endsWith('/admin/seller-applications/1/approve'),
  )
  await confirm.click()
  await firstApprove
  // 전송 중에는 확인이 잠긴다 — 잠긴 버튼은 강제로 눌러도 click 이벤트가 발화하지 않는다.
  await expect(confirm).toBeDisabled()
  await expect(confirm).toHaveAttribute('aria-busy', 'true')
  await confirm.click({ force: true })
  await confirm.click({ force: true })
  // Drawer의 제출 버튼도 함께 잠겨 두 번째 결정이 겹쳐 나가지 않는다.
  await expect(page.getByRole('button', { name: '제출' })).toBeDisabled()
  expect(recorded.decisions).toHaveLength(1)

  release()
  await expect(page.getByText('입점을 승인했어요.')).toBeVisible()
  expect(recorded.decisions).toHaveLength(1)
  expect(recorded.leakedToApiHost).toEqual([])
  expect(recorded.offContract).toEqual([])
})

// ── 3. 상태 필터는 서버 쿼리로 나간다 ───────────────────────────────────────
test('[AC-ADM-E2E-022] 상태 필터는 status 쿼리로 나가고 전체 상태는 키째 빠진다', async ({ page }) => {
  const recorded = await stubAdminApi(page)
  await page.goto('/sellers/applications')
  await expect(page.getByRole('button', { name: '펫프렌즈상사' })).toBeVisible()

  // 꼬리말이 실제로 **있는 것**부터 확인한다 — 뒤의 부재 단언만 두면 문구가 통째로 바뀌어도
  // (또는 셀렉터에 오타가 나도) 0건으로 조용히 통과한다.
  const allStatesNote = page.getByText('(작성 중 / 신청 취소 포함)')
  await expect(allStatesNote).toBeVisible()

  // 전체는 status를 보내지 않는다 — 빈 값(`?status=`)으로 보내면 서버가 형식 오류로 거절한다.
  expect(recorded.listQueries).toHaveLength(1)
  expect(recorded.listQueries[0]).not.toContain('status')
  expect(recorded.listQueries[0]).toContain('page=0')
  expect(recorded.listQueries[0]).toContain('size=20')

  // 반려만 — 와이어 enum(REJECTED)으로 변환돼 나가고, 결과가 실제로 걸러진다.
  await page.getByLabel('심사 상태 필터').selectOption('rejected')
  await expect(page.getByRole('button', { name: '반려된상점' })).toBeVisible()
  await expect(page.getByRole('button', { name: '펫프렌즈상사' })).toHaveCount(0)
  expect(recorded.listQueries.length).toBeGreaterThan(1)
  expect(recorded.listQueries.at(-1)).toContain('status=REJECTED')
  // 필터 기준 건수로 바뀌고, 전체일 때만 붙는 꼬리말이 사라진다(위에서 본 그 요소다).
  await expect(allStatesNote).toHaveCount(0)
  await shot(page, 'admin-04-filter-rejected')

  // 심사 대기만 — 두 건이 남는다.
  await page.getByLabel('심사 상태 필터').selectOption('submitted')
  await expect(page.getByRole('button', { name: '펫프렌즈상사' })).toBeVisible()
  await expect(page.getByRole('button', { name: '반려된상점' })).toHaveCount(0)
  expect(recorded.listQueries.at(-1)).toContain('status=SUBMITTED')
  expect(recorded.leakedToApiHost).toEqual([])
})

// ── 4. 반려 사유는 본문으로 그대로 나간다 ───────────────────────────────────
test('[AC-ADM-E2E-023] 사유를 고르기 전에는 제출이 잠기고, 직접 입력 사유가 그대로 reason으로 나간다', async ({
  page,
}) => {
  const recorded = await stubAdminApi(page)
  await page.goto('/sellers/applications')

  await page.getByRole('button', { name: '해피독몰' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()
  await page.getByText('신청 반려 / 사유 기록 후 재제출 유도').click()

  // 사유 없는 반려는 서버가 400/10102로 거절한다 — 화면이 먼저 막는다.
  await expect(page.getByRole('button', { name: '제출' })).toBeDisabled()
  await shot(page, 'admin-05-reject-reason-required')

  await page.getByLabel('반려 사유', { exact: true }).selectOption('direct')
  // 직접 입력을 고르면 칸이 열리지만, 비어 있는 동안에는 여전히 잠겨 있다.
  const reasonInput = page.getByLabel('반려 사유 직접 입력')
  await expect(reasonInput).toBeVisible()
  await expect(page.getByRole('button', { name: '제출' })).toBeDisabled()

  // 컨트롤드 Textarea는 fill이 아니라 type으로 채워야 onChange가 반영된다(AGENTS.md 7절).
  await reasonInput.type('  통장 사본 계좌주와 대표자명이 달라요.  ')
  await expect(page.getByRole('button', { name: '제출' })).toBeEnabled()

  await page.getByRole('button', { name: '제출' }).click()
  await modalConfirm(page, '신청을 반려할까요?').click()
  await expect(page.getByText('신청을 반려했어요.')).toBeVisible()

  // 프리셋이 아닌 사유는 운영자가 쓴 원문이 그대로 기록된다(앞뒤 공백만 걷는다).
  expect(recorded.decisions).toEqual([
    {
      method: 'POST',
      path: '/api/v1/admin/seller-applications/2/reject',
      body: { reason: '통장 사본 계좌주와 대표자명이 달라요.' },
    },
  ])
  await expect(
    page.getByRole('row').filter({ hasText: '해피독몰' }).getByText('반려', { exact: true }),
  ).toBeVisible()
  expect(recorded.leakedToApiHost).toEqual([])
  expect(recorded.offContract).toEqual([])
  await shot(page, 'admin-06-after-reject')
})

// ── 5. 상세 조회 실패는 빈 Drawer가 아니라 사유다 ───────────────────────────
test('[AC-ADM-E2E-024] 상세 조회 500이면 Drawer가 사유를 알리고 결정 입력은 아예 뜨지 않는다', async ({
  page,
}) => {
  // 목록은 성공, 상세만 실패하는 조합 — 목록 403만 덮여 있던 자리라 이 경로는 아무도 보지 않았다.
  const recorded = await stubAdminApi(page, {
    detailFailure: { status: 500, json: { errorCode: 90000, message: 'server error' } },
  })
  await page.goto('/sellers/applications')

  // 목록 자체는 멀쩡하다 — 실패가 목록 오류로 번지면 운영자가 원인을 잘못 짚는다.
  await expect(page.getByText('심사 대기 2')).toBeVisible()
  await page.getByRole('button', { name: '펫프렌즈상사' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()

  await expect(page.getByText('신청 상세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeVisible()
  // 백지 Drawer가 뜨면 "신청서가 비었다"로 읽힌다 — 요약 필드도, 결정 입력도 없어야 한다.
  await expect(page.getByText('신청 반려 / 사유 기록 후 재제출 유도')).toHaveCount(0)
  // 상세를 못 받은 상태에서 결정 버튼이 눌리면 낡은 대상으로 승인·반려가 나간다.
  await expect(page.getByRole('button', { name: '제출' })).toHaveCount(0)
  expect(recorded.decisions).toEqual([])
  expect(recorded.leakedToApiHost).toEqual([])
  expect(recorded.offContract).toEqual([])
  await shot(page, 'admin-07-detail-load-error')
})

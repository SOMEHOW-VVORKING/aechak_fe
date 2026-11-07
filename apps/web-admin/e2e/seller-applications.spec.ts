import { test, expect, type Page, type Route } from '@playwright/test'

// 어드민 셀러 입점 심사 실연동 E2E — 이 저장소 최초의 web-admin Playwright spec.
// 실백엔드 없이 page.route 스텁으로 admin 모듈 계약(목록·상세·승인·반려)을 재현한다.
//
// CORS가 seller/buyer spec과 다른 이유: 어드민 API는 bearer 전용이고 BE CorsConfiguration이
// setAllowCredentials를 호출하지 않는다. 그래서 공유 클라이언트가 /admin 경로만
// withCredentials=false로 보내고(packages/api client.ts), 스텁 응답도 BE와 똑같이
// Access-Control-Allow-Credentials를 **빼야** 한다. 넣어도 브라우저가 받아 주긴 하지만,
// 빼 두면 FE가 credentials를 켠 상태로 회귀하는 순간 브라우저가 응답을 버려 이 spec이 깨진다
// — 즉 이 헤더의 부재 자체가 호스트/credentials 분기의 회귀 감시다.
// 반대로 /auth/web/refresh는 httpOnly 쿠키를 왕복하는 credentials 요청이라 정확한 origin +
// Allow-Credentials: true가 모두 필요하다.
// 포트는 playwright.config.ts와 같은 `E2E_BASE_URL`에서 온다 — withCredentials라 fulfill 응답의
// Access-Control-Allow-Origin이 실제 origin과 한 글자도 달라선 안 되므로 두 곳이 같은 값을 읽는다.
const ORIGIN = process.env['E2E_BASE_URL'] ?? 'http://localhost:5174'

// 스텁 글롭에 origin을 박아 둔다. `**/api/v1/admin/...`처럼 호스트를 비우면 요청이 api 호스트
// (8080)로 잘못 나가도 같은 스텁이 받아 주어, E2E가 호스트 오배치를 전혀 잡지 못한다.
// 두 값은 .env.example의 VITE_*_BASE_URL 기본값과 같아야 한다.
const ADMIN_API_ORIGIN = 'http://localhost:8082'
const API_ORIGIN = 'http://localhost:8080'

/** 어드민 API(비 credentials) — Allow-Credentials를 주지 않는다. */
const ADMIN_CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
}

/** 인증 API(credentials) — 정확한 origin + Allow-Credentials가 둘 다 필요하다. */
const AUTH_CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}

// 프리플라이트에서 Authorization은 `*` 와일드카드로 덮이지 않는다(Fetch 스펙) — 실제로
// 토큰이 붙는 요청이 막히지 않게 헤더를 이름으로 적는다.
const PREFLIGHT_HEADERS = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
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

type WireStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

interface Wire {
  applicationId: number
  status: WireStatus
  businessType: 'PERSONAL_GENERAL' | 'SOLE_PROPRIETORSHIP' | 'CORPORATE'
  businessName: string | null
  businessRegNo: string | null
  corpRegNo: string | null
  representativeName: string | null
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
    businessRegNo: '1234567890',
    corpRegNo: null,
    representativeName: '김민수',
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
    status: 'APPROVED',
    businessType: 'PERSONAL_GENERAL',
    businessName: null,
    representativeName: '정수은',
    businessRegNo: null,
    submittedAt: '2026-06-16T10:00:00',
    decidedAt: '2026-06-17T09:00:00',
    documents: [
      { documentType: 'ID_CARD', uploadedAt: '2026-06-16T09:00:00' },
      { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-06-16T09:01:00' },
    ],
    reviews: [{ decision: 'APPROVED', rejectionReason: null, reviewedAt: '2026-06-17T09:00:00' }],
  }),
]

interface StubOptions {
  applications?: Wire[]
  /** 전 요청을 403 errorCode 20011로 떨어뜨린다(ADMIN 역할 없음). */
  forbidden?: boolean
  /** 첫 결정 요청을 409 errorCode 10101로 떨어뜨리고 서버 상태를 승인으로 바꾼다. */
  conflictOnFirstDecision?: boolean
}

/** admin 모듈 4종을 상태 있게 스텁한다. presigned URL은 상세 조회마다 새로 발급한다. */
async function stubAdminApi(page: Page, options: StubOptions = {}) {
  const applications = (options.applications ?? SEED).map(row => ({ ...row }))
  let conflictArmed = options.conflictOnFirstDecision ?? false
  let downloadIssue = 0

  await page.route(`${ADMIN_API_ORIGIN}/api/v1/admin/seller-applications**`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfillAdmin(route, 204, null)
    if (options.forbidden) {
      return fulfillAdmin(route, 403, { errorCode: 20011, message: '권한이 없습니다.' })
    }

    const url = new URL(route.request().url())
    const match = /\/admin\/seller-applications(?:\/(\d+)(?:\/(approve|reject))?)?$/.exec(
      url.pathname,
    )
    const id = match?.[1] == null ? null : Number(match[1])
    const action = match?.[2] ?? null

    if (id == null) {
      const status = url.searchParams.get('status')
      const page_ = Math.max(0, Number(url.searchParams.get('page') ?? 0) || 0)
      const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size') ?? 20) || 20))
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
          items: sorted.slice(page_ * size, page_ * size + size).map(row => ({
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
      downloadIssue += 1
      return fulfillAdmin(route, 200, {
        data: {
          ...row,
          rejectionReason: row.status === 'REJECTED' ? row.rejectionReason : null,
          documents: row.documents.map(document => ({
            ...document,
            downloadUrl: `https://files.local/${document.documentType}?issue=${downloadIssue}`,
          })),
        },
      })
    }

    // 다른 운영자가 먼저 처리한 상황 — 상태 가드가 409 errorCode 10101을 주고, 그 뒤 재조회에는
    // 바뀐 상태가 올라온다.
    if (conflictArmed) {
      conflictArmed = false
      row.status = 'APPROVED'
      row.decidedAt = '2026-06-19T09:00:00'
      row.reviews.push({
        decision: 'APPROVED',
        rejectionReason: null,
        reviewedAt: '2026-06-19T09:00:00',
      })
      return fulfillAdmin(route, 409, {
        errorCode: 10101,
        message: '현재 신청 상태에서 허용되지 않는 전이입니다.',
      })
    }

    if (row.status !== 'SUBMITTED' && row.status !== 'REVIEWING') {
      return fulfillAdmin(route, 409, {
        errorCode: 10101,
        message: '현재 신청 상태에서 허용되지 않는 전이입니다.',
      })
    }

    if (action === 'approve') {
      row.status = 'APPROVED'
      row.decidedAt = '2026-06-19T09:00:00'
      row.reviews.push({
        decision: 'APPROVED',
        rejectionReason: null,
        reviewedAt: '2026-06-19T09:00:00',
      })
      return fulfillAdmin(route, 204, null)
    }

    const body = (route.request().postDataJSON() ?? {}) as { reason?: string | null }
    const reason = body.reason ?? ''
    if (reason.length > 500) {
      return fulfillAdmin(route, 400, {
        errorCode: 90001,
        message: '반려 사유는 500자 이하여야 합니다.',
      })
    }
    if (reason.trim() === '') {
      return fulfillAdmin(route, 400, { errorCode: 10102, message: '반려 사유는 필수입니다.' })
    }
    row.status = 'REJECTED'
    row.decidedAt = '2026-06-19T09:00:00'
    row.rejectionReason = reason
    row.reviews.push({ decision: 'REJECTED', rejectionReason: reason, reviewedAt: '2026-06-19T09:00:00' })
    return fulfillAdmin(route, 204, null)
  })

  // 호스트 분기가 무동작이 되면(configureApiHosts 누락 등) 심사 요청이 api 호스트로 샌다.
  // 위 스텁은 admin origin만 받으므로 그 회귀는 "응답 없음"으로 조용히 보이기 쉽다 — 같은
  // 경로를 api 호스트에도 심어 두되 500으로 떨어뜨려 화면에 오류가 뜨게 만든다.
  await page.route(`${API_ORIGIN}/api/v1/admin/seller-applications**`, route =>
    route.fulfill({
      status: 500,
      headers: ADMIN_CORS,
      json: { errorCode: 90000, message: '심사 요청이 api 호스트로 샜습니다.' },
    }),
  )

  // 어드민 모듈에는 /auth/*가 없고 refresh는 늘 api 호스트(8080)로 나간다. 심사 요청이 401을
  // 받는 시나리오는 없지만, 스텁을 두지 않으면 실네트워크로 새어 진단이 어려워진다.
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

const REJECT_OPTION_CAPTION = '신청 반려 / 사유 기록 후 재제출 유도'

test('[AC-ADM-E2E-001] 목록 → 상세 Drawer → 반려 확인 Modal → 목록 반영', async ({ page }) => {
  await stubAdminApi(page)
  await page.goto('/sellers/applications')

  // 목록은 서버 정렬(제출일 내림차순)을 그대로 쓴다. 값이 submittedAt이므로 컬럼 라벨도
  // '제출일'이다 — Drawer가 appliedAt을 '신청일'로 보여 주므로 라벨이 겹치면 날짜가 어긋나 보인다.
  await expect(page.getByRole('columnheader', { name: '제출일' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '신청일' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '펫프렌즈상사' })).toBeVisible()
  await expect(page.getByRole('row').nth(1)).toContainText('펫프렌즈상사')
  // 목록 응답에 사업자등록번호가 없어 컬럼을 뺐다.
  await expect(page.getByRole('columnheader', { name: '사업자번호' })).toHaveCount(0)
  // 심사 대기 수는 목록 totalCount가 아니라 SUBMITTED만 세는 별도 조회에서 온다(여기선 2건).
  await expect(page.getByText('심사 대기 2')).toBeVisible()
  await shot(page, '01-list-default')

  await page.getByRole('button', { name: '해피독몰' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()
  // 평문으로 받은 대표자명·사업자등록번호를 화면이 마스킹한다.
  await expect(page.getByText('최*호')).toBeVisible()
  await expect(page.getByText('105-87-*****')).toBeVisible()
  // 상세 응답에 전화번호가 없고 내부 메모는 계약 자체가 없다.
  await expect(page.getByText('연락처')).toHaveCount(0)
  await expect(page.getByText('내부 메모')).toHaveCount(0)
  // documentType 6값이 한국어 라벨로 보인다.
  await expect(page.getByRole('button', { name: '통신판매업 신고증 열기' })).toBeVisible()
  await shot(page, '03-detail-drawer')

  await page.getByText(REJECT_OPTION_CAPTION).click()
  await page.getByLabel('반려 사유', { exact: true }).selectOption('incomplete-docs')
  await page.getByRole('button', { name: '제출' }).click()

  const modal = page.getByRole('dialog').filter({ hasText: '신청을 반려할까요?' })
  await expect(modal).toBeVisible()
  await shot(page, '04-reject-confirm-modal')

  await modal.getByRole('button', { name: '반려' }).click()
  await expect(page.getByText('신청을 반려했어요.')).toBeVisible()
  // 204라 낙관적 갱신이 아니라 무효화 후 재조회로 반영한다.
  await expect(
    page.getByRole('row').filter({ hasText: '해피독몰' }).getByText('반려', { exact: true }),
  ).toBeVisible()
})

test('[AC-ADM-E2E-005] 서류 열기는 팝업 차단에 걸리지 않고 새 탭에 새 presigned URL을 띄운다', async ({
  page,
  context,
}) => {
  await stubAdminApi(page)
  // 새 탭이 실제 S3로 나가지 않게 presigned GET도 가로챈다.
  await context.route('https://files.local/**', route =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'document' }),
  )
  await page.goto('/sellers/applications')

  await page.getByRole('button', { name: '펫프렌즈상사' }).click()
  const [documentTab] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('button', { name: '사업자등록증 열기' }).click(),
  ])

  // 재조회 뒤 window.open을 부르면 클릭의 user activation이 끊겨 Chrome이 팝업을 차단한다 —
  // 탭이 하나 더 열렸다는 것 자체가 제스처 안에서 열렸다는 증거다.
  await documentTab.waitForURL(/files\.local\/BUSINESS_REGISTRATION/)
  // 유효기간 5분짜리 링크라 상세를 다시 조회해 받은 새 URL이어야 한다(목록 진입 때 발급된 issue=1이 아니다).
  expect(documentTab.url()).not.toContain('issue=1')
  await expect(page.getByText('서류 링크를 새로 받지 못했어요.')).toHaveCount(0)
  await documentTab.close()
})

test('[AC-ADM-E2E-002] 조건에 맞는 신청이 없으면 빈 목록 안내가 뜬다', async ({ page }) => {
  await stubAdminApi(page, { applications: [] })
  await page.goto('/sellers/applications')

  await expect(page.getByText('조건에 맞는 입점 신청이 없어요.')).toBeVisible()
  await expect(page.getByText('전체 0건 (작성 중 / 신청 취소 포함)')).toBeVisible()
  await shot(page, '02-list-empty')
})

test('[AC-ADM-E2E-003] 다른 운영자가 먼저 처리하면 409 안내와 최신 상태가 함께 보인다', async ({
  page,
}) => {
  await stubAdminApi(page, { conflictOnFirstDecision: true })
  await page.goto('/sellers/applications')

  await page.getByRole('button', { name: '펫프렌즈상사' }).click()
  await expect(page.getByRole('heading', { name: '입점 신청 상세' })).toBeVisible()
  await page.getByRole('button', { name: '제출' }).click()

  const modal = page.getByRole('dialog').filter({ hasText: '입점을 승인할까요?' })
  await modal.getByRole('button', { name: '승인' }).click()

  await expect(page.getByText(/이미 처리된 신청이에요/)).toBeVisible()
  // 무효화 후 재조회로 상세가 승인 상태로 바뀌어 결정 입력이 사라진다.
  await expect(page.getByText(/승인 상태라 승인 \/ 반려를 처리할 수 없어요/)).toBeVisible()
  await expect(page.getByRole('button', { name: '제출' })).toHaveCount(0)
  await shot(page, '05-conflict')
})

test('[AC-ADM-E2E-004] 403 errorCode 20011이면 목록 자리에 권한 안내가 뜬다', async ({ page }) => {
  await stubAdminApi(page, { forbidden: true })
  await page.goto('/sellers/applications')

  // 어드민에는 온보딩 개념이 없어 403은 로그인/온보딩 유도가 아니라 권한 안내로만 끝난다.
  await expect(page.getByText(/어드민 권한이 없어/)).toBeVisible()
  await expect(page.getByText('조건에 맞는 입점 신청이 없어요.')).toBeVisible()
  await shot(page, '06-forbidden')
})

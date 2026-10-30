import { test, expect, type Page, type Route } from '@playwright/test'
import type { SaveSellerApplicationDraftRequest, SellerApplicationDetail } from '@aechak/api'

// 스토어 설정(입점 신청)의 **제출 체인** E2E. seller-onboarding.spec은 임시저장 한 번까지만 보고,
// 제출(저장 → submit 2단 mutation)·서류 presigned 업로드·반려 후 재제출은 E2E가 없었다.
//
// 이 화면이 한 번에 세 호스트 경계를 넘는다는 게 핵심이다:
//   presigned 발급 POST /files/presigned-url  → api 모듈(8080)
//   S3 PUT(서명이 자격증명이라 Authorization 금지) → 발급받은 URL
//   저장·제출 POST /seller-applications{,/submit} → seller 모듈(8081)
// 공유 인터셉터가 **요청 경로 접두로** 호스트를 가르므로(AGENTS.md 6-3), 글롭에 origin을 박아야
// 오배치가 드러난다 — `**/api/v1/...`로 두면 요청이 엉뚱한 모듈로 나가도 같은 스텁이 받아 준다.
//
// CORS: 8080·8081 모두 withCredentials로 나가므로 정확한 origin + Allow-Credentials가 필요하고,
// application/json 본문과 PUT은 프리플라이트를 부르므로 OPTIONS 방어가 필수다. 반대로 presigned
// PUT은 credentials 없는 fetch라 Allow-Credentials를 주지 않는다(실제 S3 버킷 CORS와 같다).
const ORIGIN = 'http://localhost:5173'
const API_ORIGIN = 'http://localhost:8080'
const SELLER_ORIGIN = 'http://localhost:8081'
const DOCS_ORIGIN = 'https://docs.e2e.local'

const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const PREFLIGHT = {
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  // 프리플라이트에서 Authorization은 `*` 와일드카드로 덮이지 않는다(Fetch 스펙).
  'Access-Control-Allow-Headers': 'Authorization,Content-Type',
  'Access-Control-Max-Age': '600',
}
const SHOTS = 'test-results/pr-e2e-guard'

async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: { ...CORS, ...PREFLIGHT } })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

// ── 시드 ─────────────────────────────────────────────────────────────────────
function detail(overrides: Partial<SellerApplicationDetail> = {}): SellerApplicationDetail {
  return {
    applicationId: 1,
    status: 'DRAFT',
    businessType: 'PERSONAL_GENERAL',
    businessName: null,
    businessRegNo: null,
    corpRegNo: null,
    representativeName: '정지은',
    telesalesNumber: null,
    bankCode: '004',
    accountNumberMasked: null,
    accountHolder: '정지은',
    appliedAt: '2026-10-20T09:00:00',
    submittedAt: null,
    decidedAt: null,
    rejectionReason: null,
    documents: [],
    ...overrides,
  }
}

const UPLOADED_DOCS: SellerApplicationDetail['documents'] = [
  { documentType: 'ID_CARD', uploadedAt: '2026-10-20T09:10:00' },
  { documentType: 'BANKBOOK_COPY', uploadedAt: '2026-10-20T09:11:00' },
]

const PNG = {
  name: 'id-card.png',
  mimeType: 'image/png',
  buffer: Buffer.from('e2e-id-card'),
}
const PDF = {
  name: 'bankbook.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('e2e-bankbook'),
}

interface Recorded {
  /** 순서까지 보는 요청 기록 — 저장이 submit보다 먼저 나가야 한다(BE 전이 규칙). */
  calls: string[]
  /** 스텁하지 않은 경로로 샌 요청. 0건이어야 한다. */
  leaks: string[]
  drafts: SaveSellerApplicationDraftRequest[]
  /** presigned PUT이 Authorization을 달고 나가면 S3 서명 검증이 깨진다 — 실측한다. */
  putAuthHeaders: (string | undefined)[]
  /**
   * 계약과 다른 메서드로 온 요청. 기록을 실제 메서드 대신 고정 문자열로 적으면 생성기가
   * submit을 PUT으로 바꿔도 `'POST /seller-applications/submit'` 단언이 그대로 통과한다.
   */
  wrongMethods: string[]
}

interface StubOptions {
  /** GET /seller-applications 응답 수열. 'notFound'는 404/10100(신청 이력 없음)이다. */
  snapshots: (SellerApplicationDetail | 'notFound' | 'error')[]
  /** 임시저장 응답을 가로채 바꾼다(실패 주입). 반환이 null이면 기본 성공. */
  onDraft?: (body: SaveSellerApplicationDraftRequest) => { status: number; json: unknown } | null
  /** 제출 응답. 기본 204. */
  submitResponse?: { status: number; json?: unknown }
  /** 임시저장 응답을 붙들어 전송 중 구간을 만든다. */
  holdDraft?: Promise<void>
  /** 제출(submit) 응답을 붙들어 **저장 이후** 전송 중 구간을 만든다. */
  holdSubmit?: Promise<void>
  /** n번째(1부터) presigned 발급을 실패시킨다 — 업로드 단계에서 체인이 끊기는지 본다. */
  failPresignedAt?: number
  /** n번째(1부터) S3 PUT을 실패시킨다. */
  failPutAt?: number
}

async function stubSellerApi(page: Page, options: StubOptions): Promise<Recorded> {
  const recorded: Recorded = {
    calls: [],
    leaks: [],
    drafts: [],
    putAuthHeaders: [],
    wrongMethods: [],
  }

  /** 계약 밖 메서드는 서버와 같게 405로 떨어뜨리고 기록한다. */
  function rejectMethod(route: Route, label: string) {
    recorded.wrongMethods.push(`${route.request().method()} ${label}`)
    return fulfill(route, 405, { errorCode: 90000, message: '허용되지 않는 메서드' })
  }

  // 감시 스텁을 먼저 등록한다 — Playwright는 마지막에 등록된 핸들러를 먼저 보므로
  // 뒤에 오는 구체 글롭이 우선권을 갖고, 둘 중 어디에도 없는 경로만 여기로 떨어진다.
  for (const origin of [API_ORIGIN, SELLER_ORIGIN]) {
    await page.route(`${origin}/api/v1/**`, route => {
      recorded.leaks.push(`${route.request().method()} ${route.request().url()}`)
      return fulfill(route, 500, { errorCode: 90000, message: '스텁하지 않은 경로' })
    })
  }

  await page.route(`${API_ORIGIN}/api/v1/auth/web/refresh`, route =>
    fulfill(route, 200, {
      data: { accessToken: 'e2e-token', tokenType: 'Bearer', expiresIn: 1800 },
    }),
  )

  // presigned 발급은 api 모듈이다 — 서류 종류별로 다른 키를 돌려줘 저장 본문에서 식별된다.
  let issued = 0
  await page.route(`${API_ORIGIN}/api/v1/files/presigned-url`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    if (method !== 'POST') return rejectMethod(route, '/files/presigned-url')
    const body = route.request().postDataJSON() as { purpose: string; contentType: string }
    issued += 1
    recorded.calls.push(`POST /files/presigned-url ${body.purpose} ${body.contentType}`)
    if (options.failPresignedAt === issued) {
      return fulfill(route, 500, { errorCode: 90000, message: '발급에 실패했습니다.' })
    }
    const key = `tmp/seller-doc-${issued}`
    return fulfill(route, 200, { data: { url: `${DOCS_ORIGIN}/put/${key}`, key } })
  })

  // S3 역할. presigned URL은 서명 자체가 자격증명이라 credentials도 Authorization도 없이 와야 한다.
  await page.route(`${DOCS_ORIGIN}/**`, route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': ORIGIN,
          'Access-Control-Allow-Methods': 'PUT,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }
    // presigned 업로드는 PUT뿐이다(POST form 업로드 계약이 아니다).
    if (request.method() !== 'PUT') {
      recorded.wrongMethods.push(`${request.method()} ${new URL(request.url()).pathname}`)
      return route.fulfill({ status: 405, headers: { 'Access-Control-Allow-Origin': ORIGIN } })
    }
    recorded.calls.push(`PUT ${new URL(request.url()).pathname}`)
    recorded.putAuthHeaders.push(request.headers()['authorization'])
    if (options.failPutAt === recorded.putAuthHeaders.length) {
      return route.fulfill({ status: 403, headers: { 'Access-Control-Allow-Origin': ORIGIN } })
    }
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': ORIGIN } })
  })

  let getCount = 0
  await page.route(`${SELLER_ORIGIN}/api/v1/seller-applications`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)

    if (method === 'POST') {
      const body = route.request().postDataJSON() as SaveSellerApplicationDraftRequest
      recorded.calls.push('POST /seller-applications')
      recorded.drafts.push(body)
      if (options.holdDraft) await options.holdDraft
      const override = options.onDraft?.(body) ?? null
      if (override) return fulfill(route, override.status, override.json)
      // 저장 응답은 신청서 전체다 — 화면이 재조회 없이 이 응답으로 상태를 갈아끼운다.
      return fulfill(route, 200, {
        data: detail({
          status: 'DRAFT',
          representativeName: body.representativeName,
          accountHolder: body.accountHolder,
          accountNumberMasked: body.accountNumber ? '********6789' : null,
          // documents는 스펙상 optional이다 — 이번 저장에 실린 것만 등록 시각을 붙여 돌려준다.
          documents: (body.documents ?? []).map((document, index) => ({
            documentType: document.documentType,
            uploadedAt: `2026-10-20T10:0${index}:00`,
          })),
        }),
      })
    }

    // 조회는 GET뿐이다 — 메서드를 안 가르면 PUT·DELETE가 와도 조회로 기록돼 묻힌다.
    if (method !== 'GET') return rejectMethod(route, '/seller-applications')
    recorded.calls.push('GET /seller-applications')
    const snapshot =
      options.snapshots[Math.min(getCount, options.snapshots.length - 1)] ?? 'notFound'
    getCount += 1
    if (snapshot === 'notFound') {
      return fulfill(route, 404, { errorCode: 10100, message: '입점 신청을 찾을 수 없습니다.' })
    }
    if (snapshot === 'error') {
      return fulfill(route, 500, { errorCode: 90000, message: 'server error' })
    }
    return fulfill(route, 200, { data: snapshot })
  })

  await page.route(`${SELLER_ORIGIN}/api/v1/seller-applications/submit`, async route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    if (method !== 'POST') return rejectMethod(route, '/seller-applications/submit')
    recorded.calls.push('POST /seller-applications/submit')
    if (options.holdSubmit) await options.holdSubmit
    const response = options.submitResponse ?? { status: 204 }
    return fulfill(route, response.status, response.json)
  })

  return recorded
}

// ── 1. 서류 업로드 → 저장 → 제출 ─────────────────────────────────────────────
test('[AC-STORE-E2E-001] 제출하기 한 번이 presigned 업로드 → 저장 → submit 순서로 나가고 심사 대기로 넘어간다', async ({
  page,
}) => {
  const recorded = await stubSellerApi(page, {
    // 없음 → (저장이 캐시를 DRAFT로 갈아끼움) → submit 후 재조회가 SUBMITTED
    snapshots: ['notFound', detail({ status: 'SUBMITTED', submittedAt: '2026-10-20T10:05:00', documents: UPLOADED_DOCS })],
  })

  await page.goto('/store-settings')
  await expect(page.getByText('작성 전')).toBeVisible()
  // 개인 일반의 필수 서류는 신분증·통장 사본 둘이다 — 둘 다 없으면 제출이 잠긴다.
  await expect(page.getByText('제출 전 필요: 신분증, 통장 사본')).toBeVisible()
  await expect(page.getByRole('button', { name: '제출하기' })).toBeDisabled()
  // 임시저장은 서류 없이도 열려 있다(작성 중 저장이 막히면 이어 쓰기가 불가능해진다).
  await expect(page.getByRole('button', { name: '임시저장' })).toBeEnabled()
  await shot(page, 'store-01-new-application')

  // 숨김 file input은 라벨로 찾는다(setInputFiles는 가시성을 요구하지 않는다).
  await page.getByLabel('신분증 파일 선택').setInputFiles(PNG)
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)
  // 선택만으로는 아직 서버에 없다 — 저장 시점에 올라간다.
  await expect(page.getByText('첨부됨 (저장 전)')).toHaveCount(2)
  await expect(page.getByText('id-card.png', { exact: false })).toBeVisible()
  // 서류가 채워지면 제출이 열린다.
  await expect(page.getByText(/제출 전 필요/)).toHaveCount(0)
  const submit = page.getByRole('button', { name: '제출하기' })
  await expect(submit).toBeEnabled()
  await shot(page, 'store-02-documents-attached')

  await page.getByLabel('계좌번호').fill('110123456789')
  await page.getByLabel('예금주').fill('정지은')
  await submit.click()

  await expect(page.getByText('제출했어요. 심사 결과를 알림으로 알려드릴게요.')).toBeVisible()

  // 순서가 계약이다 — 발급과 PUT이 서류별로 짝지어 직렬로 돌고(한 건이 실패하면 거기서 멈춘다),
  // 저장이 성공한 뒤에만 submit이 나간다(반려 상태에서 저장 없이 제출하면 BE가 10101을 준다).
  expect(recorded.calls).toEqual([
    'GET /seller-applications',
    'POST /files/presigned-url SELLER_DOCUMENT image/png',
    'PUT /put/tmp/seller-doc-1',
    'POST /files/presigned-url SELLER_DOCUMENT application/pdf',
    'PUT /put/tmp/seller-doc-2',
    'POST /seller-applications',
    'POST /seller-applications/submit',
    'GET /seller-applications',
  ])
  // presigned PUT에 Authorization을 얹으면 S3 서명 검증이 깨진다.
  expect(recorded.putAuthHeaders).toEqual([undefined, undefined])

  // 저장 본문은 전체 덮어쓰기라 폼 전부를 싣고, documents는 발급받은 tmpKey를 그대로 넘긴다.
  expect(recorded.drafts).toHaveLength(1)
  expect(recorded.drafts[0]).toMatchObject({
    businessType: 'PERSONAL_GENERAL',
    accountNumber: '110123456789',
    accountHolder: '정지은',
    documents: [
      { documentType: 'ID_CARD', tmpKey: 'tmp/seller-doc-1' },
      { documentType: 'BANKBOOK_COPY', tmpKey: 'tmp/seller-doc-2' },
    ],
  })

  // 제출 성공은 무효화 → 재조회로 반영된다. 폼이 사라지고 심사 대기 안내만 남는다.
  await expect(page.getByText('심사 대기 중이에요')).toBeVisible()
  await expect(page.getByRole('button', { name: '제출하기' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '임시저장' })).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
  await shot(page, 'store-03-submitted')
})

// ── 2. 전송 중 중복 제출 방지 ─────────────────────────────────────────────────
test('[AC-STORE-E2E-002] 전송 중에는 제출·임시저장이 모두 잠겨, 다시 눌러도 저장과 submit이 한 번씩만 나간다', async ({
  page,
}) => {
  // 초기값을 둔다 — Promise 실행자 안의 대입을 제어 흐름 분석이 못 보고 never로 좁히기 때문이다.
  let releaseDraft: () => void = () => {}
  const holdDraft = new Promise<void>(resolve => {
    releaseDraft = resolve
  })
  // 체인이 2단이라 **구간이 둘**이다 — 저장 대기와 제출 대기를 따로 붙들어야 둘 다 검사된다.
  // 저장만 붙들면 isBusy에서 submitApplication.isPending을 빼도 이 테스트가 통과한다.
  let releaseSubmit: () => void = () => {}
  const holdSubmit = new Promise<void>(resolve => {
    releaseSubmit = resolve
  })
  const recorded = await stubSellerApi(page, {
    snapshots: ['notFound', detail({ status: 'SUBMITTED', documents: UPLOADED_DOCS })],
    holdDraft,
    holdSubmit,
  })

  await page.goto('/store-settings')
  await page.getByLabel('신분증 파일 선택').setInputFiles(PNG)
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)

  const submit = page.getByRole('button', { name: '제출하기' })
  const save = page.getByRole('button', { name: '임시저장' })
  const draftRequest = page.waitForRequest(
    request => request.method() === 'POST' && request.url().endsWith('/seller-applications'),
  )
  await submit.click()
  await draftRequest

  // (1) 저장이 떠 있는 동안 두 버튼이 함께 잠긴다 — 잠긴 버튼은 강제로 눌러도 click이 발화하지 않는다.
  await expect(submit).toBeDisabled()
  await expect(save).toBeDisabled()
  await submit.click({ force: true })
  await save.click({ force: true })

  // (2) 저장이 끝나고 submit 응답을 기다리는 구간. 여기서 버튼이 풀리면 두 번째 제출이 겹쳐
  // 나가고 BE는 이미 SUBMITTED인 신청에 10101을 준다.
  const submitRequest = page.waitForRequest(
    request => request.method() === 'POST' && request.url().endsWith('/seller-applications/submit'),
  )
  releaseDraft()
  await submitRequest
  await expect(submit).toBeDisabled()
  await expect(save).toBeDisabled()
  await submit.click({ force: true })
  await save.click({ force: true })

  releaseSubmit()
  await expect(page.getByText('제출했어요. 심사 결과를 알림으로 알려드릴게요.')).toBeVisible()
  expect(recorded.calls.filter(call => call === 'POST /seller-applications')).toHaveLength(1)
  expect(recorded.calls.filter(call => call === 'POST /seller-applications/submit')).toHaveLength(1)
  // 업로드도 한 번씩만 — 다시 눌릴 때마다 presigned를 또 받으면 S3에 고아 객체가 쌓인다.
  expect(recorded.calls.filter(call => call.startsWith('POST /files/presigned-url'))).toHaveLength(2)
  expect(recorded.leaks).toEqual([])
  expect(recorded.wrongMethods).toEqual([])
})

// ── 3. 계좌 재입력 가드는 네트워크 전에 막는다 ───────────────────────────────
test('[AC-STORE-E2E-003] 서버에 계좌가 있는데 계좌번호를 비우고 저장하면 요청 없이 재입력을 요구한다', async ({
  page,
}) => {
  const recorded = await stubSellerApi(page, {
    snapshots: [
      detail({ status: 'DRAFT', accountNumberMasked: '********6789', documents: UPLOADED_DOCS }),
    ],
  })

  await page.goto('/store-settings')
  await expect(page.getByText('작성 중', { exact: true })).toBeVisible()
  // 응답에는 마스킹만 오므로 폼의 계좌번호 칸은 항상 빈 채로 시드된다.
  await expect(page.getByLabel('계좌번호')).toHaveValue('')
  // 같은 문구가 **입력칸 helperText로 항상** 떠 있다 — 거절 안내를 그 문구로 단언하면
  // setActionError를 지워도 통과한다. 누르기 전 1건이라는 사실을 먼저 못박는다.
  const reentryMessage = page.getByText('보안을 위해 계좌번호는 저장할 때마다 다시 입력해야 해요.')
  await expect(reentryMessage).toHaveCount(1)
  // DS Alert는 role=alert이다 — 거절 안내를 여기로 좁혀야 helperText와 섞이지 않는다.
  const guardAlert = page
    .getByRole('alert')
    .filter({ hasText: '보안을 위해 계좌번호는 저장할 때마다 다시 입력해야 해요.' })
  await expect(guardAlert).toHaveCount(0)

  await page.getByRole('button', { name: '임시저장' }).click()
  // 저장은 전체 덮어쓰기라 빈 계좌번호를 보내면 서버에 저장된 계좌가 조용히 소거된다 — 막아야 한다.
  // 거절은 helperText가 아니라 **오류 Alert**로 새로 떠야 한다(helper 1 + Alert 1 = 2).
  await expect(guardAlert).toBeVisible()
  await expect(reentryMessage).toHaveCount(2)
  expect(recorded.calls).toEqual(['GET /seller-applications'])
  await shot(page, 'store-04-account-reentry-required')

  // 다시 입력하면 그대로 저장된다.
  await page.getByLabel('계좌번호').fill('110123456789')
  await page.getByRole('button', { name: '임시저장' }).click()
  await expect(page.getByText('저장했어요.')).toBeVisible()
  expect(recorded.drafts).toHaveLength(1)
  expect(recorded.drafts[0]?.accountNumber).toBe('110123456789')
  expect(recorded.leaks).toEqual([])
})

// ── 4. 반려 → 재제출 ─────────────────────────────────────────────────────────
test('[AC-STORE-E2E-004] 반려는 사유와 재제출하기를 보여주고, 재제출도 저장 → submit 체인을 탄다', async ({
  page,
}) => {
  const recorded = await stubSellerApi(page, {
    snapshots: [
      detail({
        status: 'REJECTED',
        rejectionReason: '통장 사본이 흐려 계좌번호를 확인할 수 없어요.',
        decidedAt: '2026-10-21T09:00:00',
        documents: UPLOADED_DOCS,
      }),
      detail({ status: 'SUBMITTED', submittedAt: '2026-10-22T09:00:00', documents: UPLOADED_DOCS }),
    ],
  })

  await page.goto('/store-settings')
  await expect(page.getByText('반려', { exact: true })).toBeVisible()
  // 반려 사유는 서버가 유일하게 알려 주는 보완 지시다 — 화면에 그대로 드러나야 한다.
  await expect(page.getByText('통장 사본이 흐려 계좌번호를 확인할 수 없어요.')).toBeVisible()
  // 반려는 별도 단계가 아니라 심사 단계의 부정 결과로 표기된다.
  await expect(page.getByText('심사 반려')).toBeVisible()
  // 폼이 다시 열리고 버튼 문구가 재제출로 바뀐다(BE는 REJECTED → 저장 시 DRAFT로 되돌린다).
  const resubmit = page.getByRole('button', { name: '재제출하기' })
  await expect(resubmit).toBeEnabled()
  // getByRole의 name은 기본이 부분 일치라 '제출하기'가 '재제출하기'에도 걸린다 — exact로 가른다.
  await expect(page.getByRole('button', { name: '제출하기', exact: true })).toHaveCount(0)
  await shot(page, 'store-05-rejected')

  // 서류를 교체하고 재제출 — 교체분만 presigned로 올라간다.
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)
  await expect(page.getByText('첨부됨 (저장 전)')).toHaveCount(1)
  await resubmit.click()

  await expect(page.getByText('제출했어요. 심사 결과를 알림으로 알려드릴게요.')).toBeVisible()
  expect(recorded.calls).toEqual([
    'GET /seller-applications',
    'POST /files/presigned-url SELLER_DOCUMENT application/pdf',
    'PUT /put/tmp/seller-doc-1',
    'POST /seller-applications',
    'POST /seller-applications/submit',
    'GET /seller-applications',
  ])
  expect(recorded.drafts[0]?.documents).toEqual([
    { documentType: 'BANKBOOK_COPY', tmpKey: 'tmp/seller-doc-1' },
  ])
  await expect(page.getByText('심사 대기 중이에요')).toBeVisible()
  expect(recorded.leaks).toEqual([])
})

// ── 5. 제출 거절(10105)은 폼에 머물며 부족한 항목을 알린다 ───────────────────
test('[AC-STORE-E2E-005] 저장은 됐지만 제출이 10105면 부족한 항목을 알리고 폼에 머문다', async ({
  page,
}) => {
  const recorded = await stubSellerApi(page, {
    snapshots: ['notFound', detail({ status: 'DRAFT', documents: UPLOADED_DOCS })],
    submitResponse: {
      status: 400,
      json: {
        errorCode: 10105,
        // BE message는 격식체라 화면이 콜론 뒤 목록만 뽑아 '제출 전 필요' 줄과 같은 꼴로 보여준다.
        message: '필수 정보가 누락됐습니다: 대표자명 / 필수 서류가 누락됐습니다: 통장 사본',
      },
    },
  })

  await page.goto('/store-settings')
  await page.getByLabel('신분증 파일 선택').setInputFiles(PNG)
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)
  await page.getByRole('button', { name: '제출하기' }).click()

  await expect(page.getByText('제출 전 필요: 대표자명, 통장 사본')).toBeVisible()
  // 저장까지는 성공했으니 그 사실을 되돌리지 않고, 제출만 다시 시도할 수 있게 폼을 열어 둔다.
  expect(recorded.calls.filter(call => call === 'POST /seller-applications')).toHaveLength(1)
  expect(recorded.calls.filter(call => call === 'POST /seller-applications/submit')).toHaveLength(1)
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled()
  await expect(page.getByText('심사 대기 중이에요')).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
  await shot(page, 'store-06-submit-rejected')
})

// ── 6. 서류 형식 가드도 네트워크 전에 막는다 ─────────────────────────────────
test('[AC-STORE-E2E-006] 허용 밖 형식은 선택 단계에서 거절돼 presigned 발급이 나가지 않는다', async ({
  page,
}) => {
  const recorded = await stubSellerApi(page, { snapshots: ['notFound'] })

  await page.goto('/store-settings')
  await page.getByLabel('신분증 파일 선택').setInputFiles({
    name: 'id-card.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  })

  // 서버도 400/100000으로 거절하는 형식이라 선택 단계에서 잡는다 — 첨부로 잡히지도 않는다.
  await expect(page.getByText('PNG, JPG, WEBP, PDF 형식만 올릴 수 있어요')).toBeVisible()
  await expect(page.getByText('첨부됨 (저장 전)')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '제출하기' })).toBeDisabled()
  expect(recorded.calls).toEqual(['GET /seller-applications'])
  expect(recorded.leaks).toEqual([])
})

// ── 7. 조회 실패는 백지가 아니라 재시도 ──────────────────────────────────────
test('[AC-STORE-E2E-007] 신청 조회 500은 백지가 아니라 다시 시도가 있는 안내다', async ({ page }) => {
  // QueryClient가 retry:1이라 첫 조회는 두 번 나간다 — 둘 다 떨어뜨려야 오류 화면에 닿는다.
  const recorded = await stubSellerApi(page, {
    snapshots: ['error', 'error', detail({ status: 'DRAFT', documents: UPLOADED_DOCS })],
  })

  await page.goto('/store-settings')
  await expect(page.getByText('신청 정보를 불러오지 못했어요')).toBeVisible()
  // 폼이 백지로 뜨면 운영자는 신청서가 사라진 줄 안다.
  await expect(page.getByRole('button', { name: '임시저장' })).toHaveCount(0)
  await shot(page, 'store-07-load-error')

  await page.getByRole('button', { name: '다시 시도' }).click()
  await expect(page.getByText('작성 중', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '임시저장' })).toBeEnabled()
  expect(recorded.leaks).toEqual([])
})

// ── 8. 업로드가 깨지면 체인이 거기서 멈춘다 ──────────────────────────────────
test('[AC-STORE-E2E-008] 두 번째 서류 업로드가 실패하면 저장도 submit도 나가지 않고 선택이 남는다', async ({
  page,
}) => {
  // 서류별 발급 → PUT이 직렬 짝이라 두 번째 PUT에서 끊는다. 성공 경로만 보면 "업로드가 깨졌는데
  // 저장은 나가는" 회귀를 못 잡는다 — 그러면 서버엔 tmpKey 없는 신청서가 저장된다.
  const recorded = await stubSellerApi(page, {
    snapshots: ['notFound'],
    failPutAt: 2,
  })

  await page.goto('/store-settings')
  await page.getByLabel('신분증 파일 선택').setInputFiles(PNG)
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)
  await page.getByRole('button', { name: '제출하기' }).click()

  await expect(page.getByText('서류 업로드 실패 (403)')).toBeVisible()
  // 첫 서류는 올라갔지만 두 번째에서 멈췄다 — 저장·submit은 한 건도 나가면 안 된다.
  expect(recorded.calls).toEqual([
    'GET /seller-applications',
    'POST /files/presigned-url SELLER_DOCUMENT image/png',
    'PUT /put/tmp/seller-doc-1',
    'POST /files/presigned-url SELLER_DOCUMENT application/pdf',
    'PUT /put/tmp/seller-doc-2',
  ])
  expect(recorded.drafts).toEqual([])
  // 선택한 파일이 날아가면 운영자가 둘 다 다시 고른다 — 첨부 상태는 남아 있어야 한다.
  await expect(page.getByText('첨부됨 (저장 전)')).toHaveCount(2)
  // 버튼이 풀려 다시 시도할 수 있어야 한다(전송 중 상태로 굳으면 화면이 잠겨 버린다).
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '임시저장' })).toBeEnabled()
  await expect(page.getByText('심사 대기 중이에요')).toHaveCount(0)
  expect(recorded.leaks).toEqual([])
  expect(recorded.wrongMethods).toEqual([])
  await shot(page, 'store-08-upload-failed')
})

// ── 9. 저장이 실패하면 submit은 아예 나가지 않는다 ───────────────────────────
test('[AC-STORE-E2E-009] 임시저장이 403/10103으로 거절되면 submit이 나가지 않고 사유만 뜬다', async ({
  page,
}) => {
  // submit은 saveDraft의 onSuccess 안에서만 불려야 한다 — 저장 실패 후에도 submit이 나가면
  // BE가 낡은 신청서를 심사로 올린다(반려 상태라면 10101).
  const recorded = await stubSellerApi(page, {
    snapshots: ['notFound'],
    onDraft: () => ({
      // 휴대폰 미인증은 스펙상 **403** errorCode 10103이다(schema.yaml의 saveSellerApplicationDraft,
      // "선행 조건 — 가장 먼저 검사"). 401이 아닌 403이라 refresh를 타지 않고 그대로 onError로
      // 내려와야 한다 — 상태를 400으로 두면 계약에 없는 조합이라 이 경로를 못 본다.
      status: 403,
      // BE message는 격식체라 화면이 자체 카피로 갈아 끼운다 — 그대로 흘려보내면
      // -해요체 규칙(AGENTS.md 5절)이 깨진다.
      json: { errorCode: 10103, message: '휴대폰 본인 인증이 필요합니다.' },
    }),
  })

  await page.goto('/store-settings')
  await page.getByLabel('신분증 파일 선택').setInputFiles(PNG)
  await page.getByLabel('통장 사본 파일 선택').setInputFiles(PDF)
  await page.getByRole('button', { name: '제출하기' }).click()

  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: '휴대폰 본인 인증이 필요해요. 구매자 앱 마이페이지에서 인증한 뒤 다시 시도해 주세요.' }),
  ).toBeVisible()
  expect(recorded.calls.filter(call => call === 'POST /seller-applications')).toHaveLength(1)
  expect(recorded.calls.filter(call => call === 'POST /seller-applications/submit')).toHaveLength(0)
  await expect(page.getByText('심사 대기 중이에요')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '제출하기' })).toBeEnabled()
  expect(recorded.leaks).toEqual([])
  expect(recorded.wrongMethods).toEqual([])
  await shot(page, 'store-09-draft-rejected')
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import type { InspectionStage, SellerProductInspection } from '@aechak/api'
import { SELLER_PRODUCTS_URL, makeSellerProductWire, seedSellerProducts, server } from '@/testing/msw/server'
import { isInspectionInProgress } from '../products.queries'
import { routeTree } from '../../../routeTree.gen'

// 검수 진행 Drawer — 진행 단계는 서버가 계산해 주므로 화면은 단계별로 무엇을 보여 주는지만 고정한다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const PRODUCT = makeSellerProductWire({ name: '연어 건사료 2kg', inspectionStatus: 'REJECTED' })

// 기본값은 AI가 반려한 상품 — 관리자가 아직 보지 않아 rejectReason이 비어 있다.
function inspectionWire(overrides: Partial<SellerProductInspection>): SellerProductInspection {
  return {
    productId: PRODUCT.productId,
    inspectionStatus: 'REJECTED',
    progressStep: 'REJECTED',
    processingState: 'SETTLED',
    judgment: 'FLAG',
    reasonCode: 'MEDICAL_CLAIM',
    reasonSummary: '관절염 치료에 효과',
    sellerNotice: '치료 효능 표현을 고쳐 주세요.',
    rejectReason: null,
    requestedAt: '2026-10-22T10:00:00',
    settledAt: '2026-10-22T10:00:40',
    violations: [],
    ...overrides,
  }
}

function serveInspection(wire: SellerProductInspection) {
  server.use(
    http.get(`${SELLER_PRODUCTS_URL}/:productId/inspection`, () => HttpResponse.json({ data: wire })),
  )
}

let lastAppealBody: unknown = null

/** 제기 응답은 조회와 같은 모양이다 — 화면은 이 응답만으로 제기 이력으로 바뀌어야 한다. */
function serveAppeal(wire: SellerProductInspection) {
  server.use(
    http.post(`${SELLER_PRODUCTS_URL}/:productId/inspection/appeals`, async ({ request }) => {
      lastAppealBody = await request.json()
      return HttpResponse.json({ data: wire })
    }),
  )
}

async function openDrawer() {
  const user = userEvent.setup()
  const row = (await screen.findByText(PRODUCT.name)).closest('tr') as HTMLElement
  await user.click(within(row).getByRole('button', { name: `${PRODUCT.name} 검수 진행 보기` }))
  return user
}

describe('/products 검수 진행 Drawer (SCRUM-283)', () => {
  beforeEach(() => {
    lastAppealBody = null
    seedSellerProducts([{ product: PRODUCT }])
  })

  it('[AC-SPRD-070] AI가 반려하면 찾은 문구와 안내를 보여 주고 수정 화면으로 보낸다', async () => {
    serveInspection(inspectionWire({}))
    const router = renderAt('/products')

    const user = await openDrawer()

    expect(await screen.findByText('AI가 확인이 필요한 표현을 찾아 반려했어요')).toBeInTheDocument()
    expect(screen.getByText('관절염 치료에 효과')).toBeInTheDocument()
    expect(screen.getByText('치료 효능 표현을 고쳐 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('관리자 확인'), 'AI 반려는 관리자 확인을 거치지 않는다').not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '수정하러 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/products/${PRODUCT.productId}/edit`))
  })

  it('[AC-SPRD-071] 관리자가 반려한 상품을 고쳐 통과하면 관리자가 다시 확인 중이라고 안내한다', async () => {
    serveInspection(
      inspectionWire({
        progressStep: 'ADMIN_REVIEWING',
        judgment: 'PASS',
        reasonCode: null,
        reasonSummary: null,
        sellerNotice: null,
        rejectReason: '효능 표현을 빼고 다시 등록해 주세요.',
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('관리자가 다시 확인하고 있어요')).toBeInTheDocument()
    expect(screen.getByText('관리자 확인')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정하러 가기' })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-072] 관리자가 반려하면 관리자가 적은 사유를 보여 준다', async () => {
    serveInspection(inspectionWire({ rejectReason: '효능 표현을 빼고 다시 등록해 주세요.' }))
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('관리자가 반려했어요')).toBeInTheDocument()
    expect(screen.getByText('효능 표현을 빼고 다시 등록해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('관리자 확인')).toBeInTheDocument()
  })

  it('[AC-SPRD-073] AI가 보는 동안만 다시 조회한다', () => {
    expect(isInspectionInProgress('REQUESTED')).toBe(true)
    expect(isInspectionInProgress('AI_REVIEWING')).toBe(true)
    expect(isInspectionInProgress('ADMIN_REVIEWING')).toBe(false)
    expect(isInspectionInProgress('APPROVED')).toBe(false)
    expect(isInspectionInProgress(undefined)).toBe(false)
  })

  // ─── 이의 제기 (SCRUM-287) ────────────────────────────────────────────────
  // 반려 → 셀러 이의 → 어드민 재검토 체인의 첫 칸이다. 제기할 이의가 없는 상품에 입구를 내주면
  // 셀러가 눌러 보고 거절당하고, 이미 제기한 상품에 또 내주면 뜻을 알 수 없는 실패를 받는다.

  it('[AC-SPRD-080] 검수를 통과한 상품에는 이의 제기 입구가 없다', async () => {
    serveInspection(
      inspectionWire({
        inspectionStatus: 'APPROVED',
        progressStep: 'APPROVED',
        judgment: 'PASS',
        reasonCode: null,
        reasonSummary: null,
        sellerNotice: null,
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('검수를 통과했어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이의 제기' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('이의 제기 사유')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-081] 관리자 확인을 기다리는 반려 상품에도 이의 제기 입구를 내준다', async () => {
    // progressStep은 ADMIN_REVIEWING으로 앞서 가지만 inspectionStatus는 아직 REJECTED다 —
    // progressStep만 보면 이 상품의 입구가 사라진다.
    serveInspection(
      inspectionWire({
        inspectionStatus: 'REJECTED',
        progressStep: 'ADMIN_REVIEWING',
        judgment: 'PASS',
        reasonCode: null,
        reasonSummary: null,
        sellerNotice: null,
        rejectReason: '효능 표현을 빼고 다시 등록해 주세요.',
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('관리자가 다시 확인하고 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이의 제기' })).toBeInTheDocument()
  })

  it('[AC-SPRD-082] 사유를 적어야 보낼 수 있고, 보내면 사유를 그대로 보내고 제기 이력으로 바뀐다', async () => {
    serveInspection(inspectionWire({}))
    serveAppeal(
      inspectionWire({ appealedAt: '2026-10-23T09:12:00', appealReason: '치료 효능이 아니라 성분 설명이에요.' }),
    )
    renderAt('/products')

    const user = await openDrawer()

    const submit = await screen.findByRole('button', { name: '이의 제기' })
    expect(submit, '사유 없는 이의는 관리자가 재검토할 근거가 없다').toBeDisabled()

    await user.type(screen.getByLabelText('이의 제기 사유'), '치료 효능이 아니라 성분 설명이에요.')
    await user.click(screen.getByRole('button', { name: '이의 제기' }))

    // 제기 응답이 조회와 같은 모양이라 다시 읽지 않고도 이력이 그려진다.
    expect(await screen.findByText('2026.10.23 09:12에 이의를 제기했어요')).toBeInTheDocument()
    expect(lastAppealBody).toEqual({ reason: '치료 효능이 아니라 성분 설명이에요.' })
    expect(screen.queryByRole('button', { name: '이의 제기' })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-083] 이미 제기한 상품은 입구 대신 제기한 시각과 사유를 보여 준다', async () => {
    serveInspection(
      inspectionWire({ appealedAt: '2026-10-23T09:12:00', appealReason: '치료 효능이 아니라 성분 설명이에요.' }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('2026.10.23 09:12에 이의를 제기했어요')).toBeInTheDocument()
    expect(screen.getByText('치료 효능이 아니라 성분 설명이에요.')).toBeInTheDocument()
    // 서버가 재제기를 어떻게 거절하는지 확인하지 못했다 — 열어 두면 셀러가 알 수 없는 실패를 받는다.
    expect(screen.queryByRole('button', { name: '이의 제기' })).not.toBeInTheDocument()
  })

  it('[AC-SPRD-084] 제기가 실패하고 검수를 다시 읽지도 못하면 이의 제기를 잠근다', async () => {
    // 제기 실패는 검수를 다시 읽어 확인한다 — 다른 탭에서 먼저 보냈다면 재조회가 이력을 들고 온다.
    // 그 재조회까지 실패하면 화면에는 직전 값만 남고, 그 낡은 반려로 다시 보내게 두면 안 된다(규약 7).
    serveInspection(inspectionWire({}))
    renderAt('/products')

    const user = await openDrawer()
    await user.type(await screen.findByLabelText('이의 제기 사유'), '성분 설명이에요.')
    const submit = screen.getByRole('button', { name: '이의 제기' })
    expect(submit).toBeEnabled()

    // 첫 조회가 끝난 뒤에 끊는다 — 처음부터 끊으면 Drawer에 그릴 값 자체가 없어 입구가 나오지 않는다.
    const serverError = () => HttpResponse.json({ errorCode: 90000, message: '서버 오류' }, { status: 500 })
    server.use(
      http.post(`${SELLER_PRODUCTS_URL}/:productId/inspection/appeals`, serverError),
      http.get(`${SELLER_PRODUCTS_URL}/:productId/inspection`, serverError),
    )
    await user.click(submit)

    await waitFor(() => expect(screen.getByRole('button', { name: '이의 제기' })).toBeDisabled())
    // 반려 내용은 지우지 않는다 — 마지막으로 본 것은 정보다.
    expect(screen.getByText('관절염 치료에 효과')).toBeInTheDocument()
  })

  // ─── 수정 필요 항목 ───────────────────────────────────────────────────────

  const violationItem = (text: string) => screen.getByText(text).closest('li') as HTMLElement

  it('[AC-SPRD-090] 반려 사유 아래에 위반마다 분류 이름과 걸린 표현과 수정 제안을 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        violations: [
          {
            category: 'MEDICAL_CLAIM',
            quote: '슬개골 탈구와 관절염이 2주 만에 완치됩니다',
            suggestion: '관절 건강 유지에 도움을 줄 수 있습니다',
          },
          { category: 'EFFICACY_OVERCLAIM', quote: '수술 없이도 100% 회복되며', suggestion: '개선에 도움을 줄 수 있습니다' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const title = await screen.findByText('수정 필요 항목')
    expect(title.closest('[role="alert"]'), '사유 Alert 바깥에 둔다').toBeNull()
    const notice = screen.getByText('치료 효능 표현을 고쳐 주세요.')
    expect(notice.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING, '사유 아래에 둔다').toBeTruthy()

    const first = violationItem('슬개골 탈구와 관절염이 2주 만에 완치됩니다')
    expect(within(first).getByText('질병 치료 효능')).toBeInTheDocument()
    expect(within(first).getByText('걸린 표현').nextElementSibling).toHaveTextContent(
      '슬개골 탈구와 관절염이 2주 만에 완치됩니다',
    )
    expect(within(first).getByText('수정 제안').nextElementSibling).toHaveTextContent(
      '관절 건강 유지에 도움을 줄 수 있습니다',
    )

    const second = violationItem('수술 없이도 100% 회복되며')
    expect(within(second).getByText('효능 과장')).toBeInTheDocument()
    expect(within(second).getByText('수정 제안').nextElementSibling).toHaveTextContent('개선에 도움을 줄 수 있습니다')
  })

  it('[AC-SPRD-091] 제안이나 걸린 표현이 null이면 그 줄을 그리지 않는다', async () => {
    serveInspection(
      inspectionWire({
        violations: [
          { category: 'CONTACT_INFO', quote: '010-1234-5678', suggestion: null },
          { category: 'BANNED_INGREDIENT', quote: null, suggestion: '다른 성분으로 바꿔 주세요' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const ruleViolation = (await screen.findByText('연락처 노출')).closest('li') as HTMLElement
    expect(within(ruleViolation).getByText('010-1234-5678')).toBeInTheDocument()
    expect(within(ruleViolation).queryByText('수정 제안')).not.toBeInTheDocument()

    const noQuote = violationItem('금지 성분')
    expect(within(noQuote).getByText('다른 성분으로 바꿔 주세요')).toBeInTheDocument()
    expect(within(noQuote).queryByText('걸린 표현')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-092] 목록이 비면 영역을 그리지 않는다', async () => {
    serveInspection(inspectionWire({ violations: [] }))
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('AI가 확인이 필요한 표현을 찾아 반려했어요')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-093] 걸린 표현과 제안의 HTML과 주소를 글자 그대로 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        violations: [
          { category: 'SPAM', quote: '<img src=x onerror=alert(1)>', suggestion: 'https://example.com 으로 오세요' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const item = (await screen.findByText('<img src=x onerror=alert(1)>')).closest('li') as HTMLElement
    expect(within(item).queryByRole('img')).not.toBeInTheDocument()
    expect(within(item).getByText('https://example.com 으로 오세요')).toBeInTheDocument()
    expect(within(item).queryByRole('link')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-094] 모르는 분류는 기타로 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        violations: [
          { category: 'BRAND_NEW_CATEGORY', quote: '새 분류 표현', suggestion: null },
          { category: 'constructor', quote: '객체 내장 키 표현', suggestion: null },
          { category: 'IRRELEVANT', quote: '상품과 무관한 표현', suggestion: null },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const unknown = (await screen.findByText('새 분류 표현')).closest('li') as HTMLElement
    expect(within(unknown).getByText('기타')).toBeInTheDocument()
    expect(within(violationItem('객체 내장 키 표현')).getByText('기타')).toBeInTheDocument()
    expect(within(violationItem('상품과 무관한 표현')).getByText('기타')).toBeInTheDocument()
  })

  it('[AC-SPRD-095] 판정 실패 뒤에는 목록을 숨긴다', async () => {
    serveInspection(
      inspectionWire({
        judgment: 'FAILED',
        violations: [{ category: 'MEDICAL_CLAIM', quote: '이미 고친 문구', suggestion: '제안' }],
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('반려된 상품이에요')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
    expect(screen.queryByText('이미 고친 문구')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-096] 응답에 violations가 없어도 사유를 보여 주고 목록 영역은 그리지 않는다', async () => {
    serveInspection(inspectionWire({ violations: undefined as unknown as SellerProductInspection['violations'] }))
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('치료 효능 표현을 고쳐 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-097] 통과 판정에 규칙 위반이 남아 있어도 목록을 그리지 않는다', async () => {
    serveInspection(
      inspectionWire({
        inspectionStatus: 'APPROVED',
        progressStep: 'APPROVED',
        judgment: 'PASS',
        reasonCode: 'BANNED_INGREDIENT',
        reasonSummary: '코코넛오일',
        sellerNotice: null,
        violations: [{ category: 'BANNED_INGREDIENT', quote: '코코넛오일', suggestion: null }],
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('검수를 통과했어요.')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
    expect(screen.queryByText('코코넛오일')).not.toBeInTheDocument()
  })

  it.each([
    ['REQUESTED', 'QUEUED', null, 'AI가 상품 내용을 검수하고 있어요. 보통 1분 안에 끝나요.'],
    ['AI_REVIEWING', 'IN_FLIGHT', null, 'AI가 상품 내용을 검수하고 있어요. 보통 1분 안에 끝나요.'],
    ['ADMIN_REVIEWING', 'SETTLED', 'PASS', '관리자가 다시 확인하고 있어요'],
  ] as const)(
    '[AC-SPRD-098] %s 단계에서는 위반이 있어도 목록을 그리지 않는다',
    async (progressStep, processingState, judgment, guide) => {
      serveInspection(
        inspectionWire({
          progressStep,
          processingState,
          judgment,
          violations: [{ category: 'MEDICAL_CLAIM', quote: '직전 판정의 표현', suggestion: '직전 판정의 제안' }],
        }),
      )
      renderAt('/products')

      await openDrawer()

      expect(await screen.findByText(guide)).toBeInTheDocument()
      expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
      expect(screen.queryByText('직전 판정의 표현')).not.toBeInTheDocument()
    },
  )

  it('[AC-SPRD-099] 관리자가 반려했고 판정이 FLAG이면 관리자 사유와 함께 목록을 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        rejectReason: '효능 표현을 빼고 다시 등록해 주세요.',
        violations: [
          { category: 'MEDICAL_CLAIM', quote: '슬개골 완치', suggestion: '건강 관리에 도움을 줄 수 있는' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('관리자가 반려했어요')).toBeInTheDocument()
    expect(screen.getByText('효능 표현을 빼고 다시 등록해 주세요.')).toBeInTheDocument()
    expect(screen.getByText('수정 필요 항목')).toBeInTheDocument()
    const item = violationItem('슬개골 완치')
    expect(within(item).getByText('질병 치료 효능')).toBeInTheDocument()
    expect(within(item).getByText('수정 제안').nextElementSibling).toHaveTextContent('건강 관리에 도움을 줄 수 있는')
  })

  it('[AC-SPRD-100] 이의 접수 응답이 관리자 확인 단계로 캐시를 덮으면 제기 이력을 보여 주고 목록을 그리지 않는다', async () => {
    const violations = [{ category: 'MEDICAL_CLAIM', quote: '슬개골 완치', suggestion: '건강 관리에 도움을 줄 수 있는' }]
    serveInspection(inspectionWire({ violations }))
    serveAppeal(
      inspectionWire({
        progressStep: 'ADMIN_REVIEWING',
        appealedAt: '2026-10-23T09:12:00',
        appealReason: '치료 효능이 아니라 성분 설명이에요.',
        violations,
      }),
    )
    renderAt('/products')

    const user = await openDrawer()
    expect(await screen.findByText('수정 필요 항목')).toBeInTheDocument()

    await user.type(screen.getByLabelText('이의 제기 사유'), '치료 효능이 아니라 성분 설명이에요.')
    await user.click(screen.getByRole('button', { name: '이의 제기' }))

    expect(await screen.findByText('2026.10.23 09:12에 이의를 제기했어요')).toBeInTheDocument()
    expect(screen.getByText('관리자가 다시 확인하고 있어요')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  it('[AC-SPRD-101] 이의 접수 응답에 violations가 없어도 제기 이력과 사유를 보여 주고 목록 영역은 그리지 않는다', async () => {
    serveInspection(
      inspectionWire({
        violations: [{ category: 'MEDICAL_CLAIM', quote: '슬개골 완치', suggestion: '건강 관리에 도움을 줄 수 있는' }],
      }),
    )
    serveAppeal(
      inspectionWire({
        appealedAt: '2026-10-23T09:12:00',
        appealReason: '치료 효능이 아니라 성분 설명이에요.',
        violations: undefined as unknown as SellerProductInspection['violations'],
      }),
    )
    renderAt('/products')

    const user = await openDrawer()
    expect(await screen.findByText('수정 필요 항목')).toBeInTheDocument()

    await user.type(screen.getByLabelText('이의 제기 사유'), '치료 효능이 아니라 성분 설명이에요.')
    await user.click(screen.getByRole('button', { name: '이의 제기' }))

    expect(await screen.findByText('2026.10.23 09:12에 이의를 제기했어요')).toBeInTheDocument()
    expect(screen.getByText('치료 효능 표현을 고쳐 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  // ─── 검수 단계 (SCRUM-378) ────────────────────────────────────────────────
  // 서버가 RULE·TRIAGE·MODEL 세 줄을 늘 그 순서로 준다 — 화면은 단계 수를 세지 않고 받은 만큼
  // 그린다. 통과와 미검사를 섞지 않는 것이 이 표의 요점이라 라벨도 셋이 다 갈려 있어야 한다.

  const STAGES: InspectionStage[] = [
    { stage: 'RULE', outcome: 'CLEAR', detail: null },
    { stage: 'TRIAGE', outcome: 'VIOLATION', detail: null },
    { stage: 'MODEL', outcome: 'UNCHECKED', detail: '1차 선별이 위반을 확정했어요' },
  ]

  /** 단계 목록만 집는다 — 위반 목록도 `listitem`이라 Drawer 전체에서 세면 섞인다. */
  async function stageRows() {
    const heading = await screen.findByText('검수 단계')
    return within(heading.nextElementSibling as HTMLElement).getAllByRole('listitem')
  }

  it('[AC-SPRD-102] 단계마다 이름과 결과를 한 줄로 보여 주고 와이어 값은 글자로 새지 않는다', async () => {
    serveInspection(inspectionWire({ stages: STAGES }))
    renderAt('/products')

    await openDrawer()

    const rows = await stageRows()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('자동 규칙 검사')
    expect(rows[0]).toHaveTextContent('통과')
    expect(rows[1]).toHaveTextContent('1차 선별')
    expect(rows[1]).toHaveTextContent('걸렸어요')
    expect(rows[2]).toHaveTextContent('상세 검수')
    expect(rows[2]).toHaveTextContent('안 돌았어요')
    for (const wire of ['RULE', 'TRIAGE', 'MODEL', 'CLEAR', 'VIOLATION', 'UNCHECKED']) {
      expect(screen.queryByText(wire), `와이어 값 ${wire}`).not.toBeInTheDocument()
    }
  })

  it('[AC-SPRD-103] 돌지 않은 단계에만 사유를 붙이고 걸림·통과에 실린 값은 버린다', async () => {
    // 계약은 "VIOLATION·CLEAR는 detail=null"이지만 믿기만 하면, 서버가 걸린 단계에 내부 값을 다는
    // 순간 그것이 셀러 화면에 뜬다 -- 매퍼에서 접어 막는다.
    serveInspection(
      inspectionWire({
        stages: [
          { stage: 'RULE', outcome: 'CLEAR', detail: 'perspective=ALL' },
          { stage: 'TRIAGE', outcome: 'VIOLATION', detail: 'RATE_LIMITED' },
          { stage: 'MODEL', outcome: 'UNCHECKED', detail: '1차 선별이 위반을 확정했어요' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const rows = await stageRows()
    expect(within(rows[2] as HTMLElement).getByText('1차 선별이 위반을 확정했어요')).toBeInTheDocument()
    expect(rows[0]).toHaveTextContent('자동 규칙 검사통과')
    expect(rows[1]).toHaveTextContent('1차 선별걸렸어요')
    expect(screen.queryByText('perspective=ALL')).not.toBeInTheDocument()
    expect(screen.queryByText('RATE_LIMITED')).not.toBeInTheDocument()
  })

  // 사유 문장은 서버가 번역해 보낸다 -- 판정이 끝났으면 "돌지 않았어요", 아직 돌고 있으면 "아직
  // 닿지 않았어요"다(끝난 판정에 "아직"을 쓰면 셀러는 기다리면 된다고 읽는다). skipReason에서 온
  // 문장도 같은 자리로 온다. FE에 번역표를 두면 두 벌이 어긋나므로 받은 문장을 그대로 그린다.

  it('[AC-SPRD-118] 판정이 끝난 응답의 "돌지 않았어요"를 그대로 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        stages: [
          { stage: 'RULE', outcome: 'CLEAR', detail: null },
          { stage: 'TRIAGE', outcome: 'UNCHECKED', detail: '이 단계는 돌지 않았어요' },
          { stage: 'MODEL', outcome: 'UNCHECKED', detail: '요청이 몰려 잠시 뒤 다시 봐요' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const rows = await stageRows()
    expect(within(rows[1] as HTMLElement).getByText('이 단계는 돌지 않았어요')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('요청이 몰려 잠시 뒤 다시 봐요')).toBeInTheDocument()
  })

  it('[AC-SPRD-119] 아직 돌고 있는 응답의 "아직 닿지 않았어요"도 그대로 보여 준다', async () => {
    serveInspection(
      inspectionWire({
        inspectionStatus: 'PENDING',
        progressStep: 'AI_REVIEWING',
        processingState: 'IN_FLIGHT',
        judgment: null,
        reasonCode: null,
        reasonSummary: null,
        sellerNotice: null,
        settledAt: null,
        stages: [
          { stage: 'RULE', outcome: 'CLEAR', detail: null },
          { stage: 'TRIAGE', outcome: 'UNCHECKED', detail: '아직 이 단계에 닿지 않았어요' },
          { stage: 'MODEL', outcome: 'UNCHECKED', detail: '모델이 판단을 거부했어요' },
        ],
      }),
    )
    renderAt('/products')

    await openDrawer()

    const rows = await stageRows()
    expect(within(rows[1] as HTMLElement).getByText('아직 이 단계에 닿지 않았어요')).toBeInTheDocument()
    expect(within(rows[2] as HTMLElement).getByText('모델이 판단을 거부했어요')).toBeInTheDocument()
  })

  it('[AC-SPRD-104] 단계가 오지 않는 응답에서는 영역째 접는다', async () => {
    // 이 필드가 없는 BE 배포를 FE가 먼저 만나면 빈 표가 아니라 아무것도 없어야 한다.
    serveInspection(inspectionWire({}))
    renderAt('/products')

    await openDrawer()

    expect(await screen.findByText('AI가 확인이 필요한 표현을 찾아 반려했어요')).toBeInTheDocument()
    expect(screen.queryByText('검수 단계')).not.toBeInTheDocument()
  })
})

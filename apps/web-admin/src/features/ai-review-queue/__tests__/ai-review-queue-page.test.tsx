import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import { API_PATH_PREFIX, type AdminProductInspectionDetail, type AdminProductInspectionSummary } from '@aechak/api'
import { ADMIN_ORIGIN, server } from '@/testing/msw/server'
import { AiReviewQueuePage } from '../components/AiReviewQueuePage'

// 운영 진입 스위치가 꺼져 있어 라우트가 아니라 페이지를 직접 그린다. 요청은 MSW가 admin 호스트에서 받는다.
const QUEUE_URL = `${ADMIN_ORIGIN}${API_PATH_PREFIX}/admin/product-inspections`
const PRODUCT_ID = '01JQUEUEPRODUCT00000000001'

const SUMMARY: AdminProductInspectionSummary = {
  productId: PRODUCT_ID,
  productName: '연어 건사료 2kg',
  sellerName: '애착상회',
  status: 'PENDING_REVIEW',
  latestJudgment: 'FLAG',
  blindedAt: '2026-10-22T10:00:40',
}

function detailWire(overrides: Partial<AdminProductInspectionDetail> = {}): AdminProductInspectionDetail {
  return {
    productId: PRODUCT_ID,
    productName: '연어 건사료 2kg',
    sellerName: '애착상회',
    categoryNames: ['강아지', '사료', '건사료'],
    description: '관절염 치료에 효과가 있습니다.',
    representativeImageUrl: null,
    optionNames: ['맛', '연어'],
    inspectionStatus: 'PENDING',
    awaitingAdminReview: true,
    processingState: 'SETTLED',
    judgment: 'FLAG',
    reasonCode: 'MEDICAL_CLAIM',
    reasonSummary: '관절염 치료에 효과',
    sellerNotice: '치료 효능 표현을 고쳐 주세요.',
    requestedAt: '2026-10-22T10:00:00',
    settledAt: '2026-10-22T10:00:40',
    rejections: [],
    violations: [],
    ...overrides,
  }
}

let lastListQuery: string | null = null
let lastRejectBody: unknown = null

function serveQueue(detail: AdminProductInspectionDetail = detailWire()) {
  server.use(
    http.get(QUEUE_URL, ({ request }) => {
      lastListQuery = new URL(request.url).search
      return HttpResponse.json({ data: { items: [SUMMARY], totalCount: 1 } })
    }),
    http.get(`${QUEUE_URL}/:productId`, () => HttpResponse.json({ data: detail })),
    http.post(`${QUEUE_URL}/:productId/approve`, () => new HttpResponse(null, { status: 204 })),
    http.post(`${QUEUE_URL}/:productId/reject`, async ({ request }) => {
      lastRejectBody = await request.json()
      return new HttpResponse(null, { status: 204 })
    }),
  )
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AiReviewQueuePage />
    </QueryClientProvider>,
  )
}

async function openDetail() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '연어 건사료 2kg' }))
  await screen.findByText('관절염 치료에 효과')
  return user
}

async function confirmIn(user: ReturnType<typeof userEvent.setup>, heading: string, label: string) {
  const modal = (await screen.findByRole('heading', { name: heading })).closest('[role="dialog"]') as HTMLElement
  await user.click(within(modal).getByRole('button', { name: label }))
}

describe('AI 검수 큐 (SCRUM-283)', () => {
  beforeEach(() => {
    lastListQuery = null
    lastRejectBody = null
  })

  it('[AC-AI-QUEUE-010] 검토 대기 목록을 최근 판정과 함께 보여 주고 상태 필터를 서버 파라미터로 보낸다', async () => {
    serveQueue()
    renderPage()

    const row = (await screen.findByRole('button', { name: '연어 건사료 2kg' })).closest('tr') as HTMLElement
    expect(within(row).getByText('애착상회')).toBeInTheDocument()
    expect(within(row).getByText('문제 발견')).toBeInTheDocument()
    expect(within(row).getByText('검토 대기')).toBeInTheDocument()
    expect(lastListQuery).toContain('status=PENDING_REVIEW')
  })

  it('[AC-AI-QUEUE-011] 반려하면 적은 사유를 그대로 보내고 완료 안내를 띄운다', async () => {
    serveQueue()
    renderPage()
    const user = await openDetail()

    await user.click(screen.getByText('반려 확정 / 셀러에게 사유 전달'))
    expect(screen.getByRole('button', { name: '제출' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('셀러가 무엇을 고쳐야 하는지 적어 주세요.'), '효능 표현을 빼 주세요.')
    await user.click(screen.getByRole('button', { name: '제출' }))
    await confirmIn(user, '상품을 반려할까요?', '반려')

    expect(await screen.findByText('상품을 반려했어요.')).toBeInTheDocument()
    expect(lastRejectBody).toEqual({ reason: '효능 표현을 빼 주세요.' })
  })

  it('[AC-AI-QUEUE-012] 승인이 409면 이미 처리된 상품이라고 알리고 상세를 닫는다', async () => {
    serveQueue()
    server.use(
      http.post(`${QUEUE_URL}/:productId/approve`, () =>
        HttpResponse.json({ errorCode: 40500, message: '관리자 확인을 기다리는 상품 검수가 없습니다.' }, { status: 409 }),
      ),
    )
    renderPage()
    const user = await openDetail()

    await user.click(screen.getByRole('button', { name: '제출' }))
    await confirmIn(user, '상품을 승인할까요?', '승인')

    expect(await screen.findByText(/이미 처리된 상품이에요/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('관절염 치료에 효과')).not.toBeInTheDocument())
  })

  it('[AC-AI-QUEUE-013] 열린 검토가 없는 상품은 결정 없이 반려 이력만 보여 준다', async () => {
    serveQueue(
      detailWire({
        awaitingAdminReview: false,
        inspectionStatus: 'REJECTED',
        rejections: [{ reason: '효능 표현을 빼 주세요.', rejectedAt: '2026-10-21T09:00:00' }],
      }),
    )
    renderPage()
    await openDetail()

    expect(screen.getByText('효능 표현을 빼 주세요.')).toBeInTheDocument()
    expect(screen.getByText('처리할 검토가 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
  })

  // ─── 이의제기 재검토 (SCRUM-287) ──────────────────────────────────────────
  // 셀러가 반려에 이의를 제기하면 운영자가 그것만 걸러 다시 본다. 필터가 서버로 나가지 않으면
  // 목록은 그대로인데 운영자는 좁혀졌다고 믿는다(동작 안 하는 필터).

  it('[AC-AI-QUEUE-014] 이의제기된 것만 보기를 켜면 appealed=true로 나가고, 끄면 파라미터를 보내지 않는다', async () => {
    serveQueue()
    renderPage()
    await screen.findByRole('button', { name: '연어 건사료 2kg' })
    // 끈 상태에서는 보내지 않는다 — false의 뜻을 확인하지 못해 전체 조회가 줄어들 위험이 있다.
    expect(lastListQuery).not.toContain('appealed')

    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: '이의제기된 것만 보기' }))

    await waitFor(() => expect(lastListQuery).toContain('appealed=true'))
  })

  it('[AC-AI-QUEUE-015] 이의가 제기된 행은 목록에서 구별되고 상세가 셀러 이의 사유를 보여 준다', async () => {
    server.use(
      http.get(QUEUE_URL, () =>
        HttpResponse.json({
          data: { items: [{ ...SUMMARY, appealedAt: '2026-10-23T09:12:00' }], totalCount: 1 },
        }),
      ),
      http.get(`${QUEUE_URL}/:productId`, () =>
        HttpResponse.json({
          data: detailWire({
            appealedAt: '2026-10-23T09:12:00',
            appealReason: '치료 효능이 아니라 성분 설명이에요.',
          }),
        }),
      ),
    )
    renderPage()

    const row = (await screen.findByRole('button', { name: '연어 건사료 2kg' })).closest('tr') as HTMLElement
    expect(within(row).getByText('이의 제기')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '연어 건사료 2kg' }))

    expect(await screen.findByText('셀러가 이의를 제기했어요')).toBeInTheDocument()
    expect(screen.getByText('치료 효능이 아니라 성분 설명이에요.')).toBeInTheDocument()
    expect(screen.getByText('2026-10-23 09:12')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-016] 이의가 없는 행에는 제기 표시를 그리지 않는다', async () => {
    serveQueue()
    renderPage()

    const row = (await screen.findByRole('button', { name: '연어 건사료 2kg' })).closest('tr') as HTMLElement
    expect(within(row).queryByText('이의 제기')).not.toBeInTheDocument()

    await openDetail()
    expect(screen.queryByText('셀러가 이의를 제기했어요')).not.toBeInTheDocument()
  })

  // ─── 수정 필요 항목 ───────────────────────────────────────────────────────

  const violationItem = (text: string) => screen.getByText(text).closest('li') as HTMLElement

  it('[AC-AI-QUEUE-017] 판정 요약 안의 안내와 요약 칸 사이에 위반마다 분류 이름과 걸린 표현과 수정 제안을 보여 준다', async () => {
    serveQueue(
      detailWire({
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
    renderPage()
    await openDetail()

    const title = screen.getByText('수정 필요 항목')
    const notice = screen.getByText('치료 효능 표현을 고쳐 주세요.')
    const summary = screen.getByText('판정 시각', { selector: 'dt' })
    expect(notice.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING, '안내 아래에 둔다').toBeTruthy()
    expect(title.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING, '요약 칸 위에 둔다').toBeTruthy()

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

  it('[AC-AI-QUEUE-018] 제안이나 걸린 표현이 null이면 그 줄을 그리지 않는다', async () => {
    serveQueue(
      detailWire({
        violations: [
          { category: 'CONTACT_INFO', quote: '010-1234-5678', suggestion: null },
          { category: 'BANNED_INGREDIENT', quote: null, suggestion: '다른 성분으로 바꿔 주세요' },
        ],
      }),
    )
    renderPage()
    await openDetail()

    const ruleViolation = violationItem('연락처 노출')
    expect(within(ruleViolation).getByText('010-1234-5678')).toBeInTheDocument()
    expect(within(ruleViolation).queryByText('수정 제안')).not.toBeInTheDocument()

    const noQuote = violationItem('금지 성분')
    expect(within(noQuote).getByText('다른 성분으로 바꿔 주세요')).toBeInTheDocument()
    expect(within(noQuote).queryByText('걸린 표현')).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-019] 목록이 비면 영역을 그리지 않는다', async () => {
    serveQueue(detailWire({ violations: [] }))
    renderPage()
    await openDetail()

    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-020] 걸린 표현과 제안의 HTML과 주소를 글자 그대로 보여 준다', async () => {
    serveQueue(
      detailWire({
        violations: [
          { category: 'SPAM', quote: '<img src=x onerror=alert(1)>', suggestion: 'https://example.com 으로 오세요' },
        ],
      }),
    )
    renderPage()
    await openDetail()

    const item = violationItem('<img src=x onerror=alert(1)>')
    expect(within(item).queryByRole('img')).not.toBeInTheDocument()
    expect(within(item).getByText('https://example.com 으로 오세요')).toBeInTheDocument()
    expect(within(item).queryByRole('link')).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-021] 모르는 분류는 기타로 보여 준다', async () => {
    serveQueue(
      detailWire({
        violations: [
          { category: 'BRAND_NEW_CATEGORY', quote: '새 분류 표현', suggestion: null },
          { category: 'constructor', quote: '객체 내장 키 표현', suggestion: null },
          { category: 'IRRELEVANT', quote: '상품과 무관한 표현', suggestion: null },
        ],
      }),
    )
    renderPage()
    await openDetail()

    expect(within(violationItem('새 분류 표현')).getByText('기타')).toBeInTheDocument()
    expect(within(violationItem('객체 내장 키 표현')).getByText('기타')).toBeInTheDocument()
    expect(within(violationItem('상품과 무관한 표현')).getByText('기타')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-022] 판정 실패여도 목록이 있으면 보여 준다', async () => {
    serveQueue(
      detailWire({
        judgment: 'FAILED',
        violations: [{ category: 'MEDICAL_CLAIM', quote: '직전 판정의 표현', suggestion: '직전 판정의 제안' }],
      }),
    )
    renderPage()
    await openDetail()

    expect(screen.getByText('수정 필요 항목')).toBeInTheDocument()
    expect(within(violationItem('직전 판정의 표현')).getByText('직전 판정의 제안')).toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-023] 응답에 violations가 없어도 사유를 보여 주고 목록 영역은 그리지 않는다', async () => {
    serveQueue(detailWire({ violations: undefined as unknown as AdminProductInspectionDetail['violations'] }))
    renderPage()
    await openDetail()

    expect(screen.getByText('치료 효능 표현을 고쳐 주세요.')).toBeInTheDocument()
    expect(screen.queryByText('수정 필요 항목')).not.toBeInTheDocument()
  })

  it('[AC-AI-QUEUE-024] 통과 판정이어도 목록이 있으면 보여 준다', async () => {
    serveQueue(
      detailWire({
        judgment: 'PASS',
        violations: [{ category: 'BANNED_INGREDIENT', quote: '코코넛오일', suggestion: null }],
      }),
    )
    renderPage()
    await openDetail()

    expect(screen.getByText('수정 필요 항목')).toBeInTheDocument()
    const item = violationItem('코코넛오일')
    expect(within(item).getByText('금지 성분')).toBeInTheDocument()
    expect(within(item).queryByText('수정 제안')).not.toBeInTheDocument()
  })
})

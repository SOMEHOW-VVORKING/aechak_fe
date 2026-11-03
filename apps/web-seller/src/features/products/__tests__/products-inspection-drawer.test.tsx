import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import type { SellerProductInspection } from '@aechak/api'
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
})

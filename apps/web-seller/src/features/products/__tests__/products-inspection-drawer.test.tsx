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

async function openDrawer() {
  const user = userEvent.setup()
  const row = (await screen.findByText(PRODUCT.name)).closest('tr') as HTMLElement
  await user.click(within(row).getByRole('button', { name: `${PRODUCT.name} 검수 진행 보기` }))
  return user
}

describe('/products 검수 진행 Drawer (SCRUM-283)', () => {
  beforeEach(() => {
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
})

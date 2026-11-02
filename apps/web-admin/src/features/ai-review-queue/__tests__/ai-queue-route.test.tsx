import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, it, expect } from 'vitest'
import type { AdminProductInspectionSummary } from '@aechak/api'
import { routeTree } from '../../../routeTree.gen'
import { ADMIN_PRODUCT_INSPECTIONS_URL, seedAdminApplications, server } from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const SUMMARY: AdminProductInspectionSummary = {
  productId: '01JQUEUEPRODUCT00000000001',
  productName: '연어 건사료 2kg',
  sellerName: '애착상회',
  status: 'PENDING_REVIEW',
  latestJudgment: 'FLAG',
  blindedAt: '2026-10-22T10:00:40',
}

// 라우트가 실서버 화면(AiReviewQueuePage)을 직접 그린다. 화면 동작은 ai-review-queue-page.test.tsx가 본다.
describe('/products/ai-queue', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
    server.use(
      http.get(ADMIN_PRODUCT_INSPECTIONS_URL, () =>
        HttpResponse.json({ data: { items: [SUMMARY], totalCount: 1 } }),
      ),
    )
  })

  it('[AC-AI-QUEUE-003] 직접 진입하면 서버 큐 목록이 열리고 예시 데이터 띠가 없다', async () => {
    renderAt('/products/ai-queue')

    expect(await screen.findByRole('heading', { name: 'AI 검수 큐' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '연어 건사료 2kg' })).toBeInTheDocument()
    expect(screen.queryByText('예시 데이터예요')).not.toBeInTheDocument()
  })
})

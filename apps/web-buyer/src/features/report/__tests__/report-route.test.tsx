import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { REAL_PRODUCT_ID } from '@/testing/msw/server'

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

describe('상품 신고 라우트', () => {
  it('[AC-REPORT-005] 실 상품(ULID)은 목업에 없어도 실 API로 대상을 해석해 신고 폼을 렌더한다', async () => {
    // 상세를 거치지 않고 신고 URL로 직접 진입/새로고침해도, 실 상품 API로 대상을 조회해
    // not-found가 아니라 정상 신고 폼이 뜬다(예전엔 목업 조회만 해서 실 상품이 not-found였다).
    renderAt(`/products/${REAL_PRODUCT_ID}/report`)
    expect(await screen.findByText('리얼 프리미엄 자동 급식기')).toBeInTheDocument()
    expect(screen.getByText('상품 신고 사유를 선택해 주세요')).toBeInTheDocument()
    expect(screen.queryByText('상품을 찾을 수 없어요')).not.toBeInTheDocument()
  })

  it('[AC-REPORT-006] 목업/실 상품 어디에도 없는 id는 not-found를 렌더한다', async () => {
    // 실 API 404 → 레지스트리에도 없음 → 진짜 미존재라 not-found.
    renderAt('/products/01JNONEXISTENT00000000000/report')
    expect(await screen.findByText('상품을 찾을 수 없어요')).toBeInTheDocument()
  })

  it('[AC-REPORT-007] 목업 카탈로그 상품은 실 API 없이 신고 폼을 렌더한다', async () => {
    // 목업 진입점(홈/검색/찜)에서 온 p-* 상품은 findMockProduct로 단락돼 네트워크 없이 목업으로 뜬다.
    renderAt('/products/p-feeder-5l/report')
    expect(await screen.findByText('상품 신고 사유를 선택해 주세요')).toBeInTheDocument()
  })
})

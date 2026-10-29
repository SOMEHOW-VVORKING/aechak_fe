import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { routeTree } from '../../../routeTree.gen'

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

// admin 모듈에 상품 검수 API가 없다(검수 BE는 열린 PR 스택에 있다). 2026-10-18에는 진입을
// 막았는데 운영자가 기능의 모양조차 볼 수 없어 되돌렸다(SCRUM-308).
describe('/products/review', () => {
  it('[AC-PRODUCT-REVIEW-003] 직접 진입하면 예시 검수 목록과 블라인드 상태가 보인다', async () => {
    renderAt('/products/review')

    expect(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    // 자동/수동 블라인드 구별이 빠지면 AI가 건 것을 운영자가 건 것으로 읽는다.
    expect(screen.getByText('자동 블라인드')).toBeInTheDocument()
  })

  it('[AC-PRODUCT-REVIEW-004] 행을 누르면 검수 결정 버튼 셋이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/products/review')

    await user.click(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' }))

    expect(await screen.findByRole('dialog', { name: '상품 검수 상세' })).toBeInTheDocument()
    for (const action of ['검수 통과', '블라인드 유지', '판매 중지']) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument()
    }
  })
})

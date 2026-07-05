import { render, screen, within } from '@testing-library/react'
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
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// AC-PRODUCT-REVIEW-001: 신고 요약이 있는 상품은 드로어에 위험 경고가 표시된다
describe('/products/review', () => {
  it('[AC-PRODUCT-REVIEW-001] shows the report alert for a reported product', async () => {
    const user = userEvent.setup()
    renderAt('/products/review')

    await user.click(await screen.findByRole('button', { name: '동결건조 닭가슴살 100g' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('신고 3건')
  })

  // AC-PRODUCT-REVIEW-002: 판매 중지를 확정하면 상품의 판매 상태가 판매 중지로 바뀐다
  it('[AC-PRODUCT-REVIEW-002] stops the sale after confirming the modal', async () => {
    const user = userEvent.setup()
    renderAt('/products/review')

    await user.click(await screen.findByRole('button', { name: '고양이 모래 7L' }))
    await user.click(screen.getByRole('button', { name: '판매 중지' }))

    const modalHeading = await screen.findByRole('heading', { name: '상품을 판매 중지할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '판매 중지' }))

    expect(await screen.findByText("'고양이 모래 7L' 판매를 중지했어요.")).toBeInTheDocument()
  })
})

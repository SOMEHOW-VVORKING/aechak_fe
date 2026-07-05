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

// AC-SELLER-MGMT-001: 판매정지 사유/기간을 고르지 않으면 판매정지 버튼이 비활성화된다
describe('/sellers', () => {
  it('[AC-SELLER-MGMT-001] disables the suspend button until a reason and period are chosen', async () => {
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '냥이상점' }))

    expect(screen.getByRole('button', { name: '판매정지' })).toBeDisabled()
  })

  // AC-SELLER-MGMT-002: 판매정지 확인 모달에서 확정하면 셀러의 영업 상태가 판매정지로 바뀐다
  it('[AC-SELLER-MGMT-002] suspends the seller after confirming the modal', async () => {
    const user = userEvent.setup()
    renderAt('/sellers')

    await user.click(await screen.findByRole('button', { name: '냥이상점' }))

    const drawer = (await screen.findByRole('heading', { name: '셀러 상세' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    const selects = within(drawer).getAllByRole('combobox')
    await user.selectOptions(selects[0]!, '상품 정보 허위 기재')
    await user.selectOptions(selects[1]!, '7일 정지')

    await user.click(within(drawer).getByRole('button', { name: '판매정지' }))

    const modalHeading = await screen.findByRole('heading', { name: "'냥이상점'을 판매정지할까요?" })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '판매정지' }))

    expect(await screen.findByText("'냥이상점'을 판매정지했어요.")).toBeInTheDocument()
  })
})

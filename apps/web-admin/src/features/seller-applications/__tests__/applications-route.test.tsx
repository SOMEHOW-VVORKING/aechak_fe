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

// AC-SELLER-APP-001: 입점 신청 목록에서 신청자를 선택하면 상세 드로어가 열린다
describe('/sellers/applications', () => {
  it('[AC-SELLER-APP-001] opens the detail drawer with applicant info when a row is selected', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '펫프렌즈상사' }))

    expect(await screen.findByRole('heading', { name: '입점 신청 상세' })).toBeInTheDocument()
    expect(screen.getByText('사업자번호', { selector: 'dt' })).toBeInTheDocument()
  })

  // AC-SELLER-APP-002: 제출 후 확인 모달에서 승인을 확정하면 해당 신청의 심사 상태가 승인으로 즉시 반영된다
  it('[AC-SELLER-APP-002] approves an application and reflects the new status in the table', async () => {
    const user = userEvent.setup()
    renderAt('/sellers/applications')

    await user.click(await screen.findByRole('button', { name: '해피독몰' }))
    await user.click(screen.getByRole('button', { name: '제출' }))

    const modalHeading = await screen.findByRole('heading', { name: '입점을 승인할까요?' })
    const modal = modalHeading.closest('[role="dialog"]') as HTMLElement
    await user.click(within(modal).getByRole('button', { name: '승인' }))

    expect(await screen.findByText('입점을 승인했어요.')).toBeInTheDocument()
    const row = screen.getByRole('button', { name: '해피독몰' }).closest('tr')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('승인')
  })
})

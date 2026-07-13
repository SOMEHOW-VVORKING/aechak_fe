import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { resetAccount, verifyPhone } from '@/shared/account'
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

describe('/mypage/verify', () => {
  beforeEach(() => {
    resetAccount()
  })

  it('[AC-VERIFY-001] 인증번호 안내에 테스트 코드(000000)를 노출하지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/mypage/verify')

    // 인증번호 받기 → 인증번호 입력이 나타난 뒤에도 테스트 코드 힌트가 없다.
    await user.click(await screen.findByRole('button', { name: '인증번호 받기' }))
    expect(await screen.findByPlaceholderText('6자리 숫자')).toBeInTheDocument()
    expect(screen.queryByText(/테스트 인증번호/)).not.toBeInTheDocument()
    expect(screen.queryByText(/000000/)).not.toBeInTheDocument()
  })

  it('[AC-VERIFY-002] 인증 완료(9-B)에서 인증 상태/번호/일시 상세 행을 노출하지 않는다', async () => {
    verifyPhone('010-1234-5678')
    renderAt('/mypage/verify')

    // 완료 표현(제목)은 유지하되 3개 상세 행은 걷어낸다.
    expect(await screen.findByText('본인 인증 완료')).toBeInTheDocument()
    expect(screen.queryByText('인증 상태')).not.toBeInTheDocument()
    expect(screen.queryByText('인증 번호')).not.toBeInTheDocument()
    expect(screen.queryByText('인증 일시')).not.toBeInTheDocument()
  })
})

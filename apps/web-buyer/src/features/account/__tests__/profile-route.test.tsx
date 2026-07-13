import { render, screen } from '@testing-library/react'
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

describe('/mypage/profile 휴대폰 필드 인증 배지', () => {
  beforeEach(() => {
    resetAccount()
  })

  it('[AC-PROFILE-001] 인증 완료 시 인증됨 pill/미인증/본인 인증하기 버튼이 모두 없다', async () => {
    verifyPhone('010-1234-5678')
    renderAt('/mypage/profile')

    // 마스킹 번호는 그대로 보이되 중복 인증 배지는 제거됐다.
    expect(await screen.findByText('010-1234-****')).toBeInTheDocument()
    expect(screen.queryByText('인증됨')).not.toBeInTheDocument()
    expect(screen.queryByText('미인증')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '본인 인증하기' })).not.toBeInTheDocument()
  })

  it('[AC-PROFILE-002] 미인증이면 미인증 pill과 본인 인증하기 버튼이 유지된다', async () => {
    renderAt('/mypage/profile')

    expect(await screen.findByText('미인증')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '본인 인증하기' })).toBeInTheDocument()
    expect(screen.queryByText('인증됨')).not.toBeInTheDocument()
  })
})

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
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

// AC-ONBOARD-003: 필수 약관을 모두 체크하기 전에는 다음 버튼이 비활성이다
describe('/onboarding/terms', () => {
  it('[AC-ONBOARD-003] 필수 약관을 모두 체크해야만 다음 버튼이 활성화된다(선택 약관은 무관)', async () => {
    const user = userEvent.setup()
    renderAt('/onboarding/terms')

    const next = await screen.findByRole('button', { name: '다음' })
    expect(next).toBeDisabled()

    // 필수 4개 중 3개만 체크 → 여전히 비활성
    await user.click(screen.getByRole('button', { name: /만 14세 이상이에요/ }))
    await user.click(screen.getByRole('button', { name: /서비스 이용약관/ }))
    await user.click(screen.getByRole('button', { name: /개인정보 처리방침/ }))
    expect(next).toBeDisabled()

    // 마지막 필수(위치기반)까지 체크 → 활성. 선택(마케팅)은 안 해도 된다.
    await user.click(screen.getByRole('button', { name: /위치기반 서비스 약관/ }))
    expect(next).toBeEnabled()
  })

  it('[AC-ONBOARD-003] 전체 동의로 필수를 모두 채우면 다음을 눌러 닉네임 단계로 넘어간다', async () => {
    const user = userEvent.setup()
    renderAt('/onboarding/terms')

    await user.click(await screen.findByRole('button', { name: '전체 동의' }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByRole('heading', { name: '닉네임을 정해 주세요' })).toBeInTheDocument()
  })
})

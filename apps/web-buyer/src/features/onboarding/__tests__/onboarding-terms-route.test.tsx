import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { HttpResponse, http } from 'msw'
import {
  DEFAULT_TERMS,
  TERMS_URL,
  currentConsents,
  seedTakenNicknames,
  seedTerms,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

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

describe('/onboarding/terms', () => {
  beforeEach(() => {
    seedTerms()
    seedTakenNicknames([])
  })

  it('[AC-ONBOARD-006] 서버가 내려준 활성 약관을 필수/선택 구분해 렌더한다', async () => {
    renderAt('/onboarding/terms')

    expect(await screen.findByText('서비스 이용약관')).toBeInTheDocument()
    expect(screen.getByText('개인정보 처리방침')).toBeInTheDocument()
    expect(screen.getByText('위치기반 서비스 약관')).toBeInTheDocument()
    expect(screen.getByText('마케팅 정보 수신 동의')).toBeInTheDocument()
    // 시드는 필수 4 + 선택 1 — 배지로 구분이 보여야 한다.
    expect(screen.getAllByText('필수')).toHaveLength(4)
    expect(screen.getAllByText('선택')).toHaveLength(1)
  })

  it('[AC-ONBOARD-007] 필수 전부 체크 후 제출하면 활성 약관 전체(마케팅=false 포함)를 보내고 닉네임 단계로 넘어간다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/onboarding/terms')

    const next = await screen.findByRole('button', { name: '다음' })
    expect(next).toBeDisabled()

    // 필수 4개만 체크(마케팅은 그대로 미체크) → 활성.
    await user.click(screen.getByRole('button', { name: /만 14세 이상이에요/ }))
    await user.click(screen.getByRole('button', { name: /서비스 이용약관/ }))
    await user.click(screen.getByRole('button', { name: /개인정보 처리방침/ }))
    expect(next).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /위치기반 서비스 약관/ }))
    expect(next).toBeEnabled()

    await user.click(next)

    expect(await screen.findByRole('heading', { name: '닉네임을 정해 주세요' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/nickname'))

    // 제출 payload: 활성 약관 전체가 실리고 마케팅(termId 5)은 isAgreed=false로 포함된다.
    const submitted = currentConsents()
    expect(submitted).toHaveLength(DEFAULT_TERMS.length)
    expect(submitted.filter(item => item.isAgreed).map(item => item.termId).sort()).toEqual([1, 2, 3, 4])
    expect(submitted.find(item => item.termId === 5)).toEqual({ termId: 5, isAgreed: false })
  })

  it('[AC-ONBOARD-008] 약관 로드 실패 시 EmptyState를 띄우고 재시도로 복구한다', async () => {
    const user = userEvent.setup()
    server.use(http.get(TERMS_URL, () => new HttpResponse(null, { status: 500 })))
    renderAt('/onboarding/terms')

    expect(await screen.findByText('약관을 불러오지 못했어요')).toBeInTheDocument()

    // 복구: 다음 요청은 정상 응답하게 하고 재시도 → 약관이 뜬다.
    server.use(http.get(TERMS_URL, () => HttpResponse.json({ data: DEFAULT_TERMS })))
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('서비스 이용약관')).toBeInTheDocument()
  })
})

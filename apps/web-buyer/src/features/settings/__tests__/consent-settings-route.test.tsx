import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import { setAccessToken } from '@aechak/api'
import { DEFAULT_TERMS, TERMS_URL, currentConsents, seedTerms, server } from '@/testing/msw/server'
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

// 설정 > 동의 관리는 GET /terms(온보딩과 같은 서버 약관)를 조회만 한다 — 동의 변경 제출은 BE가
// 온보딩 전용(ACTIVE 계정 30004)이라 토글을 두지 않는다.
describe('/settings/consents', () => {
  beforeEach(() => seedTerms())

  it('[AC-CONSENT-001] 서버 활성 약관을 필수/선택으로 나눠 보여주고 토글·제출 없이 조회만 한다', async () => {
    renderAt('/settings/consents')

    expect(await screen.findByText('서비스 이용약관')).toBeInTheDocument()
    expect(screen.getByText('만 14세 이상이에요')).toBeInTheDocument()
    expect(screen.getByText('위치기반 서비스 약관')).toBeInTheDocument()
    expect(screen.getByText('마케팅 정보 수신 동의')).toBeInTheDocument()
    // 버전·시행일은 서버 값 그대로(가짜 동의일을 만들지 않는다).
    expect(screen.getAllByText('v1.0 · 2026.01.01 시행')).toHaveLength(DEFAULT_TERMS.length)
    // 선택 항목은 변경 준비 중 안내만 — 토글(switch)이 없고 동의 제출도 나가지 않는다.
    expect(screen.getByText(/선택 항목의 동의 변경은 준비 중이에요/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(currentConsents()).toHaveLength(0)
  })

  it('[AC-CONSENT-002] 개인정보 처리방침 행만 정책 문서로 이동하고 나머지 필수 항목은 이동 불가 행이다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/settings/consents')

    await screen.findByText('서비스 이용약관')
    expect(screen.queryByRole('button', { name: /서비스 이용약관/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /개인정보 처리방침/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/privacy'))
  })

  it('[AC-CONSENT-003] 약관 로드 실패는 빈 상태로 위장하지 않고 안내 + 다시 시도로 복구한다', async () => {
    const user = userEvent.setup()
    server.use(http.get(TERMS_URL, () => new HttpResponse(null, { status: 500 })))
    renderAt('/settings/consents')

    expect(await screen.findByText('약관 정보를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByText('필수 동의 항목')).not.toBeInTheDocument()

    server.use(http.get(TERMS_URL, () => HttpResponse.json({ data: DEFAULT_TERMS })))
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('서비스 이용약관')).toBeInTheDocument()
  })

  it('[AC-CONSENT-004] 홈 버튼이 보이고 누르면 홈(/)으로 간다', async () => {
    // 홈은 회원 전용이라 비회원이면 로그인으로 돌려보낸다.
    setAccessToken('member-token')
    const user = userEvent.setup()
    const router = renderAt('/settings/consents')
    await screen.findByText('서비스 이용약관')

    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

// 설정 하위의 나머지 화면은 전용 route 테스트가 없어 홈 버튼만 여기서 함께 확인한다.
describe('설정 화면 홈 버튼', () => {
  it.each([
    ['/settings', '설정'],
    ['/settings/notifications', '알림 설정'],
    ['/settings/faq', '자주 묻는 질문'],
    ['/settings/guidelines', '커뮤니티 가이드라인'],
    ['/settings/privacy', '개인정보 처리방침'],
    ['/settings/data-deletion', '계정 및 데이터 삭제'],
  ])('[AC-SETTINGS-HOME-001] %s 의 홈 버튼이 보이고 누르면 홈(/)으로 간다', async (path, title) => {
    setAccessToken('member-token')
    const user = userEvent.setup()
    const router = renderAt(path)
    await screen.findAllByText(title)

    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})

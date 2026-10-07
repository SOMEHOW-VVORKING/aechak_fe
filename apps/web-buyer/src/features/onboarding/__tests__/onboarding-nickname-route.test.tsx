import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { HttpResponse, http } from 'msw'
import {
  NICKNAME_CHECK_URL,
  seedConsentsSubmitted,
  seedTakenNicknames,
  seedTerms,
  server,
} from '@/testing/msw/server'
import { getAccount, resetAccount } from '@/shared/account'
import { routeTree } from '../../../routeTree.gen'

function renderNicknameRoute() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/onboarding/nickname'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// 유효 닉네임 입력 → 디바운스(400ms) + 중복확인 후 '애착 시작하기'가 활성. 그 뒤 제출.
async function fillNicknameAndSubmit(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(await screen.findByLabelText(/닉네임/), value)
  const submit = screen.getByRole('button', { name: '애착 시작하기' })
  await waitFor(() => expect(submit).toBeEnabled(), { timeout: 3000 })
  await user.click(submit)
}

describe('/onboarding/nickname', () => {
  beforeEach(() => {
    seedTerms()
    seedTakenNicknames(['애착'])
    seedConsentsSubmitted(true)
    // 계정 스토어는 전역 싱글턴이라 온보딩 완료 동기화가 테스트 간 새지 않게 시드로 되돌린다.
    resetAccount()
  })
  afterEach(() => setAccessToken(null))

  // 형식 위반 3종(1자·자모·이모지)은 모두 서버 호출 없이 인라인 형식 에러로 끝나야 한다.
  // 이모지는 maxLength slice(서로게이트 쌍)와도 겹치는 입력이라 정규식 공유만 믿지 않고 함께 검증한다.
  it.each([
    ['한 글자', 'a'],
    ['자모', 'ㄱㄴ'],
    ['이모지', '😀😀'],
  ])(
    '[AC-ONBOARD-009] 형식 위반(%s)은 서버 호출 없이 인라인 형식 에러만 낸다',
    async (_label, value) => {
      const user = userEvent.setup()
      let checkCalls = 0
      server.use(
        http.get(NICKNAME_CHECK_URL, () => {
          checkCalls += 1
          return HttpResponse.json({ data: { available: true } })
        }),
      )
      renderNicknameRoute()

      await user.type(await screen.findByLabelText(/닉네임/), value)
      // 디바운스(400ms)를 넉넉히 넘겨도 중복확인 요청이 나가지 않아야 한다.
      await new Promise(resolve => setTimeout(resolve, 700))

      expect(screen.getByText('2~12자의 한글, 영문, 숫자로 입력해 주세요')).toBeInTheDocument()
      expect(checkCalls).toBe(0)
      expect(screen.getByRole('button', { name: '애착 시작하기' })).toBeDisabled()
    },
  )

  it('[AC-ONBOARD-010] 가용 닉네임을 제출하면 완료 화면이 뜨고 CTA로 홈에 들어간다', async () => {
    const user = userEvent.setup()
    // 온보딩은 로그인 직후라 access가 있다. 없으면 홈 가드가 refresh(MSW 기본 401) 후 로그인으로 보낸다.
    setAccessToken('onboarding-token')
    const router = renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')

    expect(await screen.findByRole('heading', { name: '가입 완료!' })).toBeInTheDocument()
    expect(screen.getByText(/초코집사님, 애착에 오신 걸 환영해요/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding/nickname')

    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('[AC-ONBOARD-013] 온보딩으로 확정한 닉네임이 계정 스토어(마이/리뷰 화면 소스)에 반영된다', async () => {
    const user = userEvent.setup()
    // 시드값과 다른 닉네임으로 온보딩을 완료했는데도 스토어가 시드('코코집사')에 머물면 버그다.
    expect(getAccount().nickname).toBe('코코집사')
    renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')

    expect(await screen.findByRole('heading', { name: '가입 완료!' })).toBeInTheDocument()
    await waitFor(() => expect(getAccount().nickname).toBe('초코집사'))
  })

  it('[AC-ONBOARD-011] 확인은 통과했지만 커밋 시점 중복(409/30001)이면 인라인으로 사용 중을 알린다', async () => {
    const user = userEvent.setup()
    seedTakenNicknames(['초코집사'])
    // 확인은 available로 통과(레이스) — 최종 판정은 PUT의 30001이 한다.
    server.use(http.get(NICKNAME_CHECK_URL, () => HttpResponse.json({ data: { available: true } })))
    renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')

    expect(await screen.findByText('이미 사용 중인 닉네임이에요')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '가입 완료!' })).not.toBeInTheDocument()
  })

  it('[AC-ONBOARD-012] 동의 미완 상태로 제출하면 403/30300으로 약관 화면으로 되돌아간다', async () => {
    const user = userEvent.setup()
    seedTakenNicknames([])
    seedConsentsSubmitted(false)
    const router = renderNicknameRoute()

    await fillNicknameAndSubmit(user, '초코집사')

    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding/terms'))
    expect(await screen.findByRole('heading', { name: '약관에 동의해 주세요' })).toBeInTheDocument()
  })
})

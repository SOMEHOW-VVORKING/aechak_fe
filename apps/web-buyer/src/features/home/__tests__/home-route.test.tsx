import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAccessToken, setAccessToken } from '@aechak/api'
import { resetRegistry } from '@/shared/catalog'
import { getIsLoggedIn, getSessionState, logout, resetAuth } from '@/shared/auth'
import {
  HOME_URL,
  PRODUCT_FIXTURES,
  PRODUCT_LIKE_URL,
  REAL_PRODUCT_ID,
  seedLikedProducts,
  server,
  WEB_REFRESH_URL,
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

const fixture = (id: string) => PRODUCT_FIXTURES.find(f => f.product.productId === id)!.product

function rankingSection() {
  return screen.getByRole('heading', { name: '지금 인기 있는 상품' }).closest('section')!
}

beforeEach(() => {
  resetAuth()
  resetRegistry()
  // 회원 세션(메모리 access 보유)이 기본. 세션 복원 경로는 아래 가드 테스트가 토큰을 지우고 확인한다.
  setAccessToken('member-token')
})
afterEach(() => setAccessToken(null))

// 홈 요청 수를 센다(가드가 요청 전에 막는지 확인용).
function countHomeCalls() {
  const calls = { home: 0 }
  server.use(
    http.get(HOME_URL, () => {
      calls.home += 1
      return HttpResponse.json({ data: { recommended: [], ranking: [] } })
    }),
  )
  return calls
}

describe('/ (홈 GET /home 실연동)', () => {
  it('[AC-HOME-016] 회원이면 서버 추천과 인기 랭킹을 응답 순서대로 그린다', async () => {
    renderAt('/')

    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
    // 추천 = 판매중만. 랭킹 밖(6번째) 판매중 상품도 추천에 보인다.
    expect(screen.getByRole('button', { name: '원목 캣타워 3단 대형 상세 보기' })).toBeInTheDocument()

    const ranking = within(rankingSection())
    const rows = ranking.getAllByText(/^(강아지 연어|자동 리드줄|벤토나이트|참치 츄르|스크래쳐)/)
    expect(rows.map(r => r.textContent)).toEqual([
      '강아지 연어 사료 2kg',
      '자동 리드줄 5m 대형견용',
      '벤토나이트 고양이 모래 8.5L',
      '참치 츄르 40개입',
      '스크래쳐 하우스 2종 세트',
    ])
    // 할인 중이면 할인가(discountPrice)를 표시가로 쓴다
    expect(ranking.getByText('24,000원')).toBeInTheDocument()
    // 품절(OUT_OF_STOCK)도 랭킹에 남고 품절 표기가 붙는다
    expect(ranking.getByText('품절')).toBeInTheDocument()
    expect(ranking.queryByText('원목 캣타워 3단 대형')).not.toBeInTheDocument()
  })

  it('[AC-HOME-017] 서버가 isLiked=true로 준 상품은 첫 렌더부터 하트가 채워진다', async () => {
    seedLikedProducts([fixture('p-real-1')])
    renderAt('/')

    await screen.findByText('이런 상품은 어때요?')
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(1)
  })

  it('[AC-HOME-018] 회원이 추천 하트를 누르면 POST /products/{id}/like로 서버에 찜한다', async () => {
    const user = userEvent.setup()
    const liked: string[] = []
    server.use(
      http.post(PRODUCT_LIKE_URL, ({ params }) => {
        liked.push(String(params.productId))
        return new HttpResponse(null, { status: 201 })
      }),
    )
    renderAt('/')

    const hearts = await screen.findAllByRole('button', { name: '찜하기' })
    await user.click(hearts[0]!)

    await waitFor(() => expect(liked).toEqual(['p-real-1']))
    expect(screen.getAllByRole('button', { name: '찜 해제' })).toHaveLength(1)
  })

  it('[AC-HOME-019] 두 목록이 비면 추천 섹션을 숨기고 랭킹 빈 안내를 보여준다', async () => {
    server.use(http.get(HOME_URL, () => HttpResponse.json({ data: { recommended: [], ranking: [] } })))
    renderAt('/')

    expect(await screen.findByText('아직 인기 상품이 없어요')).toBeInTheDocument()
    expect(screen.queryByText('이런 상품은 어때요?')).not.toBeInTheDocument()
  })

  it('[AC-HOME-020] 서버 오류(500)는 재시도 버튼 없이 인라인으로 안내한다', async () => {
    server.use(
      http.get(HOME_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    renderAt('/')

    expect(await screen.findByText('홈을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
    expect(screen.queryByText('지금 인기 있는 상품')).not.toBeInTheDocument()
  })

  it('[AC-HOME-021] 이용 제한 계정(403/20005)도 인라인 오류로 안내한다', async () => {
    server.use(
      http.get(HOME_URL, () =>
        HttpResponse.json({ errorCode: 20005, message: '이용이 제한된 계정입니다.' }, { status: 403 }),
      ),
    )
    renderAt('/')

    expect(await screen.findByText('홈을 불러오지 못했어요')).toBeInTheDocument()
  })

  it('[AC-HOME-022] 로그아웃 상태면 /home을 부르지 않고 로그인 화면으로 보낸다', async () => {
    const calls = countHomeCalls()
    logout()
    const router = renderAt('/')

    expect(await screen.findByRole('button', { name: '카카오 로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding/login')
    expect(calls.home).toBe(0)
  })

  it('[AC-HOME-023] access 없이 진입하고 refresh가 401이면 /home 없이 로그인 화면으로 보낸다', async () => {
    // 새로고침으로 메모리 access만 날아간 상태 — 세션 유무를 아직 모르는 첫 진입이다.
    // setAccessToken(null)은 "세션이 끝났다"는 뜻이라 refresh 확인 자체를 건너뛴다.
    resetAuth()
    const calls = countHomeCalls()
    const router = renderAt('/')

    expect(await screen.findByRole('button', { name: '카카오 로그인' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding/login')
    expect(calls.home).toBe(0)
    expect(getIsLoggedIn()).toBe(false)
  })

  it('[AC-HOME-024] access 없이 진입해도 refresh 쿠키가 살아 있으면 세션을 복원하고 홈을 보여준다', async () => {
    resetAuth()
    let refreshCalls = 0
    server.use(
      http.post(WEB_REFRESH_URL, () => {
        refreshCalls += 1
        return HttpResponse.json({ data: { accessToken: 'restored', tokenType: 'Bearer', expiresIn: 1800 } })
      }),
    )
    const router = renderAt('/')

    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(refreshCalls).toBe(1)
    expect(getAccessToken()).toBe('restored')
  })

  it('[AC-HOME-025] refresh가 네트워크/서버 오류면 로그인으로 보내지 않고 화면에 맡긴다', async () => {
    resetAuth()
    server.use(
      http.post(WEB_REFRESH_URL, () =>
        HttpResponse.json({ errorCode: 90000, message: 'server error' }, { status: 500 }),
      ),
    )
    const router = renderAt('/')

    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    // 5xx는 세션 유무를 알려주지 않는다 — 비회원으로 확정하지 않고 확인 전으로 남겨
    // 다음 네비게이션에서 다시 확인한다(회원을 로그인 화면으로 쫓아내지 않는 근거).
    expect(getSessionState()).toBe('unknown')
  })

  it('[AC-HOME-013] 추천 카드를 누르면 실 상품 상세로 이동한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get(HOME_URL, () =>
        HttpResponse.json({
          data: {
            recommended: [
              {
                ...fixture('p-real-1'),
                productId: REAL_PRODUCT_ID,
                name: '리얼 프리미엄 자동 급식기',
                isLiked: false,
              },
            ],
            ranking: [],
          },
        }),
      ),
    )
    const router = renderAt('/')

    await user.click(await screen.findByRole('button', { name: '리얼 프리미엄 자동 급식기 상세 보기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/products/${REAL_PRODUCT_ID}`))
    expect(await screen.findByText('상품 정보')).toBeInTheDocument()
  })

  it('[AC-HOME-009] 마켓에서 더 보기는 마켓 탭으로 이동한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/')

    await user.click(await screen.findByRole('button', { name: '마켓에서 더 보기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
    // 라우트 코드 스플리팅으로 /market 청크를 받는 동안 홈 DOM이 잠시 남는다.
    await waitFor(() => expect(screen.queryByText('이런 상품은 어때요?')).not.toBeInTheDocument())
  })
})

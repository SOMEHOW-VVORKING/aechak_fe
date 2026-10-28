import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { makeApplicationWire, seedSellerApplication } from '../../testing/msw/server'
import { routeTree } from '../../routeTree.gen'

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

const landedOn = (router: ReturnType<typeof renderAt>, path: string) =>
  waitFor(() => expect(router.state.location.pathname).toBe(path))

/**
 * 셀러센터는 refresh 쿠키만으로 세션이 복원된다 — 그 쿠키는 도메인 없이 api 호스트에 묶여
 * 구매자·어드민에서 로그인한 계정도 여기 들어온다. 자격을 따로 보지 않으면 셀러가 아닌
 * 계정에게 운영 화면이 그대로 열린다. 이 스펙이 그 두 관문을 고정한다.
 */
describe('셀러센터 진입 가드', () => {
  it('[AC-SELLER-GUARD-001] 세션이 없으면 운영 화면 대신 로그인으로 보낸다', async () => {
    // MSW의 refresh는 401 고정이라 복원이 실패한다 = 비로그인 진입.
    setAccessToken(null)

    await landedOn(renderAt('/products'), '/login')
  })

  it('[AC-SELLER-GUARD-002] 신청 이력이 없는 계정은 입점 신청 화면으로 보낸다', async () => {
    seedSellerApplication(null) // GET 404/10100

    await landedOn(renderAt('/products'), '/store-settings')
  })

  it('[AC-SELLER-GUARD-003] 심사 중인 계정도 아직 운영 화면에 들어갈 수 없다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'SUBMITTED' }))

    await landedOn(renderAt('/products'), '/store-settings')
  })

  it('[AC-SELLER-GUARD-004] 승인된 셀러는 운영 화면에 그대로 들어간다', async () => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))

    await landedOn(renderAt('/products'), '/products')
  })

  it('[AC-SELLER-GUARD-005] 입점 신청 화면은 미승인 계정의 목적지라 자격을 묻지 않는다', async () => {
    seedSellerApplication(null)

    await landedOn(renderAt('/store-settings'), '/store-settings')
  })

  it('[AC-SELLER-GUARD-006] 로그인 화면은 세션 없이 들어오는 것이 정상이라 통과시킨다', async () => {
    setAccessToken(null)

    await landedOn(renderAt('/login'), '/login')
  })
})

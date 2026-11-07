import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { RouteErrorScreen } from '../components/RouteFallbacks'
import { makeApplicationWire, seedSellerApplication } from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultErrorComponent: RouteErrorScreen,
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('없는 주소와 화면 오류', () => {
  beforeEach(() => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
  })

  it.each(['/coupons', '/account'])(
    '[AC-SELLER-FALLBACK-001] 걷어낸 화면 주소 %s는 셸 안에서 한국어 안내와 대시보드 버튼을 보여 준다',
    async path => {
      const user = userEvent.setup()
      const router = renderAt(path)

      expect(await screen.findByText('페이지를 찾을 수 없어요')).toBeInTheDocument()
      expect(screen.queryByText('Not Found')).not.toBeInTheDocument()
      // 셸이 남아 다른 메뉴로 바로 갈 수 있다.
      expect(screen.getByRole('button', { name: '대시보드' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '대시보드로 가기' }))
      expect(router.state.location.pathname).toBe('/')
    },
  )

  it('[AC-SELLER-FALLBACK-002] 라우트가 그리다 오류를 내면 부모 레이아웃은 남기고 그 자리에 안내를 그린다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let broken = true
    const root = createRootRoute({
      component: () => (
        <div>
          <nav>셸 메뉴</nav>
          <Outlet />
        </div>
      ),
    })
    const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>대시보드</p> })
    const crash = createRoute({
      getParentRoute: () => root,
      path: '/store-settings',
      component: () => {
        if (broken) throw new Error('boom')
        return <p>스토어 설정 본문</p>
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([index, crash]),
      history: createMemoryHistory({ initialEntries: ['/store-settings'] }),
      defaultErrorComponent: RouteErrorScreen,
    })
    const user = userEvent.setup()
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('화면을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('셸 메뉴')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong!')).not.toBeInTheDocument()

    broken = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText('스토어 설정 본문')).toBeInTheDocument()
  })
})

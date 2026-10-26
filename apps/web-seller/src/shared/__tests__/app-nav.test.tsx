import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect } from 'vitest'
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

// 이 파일은 unavailable-routes.test.tsx를 대체한다 — 2026-10-18 게이트(SCRUM-238)가 막아 둔 다섯
// 화면에 서버가 모두 생겨(SCRUM-291·292·293·295) 막힌 라우트가 하나도 남지 않았고, 그 자리에서
// 지켜야 할 것이 바뀌었다: "막혀 있나"가 아니라 **"메뉴가 돌아왔나"**다.
//
// 다섯 브랜치를 합치다 한쪽 nav 항목이 조용히 사라지는 것이 이 작업의 가장 큰 위험이라, 항목을
// 하나하나 이름으로 고정한다. 라우트별 실 연동 검증은 features/*/__tests__/*-route.test.tsx가 맡는다.
describe('셀러센터 SideNav', () => {
  const LIVE_ITEMS = [
    '대시보드',
    '주문/배송 관리',
    '취소/반품/교환',
    '상품 관리',
    '배송 정책',
    '정산/매출',
    '스토어 설정',
  ]

  it('[AC-SELLER-NAV-001] 서버가 있는 7항목이 모두 nav에 보인다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const label of LIVE_ITEMS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('[AC-SELLER-NAV-002] 게이트 이전 정본 4그룹(운영·판매 설정·정산·스토어) 구성으로 묶인다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const group of ['운영', '판매 설정', '정산', '스토어']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
  })

  // 라우트 파일이 없는 항목은 아직 올리지 않는다 — 올리면 404로 가는 죽은 nav가 된다.
  // 라우트와 BE가 생기는 작업에서 "준비 중" 배지와 함께 되돌린다.
  it('[AC-SELLER-NAV-003] 라우트가 없는 다섯 항목은 아직 nav에 없다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const label of ['고객 문의', '리뷰 관리', '혜택/쿠폰/할인', '알림/공지', '계정/보안']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  // 게이트 상수(`shared/serverAvailability`)는 지우지 않고 true로 올렸다 — 서버가 내려가면 다시
  // 내릴 수 있어야 한다. 올라가 있는 동안은 어느 라우트도 "준비 중" 안내로 빠지지 않아야 한다.
  //
  // **"준비 중 문구가 없다"만 단언하면 안 된다** — 라우터는 렌더가 터진 라우트를 기본 errorComponent로
  // 받아 삼키므로, 화면이 깨져도 그 문구는 당연히 없어 테스트가 초록으로 통과한다. 그래서 목적지가
  // 실제로 열렸다는 증거(그 화면의 제목)를 먼저 기다린다. 제목은 nav 항목과 이름이 겹치므로
  // heading으로 가른다(nav는 button이다).
  it.each([
    ['/', '대시보드'],
    ['/orders', '주문/배송 관리'],
    ['/claims', '취소/반품/교환'],
    ['/settlements', '정산/매출'],
    ['/shipping-policy', '배송 정책'],
  ])('[AC-SELLER-NAV-004] %s 직접 진입이 그 화면을 열고 "준비 중" 안내로 빠지지 않는다', async (path, heading) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.queryByText(/준비 중이에요/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '상품 관리로' })).not.toBeInTheDocument()
  })
})

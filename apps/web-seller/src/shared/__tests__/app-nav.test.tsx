import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, it, expect } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { makeApplicationWire, seedSellerApplication } from '@/testing/msw/server'

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

/** TanStack은 index 라우트의 pathname에 꼬리 슬래시를 붙일 수 있다 — nav key와 같은 꼴로 맞춘다. */
const normalizePath = (pathname: string) =>
  pathname === '/' ? pathname : pathname.replace(/\/+$/, '')

// 이 파일은 unavailable-routes.test.tsx를 대체한다 — 2026-10-18 게이트(SCRUM-238)가 막아 둔 다섯
// 화면에 서버가 모두 생겨(SCRUM-291·292·293·295) 막힌 라우트가 하나도 남지 않았고, 그 자리에서
// 지켜야 할 것이 바뀌었다: "막혀 있나"가 아니라 **"메뉴가 돌아왔나"**다.
//
// 이 작업의 발단이 "메뉴가 사라졌다"이고, 브랜치 셋을 합치다 한쪽 nav 항목이 조용히 사라지는 것이
// 가장 큰 위험이라 **개수를 세지 않고 항목을 하나하나 이름으로 고정한다**(개수 단언은 항목이
// 뒤바뀌어도 통과한다). 라우트별 실 연동 검증은 features/*/__tests__/*-route.test.tsx가 맡고,
// 준비 중 다섯 화면의 안내 내용은 unbuilt-routes.test.tsx가 맡는다.
describe('셀러센터 SideNav', () => {
  // `/store-settings`의 제목은 입점 신청 상태에 따라 갈린다(개설 신청 → 개설 심사 → 서류 보완 →
  // 스토어 설정). nav 라벨과 같은 "스토어 설정"이 걸리는 것은 APPROVED일 때뿐이므로, 메뉴를
  // 실제로 쓰는 상태인 승인 셀러로 시드한다 — 시드가 없으면 신청 조회가 404라 "스토어 개설 신청"이
  // 뜨고, 아래 "제목 = nav 라벨" 단언이 그 한 항목에서만 깨진다.
  beforeEach(() => {
    seedSellerApplication(makeApplicationWire({ status: 'APPROVED' }))
  })

  /** BE가 있어 꼬리표 없이 실연동으로 쓰는 항목 — 접근명이 라벨 그대로다. */
  const LIVE_ITEMS = [
    '대시보드',
    '주문/배송 관리',
    '취소/반품/교환',
    '상품 관리',
    '배송 정책',
    '정산/매출',
    '스토어 설정',
  ] as const

  /** BE가 없어 "준비 중" 꼬리표가 붙는 항목 — 꼬리표가 버튼 안에 있어 접근명 끝에 붙는다. */
  const PENDING_ITEMS = [
    '고객 문의',
    '리뷰 관리',
    '혜택/쿠폰/할인',
    '알림/공지',
    '계정/보안',
  ] as const

  const pendingName = (label: string) => `${label} 준비 중`
  const navButtonName = (label: string) =>
    (PENDING_ITEMS as readonly string[]).includes(label) ? pendingName(label) : label

  /**
   * nav 항목이 **어느 화면으로 가는지**. 주소로 직접 열어 보는 단언은 라벨과 `key`가 어긋난 것을
   * 잡지 못한다 — 라벨은 그대로 두고 `key`만 다른 경로로 바꿔도 통과하므로 실제로 눌러서 확인한다.
   */
  const NAV_DESTINATIONS = [
    ['대시보드', '/'],
    ['주문/배송 관리', '/orders'],
    ['취소/반품/교환', '/claims'],
    ['고객 문의', '/inquiries'],
    ['리뷰 관리', '/reviews'],
    ['상품 관리', '/products'],
    ['배송 정책', '/shipping-policy'],
    ['혜택/쿠폰/할인', '/coupons'],
    ['정산/매출', '/settlements'],
    ['스토어 설정', '/store-settings'],
    ['알림/공지', '/notices'],
    ['계정/보안', '/account'],
  ] as const satisfies readonly (readonly [string, string])[]

  it('[AC-SELLER-NAV-001] 정본 4그룹 12항목이 이름으로 모두 렌더된다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const label of LIVE_ITEMS) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    for (const label of PENDING_ITEMS) {
      expect(screen.getByRole('button', { name: pendingName(label) })).toBeInTheDocument()
    }
    expect(LIVE_ITEMS.length + PENDING_ITEMS.length).toBe(NAV_DESTINATIONS.length)
  })

  /**
   * 정본(26e4b89^)의 그룹 배치. 머리글이 있는지만 보면 **항목이 엉뚱한 그룹으로 옮겨가도 통과한다**
   * — 주문/배송 관리를 운영에서 스토어로 옮겨도 머리글 4개와 항목 12개는 그대로이기 때문이다.
   * 이번 통합이 세 브랜치의 nav를 한 배열로 합치면서 지킨 것이 바로 이 배치(운영 5 / 판매 설정 3 /
   * 정산 1 / 스토어 3)라, 어느 항목이 어느 그룹에 있는지까지 고정한다.
   */
  const GROUPS = [
    ['운영', ['대시보드', '주문/배송 관리', '취소/반품/교환', '고객 문의', '리뷰 관리']],
    ['판매 설정', ['상품 관리', '배송 정책', '혜택/쿠폰/할인']],
    ['정산', ['정산/매출']],
    ['스토어', ['스토어 설정', '알림/공지', '계정/보안']],
  ] as const satisfies readonly (readonly [string, readonly string[]])[]

  it('[AC-SELLER-NAV-002] 게이트 이전 정본 4그룹(운영·판매 설정·정산·스토어) 구성으로 묶인다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const [group, labels] of GROUPS) {
      // SideNav가 머리글을 `aria-labelledby`로 그룹에 묶어 주므로 그룹 이름으로 좁힐 수 있다.
      const section = screen.getByRole('group', { name: group })
      for (const label of labels) {
        expect(within(section).getByRole('button', { name: navButtonName(label) })).toBeInTheDocument()
      }
      // 그 그룹에 **그 항목들만** 있어야 한다(다른 그룹의 항목이 섞여 들어오면 개수가 어긋난다).
      expect(within(section).getAllByRole('button')).toHaveLength(labels.length)
    }
    // 그룹이 더 생기거나 사라지지 않았는지 — 12항목이 4그룹에 빠짐없이 들어갔다.
    expect(screen.getAllByRole('group')).toHaveLength(GROUPS.length)
    expect(GROUPS.flatMap(([, labels]) => labels)).toHaveLength(NAV_DESTINATIONS.length)
  })

  // SCRUM-301이 라우트를 신설해 다섯 항목이 nav로 돌아왔다(그전에는 404로 가는 죽은 nav라 빠져
  // 있었다). 꼬리표는 BE가 없는 항목에만 붙어야 한다 — 양쪽을 다 단언해야 꼬리표가 통째로 빠지거나
  // 실연동 항목에 잘못 붙은 것을 잡는다.
  it('[AC-SELLER-NAV-003] "준비 중" 꼬리표는 BE 없는 다섯 항목에만 붙는다', async () => {
    renderAt('/products')

    expect(await screen.findByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    for (const label of PENDING_ITEMS) {
      // 꼬리표가 빠지면 접근명이 라벨 그대로가 되어 이 쌍이 뒤집힌다.
      expect(screen.getByRole('button', { name: pendingName(label) })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    for (const label of LIVE_ITEMS) {
      expect(screen.queryByRole('button', { name: pendingName(label) })).not.toBeInTheDocument()
    }
    // 꼬리표 글자는 준비 중 항목 수만큼만 그려진다(실연동 항목으로 번지지 않는다).
    expect(screen.getAllByText('준비 중')).toHaveLength(PENDING_ITEMS.length)
  })

  // 게이트 상수(`shared/serverAvailability`)는 지우지 않고 true로 올렸다 — 서버가 내려가면 다시
  // 내릴 수 있어야 한다. 올라가 있는 동안은 실연동 라우트가 "준비 중" 안내로 빠지지 않아야 한다.
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
    ['/products', '상품 관리'],
  ])('[AC-SELLER-NAV-004] %s 직접 진입이 그 화면을 열고 "준비 중" 안내로 빠지지 않는다', async (path, heading) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '상품 관리' })).toBeInTheDocument()
    expect(screen.queryByText(/준비 중이에요/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '상품 관리로' })).not.toBeInTheDocument()
  })

  it.each(NAV_DESTINATIONS)(
    '[AC-SELLER-NAV-005] nav의 %s 항목을 누르면 %s 화면이 열린다(죽은 nav가 아니다)',
    async (label, path) => {
      const user = userEvent.setup()
      // 도착지와 **다른** 화면에서 시작한다 — 시작 경로와 목적지가 같으면 클릭이 아무 일도 하지
      // 않아도(onSelect 배선이 끊겨도) 경로 단언이 그냥 통과한다.
      const router = renderAt(path === '/products' ? '/' : '/products')

      await user.click(await screen.findByRole('button', { name: navButtonName(label) }))

      await waitFor(() => expect(normalizePath(router.state.location.pathname)).toBe(path))
      // 경로만 맞고 라우트 파일이 없으면 404 화면이라 이 제목이 없다.
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    },
  )
})

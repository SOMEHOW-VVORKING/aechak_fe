import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import {
  ADMIN_APPLICATIONS_URL,
  makeAdminApplicationWire,
  seedAdminApplications,
  server,
} from '@/testing/msw/server'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  // 에러 분기를 즉시 보려면 재시도를 끈다(main.tsx는 retry 1).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

/** TanStack은 index 라우트의 pathname에 꼬리 슬래시를 붙일 수 있다 — nav key와 같은 꼴로 맞춘다. */
const normalizePath = (pathname: string) =>
  pathname === '/' ? pathname : pathname.replace(/\/+$/, '')

/**
 * BE가 dev에 있어 꼬리표 없이 실연동으로 쓰는 항목.
 *
 * 2026-10-26 admin-api-dev 실측: `/admin/admins`(+`/{userId}`)와 `/admin/seller-applications`
 * 계열 넷이 전부다. 이 둘이 늘어나면 아래 두 배열 사이로 항목을 옮기고 `__root.tsx`에서
 * `tag`를 떼면 된다.
 */
const LIVE_LABELS = ['셀러 입점 심사', '관리자 관리'] as const

/** 서버가 없어 들어가도 안내만 보이는 항목 — nav에서는 "준비 중" 꼬리표로 드러난다. */
const PENDING_LABELS = [
  '대시보드',
  '셀러 관리',
  '일반 회원 관리',
  '상품 검수 관리',
  'AI 검수 큐',
  '신고 제재 관리',
  '서비스 문의 관리',
  '주문 배송 모니터링',
  '취소/반품/교환',
  '리뷰 관리',
  '채팅 CS 모니터링',
  '알림/공지 관리',
  '어드민 액션 로그',
] as const

/** 꼬리표 글자는 버튼 접근명 끝에 붙는다 — 어느 항목에 붙었는지까지 이름으로 확인할 수 있다. */
const pendingName = (label: string) => `${label} 준비 중`

/**
 * nav 항목이 **어느 화면으로 가는지**. 주소로 직접 열어 보는 단언은 라벨과 `key`가 어긋난 것을
 * 잡지 못한다 — 라벨은 그대로 두고 `key`만 다른 경로로 바꿔도 통과하므로, 실제로 눌러서 도착지를
 * 확인한다. 15항목의 화면 제목(h1)은 전부 nav 라벨과 같은 글자라, 제목이 라벨과 다르면 엉뚱한
 * 화면에 떨어진 것이다.
 */
const NAV_DESTINATIONS = [
  ['대시보드', '/'],
  ['셀러 입점 심사', '/sellers/applications'],
  ['셀러 관리', '/sellers'],
  ['일반 회원 관리', '/members'],
  ['상품 검수 관리', '/products/review'],
  ['AI 검수 큐', '/products/ai-queue'],
  ['신고 제재 관리', '/reports'],
  ['서비스 문의 관리', '/inquiries'],
  ['주문 배송 모니터링', '/orders/monitoring'],
  ['취소/반품/교환', '/claims'],
  ['리뷰 관리', '/reviews'],
  ['채팅 CS 모니터링', '/chat-monitoring'],
  ['관리자 관리', '/admins'],
  ['알림/공지 관리', '/notices'],
  ['어드민 액션 로그', '/audit-log'],
] as const satisfies readonly (readonly [string, string])[]

const navButtonName = (label: string) =>
  (PENDING_LABELS as readonly string[]).includes(label) ? pendingName(label) : label

// SCRUM-238(26e4b89)이 BE 없는 화면의 운영 진입을 막으면서 nav 항목까지 걷어내, 어드민 메뉴가
// 홈·입점 심사·관리자 관리 셋만 남았다. 규약 10의 목적은 "메뉴를 숨겨라"가 아니라 "운영자가
// 속지 않게 하라"이므로, 메뉴는 되살리고 BE 유무를 꼬리표로 가른다.
//
// 개수만 세는 단언은 항목이 뒤바뀌어도 통과하므로 **항목 이름**으로 확인한다.
describe('어드민 nav', () => {
  beforeEach(() => {
    // 심사 대기 0건 → 입점 심사 항목에 숫자 배지가 붙지 않는 상태가 기본값이다.
    seedAdminApplications()
  })

  it('[AC-ADMIN-NAV-001] 5그룹 15항목이 이름으로 모두 렌더된다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    }
    // 그룹 머리글 — 셸이 마운트된 뒤에 본다(라우터 마운트가 비동기라 먼저 보면 body가 비어 있다).
    for (const group of ['운영', '검수', '신고 / 문의', '주문 / 클레임', '운영 관리']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
    for (const label of PENDING_LABELS) {
      expect(screen.getByRole('button', { name: pendingName(label) })).toBeInTheDocument()
    }
  })

  it('[AC-ADMIN-NAV-002] 꼬리표는 BE가 없는 항목에만 붙고 실연동 항목에는 붙지 않는다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      // 실연동 항목의 접근명은 라벨 그대로다 — 꼬리표가 붙으면 이름이 달라져 여기서 깨진다.
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: pendingName(label) })).not.toBeInTheDocument()
    }
    for (const label of PENDING_LABELS) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    // 꼬리표 자체는 준비 중 항목 수만큼 그려진다(숫자가 아니라 글자로 구별된다).
    expect(screen.getAllByText('준비 중')).toHaveLength(PENDING_LABELS.length)
  })

  it('[AC-ADMIN-NAV-003] 숫자 배지와 준비 중 꼬리표는 서로 다른 자리를 쓴다', async () => {
    seedAdminApplications([
      makeAdminApplicationWire({ applicationId: 11, status: 'SUBMITTED' }),
      makeAdminApplicationWire({ applicationId: 12, status: 'SUBMITTED' }),
    ])

    renderAt('/')

    // 입점 심사는 서버 대기 수를 숫자로 받는다(꼬리표 자리와 겹치지 않는다).
    expect(await screen.findByRole('button', { name: '셀러 입점 심사 2' })).toBeInTheDocument()
    // 준비 중 항목은 숫자 배지를 받지 않는다 — 상수 배지는 AGENTS.md가 금지한 장식 UI다.
    expect(screen.getByRole('button', { name: pendingName('상품 검수 관리') })).toBeInTheDocument()
  })

  it.each([
    ['/', '운영 지표 대시보드는 준비 중이에요'],
    ['/sellers', '셀러 관리는 준비 중이에요'],
    ['/members', '일반 회원 관리는 준비 중이에요'],
    ['/products/review', '상품 검수 관리는 준비 중이에요'],
    ['/products/ai-queue', 'AI 검수 큐는 준비 중이에요'],
    ['/reports', '신고 제재 관리는 준비 중이에요'],
    ['/inquiries', '서비스 문의 관리는 준비 중이에요'],
    ['/orders/monitoring', '주문 배송 모니터링은 준비 중이에요'],
    ['/claims', '취소/반품/교환 관리는 준비 중이에요'],
    ['/reviews', '리뷰 관리는 준비 중이에요'],
    ['/chat-monitoring', '채팅 CS 모니터링은 준비 중이에요'],
    ['/notices', '알림/공지 관리는 준비 중이에요'],
    ['/audit-log', '어드민 액션 로그는 준비 중이에요'],
  ])(
    '[AC-ADMIN-NAV-004] 꼬리표가 붙은 %s 는 404가 아니라 준비 중 안내를 보여준다',
    async (path, message) => {
      renderAt(path)

      expect(await screen.findByText(message)).toBeInTheDocument()
      // 안내만 보여준다 — 목업 표·저장 버튼이 함께 그려지면 운영자가 처리된 줄 안다.
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '제출' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-NAV-005] 대시보드 안내의 바로가기는 실제로 입점 심사 화면으로 보낸다', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/')

    await user.click(await screen.findByRole('button', { name: '셀러 입점 심사로' }))

    // 버튼 존재만 보면 onClick을 떼어도 통과한다 — 도착지까지 단언한다.
    await waitFor(() => expect(router.state.location.pathname).toBe('/sellers/applications'))
    expect(await screen.findByRole('heading', { name: '셀러 입점 심사' })).toBeInTheDocument()
  })

  it.each(NAV_DESTINATIONS)(
    '[AC-ADMIN-NAV-006] nav의 %s 항목을 누르면 %s 화면이 열린다(죽은 nav가 아니다)',
    async (label, path) => {
      const user = userEvent.setup()
      const { router } = renderAt('/')

      await user.click(await screen.findByRole('button', { name: navButtonName(label) }))

      await waitFor(() => expect(normalizePath(router.state.location.pathname)).toBe(path))
      // 경로만 맞고 라우트 파일이 없으면 404 화면이라 이 제목이 없다.
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-NAV-007] 배지 숫자는 재조회가 실패하면 옛 숫자를 남기지 않고 사라진다', async () => {
    seedAdminApplications([makeAdminApplicationWire({ applicationId: 11, status: 'SUBMITTED' })])
    const { queryClient } = renderAt('/')
    expect(await screen.findByRole('button', { name: '셀러 입점 심사 1' })).toBeInTheDocument()

    // 권한이 끊긴 뒤(403/20011) 재조회가 실패해도 react-query는 캐시된 숫자를 그대로 들고 있다 —
    // 그걸 돌려주면 nav가 서버에 없는 대기 건수를 가리킨다.
    server.use(
      http.get(ADMIN_APPLICATIONS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries()
    })

    expect(await screen.findByRole('button', { name: '셀러 입점 심사' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '셀러 입점 심사 1' })).not.toBeInTheDocument()
  })
})

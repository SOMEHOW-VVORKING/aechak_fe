import { act, render, screen, waitFor, within } from '@testing-library/react'
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

/**
 * 서버가 없어 들어가면 예시 데이터만 보이는 항목 — nav에서는 "준비 중" 꼬리표로 드러나고
 * 화면에서는 상단 띠로 드러난다(SCRUM-308).
 */
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

  /**
   * 차단 이전 nav의 그룹 배치 + 그 뒤 생긴 `/admins`. 머리글과 항목을 각각 전역에서 찾기만 하면
   * **항목이 다른 그룹으로 옮겨가도 통과한다** — 머리글 5개와 항목 15개는 그대로이기 때문이다.
   * 운영자가 메뉴에서 읽는 정보의 절반이 "무엇이 무엇과 묶여 있나"라 소속까지 고정한다.
   */
  const GROUPS = [
    ['운영', ['대시보드', '셀러 입점 심사', '셀러 관리', '일반 회원 관리']],
    ['검수', ['상품 검수 관리', 'AI 검수 큐']],
    ['신고 / 문의', ['신고 제재 관리', '서비스 문의 관리']],
    ['주문 / 클레임', ['주문 배송 모니터링', '취소/반품/교환', '리뷰 관리', '채팅 CS 모니터링']],
    ['운영 관리', ['관리자 관리', '알림/공지 관리', '어드민 액션 로그']],
  ] as const satisfies readonly (readonly [string, readonly string[]])[]

  it('[AC-ADMIN-NAV-008] 15항목이 정해진 5그룹에 소속되어 묶인다', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '관리자 관리' })).toBeInTheDocument()
    for (const [group, labels] of GROUPS) {
      // SideNav가 머리글을 `aria-labelledby`로 그룹에 묶어 주므로 그룹 이름으로 좁힐 수 있다.
      const section = screen.getByRole('group', { name: group })
      for (const label of labels) {
        expect(within(section).getByRole('button', { name: navButtonName(label) })).toBeInTheDocument()
      }
      // 그 그룹에 **그 항목들만** 있어야 한다(다른 그룹 항목이 섞이면 개수가 어긋난다).
      expect(within(section).getAllByRole('button')).toHaveLength(labels.length)
    }
    expect(screen.getAllByRole('group')).toHaveLength(GROUPS.length)
    expect(GROUPS.flatMap(([, labels]) => labels)).toHaveLength(NAV_DESTINATIONS.length)
  })

  /**
   * 꼬리 슬래시가 붙은 주소로 들어와도 현재 메뉴가 활성으로 보여야 한다.
   *
   * 어드민 라우트는 대부분 index 라우트라 `/sellers/`처럼 들어온 경로가 그대로 유지되는데,
   * `SideNav`는 `activeKey`를 key와 완전 일치로 비교한다 — 셸이 pathname을 그대로 넘기면 어느
   * 항목도 활성이 되지 않아 활성 스타일과 `aria-current`가 통째로 사라진다(화면은 열리는데
   * 운영자는 자기가 어느 메뉴에 있는지 알 수 없다). 앱 안에서 nav를 눌러 이동하면 슬래시가
   * 붙지 않아 북마크·외부 링크·주소 직접 입력에서만 드러나는 자리라, 그 진입으로 단언한다.
   */
  it.each([
    ['/sellers/', '셀러 관리'],
    ['/members/', '일반 회원 관리'],
    ['/admins/', '관리자 관리'],
    ['/sellers/applications/', '셀러 입점 심사'],
  ])('[AC-ADMIN-NAV-009] %s 로 들어와도 %s 항목이 현재 위치로 표시된다', async (path, label) => {
    renderAt(path)

    const item = await screen.findByRole('button', { name: navButtonName(label) })
    expect(item).toHaveAttribute('aria-current', 'page')
    // 활성이 한 항목뿐이어야 한다 — 접두 일치로 느슨하게 맞추면 여러 항목이 함께 켜진다.
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
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

  /**
   * nav의 "준비 중" 꼬리표와 화면 상단의 예시 데이터 띠는 **짝이 맞아야 한다.**
   *
   * 2026-10-26까지는 꼬리표가 붙은 목적지가 `UnavailableScreen` 안내만 보여줬고 이 자리에서
   * "표가 없다"를 단언했다. 그런데 그 방식은 운영자가 기능의 모양조차 볼 수 없게 만들어
   * "목 데이터로 잘 들어가 있던 화면을 다 없앴다"는 지적을 받았다(SCRUM-308). 지금은 화면을
   * 열고 **예시임을 띠로 밝히고 쓰기를 막는** 방식이라, 고정해야 하는 계약이 뒤집혔다 —
   * 꼬리표가 붙은 13항목의 목적지에는 띠가 **있어야** 하고, 실연동 2항목에는 **없어야** 한다.
   *
   * 한쪽만 단언하면 반쪽이 썩는다: 띠만 보면 실데이터 화면에 띠를 붙여도 통과하고(실데이터를
   * 예시로 의심하게 만든다), 없음만 보면 예시 화면에서 띠가 빠져도 통과한다(저장된 줄 안다).
   * 화면 내용과 쓰기 차단은 `admin-mock-screens.test.tsx`가 화면 이름으로 따로 고정한다.
   */
  const destinationsFor = (labels: readonly string[]) =>
    NAV_DESTINATIONS.filter(([label]) => labels.includes(label))

  it.each(destinationsFor(PENDING_LABELS))(
    '[AC-ADMIN-NAV-004] 꼬리표가 붙은 %s(%s) 화면은 예시 데이터 띠를 달고 열린다',
    async (label, path) => {
      renderAt(path)

      // 경로만 맞고 라우트가 없으면 404라 제목이 없다 — 띠보다 화면이 열렸는지를 먼저 본다.
      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
      const notice = screen.getByRole('alert')
      expect(notice).toHaveTextContent('예시 데이터예요')
      // 제목만 보면 "저장되지 않는다"를 뺀 띠도 통과한다 — 그 문장이 규약의 핵심이다.
      expect(notice).toHaveTextContent('저장되지 않아요')
    },
  )

  it.each(destinationsFor(LIVE_LABELS))(
    '[AC-ADMIN-NAV-010] 실연동 %s(%s) 화면에는 예시 데이터 띠를 붙이지 않는다',
    async (label, path) => {
      renderAt(path)

      expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
      expect(screen.queryByText('예시 데이터예요')).not.toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-NAV-005] 대시보드의 심사 대기 카드는 실제로 입점 심사 화면으로 보낸다', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/')

    // 대시보드 지표는 예시지만 **심사 대기 수만 실 API 값**이고, 그 카드가 유일한 실연동
    // 진입점이다(routes/index.tsx). 카드 존재만 보면 onClick을 떼어도 통과한다 — 도착지까지 본다.
    await user.click(await screen.findByRole('button', { name: /셀러 입점 심사 대기/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sellers/applications'))
    expect(await screen.findByRole('heading', { name: '셀러 입점 심사' })).toBeInTheDocument()
  })

  it.each(NAV_DESTINATIONS)(
    '[AC-ADMIN-NAV-006] nav의 %s 항목을 누르면 %s 화면이 열린다(죽은 nav가 아니다)',
    async (label, path) => {
      const user = userEvent.setup()
      // 도착지와 **다른** 화면에서 시작한다 — 대시보드처럼 시작 경로와 목적지가 같으면 클릭이
      // 아무 일도 하지 않아도(onSelect 배선이 끊겨도) 경로·제목 단언이 그냥 통과한다.
      const { router } = renderAt(path === '/' ? '/audit-log' : '/')

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

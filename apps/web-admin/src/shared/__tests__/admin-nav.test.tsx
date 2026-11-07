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
  seedAdminAuditLogs,
  seedAdminClaims,
  seedAdminInquiries,
  seedAdminInspections,
  seedAdminInspectionMetrics,
  makeAdminInspectionMetricsWire,
  seedAdminNotices,
  seedAdminOrders,
  seedAdminProductInspections,
  seedAdminProducts,
  seedAdminReports,
  seedAdminReviews,
  seedAdminSellers,
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
 * 계열 넷. 그 뒤 `/admin/members` 계열 넷(목록·상세·제재·해제)이 더해져 일반 회원 관리가,
 * `/admin/orders` 계열 넷(목록·지표·상세·발송 독촉)이 더해져 주문 배송 모니터링이,
 * `/admin/product-inspections` 넷이 더해져 AI 검수 큐가 실연동이 됐다. 2026-10-30 실측에서는
 * `/admin/inquiries` 넷·`/admin/claims` 넷·`/admin/reviews` 다섯이 확인돼 서비스 문의·클레임·
 * 리뷰도 실연동이 됐다(SCRUM-331). 2026-11-03에는 `GET /admin/audit-logs` 하나가 확인돼 어드민
 * 액션 로그가 실연동이 됐고(SCRUM-318), `/admin/notices` 여섯(목록·초안 생성·상세·수정·게시·내림)이
 * 확인돼 알림/공지 관리도 실연동이 됐다(SCRUM-332). `/admin/reports` 셋(목록·상세·처리)이 확인돼
 * 신고 제재 관리도 실연동이 됐다(SCRUM-241). 2026-11-05에 둘이 함께 실연동으로 옮겼다.
 * `/admin/sellers` 다섯(목록·상세·판매정지·해제·메모)으로 셀러 관리가(SCRUM-362),
 * `/admin/products` 셋(목록·판매중지·재개)으로 상품 카탈로그 관리가(SCRUM-363) 열렸다.
 * 2026-11-07에는 **대시보드**가 더해졌다 — 전용 집계 경로가 생긴 것이 아니라, 위 목록·지표
 * 경로를 1건짜리 조회로 불러 `totalCount`만 모아 칸과 할 일 줄을 전부 실 집계로 채웠다(칸별
 * 계약은 `features/dashboard/__tests__`가 본다). 같은 날 BE가 없는 '채팅 CS 모니터링'은 nav와
 * 라우트째 걷었다(SCRUM-377). 또 `/admin/inspections` 둘(목록·상세)이 확인돼 'AI 검수
 * 모니터링'이 실연동으로 새로 들어왔다(SCRUM-367). `/admin/inspection-metrics` 하나로 'AI 검수
 * 지표'도 들어왔다(SCRUM-279). 그래서 nav 16항목 전부가 실연동이다.
 */
const LIVE_LABELS = [
  '셀러 입점 심사',
  '셀러 관리',
  '관리자 관리',
  '일반 회원 관리',
  '상품 카탈로그 관리',
  'AI 검수 큐',
  'AI 검수 모니터링',
  'AI 검수 지표',
  '주문 배송 모니터링',
  '서비스 문의 관리',
  '취소/반품/교환',
  '리뷰 관리',
  '알림/공지 관리',
  '어드민 액션 로그',
  '신고 제재 관리',
  '대시보드',
] as const

/**
 * "준비 중" 꼬리표가 붙은 항목은 **하나도 없다.** 셀러 관리(SCRUM-362)와 대시보드(SCRUM-313)가
 * 실연동으로 옮겼고, 채팅 CS 모니터링은 BE가 없어 nav째 걷었다(SCRUM-377). 예시 데이터 화면도
 * 함께 사라졌다.
 *
 * 그래서 준비 중 분류 배열을 두지 않는다. 빈 배열에 `it.each`를 걸면 0회 돌고 통과해 **가드가
 * 사라진 것**을 녹색으로 보여 준다. 대신 AC-ADMIN-NAV-004가 "꼬리표도 띠도 없다"를 직접
 * 단언한다. 꼬리표가 다시 생기면 그 테스트가 깨지고, 그때 분류 배열을 되살린다.
 */
const PENDING_TAG = '준비 중'

/**
 * nav 항목이 **어느 화면으로 가는지**. 주소로 직접 열어 보는 단언은 라벨과 `key`가 어긋난 것을
 * 잡지 못한다 — 라벨은 그대로 두고 `key`만 다른 경로로 바꿔도 통과하므로, 실제로 눌러서 도착지를
 * 확인한다. 16항목의 화면 제목(h1)은 전부 nav 라벨과 같은 글자라, 제목이 라벨과 다르면 엉뚱한
 * 화면에 떨어진 것이다.
 */
const NAV_DESTINATIONS = [
  ['대시보드', '/'],
  ['셀러 입점 심사', '/sellers/applications'],
  ['셀러 관리', '/sellers'],
  ['일반 회원 관리', '/members'],
  ['상품 카탈로그 관리', '/products/catalog'],
  ['AI 검수 큐', '/products/ai-queue'],
  ['AI 검수 모니터링', '/inspections/monitoring'],
  ['AI 검수 지표', '/products/ai-metrics'],
  ['신고 제재 관리', '/reports'],
  ['서비스 문의 관리', '/inquiries'],
  ['주문 배송 모니터링', '/orders/monitoring'],
  ['취소/반품/교환', '/claims'],
  ['리뷰 관리', '/reviews'],
  ['관리자 관리', '/admins'],
  ['알림/공지 관리', '/notices'],
  ['어드민 액션 로그', '/audit-log'],
] as const satisfies readonly (readonly [string, string])[]

// SCRUM-238(26e4b89)이 BE 없는 화면의 운영 진입을 막으면서 nav 항목까지 걷어내, 어드민 메뉴가
// 홈·입점 심사·관리자 관리 셋만 남았다. 규약 10의 목적은 "메뉴를 숨겨라"가 아니라 "운영자가
// 속지 않게 하라"이므로, 메뉴는 되살리고 BE 유무를 꼬리표로 가른다.
//
// 개수만 세는 단언은 항목이 뒤바뀌어도 통과하므로 **항목 이름**으로 확인한다.
describe('어드민 nav', () => {
  beforeEach(() => {
    // 심사 대기 0건 → 입점 심사 항목에 숫자 배지가 붙지 않는 상태가 기본값이다.
    seedAdminApplications()
    // AI 검수 큐는 실연동이라 열리자마자 목록을 조회한다. 대시보드도 이제 실 집계라, 아래
    // 시드 전부가 그 첫 화면의 건수 조회(`size=1` + `totalCount`)에 함께 쓰인다.
    seedAdminProductInspections()
    // 주문 배송 모니터링은 실연동이라 이 화면을 열면 목록·지표 조회가 나간다.
    seedAdminOrders()
    // 상품 카탈로그 관리도 실연동이라 열리자마자 전수 목록을 조회한다.
    seedAdminProducts()
    // 실연동 화면도 nav 테스트에서 열린다 — 빈 목록으로 시드해 테스트 사이 상태를 끊는다.
    seedAdminInquiries()
    seedAdminClaims()
    seedAdminReviews()
    // 감사 로그·공지도 같은 이유로 끊어 둔다. 두 핸들러는 시드가 없어도 빈 목록으로 답하고 이
    // 파일은 제목과 이동만 단언하므로 **지금은** 둘을 빼도 깨지지 않는다(실측) — 뒤에 행 내용을
    // 보는 단언이 생기면 앞 테스트가 남긴 행을 그대로 읽게 되는 자리라 미리 끊는다.
    seedAdminAuditLogs()
    seedAdminNotices()
    seedAdminReports()
    // 셀러 관리도 실연동이라 AC-ADMIN-NAV-010이 `/sellers`를 열면 목록 조회가 나간다.
    seedAdminSellers()
    // 검수 진행 현황도 실연동이라 `/inspections/monitoring`을 열면 목록 조회가 나간다. 빈 목록으로
    // 시드하면 진행 중인 건이 없어 폴링이 느린 주기(30초)로 떨어져, 이 파일의 테스트가 도는 동안
    // 같은 경로를 다시 부르지 않는다.
    seedAdminInspections()
    // 검수 지표는 시드가 없으면 403으로 답한다 — `/products/ai-metrics`가 열리면 조회가 나간다.
    seedAdminInspectionMetrics(makeAdminInspectionMetricsWire())
  })

  it('[AC-ADMIN-NAV-001] 5그룹 16항목이 이름으로 모두 렌더된다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
    }
    // 그룹 머리글 — 셸이 마운트된 뒤에 본다(라우터 마운트가 비동기라 먼저 보면 body가 비어 있다).
    for (const group of ['운영', '검수', '신고 / 문의', '주문 / 클레임', '운영 관리']) {
      expect(screen.getByText(group)).toBeInTheDocument()
    }
    expect(screen.queryByText(PENDING_TAG)).not.toBeInTheDocument()
  })

  /**
   * 차단 이전 nav의 그룹 배치 + 그 뒤 생긴 `/admins`·`/products/catalog`·
   * `/inspections/monitoring`. 머리글과 항목을 각각 전역에서 찾기만 하면 **항목이 다른 그룹으로
   * 옮겨가도 통과한다** — 머리글 5개와 항목 16개는 그대로이기 때문이다. 운영자가 메뉴에서 읽는
   * 정보의 절반이 "무엇이 무엇과 묶여 있나"라
   * 소속까지 고정한다.
   */
  const GROUPS = [
    // '상품 카탈로그 관리'가 '검수'가 아니라 여기 있는 이유: 이 화면의 모수는 전수 상품이고
    // 셀러·회원 관리와 같은 결이다(SCRUM-363). '검수' 그룹에 두면 'AI 검수 큐'와 나란히 서서
    // "검수는 어느 쪽에서 하나"가 되돌아온다 — 입구를 내리게 한 사고(SCRUM-313)의 원인이 그것이다.
    ['운영', ['대시보드', '셀러 입점 심사', '셀러 관리', '일반 회원 관리', '상품 카탈로그 관리']],
    // 큐(운영자가 처리할 것)·모니터링(지금 돌고 있는 것 전부)·지표(끝난 건의 집계) 셋이다 —
    // 모수가 달라 나란히 서도 "검수는 어느 쪽에서 하나"가 되돌아오지 않는다(SCRUM-367·279).
    // 아래 항목 수 단언이 이름만 닮은 네 번째 항목이 섞여 드는 것을 잡는다.
    ['검수', ['AI 검수 큐', 'AI 검수 모니터링', 'AI 검수 지표']],
    ['신고 / 문의', ['신고 제재 관리', '서비스 문의 관리']],
    // '채팅 CS 모니터링'을 내려 셋뿐이다(2026-11-07, `__root.tsx` nav 주석에 사유) — 아래 항목
    // 수 단언이 그 항목이 되올라오는 것을 잡는다.
    ['주문 / 클레임', ['주문 배송 모니터링', '취소/반품/교환', '리뷰 관리']],
    ['운영 관리', ['관리자 관리', '알림/공지 관리', '어드민 액션 로그']],
  ] as const satisfies readonly (readonly [string, readonly string[]])[]

  it('[AC-ADMIN-NAV-008] 16항목이 정해진 5그룹에 소속되어 묶인다', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '관리자 관리' })).toBeInTheDocument()
    for (const [group, labels] of GROUPS) {
      // SideNav가 머리글을 `aria-labelledby`로 그룹에 묶어 주므로 그룹 이름으로 좁힐 수 있다.
      const section = screen.getByRole('group', { name: group })
      for (const label of labels) {
        expect(within(section).getByRole('button', { name: label })).toBeInTheDocument()
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

    const item = await screen.findByRole('button', { name: label })
    expect(item).toHaveAttribute('aria-current', 'page')
    // 활성이 한 항목뿐이어야 한다 — 접두 일치로 느슨하게 맞추면 여러 항목이 함께 켜진다.
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
  })

  it('[AC-ADMIN-NAV-002] 실연동 항목에는 준비 중 꼬리표가 붙지 않는다', async () => {
    renderAt('/')

    for (const label of LIVE_LABELS) {
      // 실연동 항목의 접근명은 라벨 그대로다 — 꼬리표가 붙으면 이름이 달라져 여기서 깨진다.
      expect(await screen.findByRole('button', { name: label })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: `${label} ${PENDING_TAG}` }),
      ).not.toBeInTheDocument()
    }
    expect(screen.queryAllByText(PENDING_TAG)).toHaveLength(0)
  })

  it('[AC-ADMIN-NAV-003] 숫자 배지는 서버 대기 수를 그대로 받는다', async () => {
    seedAdminApplications([
      makeAdminApplicationWire({ applicationId: 11, status: 'SUBMITTED' }),
      makeAdminApplicationWire({ applicationId: 12, status: 'SUBMITTED' }),
    ])

    renderAt('/')

    // 입점 심사는 서버 대기 수를 숫자로 받는다.
    expect(await screen.findByRole('button', { name: '셀러 입점 심사 2' })).toBeInTheDocument()
    // 숫자 배지는 그 한 항목뿐이다 — 상수 배지는 AGENTS.md가 금지한 장식 UI다.
    expect(screen.queryAllByRole('button', { name: /\s\d+$/ })).toHaveLength(1)
  })

  /**
   * nav의 "준비 중" 꼬리표와 화면 상단의 예시 데이터 띠는 **짝이 맞아야 한다.**
   *
   * 2026-10-26까지는 꼬리표가 붙은 목적지가 `UnavailableScreen` 안내만 보여줬고 이 자리에서
   * "표가 없다"를 단언했다. 그런데 그 방식은 운영자가 기능의 모양조차 볼 수 없게 만들어
   * "목 데이터로 잘 들어가 있던 화면을 다 없앴다"는 지적을 받았다(SCRUM-308). 지금은 화면을
   * 열고 **예시임을 띠로 밝히고 쓰기를 막는** 방식이라, 고정해야 하는 계약이 뒤집혔다 —
   * 꼬리표가 붙은 항목이 남아 있지 않으니 nav 16항목 전부의 목적지에 띠가 **없어야** 한다.
   *
   * 한쪽만 단언하면 반쪽이 썩는다: 띠만 보면 실데이터 화면에 띠를 붙여도 통과하고(실데이터를
   * 예시로 의심하게 만든다), 없음만 보면 예시 화면에서 띠가 빠져도 통과한다(저장된 줄 안다).
   * 화면 내용과 쓰기 차단은 `admin-mock-screens.test.tsx`가 화면 이름으로 따로 고정한다.
   */
  const destinationsFor = (labels: readonly string[]) =>
    NAV_DESTINATIONS.filter(([label]) => labels.includes(label))

  /**
   * 아래 두 `it.each`는 **분류 배열에서 뽑은 목적지만** 돌기 때문에 스스로 자기 적용 범위를
   * 지키지 못한다. 항목을 두 배열에서 모두 빼면 그 화면의 띠 단언이 조용히 사라진다 — 테스트
   * 수만 줄고 전부 통과한다(실측: `LIVE_LABELS`에서 한 줄을 빼면 298 → 297로 줄고 실패가 없다).
   * 그러면 실연동하면서 띠를 걷지 않아도, 예시 화면에서 띠가 빠져도 아무것도 잡지 못한다.
   *
   * 실연동 작업은 항목을 한 배열에서 다른 배열로 옮기는 일이라, **옮기다 흘리는 것**이 이 파일의
   * 실제 실패 모양이다. 그래서 두 배열이 `NAV_DESTINATIONS`를 빠짐없이, 겹치지 않게 덮는지
   * 여기서 고정한다. `NAV_DESTINATIONS` 자체는 AC-ADMIN-NAV-008이 렌더된 nav와 맞춰 두므로
   * (그룹마다 항목 수까지 센다) 이 둘을 맞대면 nav에 올라온 16항목 전부가 분류를 받는다.
   */
  it('[AC-ADMIN-NAV-011] nav 목적지는 빠짐없이 실연동으로 분류된다', () => {
    const classified = [...LIVE_LABELS]
    const destinations = NAV_DESTINATIONS.map(([label]) => label)

    // 합이 nav 항목 수와 같아야 한다 — 모자라면 그 화면은 띠 단언을 아예 받지 않는다.
    expect(classified).toHaveLength(destinations.length)
    // 개수만 맞고 이름이 어긋난 것(옮기면서 라벨을 잘못 적은 것)까지 본다.
    expect([...classified].sort()).toEqual([...destinations].sort())
    // 겹쳐 적으면 길이는 맞는데 다른 화면이 빠진다.
    expect(new Set(classified).size).toBe(classified.length)
  })

  /**
   * 준비 중 항목이 하나도 없다는 것을 **직접** 단언한다. 분류 배열에 `it.each`를 걸면 배열이 빈
   * 지금 0회 돌고 통과해, 꼬리표가 되살아나도 아무것도 잡지 못한다.
   */
  it('[AC-ADMIN-NAV-004] 꼬리표가 붙은 항목도 예시 데이터 화면도 nav에 없다', async () => {
    renderAt('/')

    expect(await screen.findByRole('button', { name: '관리자 관리' })).toBeInTheDocument()
    expect(screen.queryAllByText(PENDING_TAG)).toHaveLength(0)
    expect(screen.queryByText('예시 데이터예요')).not.toBeInTheDocument()
    // nav 버튼 전부가 실연동 라벨 중 하나다(배지 숫자가 붙은 입점 심사는 접두로 맞춘다).
    const names = screen
      .getAllByRole('group')
      .flatMap(group => within(group).getAllByRole('button'))
      .map(button => button.textContent ?? '')
    expect(names).toHaveLength(LIVE_LABELS.length)
    for (const name of names) {
      expect(LIVE_LABELS.some(label => name.startsWith(label))).toBe(true)
    }
  })

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

    // 대시보드 지표는 전부 실 집계이고 그 칸들이 nav 말고 두 번째 진입점이다(routes/index.tsx).
    // 심사 대기 수는 nav 배지와 같은 queryKey를 써 이 파일에서 함께 보는 값이라 여기로 골랐다.
    // 카드 존재만 보면 onClick을 떼어도 통과한다 — 도착지까지 본다(칸별 집계 계약과 나머지 칸의
    // 목적지는 `features/dashboard/__tests__`의 AC-ADMIN-DASH-006이 본다).
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

      await user.click(await screen.findByRole('button', { name: label }))

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

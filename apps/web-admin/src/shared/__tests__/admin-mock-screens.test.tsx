import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { ADMIN_APPLICATIONS_URL, seedAdminApplications, server } from '@/testing/msw/server'

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
  return { router }
}

/**
 * 그 화면에서 **나간 요청**을 마운트 순간부터 모은다.
 *
 * MSW는 `onUnhandledRequest: 'error'`라 서버에 없는 경로로 나가면 테스트가 깨지지만, 그것만
 * 믿으면 **핸들러가 있는 경로로 잘못 나가는 쓰기**(예: 어드민 명부 POST)를 놓친다 — 그래서
 * 나간 요청을 직접 본다.
 */
function recordRequests(): string[] {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => urls.push(`${request.method} ${request.url}`))
  return urls
}

/**
 * 예시 화면에서 **유일하게 허용되는 요청** — 셸이 nav 배지를 채우려고 부르는 입점 심사 대기 수.
 *
 * "버튼을 누른 뒤에 늘어난 요청"을 보는 방식으로는 쓰기 회귀를 못 잡는다. 확인 Modal이 없는
 * 흐름(셀러 `저장`·상품 `검수 통과`)은 **액션 클릭 자체가 쓰기 실행**이라, 기준선을 그 클릭
 * 뒤에 잡으면 그 요청이 기준선에 삼켜져 단언이 영원히 통과한다(2026-10-27 실측: `handleSaveMemo`에
 * `POST /admin/admins`를 넣어도 통과했고, 확인 Modal이 있는 회원 관리에서는 같은 주입이
 * 잡혔다). 그래서 기준선을 쓰지 않고 **셸 조회 하나만 허용 목록에 두고 나머지 전부**를 본다 —
 * 타이밍에 기대지 않으므로 늦게 나가는 요청도 목록에 남는다.
 */
const isShellBadgeRead = (entry: string) => entry.startsWith(`GET ${ADMIN_APPLICATIONS_URL}?`)

const unexpectedRequests = (requests: readonly string[]) =>
  requests.filter(entry => !isShellBadgeRead(entry))

/**
 * FilterBar와 상세 Drawer의 `<select>`는 라벨이 없다(앞의 FilterSelect/DetailField가 맥락을
 * 준다) — 그래서 **그 안에 있는 옵션 이름**으로 집는다. 못 찾으면 던져서 `!`로 눌러 두지 않는다.
 */
function selectWithOption(optionName: string): HTMLElement {
  const found = screen
    .getAllByRole('combobox')
    .find(element => within(element).queryByRole('option', { name: optionName }))
  if (!found) throw new Error(`"${optionName}" 옵션을 가진 select를 찾지 못했다`)
  return found
}

const chooseOption = (select: HTMLElement, optionName: string) =>
  userEvent.setup().selectOptions(select, within(select).getByRole('option', { name: optionName }))

const MOCK_NOTICE_TITLE = '예시 데이터예요'
const NOT_SAVED = '저장되지 않아요'
/**
 * 쓰기 버튼을 눌렀을 때 뜨는 토스트 전문(`MockDataNotice`의 `MOCK_WRITE_TOAST`).
 *
 * 전문으로 단언하는 이유: 상단 띠에도 "저장되지 않아요"가 들어 있어 부분 문자열로 찾으면 띠와
 * 토스트가 함께 잡힌다 — 그러면 **토스트가 안 떠도** 띠 하나로 통과할 수 있다.
 */
const WRITE_TOAST = '예시 화면이라 저장되지 않아요. 바뀐 표시는 새로 고치면 사라져요.'

/**
 * admin 모듈에 엔드포인트가 없어 **예시 데이터로 모양만 보여주는** 4화면.
 *
 * 넷 중 '상품 검수 관리'(`/products/review`)만 **nav 입구가 없다**(SCRUM-313 — 같은 '검수'
 * 그룹에 실연동 'AI 검수 큐'가 있어 운영자가 이름이 맞는 가짜 쪽을 먼저 눌렀다). 입구가 없어도
 * URL로는 닿으므로 띠와 쓰기 차단은 그대로 필요하고, nav에 없는 탓에 `admin-nav.test.tsx`의
 * 분류(AC-ADMIN-NAV-004)에서 빠져 **이 파일이 그 화면의 유일한 띠 가드다** — SCREENS·WRITE_FLOWS에서
 * 빼면 띠가 사라져도 아무것도 깨지지 않는다.
 * (일반 회원 관리는 `/admin/members` 넷, 주문 배송 모니터링은 `/admin/orders` 넷, AI 검수 큐는
 *  `/admin/product-inspections` 넷이 생겨 빠졌고, 서비스 문의·클레임·리뷰는 2026-10-30 실측에서
 *  `/admin/inquiries`·`/admin/claims`·`/admin/reviews`가 확인돼 빠졌다. 어드민 액션 로그는
 *  2026-11-03 실측의 `GET /admin/audit-logs`로, 알림/공지 관리는 같은 날 실측의 `/admin/notices`
 *  여섯으로, 신고 제재 관리는 같은 날 실측의 `/admin/reports` 셋(목록·상세·처리)으로 빠졌다 —
 *  실연동 화면 계약은 각 feature 의 `__tests__`가 본다. 공지의 대상 필터
 *  계약(`'all'`이 실제 값인 축의 센티넬)은 여기 있던 AC-ADMIN-MOCK-007을
 *  `features/notices/__tests__`가 서버 필터 단언으로 이어 본다. 신고의 처리 조합 계약은
 *  `features/reports/__tests__`가 본다.)
 *
 * 2026-10-18(SCRUM-238)이 이 화면들의 진입을 `UnavailableScreen`으로 막았고, 2026-10-26
 * (SCRUM-302)이 nav 항목만 되살렸다. 그 상태가 "메뉴는 보이는데 눌러도 아무것도 못 본다"였고
 * "목 데이터로 잘 들어가 있던 화면을 다 없앴다"는 지적으로 되돌렸다(SCRUM-308).
 *
 * 그래서 이 파일이 고정하는 계약은 셋이다.
 * 1. 4화면이 **각각** 열리고 자기 내용을 그린다 — 개수를 세지 않고 화면 이름과 그 화면에만
 *    있는 문자열로 확인한다(개수만 세면 한 화면이 다른 화면으로 바뀌어도 통과한다).
 * 2. 4화면에 예시 데이터 띠가 있고 "저장되지 않아요"가 적혀 있다.
 * 3. 저장·제출·발송을 눌러도 **요청이 한 건도 더 나가지 않는다.** 서버에 없는 경로로 나가면
 *    운영자 화면에 500·404가 찍힌다.
 *
 * nav 꼬리표와 띠가 짝이 맞는지, 실연동 화면에 띠가 없는지는 `admin-nav.test.tsx`가 본다.
 */
const SCREENS = [
  ['대시보드', '/', '확인이 필요한 일'],
  ['셀러 관리', '/sellers', '냥이상점'],
  ['상품 검수 관리', '/products/review', '동결건조 닭가슴살 100g'],
  ['채팅 CS 모니터링', '/chat-monitoring', 'ROOM-4821'],
] as const satisfies readonly (readonly [string, string, string])[]

/** 목록 표를 그리는 화면. 대시보드만 표가 아니라 지표 카드로 내용을 보여준다. */
const TABLE_SCREENS = SCREENS.filter(([, path]) => path !== '/')

/**
 * 쓰기 버튼이 있는 화면과 그 누르는 순서. `confirm`이 있으면 확인 Modal을 거치는 액션이고,
 * `prefill`은 버튼이 잠겨 있을 때 먼저 골라야 하는 Select 옵션이다.
 *
 * **화면마다 한 흐름만 넣으면 안 된다** — 한 화면의 액션들은 각자 다른 핸들러다(셀러의
 * `handleSaveMemo`/`handleConfirmSuspend`, 상품 검수의 `handlePass`/`handleKeepBlinded`/
 * `handleConfirmStopSale`). 대표 하나만 누르면 나머지 핸들러에 요청이 들어가도 잡히지 않는다
 * (교차검토 2라운드 지적).
 */
const WRITE_FLOWS = [
  {
    screen: '셀러 관리 — 메모 저장',
    path: '/sellers',
    openRow: '냥이상점',
    action: '저장',
  },
  {
    screen: '셀러 관리 — 판매정지',
    path: '/sellers',
    openRow: '냥이상점',
    // 사유·기간이 비면 버튼이 잠긴다(빈 제재 방지) — 둘을 채워 흐름을 끝까지 본다.
    prefill: ['신고 누적', '7일 정지'],
    action: '판매정지',
    confirm: { dialog: "'냥이상점'을 판매정지할까요?", button: '판매정지' },
  },
  {
    screen: '상품 검수 관리 — 검수 통과',
    path: '/products/review',
    openRow: '동결건조 닭가슴살 100g',
    action: '검수 통과',
  },
  {
    screen: '상품 검수 관리 — 블라인드 유지',
    path: '/products/review',
    openRow: '동결건조 닭가슴살 100g',
    action: '블라인드 유지',
  },
  {
    screen: '상품 검수 관리 — 판매 중지',
    path: '/products/review',
    openRow: '동결건조 닭가슴살 100g',
    action: '판매 중지',
    // 드로어 액션과 Modal 확인 버튼이 같은 이름이라, 확인은 Modal 안으로 좁혀서 누른다.
    confirm: { dialog: '상품을 판매 중지할까요?', button: '판매 중지' },
  },
  {
    screen: '채팅 CS 모니터링',
    path: '/chat-monitoring',
    openRow: 'ROOM-4821',
    action: '운영자 개입',
    confirm: { dialog: '운영자로 대화에 들어갈까요?', button: '개입하기' },
  },
] as const

describe('어드민 예시 데이터 화면', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
  })

  it.each(SCREENS)('[AC-ADMIN-MOCK-001] %s(%s) 화면이 열리고 자기 내용을 그린다', async (
    label,
    path,
    sample,
  ) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    // 제목만 보면 안내 한 줄만 남은 화면도 통과한다 — 그 화면에만 있는 데이터로 확인한다.
    expect(await screen.findByText(sample, { exact: false })).toBeInTheDocument()
  })

  it.each(SCREENS)('[AC-ADMIN-MOCK-002] %s(%s) 화면 상단에 예시 데이터 띠가 보인다', async (
    label,
    path,
  ) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    const notice = screen.getByRole('alert')
    expect(notice).toHaveTextContent(MOCK_NOTICE_TITLE)
    // 띠가 있기만 하고 저장되지 않는다는 말이 빠지면 규약 10의 목적을 놓친다.
    expect(notice).toHaveTextContent(NOT_SAVED)
  })

  it.each(TABLE_SCREENS)('[AC-ADMIN-MOCK-003] %s(%s)은 빈 안내가 아니라 목록 표를 그린다', async (
    label,
    path,
  ) => {
    renderAt(path)

    expect(await screen.findByRole('heading', { name: label })).toBeInTheDocument()
    const table = screen.getByRole('table')
    // 머리글만 있는 빈 표는 "준비 중"이 아니라 "데이터가 없다"로 읽힌다 — 본문 행까지 확인한다.
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1)
  })

  it('[AC-ADMIN-MOCK-004] 대시보드는 표 대신 지표와 할 일 목록으로 내용을 보여준다', async () => {
    renderAt('/')

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    expect(screen.getByText('오늘 주문')).toBeInTheDocument()
    expect(screen.getByText('최근 7일 거래액')).toBeInTheDocument()
    expect(screen.getByText('확인이 필요한 일')).toBeInTheDocument()
    // 지표 여덟 칸 중 둘만 예시로 남아 꼬리표를 달고 나머지는 실 집계다(SCRUM-313) — 어느 칸이
    // 어느 쪽인지와 실패 표기는 `features/dashboard/__tests__`가 칸 이름으로 고정한다.
    expect(screen.getAllByText('예시').length).toBeGreaterThan(0)
  })

  it.each(WRITE_FLOWS.map(flow => [flow.screen, flow] as const))(
    '[AC-ADMIN-MOCK-005] %s의 쓰기 버튼을 눌러도 요청이 나가지 않고 저장되지 않는다고 알려 준다',
    async (_screen, flow) => {
      const user = userEvent.setup()
      const requests = recordRequests()
      renderAt(flow.path)

      await user.click(await screen.findByRole('button', { name: flow.openRow }))

      if ('prefill' in flow && flow.prefill) {
        for (const optionName of flow.prefill) {
          await chooseOption(selectWithOption(optionName), optionName)
        }
      }

      await user.click(await screen.findByRole('button', { name: flow.action }))

      if ('confirm' in flow && flow.confirm) {
        const dialog = await screen.findByRole('dialog', { name: flow.confirm.dialog })
        await user.click(within(dialog).getByRole('button', { name: flow.confirm.button }))
      }

      const toast = await screen.findByText(WRITE_TOAST)
      // 문구만 보면 variant를 success로 되돌려도 통과한다 — DS는 warning/error만 `role="alert"`로
      // 올리고 success는 `role="status"`라, 토스트가 alert 안에 있는지로 그 되돌림을 잡는다.
      // (띠도 alert이라 전역 `getByRole('alert')`로는 가를 수 없어 토스트에서 거슬러 올라간다.)
      expect(toast.closest('[role="alert"]')).not.toBeNull()
      // 서버에 없는 경로로 나가면 운영자 화면에 500·404가 찍히고, 핸들러가 있는 경로로 잘못
      // 나가면 남의 데이터가 바뀐다. 셸 배지 조회를 뺀 **전부**를 본다(기준선을 쓰지 않는 이유는
      // isShellBadgeRead 주석에).
      expect(unexpectedRequests(requests)).toEqual([])
    },
  )

})

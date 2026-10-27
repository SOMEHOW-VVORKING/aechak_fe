import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../routeTree.gen'
import { seedAdminApplications, server } from '@/testing/msw/server'

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
 * 그 화면으로 **나간 요청의 URL**을 모은다.
 *
 * 셸이 nav 배지를 채우려고 입점 심사 대기 수를 한 번 조회하므로 "요청이 0건"은 참이 아니다 —
 * 그래서 총 건수가 아니라 **버튼을 누른 뒤에 늘어난 요청**을 본다. MSW는 `onUnhandledRequest:
 * 'error'`라 서버에 없는 경로로 나가면 테스트가 깨지지만, 그것만 믿으면 **핸들러가 있는 경로로
 * 잘못 나가는 쓰기**(예: 어드민 명부 POST)를 놓친다.
 */
function recordRequests(): string[] {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => urls.push(`${request.method} ${request.url}`))
  return urls
}

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
 * admin 모듈에 엔드포인트가 없어 **예시 데이터로 모양만 보여주는** 13화면.
 *
 * 2026-10-18(SCRUM-238)이 이 화면들의 진입을 `UnavailableScreen`으로 막았고, 2026-10-26
 * (SCRUM-302)이 nav 항목만 되살렸다. 그 상태가 "메뉴는 보이는데 눌러도 아무것도 못 본다"였고
 * "목 데이터로 잘 들어가 있던 화면을 다 없앴다"는 지적으로 되돌렸다(SCRUM-308).
 *
 * 그래서 이 파일이 고정하는 계약은 셋이다.
 * 1. 13화면이 **각각** 열리고 자기 내용을 그린다 — 개수를 세지 않고 화면 이름과 그 화면에만
 *    있는 문자열로 확인한다(개수만 세면 한 화면이 다른 화면으로 바뀌어도 통과한다).
 * 2. 13화면에 예시 데이터 띠가 있고 "저장되지 않아요"가 적혀 있다.
 * 3. 저장·제출·발송을 눌러도 **요청이 한 건도 더 나가지 않는다.** 서버에 없는 경로로 나가면
 *    운영자 화면에 500·404가 찍힌다.
 *
 * nav 꼬리표와 띠가 짝이 맞는지, 실연동 2화면에 띠가 없는지는 `admin-nav.test.tsx`가 본다.
 */
const SCREENS = [
  ['대시보드', '/', '확인이 필요한 일'],
  ['셀러 관리', '/sellers', '냥이상점'],
  ['일반 회원 관리', '/members', 'user_28471'],
  ['상품 검수 관리', '/products/review', '동결건조 닭가슴살 100g'],
  ['AI 검수 큐', '/products/ai-queue', 'A-2931'],
  ['신고 제재 관리', '/reports', '프리미엄 관절 영양제 180정'],
  ['서비스 문의 관리', '/inquiries', '결제는 됐는데 주문 내역에 안 보여요'],
  ['주문 배송 모니터링', '/orders/monitoring', 'ORD-26102600142'],
  ['취소/반품/교환', '/claims', 'CLM-2041'],
  ['리뷰 관리', '/reviews', '저알러지 건식사료 5kg'],
  ['채팅 CS 모니터링', '/chat-monitoring', 'ROOM-4821'],
  ['알림/공지 관리', '/notices', '10월 28일 새벽 결제 시스템 점검 안내'],
  ['어드민 액션 로그', '/audit-log', '상담방 운영 개입'],
] as const satisfies readonly (readonly [string, string, string])[]

/** 목록 표를 그리는 화면. 대시보드만 표가 아니라 지표 카드로 내용을 보여준다. */
const TABLE_SCREENS = SCREENS.filter(([, path]) => path !== '/')

/**
 * 쓰기 버튼이 있는 화면과 그 누르는 순서. `confirm`이 있으면 확인 Modal을 거치는 액션이다.
 * 어드민 액션 로그는 읽기 전용이라 여기 없고, 아래에서 쓰기 버튼이 **없다는 것**을 단언한다.
 */
const WRITE_FLOWS = [
  {
    screen: '셀러 관리',
    path: '/sellers',
    openRow: '냥이상점',
    action: '저장',
  },
  {
    screen: '일반 회원 관리',
    path: '/members',
    openRow: 'user_28471',
    action: '제출',
    confirm: { dialog: '정상 상태로 되돌릴까요?', button: '정상 전환' },
  },
  {
    screen: '상품 검수 관리',
    path: '/products/review',
    openRow: '동결건조 닭가슴살 100g',
    action: '검수 통과',
  },
  {
    screen: 'AI 검수 큐',
    path: '/products/ai-queue',
    openRow: 'A-2931',
    action: '제출',
    confirm: { dialog: '검수를 승인할까요?', button: '승인' },
  },
  {
    screen: '신고 제재 관리',
    path: '/reports',
    openRow: '프리미엄 관절 영양제 180정',
    action: '제출',
    confirm: { dialog: '제재 없이 종결할까요?', button: '제재 없이 종결' },
  },
  {
    screen: '서비스 문의 관리',
    path: '/inquiries',
    // 답변이 비어 있으면 등록 버튼이 잠기므로(빈 답변 전송 방지) 답변이 있는 행을 연다.
    openRow: '카카오 로그인이 안 돼요',
    action: '답변 등록',
    confirm: { dialog: '답변을 등록할까요?', button: '답변 등록' },
  },
  {
    screen: '주문 배송 모니터링',
    path: '/orders/monitoring',
    openRow: 'ORD-26102600142',
    action: '셀러 발송 독촉',
    confirm: { dialog: '셀러에게 발송 독촉을 보낼까요?', button: '독촉 보내기' },
  },
  {
    screen: '취소/반품/교환',
    path: '/claims',
    openRow: 'CLM-2041',
    action: '제출',
    confirm: { dialog: '클레임을 불가로 종결할까요?', button: '불가 종결' },
  },
  {
    screen: '리뷰 관리',
    path: '/reviews',
    openRow: /사료 바꾸고 애가 아팠어요/,
    action: '제출',
    confirm: { dialog: '리뷰를 그대로 둘까요?', button: '노출 유지' },
  },
  {
    screen: '채팅 CS 모니터링',
    path: '/chat-monitoring',
    openRow: 'ROOM-4821',
    action: '운영자 개입',
    confirm: { dialog: '운영자로 대화에 들어갈까요?', button: '개입하기' },
  },
  {
    screen: '알림/공지 관리',
    path: '/notices',
    openRow: '10월 28일 새벽 결제 시스템 점검 안내',
    action: '게시하기',
    // 드로어 액션과 Modal 확인 버튼이 같은 이름이라, 확인은 Modal 안으로 좁혀서 누른다.
    confirm: { dialog: '공지를 게시하고 푸시를 보낼까요?', button: '게시하기' },
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
    // 심사 대기 수만 실 API 값이라 예시 지표와 구별되게 표시된다.
    expect(screen.getByText('실데이터')).toBeInTheDocument()
  })

  it.each(WRITE_FLOWS.map(flow => [flow.screen, flow] as const))(
    '[AC-ADMIN-MOCK-005] %s의 쓰기 버튼을 눌러도 요청이 나가지 않고 저장되지 않는다고 알려 준다',
    async (_screen, flow) => {
      const user = userEvent.setup()
      const requests = recordRequests()
      renderAt(flow.path)

      await user.click(await screen.findByRole('button', { name: flow.openRow }))
      await user.click(await screen.findByRole('button', { name: flow.action }))

      // 버튼을 누른 **직후**를 기준선으로 잡는다 — 셸의 배지 조회는 이미 여기 들어와 있다.
      const before = requests.length

      if ('confirm' in flow && flow.confirm) {
        const dialog = await screen.findByRole('dialog', { name: flow.confirm.dialog })
        await user.click(within(dialog).getByRole('button', { name: flow.confirm.button }))
      }

      expect(await screen.findByText(WRITE_TOAST)).toBeInTheDocument()
      // 서버에 없는 경로로 나가면 운영자 화면에 500·404가 찍힌다.
      await waitFor(() => expect(requests.slice(before)).toEqual([]))
    },
  )

  it('[AC-ADMIN-MOCK-006] 어드민 액션 로그는 읽기 전용이라 쓰기 버튼이 없다', async () => {
    renderAt('/audit-log')

    expect(await screen.findByRole('heading', { name: '어드민 액션 로그' })).toBeInTheDocument()
    for (const name of ['제출', '저장', '게시하기', '발송']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})

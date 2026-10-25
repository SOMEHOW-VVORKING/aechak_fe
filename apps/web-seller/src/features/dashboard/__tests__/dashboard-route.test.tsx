import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  dashboardSummaryRequestCount,
  lastDashboardSummaryPeriod,
  makeDashboardSummaryWire,
  resetDashboardSummaryProbe,
  seedDashboardSummary,
  seedDashboardSummaryError,
} from '@/testing/msw/server'
import { DASHBOARD_QUERY_KEY } from '../dashboard.queries'
import { routeTree } from '../../../routeTree.gen'

// 목적지 목록(주문·클레임)의 운영 진입 차단 스위치. 라우트 게이트와 대시보드가 같은 모듈을 보므로
// 여기서 한 번 흔들면 두 쪽이 함께 움직인다 — "목록이 아직 닫혀 있다"와 "열렸다"를 모두 덮으려고
// 모킹한다. vi.hoisted가 아니면 팩토리가 import보다 먼저 실행돼 holder가 TDZ에 걸린다.
const lists = vi.hoisted(() => ({ orders: false, claims: false }))
vi.mock('@/shared/serverAvailability', () => ({
  get SERVER_ORDERS_AVAILABLE() {
    return lists.orders
  },
  get SERVER_CLAIMS_AVAILABLE() {
    return lists.claims
  },
}))

// 실 API 연동 — MSW가 seller 호스트(8081)의 /sellers/me/dashboard/summary를 가로챈다. 모듈 모킹이
// 아니라 네트워크 레벨이라 URL·호스트·envelope·쿼리 파라미터까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청(= 호스트 오배치)을 곧바로 실패로 만든다.
function renderDashboard() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  // 대시보드 쿼리는 자체 retry(4xx 제외)를 선언하므로 여기 retry:false가 그 쿼리를 덮지 않는다 —
  // 5xx 재시도가 실제로 한 번 나가고, retryDelay를 0으로 둬서 그 한 번이 즉시 끝난다.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

// 누를 수 있는 카드는 MetricCard가 role="button"으로 렌더한다 — 클래스가 아니라 역할·이름으로 찾는다.
// 라벨 뒤에 값이 붙으므로 `^라벨 `로 묶는다 — 묶지 않으면 "발송 대기"가 "재발송 대기"에도 걸린다.
const cardOf = (label: string) => screen.findByRole('button', { name: new RegExp(`^${label} `) })

beforeEach(() => {
  seedDashboardSummary()
  resetDashboardSummaryProbe()
  // 기본값은 실제 앱과 같다 — 두 목록 화면 모두 아직 목업 차단 상태다.
  lists.orders = false
  lists.claims = false
})

describe('셀러 대시보드 실 연동', () => {
  it('[AC-SELLER-DASH-002] 처리 대기 10지표를 서버 값 그대로 그린다', async () => {
    // 지표 값은 목록 개방과 무관하지만, 목록이 열려 있으면 카드가 role=button이라 접근성 이름으로
    // "어느 라벨의 숫자인지"를 함께 묶어 볼 수 있다 — 라벨과 값이 어긋나면 이름이 달라진다.
    lists.orders = true
    lists.claims = true
    renderDashboard()

    // 승인 이후 세 지표가 각각 자기 숫자를 갖는다 — 서버가 단계를 나눠 센 이유가 화면에 남는다.
    expect(await screen.findByText('회수 송장 등록 대기')).toBeInTheDocument()
    expect(await screen.findByText('회수 완료 처리 대기')).toBeInTheDocument()
    expect(await screen.findByText('재발송 대기')).toBeInTheDocument()

    // 라벨 바로 뒤 숫자를 고정한다(`toHaveTextContent('7')`은 17도 통과하므로 쓰지 않는다).
    // 값은 지표마다 다르게 심어 둬서 화면이 키를 뒤섞어 꽂으면 여기서 드러난다.
    const cardWithValue = (label: string, value: string) =>
      screen.findByRole('button', { name: new RegExp(`^${label} ${value}(\\s|$)`) })
    expect(await cardWithValue('회수 송장 등록 대기', '9')).toBeInTheDocument()
    expect(await cardWithValue('회수 완료 처리 대기', '8')).toBeInTheDocument()
    expect(await cardWithValue('재발송 대기', '11')).toBeInTheDocument()
    expect(await cardWithValue('신규 주문', '7')).toBeInTheDocument()
    expect(await cardWithValue('발송 지연', '2')).toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-001] 기간을 고르면 그 값이 서버 period 파라미터로 나간다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    // 전체 기간은 파라미터 자체를 보내지 않는다(서버 기본값과 같은 요청으로 맞춘다).
    expect(lastDashboardSummaryPeriod()).toBeNull()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '기간' }), '7d')

    await waitFor(() => expect(lastDashboardSummaryPeriod()).toBe('7d'))
  })

  it('[AC-SELLER-DASH-006] 직전 기간 값을 증감률이 아니라 묵은 건수로 설명한다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    // 전체 기간에는 비교할 직전 구간이 없어 문구 자체가 없다.
    expect(screen.queryByText(/직전/)).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '기간' }), '7d')

    expect(await screen.findByText('직전 7일 주문분 중 2건 남음')).toBeInTheDocument()
    expect(await screen.findByText('직전 7일 요청분 중 4건 남음')).toBeInTheDocument()
    // 발송 지연은 직전 구간에 남은 건이 없다 — 0건이 아니라 모두 처리됐다고 적는다.
    expect(await screen.findByText('직전 7일 주문분은 남지 않았어요')).toBeInTheDocument()
    // 비율·화살표로 증감을 말하지 않는다.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-003] 목록이 아직 준비 중이면 카드를 누를 수 없고 그렇게 안내한다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    // 누르면 "준비 중" 화면만 나오는 죽은 진입점을 만들지 않는다 — 숫자는 그대로 보여주되
    // 카드를 버튼으로 올리지 않는다(role=button이 아예 없다).
    expect(screen.queryByRole('button', { name: /신규 주문/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /회수 송장 등록 대기/ })).not.toBeInTheDocument()
    expect(screen.getByText(/목록 화면이 준비되면/)).toBeInTheDocument()
    expect(screen.queryByText(/카드를 누르면 그 단계의 목록이 열려요/)).not.toBeInTheDocument()

    // 목록으로 넘어갈 수 없는 동안은 두 화면의 숫자가 어긋날 일도 없어 그 경고를 띄우지 않는다.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '기간' }), '7d')
    await screen.findByText('직전 7일 주문분 중 2건 남음')
    expect(screen.queryByText(/목록이 카드보다 많이 보일 수 있어요/)).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-004] 집계할 수 없는 지표는 0건이 아니라 준비 중으로 보이고 누를 수 없다', async () => {
    renderDashboard()

    expect(await screen.findByText('미응답 문의')).toBeInTheDocument()
    // 0을 그냥 쓰면 "문의가 없다"와 "집계할 수 없다"가 구분되지 않는다 — 숫자 자리를 비우고 사유를 쓴다.
    expect(screen.getByText('집계 준비 중')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    // 목적지가 없어 누를 수 없다(장식 클릭 금지).
    expect(screen.queryByRole('button', { name: /미응답 문의/ })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-004] 목적지가 있는 지표도 집계 불가면 누를 수 없다', async () => {
    // 목록이 열려 있어도 막힌다 — 누를 수 없는 이유가 "목적지 없음"이 아니라 supported=false임을 가린다.
    lists.orders = true
    lists.claims = true
    seedDashboardSummary(
      makeDashboardSummaryWire({
        metrics: { newOrders: { value: 0, previousValue: null, supported: false } },
      }),
    )
    renderDashboard()

    expect(await screen.findByText('신규 주문')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /신규 주문/ })).not.toBeInTheDocument()
    // 집계 불가 안내는 미응답 문의와 신규 주문 둘이다.
    expect(screen.getAllByText('집계 준비 중')).toHaveLength(2)
    // 다른 지표는 그대로 눌린다 — 전체가 막힌 것이 아님을 확인한다.
    expect(await cardOf('발송 대기')).toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-005] 조회 실패는 빈 상태가 아니라 오류로 드러난다', async () => {
    seedDashboardSummaryError({ status: 500, errorCode: 90000, message: '서버 오류가 발생했습니다.' })
    renderDashboard()

    expect(await screen.findByText(/집계를 불러오지 못했어요/)).toBeInTheDocument()
    // 실패를 0건으로 위장하지 않는다.
    expect(screen.queryByText('신규 주문')).not.toBeInTheDocument()
    // 5xx는 잠깐의 실패일 수 있어 한 번 더 보낸다(그 뒤 오류 화면).
    expect(dashboardSummaryRequestCount()).toBe(2)
  })

  it('[AC-SELLER-DASH-005] 자격 없는 셀러(403)는 재시도 없이 접근 불가로 안내한다', async () => {
    seedDashboardSummaryError({
      status: 403,
      errorCode: 10003,
      message: '셀러센터를 조회할 권한이 없습니다.',
    })
    renderDashboard()

    expect(await screen.findByText('셀러센터를 열 수 없어요')).toBeInTheDocument()
    // 다시 보내도 같은 답이라 재시도 버튼을 주지 않는다(영원히 실패하는 버튼).
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument()
    // 네트워크 실패 문구로 뭉개지 않는다 — 셀러가 할 일이 다르다.
    expect(screen.queryByText(/집계를 불러오지 못했어요/)).not.toBeInTheDocument()
    // 기간 필터도 뜻이 없다(어떤 기간을 골라도 같은 403).
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    // 4xx는 자동 재시도하지 않는다 — 클릭 한 번 없이 두 번 나가면 안 된다.
    expect(dashboardSummaryRequestCount()).toBe(1)
  })

  it('[AC-SELLER-DASH-005] 재조회만 실패하면 숫자를 지우지 않고 방금 것이 아님을 밝힌다', async () => {
    const { queryClient } = renderDashboard()
    await screen.findByText('신규 주문')

    seedDashboardSummaryError()
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: DASHBOARD_QUERY_KEY })
    })

    expect(
      await screen.findByText(/직전에 받은 숫자를 보여주고 있어요/),
    ).toBeInTheDocument()
    // 이미 그린 카드를 백지로 만들지 않는다.
    expect(screen.getByText('신규 주문')).toBeInTheDocument()
    // 첫 조회 실패 안내와 겹쳐 두 번 뜨지 않는다.
    expect(screen.queryByText('집계를 불러오지 못했어요')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-005] 재조회가 403이면 직전 숫자를 남기지 않고 접근 불가로 바꾼다', async () => {
    const { queryClient } = renderDashboard()
    await screen.findByText('신규 주문')

    // 보던 중에 셀러 자격이 정지된 경우. 직전 숫자를 "방금 못 불러왔다"와 함께 남겨 두면
    // 권한이 아직 있는 것처럼 읽힌다 — 캐시가 있어도 접근 불가 안내가 이긴다.
    seedDashboardSummaryError({
      status: 403,
      errorCode: 10003,
      message: '셀러센터를 조회할 권한이 없습니다.',
    })
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: DASHBOARD_QUERY_KEY })
    })

    expect(await screen.findByText('셀러센터를 열 수 없어요')).toBeInTheDocument()
    expect(screen.queryByText('신규 주문')).not.toBeInTheDocument()
    expect(screen.queryByText(/직전에 받은 숫자를 보여주고 있어요/)).not.toBeInTheDocument()
  })

  it('정산 요약과 상품 상태는 기간과 무관한 스냅샷임을 라벨이 밝힌다', async () => {
    seedDashboardSummary(
      makeDashboardSummaryWire({
        settlement: { totalAmount: 360_000, pendingAmount: 312_000, onHoldAmount: 48_000 },
      }),
    )
    renderDashboard()

    expect(await screen.findByRole('heading', { name: '지금 기준 스냅샷' })).toBeInTheDocument()
    expect(screen.getByText('기간 필터를 따르지 않아요. 기간을 바꿔도 이 값은 그대로예요.')).toBeInTheDocument()
    expect(screen.getByText('정산 예정 금액')).toBeInTheDocument()
    expect(screen.getByText('상품 상태')).toBeInTheDocument()
    expect(screen.getByText('360,000원')).toBeInTheDocument()
    expect(screen.getByText(/판매 중지 상품이 품절이면 두 칸에 함께 집계돼요/)).toBeInTheDocument()
  })
})

// 목적지 두 화면이 실서버에 붙어 게이트가 열린 뒤의 동선. 카드 → 목록 배선은 그때 살아난다.
describe('목록이 열린 뒤 카드 → 목록 동선', () => {
  beforeEach(() => {
    lists.orders = true
    lists.claims = true
  })

  it('[AC-SELLER-DASH-003] 클레임 카드는 단계 축만 싣고 기간은 싣지 않는다', async () => {
    const { router } = renderDashboard()
    await screen.findByText('회수 송장 등록 대기')

    // 기간을 고른 상태에서 눌러도 목적지에 기간이 실리지 않아야 한다.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '기간' }), '7d')
    await screen.findByText(/목록이 카드보다 많이 보일 수 있어요/)

    await userEvent.click(await cardOf('회수 송장 등록 대기'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/claims'))
    expect(router.state.location.searchStr).toContain('pendingStage=COLLECTION_INVOICE_PENDING')
    expect(router.state.location.searchStr).not.toMatch(/period|requestedFrom|requestedTo/)
  })

  it('[AC-SELLER-DASH-003] 반품 요청 카드는 단계와 유형을 함께 싣는다', async () => {
    const { router } = renderDashboard()
    await userEvent.click(await cardOf('반품 요청'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/claims'))
    expect(router.state.location.searchStr).toContain('pendingStage=DECISION_PENDING')
    expect(router.state.location.searchStr).toContain('claimType=RETURN')
  })

  it('[AC-SELLER-DASH-003] 주문 카드는 상태 세그먼트를 싣고 주문 목록으로 넘어간다', async () => {
    const { router } = renderDashboard()
    await userEvent.click(await cardOf('신규 주문'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'))
    expect(router.state.location.searchStr).toContain('status=new')
    expect(router.state.location.searchStr).not.toMatch(/orderedFrom|orderedTo|period/)
  })

  it('[AC-SELLER-DASH-001] 기간을 고르면 목록이 더 넓게 잡힐 수 있다고 미리 알린다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    expect(screen.getByText(/카드를 누르면 그 단계의 목록이 열려요/)).toBeInTheDocument()
    expect(screen.queryByText(/목록이 카드보다 많이 보일 수 있어요/)).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '기간' }), '30d')

    expect(await screen.findByText(/목록이 카드보다 많이 보일 수 있어요/)).toBeInTheDocument()
  })
})

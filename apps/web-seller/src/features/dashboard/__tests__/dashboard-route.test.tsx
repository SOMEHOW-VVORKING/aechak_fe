import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  lastDashboardSummaryPeriod,
  makeDashboardSummaryWire,
  resetDashboardSummaryPeriod,
  seedDashboardSummary,
  seedDashboardSummaryError,
} from '@/testing/msw/server'
import { DASHBOARD_QUERY_KEY } from '../dashboard.queries'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081)의 /sellers/me/dashboard/summary를 가로챈다. 모듈 모킹이
// 아니라 네트워크 레벨이라 URL·호스트·envelope·쿼리 파라미터까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청(= 호스트 오배치)을 곧바로 실패로 만든다.
function renderDashboard() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}

// 누를 수 있는 카드는 MetricCard가 role="button"으로 렌더한다 — 클래스가 아니라 역할·이름으로 찾는다.
const cardOf = (label: string) => screen.findByRole('button', { name: new RegExp(label) })

beforeEach(() => {
  seedDashboardSummary()
  resetDashboardSummaryPeriod()
})

describe('셀러 대시보드 실 연동', () => {
  it('[AC-SELLER-DASH-002] 처리 대기 10지표를 서버 값 그대로 그린다', async () => {
    renderDashboard()

    // 승인 이후 세 지표가 각각 자기 숫자를 갖는다 — 서버가 단계를 나눠 센 이유가 화면에 남는다.
    expect(await screen.findByText('회수 송장 등록 대기')).toBeInTheDocument()
    expect(await screen.findByText('회수 완료 처리 대기')).toBeInTheDocument()
    expect(await screen.findByText('재발송 대기')).toBeInTheDocument()

    expect(await cardOf('회수 송장 등록 대기')).toHaveTextContent('9')
    expect(await cardOf('회수 완료 처리 대기')).toHaveTextContent('8')
    expect(await cardOf('재발송 대기')).toHaveTextContent('11')
    expect(await cardOf('신규 주문')).toHaveTextContent('7')
    expect(await cardOf('발송 지연')).toHaveTextContent('2')
  })

  it('[AC-SELLER-DASH-001] 기간을 고르면 그 값이 서버 period 파라미터로 나간다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    // 전체 기간은 파라미터 자체를 보내지 않는다(서버 기본값과 같은 요청으로 맞춘다).
    expect(lastDashboardSummaryPeriod()).toBeNull()

    await userEvent.selectOptions(screen.getByRole('combobox'), '7d')

    await waitFor(() => expect(lastDashboardSummaryPeriod()).toBe('7d'))
  })

  it('[AC-SELLER-DASH-006] 직전 기간 값을 증감률이 아니라 묵은 건수로 설명한다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    // 전체 기간에는 비교할 직전 구간이 없어 문구 자체가 없다.
    expect(screen.queryByText(/직전/)).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox'), '7d')

    expect(await screen.findByText('직전 7일 주문분 중 2건 남음')).toBeInTheDocument()
    expect(await screen.findByText('직전 7일 요청분 중 4건 남음')).toBeInTheDocument()
    // 발송 지연은 직전 구간에 남은 건이 없다 — 0건이 아니라 모두 처리됐다고 적는다.
    expect(await screen.findByText('직전 7일 주문분은 남지 않았어요')).toBeInTheDocument()
    // 비율·화살표로 증감을 말하지 않는다.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-001] 기간을 고르면 목록이 더 넓게 잡힐 수 있다고 미리 알린다', async () => {
    renderDashboard()
    await screen.findByText('신규 주문')

    expect(
      screen.queryByText(/목록이 카드보다 많이 보일 수 있어요/),
    ).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox'), '30d')

    expect(await screen.findByText(/목록이 카드보다 많이 보일 수 있어요/)).toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-003] 클레임 카드는 단계 축만 싣고 기간은 싣지 않는다', async () => {
    const { router } = renderDashboard()
    await screen.findByText('회수 송장 등록 대기')

    // 기간을 고른 상태에서 눌러도 목적지에 기간이 실리지 않아야 한다.
    await userEvent.selectOptions(screen.getByRole('combobox'), '7d')
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

  it('[AC-SELLER-DASH-004] 집계할 수 없는 지표는 0건이 아니라 준비 중으로 보이고 누를 수 없다', async () => {
    renderDashboard()

    expect(await screen.findByText('미응답 문의')).toBeInTheDocument()
    // 0을 그냥 쓰면 "문의가 없다"와 "집계할 수 없다"가 구분되지 않는다 — 숫자 자리를 비우고 사유를 쓴다.
    expect(screen.getByText('집계 준비 중')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    // 목적지가 없어 누를 수 없다(장식 클릭 금지).
    expect(screen.queryByRole('button', { name: /미응답 문의/ })).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-005] 조회 실패는 빈 상태가 아니라 오류로 드러난다', async () => {
    seedDashboardSummaryError({ status: 500, errorCode: 90000, message: '서버 오류가 발생했습니다.' })
    renderDashboard()

    expect(await screen.findByText(/집계를 불러오지 못했어요/)).toBeInTheDocument()
    // 실패를 0건으로 위장하지 않는다.
    expect(screen.queryByText('신규 주문')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-DASH-005] 자격 없는 셀러(403)도 같은 오류 안내로 떨어진다', async () => {
    seedDashboardSummaryError({
      status: 403,
      errorCode: 10003,
      message: '셀러센터를 이용할 수 없는 상태입니다.',
    })
    renderDashboard()

    expect(await screen.findByText(/집계를 불러오지 못했어요/)).toBeInTheDocument()
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
    expect(screen.getByText(/판매 중지 상품이 품절이면 두 칸에 함께 세요/)).toBeInTheDocument()
  })
})

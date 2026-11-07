import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import { toKstDateParam } from '@/features/order-monitoring'
import {
  ADMIN_APPLICATIONS_URL,
  ADMIN_CLAIMS_URL,
  ADMIN_INQUIRIES_URL,
  ADMIN_ORDER_METRICS_URL,
  ADMIN_PRODUCT_INSPECTIONS_URL,
  ADMIN_REPORTS_URL,
  makeAdminApplicationWire,
  makeAdminClaimWire,
  makeAdminInquiryWire,
  makeAdminOrderWire,
  makeAdminProductInspectionWire,
  makeAdminReportWire,
  seedAdminApplications,
  seedAdminClaims,
  seedAdminInquiries,
  seedAdminOrders,
  seedAdminProductInspections,
  seedAdminReports,
  server,
} from '@/testing/msw/server'

function renderDashboard() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
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

/** 첫 화면에서 나간 요청을 마운트 순간부터 모은다 — 중복 조회는 "요청 건수"로만 드러난다. */
function recordRequests(): string[] {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => urls.push(`${request.method} ${request.url}`))
  return urls
}

/**
 * 지표 칸 하나를 라벨로 집어 값을 읽는다.
 *
 * `MetricCard`는 라벨과 값을 같은 카드 안의 형제 div로 그려 라벨만으로는 값에 닿지 못한다 —
 * 라벨 노드에서 카드까지 거슬러 올라가 그 안의 텍스트를 본다. 값만 전역에서 찾으면(`0건`이
 * 여러 칸에 있다) 어느 칸의 숫자인지 말할 수 없어 칸이 뒤바뀐 회귀가 통과한다.
 */
function metricCard(label: string): HTMLElement {
  const card = screen
    .getAllByText(label)
    // 같은 라벨이 할 일 목록에도 있다(카드와 줄이 같은 집계를 쓰므로 그게 정상이다) — 줄을 뺀다.
    .filter(node => node.closest('li') == null)
    .map(node => node.closest('div.rounded-card'))
    .find((element): element is HTMLElement => element != null)
  if (!card) throw new Error(`"${label}" 지표 칸을 찾지 못했다`)
  return card
}

/**
 * 할 일 목록의 한 줄. 카드와 줄의 라벨이 같아(같은 집계를 쓰므로) 라벨만으로는 가릴 수 없다 —
 * 줄은 `<li>` 안에 있다는 구조로 가른다.
 */
function todoRow(label: string): HTMLElement {
  const row = screen
    .getAllByText(label)
    .map(node => node.closest('li'))
    .find((element): element is HTMLLIElement => element != null)
  if (!row) throw new Error(`"${label}" 할 일 줄을 찾지 못했다`)
  return within(row).getByRole('button')
}

const TODAY = toKstDateParam(new Date())

const pendingInspections = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeAdminProductInspectionWire({
      productId: `01JQUEUEPRODUCT0000000000${index}`,
      productName: `검수 대기 상품 ${index}`,
      status: 'PENDING_REVIEW',
    }),
  )

const receivedInquiries = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeAdminInquiryWire({ inquiryId: 9000 + index, status: 'RECEIVED' }),
  )

const receivedReports = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeAdminReportWire({ reportId: 100 + index, status: 'RECEIVED' }),
  )

const openClaims = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    makeAdminClaimWire({ claimPublicId: `01HZXC000000000000000000${index}` }),
  )

/**
 * 대시보드는 어드민의 첫 화면이고 로그인 복귀 지점이다. 2026-11-03(SCRUM-313)까지 지표 여덟 칸
 * 중 일곱이 `예시` 꼬리표를 달고 있었고, 할 일 목록은 꼬리표 없이 지어낸 숫자로 실연동 화면으로
 * 보냈다 — 운영자가 그 숫자를 할 일로 읽고 들어가면 화면의 숫자가 달랐다.
 *
 * 그래서 이 파일이 고정하는 계약은 넷이다.
 * 1. 실 집계 칸은 **`totalCount`로** 센다(목록 길이로 세면 `size=1` 조회에서 늘 1이다).
 * 2. 조회 실패·권한 없음은 **0이 아니라 줄표 + 사유**다.
 * 3. 할 일 줄은 **카드와 같은 집계**를 쓰고, 그 수를 실제로 보여주는 화면으로 보낸다.
 * 4. 못 채운 칸은 **꼬리표를 유지**한다(떼면 거짓이 된다).
 */
describe('어드민 대시보드 지표', () => {
  beforeEach(() => {
    seedAdminApplications([
      makeAdminApplicationWire({ applicationId: 11, status: 'SUBMITTED' }),
      makeAdminApplicationWire({ applicationId: 12, status: 'SUBMITTED' }),
      makeAdminApplicationWire({ applicationId: 13, status: 'APPROVED' }),
    ])
    seedAdminProductInspections([
      ...pendingInspections(3),
      makeAdminProductInspectionWire({ productId: '01JQUEUEPRODUCTAPPROVED001', status: 'APPROVED' }),
    ])
    seedAdminReports([
      ...receivedReports(2),
      makeAdminReportWire({ reportId: 200, status: 'SANCTIONED' }),
    ])
    seedAdminInquiries([
      ...receivedInquiries(4),
      makeAdminInquiryWire({ inquiryId: 9900, status: 'DONE', answer: '처리했어요.' }),
    ])
    seedAdminClaims(openClaims(5))
    seedAdminOrders([
      makeAdminOrderWire({
        orderId: '01HZXK0000000000000000T01',
        orderedAt: `${TODAY}T10:00:00`,
        payableAmount: 73_000,
      }),
      makeAdminOrderWire({
        orderId: '01HZXK0000000000000000T02',
        orderedAt: `${TODAY}T11:30:00`,
        payableAmount: 27_000,
      }),
      // 어제 이전 주문. 날짜 필터를 보내지 않으면 이 금액까지 `오늘 거래액`에 들어간다.
      makeAdminOrderWire({
        orderId: '01HZXK0000000000000000Y01',
        orderedAt: '2026-10-26T21:31:00',
        payableAmount: 900_000,
      }),
    ])
  })

  it('[AC-ADMIN-DASH-001] 실 집계 칸은 1건짜리 조회의 totalCount로 전체 수를 그린다', async () => {
    const requests = recordRequests()
    renderDashboard()

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()

    // 셋·둘·넷·다섯은 모두 1보다 크다 — 목록 길이로 셌다면 전부 `1건`이 된다.
    await waitFor(() => expect(metricCard('검수 대기 상품')).toHaveTextContent('3건'))
    expect(metricCard('미처리 신고')).toHaveTextContent('2건')
    expect(metricCard('답변 대기 문의')).toHaveTextContent('4건')
    expect(metricCard('진행 중 클레임')).toHaveTextContent('5건')
    expect(metricCard('셀러 입점 심사 대기')).toHaveTextContent('2건')

    // 건수 조회는 행을 쓰지 않으므로 1건만 받는다(첫 화면에서 네 목록을 통째로 받지 않는다).
    for (const url of [
      ADMIN_PRODUCT_INSPECTIONS_URL,
      ADMIN_REPORTS_URL,
      ADMIN_INQUIRIES_URL,
      ADMIN_CLAIMS_URL,
    ]) {
      const sent = requests.find(entry => entry.includes(`${url}?`))
      expect(sent, `${url} 조회가 나가지 않았다`).toBeDefined()
      expect(sent).toContain('size=1')
    }
  })

  it('[AC-ADMIN-DASH-002] 상태 필터로 좁혀 세고 처리가 끝난 건은 세지 않는다', async () => {
    const requests = recordRequests()
    renderDashboard()

    await waitFor(() => expect(metricCard('검수 대기 상품')).toHaveTextContent('3건'))

    // 상태를 보내지 않으면 승인·답변 완료·종결까지 섞여 각각 4건·3건·5건이 된다.
    const sentTo = (url: string) => requests.find(entry => entry.includes(`${url}?`)) ?? ''
    expect(sentTo(ADMIN_PRODUCT_INSPECTIONS_URL)).toContain('status=PENDING_REVIEW')
    expect(sentTo(ADMIN_REPORTS_URL)).toContain('status=RECEIVED')
    expect(sentTo(ADMIN_INQUIRIES_URL)).toContain('status=RECEIVED')
    // 클레임은 상태 열거가 아니라 작업 범위 축이다 — 생략하면 서버 암묵 규칙에 맡기게 된다.
    expect(sentTo(ADMIN_CLAIMS_URL)).toContain('openOnly=true')
  })

  it('[AC-ADMIN-DASH-003] 오늘 거래액은 오늘 주문일로 좁혀 받은 금액만 그린다', async () => {
    const requests = recordRequests()
    renderDashboard()

    // 오늘 주문 둘만 더한 값. 날짜 필터가 빠지면 어제 주문 900,000원까지 들어가 1,000,000원이 된다.
    await waitFor(() => expect(metricCard('오늘 거래액')).toHaveTextContent('100,000원'))

    const sent = requests.find(entry => entry.includes(`${ADMIN_ORDER_METRICS_URL}?`)) ?? ''
    // LocalDate 꼴이어야 한다 — date-time을 보내면 서버 바인딩이 400으로 끊는다.
    expect(sent).toContain(`orderedFrom=${TODAY}`)
    expect(sent).toContain(`orderedTo=${TODAY}`)
    expect(TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 쿼리 키에 날짜 파라미터 객체를 매 렌더 새로 만들어 싣는다 — react-query가 키를 구조로
    // 해싱하지 않는다면 그 자리가 렌더마다 재조회하는 자리다.
    expect(requests.filter(entry => entry.includes(`${ADMIN_ORDER_METRICS_URL}?`))).toHaveLength(1)
  })

  it('[AC-ADMIN-DASH-004] 조회가 실패하면 0이 아니라 줄표와 사유를 보여준다', async () => {
    // 어드민 권한이 없으면 LIVE 경로가 전부 403이다 — 그때 `0건`을 그리면 운영자는 "할 일이 없다"로
    // 읽고 쌓인 신고·문의·클레임을 그대로 둔다.
    server.use(
      ...[
        ADMIN_PRODUCT_INSPECTIONS_URL,
        ADMIN_REPORTS_URL,
        ADMIN_INQUIRIES_URL,
        ADMIN_CLAIMS_URL,
        ADMIN_ORDER_METRICS_URL,
        ADMIN_APPLICATIONS_URL,
      ].map(url =>
        http.get(url, () =>
          HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
        ),
      ),
    )

    renderDashboard()

    await waitFor(() => expect(metricCard('검수 대기 상품')).toHaveTextContent('—'))
    expect(metricCard('검수 대기 상품')).not.toHaveTextContent('0건')
    expect(metricCard('미처리 신고')).toHaveTextContent('—')
    expect(metricCard('답변 대기 문의')).toHaveTextContent('—')
    expect(metricCard('진행 중 클레임')).toHaveTextContent('—')
    expect(metricCard('오늘 거래액')).toHaveTextContent('—')
    // 이 칸만 `useMetricValue`가 아니라 `usePendingApplicationCount`가 채운다(nav 배지와 queryKey를
    // 공유해야 해서 자기 코드를 들고 있다) — 같은 판정을 **이 칸에서도** 단언한다. 그 훅의 실패
    // 판정(`if (query.isError) return null` + `?? null`)을 `?? 0`만 남기게 되돌리면 이 칸이
    // `0건`을 그리는데, 그걸 잡던 단언은 nav **배지**를 보는 AC-ADMIN-NAV-007 하나뿐이었다
    // (실측: 이 줄 없이 그 되돌림을 넣으면 이 파일 10건이 전부 통과하고 nav 파일만 깨졌다).
    // 배지는 0을 아예 그리지 않아 배지만 고쳐도 카드는 거짓을 그대로 그린다.
    expect(metricCard('셀러 입점 심사 대기')).toHaveTextContent('—')
    expect(metricCard('셀러 입점 심사 대기')).not.toHaveTextContent('0건')
    // 줄표만 있으면 운영자는 "0"인지 "못 받았는지"를 모른다 — 띠가 사유를 적는다.
    expect(screen.getByRole('alert')).toHaveTextContent('권한이 없거나 조회가 실패')
    // 할 일 줄도 같은 판정을 쓴다(0건으로 접히면 목록이 "할 일 없음"으로 보인다).
    expect(todoRow('미처리 신고')).toHaveTextContent('—')
  })

  it('[AC-ADMIN-DASH-005] 재조회가 실패하면 옛 숫자를 남기지 않고 줄표로 바뀐다', async () => {
    const { queryClient } = renderDashboard()
    await waitFor(() => expect(metricCard('미처리 신고')).toHaveTextContent('2건'))

    // 권한이 끊긴 뒤(403/20011) 재조회가 실패해도 react-query는 캐시된 숫자를 그대로 들고 있다 —
    // 그걸 돌려주면 카드가 서버에 없는 건수를 가리킨다(nav 배지와 같은 판단).
    server.use(
      http.get(ADMIN_REPORTS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await act(async () => {
      await queryClient.refetchQueries()
    })

    await waitFor(() => expect(metricCard('미처리 신고')).toHaveTextContent('—'))
    expect(metricCard('미처리 신고')).not.toHaveTextContent('2건')
    // 같은 집계를 쓰는 할 일 줄도 함께 비어야 한다.
    expect(todoRow('미처리 신고')).toHaveTextContent('—')
  })

  it('[AC-ADMIN-DASH-006] 할 일 줄은 카드와 같은 집계를 쓰고 그 수를 보여주는 화면으로 보낸다', async () => {
    const user = userEvent.setup()
    const { router } = renderDashboard()

    await waitFor(() => expect(todoRow('답변 대기 문의')).toHaveTextContent('4건'))
    // 카드와 줄이 같은 수다 — 다르면 운영자가 들어간 화면에서 어긋난 숫자를 본다.
    expect(metricCard('답변 대기 문의')).toHaveTextContent('4건')
    expect(todoRow('미처리 신고')).toHaveTextContent('2건')
    expect(todoRow('진행 중 클레임')).toHaveTextContent('5건')
    expect(todoRow('검수 대기 상품')).toHaveTextContent('3건')

    await user.click(todoRow('답변 대기 문의'))

    await waitFor(() => expect(router.state.location.pathname).toBe('/inquiries'))
    expect(await screen.findByRole('heading', { name: '서비스 문의 관리' })).toBeInTheDocument()
  })

  /**
   * '검수 대기 상품'의 진입점은 **둘**이다 — 지표 칸과 할 일 줄. 한쪽만 누르면 다른 쪽이
   * 상품 카탈로그 관리(`/products/catalog`, 옛 `/products/review`가 지금 보내는 곳)를 가리키게
   * 돌아가도 아무것도 깨지지 않는다(실측: 할 일 줄의 `to`만 그 경로로 되돌려도 이 파일 전체가
   * 통과했다). 그 화면도 2026-11-05에 실연동됐지만(SCRUM-363) **모수가 다르다** — 카탈로그는
   * 전수 상품이고 이 숫자는 관리자 확인이 남은 행만 센 큐의 `totalCount`라, 거기로 보내면
   * 운영자가 3건을 찾다가 수백 행을 뒤진다.
   */
  const INSPECTION_ENTRIES = [
    ['지표 칸', () => metricCard('검수 대기 상품')],
    ['할 일 줄', () => todoRow('검수 대기 상품')],
  ] as const satisfies readonly (readonly [string, () => HTMLElement])[]

  it.each(INSPECTION_ENTRIES)(
    '[AC-ADMIN-DASH-007] 검수 대기 %s은 그 수를 보여주는 AI 검수 큐로 보낸다',
    async (_entry, open) => {
      const user = userEvent.setup()
      const { router } = renderDashboard()

      await waitFor(() => expect(metricCard('검수 대기 상품')).toHaveTextContent('3건'))
      // 카탈로그(`/products/catalog`)로 보내면 이 숫자와 모수가 다른 전수 목록에 떨어진다.
      await user.click(open())

      await waitFor(() => expect(router.state.location.pathname).toBe('/products/ai-queue'))
      expect(await screen.findByRole('heading', { name: 'AI 검수 큐' })).toBeInTheDocument()
    },
  )

  it('[AC-ADMIN-DASH-008] 집계 경로가 없는 칸만 예시 꼬리표를 유지한다', async () => {
    renderDashboard()

    expect(await screen.findByRole('heading', { name: '대시보드' })).toBeInTheDocument()

    // 서버에 셀 방법이 없는 둘. 꼬리표를 떼면 지어낸 숫자가 실 집계처럼 보인다.
    expect(metricCard('오늘 주문')).toHaveTextContent('예시')
    expect(metricCard('정산 예정액')).toHaveTextContent('예시')
    // 채워진 칸에서는 뗀다 — 남겨 두면 실데이터를 예시로 의심하게 만들어 거꾸로 속인다.
    await waitFor(() => expect(metricCard('오늘 거래액')).toHaveTextContent('100,000원'))
    for (const label of [
      '오늘 거래액',
      '검수 대기 상품',
      '미처리 신고',
      '답변 대기 문의',
      '진행 중 클레임',
      '셀러 입점 심사 대기',
    ]) {
      expect(metricCard(label)).not.toHaveTextContent('예시')
    }
    // 집계가 없는 할 일 줄은 꼬리표를 달고 남는다(채팅은 BE에 경로 자체가 없다).
    expect(todoRow('위험 신호 채팅방')).toHaveTextContent('예시')
    expect(todoRow('진행 중 클레임')).not.toHaveTextContent('예시')
  })

  it('[AC-ADMIN-DASH-009] 입점 심사 대기 수는 nav 배지와 같은 키라 조회가 한 번만 나간다', async () => {
    const requests = recordRequests()
    renderDashboard()

    await waitFor(() => expect(metricCard('셀러 입점 심사 대기')).toHaveTextContent('2건'))
    // 셸의 배지와 카드가 같은 queryKey를 보므로 요청이 겹치지 않는다. 키가 갈리면 첫 화면에서
    // 같은 경로를 두 번 부른다.
    const applicationReads = requests.filter(entry => entry.includes(`${ADMIN_APPLICATIONS_URL}?`))
    expect(applicationReads).toHaveLength(1)
    // 배지도 같은 수를 읽는다 — 카드와 배지가 다른 말을 하면 운영자는 어느 쪽도 믿지 못한다.
    expect(screen.getByRole('button', { name: '셀러 입점 심사 2' })).toBeInTheDocument()
  })
})

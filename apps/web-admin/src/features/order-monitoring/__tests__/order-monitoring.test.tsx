import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { routeTree } from '../../../routeTree.gen'
import {
  ADMIN_ORDERS_URL,
  ADMIN_ORDER_METRICS_URL,
  ADMIN_ORDER_NUDGE_URL,
  NUDGE_NOW,
  currentAdminOrder,
  makeAdminOrderWire,
  seedAdminApplications,
  seedAdminOrders,
  server,
} from '@/testing/msw/server'

function renderMonitoring() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/orders/monitoring'] }),
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

/** 그 화면에서 나간 요청을 마운트 순간부터 모은다 — 연타 방어는 "요청 건수"로만 드러난다. */
function recordRequests(): string[] {
  const urls: string[] = []
  server.events.on('request:start', ({ request }) => urls.push(`${request.method} ${request.url}`))
  return urls
}

const nudgePosts = (requests: readonly string[]) =>
  requests.filter(entry => entry.startsWith('POST ') && entry.includes('/dispatch-nudges'))

/**
 * FilterBar의 `<select>`는 라벨이 없다(앞의 FilterSelect가 맥락을 준다) — 안에 있는 옵션 이름으로
 * 집는다. 못 찾으면 던져서 `!`로 눌러 두지 않는다.
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

const bodyRowCount = () => within(screen.getByRole('table')).getAllByRole('row').length - 1

/** MetricCard는 라벨 div와 값 div를 형제로 둔다 — 라벨로 집고 카드 루트로 한 칸 올라간다. */
function metricCard(label: string): HTMLElement {
  const labelNode = screen.getByText(label, { selector: 'div' })
  const card = labelNode.parentElement
  if (!card) throw new Error(`"${label}" 지표 카드를 찾지 못했다`)
  return card
}

/** 상세 Drawer 안에는 목록이 셋(품목 ul / 타임라인 ol / 독촉 이력 ul)이고 타임라인만 ol이다. */
function timelineOf(drawer: HTMLElement): HTMLElement {
  const found = within(drawer)
    .getAllByRole('list')
    .find(element => element.tagName === 'OL')
  if (!found) throw new Error('배송 진행 타임라인을 찾지 못했다')
  return found
}

const PAID_ORDER = '01HZXK0000000000000000O01'
const SHIPPING_ORDER = '01HZXK0000000000000000O02'
const CANCELLED_ORDER = '01HZXK0000000000000000O03'

/** 상태가 서로 다른 세 건 — 필터·지표·독촉 가드가 각각 다른 행에 걸린다. */
function seedThreeOrders() {
  seedAdminOrders([
    makeAdminOrderWire({ orderId: PAID_ORDER, status: 'PAID', payableAmount: 73_000 }),
    makeAdminOrderWire({
      orderId: SHIPPING_ORDER,
      status: 'SHIPPING',
      orderedAt: '2026-10-24T18:47:00',
      sellerName: '냥이상점',
      buyerNickname: '초코집사',
      representativeItemName: '고양이 자동 급식기 5L',
      itemCount: 1,
      payableAmount: 64_000,
      delayReason: 'DELIVERY_OVERDUE',
      shipment: {
        courierCode: 'CJ',
        courierName: 'CJ대한통운',
        trackingNumber: '6381204911822',
        dispatchedAt: '2026-10-25T14:30:00',
        deliveredAt: null,
        lastTrackingStatus: '간선 상차',
      },
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'PAID',
          triggeredBy: 'BUYER',
          occurredAt: '2026-10-24T18:47:00',
        },
        {
          fromStatus: 'PAID',
          toStatus: 'PREPARING',
          triggeredBy: 'SELLER',
          occurredAt: '2026-10-25T09:12:00',
        },
        {
          fromStatus: 'PREPARING',
          toStatus: 'DISPATCH_PENDING',
          triggeredBy: 'SELLER',
          occurredAt: '2026-10-25T13:00:00',
        },
        {
          fromStatus: 'DISPATCH_PENDING',
          toStatus: 'SHIPPING',
          triggeredBy: 'SELLER',
          occurredAt: '2026-10-25T14:30:00',
        },
      ],
    }),
    makeAdminOrderWire({
      orderId: CANCELLED_ORDER,
      status: 'CANCELLED',
      orderedAt: '2026-10-22T13:28:00',
      sellerName: '보리펫샵',
      buyerNickname: '보리네집',
      representativeItemName: '원목 캣타워 대형',
      itemCount: 1,
      payableAmount: 139_000,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'PAID',
          triggeredBy: 'BUYER',
          occurredAt: '2026-10-22T13:28:00',
        },
        {
          fromStatus: 'PAID',
          toStatus: 'PREPARING',
          triggeredBy: 'SELLER',
          occurredAt: '2026-10-22T18:02:00',
        },
        {
          fromStatus: 'PREPARING',
          toStatus: 'CANCELLED',
          triggeredBy: 'ADMIN',
          occurredAt: '2026-10-23T09:11:00',
        },
      ],
    }),
  ])
}

async function openDetail(orderId: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: orderId }))
  return screen.findByRole('dialog', { name: '주문 상세' })
}

describe('어드민 주문 배송 모니터링 실연동', () => {
  beforeEach(() => {
    // 셸이 nav 배지를 채우려 심사 대기 수를 조회한다 — 핸들러가 없으면 MSW가 테스트를 깨뜨린다.
    seedAdminApplications()
    seedThreeOrders()
  })

  it('[AC-ADMIN-ORDER-001] 목록을 admin 호스트에서 받아 서버 값을 행에 그린다', async () => {
    const requests = recordRequests()
    renderMonitoring()

    expect(await screen.findByRole('button', { name: PAID_ORDER })).toBeInTheDocument()
    await waitFor(() => expect(bodyRowCount()).toBe(3))

    // 예시 데이터 시절에는 서버 요청이 0건이었다 — 목록이 실제로 admin 호스트로 나가는지 본다.
    expect(requests.filter(entry => entry.startsWith(`GET ${ADMIN_ORDERS_URL}?`))).toHaveLength(1)

    const row = screen.getByRole('button', { name: SHIPPING_ORDER }).closest('tr')
    if (!row) throw new Error('배송 중 주문 행을 찾지 못했다')
    expect(row).toHaveTextContent('고양이 자동 급식기 5L')
    expect(row).toHaveTextContent('냥이상점 / 초코집사')
    // 금액은 서버가 계산해 준 payableAmount 그대로다.
    expect(row).toHaveTextContent('64,000원')
    expect(row).toHaveTextContent('CJ대한통운')
    expect(row).toHaveTextContent('배송 중')
    // 지연 판정은 서버가 쥔다 — 화면이 날짜를 다시 세지 않는다.
    expect(row).toHaveTextContent('지연 신호')
  })

  it('[AC-ADMIN-ORDER-002] 실연동 화면이라 예시 데이터 띠를 붙이지 않는다', async () => {
    renderMonitoring()

    expect(
      await screen.findByRole('heading', { name: '주문 배송 모니터링' }),
    ).toBeInTheDocument()
    // 실데이터에 예시 띠를 붙이면 운영자가 실제 값을 예시로 의심한다(거꾸로 속이는 것).
    expect(screen.queryByText('예시 데이터예요')).not.toBeInTheDocument()
  })

  it('[AC-ADMIN-ORDER-003] 상태 필터는 서버 쿼리로 나가고 고른 상태만 남는다', async () => {
    const requests = recordRequests()
    renderMonitoring()
    await waitFor(() => expect(bodyRowCount()).toBe(3))

    await chooseOption(selectWithOption('주문 상태 전체'), '배송 중')

    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(screen.getByRole('button', { name: SHIPPING_ORDER })).toBeInTheDocument()
    // 옵션 존재만 보면 필터가 장식이어도 통과한다 — 서버로 나간 파라미터까지 확인한다.
    expect(requests.some(entry => entry.includes('status=SHIPPING'))).toBe(true)
  })

  it('[AC-ADMIN-ORDER-004] 지연 필터는 서버가 판정한 행만 남긴다', async () => {
    const requests = recordRequests()
    renderMonitoring()
    await waitFor(() => expect(bodyRowCount()).toBe(3))

    await chooseOption(selectWithOption('지연 여부 전체'), '지연 신호만')

    await waitFor(() => expect(bodyRowCount()).toBe(1))
    expect(requests.some(entry => entry.includes('delayedOnly=true'))).toBe(true)
  })

  /**
   * 결제대기는 서버가 모니터링 대상에서 빼고, 필터로 지정하면 400(90001)으로 끊는다 —
   * 고를 수 있게 두면 운영자가 고르는 즉시 목록이 에러로 바뀐다(동작 안 하는 필터).
   */
  it('[AC-ADMIN-ORDER-005] 결제 대기는 상태 필터 옵션에 없다', async () => {
    renderMonitoring()
    await waitFor(() => expect(bodyRowCount()).toBe(3))

    const statusSelect = selectWithOption('주문 상태 전체')
    expect(within(statusSelect).queryByRole('option', { name: '결제 대기' })).toBeNull()
    // 서버가 받는 일곱 값은 전부 고를 수 있어야 한다(발송 대기가 빠져 있던 자리다).
    expect(within(statusSelect).getByRole('option', { name: '발송 대기' })).toBeInTheDocument()
    expect(within(statusSelect).getByRole('option', { name: '주문 취소' })).toBeInTheDocument()
  })

  /**
   * 지표는 목록과 다른 경로이고 모수도 다르다 — 결제액만 취소 주문이 빠진다. 세 건의 합
   * (73,000 + 64,000 + 139,000 = 276,000)이 아니라 취소를 뺀 137,000이어야 한다.
   * 이 단언이 FE가 목록 행을 더해 금액을 만드는 되돌림을 잡는다.
   */
  it('[AC-ADMIN-ORDER-006] 지표 카드는 지표 경로 값을 쓰고 금액을 화면에서 계산하지 않는다', async () => {
    const requests = recordRequests()
    renderMonitoring()

    expect(await screen.findByText('137,000원')).toBeInTheDocument()
    expect(requests.some(entry => entry.startsWith(`GET ${ADMIN_ORDER_METRICS_URL}`))).toBe(true)
    expect(screen.queryByText('276,000원')).not.toBeInTheDocument()

    // 카드 라벨은 서버 응답 필드 이름에 맞춘다(결제완료·상품준비·발송대기를 합친 값이다).
    expect(metricCard('발송 대기')).toHaveTextContent('1건')
    expect(metricCard('배송 중')).toHaveTextContent('1건')
    expect(metricCard('지연')).toHaveTextContent('1건')
  })

  it('[AC-ADMIN-ORDER-007] 지표 조회가 실패하면 옛 숫자를 남기지 않고 사유를 알린다', async () => {
    const { queryClient } = renderMonitoring()
    expect(await screen.findByText('137,000원')).toBeInTheDocument()

    server.use(
      http.get(ADMIN_ORDER_METRICS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await queryClient.refetchQueries({ queryKey: ['admin-order-monitoring', 'metrics'] })

    // 캐시된 숫자를 그대로 두면 카드가 서버에 없는 금액을 가리킨다.
    await waitFor(() => expect(screen.queryByText('137,000원')).not.toBeInTheDocument())
    expect(await screen.findByText(/어드민 권한이 없어 지표를 볼 수 없어요/)).toBeInTheDocument()
  })

  it('[AC-ADMIN-ORDER-008] 목록 실패는 빈 상태가 아니라 실패 사유로 드러난다', async () => {
    seedAdminOrders()
    server.use(
      http.get(ADMIN_ORDERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderMonitoring()

    expect(
      await screen.findByText(/어드민 권한이 없어 주문 목록을 볼 수 없어요/),
    ).toBeInTheDocument()
    // "주문 없음"으로 떨어지면 못 불러온 것과 구분되지 않는다.
    expect(screen.getByText('목록을 불러오지 못했어요.')).toBeInTheDocument()
  })

  it('[AC-ADMIN-ORDER-009] dev에 주문이 없으면 뜻이 통하는 빈 상태를 보여 준다', async () => {
    seedAdminOrders()
    renderMonitoring()

    expect(
      await screen.findByText(/아직 주문이 들어오지 않았을 수도 있어요/),
    ).toBeInTheDocument()
  })

  /**
   * 서버는 알림도 메일도 보내지 않는다 — 어드민 실행 모듈이 발송 어댑터를 조립하지 않고,
   * 응답에 발송 여부 필드도 없다. 예시 데이터 시절 모달은 "셀러센터 알림과 메일이 함께 나가고"
   * 라고 안내했고, 그걸 읽은 운영자는 셀러에게 연락이 갔다고 믿고 후속 조치를 멈춘다.
   */
  it('[AC-ADMIN-ORDER-010] 독촉 확인 모달은 알림이 나간다고 말하지 않는다', async () => {
    const drawer = await (async () => {
      renderMonitoring()
      return openDetail(PAID_ORDER)
    })()
    const user = userEvent.setup()

    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))

    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })
    expect(dialog).toHaveTextContent('독촉 이력이 주문에 남아요')
    expect(dialog).toHaveTextContent('셀러센터 알림과 메일은 나가지 않아요')
    // 문구가 "함께 나가고"로 되돌아가면 여기서 깨진다.
    expect(dialog).not.toHaveTextContent('알림과 메일이 함께 나가고')
  })

  it('[AC-ADMIN-ORDER-011] 독촉은 확인을 거쳐 실제 경로로 기록되고 성공을 알린다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)

    await user.type(within(drawer).getByRole('textbox'), '송장 등록 부탁해요')
    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))

    // 되돌리기 어려운 조치가 아니어도 기록은 지울 수 없다 — 확인 한 단계를 둔다.
    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })
    expect(nudgePosts(requests)).toHaveLength(0)

    await user.click(within(dialog).getByRole('button', { name: '독촉 기록' }))

    expect(await screen.findByText(/독촉 기록을 남겼어요/)).toBeInTheDocument()
    expect(nudgePosts(requests)).toHaveLength(1)
    expect(currentAdminOrder(PAID_ORDER)?.nudges).toEqual([
      { nudgeId: 1, adminUserId: 1, memo: '송장 등록 부탁해요', nudgedAt: NUDGE_NOW },
    ])
  })

  /**
   * 같은 버튼을 두 번 눌러 요청이 두 번 나가면 안 된다. 서버 쿨다운(6시간)이 두 번째를 409로
   * 끊지만, 그러면 운영자는 자기가 만든 실패 토스트를 본다 — 화면에서도 막는다.
   *
   * 기록 건수가 아니라 **나간 POST 건수**를 본다(쿨다운이 두 번째를 거절하므로 기록은 어차피 하나다).
   */
  it('[AC-ADMIN-ORDER-012] 독촉 버튼을 연타해도 요청은 한 번만 나간다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    let release: () => void = () => {}
    const inFlight = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(ADMIN_ORDER_NUDGE_URL, async () => {
        await inFlight
        return HttpResponse.json(
          { data: { nudgeId: 1, adminUserId: 1, memo: null, nudgedAt: NUDGE_NOW } },
          { status: 201 },
        )
      }),
    )
    renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)
    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })

    const confirm = within(dialog).getByRole('button', { name: '독촉 기록' })
    await user.click(confirm)
    await waitFor(() => expect(confirm).toBeDisabled())
    await user.click(confirm)
    await user.click(confirm)

    expect(nudgePosts(requests)).toHaveLength(1)

    // 요청 중에는 모달이 닫히지도 않아야 한다 — 닫히면 운영자가 무엇을 지시했는지 모르는 채
    // 요청만 날아간다. 취소 버튼뿐 아니라 **Esc로도** 닫히면 안 된다: Drawer도 document에
    // Esc 핸들러를 걸고 그쪽이 closeDrawer를 부른다(교차검토 지적).
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '주문 상세' })).toBeInTheDocument()

    release()
    expect(await screen.findByText(/독촉 기록을 남겼어요/)).toBeInTheDocument()
  })

  /**
   * 조회가 실패한 동안에는 낡은 행으로 하는 처리를 잠근다(AGENTS 6-7). 상세 Drawer를 여는 읽기
   * 버튼은 예외다 — 막으면 운영자가 확인할 방법이 없어진다.
   */
  it('[AC-ADMIN-ORDER-013] 목록 조회가 실패하면 낡은 행의 독촉 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)
    expect(within(drawer).getByRole('button', { name: '셀러 발송 독촉' })).toBeEnabled()

    server.use(
      http.get(ADMIN_ORDERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await queryClient.refetchQueries({ queryKey: ['admin-order-monitoring', 'list'] })

    await waitFor(() =>
      expect(within(drawer).getByRole('button', { name: '셀러 발송 독촉' })).toBeDisabled(),
    )
    // 행은 지우지 않는다 — 마지막으로 본 내용은 정보다.
    expect(screen.getByRole('button', { name: PAID_ORDER })).toBeInTheDocument()
    // 읽기로 가는 버튼은 막지 않는다.
    await user.click(screen.getByRole('button', { name: SHIPPING_ORDER }))
    expect(await screen.findByRole('dialog', { name: '주문 상세' })).toBeInTheDocument()
  })

  /**
   * Drawer 버튼만 잠그면 **모달을 연 동안** 재조회가 실패해도 확인 버튼이 그대로 눌린다 —
   * 확인 Modal은 낡은 행의 값으로 만들어져 있어 서버에 없는 상태를 보고 조치를 지시한다
   * (교차검토 지적). 잠긴 동안에는 확인 버튼 자체를 두지 않는다(눌러도 안 되는 버튼 금지).
   */
  it('[AC-ADMIN-ORDER-018] 확인 모달을 연 뒤 조회가 실패하면 확인 버튼이 사라진다', async () => {
    const user = userEvent.setup()
    const requests = recordRequests()
    const { queryClient } = renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)
    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })
    expect(within(dialog).getByRole('button', { name: '독촉 기록' })).toBeInTheDocument()

    server.use(
      http.get(ADMIN_ORDERS_URL, () =>
        HttpResponse.json({ errorCode: 20011, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    await queryClient.refetchQueries({ queryKey: ['admin-order-monitoring', 'list'] })

    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: '독촉 기록' })).toBeNull(),
    )
    expect(within(dialog).getByText(/화면이 낡았어요/)).toBeInTheDocument()
    expect(nudgePosts(requests)).toHaveLength(0)
  })

  /** 서버가 409(50500)로 거절하는 상태는 눌릴 수 있는 자리에서 미리 가른다. */
  it('[AC-ADMIN-ORDER-014] 발송 이후 상태 주문은 독촉을 걸 수 없다고 알린다', async () => {
    renderMonitoring()
    const drawer = await openDetail(SHIPPING_ORDER)

    expect(within(drawer).getByRole('button', { name: '셀러 발송 독촉' })).toBeDisabled()
    expect(
      within(drawer).getByText('발송 전 상태의 주문만 독촉을 기록할 수 있어요.'),
    ).toBeInTheDocument()
  })

  /**
   * 화면의 선제 차단(AC-014)을 지나오는 경로는 경합뿐이다 — 행을 받은 뒤 서버에서 상태가 바뀌면
   * FE는 아직 발송 전이라고 믿고 보낸다. 그때 50500이 온다.
   *
   * 서버는 `isAwaitingDispatch()`가 **아닌 전부**를 50500으로 끊으므로 취소된 주문도 여기 든다 —
   * 문구가 "이미 발송된 주문"이라고 단정하면 취소 건에서 거짓이 된다.
   */
  it('[AC-ADMIN-ORDER-019] 상태가 바뀐 뒤 들어온 409는 발송 여부를 단정하지 않는다', async () => {
    const user = userEvent.setup()
    renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)

    // 행을 받은 뒤 서버에서 취소된 주문 — 화면은 아직 PAID로 알고 있다.
    server.use(
      http.post(ADMIN_ORDER_NUDGE_URL, () =>
        HttpResponse.json(
          { errorCode: 50500, message: '발송 전 상태의 주문만 발송 독촉할 수 있습니다.' },
          { status: 409 },
        ),
      ),
    )
    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '독촉 기록' }))

    const toast = await screen.findByText(/발송 전 상태의 주문이 아니라 독촉을 기록할 수 없어요/)
    expect(toast.closest('[role="alert"]')).not.toBeNull()
    // 취소된 주문에도 같은 코드가 오므로 "이미 발송됐다"고 단정할 수 없고, 무효화 뒤 재조회가
    // 실패할 수 있어 "다시 불러왔다"도 단정할 수 없다.
    expect(screen.queryByText(/이미 발송된 주문/)).not.toBeInTheDocument()
    expect(screen.queryByText(/목록을 다시 불러왔어요/)).not.toBeInTheDocument()
  })

  it('[AC-ADMIN-ORDER-015] 쿨다운 안의 재독촉 409는 기다리라고 알린다', async () => {
    const user = userEvent.setup()
    seedAdminOrders([
      makeAdminOrderWire({
        orderId: PAID_ORDER,
        status: 'PAID',
        // 직전 독촉이 1시간 전이라 서버 쿨다운(6시간) 안이다.
        nudges: [
          { nudgeId: 1, adminUserId: 1, memo: null, nudgedAt: '2026-10-30T11:00:00' },
        ],
      }),
    ])
    renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)

    await user.click(within(drawer).getByRole('button', { name: '셀러 발송 독촉' }))
    const dialog = await screen.findByRole('dialog', { name: '셀러 발송 독촉을 기록할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '독촉 기록' }))

    const toast = await screen.findByText(/직전 독촉에서 아직 시간이 덜 지났어요/)
    // 문구만 보면 variant를 info로 되돌려도 통과한다 — DS는 error만 role="alert"로 올린다.
    expect(toast.closest('[role="alert"]')).not.toBeNull()
  })

  /**
   * 취소는 사다리 밖 상태다 — 사다리에 끼우면 "어디까지 갔다가 취소됐는지"가 사라진다.
   * 지나온 칸을 남기고 마지막에 취소 단계를 덧붙인다.
   */
  it('[AC-ADMIN-ORDER-016] 취소 주문도 타임라인에 지나온 칸이 남는다', async () => {
    renderMonitoring()
    const drawer = await openDetail(CANCELLED_ORDER)

    // 단계 순서가 계약이다 — 취소를 사다리에 끼우면 "어디까지 갔다가 취소됐는지"가 사라진다.
    const steps = within(timelineOf(drawer)).getAllByRole('listitem')
    expect(steps.map(step => step.textContent)).toEqual([
      '결제 완료10-22 13:28',
      '상품 준비10-22 18:02',
      '발송 대기',
      '배송 중',
      '배송 완료',
      '구매 확정',
      '주문 취소10-23 09:11',
    ])
  })

  it('[AC-ADMIN-ORDER-017] 상세는 품목 전문과 독촉 기록을 서버에서 받아 보여 준다', async () => {
    renderMonitoring()
    const drawer = await openDetail(PAID_ORDER)

    expect(within(drawer).getByText(/주문 품목 \/ 1건/)).toBeInTheDocument()
    expect(
      within(drawer).getByText(/프리미엄 관절 영양제 180정 \/ 2개입 \(2개\)/),
    ).toBeInTheDocument()
    expect(within(drawer).getByText('독촉 기록이 없어요.')).toBeInTheDocument()
    // 주문 묶음 id는 상세에만 있다.
    expect(within(drawer).getByText('01HZXK0000000000000000G01')).toBeInTheDocument()
  })
})

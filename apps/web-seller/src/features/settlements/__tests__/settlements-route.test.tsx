import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SELLER_SETTLEMENTS_URL,
  SELLER_SETTLEMENT_MONTHS_URL,
  makeSettlementItemWire,
  makeSettlementOrderWire,
  seedSettlements,
  server,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const JUNE = makeSettlementOrderWire({
  orderId: '01JZ0JUNE000000000000001',
  settlementMonth: '2026-06',
  confirmedAt: '2026-06-18T10:00:00',
  expectedPayoutDate: '2026-06-23',
})

const MAY = makeSettlementOrderWire({
  orderId: '01JZ0MAY0000000000000001',
  settlementMonth: '2026-05',
  confirmedAt: '2026-05-20T09:00:00',
  expectedPayoutDate: '2026-05-25',
  items: [makeSettlementItemWire({ orderItemId: 21, status: 'completed', grossAmount: 32_000 })],
})

describe('/settlements (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    seedSettlements([JUNE, MAY])
  })

  it('[AC-SETTLE-ROUTE-001] 준비 중 게이트 없이 서버 목록을 확정일 최신순으로 그린다', async () => {
    renderAt('/settlements')

    expect(await screen.findByRole('heading', { name: '정산/매출' })).toBeInTheDocument()
    expect(screen.queryByText('정산/매출 조회는 준비 중이에요')).not.toBeInTheDocument()
    // 로딩 행도 role=row라 데이터가 들어온 뒤에 행을 집는다.
    await screen.findByText(JUNE.orderId)
    const rows = screen.getAllByRole('row')
    // rows[0]은 헤더 행이다.
    expect(within(rows[1]!).getByText(JUNE.orderId)).toBeInTheDocument()
    expect(within(rows[2]!).getByText(MAY.orderId)).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-002] 금액은 서버 값 그대로 보여주고 수수료만 음수 부호를 붙인다', async () => {
    seedSettlements([JUNE])
    renderAt('/settlements')

    // 상품 64,000 + 배송비 3,000 - 플랫폼 5,120 - PG 1,792 = 60,088
    expect(await screen.findByText('64,000원')).toBeInTheDocument()
    expect(screen.getByText('-6,912원')).toBeInTheDocument()
    expect(screen.getByText('60,088원')).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-003] 월 선택지는 서버 /months가 준 월만 올린다', async () => {
    renderAt('/settlements')

    expect(await screen.findByRole('option', { name: '2026.06' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '2026.05' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '전체 기간' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '2026.04' })).not.toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-004] 월 필터는 클라이언트가 걸러내지 않고 서버 질의로 나간다', async () => {
    const user = userEvent.setup()
    const seen: string[] = []
    server.use(
      http.get(SELLER_SETTLEMENTS_URL, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({
          data: { settlements: [], totalCount: 0, page: 0, size: 20, totalPages: 0, hasNext: false },
        })
      }),
    )
    renderAt('/settlements')

    // 월 선택지는 /months 응답이 와야 생긴다 — Select 자체는 첫 렌더부터 있으므로 옵션을 기다린다.
    await screen.findByRole('option', { name: '2026.05' })
    await user.selectOptions(screen.getByRole('combobox', { name: '정산월' }), '2026-05')

    await screen.findByText('조건에 맞는 정산 내역이 없어요.')
    expect(seen.at(-1)).toContain('month=2026-05')
  })

  it('[AC-SETTLE-ROUTE-005] 전체 선택은 month 파라미터를 보내지 않는다(빈 값은 400이다)', async () => {
    const seen: string[] = []
    server.use(
      http.get(SELLER_SETTLEMENTS_URL, ({ request }) => {
        seen.push(new URL(request.url).search)
        return HttpResponse.json({
          data: { settlements: [], totalCount: 0, page: 0, size: 20, totalPages: 0, hasNext: false },
        })
      }),
    )
    renderAt('/settlements')

    await screen.findByText('조건에 맞는 정산 내역이 없어요.')
    expect(seen[0]).not.toContain('month=')
    expect(seen[0]).not.toContain('status=')
  })

  it('[AC-SETTLE-ROUTE-006] 상태 필터도 서버 질의로 나간다', async () => {
    const user = userEvent.setup()
    renderAt('/settlements')

    await screen.findByText(JUNE.orderId)
    await user.selectOptions(screen.getByRole('combobox', { name: '지급 상태' }), 'completed')

    // 6월 건은 pending이라 빠지고 완료인 5월 건만 남는다.
    expect(await screen.findByText(MAY.orderId)).toBeInTheDocument()
    expect(screen.queryByText(JUNE.orderId)).not.toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-007] 행을 누르면 상세를 따로 조회해 금액 분해와 품목 내역을 보여준다', async () => {
    const user = userEvent.setup()
    seedSettlements([JUNE])
    renderAt('/settlements')

    await user.click(await screen.findByText(JUNE.orderId))

    expect(await screen.findByText('품목 내역')).toBeInTheDocument()
    expect(screen.getByText('고양이 자동 급식기 5L')).toBeInTheDocument()
    expect(screen.getByText('쿠폰 부담 금액 (셀러)')).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-008] 수수료 요율은 서버 스냅샷을 쓴다(8% 하드코딩 아님)', async () => {
    const user = userEvent.setup()
    seedSettlements([
      makeSettlementOrderWire({ ...JUNE, platformFeeRate: 0.05, pgFeeRate: 0.0235 }),
    ])
    renderAt('/settlements')

    await user.click(await screen.findByText(JUNE.orderId))

    expect(await screen.findByText('플랫폼 수수료 (5%)')).toBeInTheDocument()
    expect(screen.getByText('PG 수수료 (2.35%)')).toBeInTheDocument()
    expect(screen.queryByText('플랫폼 수수료 (8%)')).not.toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-009] 품목이 둘인 주문도 한 행으로 접히고 상세에 두 품목이 다 보인다', async () => {
    const user = userEvent.setup()
    seedSettlements([
      makeSettlementOrderWire({
        ...JUNE,
        items: [
          makeSettlementItemWire({ orderItemId: 11, productName: '급식기', grossAmount: 64_000, quantity: 2 }),
          makeSettlementItemWire({ orderItemId: 12, productName: '정수기', grossAmount: 32_000 }),
        ],
      }),
    ])
    renderAt('/settlements')

    await screen.findByText('96,000원')
    expect(screen.getAllByRole('row')).toHaveLength(2) // 헤더 + 주문 한 행

    await user.click(screen.getByText(JUNE.orderId))

    expect(await screen.findByText('급식기')).toBeInTheDocument()
    expect(screen.getByText('정수기')).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-010] 상세 실패(403/70003)는 Drawer 안에서 사유와 재시도를 보여준다', async () => {
    const user = userEvent.setup()
    seedSettlements([JUNE])
    server.use(
      http.get(`${SELLER_SETTLEMENTS_URL}/:orderPublicId`, () =>
        HttpResponse.json({ errorCode: 70003, message: '권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderAt('/settlements')

    await user.click(await screen.findByText(JUNE.orderId))

    expect(await screen.findByText('정산 상세를 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.getByText('이 주문의 정산을 볼 권한이 없어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-011] 목록 조회 실패는 데이터 없음과 다른 문구로 드러낸다', async () => {
    server.use(
      http.get(SELLER_SETTLEMENTS_URL, () =>
        HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/settlements')

    expect(await screen.findByText('정산 내역을 불러오지 못했어요.')).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-012] 월 목록 조회 실패는 전체 조회를 막지 않는다', async () => {
    seedSettlements([JUNE])
    server.use(
      http.get(SELLER_SETTLEMENT_MONTHS_URL, () =>
        HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/settlements')

    expect(await screen.findByText(JUNE.orderId)).toBeInTheDocument()
    expect(screen.getByText(/정산월 목록을 불러오지 못해/)).toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-013] 정산 행이 없으면 빈 목록 안내만 보이고 페이지 이동은 그리지 않는다', async () => {
    seedSettlements([])
    renderAt('/settlements')

    expect(await screen.findByText('조건에 맞는 정산 내역이 없어요.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '페이지' })).not.toBeInTheDocument()
  })

  it('[AC-SETTLE-ROUTE-014] 페이지 이동은 서버 page 파라미터로 나가고 마지막 페이지에서 다음이 잠긴다', async () => {
    const user = userEvent.setup()
    // size 20 기본이라 21건을 심어 두 페이지를 만든다.
    seedSettlements(
      Array.from({ length: 21 }, (_, index) =>
        makeSettlementOrderWire({
          orderId: `01JZ0PAGE${String(index).padStart(16, '0')}`,
          confirmedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00`,
        }),
      ),
    )
    renderAt('/settlements')

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
    expect(screen.getAllByRole('row')).toHaveLength(2) // 헤더 + 남은 1건
  })

  it('[AC-SETTLE-ROUTE-015] 필터를 바꾸면 페이지는 처음으로 돌아간다', async () => {
    const user = userEvent.setup()
    seedSettlements(
      Array.from({ length: 21 }, (_, index) =>
        makeSettlementOrderWire({
          orderId: `01JZ0PAGE${String(index).padStart(16, '0')}`,
          confirmedAt: `2026-06-${String(index + 1).padStart(2, '0')}T10:00:00`,
        }),
      ),
    )
    renderAt('/settlements')

    await user.click(await screen.findByRole('button', { name: '다음' }))
    await screen.findByText('2 / 2')

    await user.selectOptions(screen.getByRole('combobox', { name: '지급 상태' }), 'pending')

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
  })

  // ── codex 교차검토에서 나온 결함 둘 ─────────────────────────────────────────

  it('[AC-SETTLE-ROUTE-016] 요청한 페이지가 도착하기 전에는 페이지 버튼이 잠긴다', async () => {
    const user = userEvent.setup()
    const requested: number[] = []
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(SELLER_SETTLEMENTS_URL, async ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? '0')
        requested.push(page)
        if (page > 0) await held
        return HttpResponse.json({
          data: {
            settlements: [
              {
                orderId: `01JZ0PAGE${page}`,
                settlementMonth: '2026-06',
                confirmedAt: '2026-06-18T10:00:00',
                expectedPayoutDate: '2026-06-23',
                productAmount: 64_000,
                feeAmount: 6_912,
                finalAmount: 60_088,
                status: 'pending',
              },
            ],
            totalCount: 60,
            page,
            size: 20,
            totalPages: 3,
            hasNext: page < 2,
          },
        })
      }),
    )
    renderAt('/settlements')

    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다음' }))

    // 표에 남아 있는 것은 직전 페이지라 `hasNext`도 직전 값이다 — 잠기지 않으면 연타가
    // page=2를 요청해 2페이지를 건너뛴다.
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeDisabled())
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()

    // 페이지 번호(`2 / 3`)는 누르는 즉시 바뀌므로 응답 도착의 신호가 아니다 — 2페이지 행을 기다린다.
    release()
    expect(await screen.findByText('01JZ0PAGE1')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(requested).toEqual([0, 1])
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled())
  })

  it('[AC-SETTLE-ROUTE-017] 목록 조회 실패는 사유와 재시도를 함께 보여주고 다시 조회한다', async () => {
    const user = userEvent.setup()
    seedSettlements([JUNE])
    let calls = 0
    server.use(
      http.get(SELLER_SETTLEMENTS_URL, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 })
        }
        return HttpResponse.json({
          data: {
            settlements: [
              {
                orderId: JUNE.orderId,
                settlementMonth: JUNE.settlementMonth,
                confirmedAt: JUNE.confirmedAt,
                expectedPayoutDate: JUNE.expectedPayoutDate,
                productAmount: 64_000,
                feeAmount: 6_912,
                finalAmount: 60_088,
                status: 'pending',
              },
            ],
            totalCount: 1,
            page: 0,
            size: 20,
            totalPages: 1,
            hasNext: false,
          },
        })
      }),
    )
    renderAt('/settlements')

    // 표의 빈 상태 문구만으로는 셀러가 서버 오류를 필터 탓으로 읽는다.
    expect(
      await screen.findByText(/정산 내역을 불러오지 못했어요. 잠시 후 다시 시도해 주세요./),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText(JUNE.orderId)).toBeInTheDocument()
  })
})

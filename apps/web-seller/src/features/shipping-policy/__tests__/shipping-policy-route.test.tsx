import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SELLER_SHIPPING_POLICY_URL,
  currentShippingPolicy,
  makeShippingPolicyWire,
  seedCouriers,
  seedShippingPolicy,
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

const SAVED = makeShippingPolicyWire({
  defaultCourierCode: 'CJ',
  baseShippingFee: 3000,
  freeShippingThreshold: 30000,
  originZipCode: '04035',
  originRoadAddress: '서울 마포구 와우산로 00',
  originDetailAddress: '물류 1센터',
  returnSameAsOrigin: true,
  jejuExtraFee: 3000,
  remoteAreaExtraFee: 5000,
  returnFee: 4000,
  exchangeFee: 8000,
  avgDispatchDays: 1,
})

describe('/shipping-policy (실서버 계약 — MSW)', () => {
  beforeEach(() => {
    seedCouriers()
    seedShippingPolicy(SAVED)
  })

  it('[AC-SHIP-ROUTE-001] 준비 중 게이트 없이 서버 값으로 폼을 채운다', async () => {
    renderAt('/shipping-policy')

    expect(await screen.findByRole('heading', { name: '배송 정책' })).toBeInTheDocument()
    expect(screen.queryByText('배송 정책 설정은 준비 중이에요')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('우편번호', { selector: '#origin-zip' })).toHaveValue('04035')
    expect(screen.getByLabelText('상세주소', { selector: '#origin-detail' })).toHaveValue('물류 1센터')
  })

  it('[AC-SHIP-ROUTE-002] 반품지 동일이면 반품지 칸은 출고지 값을 보여주고 입력을 막는다', async () => {
    renderAt('/shipping-policy')

    const returnZip = await screen.findByLabelText('우편번호', { selector: '#return-zip' })
    expect(returnZip).toHaveValue('04035')
    expect(returnZip).toBeDisabled()
  })

  it('[AC-SHIP-ROUTE-003] 저장은 서버 필드명으로 전체 본문을 싣고, 반품지 동일이면 반품지를 null로 보낸다', async () => {
    const user = userEvent.setup()
    renderAt('/shipping-policy')

    await user.click(await screen.findByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    const saved = currentShippingPolicy()
    expect(saved.defaultCourierCode).toBe('CJ')
    expect(saved.baseShippingFee).toBe(3000)
    expect(saved.originRoadAddress).toBe('서울 마포구 와우산로 00')
    expect(saved.returnSameAsOrigin).toBe(true)
    expect(saved.returnZipCode).toBeNull()
  })

  it('[AC-SHIP-ROUTE-004] 반품지 동일을 풀면 반품지 3필드를 따로 저장한다', async () => {
    const user = userEvent.setup()
    renderAt('/shipping-policy')

    await user.click(await screen.findByRole('checkbox', { name: '출고지와 동일' }))
    const returnZip = screen.getByLabelText('우편번호', { selector: '#return-zip' })
    await user.clear(returnZip)
    await user.type(returnZip, '06236')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    const saved = currentShippingPolicy()
    expect(saved.returnSameAsOrigin).toBe(false)
    expect(saved.returnZipCode).toBe('06236')
  })

  it('[AC-SHIP-ROUTE-005] 무료배송을 끄면 0원이 아니라 미운영(null)으로 저장된다', async () => {
    const user = userEvent.setup()
    renderAt('/shipping-policy')

    await user.click(await screen.findByRole('checkbox', { name: '무료배송 운영' }))
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    expect(currentShippingPolicy().freeShippingThreshold).toBeNull()
    expect(await screen.findByText('무료배송을 운영하지 않아요.')).toBeInTheDocument()
  })

  it('[AC-SHIP-ROUTE-006] 무료배송 기준이 기본 배송비보다 낮으면 서버로 보내지 않고 막는다', async () => {
    const user = userEvent.setup()
    seedShippingPolicy(makeShippingPolicyWire({ baseShippingFee: 5000, freeShippingThreshold: 6000 }))
    let putCount = 0
    server.use(
      http.put(SELLER_SHIPPING_POLICY_URL, () => {
        putCount += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderAt('/shipping-policy')

    // 금액 스테퍼는 DOM 순서가 곧 화면 순서다 — 기본 배송비가 먼저, 무료배송 기준이 그다음이다.
    const decreases = await screen.findAllByRole('button', { name: '감소' })
    await user.click(decreases[1]!)
    await user.click(decreases[1]!)

    // 칸 아래 인라인 사유는 입력하는 즉시 뜬다.
    expect(await screen.findByText('무료배송 기준 금액은 기본 배송비보다 낮을 수 없어요.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('저장하지 못했어요. 무료배송 기준 금액을 확인해 주세요.')).toBeInTheDocument()
    expect(putCount).toBe(0)
  })

  it('[AC-SHIP-ROUTE-007] 저장 실패(50303)는 해요체 안내로 드러내고 토스트를 띄우지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.put(SELLER_SHIPPING_POLICY_URL, () =>
        HttpResponse.json({ errorCode: 50303, message: '택배사를 찾을 수 없습니다.' }, { status: 404 }),
      ),
    )
    renderAt('/shipping-policy')

    await user.click(await screen.findByRole('button', { name: '저장' }))

    expect(
      await screen.findByText('선택한 택배사를 찾을 수 없어요. 택배사를 다시 골라 주세요.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('저장했어요.')).not.toBeInTheDocument()
  })

  it('[AC-SHIP-ROUTE-008] 조회 실패는 빈 폼이 아니라 재시도 안내를 보여준다', async () => {
    // 저장이 전체 덮어쓰기라 빈 폼을 그리면 서버 값을 0원으로 지워 버린다.
    server.use(
      http.get(SELLER_SHIPPING_POLICY_URL, () =>
        HttpResponse.json({ errorCode: 50000, message: '서버 오류' }, { status: 500 }),
      ),
    )
    renderAt('/shipping-policy')

    expect(await screen.findByText('배송 정책을 불러오지 못했어요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('[AC-SHIP-ROUTE-009] 발송 소요일 선택지는 서버 허용 범위(1~7영업일)를 모두 담는다', async () => {
    // 선택지를 1~3으로 좁혀 두면 저장된 5영업일이 화면에서 사라진다.
    seedShippingPolicy(makeShippingPolicyWire({ avgDispatchDays: 5 }))
    renderAt('/shipping-policy')

    const select = await screen.findByLabelText('평균 발송 소요일')
    expect(select).toHaveValue('5')
    expect(screen.getByRole('option', { name: '7영업일' })).toBeInTheDocument()
  })

  it('[AC-SHIP-ROUTE-010] 저장한 적 없는 셀러도 컬럼 기본값으로 폼이 열린다', async () => {
    seedShippingPolicy()
    renderAt('/shipping-policy')

    expect(await screen.findByRole('button', { name: '저장' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('평균 발송 소요일')).toHaveValue('2'))
    expect(screen.getByText('무료배송을 운영하지 않아요.')).toBeInTheDocument()
  })
})

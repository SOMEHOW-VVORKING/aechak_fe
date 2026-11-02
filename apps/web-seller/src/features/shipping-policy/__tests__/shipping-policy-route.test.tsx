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

function renderAt(path: string, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
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

  // ── codex 교차검토에서 나온 결함 셋 ─────────────────────────────────────────

  it('[AC-SHIP-ROUTE-011] 저장이 날아가는 동안 폼을 잠근다(응답 대기 중 입력이 사라지지 않게)', async () => {
    const user = userEvent.setup()
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.put(SELLER_SHIPPING_POLICY_URL, async () => {
        await held
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderAt('/shipping-policy')

    await user.click(await screen.findByRole('button', { name: '저장' }))

    // 폼이 열려 있으면 여기 입력한 값이 성공 콜백의 되맞춤(보낸 본문으로 폼 교체)에 덮여
    // "저장했어요" 토스트와 함께 조용히 사라진다.
    const originDetail = screen.getByLabelText('상세주소', { selector: '#origin-detail' })
    await waitFor(() => expect(originDetail).toBeDisabled())
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: '출고지와 동일' })).toBeDisabled()

    release()
    await screen.findByText('저장했어요.')
    await waitFor(() => expect(originDetail).toBeEnabled())
  })

  it('[AC-SHIP-ROUTE-012] 기본 택배사를 미설정(null)으로 되돌려 저장할 수 있다', async () => {
    const user = userEvent.setup()
    renderAt('/shipping-policy')

    // placeholder는 DS Select가 선택 불가(`disabled hidden`)로 그리므로 실제 선택지여야 한다.
    await screen.findByRole('option', { name: '선택 안 함' })
    const select = screen.getByLabelText('기본 택배사')
    expect(select).toHaveValue('CJ')

    await user.selectOptions(select, '')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    expect(currentShippingPolicy().defaultCourierCode).toBeNull()
  })

  /**
   * 출고지 3필드는 스토어 설정의 주소와 **같은 서버 컬럼**이다. 재진입 때 캐시된 옛 출고지로
   * 폼을 확정하면, 전체 덮어쓰기 저장이 그 사이 스토어 설정에서 바꾼 주소를 되돌린다.
   * 같은 QueryClient 로 두 번 렌더해 캐시가 남은 재진입을 재현한다.
   */
  it('[AC-SHIP-ROUTE-014] 재진입 때 캐시된 옛 출고지로 저장하지 않는다', async () => {
    // 반품지가 출고지와 동일이라 같은 값을 가진 입력이 둘이다 — 출고지 칸을 id로 집는다.
    const originRoad = () => document.getElementById('origin-road') as HTMLInputElement | null
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = renderAt('/shipping-policy', queryClient)
    await waitFor(() => expect(originRoad()).toHaveValue('서울 마포구 와우산로 00'))
    first.unmount()

    // 그 사이 스토어 설정이 같은 주소 컬럼을 바꿨다.
    seedShippingPolicy(
      makeShippingPolicyWire({ ...SAVED, originRoadAddress: '서울 강남구 테헤란로 1' }),
    )
    const user = userEvent.setup()
    renderAt('/shipping-policy', queryClient)

    await waitFor(() => expect(originRoad()).toHaveValue('서울 강남구 테헤란로 1'))

    // 배송비만 고쳐 저장해도 출고지가 옛 값으로 되돌아가지 않는다.
    const amounts = screen.getAllByRole('textbox', { name: '값' })
    await user.clear(amounts[0]!)
    await user.type(amounts[0]!, '4000')
    await user.click(screen.getByRole('button', { name: '저장' }))

    await screen.findByText('저장했어요.')
    expect(currentShippingPolicy().baseShippingFee).toBe(4000)
    expect(currentShippingPolicy().originRoadAddress).toBe('서울 강남구 테헤란로 1')
  })

  it('[AC-SHIP-ROUTE-013] 금액 칸에 소수를 넣어도 원 단위 정수로 저장된다', async () => {
    const user = userEvent.setup()
    renderAt('/shipping-policy')

    // 금액 스테퍼 입력칸은 DOM 순서가 화면 순서다 — 첫 칸이 기본 배송비다.
    const amounts = await screen.findAllByRole('textbox', { name: '값' })
    await user.clear(amounts[0]!)
    await user.type(amounts[0]!, '3000.5')
    await user.click(screen.getByRole('button', { name: '저장' }))

    // 소수를 그대로 보내면 서버 필드가 Long이라 10005가 아니라 역직렬화 400/90001로 떨어지고
    // (MSW 핸들러가 그 분기를 재현한다) 저장 성공 토스트가 뜨지 않는다.
    await screen.findByText('저장했어요.')
    expect(currentShippingPolicy().baseShippingFee).toBe(3001)
  })
})

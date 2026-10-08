// ─── 머지 주의 — origin/feature/SCRUM-200-cart-api ───────────────────────────────────────
// 이 파일도 짝이 되는 `../components/CheckoutScreen.tsx`와 함께 팀원 오픈 PR
// `origin/feature/SCRUM-200-cart-api`(장바구니 서버 연동)가 통째로 재작성하는 대상이다.
// 머지 뒤 이 파일은 **그대로는 컴파일되지 않는다.** 두 가지를 반드시 함께 고쳐야 한다.
//
//   · 아래 import의 `addToCart`·`cartLineKey`·`getCartItems`·`resetCart`·`setCartSelected`가 PR의
//     `src/shared/cart/index.ts` 배럴에서 전부 사라진다 — `useCartView`·`setCartItemSelected`·
//     `getDeselectedCartItemIds`·`useAddCartItem` 등으로 교체되고, 라인 원본은 서버가 소유한다
//     (확인: `git show origin/feature/SCRUM-200-cart-api:apps/web-buyer/src/shared/cart/index.ts`).
//     따라서 장바구니 시딩도 인메모리 스토어가 아니라 MSW 서버 카트 핸들러로 옮겨야 한다.
//   · `[AC-CHECKOUT-011]`이 단언하는 `search.orderedKeys`(라인 키 문자열 배열)는 PR에서
//     `search.orderedCartItemIds`(서버 라인 id number 배열)로 바뀐다
//     (확인: `git show origin/feature/SCRUM-200-cart-api:apps/web-buyer/src/routes/payment/result.tsx`).
//     품절 라인 제외 단언은 그 파라미터 기준으로 다시 써야 한다.
//
// PR 판본이 같은 품절 결함을 이미 고쳐 뒀으므로(그 브랜치 CheckoutScreen의 `selected && orderable`)
// 결론 자체는 양쪽이 같다. 반대로 적립금 관련 AC(012~015)는 PR에 없으니 반드시 살려서 옮긴다.
// ─────────────────────────────────────────────────────────────────────────────────────────

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { addToCart, cartLineKey, getCartItems, resetCart, setCartSelected } from '@/shared/cart'
import { POINTS_QUERY_KEY } from '@/shared/points'
import {
  DELIVERY_ADDRESSES_URL,
  POINTS_URL,
  seedDeliveryAddresses,
  seedPointBalance,
  server,
  type DeliveryAddressRow,
} from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 MSW로 네트워크에서 가로챈다(모듈 모킹 X) — "빈 목록"과 "조회 실패"를 화면이
// 구분하는지 보려면 실제 HTTP 상태까지 태워야 한다.

// router를 함께 돌려준다 — 결제 진행이 넘긴 주문 키(search.orderedKeys)를 화면 텍스트가 아니라
// 라우터 상태에서 직접 단언해야 "무엇이 주문됐는지"를 정확히 볼 수 있다.
function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...utils, router, queryClient }
}

// 결제 버튼을 열려면 기본 배송지가 필요하다(배송지 없으면 canPay가 false).
const DEFAULT_ADDRESS: DeliveryAddressRow = {
  addressId: 1,
  label: '집',
  receiverName: '김집사',
  contactNumber: '01012345678',
  zipCode: '06236',
  baseAddress: '서울 강남구 테헤란로 1',
  detailAddress: '101동 1001호',
  isDefault: true,
}

describe('/checkout 배송지 없음 상태', () => {
  beforeEach(() => {
    resetCart()
    seedDeliveryAddresses([])
  })

  it('[AC-CHECKOUT-005] 배송지가 없으면 배송지 추가 CTA를 보여주고 결제 버튼을 막는다', async () => {
    renderAt('/checkout')

    expect(
      await screen.findByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배송지 추가' })).toBeInTheDocument()
    // 배송지가 없으니 결제 버튼은 비활성이다
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-007] 배송지 조회가 실패하면 "없음"이 아니라 조회 실패로 안내한다', async () => {
    // 실패를 "배송지 없음"으로 보여주면 등록된 주소가 사라진 줄 알고 중복 등록한다.
    server.use(http.get(DELIVERY_ADDRESSES_URL, () => HttpResponse.error()))
    renderAt('/checkout')

    expect(await screen.findByText('배송지를 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.queryByText('등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.')).toBeNull()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeDisabled()
  })

  it('[AC-CHECKOUT-006] 배송지 추가 CTA는 배송지 관리 화면으로 이동한다', async () => {
    const user = userEvent.setup()
    renderAt('/checkout')

    await user.click(await screen.findByRole('button', { name: '배송지 추가' }))
    expect(await screen.findByText('배송지 관리')).toBeInTheDocument()
  })
})

describe('/checkout 적립금 사용 한도(서버 잔액)', () => {
  beforeEach(() => {
    resetCart()
    seedDeliveryAddresses([])
    seedPointBalance(0)
    // 목업 카탈로그 상품을 담아 결제금액을 만든다(주문 자체는 아직 목업). resetCart 시드가 이미
    // 냥이상점 급식기(64,000원·선택)를 담고 있어 선택 합계는 64,000 + 13,900 = 77,900원이고,
    // 무료배송 기준(30,000원)을 넘으므로 배송비는 0이다.
    addToCart('p-churu', '기본', 1)
  })

  it('[AC-POINT-CHECKOUT-004] 사용 한도는 서버 잔액이다(잔액 < 주문금액이면 최대 = 잔액)', async () => {
    // 잔액은 최소 사용액(1,000) 이상이어야 "잔액이 상한"을 볼 수 있다 — 700원은 서버가 아예
    // 거절하는 구간이라 최대가 0으로 접히므로(AC-POINT-CHECKOUT-006) 1,200원으로 세운다.
    seedPointBalance(1200)
    renderAt('/checkout')

    // 보유·최대 사용 모두 서버 잔액(1,200)으로 제한된다 — 주문금액(77,900)이 아니라 잔액이 상한.
    expect(await screen.findByText('보유 1,200원')).toBeInTheDocument()
    expect(await screen.findByText('최대 1,200원까지 사용할 수 있어요')).toBeInTheDocument()
  })

  it('[AC-POINT-CHECKOUT-006] 잔액이 최소 사용액 미만이면 쓸 수 없다고 안내하고 입력을 막는다', async () => {
    // BE OrderGroup.create는 1~999원을 400/50103(POINT_BELOW_MINIMUM_USAGE)로 거절한다.
    // 그래서 900원 잔액으로는 사용 가능액이 0이고, 최대 0원이라고만 쓰면 왜 막혔는지 알 수 없다.
    seedPointBalance(900)
    renderAt('/checkout')

    expect(await screen.findByText('보유 900원')).toBeInTheDocument()
    expect(screen.getByText('적립금은 1,000원부터 사용할 수 있어요')).toBeInTheDocument()
    expect(screen.queryByText(/최대 .*까지 사용할 수 있어요/)).toBeNull()
    // 입력해도 0으로 정규화되는 죽은 입력이 되지 않게 입력창·전액사용을 함께 잠근다.
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
  })

  it('[AC-POINT-CHECKOUT-005] 잔액 조회 실패는 잔액 부족과 갈라 안내하고 사용 가능 0으로 강하한다', async () => {
    seedPointBalance(700)
    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    renderAt('/checkout')

    // 조회 실패와 "잔액이 최소 사용액 미만"은 다른 사정이다 — 같은 문구로 뭉치면 5만 포인트를 가진
    // 사용자에게도 "1,000원부터 사용할 수 있어요"라고 거짓 사유를 말한다. 잔액도 모르는 것이지
    // 0원인 것이 아니라서 금액 자리는 마이페이지 허브와 같은 표기(—)로 둔다.
    expect(
      await screen.findByText('적립금을 불러오지 못해 이 주문에는 사용할 수 없어요'),
    ).toBeInTheDocument()
    expect(screen.getByText('보유 —')).toBeInTheDocument()
    expect(screen.queryByText('적립금은 1,000원부터 사용할 수 있어요')).toBeNull()
    // 사용 가능액은 0으로 안전 강하 — 입력창·전액사용은 잠기고 화면(결제 버튼)은 그대로 렌더.
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-013] 2,500원처럼 1,000원대 밖 금액도 타이핑으로 입력할 수 있다', async () => {
    // 회귀 방지 장치다. onChange가 하한(1,000원)을 강제하던 동안에는 `2`를 누른 즉시 입력값이
    // 1000이 되고 이어 누른 `5`가 10005가 돼, 2,500원 같은 값에 어떤 타이핑 순서로도 도달할 수
    // 없었다. 하한은 입력이 끝난 뒤(포커스 이탈·결제 직전)에만 적용돼야 한다.
    const user = userEvent.setup()
    seedPointBalance(50000)
    renderAt('/checkout')

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())

    await user.type(input, '2')
    expect(input).toHaveValue('2')
    await user.type(input, '5')
    expect(input).toHaveValue('25')
    await user.type(input, '00')
    expect(input).toHaveValue('2500')

    // 입력이 끝나도 되튀지 않고, 그 금액이 결제 요약에 그대로 반영된다.
    await user.tab()
    expect(input).toHaveValue('2500')
    expect(screen.getByText('-2,500원')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-014] 하한 미만 입력은 포커스 이탈 시 0으로 내리고 사유를 안내한다', async () => {
    // 1~999원은 서버가 400/50103으로 거절하는 구간이다. 1,000원으로 올리면 사용자가 의도한 금액보다
    // 많이 쓰게 되므로(적립금은 사용자 자산) 0으로 내리고, 왜 적용되지 않는지는 입력 중에 미리 알린다.
    const user = userEvent.setup()
    seedPointBalance(50000)
    renderAt('/checkout')

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())

    await user.type(input, '250')
    expect(input).toHaveValue('250')
    expect(
      screen.getByText('적립금은 1,000원부터 쓸 수 있어 그보다 적은 금액은 적용되지 않아요'),
    ).toBeInTheDocument()
    // 금액에는 처음부터 반영하지 않는다 — 적용될 것처럼 보이다가 되돌아가면 금액이 튄다.
    expect(screen.queryByText('적립금 사용')).toBeNull()

    await user.tab()
    expect(input).toHaveValue('0')
    expect(screen.getByText('최대 50,000원까지 사용할 수 있어요')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-015] 사용 상한이 줄면 입력값도 함께 내려간다', async () => {
    // 입력 시점의 결제금액·잔액으로만 자른 값을 그대로 두면 잔액이 더 작은 값으로 refetch된 뒤에도
    // points > usablePoints 상태가 남고, 그 주문은 서버가 422/50102(또는 400/50103)로 거절한다.
    const user = userEvent.setup()
    seedPointBalance(50000)
    const { queryClient } = renderAt('/checkout')

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '20000')
    expect(input).toHaveValue('20000')

    seedPointBalance(1500)
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: POINTS_QUERY_KEY })
    })

    await waitFor(() => expect(input).toHaveValue('1500'))
    expect(screen.getByText('최대 1,500원까지 사용할 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('-1,500원')).toBeInTheDocument()
  })

  it('[AC-CHECKOUT-018] 재조회가 실패하면 직전 잔액으로 계속 차감하지 않는다', async () => {
    // AC-POINT-CHECKOUT-005는 **첫 조회** 실패만 본다. 재조회 실패는 모양이 다르다 — Query가 직전
    // 성공 값을 그대로 들고 있어서 `balance`가 undefined가 되지 않고, `?? 0` 폴백을 비껴간다.
    // 그대로 두면 화면은 "지금은 쓸 수 없다"고 안내하면서 입력창과 이미 넣은 차감은 살아 있다.
    const user = userEvent.setup()
    seedPointBalance(50000)
    const { queryClient } = renderAt('/checkout')

    const input = await screen.findByRole('textbox')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '20000')
    expect(screen.getByText('-20,000원')).toBeInTheDocument()

    server.use(http.get(POINTS_URL, () => HttpResponse.error()))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: POINTS_QUERY_KEY })
    })

    // 안내와 동작이 일치해야 한다 — 안내만 바뀌고 차감이 남으면 결제 금액이 거짓이 된다.
    await waitFor(() =>
      expect(screen.getByText('적립금을 불러오지 못해 이 주문에는 사용할 수 없어요')).toBeInTheDocument(),
    )
    expect(input).toHaveValue('0')
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '전액사용' })).toBeDisabled()
    expect(screen.queryByText('-20,000원')).toBeNull()
  })
})

describe('/checkout 품절 라인 결제 제외', () => {
  beforeEach(() => {
    resetCart()
    seedPointBalance(0)
    seedDeliveryAddresses([DEFAULT_ADDRESS])
  })

  it('[AC-CHECKOUT-011] 품절 라인을 체크한 채 결제해도 주문 키·주문 요약에서 빠진다', async () => {
    const user = userEvent.setup()
    // 시드는 품절 라인(멍멍마트 스크래쳐)을 미선택으로 둬 이 결함이 재현되지 않는다 —
    // 장바구니에서 품절도 체크할 수 있으므로(전체 선택/선택 삭제 대상) 체크된 상태를 만든다.
    const soldOutKey = cartLineKey('p-scratcher', '기본')
    const orderableKey = cartLineKey('p-feeder-5l', '용량 5L / 화이트')
    setCartSelected(soldOutKey, true)

    const { router } = renderAt('/checkout')

    // 배송지가 로드되면 결제 버튼이 열린다.
    expect(await screen.findByText(/김집사/)).toBeInTheDocument()
    // 품절 라인은 금액(itemsTotal)에 들어가지 않으므로 주문 상품 요약에도 나오면 안 된다.
    expect(screen.queryByText(/스크래쳐/)).toBeNull()

    await user.click(screen.getByRole('checkbox', { name: /결제에 동의해요/ }))
    await user.click(screen.getByRole('button', { name: /결제하기/ }))

    // 결제 진행으로 넘긴 주문 키에 품절 라인이 섞이면 결제되지 않은 상품이 주문 내역에 실리고
    // 장바구니에서도 지워진다 — 주문 가능 라인 하나만 넘어가야 한다.
    await waitFor(() => {
      const search = router.state.location.search as { orderedKeys?: string[] }
      expect(search.orderedKeys).toEqual([orderableKey])
    })

    // 결제가 완료돼도 품절 라인은 장바구니에 남는다(주문되지 않았으므로).
    expect(await screen.findByText('결제가 완료되었어요', {}, { timeout: 3000 })).toBeInTheDocument()
    const after = getCartItems()
    expect(after.some(i => cartLineKey(i.productId, i.option) === soldOutKey)).toBe(true)
    expect(after.some(i => cartLineKey(i.productId, i.option) === orderableKey)).toBe(false)
  })
})

describe('/checkout 바로구매 품절', () => {
  beforeEach(() => {
    resetCart()
    seedPointBalance(0)
    seedDeliveryAddresses([DEFAULT_ADDRESS])
  })

  it('[AC-CHECKOUT-016] 바로구매 상품이 품절이면 사유 없는 빈 주문서 대신 품절 안내를 보여준다', async () => {
    // 주문 요약은 `selected && orderable`로 거르므로 품절 상품으로 바로구매 URL에 직접 들어오면
    // 주문 상품 블록과 결제 버튼이 함께 사라진다. 그런데 상품이 해석되긴 했으므로(view.isEmpty=false)
    // "상품을 확인할 수 없어요" 분기에는 걸리지 않아, 이유를 알 수 없는 빈 주문서가 남았다.
    renderAt('/checkout?buyNow=p-scratcher')

    expect(await screen.findByText('품절된 상품이에요')).toBeInTheDocument()
    expect(screen.getByText('지금은 주문할 수 없어요. 다른 상품을 선택해 주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /결제하기/ })).toBeNull()
  })

  it('[AC-CHECKOUT-017] 바로구매 상품이 주문 가능하면 주문서가 정상 렌더된다', async () => {
    // 위 가드가 정상 바로구매까지 삼키지 않는지 함께 고정한다(과잉 차단 회귀 방지).
    renderAt('/checkout?buyNow=p-churu')

    expect(await screen.findByText(/츄르 참치맛/)).toBeInTheDocument()
    expect(screen.queryByText('품절된 상품이에요')).toBeNull()
    expect(screen.getByRole('button', { name: /결제하기/ })).toBeInTheDocument()
  })
})

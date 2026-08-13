import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { CartItem, PaymentMethod } from '@aechak/domain'
import { cartLineKey } from '@aechak/domain'
import { Button, MobileScreen } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { getCartItems, removeManyFromCart } from '@/shared/cart'
import { buildCartView, buildOrderFromContext } from '@/shared/catalog'
import { addOrder } from '@/shared/order'
import { useProcessPayment } from '../payment.queries'
import { generateOrderNo } from '../payment.mock'

// 결제 성공 시 주문 이력에 찍는 주문일시(목업, 오늘 고정).
const ORDERED_AT = '2026.07.10 09:41'

export interface PaymentResultScreenProps {
  amount: number
  method: PaymentMethod
  /** 'cart'면 결제 성공 시 주문된 장바구니 라인만 비운다. 'buynow'면 장바구니를 건드리지 않음. */
  source: 'cart' | 'buynow'
  /** 바로구매 컨텍스트(source==='buynow') — '결제수단 변경'이 이 주문으로 되돌아가도록 보존한다. */
  buyNow?: string
  option?: string
  qty?: number
  /** 바로구매 옵션 조합 추가금(원) — 주문 스냅샷 단가에 반영한다. */
  addl?: number
  /** 장바구니 결제(source==='cart')로 실제 주문된 라인 키 — 성공 시 정확히 이 라인만 제거한다. */
  orderedKeys?: string[]
}

// 결제 진행/완료/실패(b1-st-5). 진입 시 결제 mutation을 한 번 실행해 진행 스피너 → 성공/실패 프레임으로 전환한다.
export function PaymentResultScreen({
  amount,
  method,
  source,
  buyNow,
  option,
  qty,
  addl,
  orderedKeys,
}: PaymentResultScreenProps) {
  const navigate = useNavigate()
  const mutation = useProcessPayment()

  // 이 결제 화면(=이 결제 세션)의 주문번호. lazy 초기화라 인스턴스당 정확히 한 번만 생성되고
  // StrictMode의 이펙트 이중 실행에서도 같은 값이 유지된다 — 같은 결제의 두 발화는 같은
  // 주문번호(→ 주문 스토어 upsert 1건), 서로 다른 결제(다른 인스턴스)는 다른 번호(→ 별개 주문).
  const [orderNo] = useState(generateOrderNo)

  // 주문할 라인(바로구매=단일 상품, 장바구니=주문된 키). 하드 리프레시 시 레지스트리/장바구니가
  // 비어 상품이 해석되지 않을 수 있어, 결제 실행 여부 판정과 주문 조립이 같은 값을 쓰도록 메모이즈한다.
  const orderedItems = useMemo<CartItem[]>(
    () =>
      source === 'buynow'
        ? buyNow
          ? [
              {
                productId: buyNow,
                option: option ?? '기본',
                quantity: Math.max(1, qty ?? 1),
                selected: true,
                additionalPrice: addl,
              },
            ]
          : []
        : getCartItems().filter(i => (orderedKeys ?? []).includes(cartLineKey(i.productId, i.option))),
    [source, buyNow, option, qty, addl, orderedKeys],
  )

  // 주문 컨텍스트가 상품으로 해석되지 않으면(하드 리프레시로 인메모리 상태가 빔) 목업 결제를
  // 실행해 "결제 성공했지만 주문 없음"을 만들지 않고 장바구니로 되돌린다.
  const orderResolvable = !buildCartView(orderedItems).isEmpty

  const run = () => {
    mutation.mutate(
      { amount, method, orderNo },
      {
        onSuccess: res => {
          if (!res.ok) return
          // 방금 결제한 주문을 이력에 추가한다(주문번호가 결정적이라 StrictMode 이중 실행에도 중복 안 됨).
          const order = buildOrderFromContext({
            orderNo: res.orderNo,
            method: res.method,
            paidAmount: res.amount,
            orderedAt: ORDERED_AT,
            items: orderedItems,
          })
          if (order) addOrder(order)
          // 주문된 라인(뷰 기준 선택 가능+선택 = orderedKeys)만 제거한다. raw selected 플래그로
          // 지우면 주문 대상이 아니던 품절 라인까지 사라지므로 정확한 키 목록으로만 제거.
          if (source === 'cart') removeManyFromCart(orderedKeys ?? [])
        },
      },
    )
  }

  // 실패 후 '결제수단 변경' — 바로구매면 그 컨텍스트를 보존한 채 주문서로 돌아가야 다른 주문
  // (장바구니 합계)을 잘못 청구하지 않는다. 장바구니 결제는 파라미터 없이 돌아가 라이브 장바구니를 다시 계산.
  const changeMethod = () => {
    // 결제 화면을 replace로 나가 히스토리에서 빼면 실패 화면이 뒤로가기로 재진입되지 않는다.
    if (source === 'buynow' && buyNow) {
      navigate({ to: '/checkout', search: { buyNow, option, qty, addl }, replace: true })
    } else {
      navigate({ to: '/checkout', replace: true })
    }
  }

  // 마운트 시 결제를 실행한다. StrictMode(개발)에서 이펙트가 두 번 실행돼도 mutate는 멱등하고
  // onSuccess의 removeManyFromCart(orderedKeys)도 멱등이라 안전하다 — ref 가드를 두면 StrictMode
  // 리마운트 시 살아남는 인스턴스의 mutation이 발화하지 않아 진행 스피너에서 멈추므로 가드를 두지 않는다.
  useEffect(() => {
    // 컨텍스트가 해석 불가면 결제를 발화하지 않고 장바구니로 되돌린다(가짜 결제 성공 방지).
    if (!orderResolvable) {
      navigate({ to: '/cart', replace: true })
      return
    }
    run()
    // 재시도는 "다시 시도" 버튼이 run()을 다시 호출해 처리한다.
  }, [])

  const result = mutation.data
  const processing = !result

  // 컨텍스트가 해석되지 않으면 결제 진행 스피너를 보여주지 않는다 — 느린 웹뷰에서 결제가 시작된 것처럼
  // 보이지 않게 복구 안내만 렌더하고, 위 이펙트가 곧 장바구니로 이동시킨다.
  if (!orderResolvable) {
    return (
      <MobileScreen>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-10 text-center">
          <p className="text-heading font-bold text-text-primary">주문 정보를 확인할 수 없어요</p>
          <p className="text-body-sm text-text-tertiary">장바구니로 이동해 다시 시도해 주세요.</p>
        </div>
      </MobileScreen>
    )
  }

  // 진행 중 — 이탈 방지를 위해 뒤로가기 앱바를 두지 않는다.
  if (processing) {
    return (
      <MobileScreen>
        <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
          <Loader2 className="size-10 animate-spin text-brand" />
          <p className="text-heading font-bold text-text-primary">결제를 진행하고 있어요</p>
          <p className="text-body-sm text-text-tertiary">창을 닫지 말고 잠시만 기다려 주세요</p>
        </div>
      </MobileScreen>
    )
  }

  if (result.ok) {
    // 결제 결과 화면은 일회성 전환 화면이라 히스토리에 남기지 않는다 — 완료 후 이 화면을 나갈
    // 때 replace로 교체해, 다음 화면에서 뒤로가기가 진행/결과 화면을 재진입(결제 재실행)하지
    // 않고 자연스러운 이전 지점으로 가게 한다. 완료 화면은 뒤로가기(←) 어포던스 자체를 두지
    // 않는다 — 이전을 누르면 주문서/장바구니로 돌아가므로, 이동은 아래 '홈으로'/'주문 상세 보기'
    // CTA로만 하게 헤더 없는 형태로 렌더한다(진행 스피너 화면과 동일하게 header 미지정).
    return (
      <MobileScreen>
        <div className="flex h-full flex-col px-6 pb-6 pt-4">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-full bg-success-surface text-success-fg">
              <CheckCircle2 className="size-10" />
            </span>
            <p className="text-title font-bold text-text-primary">결제가 완료되었어요</p>
            <div className="flex w-full flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-text-tertiary">주문번호</span>
                <span className="tabular-nums text-text-primary">{result.orderNo}</span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-text-tertiary">결제금액</span>
                <span className="text-price-sm font-semibold text-text-price">{formatKRW(result.amount)}</span>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => navigate({ to: '/', replace: true })}
            >
              홈으로
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() =>
                navigate({ to: '/orders/$orderId', params: { orderId: result.orderNo }, replace: true })
              }
            >
              주문 상세 보기
            </Button>
          </div>
        </div>
      </MobileScreen>
    )
  }

  // 실패 — 성공 화면(위 result.ok 브랜치)과 동일한 "큰 결과" 형태로 렌더한다: error 톤 원형
  // 아이콘 + text-title 굵은 제목 + 회색 서브텍스트(실패 사유)를 flex-1 영역에서 세로 중앙
  // 정렬(items-center justify-center). 컨테이너 패딩도 성공과 같은 px-6 pt-4로 맞춰 정렬 리듬을
  // 통일한다. 단 성공과 달리 뒤로가기(←, 장바구니로) 앱바를 유지하고(재시도 흐름이 맞음),
  // 결제수단 변경/다시 시도 버튼과 replace 네비 규칙은 그대로 둔다.
  return (
    <MobileScreen
      header={<BackAppBar onBack={() => navigate({ to: '/cart', replace: true })} title="결제 실패" />}
    >
      <div className="flex h-full flex-col px-6 pb-6 pt-4">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-full bg-error-surface text-error-fg">
            <XCircle className="size-10" />
          </span>
          <p className="text-title font-bold text-text-primary">결제에 실패했어요</p>
          <p className="text-center text-body-sm text-text-tertiary">
            {result.failReason ?? '결제를 완료하지 못했어요. 다시 시도해 주세요.'}
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={changeMethod}>
            결제수단 변경
          </Button>
          <Button size="lg" className="flex-1" loading={mutation.isPending} onClick={run}>
            다시 시도
          </Button>
        </div>
      </div>
    </MobileScreen>
  )
}

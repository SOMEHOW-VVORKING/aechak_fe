// ─── 머지 주의 — origin/feature/SCRUM-200-cart-api ───────────────────────────────────────
// 이 파일은 팀원 오픈 PR `origin/feature/SCRUM-200-cart-api`(장바구니 서버 연동)가 통째로 재작성하는
// 대상이다. 그 PR은 아래 품절 라인 결함을 **이미 같은 결론으로 고쳐 뒀다** — 그 브랜치의 결제
// 핸들러도 `.filter(l => l.selected && l.orderable)`를 쓰고, 주문 요약도 같은 기준으로 거른다.
// 확인: `git show origin/feature/SCRUM-200-cart-api:apps/web-buyer/src/features/checkout/components/CheckoutScreen.tsx`
//
// PR이 8주 정지 상태이고 아직 없는 엔드포인트(`GET /carts/items/count`)에 묶여 있어 머지를 기다리는
// 대신 결함 수정을 이 브랜치에 남겼다. 그래서 충돌이 나지만 양쪽 결론이 같아 해결은 자명하다 —
// PR 판본을 택하면 된다. 다만 머지 담당자는 아래를 함께 손봐야 한다.
//
//   · 장바구니 주문 전달 파라미터가 `orderedKeys: string[]`(라인 키)에서
//     `orderedCartItemIds: number[]`(서버 라인 id)로 바뀐다
//     (`git show origin/feature/SCRUM-200-cart-api:apps/web-buyer/src/routes/payment/result.tsx`).
//   · 장바구니 선택 상태 API가 `setCartSelected` → `setCartItemSelected`/`getDeselectedCartItemIds`로,
//     라인 읽기가 `useCartItems` → `useCartView`로 교체된다
//     (`git show origin/feature/SCRUM-200-cart-api:apps/web-buyer/src/shared/cart/index.ts`).
//   · 이 파일의 **적립금 입력 관련 수정은 PR에 없다** — `clampPointsInput`(입력 중 상한만),
//     포커스 이탈·결제 직전 하한 커밋, 상한 축소 시 재정규화, 잔액 조회 실패 안내, 바로구매 품절
//     안내는 PR 판본 위로 반드시 다시 옮겨야 한다.
//   · 짝이 되는 테스트 `../__tests__/checkout-route.test.tsx`도 머지 뒤 그대로는 컴파일되지 않는다
//     (그 파일 머리의 머지 주의 참조).
// ─────────────────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Image as ImageIcon, MapPin, Plus } from 'lucide-react'
import type { CartItem, PaymentMethod } from '@aechak/domain'
import {
  BottomFixedAction,
  Button,
  Checkbox,
  EmptyState,
  Input,
  MobileScreen,
  Radio,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import { useCartItems } from '@/shared/cart'
import { formatPhone, useDefaultDeliveryAddress } from '@/shared/delivery-address'
import { buildCartView, type CartLineView } from '@/shared/catalog'
import { usePointBalance } from '@/shared/points'
import {
  MIN_POINT_USAGE,
  PAYMENT_METHODS,
  clampPoints,
  clampPointsInput,
  finalPayable,
  maxUsablePoints,
} from '../checkout.mock'

export interface CheckoutScreenProps {
  /** 바로 구매 진입 시 단일 상품 id(없으면 장바구니 선택 항목으로 주문). */
  buyNow?: string
  option?: string
  qty?: number
  /** 바로 구매 시 선택한 옵션 조합 추가금(원). 합계·주문 단가에 반영한다. */
  addl?: number
}

// 주문서(b1-st-4). 배송지 선택 + 주문상품 요약(셀러별) + 적립금 적용 + 결제수단 라디오 +
// 약관 동의 + 최종 결제금액 계산. 쿠폰/정기배송 OFF.
export function CheckoutScreen({ buyNow, option = '기본', qty = 1, addl }: CheckoutScreenProps) {
  const navigate = useNavigate()

  const cartItems = useCartItems()
  // 배송지는 이제 서버에서 비동기로 온다 — 로딩 중엔 스켈레톤, 없으면 추가 CTA를 보여준다.
  const {
    address: defaultAddress,
    isLoading: addressLoading,
    isError: addressError,
    refetch: refetchAddress,
  } = useDefaultDeliveryAddress()

  // 바로 구매면 단일 상품으로 즉석 뷰를, 아니면 장바구니 라인으로 뷰를 만든다(같은 buildCartView 재사용).
  const view = useMemo(() => {
    const items: CartItem[] = buyNow
      ? [{ productId: buyNow, option, quantity: Math.max(1, qty), selected: true, additionalPrice: addl }]
      : [...cartItems]
    return buildCartView(items)
  }, [buyNow, option, qty, addl, cartItems])

  // 주문 요약에는 실제 결제 대상 라인만 노출한다 — 뷰와 같은 기준(선택 + 주문 가능)을 쓴다.
  // 품절 라인은 체크돼 있어도 금액(itemsTotal)에 안 들어가므로, 요약에 남기면 결제되지 않는
  // 상품을 주문 상품으로 보여주고 hasOrder까지 켜서 0원 결제를 허용하게 된다.
  const orderGroups = view.groups
    .map(g => ({ storeName: g.storeName, lines: g.lines.filter(l => l.selected && l.orderable) }))
    .filter(g => g.lines.length > 0)

  // 적립금 잔액은 서버 소유다(shared/points). 로딩·조회 실패 시 사용 가능 포인트를 0으로 안전
  // 강하시켜 잘못된 잔액으로 과다 차감되지 않게 한다 — 화면 동작은 유지.
  // 다만 "조회를 못 했다"와 "잔액이 모자라다"는 다른 사정이라 안내 문구를 갈라야 한다(아래 pointsHint).
  const { balance: rawPointBalance, isLoading: pointsLoading, isError: pointsError } = usePointBalance()
  // `?? 0` 폴백만으로는 **재조회 실패**를 못 막는다 — Query는 재조회가 실패해도 직전 성공 값을
  // 그대로 들고 있어서 `balance`가 undefined가 되지 않는다. 그 값을 계속 쓰면 화면은 "지금은 쓸 수
  // 없다"고 안내하면서 입력창과 전액사용은 살아 있고 이미 넣은 차감도 유지되는 모순이 생긴다.
  // 오류 상태에서는 계산용 잔액도 0으로 내려 안내와 동작을 일치시킨다.
  const pointBalance = pointsError ? 0 : (rawPointBalance ?? 0)
  // 잔액을 모르는 상태에서 `보유 0원`이라고 쓰면 5만 포인트를 가진 사용자에게 거짓을 말한다 —
  // 마이페이지 허브와 같은 표기(—)로 맞춘다.
  const pointBalanceUnknown = pointsLoading || pointsError

  const [method, setMethod] = useState<PaymentMethod>('kakaopay')
  const [points, setPoints] = useState(0)
  const [agree, setAgree] = useState(false)

  const payableBeforePoints = view.itemsTotal + view.shippingTotal
  const usablePoints = maxUsablePoints(payableBeforePoints, pointBalance)
  // 입력창은 원시 입력(points)을 비추지만 **금액 계산은 항상 정규화된 사용액**을 쓴다 — 하한 미만
  // 구간을 금액에 그대로 반영하면 적용될 것처럼 보이다가 포커스 이탈 때 되돌아가 금액이 튄다.
  const effectivePoints = clampPoints(points, payableBeforePoints, pointBalance)
  const payable = finalPayable(view.itemsTotal, view.shippingTotal, effectivePoints)

  // 적립금 상한이 **줄면** 입력값도 함께 내린다. 입력 시점의 결제금액·잔액으로만 자른 값을 그대로
  // 두면(잔액 쿼리가 더 작은 값으로 refetch되는 경우 등) points > usablePoints 상태가 남고, 그
  // 주문은 서버가 422/50102(POINT_EXCEEDS_PAYABLE_AMOUNT) 또는 400/50103으로 거절한다.
  // 상한 자체가 서버가 받아주는 값(0이거나 최소 사용액 이상)이라 그 값으로 내리면 항상 유효하다.
  // 상한이 커지는 방향으로는 손대지 않는다 — 사용자가 적게 쓰려고 넣은 값을 멋대로 올리지 않는다.
  useEffect(() => {
    setPoints(prev => Math.min(prev, usablePoints))
  }, [usablePoints])

  // 적립금을 쓸 수 없거나 입력이 받아들여지지 않는 사유가 서로 다른데 한 문구로 뭉치면 거짓 안내가
  // 된다 — (a) 조회 중, (b) 조회 실패로 상한이 0인 상태, (c) 잔액이 최소 사용액 미만, (d) 결제금액이
  // 작아 최소 결제 금액을 남기면 1,000원을 뺄 수 없는 경우, (e) 입력값이 하한 미만인 경우를 가른다.
  // (e)를 미리 알리지 않으면 포커스를 옮기는 순간 금액이 0이 되는 이유를 알 수 없다.
  let pointsHint: string
  if (pointsLoading) {
    pointsHint = '적립금을 확인하고 있어요'
  } else if (pointsError) {
    pointsHint = '적립금을 불러오지 못해 이 주문에는 사용할 수 없어요'
  } else if (usablePoints === 0) {
    pointsHint =
      pointBalance < MIN_POINT_USAGE
        ? `적립금은 ${formatKRW(MIN_POINT_USAGE)}부터 사용할 수 있어요`
        : '결제 금액이 작아 이 주문에는 적립금을 쓸 수 없어요'
  } else if (points > 0 && points < MIN_POINT_USAGE) {
    pointsHint = `적립금은 ${formatKRW(MIN_POINT_USAGE)}부터 쓸 수 있어 그보다 적은 금액은 적용되지 않아요`
  } else {
    pointsHint = `최대 ${formatKRW(usablePoints)}까지 사용할 수 있어요`
  }

  // 하한(최소 사용액) 정규화는 입력이 끝난 뒤 한 번만 한다 — 입력 중에 강제하면 1,000원대 밖 금액을
  // 아예 입력할 수 없다(checkout.mock의 clampPointsInput 주석 참조). 포커스 이탈과 결제 제출 직전이
  // 그 "끝난 뒤"이고, 결제 직전에도 한 번 더 하는 이유는 키보드로 바로 제출하는 경로가 있어서다.
  const commitPoints = () => {
    if (effectivePoints !== points) setPoints(effectivePoints)
  }

  const goBack = useSafeBack({ to: '/cart' })

  const goAddresses = () => navigate({ to: '/addresses', search: { from: 'checkout' } })

  const hasOrder = orderGroups.length > 0
  const canPay = hasOrder && defaultAddress != null && agree

  // 바로구매인데 상품이 해석되지 않으면(예: 실 상품 URL로 하드 리프레시 → 인메모리 레지스트리가
  // 비어 findProduct 미스) 빈 주문서 대신 안내를 띄운다. 정상 SPA 흐름은 레지스트리가
  // 채워져 있어 이 분기를 타지 않는다.
  const unresolvedBuyNow = buyNow != null && view.isEmpty

  // 상품은 해석됐지만 품절이면 orderGroups가 비어 주문 요약·결제 버튼이 모두 사라진다 — view.isEmpty
  // 기준인 위 분기로는 안 걸려 사유 없는 빈 주문서가 남는다. 상품 상세가 품절 상품의 구매 버튼을
  // 막으므로(ProductDetailScreen) 도달 경로는 URL 직접 진입뿐이지만, 그때도 이유는 보여야 한다.
  const soldOutBuyNow = buyNow != null && !view.isEmpty && orderGroups.length === 0

  const handlePay = () => {
    if (!canPay) return
    // 입력 중에는 하한을 적용하지 않으므로 제출 직전에 입력 state도 정규화해 둔다(결제 금액
    // payable은 이미 effectivePoints 기준이라 그대로 넘긴다). 키보드로 바로 제출하는 경로 때문에
    // 포커스 이탈만 믿지 않는다.
    commitPoints()
    // 결제 결과는 일회성 전환 화면이라 주문서를 replace로 교체한다 — 결제 완료 후 뒤로가기가
    // 주문서(결제 화면)로 되돌아가 결제를 재실행하지 않게 한다.
    if (buyNow) {
      // 바로구매 컨텍스트를 결제 결과로 넘겨(결제수단 변경 시 이 주문으로 복귀) 다른 주문 금액을
      // 잘못 청구하지 않게 한다.
      navigate({
        to: '/payment/result',
        search: { amount: payable, method, source: 'buynow', buyNow, option, qty: Math.max(1, qty), addl },
        replace: true,
      })
      return
    }
    // 장바구니 결제 — 실제 주문된(뷰 기준 주문 가능+선택) 라인 키만 넘겨 성공 시 정확히 그 라인만
    // 비운다. `selected`만 보면 품절 라인까지 섞여, 결제되지 않은 상품이 주문 내역에 실리고
    // 장바구니에서도 사라진다(금액은 cart-view가 selected && orderable로만 세기 때문).
    const orderedKeys = view.groups
      .flatMap(g => g.lines)
      .filter(l => l.selected && l.orderable)
      .map(l => l.key)
    navigate({
      to: '/payment/result',
      search: { amount: payable, method, source: 'cart', orderedKeys },
      replace: true,
    })
  }

  if (unresolvedBuyNow || soldOutBuyNow) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문서" />}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title={soldOutBuyNow ? '품절된 상품이에요' : '주문할 상품을 확인할 수 없어요'}
            description={
              soldOutBuyNow
                ? '지금은 주문할 수 없어요. 다른 상품을 선택해 주세요.'
                : '상품을 다시 선택해 주세요.'
            }
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="주문서" />}
      footer={
        <BottomFixedAction
          primary={{
            label: `${formatKRW(payable)} 결제하기`,
            onClick: handlePay,
            disabled: !canPay,
          }}
        />
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {/* 배송지 */}
        {addressLoading ? (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <MapPin className="size-4 text-brand" />
              <span className="text-label font-semibold text-text-primary">배송지</span>
            </div>
            <Skeleton variant="text" className="h-4 w-40" />
            <Skeleton variant="text" className="mt-1.5 h-4 w-56" />
          </div>
        ) : addressError ? (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <MapPin className="size-4 text-brand" />
              <span className="text-label font-semibold text-text-primary">배송지</span>
            </div>
            {/* 조회 실패를 '배송지 없음'으로 보여주면 등록된 주소가 사라진 줄 알고 중복 등록한다. */}
            <p className="text-body-sm text-text-secondary">배송지를 불러오지 못했어요.</p>
            <Button variant="secondary" size="md" fullWidth onClick={() => void refetchAddress()} className="mt-3">
              다시 시도
            </Button>
          </div>
        ) : defaultAddress ? (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-4 text-brand" />
                <span className="text-label font-semibold text-text-primary">배송지</span>
                {defaultAddress.isDefault && (
                  <StatusPill variant="brand" size="sm">
                    기본
                  </StatusPill>
                )}
              </div>
              <button type="button" onClick={goAddresses} className="text-caption text-text-link">
                변경
              </button>
            </div>
            <p className="text-body-sm text-text-primary">
              {defaultAddress.recipient} / {formatPhone(defaultAddress.phone)}
            </p>
            <p className="mt-0.5 text-body-sm text-text-secondary">
              {defaultAddress.address1}
              {defaultAddress.address2 ? ` ${defaultAddress.address2}` : ''}
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <MapPin className="size-4 text-brand" />
              <span className="text-label font-semibold text-text-primary">배송지</span>
            </div>
            <p className="text-body-sm text-text-secondary">
              등록된 배송지가 없어요. 배송지를 추가해야 주문할 수 있어요.
            </p>
            <Button
              variant="primary"
              size="md"
              fullWidth
              leftIcon={<Plus className="size-[18px]" />}
              onClick={goAddresses}
              className="mt-3"
            >
              배송지 추가
            </Button>
          </div>
        )}

        {/* 주문 상품(셀러별) */}
        {orderGroups.map(group => (
          <div key={group.storeName} className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <p className="mb-2.5 text-caption font-semibold text-text-tertiary">주문 상품 / {group.storeName}</p>
            <div className="flex flex-col gap-3">
              {group.lines.map(line => (
                <OrderLine key={line.key} line={line} />
              ))}
            </div>
          </div>
        ))}

        {/* 적립금 */}
        <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-label font-semibold text-text-primary">적립금</span>
            <span className="text-caption text-text-tertiary">
              보유 {pointBalanceUnknown ? '—' : formatKRW(pointBalance)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Input을 flex-1 래퍼로 감싼다 — DS Input에 flex-1을 직접 주면 field div(내부
                flex-col 안)에 걸려 높이가 무너지므로(우편번호 필드와 동일 이슈) 래퍼로 늘린다. */}
            <div className="flex-1">
              <Input
                value={String(points)}
                inputMode="numeric"
                // 쓸 수 있는 금액이 없으면 입력해도 0으로 정규화돼 죽은 입력이 된다 — 막아 둔다.
                disabled={usablePoints === 0}
                rightAddon={<span className="text-body-sm text-text-tertiary">원</span>}
                // 입력 중에는 상한만 적용해 원시 입력을 그대로 둔다 — 하한을 여기서 강제하면
                // 1,000원대 밖 금액을 어떤 타이핑 순서로도 입력할 수 없다(2 → 1000 → 10005).
                onChange={e => {
                  const parsed = Number(e.target.value.replace(/[^0-9]/g, ''))
                  setPoints(clampPointsInput(parsed, payableBeforePoints, pointBalance))
                }}
                // 입력이 끝난 시점에 하한을 한 번만 적용한다(1,000원 미만은 0으로).
                onBlur={() => commitPoints()}
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={() => setPoints(usablePoints)}
              disabled={usablePoints === 0}
              className="flex-none"
            >
              전액사용
            </Button>
          </div>
          <p className="mt-1.5 text-caption text-text-tertiary">{pointsHint}</p>
        </div>

        {/* 결제 수단 */}
        <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
          <p className="mb-2.5 text-label font-semibold text-text-primary">결제 수단</p>
          <div className="flex flex-col gap-1">
            {PAYMENT_METHODS.map(pm => (
              <div
                key={pm.value}
                className={[
                  'flex items-center rounded-input border px-3 py-2.5 transition-colors',
                  method === pm.value ? 'border-brand bg-brand-subtle/40' : 'border-border',
                ].join(' ')}
              >
                <Radio
                  name="payment-method"
                  value={pm.value}
                  checked={method === pm.value}
                  onChange={() => setMethod(pm.value)}
                  label={pm.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 결제 요약 */}
        <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
          <SummaryRow label="상품금액" value={formatKRW(view.itemsTotal)} />
          <SummaryRow
            label="배송비"
            value={view.shippingTotal === 0 ? '무료' : formatKRW(view.shippingTotal)}
            valueClass={view.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
          />
          {effectivePoints > 0 && (
            <SummaryRow
              label="적립금 사용"
              value={`-${formatKRW(effectivePoints)}`}
              valueClass="text-text-accent"
            />
          )}
          <div className="my-0.5 h-px bg-border-subtle" />
          <div className="flex items-baseline justify-between">
            <span className="text-subheading font-semibold text-text-primary">총 결제금액</span>
            <span className="text-price-lg font-bold text-brand">{formatKRW(payable)}</span>
          </div>
        </div>

        {/* 약관 동의 */}
        <Checkbox
          checked={agree}
          onChange={setAgree}
          label="주문 내용을 확인했으며 결제에 동의해요"
        />
      </div>
    </MobileScreen>
  )
}

function OrderLine({ line }: { line: CartLineView }) {
  const { product } = line
  return (
    <div className="flex items-start gap-3">
      <div className="size-[52px] flex-none overflow-hidden rounded-image bg-surface-sunken">
        {product.thumbnailUrl ? (
          <img src={product.thumbnailUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-icon-muted">
            <ImageIcon className="size-5" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body-sm text-text-primary">{product.name}</p>
        <p className="mt-0.5 text-caption text-text-tertiary">
          {line.option} / {line.quantity}개
        </p>
        <p className="mt-1 text-price-sm font-semibold text-text-price">{formatKRW(line.lineTotal)}</p>
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  valueClass = 'text-text-primary',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between text-body-sm">
      <span className="text-text-secondary">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  )
}

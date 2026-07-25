import { useMemo, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Image as ImageIcon, MapPin, Plus } from 'lucide-react'
import type { CartItem, PaymentMethod } from '@aechak/domain'
import {
  BottomFixedAction,
  Button,
  Checkbox,
  Input,
  MobileScreen,
  Radio,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { formatKRW } from '@/shared/formatKRW'
import { useCartItems } from '@/shared/cart'
import { formatPhone, useDefaultDeliveryAddress } from '@/shared/delivery-address'
import { buildCartView, type CartLineView } from '@/shared/catalog'
import {
  PAYMENT_METHODS,
  POINT_BALANCE,
  clampPoints,
  finalPayable,
  maxUsablePoints,
} from '../checkout.mock'

export interface CheckoutScreenProps {
  /** 바로 구매 진입 시 단일 상품 id(없으면 장바구니 선택 항목으로 주문). */
  buyNow?: string
  option?: string
  qty?: number
}

// 주문서(b1-st-4). 배송지 선택 + 주문상품 요약(셀러별) + 적립금 적용 + 결제수단 라디오 +
// 약관 동의 + 최종 결제금액 계산. 쿠폰/정기배송 OFF.
export function CheckoutScreen({ buyNow, option = '기본', qty = 1 }: CheckoutScreenProps) {
  const navigate = useNavigate()
  const router = useRouter()

  const cartItems = useCartItems()
  // 배송지는 이제 서버에서 비동기로 온다 — 로딩 중엔 스켈레톤, 없으면 추가 CTA를 보여준다.
  const { address: defaultAddress, isLoading: addressLoading } = useDefaultDeliveryAddress()

  // 바로 구매면 단일 상품으로 즉석 뷰를, 아니면 장바구니 라인으로 뷰를 만든다(같은 buildCartView 재사용).
  const view = useMemo(() => {
    const items: CartItem[] = buyNow
      ? [{ productId: buyNow, option, quantity: Math.max(1, qty), selected: true }]
      : [...cartItems]
    return buildCartView(items)
  }, [buyNow, option, qty, cartItems])

  // 주문 요약에는 선택된(=결제 대상) 라인만 노출한다.
  const orderGroups = view.groups
    .map(g => ({ storeName: g.storeName, lines: g.lines.filter(l => l.selected) }))
    .filter(g => g.lines.length > 0)

  const [method, setMethod] = useState<PaymentMethod>('kakaopay')
  const [points, setPoints] = useState(0)
  const [agree, setAgree] = useState(false)

  const payableBeforePoints = view.itemsTotal + view.shippingTotal
  const usablePoints = maxUsablePoints(payableBeforePoints)
  const payable = finalPayable(view.itemsTotal, view.shippingTotal, points)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/cart' })
  }

  const goAddresses = () => navigate({ to: '/addresses', search: { from: 'checkout' } })

  const hasOrder = orderGroups.length > 0
  const canPay = hasOrder && defaultAddress != null && agree

  const handlePay = () => {
    if (!canPay) return
    // 결제 결과는 일회성 전환 화면이라 주문서를 replace로 교체한다 — 결제 완료 후 뒤로가기가
    // 주문서(결제 화면)로 되돌아가 결제를 재실행하지 않게 한다.
    if (buyNow) {
      // 바로구매 컨텍스트를 결제 결과로 넘겨(결제수단 변경 시 이 주문으로 복귀) 다른 주문 금액을
      // 잘못 청구하지 않게 한다.
      navigate({
        to: '/payment/result',
        search: { amount: payable, method, source: 'buynow', buyNow, option, qty: Math.max(1, qty) },
        replace: true,
      })
      return
    }
    // 장바구니 결제 — 실제 주문된(뷰 기준 선택 가능+선택) 라인 키만 넘겨 성공 시 정확히 그 라인만 비운다.
    const orderedKeys = view.groups.flatMap(g => g.lines).filter(l => l.selected).map(l => l.key)
    navigate({
      to: '/payment/result',
      search: { amount: payable, method, source: 'cart', orderedKeys },
      replace: true,
    })
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
            <span className="text-caption text-text-tertiary">보유 {formatKRW(POINT_BALANCE)}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Input을 flex-1 래퍼로 감싼다 — DS Input에 flex-1을 직접 주면 field div(내부
                flex-col 안)에 걸려 높이가 무너지므로(우편번호 필드와 동일 이슈) 래퍼로 늘린다. */}
            <div className="flex-1">
              <Input
                value={String(points)}
                inputMode="numeric"
                rightAddon={<span className="text-body-sm text-text-tertiary">원</span>}
                onChange={e => {
                  const parsed = Number(e.target.value.replace(/[^0-9]/g, ''))
                  setPoints(clampPoints(parsed, payableBeforePoints))
                }}
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
          <p className="mt-1.5 text-caption text-text-tertiary">최대 {formatKRW(usablePoints)}까지 사용할 수 있어요</p>
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
          {points > 0 && (
            <SummaryRow label="적립금 사용" value={`-${formatKRW(points)}`} valueClass="text-text-accent" />
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

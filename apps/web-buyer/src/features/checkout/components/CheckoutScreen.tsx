import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MapPin, Plus } from 'lucide-react'
import type { CartItem, PaymentMethod } from '@aechak/domain'
import {
  BottomFixedAction,
  Button,
  Card,
  Checkbox,
  Input,
  MobileScreen,
  Radio,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { PriceRow } from '@/shared/components/PriceRow'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import { useCartItems } from '@/shared/cart'
import { formatPhone, useDefaultDeliveryAddress } from '@/shared/delivery-address'
import { buildCartView, OrderItemsCard } from '@/shared/catalog'
import { usePointBalance } from '@/shared/points'
import { PAYMENT_METHODS, clampPoints, finalPayable, maxUsablePoints } from '../checkout.mock'

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

  // 주문 요약에는 선택된(=결제 대상) 라인만 노출한다.
  const orderGroups = view.groups
    .map(g => ({ storeName: g.storeName, lines: g.lines.filter(l => l.selected) }))
    .filter(g => g.lines.length > 0)

  // 적립금 잔액은 서버 소유다(shared/points). 로딩·조회 실패 시 사용 가능 포인트를 0으로 안전
  // 강하시켜(폴백 undefined → 0) 잘못된 잔액으로 과다 차감되지 않게 한다 — 화면 동작은 유지.
  const { balance: rawPointBalance } = usePointBalance()
  const pointBalance = rawPointBalance ?? 0

  const [method, setMethod] = useState<PaymentMethod>('kakaopay')
  const [points, setPoints] = useState(0)
  const [agree, setAgree] = useState(false)

  const payableBeforePoints = view.itemsTotal + view.shippingTotal
  const usablePoints = maxUsablePoints(payableBeforePoints, pointBalance)
  const payable = finalPayable(view.itemsTotal, view.shippingTotal, points)

  const goBack = useSafeBack({ to: '/cart' })

  const goAddresses = () => navigate({ to: '/addresses', search: { from: 'checkout' } })

  const hasOrder = orderGroups.length > 0
  const canPay = hasOrder && defaultAddress != null && agree

  // 바로구매인데 상품이 해석되지 않으면(예: 실 상품 URL로 하드 리프레시 → 인메모리 레지스트리가
  // 비어 findProduct 미스) 빈 주문서 대신 안내를 띄운다. 정상 SPA 흐름은 레지스트리가
  // 채워져 있어 이 분기를 타지 않는다.
  const unresolvedBuyNow = buyNow != null && view.isEmpty

  const handlePay = () => {
    if (!canPay) return
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
    // 장바구니 결제 — 실제 주문된(뷰 기준 선택 가능+선택) 라인 키만 넘겨 성공 시 정확히 그 라인만 비운다.
    const orderedKeys = view.groups.flatMap(g => g.lines).filter(l => l.selected).map(l => l.key)
    navigate({
      to: '/payment/result',
      search: { amount: payable, method, source: 'cart', orderedKeys },
      replace: true,
    })
  }

  if (unresolvedBuyNow) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문서" />}>
        <ScreenEmptyState
          title="주문할 상품을 확인할 수 없어요"
          description="상품을 다시 선택해 주세요."
          action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
        />
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
          <AddressSection>
            <Skeleton variant="text" className="h-4 w-40" />
            <Skeleton variant="text" className="mt-1.5 h-4 w-56" />
          </AddressSection>
        ) : addressError ? (
          <AddressSection>
            {/* 조회 실패를 '배송지 없음'으로 보여주면 등록된 주소가 사라진 줄 알고 중복 등록한다. */}
            <p className="text-body-sm text-text-secondary">배송지를 불러오지 못했어요.</p>
            <Button variant="secondary" size="md" fullWidth onClick={() => void refetchAddress()} className="mt-3">
              다시 시도
            </Button>
          </AddressSection>
        ) : defaultAddress ? (
          <AddressSection
            badge={
              defaultAddress.isDefault && (
                <StatusPill variant="brand" size="sm">
                  기본
                </StatusPill>
              )
            }
            trailing={
              <button type="button" onClick={goAddresses} className="text-caption text-text-link">
                변경
              </button>
            }
          >
            <p className="text-body-sm text-text-primary">
              {defaultAddress.recipient} / {formatPhone(defaultAddress.phone)}
            </p>
            <p className="mt-0.5 text-body-sm text-text-secondary">
              {defaultAddress.address1}
              {defaultAddress.address2 ? ` ${defaultAddress.address2}` : ''}
            </p>
          </AddressSection>
        ) : (
          <AddressSection>
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
          </AddressSection>
        )}

        {/* 주문 상품(셀러별) */}
        {orderGroups.map(group => (
          <OrderItemsCard
            key={group.storeName}
            storeName={group.storeName}
            items={group.lines.map(line => ({
              key: line.key,
              thumbnailUrl: line.product.thumbnailUrl,
              name: line.product.name,
              meta: `${line.option} / ${line.quantity}개`,
              price: formatKRW(line.lineTotal),
            }))}
          />
        ))}

        {/* 적립금 */}
        <Card className="p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-label font-semibold text-text-primary">적립금</span>
            <span className="text-caption text-text-tertiary">보유 {formatKRW(pointBalance)}</span>
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
                  setPoints(clampPoints(parsed, payableBeforePoints, pointBalance))
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
        </Card>

        {/* 결제 수단 */}
        <Card className="p-4">
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
        </Card>

        {/* 결제 요약 */}
        <Card className="flex flex-col gap-2 p-4">
          <PriceRow label="상품금액" value={formatKRW(view.itemsTotal)} />
          <PriceRow
            label="배송비"
            value={view.shippingTotal === 0 ? '무료' : formatKRW(view.shippingTotal)}
            valueClass={view.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
          />
          {points > 0 && (
            <PriceRow label="적립금 사용" value={`-${formatKRW(points)}`} valueClass="text-text-accent" />
          )}
          <Divider className="my-0.5" />
          <div className="flex items-baseline justify-between">
            <span className="text-subheading font-semibold text-text-primary">총 결제금액</span>
            <span className="text-price-lg font-bold text-brand">{formatKRW(payable)}</span>
          </div>
        </Card>

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

// 배송지 카드(로딩/오류/있음/없음 네 분기 공용 chrome + `MapPin 배송지` 헤더). 본문만 children으로 받는다.
function AddressSection({
  badge,
  trailing,
  children,
}: {
  badge?: ReactNode
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-4 text-brand" />
          <span className="text-label font-semibold text-text-primary">배송지</span>
          {badge}
        </div>
        {trailing}
      </div>
      {children}
    </Card>
  )
}

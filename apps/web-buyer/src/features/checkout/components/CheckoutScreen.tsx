import { useMemo, useState } from 'react'
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
import { useCartView } from '@/shared/cart'
import { formatPhone, useDefaultDeliveryAddress } from '@/shared/delivery-address'
import { buildCartView } from '@/shared/catalog'
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

  // 장바구니 경로는 서버 장바구니(선택 상태는 클라이언트)에서 읽는다. 바로 구매는 서버 카트를
  // 거치지 않는 단일 상품 즉석 주문이라 기존 카탈로그 뷰(buildCartView)를 그대로 쓰고, 화면이
  // 소비하지 않는 GET /carts는 발화하지 않게 게이트한다(useCartCount의 enabled 관례).
  const serverCart = useCartView({ enabled: buyNow == null })
  // 배송지는 이제 서버에서 비동기로 온다 — 로딩 중엔 스켈레톤, 없으면 추가 CTA를 보여준다.
  const {
    address: defaultAddress,
    isLoading: addressLoading,
    isError: addressError,
    refetch: refetchAddress,
  } = useDefaultDeliveryAddress()

  // 바로 구매면 단일 상품으로 즉석 뷰를 만든다.
  const buyNowView = useMemo(() => {
    if (!buyNow) return null
    const items: CartItem[] = [
      { productId: buyNow, option, quantity: Math.max(1, qty), selected: true, additionalPrice: addl },
    ]
    return buildCartView(items)
  }, [buyNow, option, qty, addl])

  // 주문 요약에는 선택된(=결제 대상) 라인만 노출한다. 서버 카트는 주문 불가(품절 등) 라인을 함께 거른다.
  const orderGroups: { storeName: string; lines: OrderLineData[] }[] = buyNowView
    ? buyNowView.groups
        .map(g => ({ storeName: g.storeName, lines: g.lines.filter(l => l.selected) as OrderLineData[] }))
        .filter(g => g.lines.length > 0)
    : (serverCart.view?.groups ?? [])
        .map(g => ({
          storeName: g.storeName,
          lines: g.lines.filter(l => l.selected && l.orderable) as OrderLineData[],
        }))
        .filter(g => g.lines.length > 0)

  // 결제 요약 합계 — 두 뷰 모두 "선택된 주문 대상" 기준으로 계산돼 있다.
  const itemsTotal = buyNowView ? buyNowView.itemsTotal : (serverCart.view?.itemsTotal ?? 0)
  const shippingTotal = buyNowView ? buyNowView.shippingTotal : (serverCart.view?.shippingTotal ?? 0)

  // 적립금 잔액은 서버 소유다(shared/points). 로딩·조회 실패 시 사용 가능 포인트를 0으로 안전
  // 강하시켜(폴백 undefined → 0) 잘못된 잔액으로 과다 차감되지 않게 한다 — 화면 동작은 유지.
  const { balance: rawPointBalance } = usePointBalance()
  const pointBalance = rawPointBalance ?? 0

  const [method, setMethod] = useState<PaymentMethod>('kakaopay')
  const [points, setPoints] = useState(0)
  const [agree, setAgree] = useState(false)

  const payableBeforePoints = itemsTotal + shippingTotal
  const usablePoints = maxUsablePoints(payableBeforePoints, pointBalance)
  const payable = finalPayable(itemsTotal, shippingTotal, points)

  const goBack = useSafeBack({ to: '/cart' })

  const goAddresses = () => navigate({ to: '/addresses', search: { from: 'checkout' } })

  const hasOrder = orderGroups.length > 0
  // 재고 초과 라인은 isOrderable=true라 주문 요약 필터를 통과한다 — CartScreen 게이트와 동일
  // 기준으로 주문서에서도 결제를 막는다(직접 진입·마운트 refetch로 재고가 줄어든 경우).
  const exceedsStockBlocked = buyNowView == null && (serverCart.view?.hasSelectedExceedsStock ?? false)
  const canPay = hasOrder && defaultAddress != null && agree && !exceedsStockBlocked

  // 바로구매인데 상품이 해석되지 않으면(예: 실 상품 URL로 하드 리프레시 → 인메모리 레지스트리가
  // 비어 findProduct 미스) 빈 주문서 대신 안내를 띄운다(codex 리뷰 #4). 정상 SPA 흐름은 레지스트리가
  // 채워져 있어 이 분기를 타지 않는다.
  const unresolvedBuyNow = buyNow != null && (buyNowView?.isEmpty ?? true)

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
    // 장바구니 결제 — 실제 주문된(선택 + 주문 가능) 서버 라인 id만 넘겨 성공 시 정확히 그 라인만 비운다.
    const orderedCartItemIds = (serverCart.view?.groups ?? [])
      .flatMap(g => g.lines)
      .filter(l => l.selected && l.orderable)
      .map(l => l.cartItemId)
    navigate({
      to: '/payment/result',
      search: { amount: payable, method, source: 'cart', orderedCartItemIds },
      replace: true,
    })
  }

  if (unresolvedBuyNow) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="주문서" />}>
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="주문할 상품을 확인할 수 없어요"
            description="상품을 다시 선택해 주세요."
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
        >
          {exceedsStockBlocked && (
            <p className="text-caption text-error-fg">
              남은 재고보다 많이 담긴 상품이 있어요. 장바구니에서 수량을 줄여주세요
            </p>
          )}
        </BottomFixedAction>
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

        {/* 주문 상품(셀러별) — 장바구니 경로는 서버 조회라 로딩 스켈레톤/에러 재시도 표면을 준다
            (배송지·CartScreen과 같은 관례). 캐시 없이 진입해 조회가 실패하면 0건 주문서가 아니라
            재시도 CTA가 보여야 한다. */}
        {!buyNowView && serverCart.isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton variant="rect" className="h-24 w-full" />
            <Skeleton variant="rect" className="h-24 w-full" />
          </div>
        ) : !buyNowView && serverCart.isError ? (
          <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
            <EmptyState
              title="장바구니를 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해 주세요."
              action={{ label: '다시 시도', onClick: serverCart.refetch }}
            />
          </div>
        ) : (
          orderGroups.map(group => (
            <div key={group.storeName} className="rounded-card border border-border-subtle bg-surface-raised p-4">
              <p className="mb-2.5 text-caption font-semibold text-text-tertiary">주문 상품 / {group.storeName}</p>
              <div className="flex flex-col gap-3">
                {group.lines.map((line, i) => (
                  <OrderLine key={`${line.option}-${i}`} line={line} />
                ))}
              </div>
            </div>
          ))
        )}

        {/* 적립금 */}
        <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
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
          <SummaryRow label="상품금액" value={formatKRW(itemsTotal)} />
          <SummaryRow
            label="배송비"
            value={shippingTotal === 0 ? '무료' : formatKRW(shippingTotal)}
            valueClass={shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
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

// 주문 요약 행이 실제로 쓰는 필드만 요구하는 구조 타입 — 바로구매(카탈로그 뷰 라인)와 장바구니
// (서버 카트 라인)가 모두 이 모양을 만족해 한 컴포넌트로 렌더한다.
interface OrderLineData {
  option: string
  quantity: number
  lineTotal: number
  product: { name: string; thumbnailUrl?: string }
}

function OrderLine({ line }: { line: OrderLineData }) {
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

import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { MapPin, Plus } from 'lucide-react'
import type { PaymentMethod } from '@aechak/domain'
import {
  Alert,
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
import { CART_QUERY_KEY, useCartView, type CartLine } from '@/shared/cart'
import { formatPhone, useDefaultDeliveryAddress } from '@/shared/delivery-address'
import { OrderItemsCard } from '@/shared/catalog'
import {
  buildOrderFingerprint,
  createOrderGroupErrorCode,
  createOrderGroupErrorMessage,
  ensureOrderAttempt,
  markOrderAttemptCreated,
  orderAttemptLinesInCart,
  readReenterableOrderAttempt,
  resetOrderAttempt,
  useCreateOrderGroup,
  type OrderAttempt,
  type OrderSnapshot,
} from '@/shared/order'
import { buildOrderName, startPayment, type StartPaymentResult } from '@/shared/payment'
import { POINTS_QUERY_KEY, usePointBalance } from '@/shared/points'
import {
  MIN_POINT_USAGE,
  PAYMENT_METHODS,
  clampPoints,
  clampPointsInput,
  finalPayable,
  maxUsablePoints,
} from '../checkout.mock'

// 주문 생성이 거절됐고 장바구니 상태가 원인인 코드 — 장바구니로 돌려보내 상품 상태를 보게 한다.
const BACK_TO_CART_CODES = new Set([50104, 50107, 50205])
const AMOUNT_MISMATCH_CODE = 50106
const ALREADY_PAID_CODE = 60006
const PAYMENT_EXPIRED_CODE = 60009

const PAYMENT_CANCELLED_NOTICE = '결제를 취소했어요. 다시 시도할 수 있어요'
const PAYMENT_EXPIRED_NOTICE = '결제 가능 시간이 지났어요. 결제하기를 다시 눌러 새로 주문해 주세요'

// 주문서(b1-st-4). 서버 장바구니의 선택·주문 가능 라인으로 주문 요약·배송비·최종 금액을 계산하고,
// 결제하기 → POST /order-groups(Idempotency-Key) → 결제창(startPayment) → /payment/result 순으로 진행한다.
// 만료 전 주문그룹이 있으면 live 장바구니로 다시 계산하지 않고 그 그룹의 스냅샷으로 "진행 중인 주문" 모드가 된다.
export function CheckoutScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { view, isLoading: cartLoading, isError: cartError, refetch: refetchCart } = useCartView()
  // 배송지는 서버에서 비동기로 온다 — 로딩 중엔 스켈레톤, 없으면 추가 CTA를 보여준다.
  const {
    address: defaultAddress,
    isLoading: addressLoading,
    isError: addressError,
    refetch: refetchAddress,
  } = useDefaultDeliveryAddress()
  const { mutateAsync: createOrderGroup } = useCreateOrderGroup()

  // 만료 전 주문그룹을 가진 시도 — 있으면 진행 중인 주문 모드.
  const [liveAttempt, setLiveAttempt] = useState<OrderAttempt | null>(() =>
    readReenterableOrderAttempt(),
  )

  // 스냅샷 라인이 장바구니에 하나도 없으면 결제가 끝나 서버가 지운 것 — 시도를 버리고 일반 모드로.
  useEffect(() => {
    if (!liveAttempt || !view) return
    const liveIds = view.groups.flatMap(g => g.lines.map(l => l.cartItemId))
    if (!orderAttemptLinesInCart(liveAttempt, liveIds)) {
      resetOrderAttempt()
      setLiveAttempt(null)
    }
  }, [liveAttempt, view])

  // 주문 요약에는 실제 결제 대상 라인만 노출한다(선택 + 주문 가능). 품절 라인은 체크돼 있어도 금액에
  // 안 들어가므로 요약에서도 뺀다 — 서버 주문 생성에 넘기는 cartItemIds도 같은 집합이다.
  const orderGroups = (view?.groups ?? [])
    .map(g => ({ storeName: g.storeName, lines: g.lines.filter(l => l.selected && l.orderable) }))
    .filter(g => g.lines.length > 0)
  const orderLines: CartLine[] = orderGroups.flatMap(g => g.lines)
  const itemsTotal = view?.itemsTotal ?? 0
  const shippingTotal = view?.shippingTotal ?? 0

  // 적립금 잔액은 서버 소유다(shared/points). 조회 실패 시 사용 가능 포인트를 0으로 안전 강하시킨다 —
  // 재조회 실패는 Query가 직전 성공 값을 들고 있어 `?? 0`만으로는 못 막으므로 오류 상태면 계산용 잔액도 0.
  const {
    balance: rawPointBalance,
    isLoading: pointsLoading,
    isError: pointsError,
  } = usePointBalance()
  const pointBalance = pointsError ? 0 : (rawPointBalance ?? 0)
  const pointBalanceUnknown = pointsLoading || pointsError

  const [method, setMethod] = useState<PaymentMethod>('kakaopay')
  const [points, setPoints] = useState(0)
  const [agree, setAgree] = useState(false)
  const [paying, setPaying] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const payableBeforePoints = itemsTotal + shippingTotal
  const usablePoints = maxUsablePoints(payableBeforePoints, pointBalance)
  // 입력창은 원시 입력(points)을 비추지만 금액 계산은 항상 정규화된 사용액을 쓴다.
  const effectivePoints = clampPoints(points, payableBeforePoints, pointBalance)
  const payable = finalPayable(itemsTotal, shippingTotal, effectivePoints)

  // 적립금 상한이 줄면 입력값도 함께 내린다(잔액 refetch·장바구니 변동). 커지는 방향으로는 손대지 않는다.
  useEffect(() => {
    setPoints(prev => Math.min(prev, usablePoints))
  }, [usablePoints])

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

  // 하한(최소 사용액) 정규화는 입력이 끝난 뒤(포커스 이탈·결제 직전) 한 번만 한다.
  const commitPoints = () => {
    if (effectivePoints !== points) setPoints(effectivePoints)
  }

  const goBack = useSafeBack({ to: '/cart' })
  const goCart = () => navigate({ to: '/cart' })
  const goAddresses = () => navigate({ to: '/addresses', search: { from: 'checkout' } })
  const goResult = (orderGroupId: string, paidWith: PaymentMethod) =>
    navigate({
      to: '/payment/result',
      search: { orderGroupId, method: paidWith },
      replace: true,
    })

  // 시도를 버리고 일반 모드로 — 서버가 차감한 재고·적립금이 화면에 반영되도록 다시 읽는다.
  const leaveLiveMode = async () => {
    resetOrderAttempt()
    setLiveAttempt(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: POINTS_QUERY_KEY }),
    ])
  }

  // 결제창 결과 공통 처리 — 결제창이 열렸거나 이미 결제됐으면 결과 화면, 만료면 일반 모드, 그 밖에는 안내하고
  // 그룹이 살아 있으므로 진행 중인 주문 모드로 둔다.
  const settlePayment = async (
    result: StartPaymentResult,
    orderGroupId: string,
    paidWith: PaymentMethod,
  ) => {
    if (result.outcome === 'launched') {
      await goResult(orderGroupId, paidWith)
      return
    }
    if (result.outcome === 'failed' && result.stage === 'prepare') {
      if (result.errorCode === ALREADY_PAID_CODE) {
        resetOrderAttempt()
        await goResult(orderGroupId, paidWith)
        return
      }
      if (result.errorCode === PAYMENT_EXPIRED_CODE) {
        await leaveLiveMode()
        setNotice(PAYMENT_EXPIRED_NOTICE)
        return
      }
    }
    setNotice(result.outcome === 'cancelled' ? PAYMENT_CANCELLED_NOTICE : result.message)
    setLiveAttempt(readReenterableOrderAttempt())
  }

  const hasOrder = orderLines.length > 0
  const deliveryAddressId = defaultAddress ? Number(defaultAddress.id) : null
  const canPay = hasOrder && deliveryAddressId != null && agree && !paying

  const handlePay = async () => {
    if (!canPay || deliveryAddressId == null) return
    // 만료 전 주문그룹이 있으면 장바구니가 바뀌었어도 새 그룹을 만들지 않는다 — 진행 중인 주문 모드가 우선.
    const live = readReenterableOrderAttempt()
    if (live) {
      setLiveAttempt(live)
      return
    }
    commitPoints()
    setPaying(true)
    setNotice(null)
    const representative = orderLines[0] as CartLine
    const cartItemIds = orderLines.map(l => l.cartItemId)
    const orderName = buildOrderName(representative.product.name, orderLines.length)
    const body = {
      cartItemIds,
      deliveryAddressId,
      usedPoint: effectivePoints,
      expectedFinalAmount: payable,
    }
    try {
      // 같은 본문이면 같은 키를 재사용한다(응답 유실·새로고침 뒤 이중 주문 방지).
      const attempt = ensureOrderAttempt(buildOrderFingerprint(body))
      const created = await createOrderGroup({ idempotencyKey: attempt.idempotencyKey, body })
      const snapshot: OrderSnapshot = {
        method,
        orderName,
        cartItemIds,
        lineCount: orderLines.length,
        totalProductAmount: created.totalProductAmount,
        totalShippingFee: created.totalShippingFee,
        usedPoint: created.usedPoint,
        finalPaymentAmount: created.finalPaymentAmount,
      }
      markOrderAttemptCreated(attempt.attemptId, {
        orderGroupId: created.orderGroupId,
        expiresAt: created.expiresAt,
        snapshot,
      })

      const result = await startPayment({ orderGroupId: created.orderGroupId, method, orderName })
      await settlePayment(result, created.orderGroupId, method)
    } catch (error) {
      const code = createOrderGroupErrorCode(error)
      if (code === AMOUNT_MISMATCH_CODE) {
        // 서버 계산과 어긋난 주문은 만들어지지 않았다 — 장바구니를 다시 읽어 금액을 갱신하고 안내한다.
        resetOrderAttempt()
        await queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
        setNotice(createOrderGroupErrorMessage(error))
        return
      }
      if (code != null && BACK_TO_CART_CODES.has(code)) {
        resetOrderAttempt()
        await queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY })
        await goCart()
        return
      }
      setNotice(createOrderGroupErrorMessage(error))
    } finally {
      setPaying(false)
    }
  }

  // 진행 중인 주문 이어서 결제 — 새 주문 없이 저장된 그룹·수단으로 prepare → 결제창.
  const handleContinue = async () => {
    if (paying || !liveAttempt?.orderGroupId || !liveAttempt.snapshot) return
    const { orderGroupId, snapshot } = liveAttempt
    setPaying(true)
    setNotice(null)
    try {
      const result = await startPayment({
        orderGroupId,
        method: snapshot.method,
        orderName: snapshot.orderName,
      })
      await settlePayment(result, orderGroupId, snapshot.method)
    } finally {
      setPaying(false)
    }
  }

  const handleStartNew = async () => {
    if (paying) return
    setNotice(null)
    await leaveLiveMode()
  }

  const header = <BackAppBar onBack={goBack} title="주문서" />

  if (cartLoading) {
    return (
      <MobileScreen header={header}>
        <div className="flex flex-col gap-3 p-4">
          <Skeleton variant="rect" className="h-24 w-full" />
          <Skeleton variant="rect" className="h-32 w-full" />
          <Skeleton variant="rect" className="h-24 w-full" />
        </div>
      </MobileScreen>
    )
  }

  if (liveAttempt?.snapshot) {
    return (
      <InProgressOrderScreen
        header={header}
        snapshot={liveAttempt.snapshot}
        paying={paying}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onContinue={() => void handleContinue()}
        onStartNew={() => void handleStartNew()}
      />
    )
  }

  if (cartError || view == null) {
    return (
      <MobileScreen header={header}>
        <ScreenEmptyState
          title="장바구니를 불러오지 못했어요"
          description="잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: refetchCart }}
        />
      </MobileScreen>
    )
  }

  if (!hasOrder) {
    return (
      <MobileScreen header={header}>
        <ScreenEmptyState
          title="주문할 상품이 없어요"
          description="장바구니에서 주문할 상품을 선택해 주세요."
          action={{ label: '장바구니로', onClick: goCart }}
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      header={header}
      footer={
        <BottomFixedAction
          primary={{
            label: `${formatKRW(payable)} 결제하기`,
            onClick: () => void handlePay(),
            disabled: !canPay,
            loading: paying,
          }}
        />
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {notice && (
          <Alert variant="error" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        )}

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
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => void refetchAddress()}
              className="mt-3"
            >
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
              key: String(line.cartItemId),
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
            <span className="text-caption text-text-tertiary">
              보유 {pointBalanceUnknown ? '—' : formatKRW(pointBalance)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* DS Input에 flex-1을 직접 주면 높이가 무너지므로 래퍼로 늘린다. */}
            <div className="flex-1">
              <Input
                value={String(points)}
                inputMode="numeric"
                // 쓸 수 있는 금액이 없으면 입력해도 0으로 정규화돼 죽은 입력이 된다 — 막아 둔다.
                disabled={usablePoints === 0}
                rightAddon={<span className="text-body-sm text-text-tertiary">원</span>}
                // 입력 중에는 상한만 적용한다(하한을 여기서 강제하면 1,000원대 밖 금액을 입력할 수 없다).
                onChange={e => {
                  const parsed = Number(e.target.value.replace(/[^0-9]/g, ''))
                  setPoints(clampPointsInput(parsed, payableBeforePoints, pointBalance))
                }}
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
        </Card>

        {/* 결제 수단 */}
        <PaymentMethodCard method={method} onChange={setMethod} />

        {/* 결제 요약 */}
        <PaymentSummaryCard
          totalProductAmount={itemsTotal}
          totalShippingFee={shippingTotal}
          usedPoint={effectivePoints}
          finalPaymentAmount={payable}
        />

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

// 진행 중인 주문 모드 — 저장된 스냅샷(금액·수단)만 보여주고, 이어서 결제하거나 시도를 버리고 새 주문으로 시작한다.
function InProgressOrderScreen({
  header,
  snapshot,
  paying,
  notice,
  onDismissNotice,
  onContinue,
  onStartNew,
}: {
  header: ReactNode
  snapshot: OrderSnapshot
  paying: boolean
  notice: string | null
  onDismissNotice: () => void
  onContinue: () => void
  onStartNew: () => void
}) {
  return (
    <MobileScreen
      header={header}
      footer={
        <BottomFixedAction
          primary={{
            label: `${formatKRW(snapshot.finalPaymentAmount)} 이어서 결제하기`,
            onClick: onContinue,
            disabled: paying,
            loading: paying,
          }}
          secondary={{ label: '새 주문으로 시작', onClick: onStartNew }}
        >
          <p className="text-caption text-text-tertiary">
            새 주문으로 시작해도 지금 주문이 확보한 재고는 만료(최대 10분)까지 풀리지 않아요
          </p>
        </BottomFixedAction>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {notice && (
          <Alert variant="error" onDismiss={onDismissNotice}>
            {notice}
          </Alert>
        )}

        <Alert variant="info" title="진행 중인 주문이 있어요">
          결제를 기다리는 주문이 있어 그때 계산한 금액으로 이어서 결제해요. 장바구니를 바꿨다면 새
          주문으로 시작해 주세요.
        </Alert>

        {/* 주문 상품 — 스냅샷에는 주문명과 라인 수만 있다. */}
        <Card className="p-4">
          <p className="mb-2 text-label font-semibold text-text-primary">주문 상품</p>
          <p className="text-body-sm text-text-primary">{snapshot.orderName}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">상품 {snapshot.lineCount}개</p>
        </Card>

        {/* 결제 수단 — 서버 결제행이 처음 수단으로 만들어져 바꿀 수 없다. */}
        <PaymentMethodCard
          method={snapshot.method}
          disabled
          hint="진행 중인 주문은 처음 선택한 수단으로 결제돼요"
        />

        <PaymentSummaryCard
          totalProductAmount={snapshot.totalProductAmount}
          totalShippingFee={snapshot.totalShippingFee}
          usedPoint={snapshot.usedPoint}
          finalPaymentAmount={snapshot.finalPaymentAmount}
        />
      </div>
    </MobileScreen>
  )
}

function PaymentMethodCard({
  method,
  onChange,
  disabled = false,
  hint,
}: {
  method: PaymentMethod
  onChange?: (method: PaymentMethod) => void
  disabled?: boolean
  hint?: string
}) {
  return (
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
              disabled={disabled}
              onChange={() => onChange?.(pm.value)}
              label={pm.label}
            />
          </div>
        ))}
      </div>
      {hint && <p className="mt-1.5 text-caption text-text-tertiary">{hint}</p>}
    </Card>
  )
}

function PaymentSummaryCard({
  totalProductAmount,
  totalShippingFee,
  usedPoint,
  finalPaymentAmount,
}: {
  totalProductAmount: number
  totalShippingFee: number
  usedPoint: number
  finalPaymentAmount: number
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <PriceRow label="상품금액" value={formatKRW(totalProductAmount)} />
      <PriceRow
        label="배송비"
        value={totalShippingFee === 0 ? '무료' : formatKRW(totalShippingFee)}
        valueClass={totalShippingFee === 0 ? 'text-success-fg' : 'text-text-primary'}
      />
      {usedPoint > 0 && (
        <PriceRow
          label="적립금 사용"
          value={`-${formatKRW(usedPoint)}`}
          valueClass="text-text-accent"
        />
      )}
      <Divider className="my-0.5" />
      <div className="flex items-baseline justify-between">
        <span className="text-subheading font-semibold text-text-primary">총 결제금액</span>
        <span className="text-price-lg font-bold text-brand">{formatKRW(finalPaymentAmount)}</span>
      </div>
    </Card>
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

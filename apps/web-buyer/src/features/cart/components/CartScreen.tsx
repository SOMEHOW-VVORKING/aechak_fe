import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Image as ImageIcon, X } from 'lucide-react'
import {
  BottomFixedAction,
  Checkbox,
  EmptyState,
  MobileScreen,
  NumberInput,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import {
  CART_MAX_QUANTITY,
  cartErrorMessage,
  setCartItemSelected,
  setCartItemsSelected,
  useCartView,
  useDeleteCartItems,
  useUpdateCartItemQuantity,
  type CartGroup,
  type CartLine,
} from '@/shared/cart'
import { LoginGate, useLoginGate } from '@/shared/auth'

// 장바구니(b1-st-3). 서버 장바구니(GET /carts)를 셀러별 그룹으로 렌더하고, 수량 변경(PATCH)·
// 삭제(DELETE)는 실 API로 반영한다. 선택(체크)은 클라이언트 상태 — 주문 불가(품절 등) 라인도
// 체크할 수 있어(전체 선택/선택 삭제로 한 번에 정리) 주문 금액엔 빠지고, 주문 불가 라인이
// 선택되면 주문하기를 비활성화한다. 쿠폰/정기배송 OFF.
export function CartScreen() {
  const navigate = useNavigate()
  const { view, isLoading, isError, refetch } = useCartView()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const updateQuantity = useUpdateCartItemQuantity()
  const deleteItems = useDeleteCartItems()
  const [errorToast, setErrorToast] = useState<string | null>(null)

  const goBack = useSafeBack({ to: '/market' })

  const showError = (error: unknown) => setErrorToast(cartErrorMessage(error))

  const selectedIds =
    view?.groups.flatMap(g => g.lines).filter(l => l.selected).map(l => l.cartItemId) ?? []

  // 주문 대상(주문 불가 제외) 선택분이 없거나, 선택에 주문 불가·재고 초과가 섞여 있으면 주문 불가.
  const orderBlocked =
    view == null ||
    view.orderableLineCount === 0 ||
    view.hasSelectedUnavailable ||
    view.hasSelectedExceedsStock

  const handleCheckout = () => {
    if (orderBlocked) return
    // 비회원이면 게이트를 띄우고, 회원이면 결제(주문서)로 이동 — 상품 상세 '구매하기'와 일관.
    requireAuth('buy', () => navigate({ to: '/checkout' }))
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="장바구니" />}
      footer={
        view == null || view.isEmpty ? undefined : (
          <BottomFixedAction
            primary={{
              label: `주문하기 (${view.orderableLineCount})`,
              onClick: handleCheckout,
              disabled: orderBlocked,
            }}
          >
            {view.hasSelectedUnavailable && (
              <p className="text-caption text-error-fg">주문할 수 없는 상품이 포함되어 있어요</p>
            )}
            {view.hasSelectedExceedsStock && (
              <p className="text-caption text-error-fg">남은 재고보다 많이 담긴 상품이 있어요</p>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-text-secondary">총 {view.selectedQuantity}개</span>
              <span className="text-price-lg font-bold text-text-price">{formatKRW(view.grandTotal)}</span>
            </div>
          </BottomFixedAction>
        )
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton variant="rect" className="h-28 w-full" />
          <Skeleton variant="rect" className="h-28 w-full" />
          <Skeleton variant="rect" className="h-24 w-full" />
        </div>
      ) : isError || view == null ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="장바구니를 불러오지 못했어요"
            description="네트워크 상태를 확인하고 다시 시도해 주세요."
            action={{ label: '다시 시도', onClick: refetch }}
          />
        </div>
      ) : view.isEmpty ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="장바구니가 비어 있어요"
            description="마음에 드는 상품을 담아보세요."
            action={{ label: '쇼핑하러 가기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {/* 전체 선택 + 선택 삭제 */}
          <div className="flex items-center justify-between">
            <Checkbox
              checked={view.allSelected}
              disabled={view.selectableIds.length === 0}
              onChange={checked => setCartItemsSelected(view.selectableIds, checked)}
              label={`전체 선택 (${view.selectedLineCount}/${view.selectableIds.length})`}
            />
            <button
              type="button"
              onClick={() => deleteItems.mutate(selectedIds, { onError: showError })}
              disabled={selectedIds.length === 0 || deleteItems.isPending}
              className="text-caption text-text-tertiary disabled:opacity-40"
            >
              선택 삭제
            </button>
          </div>

          {view.groups.map(group => (
            <SellerGroupCard
              key={group.sellerId}
              group={group}
              onQuantityChange={(cartItemId, quantity) =>
                updateQuantity.mutate({ cartItemId, quantity }, { onError: showError })
              }
              onRemove={cartItemId => deleteItems.mutate([cartItemId], { onError: showError })}
            />
          ))}

          {/* 결제 요약 */}
          <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
            <SummaryRow label="상품금액" value={formatKRW(view.itemsTotal)} />
            <SummaryRow
              label="배송비"
              value={view.shippingTotal === 0 ? '무료' : formatKRW(view.shippingTotal)}
              valueClass={view.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
            />
            <div className="my-0.5 h-px bg-border-subtle" />
            <div className="flex items-baseline justify-between">
              <span className="text-subheading font-semibold text-text-primary">결제예정금액</span>
              <span className="text-price-lg font-bold text-text-price">{formatKRW(view.grandTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
      <AppToast
        open={errorToast != null}
        onClose={() => setErrorToast(null)}
        message={errorToast ?? ''}
        variant="error"
      />
    </MobileScreen>
  )
}

function SellerGroupCard({
  group,
  onQuantityChange,
  onRemove,
}: {
  group: CartGroup
  onQuantityChange: (cartItemId: number, quantity: number) => void
  onRemove: (cartItemId: number) => void
}) {
  const groupIds = group.lines.map(l => l.cartItemId)
  const groupSelectedCount = group.lines.filter(l => l.selected).length
  const groupAllSelected = groupIds.length > 0 && groupSelectedCount === groupIds.length

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-raised">
      {/* 셀러 헤더 */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-3">
        <Checkbox
          checked={groupAllSelected}
          disabled={groupIds.length === 0}
          onChange={checked => setCartItemsSelected(groupIds, checked)}
          label={group.storeName}
        />
        {group.freeShipping && (
          <StatusPill variant="brand" size="sm">
            무료배송
          </StatusPill>
        )}
      </div>

      {group.lines.map(line => (
        <CartLineRow
          key={line.cartItemId}
          line={line}
          onQuantityChange={quantity => onQuantityChange(line.cartItemId, quantity)}
          onRemove={() => onRemove(line.cartItemId)}
        />
      ))}
    </div>
  )
}

// 수량 커밋 디바운스 — NumberInput은 직접 타이핑 시 키 입력마다 onChange를 부르므로(클램프는
// blur 시점에만), 그대로 PATCH에 직결하면 중간 입력값('30'의 '3', '999'의 '9')이 서버에
// 커밋된다. 마지막 입력만 min/max로 클램프해 보낸다.
const QUANTITY_COMMIT_DELAY_MS = 300

function CartLineRow({
  line,
  onQuantityChange,
  onRemove,
}: {
  line: CartLine
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}) {
  const { product } = line
  const unavailable = !line.orderable
  const maxQuantity = Math.max(1, Math.min(CART_MAX_QUANTITY, line.remainingStock))
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (commitTimer.current != null) clearTimeout(commitTimer.current)
    },
    [],
  )
  const handleQuantityChange = (raw: number) => {
    const clamped = Math.min(maxQuantity, Math.max(1, Math.floor(raw)))
    if (commitTimer.current != null) clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null
      if (clamped !== line.quantity) onQuantityChange(clamped)
    }, QUANTITY_COMMIT_DELAY_MS)
  }
  return (
    <div className="flex items-start gap-3 px-3.5 py-3.5">
      <div className="pt-0.5">
        <Checkbox
          checked={line.selected}
          onChange={checked => setCartItemSelected(line.cartItemId, checked)}
        />
      </div>
      <div className="size-16 flex-none overflow-hidden rounded-image bg-surface-sunken">
        {product.thumbnailUrl ? (
          <img
            src={product.thumbnailUrl}
            alt=""
            className={['size-full object-cover', unavailable ? 'opacity-50' : ''].join(' ')}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-icon-muted">
            <ImageIcon className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={[
              'line-clamp-2 text-body-sm',
              unavailable ? 'text-text-tertiary' : 'text-text-primary',
            ].join(' ')}
          >
            {product.name}
          </p>
          <button
            type="button"
            aria-label="장바구니에서 삭제"
            onClick={onRemove}
            className="flex-none rounded-full p-0.5 text-icon-muted focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-0.5 text-caption text-text-tertiary">{line.option}</p>

        {unavailable ? (
          <div className="mt-2 flex items-center justify-between">
            <StatusPill variant="muted" size="sm">
              {line.unavailableLabel}
            </StatusPill>
            <div className="flex min-w-0 items-baseline gap-1.5">
              {product.originalPrice > product.price && (
                <span className="text-caption text-text-disabled line-through">
                  {formatKRW(product.originalPrice)}
                </span>
              )}
              <span className="text-price-sm font-semibold text-text-disabled">
                {formatKRW(product.price)}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            {/* 할인 중일 때만 원가를 취소선으로 덧붙인다. 할인율 %는 두지 않는다 — 서버
                discountRate는 상품 정가 기준이라 옵션 추가금이 붙은 이 두 값과 기준이 다르다. */}
            <div className="flex min-w-0 items-baseline gap-1.5">
              {product.originalPrice > product.price && (
                <span className="text-caption text-text-tertiary line-through">
                  {formatKRW(product.originalPrice)}
                </span>
              )}
              <span className="text-price-sm font-semibold text-text-price">
                {formatKRW(product.price)}
              </span>
            </div>
            <NumberInput
              value={line.quantity}
              onChange={handleQuantityChange}
              min={1}
              max={maxQuantity}
              size="sm"
            />
          </div>
        )}
        {/* 초과 판정은 서버가 클라이언트에 위임한다(재고>0이면 ACTIVE로 옴) — 경고 없이 주문
            합계까지 흘러가지 않게 라인에 표기하고, 선택 시 주문하기도 막는다. */}
        {line.exceedsStock && (
          <p className="mt-1.5 text-caption text-error-fg">
            남은 재고가 {line.remainingStock}개예요. 수량을 줄여주세요
          </p>
        )}
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

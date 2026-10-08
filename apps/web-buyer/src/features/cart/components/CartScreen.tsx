import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import {
  BottomFixedAction,
  Card,
  Checkbox,
  MobileScreen,
  NumberInput,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { PriceRow } from '@/shared/components/PriceRow'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { formatKRW } from '@/shared/formatKRW'
import {
  removeFromCart,
  removeManyFromCart,
  setAllCartSelected,
  setCartQuantity,
  setCartSelected,
} from '@/shared/cart'
import { ProductThumbnail, type CartLineView, type CartSellerGroup } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useCartView } from '../cart.queries'

// 장바구니(b1-st-3). 셀러별 그룹핑 + 부분 선택/전체 선택 + 수량 스테퍼 + 선택 항목 합계/배송비
// (isFreeShipping 재사용). 쿠폰/정기배송 OFF. 품절 상품도 체크할 수 있어(전체 선택/선택 삭제로
// 한 번에 정리) 주문 금액엔 빠지고, 품절이 선택되면 주문하기를 비활성화한다(캡틴 요청).
export function CartScreen() {
  const navigate = useNavigate()
  const view = useCartView()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()

  const goBack = useSafeBack({ to: '/market' })

  const selectedKeys = view.groups
    .flatMap(g => g.lines)
    .filter(l => l.selected)
    .map(l => l.key)

  // 주문 대상(품절 제외) 선택분이 없거나, 선택에 품절이 섞여 있으면 주문 불가.
  const orderBlocked = view.orderableLineCount === 0 || view.hasSelectedSoldOut

  const handleCheckout = () => {
    if (orderBlocked) return
    // 비회원이면 게이트를 띄우고, 회원이면 결제(주문서)로 이동 — 상품 상세 '구매하기'와 일관.
    requireAuth('buy', () => navigate({ to: '/checkout' }))
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="장바구니" />}
      footer={
        view.isEmpty ? undefined : (
          <BottomFixedAction
            primary={{
              label: `주문하기 (${view.orderableLineCount})`,
              onClick: handleCheckout,
              disabled: orderBlocked,
            }}
          >
            {view.hasSelectedSoldOut && (
              <p className="text-caption text-error-fg">품절 상품이 포함되어 주문할 수 없어요</p>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-body-sm text-text-secondary">총 {view.selectedQuantity}개</span>
              <span className="text-price-lg font-bold text-text-price">{formatKRW(view.grandTotal)}</span>
            </div>
          </BottomFixedAction>
        )
      }
    >
      {view.isEmpty ? (
        <ScreenEmptyState
          title="장바구니가 비어 있어요"
          description="마음에 드는 상품을 담아보세요."
          action={{ label: '쇼핑하러 가기', onClick: () => navigate({ to: '/market' }) }}
        />
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {/* 전체 선택 + 선택 삭제 */}
          <div className="flex items-center justify-between">
            <Checkbox
              checked={view.allSelected}
              disabled={view.selectableKeys.length === 0}
              onChange={checked => setAllCartSelected(checked, view.selectableKeys)}
              label={`전체 선택 (${view.selectedLineCount}/${view.selectableKeys.length})`}
            />
            <button
              type="button"
              onClick={() => removeManyFromCart(selectedKeys)}
              disabled={selectedKeys.length === 0}
              className="text-caption text-text-tertiary disabled:opacity-40"
            >
              선택 삭제
            </button>
          </div>

          {view.groups.map(group => (
            <SellerGroupCard key={group.sellerId} group={group} />
          ))}

          {/* 결제 요약 */}
          <Card className="flex flex-col gap-2 p-4">
            <PriceRow label="상품금액" value={formatKRW(view.itemsTotal)} />
            <PriceRow
              label="배송비"
              value={view.shippingTotal === 0 ? '무료' : formatKRW(view.shippingTotal)}
              valueClass={view.shippingTotal === 0 ? 'text-success-fg' : 'text-text-primary'}
            />
            <Divider className="my-0.5" />
            <div className="flex items-baseline justify-between">
              <span className="text-subheading font-semibold text-text-primary">결제예정금액</span>
              <span className="text-price-lg font-bold text-text-price">{formatKRW(view.grandTotal)}</span>
            </div>
          </Card>
        </div>
      )}

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </MobileScreen>
  )
}

function SellerGroupCard({ group }: { group: CartSellerGroup }) {
  const groupSelectableKeys = group.lines.filter(l => l.selectable).map(l => l.key)
  const groupSelectedCount = group.lines.filter(l => l.selected).length
  const groupAllSelected =
    groupSelectableKeys.length > 0 && groupSelectedCount === groupSelectableKeys.length
  const disabled = groupSelectableKeys.length === 0

  return (
    <Card className="overflow-hidden">
      {/* 셀러 헤더 */}
      <div className="flex items-center gap-2 border-b border-border-subtle px-3.5 py-3">
        <Checkbox
          checked={groupAllSelected}
          disabled={disabled}
          onChange={checked => setAllCartSelected(checked, groupSelectableKeys)}
          label={group.storeName}
        />
        {group.freeShipping && (
          <StatusPill variant="brand" size="sm">
            무료배송
          </StatusPill>
        )}
      </div>

      {group.lines.map(line => (
        <CartLineRow key={line.key} line={line} />
      ))}
    </Card>
  )
}

function CartLineRow({ line }: { line: CartLineView }) {
  const { product } = line
  return (
    <div className="flex items-start gap-3 px-3.5 py-3.5">
      <div className="pt-0.5">
        <Checkbox
          checked={line.selected}
          disabled={!line.selectable}
          onChange={checked => setCartSelected(line.key, checked)}
        />
      </div>
      <ProductThumbnail src={product.thumbnailUrl} className="size-16" dimmed={line.soldOut} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={[
              'line-clamp-2 text-body-sm',
              line.soldOut ? 'text-text-tertiary' : 'text-text-primary',
            ].join(' ')}
          >
            {product.name}
          </p>
          <button
            type="button"
            aria-label="장바구니에서 삭제"
            onClick={() => removeFromCart(line.key)}
            className="flex-none rounded-full p-0.5 text-icon-muted focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-0.5 text-caption text-text-tertiary">{line.option}</p>

        {line.soldOut ? (
          <div className="mt-2 flex items-center justify-between">
            <StatusPill variant="muted" size="sm">
              품절
            </StatusPill>
            <span className="text-price-sm font-semibold text-text-disabled">
              {formatKRW(product.price)}
            </span>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-price-sm font-semibold text-text-price">
              {formatKRW(product.price)}
            </span>
            <NumberInput
              value={line.quantity}
              onChange={qty => setCartQuantity(line.key, qty)}
              min={1}
              max={99}
              size="sm"
            />
          </div>
        )}
      </div>
    </div>
  )
}

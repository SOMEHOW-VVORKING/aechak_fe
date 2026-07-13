import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { ChevronRight, Flag, Heart, Share2, Truck } from 'lucide-react'
import {
  Avatar,
  BottomSheet,
  Button,
  EmptyState,
  MobileScreen,
  NumberInput,
  RatingInput,
  ReviewCard,
  Select,
  Skeleton,
  StatusPill,
  type ToastVariant,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { formatKRW } from '@/shared/formatKRW'
import { addToCart } from '@/shared/cart'
import { SUB_CATEGORIES, toggleWish, useIsWished } from '@/shared/catalog'
import { LoginGate, useLoginGate } from '@/shared/auth'
import { useProductDetail } from '../product.queries'
import type { ProductDetail } from '../product.mock'
import { AddedToCartSheet } from './AddedToCartSheet'

// 상세 리뷰 섹션은 최대 3개만 노출하고 나머지는 "전체보기"(상품 리뷰 목록)로 넘긴다.
const DETAIL_REVIEW_LIMIT = 3

// 상품 상세(b1-st-2). 문의(채팅) 버튼 OFF, 쿠폰 트리거/시트 OFF. 옵션 선택 BottomSheet 포함.
export function ProductDetailScreen({ productId }: { productId: string }) {
  const router = useRouter()
  const navigate = useNavigate()
  const { data, isLoading } = useProductDetail(productId)

  const wished = useIsWished(productId)
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addedSheetOpen, setAddedSheetOpen] = useState(false)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: ToastVariant }>({
    open: false,
    message: '',
    variant: 'success',
  })

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/' })
  }

  const showToast = (message: string, variant: ToastVariant = 'success') =>
    setToast({ open: true, message, variant })

  return (
    <MobileScreen
      header={
        <BackAppBar
          onBack={goBack}
          actions={
            <button
              type="button"
              aria-label="공유"
              onClick={() => showToast('상품 링크를 복사했어요.', 'info')}
              className="flex size-9 items-center justify-center rounded-full text-icon"
            >
              <Share2 className="size-[22px]" />
            </button>
          }
        />
      }
      footer={
        data ? (
          <ActionBar
            wished={wished}
            onToggleWish={() =>
              requireAuth('wish', () => {
                toggleWish(productId)
                showToast(wished ? '찜을 해제했어요.' : '찜했어요.')
              })
            }
            onCart={() => requireAuth('cart', () => setSheetOpen(true))}
            onBuy={() => requireAuth('buy', () => setSheetOpen(true))}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <DetailSkeleton />
      ) : !data ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            title="상품을 찾을 수 없어요"
            description="삭제되었거나 주소가 올바르지 않은 상품이에요."
            action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
          />
        </div>
      ) : (
        <div className="flex flex-col pb-4">
          <ImageCarousel images={data.images} sold={data.isSoldOut} />

          <div className="flex flex-col gap-3.5 p-4">
            {/* 셀러 — 상점명 옆 별점 표기는 제거(리뷰 섹션의 별점 요약과 중복) */}
            <div className="flex items-center gap-2">
              <Avatar name={data.storeName} size="sm" />
              <span className="text-label text-text-secondary">{data.storeName}</span>
            </div>

            {/* breadcrumb — 카탈로그 중분류와 일치하는 crumb는 눌러서 해당 카테고리 마켓으로 이동.
                (홈 카테고리 칩과 동일 메커니즘: /market?category=<중분류 라벨>). 매칭 안 되는
                상위 crumb(예: '반려동물용품', 대분류)는 죽은 이동을 막으려 정적 텍스트로 둔다. */}
            <div className="-mb-1 flex flex-wrap items-center gap-1 text-caption text-text-tertiary">
              {data.breadcrumb.map((crumb, i) => {
                const isLast = i === data.breadcrumb.length - 1
                const navigable = SUB_CATEGORIES.includes(crumb)
                return (
                  <span key={crumb} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="size-3 text-icon-muted" />}
                    {navigable ? (
                      <button
                        type="button"
                        onClick={() => navigate({ to: '/market', search: { category: crumb } })}
                        className={isLast ? 'text-text-secondary underline-offset-2 hover:underline' : 'underline-offset-2 hover:underline'}
                      >
                        {crumb}
                      </button>
                    ) : (
                      <span className={isLast ? 'text-text-secondary' : ''}>{crumb}</span>
                    )}
                  </span>
                )
              })}
            </div>

            <h1 className="text-body-lg font-semibold leading-snug text-text-primary">{data.name}</h1>

            {/* 판매중/SALE 상태 pill 줄은 제거했다 — 바로 아래에서 구매 가능하고 세일 %도
                가격 블록에서 확인되므로 중복/노이즈였다. 품절 표시는 상단 이미지 캐러셀의
                dim + "품절" 오버레이가 담당한다. */}
            <PriceBlock product={data} />

            {/* 배송 안내 — 무료배송 여부는 검색 무료배송 필터와 같은 규칙(isFreeShipping)이라 모순 없음 */}
            <div className="flex items-center gap-2 text-text-secondary">
              <Truck className="size-[18px] flex-none text-icon" />
              <span className="text-caption">
                {data.freeShipping
                  ? '무료배송 / 내일(화) 도착 예정'
                  : `배송비 ${formatKRW(data.deliveryFee)} (도서산간지역 ${formatKRW(data.remoteAreaFee)})`}
              </span>
            </div>

            <div className="h-px bg-border-subtle" />

            {/* 리뷰 요약 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-subheading font-semibold text-text-primary">
                  리뷰 {data.reviewSummary.total.toLocaleString('ko-KR')}
                </span>
                {data.reviewSummary.total > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: '/reviews/product/$productId', params: { productId } })
                    }
                    className="flex items-center gap-0.5 text-body-sm text-text-tertiary"
                  >
                    전체보기
                    <ChevronRight className="size-4 text-icon-muted" />
                  </button>
                )}
              </div>
              {data.reviewSummary.total > 0 ? (
                <>
                  <ReviewSummaryCard summary={data.reviewSummary} />
                  {/* 정렬 칩은 제거했다 — 상세에서는 최신 순 상위 3개만 미리 보여주고, 정렬·전체
                      목록은 위 "전체보기"(상품 리뷰 목록)에서만 제공한다. */}
                  <div className="flex flex-col gap-3">
                    {data.reviews.slice(0, DETAIL_REVIEW_LIMIT).map((review, i) => (
                      <ReviewCard
                        key={`${review.author}-${i}`}
                        author={review.author}
                        rating={review.rating}
                        date={review.date}
                        content={review.content}
                        images={review.images}
                        onImageClick={
                          review.images && review.images.length > 0
                            ? index => setLightboxSrc(review.images![index] ?? null)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5 rounded-card border border-border-subtle bg-surface-raised px-4 py-6 text-center">
                  <p className="text-body-sm text-text-secondary">아직 등록된 리뷰가 없어요</p>
                  <p className="text-caption text-text-tertiary">첫 리뷰를 기다리고 있어요</p>
                </div>
              )}
            </div>

            <div className="h-px bg-border-subtle" />

            {/* 상품 정보 */}
            <div className="flex flex-col gap-3">
              <span className="text-subheading font-semibold text-text-primary">상품 정보</span>
              <div className="flex h-48 items-center justify-center rounded-image bg-surface-sunken text-icon-muted">
                <span className="text-caption">상품 상세 이미지</span>
              </div>
              <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-raised p-4">
                {data.specs.map(spec => (
                  <div key={spec.label} className="flex items-start justify-between gap-4 text-body-sm">
                    <span className="flex-none text-text-tertiary">{spec.label}</span>
                    <span className="text-right text-text-primary">{spec.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 상품 신고 진입점 */}
            <button
              type="button"
              onClick={() => navigate({ to: '/products/$productId/report', params: { productId } })}
              className="mt-1 flex items-center gap-1.5 self-start text-caption text-text-tertiary"
            >
              <Flag className="size-3.5" />
              상품 신고하기
            </button>
          </div>
        </div>
      )}

      {data && (
        <OptionSheet
          open={sheetOpen}
          product={data}
          onClose={() => setSheetOpen(false)}
          onAddToCart={(option, qty) => {
            addToCart(productId, option, qty)
            setSheetOpen(false)
            // 하단 중앙 토스트가 하단 액션바를 덮던 문제를 근본 해소 — 토스트 대신 확인 바텀시트를
            // 올려 담긴 사실 + 추천 상품을 보여준다.
            setAddedSheetOpen(true)
          }}
          onBuyNow={(option, qty) => {
            setSheetOpen(false)
            navigate({ to: '/checkout', search: { buyNow: productId, option, qty } })
          }}
        />
      )}

      <AddedToCartSheet
        open={addedSheetOpen}
        productId={productId}
        onClose={() => setAddedSheetOpen(false)}
        onViewCart={() => {
          setAddedSheetOpen(false)
          navigate({ to: '/cart' })
        }}
      />

      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} alt="리뷰 사진" />

      {/* 공용 AppToast 래퍼 — 한글 메시지가 2줄로 깨지지 않게 nowrap 처리를 공통화(공유 버튼 등) */}
      <AppToast
        open={toast.open}
        onClose={() => setToast(t => ({ ...t, open: false }))}
        message={toast.message}
        variant={toast.variant}
      />

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </MobileScreen>
  )
}

function PriceBlock({ product }: { product: ProductDetail }) {
  const discount = getDiscount(product)
  return (
    // 할인% · 최종가 · 원가(취소선)를 한 baseline 줄로 묶어 하나의 가격 덩어리로 읽히게 한다.
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {discount != null && (
        <span className="text-price-lg font-bold text-text-discount">{discount}%</span>
      )}
      <span className="text-price-lg font-bold text-text-price">{formatKRW(product.price)}</span>
      {discount != null && product.originalPrice != null && (
        <span className="text-body-sm text-text-tertiary line-through">
          {formatKRW(product.originalPrice)}
        </span>
      )}
    </div>
  )
}

function getDiscount(product: ProductDetail): number | null {
  if (product.originalPrice == null || product.originalPrice <= product.price) return null
  const d = Math.round((1 - product.price / product.originalPrice) * 100)
  return d > 0 ? d : null
}

function ReviewSummaryCard({ summary }: { summary: ProductDetail['reviewSummary'] }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex flex-none flex-col items-center gap-1">
        <span className="text-display font-bold leading-none text-text-primary">
          {summary.average.toFixed(1)}
        </span>
        <RatingInput value={summary.average} readonly size={14} />
        <span className="text-caption text-text-tertiary">{summary.total.toLocaleString('ko-KR')}개</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {summary.distribution.map((pct, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 flex-none text-caption text-text-tertiary">{5 - i}★</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImageCarousel({ images, sold }: { images: string[]; sold?: boolean }) {
  const [active, setActive] = useState(0)
  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={e => {
          const el = e.currentTarget
          setActive(Math.round(el.scrollLeft / el.clientWidth))
        }}
      >
        {images.map((src, i) => (
          <div key={i} className="h-[300px] w-full flex-none snap-center">
            <img
              src={src}
              alt=""
              className={['size-full object-cover', sold ? 'opacity-50' : ''].join(' ')}
            />
          </div>
        ))}
      </div>
      {/* 품절 표시 — 상태 pill 줄을 제거했으므로(item 1) dim만으로는 불명확해 캐러셀 중앙에
          "품절" 오버레이를 남긴다(DS ProductCard의 품절 표현과 동일 패턴). */}
      {sold && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <StatusPill variant="muted">품절</StatusPill>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <span
            key={i}
            className={[
              'size-1.5 rounded-full transition-colors',
              i === active ? 'bg-surface-inverse' : 'bg-surface-inverse/30',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  )
}

function ActionBar({
  wished,
  onToggleWish,
  onCart,
  onBuy,
}: {
  wished: boolean
  onToggleWish: () => void
  onCart: () => void
  onBuy: () => void
}) {
  return (
    <div
      className="flex items-center gap-2 border-t border-border-subtle bg-surface-base px-4 pt-2.5"
      style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}
    >
      <button
        type="button"
        onClick={onToggleWish}
        aria-pressed={wished}
        aria-label={wished ? '찜 해제' : '찜하기'}
        className={[
          'flex size-12 flex-none items-center justify-center rounded-input border border-border transition-colors',
          wished ? 'text-brand' : 'text-icon',
        ].join(' ')}
      >
        <Heart className="size-[22px]" fill={wished ? 'currentColor' : 'none'} />
      </button>
      <Button variant="secondary" size="lg" onClick={onCart} className="flex-1">
        장바구니
      </Button>
      <Button size="lg" onClick={onBuy} className="flex-[1.4]">
        구매하기
      </Button>
    </div>
  )
}

function OptionSheet({
  open,
  product,
  onClose,
  onAddToCart,
  onBuyNow,
}: {
  open: boolean
  product: ProductDetail
  onClose: () => void
  onAddToCart: (option: string, qty: number) => void
  onBuyNow: (option: string, qty: number) => void
}) {
  const [option, setOption] = useState(product.options[0] ?? '')
  const [qty, setQty] = useState(1)
  const total = product.price * qty

  return (
    <BottomSheet open={open} onClose={onClose} title="옵션 선택">
      <div className="flex flex-col gap-3.5">
        <Select
          options={product.options.map(o => ({ value: o, label: o }))}
          value={option}
          onChange={setOption}
        />
        <div className="flex items-center justify-between">
          <span className="text-body text-text-secondary">수량</span>
          <NumberInput value={qty} onChange={setQty} min={1} max={Math.max(1, product.stockCount)} size="sm" />
        </div>
        <p className="text-right text-caption text-text-tertiary">재고 {product.stockCount}개</p>
        <div className="h-px bg-border-subtle" />
        <div className="flex items-center justify-between">
          <span className="text-body text-text-secondary">총 {qty}개</span>
          <span className="text-price-lg font-bold text-text-price">{formatKRW(total)}</span>
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" size="lg" onClick={() => onAddToCart(option, qty)} className="flex-1">
            장바구니 담기
          </Button>
          <Button size="lg" onClick={() => onBuyNow(option, qty)} className="flex-1">
            바로 구매
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton variant="rect" className="h-[300px] w-full" />
      <div className="flex flex-col gap-3 p-4">
        <Skeleton variant="text" className="h-4 w-1/3" />
        <Skeleton variant="text" className="h-6 w-3/4" />
        <Skeleton variant="text" className="h-6 w-1/2" />
        <Skeleton variant="rect" className="h-24 w-full rounded-card" />
      </div>
    </div>
  )
}

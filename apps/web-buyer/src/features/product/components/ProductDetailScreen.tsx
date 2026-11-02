import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChevronRight, Flag, Heart, Share2, Truck } from 'lucide-react'
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
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
import { Divider } from '@/shared/components/Divider'
import { RatingDistribution } from '@/shared/components/RatingDistribution'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { ImageLightbox } from '@/shared/components/ImageLightbox'
import { formatKRW } from '@/shared/formatKRW'
import { errorResponse } from '@aechak/api'
import { CART_MAX_QUANTITY, cartErrorMessage, useAddCartItem } from '@/shared/cart'
import {
  hydrateLikedFromDetail,
  SUB_CATEGORIES,
  toggleWishlist,
  useIsWished,
} from '@/shared/catalog'
import { LoginGate, useIsLoggedIn, useLoginGate } from '@/shared/auth'
import {
  DETAIL_REVIEW_LIMIT,
  useProductDetail,
  useProductOptions,
  useProductReviewPreview,
  useProductReviewSummary,
} from '../product.queries'
import type { ProductDetail } from '../product.mock'
import { mockOptionsFromDetail, type OptionChoice, type ProductOptionsView } from '../product.map'
import { AddedToCartSheet } from './AddedToCartSheet'
import { ReviewAiSummary } from './ReviewAiSummary'

// 옵션 선택 항목을 정한다. 실 옵션(useProductOptions) 우선, 없으면(mock id 404 등) 목업 상세 옵션,
// 그래도 비면 기본 구성 하나로 채운다(옵션 없는 상품도 담기가 가능하게).
// 담기(POST)는 서버가 이미 담긴 같은 옵션 수량과 합쳐 상한(99)을 판정한다 — 시트의 수량은 상한 안이므로
// 90001은 합산 초과라 그 취지로 안내한다. 나머지는 장바구니 공용 문구.
function addCartErrorMessage(error: unknown): string {
  return errorResponse(error)?.data?.errorCode === 90001
    ? `이미 담긴 수량과 합쳐 ${CART_MAX_QUANTITY}개를 넘을 수 없어요. 장바구니에서 수량을 확인해 주세요`
    : cartErrorMessage(error)
}

function buildOptionChoices(
  raw: ProductOptionsView | null | undefined,
  detail: ProductDetail | null | undefined,
): OptionChoice[] {
  const source = raw ?? (detail ? mockOptionsFromDetail(detail) : null)
  if (source && source.choices.length > 0) return source.choices
  return [
    {
      key: '기본 구성',
      label: '기본 구성',
      additionalPrice: 0,
      remainingStock: detail?.isSoldOut ? 0 : null,
      soldOut: Boolean(detail?.isSoldOut),
    },
  ]
}

// 상품 상세(b1-st-2). 문의(채팅) 버튼 OFF, 쿠폰 트리거/시트 OFF. 옵션 선택 BottomSheet 포함.
// 실 API(GET /products/{id}, /options)로 구동하되, mock id는 상세 쿼리가 목업으로 폴백한다.
export function ProductDetailScreen({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useProductDetail(productId)

  const wished = useIsWished(productId)
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addedSheetOpen, setAddedSheetOpen] = useState(false)
  // 방금 담은 서버 라인 id — 담기 확인 시트가 옵션/수량 요약을 이 라인에서 읽는다.
  const [addedCartItemId, setAddedCartItemId] = useState<number | null>(null)
  const addCart = useAddCartItem()
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: ToastVariant }>({
    open: false,
    message: '',
    variant: 'success',
  })

  // 옵션은 시트를 열 때만 조회한다(상세 렌더가 옵션을 기다리지 않게 분리).
  const optionsQuery = useProductOptions(productId, { enabled: sheetOpen })
  const isLoggedIn = useIsLoggedIn()
  // 목업 상품은 상세 뷰모델이 미리보기 리뷰를 이미 들고 있어 서버를 부르지 않는다(실 상품만 빈 배열).
  // 리뷰 목록 API가 JWT 필수라 비회원은 호출 자체를 막는다 — 401이면 전역 리다이렉트로 상세를 잃는다.
  const canFetchServerReviews =
    isLoggedIn && data != null && data.reviews.length === 0 && data.reviewSummary.total > 0
  // 목업 상품처럼 상세가 리뷰를 이미 들고 있으면 안내가 필요 없다(previewReviews가 채워진다).
  const reviewsNeedLogin = !isLoggedIn && data != null && data.reviews.length === 0
  const reviewPreview = useProductReviewPreview(productId, { enabled: canFetchServerReviews })
  // AI 요약도 JWT 필수이고 목업 상품은 서버에 없어 미리보기와 같은 조건으로만 부른다.
  const reviewAiSummary = useProductReviewSummary(productId, { enabled: canFetchServerReviews })
  // 상세 리뷰 섹션은 최대 DETAIL_REVIEW_LIMIT개만 노출하고 나머지는 "전체보기"로 넘긴다.
  const previewReviews = data && data.reviews.length > 0 ? data.reviews : (reviewPreview.data ?? [])
  const optionChoices = buildOptionChoices(optionsQuery.data, data)

  // 서버 상세의 isLiked를 미러에 단방향 시드한다. "id별 세션당 1회" 정책과 그 시드 기록은
  // shared/catalog의 wishlist.queries가 소유한다 — 여기 모듈 전역으로 두면 로그아웃·테스트에서
  // 되돌릴 방법이 없다. 이후 토글은 toggleWishlist가 소유.
  useEffect(() => {
    hydrateLikedFromDetail(productId, data?.isLiked)
  }, [productId, data?.isLiked])

  const goBack = useSafeBack({ to: '/' })

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
            soldOut={data.isSoldOut}
            onToggleWish={() =>
              requireAuth('wish', () => {
                toggleWishlist(productId)
                showToast(wished ? '찜을 해제했어요.' : '찜했어요.')
              })
            }
            onCart={() => requireAuth('cart', () => setSheetOpen(true))}
          />
        ) : undefined
      }
    >
      {isLoading ? (
        <DetailSkeleton />
      ) : isError ? (
        // 네트워크/서버(500 등) 오류는 not-found가 아니라 재시도 가능한 실패로 구분한다.
        <ScreenEmptyState
          title="상품 정보를 불러오지 못했어요"
          description="네트워크 상태를 확인하고 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      ) : !data ? (
        <ScreenEmptyState
          title="상품을 찾을 수 없어요"
          description="삭제되었거나 주소가 올바르지 않은 상품이에요."
          action={{ label: '상품 둘러보기', onClick: () => navigate({ to: '/market' }) }}
        />
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
                        className={
                          isLast
                            ? 'text-text-secondary underline-offset-2 hover:underline'
                            : 'underline-offset-2 hover:underline'
                        }
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

            <h1 className="text-body-lg font-semibold leading-snug text-text-primary">
              {data.name}
            </h1>

            {/* 판매중/SALE 상태 pill 줄은 제거했다 — 바로 아래에서 구매 가능하고 세일 %도
                가격 블록에서 확인되므로 중복/노이즈였다. 품절 표시는 상단 이미지 캐러셀의
                dim + "품절" 오버레이가 담당한다. */}
            <PriceBlock product={data} />

            {/* 배송 안내 — 무료배송 여부는 상품별 실 shipping이 정한다 */}
            <div className="flex items-center gap-2 text-text-secondary">
              <Truck className="size-[18px] flex-none text-icon" />
              <span className="text-caption">
                {data.freeShipping
                  ? '무료배송'
                  : data.remoteAreaFee != null
                    ? `배송비 ${formatKRW(data.deliveryFee)} (도서산간지역 ${formatKRW(data.remoteAreaFee)})`
                    : `배송비 ${formatKRW(data.deliveryFee)}`}
              </span>
            </div>

            <Divider />

            {/* 리뷰 요약 */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-subheading font-semibold text-text-primary">
                  리뷰 {data.reviewSummary.total.toLocaleString('ko-KR')}
                </span>
                {/* 전체보기 진입은 리뷰가 하나라도 있으면 노출한다 — 목록은 리뷰 목록 API(SCRUM-181)를
                    쓰는 ProductReviewsScreen이 담당한다. 상세는 permitAll이라 미리보기 목록은 채우지
                    않고(비회원 상세 열람 유지) 진입점만 건수 기준으로 노출한다. 다만 리뷰 목록 API는
                    JWT 필수라, 비회원이 바로 진입하면 401 → 전역 로그인 리다이렉트로 상세를 잃는다.
                    그래서 로그인 게이트로 감싸 비회원에겐 로그인 시트를 먼저 띄운다(강제 이탈 방지). */}
                {data.reviewSummary.total > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      requireAuth('review', () =>
                        navigate({ to: '/reviews/product/$productId', params: { productId } }),
                      )
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
                  <ReviewAiSummary data={reviewAiSummary.data} isError={reviewAiSummary.isError} />
                  {/* 정렬 칩은 제거했다 — 상세에서는 최신 순 상위 3개만 미리 보여주고, 정렬·전체
                      목록은 위 "전체보기"(상품 리뷰 목록)에서만 제공한다. */}
                  {reviewPreview.isError ? (
                    // 던지기만 하고 받지 않으면 요약("리뷰 128") 아래가 그냥 비어 리뷰가 없는 것처럼
                    // 보인다 — 비인증 실패는 재시도 버튼 대신 안내만 두고 전체보기로 유도한다.
                    <Card className="px-4 py-5 text-center text-body-sm text-text-secondary">
                      리뷰를 불러오지 못했어요. 전체보기에서 다시 확인해 주세요.
                    </Card>
                  ) : // isPending이 아니라 isFetching을 본다 — react-query v5는 enabled:false인 쿼리도
                  // isPending=true라서, 호출을 막은 비회원에게 스켈레톤 3장이 영구히 남는다
                  // (실제로 요청이 떠 있는지를 묻는 건 isFetching이다). 아래 비회원 안내도 이
                  // 조건을 통과해야 닿는다.
                  reviewPreview.isFetching && previewReviews.length === 0 ? (
                    <div className="flex flex-col gap-3">
                      {[0, 1, 2].map(i => (
                        <Skeleton key={i} variant="rect" className="h-24 w-full" />
                      ))}
                    </div>
                  ) : reviewsNeedLogin ? (
                    // 상세 본문은 permitAll이라 비회원도 끝까지 보지만 리뷰 목록만 비어 있다 —
                    // 그 칸을 빈 자리로 두지 않고 왜 비었는지 적는다.
                    <Card className="px-4 py-5 text-center text-body-sm text-text-secondary">
                      리뷰를 보려면 로그인이 필요해요.
                    </Card>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {previewReviews.slice(0, DETAIL_REVIEW_LIMIT).map((review, i) => {
                        // 클로저 안에서는 좁히기가 풀리므로 배열을 먼저 받아 둔다.
                        const images = review.images
                        return (
                          <ReviewCard
                            key={`${review.author}-${i}`}
                            author={review.author}
                            rating={review.rating}
                            date={review.date}
                            content={review.content}
                            images={images}
                            onImageClick={
                              images && images.length > 0
                                ? index => setLightboxSrc(images[index] ?? null)
                                : undefined
                            }
                          />
                        )
                      })}
                    </div>
                  )}
                </>
              ) : (
                <Card className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
                  <p className="text-body-sm text-text-secondary">아직 등록된 리뷰가 없어요</p>
                  <p className="text-caption text-text-tertiary">첫 리뷰를 기다리고 있어요</p>
                </Card>
              )}
            </div>

            <Divider />

            {/* 상품 정보 */}
            <div className="flex flex-col gap-3">
              <span className="text-subheading font-semibold text-text-primary">상품 정보</span>
              {data.description && (
                <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
                  {data.description}
                </p>
              )}
              {/* 회색 "상품 상세 이미지" 박스는 실 상세 이미지가 없는 장식/깨진 이미지처럼 보이는 죽은
                  UI라 제거했다 — 실제 이미지는 상단 캐러셀에 있고, 실 상세 미디어 API가 생기면 그때 렌더한다. */}
              {/* 사양표는 실 API 소스가 없어 실 상품에선 비어 온다 — 목업 사양을 실데이터로 위장하지
                  않으려고 값이 있을 때만 렌더한다. */}
              {data.specs.length > 0 && (
                <Card className="flex flex-col gap-2 p-4">
                  {data.specs.map(spec => (
                    <div
                      key={spec.label}
                      className="flex items-start justify-between gap-4 text-body-sm"
                    >
                      <span className="flex-none text-text-tertiary">{spec.label}</span>
                      <span className="text-right text-text-primary">{spec.value}</span>
                    </div>
                  ))}
                </Card>
              )}
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
          basePrice={data.price}
          choices={optionChoices}
          loading={optionsQuery.isLoading}
          error={optionsQuery.isError}
          adding={addCart.isPending}
          onRetry={() => void optionsQuery.refetch()}
          onClose={() => setSheetOpen(false)}
          onAddToCart={(choice, qty) => {
            // 장바구니는 서버 소유라 옵션 조합 id가 필수 — 목업 폴백 상품(실 옵션 없음)은 담을 수 없다.
            if (choice.optionCombinationId == null) {
              setSheetOpen(false)
              showToast('지금은 이 상품을 장바구니에 담을 수 없어요.', 'error')
              return
            }
            addCart.mutate(
              { optionCombinationId: choice.optionCombinationId, quantity: qty },
              {
                onSuccess: res => {
                  setSheetOpen(false)
                  setAddedCartItemId(res.cartItemId)
                  // 토스트 대신 확인 바텀시트로 담긴 사실 + 추천 상품을 보여준다(액션바 가림 방지).
                  setAddedSheetOpen(true)
                },
                // 실패 시 시트를 열어둔다 — 수량/옵션을 바로 고쳐 다시 담을 수 있게(재고 부족 등).
                onError: e => showToast(addCartErrorMessage(e), 'error'),
              },
            )
          }}
        />
      )}

      <AddedToCartSheet
        open={addedSheetOpen}
        productId={productId}
        cartItemId={addedCartItemId}
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
  // 분포 소스가 없는 실 상품(집계 전용)은 큰 빈 오른쪽 여백 대신 평균/별점/건수를 한 줄로 콤팩트하게
  // 가운데 정렬한다(0% 막대 위장 방지 + 왼쪽 쏠림 방지).
  if (!summary.distribution) {
    return (
      <Card className="flex items-center justify-center gap-3 p-4">
        <span className="text-title font-bold leading-none text-text-primary">
          {summary.average.toFixed(1)}
        </span>
        <div className="flex flex-col gap-1">
          <RatingInput value={summary.average} readonly size={16} />
          <span className="text-caption text-text-tertiary">
            리뷰 {summary.total.toLocaleString('ko-KR')}개
          </span>
        </div>
      </Card>
    )
  }
  return (
    <Card className="p-4">
      <RatingDistribution
        average={summary.average}
        total={summary.total}
        distribution={summary.distribution}
        starSuffix
        className="gap-4"
      />
    </Card>
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
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className={['size-full object-cover', sold ? 'opacity-50' : ''].join(' ')}
            />
          </div>
        ))}
      </div>
      {/* 품절 표시 — 상태 pill 줄을 제거했으므로 dim만으로는 불명확해 캐러셀 중앙에
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

// 하단 액션바는 찜 + 장바구니 담기뿐이다. 바로구매는 BE 주문 생성이 장바구니 행 id만 받아 진입점을 두지
// 않는다(담기 우회는 같은 옵션 수량과 합쳐져 의도와 다른 주문이 된다).
function ActionBar({
  wished,
  soldOut,
  onToggleWish,
  onCart,
}: {
  wished: boolean
  soldOut?: boolean
  onToggleWish: () => void
  onCart: () => void
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
          'flex size-12 flex-none items-center justify-center rounded-input border border-border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
          wished ? 'text-brand' : 'text-icon',
        ].join(' ')}
      >
        <Heart className="size-[22px]" fill={wished ? 'currentColor' : 'none'} />
      </button>
      {/* 품절 상품은 담기를 막아 죽은 시트로 빠지지 않게 한다. 찜은 유지. */}
      <Button size="lg" onClick={onCart} className="flex-1" disabled={soldOut}>
        {soldOut ? '품절' : '장바구니'}
      </Button>
    </div>
  )
}

// 옵션 조합 하나를 선택 항목 하나로 평탄화한 목록(choices)을 소비한다. 선택 조합이 품절이면 담기를 막는다.
function OptionSheet({
  open,
  basePrice,
  choices,
  loading,
  error,
  adding,
  onRetry,
  onClose,
  onAddToCart,
}: {
  open: boolean
  basePrice: number
  choices: OptionChoice[]
  loading: boolean
  error: boolean
  /** 담기 API 진행 중 — 담기 버튼 로딩/중복 클릭 방지. */
  adding: boolean
  onRetry: () => void
  onClose: () => void
  /** 담기는 옵션 조합 id가 필요해 선택 항목 전체를 넘긴다(서버 담기 계약). */
  onAddToCart: (choice: OptionChoice, qty: number) => void
}) {
  const [selectedKey, setSelectedKey] = useState('')
  const [qty, setQty] = useState(1)
  // 기본 선택은 주문 가능한(품절 아닌) 첫 조합 — 첫 조합이 품절인데 뒤에 판매 조합이 있으면 첫인상이
  // "구매 불가"가 되지 않게 한다.
  const choice =
    choices.find(c => c.key === selectedKey) ?? choices.find(c => !c.soldOut) ?? choices[0]
  const allSoldOut = choices.length > 0 && choices.every(c => c.soldOut)

  // 선택 조합이 바뀌면 수량을 1로 되돌려 재고 초과를 막는다.
  useEffect(() => {
    setQty(1)
  }, [choice?.key])

  // 옵션 조회가 (404 아닌) 오류면 담기/구매를 막는다 — 조용히 "기본 구성" 기본가로 주문하게 두면
  // 실제 옵션/재고를 무시한 잘못된 주문이 된다.
  if (error) {
    return (
      <BottomSheet open={open} onClose={onClose} title="옵션 선택">
        <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-body-sm text-text-secondary">옵션 정보를 불러오지 못했어요</p>
          <Button variant="secondary" size="md" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      </BottomSheet>
    )
  }

  if (loading || !choice) {
    return (
      <BottomSheet open={open} onClose={onClose} title="옵션 선택">
        <div
          role="status"
          aria-live="polite"
          className="py-10 text-center text-body-sm text-text-tertiary"
        >
          옵션을 불러오는 중이에요
        </div>
      </BottomSheet>
    )
  }

  // 모든 조합이 품절이면 선택/담기 UI 대신 명확한 전량 품절 안내를 보여준다.
  if (allSoldOut) {
    return (
      <BottomSheet open={open} onClose={onClose} title="옵션 선택">
        <div role="status" className="py-10 text-center text-body-sm text-text-secondary">
          모든 옵션이 품절이에요
        </div>
      </BottomSheet>
    )
  }

  // 서버 라인당 상한(99)과 재고 중 작은 값 — 재고가 많아도 99를 넘기면 담기가 400(90001)으로 거절된다.
  const maxStock = Math.min(CART_MAX_QUANTITY, choice.remainingStock ?? CART_MAX_QUANTITY)
  const total = (basePrice + choice.additionalPrice) * qty
  const orderDisabled = choice.soldOut || maxStock <= 0

  return (
    <BottomSheet open={open} onClose={onClose} title="옵션 선택">
      <div className="flex flex-col gap-3.5">
        <Select
          options={choices.map(c => ({
            value: c.key,
            label: c.soldOut
              ? `${c.label} (품절)`
              : c.additionalPrice > 0
                ? `${c.label} (+${formatKRW(c.additionalPrice)})`
                : c.label,
          }))}
          value={choice.key}
          onChange={setSelectedKey}
        />
        <div className="flex items-center justify-between">
          <span className="text-body text-text-secondary">수량</span>
          <NumberInput
            value={qty}
            onChange={setQty}
            min={1}
            max={Math.max(1, maxStock)}
            size="sm"
          />
        </div>
        {choice.remainingStock != null && (
          <p className="text-right text-caption text-text-tertiary">
            재고 {choice.remainingStock}개
          </p>
        )}
        <Divider />
        <div className="flex items-center justify-between">
          <span className="text-body text-text-secondary">총 {qty}개</span>
          <span className="text-price-lg font-bold text-text-price">{formatKRW(total)}</span>
        </div>
        {orderDisabled && (
          <p className="text-caption text-error-fg">선택한 옵션은 품절이라 주문할 수 없어요</p>
        )}
        <Button
          size="lg"
          disabled={orderDisabled}
          loading={adding}
          onClick={() => onAddToCart(choice, qty)}
          className="w-full"
        >
          장바구니 담기
        </Button>
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

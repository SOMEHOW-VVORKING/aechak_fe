import { StatusPill } from './StatusPill'

export interface ProductCardProps {
  image: string
  name: string
  price: number
  originalPrice?: number
  storeName?: string
  isSold?: boolean
  /** `isSold`일 때 썸네일 중앙 오버레이에 표시할 라벨. 기본 '품절'. */
  soldLabel?: string
  onClick?: () => void
  /** 찜(위시) 상태. `onWishToggle`과 함께 주면 썸네일 우상단에 하트 오버레이가 표시됨. */
  wished?: boolean
  /** 하트 토글 핸들러. 없으면 하트 오버레이 자체를 그리지 않음(그리드 목업의 옵션 요소). */
  onWishToggle?: () => void
  className?: string
}

function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

export function ProductCard({
  image,
  name,
  price,
  originalPrice,
  storeName,
  isSold,
  soldLabel = '품절',
  onClick,
  wished,
  onWishToggle,
  className = '',
}: ProductCardProps) {
  const discount =
    originalPrice != null && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null
  // 반올림 결과가 0이면(예: 원가와 거의 동일) "0%" 뱃지가 뜨지 않도록 가드.
  const showDiscount = discount != null && discount > 0
  // 상세로 이동 가능한 카드 = onClick이 있고 품절이 아닐 때. 품절은 이동 불가(not-allowed).
  const navigable = !!onClick && !isSold

  return (
    <div
      className={[
        'relative flex flex-col text-left',
        // cursor는 상속 속성이라 루트에 걸면 이름/가격 등 자식 텍스트도 텍스트 커서가 아닌
        // 이 커서를 따른다. 품절=금지, 이동 가능=포인터.
        isSold ? 'cursor-not-allowed' : navigable ? 'cursor-pointer' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-image bg-surface-sunken">
        <img
          src={image}
          alt=""
          className={['size-full object-cover', isSold ? 'opacity-50' : ''].filter(Boolean).join(' ')}
        />
        {showDiscount && (
          <span className="absolute left-2 top-2 rounded-badge bg-accent px-1.5 py-0.5 text-badge font-semibold text-accent-on">
            {discount}%
          </span>
        )}
        {isSold && (
          <span className="absolute inset-0 flex items-center justify-center">
            <StatusPill variant="muted">{soldLabel}</StatusPill>
          </span>
        )}
      </div>

      {storeName && (
        <p className="mt-2 truncate text-caption text-text-tertiary">{storeName}</p>
      )}
      <p className="mt-0.5 line-clamp-2 text-body-sm text-text-primary">{name}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {showDiscount && (
          <span className="text-price-sm font-bold text-text-discount">{discount}%</span>
        )}
        <span className="text-price-sm font-semibold text-text-price">{formatPrice(price)}</span>
      </div>
      {showDiscount && originalPrice != null && (
        <p className="mt-0.5 text-caption text-text-tertiary line-through">
          {formatPrice(originalPrice)}
        </p>
      )}

      {/* 이동용 클릭 영역 — 카드 전체를 덮는 형제(stretched) 버튼. 찜 버튼과 중첩되지 않는
          별개 엘리먼트라 role="button" 중첩이 없고, 마우스·키보드 모두에서 카드=이동만 담당한다. */}
      {navigable && (
        <button
          type="button"
          onClick={onClick}
          aria-label={`${name} 상세 보기`}
          className="absolute inset-0 z-[1] cursor-pointer rounded-md focus-visible:outline-none focus-visible:shadow-focus-ring"
        />
      )}

      {/* 찜 버튼 — 이동 오버레이보다 위(z)의 형제. 하트를 마우스로 클릭하거나 Enter/Space로
          눌러도 아래의 이동 버튼이 아니라 이 버튼만 활성화된다(중첩이 아니라 형제라서
          이벤트 전파 자체가 없음 — stopPropagation 불필요). 항상 클릭 가능하므로 커서도 고정. */}
      {onWishToggle && (
        <button
          type="button"
          onClick={onWishToggle}
          aria-pressed={wished}
          aria-label={wished ? '찜 해제' : '찜하기'}
          className={[
            'absolute right-2 top-2 z-[2] flex size-8 cursor-pointer items-center justify-center rounded-full',
            'border border-border-subtle bg-surface-overlay shadow-card transition-colors',
            wished ? 'text-brand' : 'text-icon-muted',
          ].join(' ')}
        >
          <svg
            className="size-[18px]"
            viewBox="0 0 24 24"
            fill={wished ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      )}
    </div>
  )
}

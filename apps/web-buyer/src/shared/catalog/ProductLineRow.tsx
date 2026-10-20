import type { ReactNode } from 'react'
import { Card } from '@aechak/design-system/web'
import { ProductThumbnail } from './ProductThumbnail'

// 썸네일 + 상품명(2줄 말줄임) + 옵션/수량 캡션(+ 금액) 품목 행. 주문서/주문 상세 품목, 리뷰 작성 대기 카드,
// 리뷰 작성 화면 상품 요약이 공유한다. 금액은 호출부가 포맷한 문자열로 준다(shared→shared 금지라 formatKRW를 안 쓴다).
//
// `onSelect`(상품 상세로 이동 등)와 `action`(행 끝 버튼)은 **형제**로 분리한다 — 행 전체를 버튼으로 감싸고
// 그 안에 또 버튼을 두면 중첩 인터랙티브가 되어 탭이 상위로 새고 키보드 포커스가 하나로 뭉친다.
export function ProductLineRow({
  thumbnailUrl,
  name,
  meta,
  price,
  thumbClass = 'size-[52px]',
  align = 'start',
  onSelect,
  selectLabel,
  action,
}: {
  thumbnailUrl?: string | null
  name: string
  meta: ReactNode
  price?: string
  thumbClass?: string
  align?: 'start' | 'center'
  /** 주면 썸네일+텍스트 영역이 버튼이 된다(보통 상품 상세로 navigate). */
  onSelect?: () => void
  /** `onSelect` 버튼의 접근성 이름. 미지정이면 `{name} 상품 보기`. */
  selectLabel?: string
  /** 행 끝 액션 슬롯(리뷰 쓰기 등). `onSelect` 버튼과 형제로 렌더된다. */
  action?: ReactNode
}) {
  const alignClass = align === 'start' ? 'items-start' : 'items-center'
  const body = (
    <>
      <ProductThumbnail src={thumbnailUrl} className={thumbClass} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body-sm text-text-primary">{name}</p>
        <p className="mt-0.5 text-caption text-text-tertiary">{meta}</p>
        {price && <p className="mt-1 text-price-sm font-semibold text-text-price">{price}</p>}
      </div>
    </>
  )
  return (
    <div className={`flex ${alignClass} gap-3`}>
      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={selectLabel ?? `${name} 상품 보기`}
          className={`flex min-w-0 flex-1 ${alignClass} gap-3 text-left`}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {action && <div className="flex-none self-center">{action}</div>}
    </div>
  )
}

export interface OrderLineItem {
  key: string
  thumbnailUrl?: string | null
  name: string
  meta: ReactNode
  price: string
  onSelect?: () => void
  selectLabel?: string
  action?: ReactNode
}

// 셀러별 `주문 상품 / {상점명}` 카드(주문서·주문 상세 공용).
export function OrderItemsCard({ storeName, items }: { storeName: string; items: OrderLineItem[] }) {
  return (
    <Card className="p-4">
      <p className="mb-2.5 text-caption font-semibold text-text-tertiary">주문 상품 / {storeName}</p>
      <div className="flex flex-col gap-3">
        {items.map(({ key, ...item }) => (
          <ProductLineRow key={key} {...item} />
        ))}
      </div>
    </Card>
  )
}

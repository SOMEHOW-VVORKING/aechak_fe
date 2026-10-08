import type { ReactNode } from 'react'
import { Card } from '@aechak/design-system/web'
import { ProductThumbnail } from './ProductThumbnail'

// 썸네일 + 상품명(2줄 말줄임) + 옵션/수량 캡션(+ 금액) 품목 행. 주문서/주문 상세 품목, 리뷰 작성 대기 카드,
// 리뷰 작성 화면 상품 요약이 공유한다. 금액은 호출부가 포맷한 문자열로 준다(shared→shared 금지라 formatKRW를 안 쓴다).
export function ProductLineRow({
  thumbnailUrl,
  name,
  meta,
  price,
  thumbClass = 'size-[52px]',
  align = 'start',
}: {
  thumbnailUrl?: string | null
  name: string
  meta: ReactNode
  price?: string
  thumbClass?: string
  align?: 'start' | 'center'
}) {
  return (
    <div className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-3`}>
      <ProductThumbnail src={thumbnailUrl} className={thumbClass} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-body-sm text-text-primary">{name}</p>
        <p className="mt-0.5 text-caption text-text-tertiary">{meta}</p>
        {price && <p className="mt-1 text-price-sm font-semibold text-text-price">{price}</p>}
      </div>
    </div>
  )
}

export interface OrderLineItem {
  key: string
  thumbnailUrl?: string | null
  name: string
  meta: ReactNode
  price: string
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

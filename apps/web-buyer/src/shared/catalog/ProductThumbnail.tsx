import { placeholderImage } from './placeholder'

const PLACEHOLDER = placeholderImage()

// 정사각 상품 썸네일 박스. 이미지가 없으면 shared/catalog의 실루엣 placeholder를 그린다(lucide ImageIcon 폴백 금지).
// 크기는 호출부가 className(size-*)으로 준다.
export function ProductThumbnail({
  src,
  className = 'size-[52px]',
  dimmed = false,
}: {
  src?: string | null
  className?: string
  /** 품절/취소 등 비활성 표시(이미지 50% 투명). */
  dimmed?: boolean
}) {
  return (
    <div className={`${className} flex-none overflow-hidden rounded-image bg-surface-sunken`}>
      <img
        src={src || PLACEHOLDER}
        alt=""
        loading="lazy"
        decoding="async"
        className={dimmed ? 'size-full object-cover opacity-50' : 'size-full object-cover'}
      />
    </div>
  )
}

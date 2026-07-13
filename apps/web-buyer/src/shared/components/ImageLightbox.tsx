import { useEffect } from 'react'
import { X } from 'lucide-react'

export interface ImageLightboxProps {
  /** 확대할 이미지 URL. null이면 닫힘(단일 이미지 뷰어). */
  src: string | null
  onClose: () => void
  alt?: string
}

// 리뷰 사진 등 단일 이미지를 크게 보는 라이트박스. 스크림 클릭/닫기 버튼/ESC로 닫힌다.
// position:fixed지만 __root의 폰 프레임 translateZ containing block 안에서 배치돼
// 데스크톱에서도 프레임을 벗어나지 않는다(BottomSheet/Modal/Toast와 동일 전제).
// 모바일: 탭으로 열고 스크림/닫기 탭으로 닫힘(hover 전용 상호작용 없음).
export function ImageLightbox({ src, onClose, alt = '' }: ImageLightboxProps) {
  useEffect(() => {
    if (src == null) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
    }
  }, [src, onClose])

  if (src == null) return null

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="리뷰 사진 확대 보기"
    >
      <div className="absolute inset-0 bg-scrim" aria-hidden="true" onClick={onClose} />
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-4 top-4 z-10 flex size-10 items-center justify-center rounded-full bg-surface-inverse/70 text-text-inverse"
      >
        <X className="size-5" />
      </button>
      <img
        src={src}
        alt={alt}
        className="relative z-10 max-h-[80vh] max-w-full rounded-image object-contain"
      />
    </div>
  )
}

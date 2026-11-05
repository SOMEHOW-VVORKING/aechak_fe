import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export interface ImageLightboxProps {
  /** 확대할 이미지 URL. null이면 닫힘(단일 이미지 뷰어). */
  src: string | null
  onClose: () => void
  alt?: string
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

// 리뷰 사진 등 단일 이미지를 크게 보는 라이트박스. 스크림 클릭/닫기 버튼/ESC로 닫힌다.
// position:fixed지만 __root의 폰 프레임 translateZ containing block 안에서 배치돼
// 데스크톱에서도 프레임을 벗어나지 않는다(BottomSheet/Modal/Toast와 동일 전제).
// 모바일: 탭으로 열고 스크림/닫기 탭으로 닫힘(hover 전용 상호작용 없음).
// aria-modal 선언과 동작을 맞추기 위해 DS Modal/Drawer/BottomSheet와 동일한 포커스 계약을
// 갖춘다 — 열릴 때 라이트박스로 포커스 이동, Tab을 안에 가둠, 닫힐 때 원래 트리거로 복귀.
export function ImageLightbox({ src, onClose, alt = '' }: ImageLightboxProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // ESC 닫기 + 바디 스크롤 잠금
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

  // 열릴 때 포커스를 라이트박스로 옮기고, 닫힐 때 원래 요소(리뷰 썸네일 등)로 복귀
  useEffect(() => {
    if (src == null) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus()
  }, [src])

  // Tab/Shift+Tab 순환을 라이트박스 안(닫기 버튼)으로 가둠
  useEffect(() => {
    if (src == null) return
    const panel = panelRef.current
    if (!panel) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) {
        e.preventDefault()
        return
      }
      const active = document.activeElement
      // 열린 직후 포커스는 패널 자신에 있어 first도 last도 아니다. 그대로 두면 Shift+Tab 한 번에 포커스가 라이트박스 뒤로 넘어간다.
      // 포커스가 패널 밖에 있으면 아무것도 하지 않는다. 위에 겹쳐 뜬 오버레이의 Tab까지 처리하면 그 오버레이의 첫 항목에서 포커스가 움직이지 않는다.
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || active === panel) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [src])

  if (src == null) return null

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="fixed inset-0 z-modal flex items-center justify-center p-6 outline-none"
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

import { useState } from 'react'
import { Toast, type ToastVariant } from '@aechak/design-system/web'

interface ToastState {
  message: string
  variant: ToastVariant
}

// web-seller 토스트 단일 통로. 화면은 `show`로 띄우고 `element`를 트리 끝에 둔다 — 라우트마다
// state + 렌더 분기를 반복하지 않는다. DS Toast를 그대로 그려 시각은 바뀌지 않는다.
export function useToast(initial: ToastState | null = null) {
  const [toast, setToast] = useState(initial)
  return {
    show: (message: string, variant: ToastVariant = 'success') => setToast({ message, variant }),
    element: toast && (
      <Toast open message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />
    ),
  }
}

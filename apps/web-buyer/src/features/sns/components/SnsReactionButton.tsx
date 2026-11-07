import { useEffect, useRef } from 'react'
import { Bookmark, Repeat2 } from 'lucide-react'
import type { UseLoginGate } from '@/shared/auth'
import {
  snsToggleErrorMessage,
  useSnsReaction,
  type SnsPost,
  type SnsReactionKind,
} from '../sns.queries'

interface SnsReactionButtonProps {
  kind: SnsReactionKind
  post: SnsPost
  /** 화면의 로그인 게이트. 비로그인이면 로그인 안내 시트를 열고 로그인 뒤 다시 실행할 행동을 남긴다(A26) */
  requireAuth: UseLoginGate['requireAuth']
  onError: (message: string) => void
  /** 다시 조회가 실패한 상세처럼 지금 값을 믿을 수 없으면 잠근다(AGENTS.md 6절 7) */
  disabled?: boolean
}

// 리포스트와 저장 버튼(design 6절 5번). 상세 액션 바와 피드 카드가 같이 쓴다. 누르는 즉시 켜거나 끄고 빠르게 다시 눌러도
// 막지 않는다(useSnsReaction이 차례로 보낸다). 리포스트는 수를 함께 그리고 본인 글이면 잠근다. 저장은 수를 그리지 않고
// 저장된 상태는 브랜드 색으로 채운다(.act.is-saved, A23).
export function SnsReactionButton({
  kind,
  post,
  requireAuth,
  onError,
  disabled,
}: SnsReactionButtonProps) {
  const { mutate } = useSnsReaction(kind, post.publicId)
  const on = kind === 'repost' ? post.reposted : post.saved
  const press = () =>
    requireAuth(kind, () => mutate(!on, { onError: e => onError(snsToggleErrorMessage(e)) }), {
      kind,
      publicId: post.publicId,
    })
  const tone = on ? 'text-brand' : 'text-text-secondary'

  if (kind === 'save') {
    return (
      <button
        type="button"
        aria-label="저장"
        aria-pressed={on}
        disabled={disabled}
        onClick={press}
        className={`flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-text-disabled ${tone}`}
      >
        <Bookmark className="size-5" fill={on ? 'currentColor' : 'none'} />
      </button>
    )
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled || post.isMine}
      onClick={press}
      className={`flex h-10 items-center gap-1 rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-text-disabled ${tone}`}
    >
      <Repeat2 className="size-5" />
      <span className="sr-only">리포스트</span>{' '}
      <span className="text-body-sm tabular-nums">{post.repostCount.toLocaleString('ko-KR')}</span>
    </button>
  )
}

/**
 * 로그인 뒤 다시 실행(A26, design 6절 10번). 비로그인으로 누른 리포스트나 저장을 확인 없이 한 번 켠다. 이미 켜져 있어도
 * 201이라 그대로다. 그사이 지웠거나 차단 관계가 된 글은 반영되지 않고 서버 응답대로 안내만 띄운다.
 */
export function SnsResumeReaction({
  kind,
  publicId,
  onError,
}: {
  kind: SnsReactionKind
  publicId: string
  onError: (message: string) => void
}) {
  const { mutate } = useSnsReaction(kind, publicId)
  // StrictMode가 effect를 두 번 실행해도 한 번만 보낸다.
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    mutate(true, { onError: e => onError(snsToggleErrorMessage(e)) })
  }, [mutate, onError])
  return null
}

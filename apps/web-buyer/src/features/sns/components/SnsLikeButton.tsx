import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import type { UseLoginGate } from '@/shared/auth'
import { snsToggleErrorMessage, useSnsLike, type SnsPost } from '../sns.queries'

interface SnsLikeButtonProps {
  post: SnsPost
  /** 화면의 로그인 게이트. 비로그인이면 로그인 안내 시트를 열고 로그인 뒤 다시 실행할 행동을 남긴다(A26) */
  requireAuth: UseLoginGate['requireAuth']
  onError: (message: string) => void
  /** 다시 조회가 실패해 지금 값을 믿을 수 없으면 좋아요만 잠근다. 수를 눌러 목록을 여는 것은 읽기라 그대로 둔다 */
  disabled?: boolean
}

// 좋아요 버튼과 수(design 6절 2번). 상세 액션 바와 피드 카드가 같이 쓴다. 하트는 켜고 끄고 수는 좋아요한 사람을 연다.
// 요청이 끝날 때까지 같은 게시물의 다음 누르기는 보내지 않는다. 자기 게시물에도 누를 수 있다(R1-19).
export function SnsLikeButton({ post, requireAuth, onError, disabled }: SnsLikeButtonProps) {
  const navigate = useNavigate()
  const like = useSnsLike(post.publicId)
  const { publicId, liked } = post

  const press = () =>
    requireAuth('like', () => like(!liked, { onError: e => onError(snsToggleErrorMessage(e)) }), {
      kind: 'like',
      publicId,
    })
  // 비로그인은 목록 대신 로그인 안내 시트를 열고 로그인 뒤 좋아요한 사람으로 돌아온다(AC-SNS04-007).
  const openLikers = () =>
    requireAuth(
      'likers',
      () => void navigate({ to: '/sns/posts/$publicId/likers', params: { publicId } }),
      {
        kind: 'open',
        publicId,
        returnTo: `/sns/posts/${publicId}/likers`,
      },
    )

  return (
    <span className="flex items-center">
      <button
        type="button"
        aria-label="좋아요"
        aria-pressed={liked}
        disabled={disabled}
        onClick={press}
        className={`flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring disabled:text-text-disabled ${liked ? 'text-social-active' : 'text-social-idle'}`}
      >
        <Heart className="size-5" fill={liked ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={openLikers}
        className="-ml-1.5 flex h-10 items-center rounded-full pr-1 text-body-sm tabular-nums text-text-secondary focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <span className="sr-only">좋아요한 사람</span> {post.likeCount.toLocaleString('ko-KR')}
      </button>
    </span>
  )
}

/**
 * 로그인 뒤 다시 실행(A26, design 6절 10번). 비로그인으로 누른 좋아요를 켜기 요청으로 한 번 보낸다. 이미 좋아요했어도
 * 201이라 그대로다. 그사이 지웠거나 차단 관계가 된 글은 반영되지 않고 서버 응답대로 안내만 띄운다.
 */
export function SnsResumeLike({
  publicId,
  onError,
}: {
  publicId: string
  onError: (message: string) => void
}) {
  const like = useSnsLike(publicId)
  // StrictMode가 effect를 두 번 실행해도 한 번만 보낸다.
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    like(true, { onError: e => onError(snsToggleErrorMessage(e)) })
  }, [like, onError])
  return null
}

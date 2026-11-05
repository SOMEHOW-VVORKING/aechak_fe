import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { Alert, Button, EmptyState, Skeleton } from '@aechak/design-system/web'

/** 첫 페이지 조회 실패. 빈 상태가 아니라 b13-st-3 네트워크 오류 안내와 다시 시도다(design 6절 6번) */
export function SnsListError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<WifiOff className="size-6" />}
      title="네트워크에 연결할 수 없어요"
      description="연결 상태를 확인한 뒤 다시 시도해 주세요."
      action={{ label: '다시 시도', onClick: onRetry }}
    />
  )
}

/** 받아 둔 목록의 다시 읽기 실패. 목록은 두고 위에 알린다(AGENTS.md 6절 7). 기본 문구는 상세의 같은 안내와 같다 */
export function SnsRefetchError({
  onRetry,
  message = '게시물을 다시 불러오지 못했어요.',
}: {
  onRetry: () => void
  /** 게시물이 아닌 목록(팔로우, 차단/뮤트)과 프로필의 문구 */
  message?: string
}) {
  return (
    <div className="px-4 py-2">
      <Alert variant="error">
        {message}{' '}
        <button type="button" onClick={onRetry} className="font-semibold underline">
          다시 시도
        </button>
      </Alert>
    </div>
  )
}

interface SnsListEndProps {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  fetchNextPage: () => unknown
}

// 피드, 프로필 탭, 저장됨 탭의 목록 끝(design 6절 6번). 감시 요소가 화면 안에 들어오면 다음 페이지를 부르고 받은 뒤에도
// 화면 안이면 또 부른다. 중복을 빼서 새 글이 없는 페이지를 받으면 감시 요소가 그대로 보여 관찰 콜백이 다시 오지 않기
// 때문이다. 다음 페이지가 실패하면 보여준 글은 두고 끝에 실패 안내와 다시 시도를 둔다(P13).
export function SnsListEnd({ hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage }: SnsListEndProps) {
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)))
    observer.observe(sentinel)
    return () => {
      observer.disconnect()
      setInView(false)
    }
  }, [sentinel])

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage()
  }, [inView, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage])

  if (isFetchNextPageError) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
        <p className="text-body-sm text-text-secondary">다음 글을 불러오지 못했어요</p>
        <Button size="sm" variant="secondary" onClick={() => void fetchNextPage()}>
          다시 시도
        </Button>
      </div>
    )
  }
  if (!hasNextPage) return null
  return (
    <div ref={setSentinel} className="px-4 py-4">
      {isFetchingNextPage && <Skeleton variant="text" className="w-full" />}
    </div>
  )
}

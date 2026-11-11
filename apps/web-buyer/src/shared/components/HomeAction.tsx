import { useNavigate } from '@tanstack/react-router'
import { Home } from 'lucide-react'

interface HomeActionProps {
  /** 홈 이동을 화면이 직접 처리할 때 넘긴다(입력 중 이탈 확인을 거쳐야 하는 폼 화면). 없으면 바로 홈으로 간다. */
  onHome?: () => void
}

// 홈으로 가기 — 탭바가 없는 깊은 화면에서 BackAppBar의 actions에 둔다.
export function HomeAction({ onHome }: HomeActionProps) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      aria-label="홈으로 가기"
      onClick={() => (onHome ? onHome() : void navigate({ to: '/' }))}
      className="flex size-9 items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
    >
      <Home className="size-[22px]" />
    </button>
  )
}

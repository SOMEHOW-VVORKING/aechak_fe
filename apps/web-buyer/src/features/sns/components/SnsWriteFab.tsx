import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { PenLine } from 'lucide-react'
import { LoginGate, takeComposeAction, useIsLoggedIn, useLoginGate } from '@/shared/auth'

// SNS 피드의 글쓰기 버튼(design 6절 10번, SNS-03 design 6절 1번). 비로그인은 로그인 안내 시트를 열고 대상 없는
// compose 대기 행동을 남긴다. 로그인을 마치고 피드로 돌아오면 작성 화면을 다시 연다. 글쓰기는 입력이 더 필요해
// 화면을 여는 데서 멈춘다(A26). 버튼은 카드의 상세 버튼(z-[1])과 카드 컨트롤(z-[2]) 위, 시트와 Modal, 토스트 아래(z-raised)에 둔다.
export function SnsWriteFab() {
  const navigate = useNavigate()
  const loggedIn = useIsLoggedIn()
  const { gateOpen, gateFeature, gateResume, requireAuth, closeGate } = useLoginGate()
  // 로그인 복귀 redirect가 끝나 이 탭이 확정된 뒤에 꺼낸다. 그 전에 이동하면 redirect가 끊겨 복귀 라우트가 다시
  // 돌고, 그때는 대기 행동이 이미 없어 홈으로 간다.
  const routerIdle = useRouterState({ select: state => state.status === 'idle' })

  useEffect(() => {
    if (routerIdle && loggedIn && takeComposeAction()) void navigate({ to: '/sns/posts/new' })
  }, [routerIdle, loggedIn, navigate])

  return (
    <>
      <button
        type="button"
        aria-label="글쓰기"
        onClick={() =>
          requireAuth('write', () => void navigate({ to: '/sns/posts/new' }), { kind: 'compose', publicId: '' })
        }
        className="absolute bottom-4 right-4 z-raised flex size-14 items-center justify-center rounded-full bg-brand text-brand-on shadow-dropdown focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <PenLine className="size-6" />
      </button>
      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} resume={gateResume} />
    </>
  )
}

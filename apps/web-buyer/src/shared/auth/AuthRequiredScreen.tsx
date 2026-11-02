import { useNavigate, useRouter, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, Lock } from 'lucide-react'
import { Button, MobileScreen } from '@aechak/design-system/web'
import { savePendingAction } from './pending-action'

// 회원 전용 화면을 비회원이 열었을 때 그 자리에 그리는 화면. 빈 화면이나 영구 스켈레톤 대신
// 왜 비어 있는지와 다음 행동을 보여준다 — 회원 전용 API를 부르지 않으므로 401 → 전역 로그인
// 리다이렉트로 화면이 사라지는 일도 없다.
//
// 액션 단위 게이트(LoginGate, BottomSheet)와 역할이 다르다: 저쪽은 탐색 중 찜/담기를 누른 순간,
// 이쪽은 화면 자체가 회원 전용일 때다.
//
// 앱바와 뒤로가기는 shared/components·shared/useSafeBack을 쓰지 않고 여기서 직접 그린다 —
// shared → shared 교차 import가 금지라서다(AGENTS.md 1-1).

export type AuthRequiredFeature = 'wish' | 'cart' | 'order' | 'mypage'

const FEATURE_COPY: Record<AuthRequiredFeature, { title: string; description: string }> = {
  wish: { title: '찜', description: '찜한 상품은 로그인한 회원만 볼 수 있어요.' },
  cart: { title: '장바구니', description: '장바구니는 로그인한 회원만 볼 수 있어요.' },
  order: { title: '주문 내역', description: '주문 내역은 로그인한 회원만 볼 수 있어요.' },
  mypage: { title: '마이페이지', description: '내 정보는 로그인한 회원만 볼 수 있어요.' },
}

export interface AuthRequiredScreenProps {
  feature: AuthRequiredFeature
  /** _tabs 레이아웃 안에 렌더될 때는 MobileScreen·앱바를 겹치지 않게 끈다(마이 탭). */
  embedded?: boolean
}

export function AuthRequiredScreen({ feature, embedded = false }: AuthRequiredScreenProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const href = useRouterState({ select: s => s.location.href })
  const copy = FEATURE_COPY[feature]

  const goMarket = () => void navigate({ to: '/market' })

  // 히스토리가 없으면(공유 링크·직접 URL 진입) 뒤로 갈 곳이 없어 마켓으로 보낸다.
  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else goMarket()
  }

  // 로그인은 페이지 전체를 이동하므로 돌아올 경로를 sessionStorage에 남긴다(A26과 같은 자리).
  // 행동 없이 화면만 다시 열면 되므로 kind는 'open'이다.
  const goLogin = () => {
    savePendingAction({ kind: 'open', publicId: '', returnTo: href })
    void navigate({ to: '/onboarding/login' })
  }

  const body = (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-subtle text-brand">
        <Lock className="size-7" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-subheading font-semibold text-text-primary">로그인이 필요해요</p>
        <p className="text-body-sm leading-relaxed text-text-secondary">
          {copy.description}
          <br />
          로그인하면 보던 화면으로 돌아와 이어서 볼 수 있어요.
        </p>
      </div>
      <div className="mt-2 flex w-full max-w-[320px] flex-col gap-2.5">
        <Button size="lg" fullWidth onClick={goLogin}>
          로그인 / 회원가입
        </Button>
        <Button variant="ghost" size="lg" fullWidth onClick={goMarket}>
          상품 둘러보기
        </Button>
      </div>
    </div>
  )

  if (embedded) return body
  return (
    <MobileScreen
      header={
        <div className="flex h-14 items-center gap-2 px-2">
          <button
            type="button"
            onClick={goBack}
            aria-label="뒤로 가기"
            className="flex size-10 flex-none items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <ChevronLeft className="size-6" />
          </button>
          <span className="text-subheading font-semibold text-text-primary">{copy.title}</span>
        </div>
      }
    >
      {body}
    </MobileScreen>
  )
}

import { useCallback, useState } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { BottomSheet, Button } from '@aechak/design-system/web'
import { getIsLoggedIn } from './auth.store'
import { savePendingAction, type PendingActionKind } from './pending-action'

// 비회원 로그인 유도 게이트(b13-st-2). 독립 화면이 아니라 어느 화면 위에서든 재사용하는
// BottomSheet 오버레이 — 회원 전용 액션(찜/장바구니/구매/작성/채팅)을 비회원이 시도하면 뜬다.
// 탐색·검색·열람은 게이트 없이 허용된다.

export type GateFeature =
  | 'wish'
  | 'cart'
  | 'buy'
  | 'write'
  | 'chat'
  | 'review'
  | 'inquiry'
  | 'follow'
  | 'follows'
  | 'block'
  | 'mute'
  | 'report'
  | 'feed'
  | 'repost'
  | 'save'

// SNS 행동은 로그인 뒤 원래 화면으로 돌아와 이어서 한다(A26). 나머지는 기존 안내를 그대로 쓴다.
// 글쓰기(write)는 SNS 게시물 작성이다(SNS-02 design 6절 10번). feed는 비로그인이 누른 팔로잉 피드 탭이다(SNS-03 A9).
// repost, save는 게시물 리포스트와 저장이다(SNS-03 design 6절 5번).
const SNS_FEATURES = new Set<GateFeature>(['follow', 'follows', 'block', 'mute', 'write', 'feed', 'repost', 'save'])

/** 로그인 뒤 다시 실행할 행동. 게이트가 열린 화면의 경로와 함께 sessionStorage에 남긴다. */
export interface GateResume {
  kind: PendingActionKind
  publicId: string
  /** 로그인 뒤 돌아갈 경로를 게이트가 열린 화면의 경로 대신 정할 때 쓴다 */
  returnTo?: string
}

const FEATURE_COPY: Record<GateFeature, string> = {
  wish: '찜은 로그인한 회원만 이용할 수 있어요.',
  cart: '장바구니 담기는 로그인한 회원만 이용할 수 있어요.',
  buy: '구매는 로그인한 뒤에 이어서 진행할 수 있어요.',
  write: '글 작성은 로그인한 회원만 이용할 수 있어요.',
  chat: '채팅은 로그인한 회원만 이용할 수 있어요.',
  review: '리뷰는 로그인한 회원만 볼 수 있어요.',
  inquiry: '상품 문의는 로그인한 회원만 이용할 수 있어요.',
  follow: '팔로우는 로그인한 회원만 이용할 수 있어요.',
  follows: '팔로워/팔로잉 목록은 로그인한 회원만 볼 수 있어요.',
  block: '차단은 로그인한 회원만 이용할 수 있어요.',
  mute: '뮤트는 로그인한 회원만 이용할 수 있어요.',
  report: '신고는 로그인한 회원만 이용할 수 있어요.',
  feed: '팔로잉 피드는 로그인한 회원만 볼 수 있어요.',
  repost: '리포스트는 로그인한 회원만 이용할 수 있어요.',
  save: '저장은 로그인한 회원만 이용할 수 있어요.',
}

export interface UseLoginGate {
  /** 게이트 시트 열림 여부. */
  gateOpen: boolean
  /** 현재 게이트가 안내 중인 기능(문구 결정). */
  gateFeature: GateFeature
  /** 로그인 뒤 다시 실행할 행동. LoginGate의 `resume`으로 넘긴다. */
  gateResume: GateResume | undefined
  /**
   * 로그인 필요 액션을 감싼다. 로그인 상태면 `action`을 즉시 실행하고 `true`를 반환,
   * 비회원이면 게이트를 열고 `false`를 반환한다(액션은 실행하지 않음). `resume`을 주면
   * 로그인 / 회원가입을 누를 때 그 행동과 지금 경로를 보관한다(A26).
   */
  requireAuth: (feature: GateFeature, action: () => void, resume?: GateResume) => boolean
  /** 게이트를 닫는다("둘러보기 계속하기"). */
  closeGate: () => void
}

export function useLoginGate(): UseLoginGate {
  const [state, setState] = useState<{ open: boolean; feature: GateFeature; resume?: GateResume }>({
    open: false,
    feature: 'wish',
  })

  const requireAuth = useCallback(
    (feature: GateFeature, action: () => void, resume?: GateResume): boolean => {
      if (getIsLoggedIn()) {
        action()
        return true
      }
      setState({ open: true, feature, resume })
      return false
    },
    [],
  )

  const closeGate = useCallback(() => setState(s => ({ ...s, open: false })), [])

  return {
    gateOpen: state.open,
    gateFeature: state.feature,
    gateResume: state.resume,
    requireAuth,
    closeGate,
  }
}

export interface LoginGateProps {
  open: boolean
  feature: GateFeature
  onClose: () => void
  /** 로그인 뒤 돌아와 다시 실행할 행동(A26). 없으면 로그인 뒤 홈으로 간다. */
  resume?: GateResume
}

export function LoginGate({ open, feature, onClose, resume }: LoginGateProps) {
  const navigate = useNavigate()
  const href = useRouterState({ select: s => s.location.href })

  // 로그인 화면은 페이지 전체를 이동하므로 행동과 돌아올 경로를 sessionStorage에 남긴다.
  // onClose는 부르지 않는다. 시트는 화면과 함께 사라지고, 화면에 따라 onClose가 뒤로 가기라 이동이 겹친다.
  const goLogin = () => {
    if (resume) savePendingAction({ ...resume, returnTo: resume.returnTo ?? href })
    navigate({ to: '/onboarding/login', search: resume ? { resume: true } : {} })
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 pb-1 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-subtle text-brand">
          <Lock className="size-7" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-subheading font-semibold text-text-primary">로그인이 필요해요</p>
          <p className="text-body-sm leading-relaxed text-text-secondary">
            {FEATURE_COPY[feature]}
            <br />
            {SNS_FEATURES.has(feature)
              ? '로그인하면 보던 화면으로 돌아와 이어서 할 수 있어요.'
              : '로그인하면 찜/주문 내역을 이어서 볼 수 있어요.'}
          </p>
        </div>
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <Button size="lg" fullWidth onClick={goLogin}>
            로그인 / 회원가입
          </Button>
          <Button variant="ghost" size="lg" fullWidth onClick={onClose}>
            둘러보기 계속하기
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

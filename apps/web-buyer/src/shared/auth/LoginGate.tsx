import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { BottomSheet, Button } from '@aechak/design-system/web'
import { getIsLoggedIn } from './auth.store'

// 비회원 로그인 유도 게이트(b13-st-2). 독립 화면이 아니라 어느 화면 위에서든 재사용하는
// BottomSheet 오버레이 — 회원 전용 액션(찜/장바구니/구매/작성/채팅)을 비회원이 시도하면 뜬다.
// 탐색·검색·열람은 게이트 없이 허용된다.

export type GateFeature = 'wish' | 'cart' | 'buy' | 'write' | 'chat'

const FEATURE_COPY: Record<GateFeature, string> = {
  wish: '찜은 로그인한 회원만 이용할 수 있어요.',
  cart: '장바구니 담기는 로그인한 회원만 이용할 수 있어요.',
  buy: '구매는 로그인한 뒤에 이어서 진행할 수 있어요.',
  write: '글 작성은 로그인한 회원만 이용할 수 있어요.',
  chat: '채팅은 로그인한 회원만 이용할 수 있어요.',
}

export interface UseLoginGate {
  /** 게이트 시트 열림 여부. */
  gateOpen: boolean
  /** 현재 게이트가 안내 중인 기능(문구 결정). */
  gateFeature: GateFeature
  /**
   * 로그인 필요 액션을 감싼다. 로그인 상태면 `action`을 즉시 실행하고 `true`를 반환,
   * 비회원이면 게이트를 열고 `false`를 반환한다(액션은 실행하지 않음).
   */
  requireAuth: (feature: GateFeature, action: () => void) => boolean
  /** 게이트를 닫는다("둘러보기 계속하기"). */
  closeGate: () => void
}

export function useLoginGate(): UseLoginGate {
  const [state, setState] = useState<{ open: boolean; feature: GateFeature }>({
    open: false,
    feature: 'wish',
  })

  const requireAuth = useCallback((feature: GateFeature, action: () => void): boolean => {
    if (getIsLoggedIn()) {
      action()
      return true
    }
    setState({ open: true, feature })
    return false
  }, [])

  const closeGate = useCallback(() => setState(s => ({ ...s, open: false })), [])

  return { gateOpen: state.open, gateFeature: state.feature, requireAuth, closeGate }
}

export interface LoginGateProps {
  open: boolean
  feature: GateFeature
  onClose: () => void
}

export function LoginGate({ open, feature, onClose }: LoginGateProps) {
  const navigate = useNavigate()

  const goLogin = () => {
    onClose()
    navigate({ to: '/onboarding/login' })
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
            로그인하면 찜/주문 내역을 이어서 볼 수 있어요.
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

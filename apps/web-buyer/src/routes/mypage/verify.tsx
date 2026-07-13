import { createFileRoute } from '@tanstack/react-router'
import { VerifyScreen } from '@/features/account'

// full-bleed(탭바 없음) — 본인 인증(b10-st-9). 마이 허브/프로필 수정에서 진입.
export const Route = createFileRoute('/mypage/verify')({
  component: VerifyScreen,
})

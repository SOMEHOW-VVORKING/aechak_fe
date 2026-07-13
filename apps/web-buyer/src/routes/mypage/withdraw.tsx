import { createFileRoute } from '@tanstack/react-router'
import { WithdrawScreen } from '@/features/account'

// full-bleed(탭바 없음) — 회원 탈퇴(b10-st-5). 마이 허브에서 진입.
export const Route = createFileRoute('/mypage/withdraw')({
  component: WithdrawScreen,
})

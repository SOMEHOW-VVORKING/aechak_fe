import { createFileRoute } from '@tanstack/react-router'
import { ProfileEditScreen } from '@/features/account'

// full-bleed(탭바 없음) — 프로필 수정(b10-st-2). 마이 허브에서 진입.
export const Route = createFileRoute('/mypage/profile')({
  component: ProfileEditScreen,
})

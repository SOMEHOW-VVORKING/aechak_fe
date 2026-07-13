import { createFileRoute } from '@tanstack/react-router'
import { PetListScreen } from '@/features/pet'

// full-bleed(탭바 없음) — 펫 프로필 관리(b10-st-3). 마이 허브에서 진입.
export const Route = createFileRoute('/mypage/pets/')({
  component: PetListScreen,
})

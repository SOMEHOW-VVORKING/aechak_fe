import { createFileRoute } from '@tanstack/react-router'
import { SnsRelationsScreen } from '@/features/sns'

// 차단/뮤트 관리(b7-st-8). 마이 메뉴에서 들어온다.
export const Route = createFileRoute('/mypage/sns-relations')({
  component: SnsRelationsScreen,
})

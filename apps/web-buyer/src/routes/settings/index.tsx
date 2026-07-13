import { createFileRoute } from '@tanstack/react-router'
import { SettingsHomeScreen } from '@/features/settings'

// 설정 홈(b11-st-1). /mypage(Phase 4)에서 진입. 각 섹션 항목 → 하위 설정 화면 실제 이동.
export const Route = createFileRoute('/settings/')({
  component: SettingsHomeScreen,
})

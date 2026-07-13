import { createFileRoute } from '@tanstack/react-router'
import { ConsentSettingsScreen } from '@/features/settings'

// 약관 및 개인정보 처리 동의 관리(b11-st-3).
export const Route = createFileRoute('/settings/consents')({
  component: ConsentSettingsScreen,
})

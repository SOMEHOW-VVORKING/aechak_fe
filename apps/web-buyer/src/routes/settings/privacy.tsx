import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicyScreen } from '@/features/settings'

// 개인정보 처리방침(b11-st-4).
export const Route = createFileRoute('/settings/privacy')({
  component: PrivacyPolicyScreen,
})

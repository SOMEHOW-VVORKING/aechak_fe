import { createFileRoute } from '@tanstack/react-router'
import { GuidelinesScreen } from '@/features/settings'

// 커뮤니티 가이드라인(b11-st-6).
export const Route = createFileRoute('/settings/guidelines')({
  component: GuidelinesScreen,
})

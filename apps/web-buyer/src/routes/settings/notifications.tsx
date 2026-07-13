import { createFileRoute } from '@tanstack/react-router'
import { NotificationSettingsScreen } from '@/features/settings'

// 알림 설정(b11-st-2).
export const Route = createFileRoute('/settings/notifications')({
  component: NotificationSettingsScreen,
})

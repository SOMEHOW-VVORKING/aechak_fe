import { createFileRoute } from '@tanstack/react-router'
import { FaqScreen } from '@/features/settings'

// 자주 묻는 질문(b11-st-5).
export const Route = createFileRoute('/settings/faq')({
  component: FaqScreen,
})

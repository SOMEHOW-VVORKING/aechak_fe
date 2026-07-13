import { createFileRoute } from '@tanstack/react-router'
import { DataDeletionScreen } from '@/features/settings'

// 계정 및 데이터 삭제 안내(b11-st-7).
export const Route = createFileRoute('/settings/data-deletion')({
  component: DataDeletionScreen,
})

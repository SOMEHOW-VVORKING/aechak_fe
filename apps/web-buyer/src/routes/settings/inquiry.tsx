import { createFileRoute } from '@tanstack/react-router'
import { InquiryScreen } from '@/features/inquiry'

// 고객센터 문의(b6-st-3) — 앱 서비스 문의 접수(POST /inquiries).
export const Route = createFileRoute('/settings/inquiry')({
  component: InquiryScreen,
})

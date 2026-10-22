import { createFileRoute } from '@tanstack/react-router'
import { SnsProfileScreen } from '@/features/sns'

// 내 SNS 프로필(b7-st-4, GET /sns/me). 마이 메뉴의 내 SNS 프로필 행에서 들어온다(R3-02).
export const Route = createFileRoute('/sns/me')({
  component: () => <SnsProfileScreen />,
})

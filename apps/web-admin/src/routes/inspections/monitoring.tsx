import { createFileRoute } from '@tanstack/react-router'
import { InspectionMonitorPage } from '@/features/inspection-monitor'

// admin 모듈의 검수 진행 현황 API(`GET /admin/inspections`, `/{inspectionId}`)에 붙은 실연동 화면.
// 경로를 `/orders/monitoring`과 같은 꼴로 둔 이유는 어드민 nav가 이미 '모니터링'을 "지금 흐르는
// 것을 본다(조치는 다른 화면)"는 뜻으로 쓰고 있어서다 — '큐'는 운영자가 처리할 것이 쌓이는 자리다.
export const Route = createFileRoute('/inspections/monitoring')({
  component: InspectionMonitorPage,
})

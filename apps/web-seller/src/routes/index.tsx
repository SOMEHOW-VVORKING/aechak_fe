import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '../features/dashboard'

// 셀러센터 랜딩(로그인 복귀 지점). seller 모듈에 집계 API가 올라와(GET /sellers/me/dashboard/summary,
// SCRUM-269·SCRUM-278) 목업 시절의 진입 차단 스위치를 걷고 실 데이터를 그린다.
export const Route = createFileRoute('/')({
  component: DashboardPage,
})

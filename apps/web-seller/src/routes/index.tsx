import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DashboardPage } from '../features/dashboard'
import { UnavailableScreen } from '../shared/components/UnavailableScreen'

export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

/**
 * 운영 진입 차단 스위치. seller 모듈에 대시보드 집계 API가 없어(컨트롤러는 상품·입점 신청뿐)
 * `DashboardPage`는 목업 수치만 그린다. nav에서 항목을 빼고 로그인 복귀 지점(`/`)은 안내만 보여준다.
 * 서버 집계가 생기면 `useDashboardSummary`를 fetcher로 바꾸고 이 상수를 올리면 그대로 살아난다.
 */
const SERVER_DASHBOARD_AVAILABLE = false

function DashboardRoute() {
  const navigate = useNavigate()
  if (!SERVER_DASHBOARD_AVAILABLE) {
    return (
      <UnavailableScreen
        title="대시보드"
        message="대시보드는 준비 중이에요"
        description="주문·정산 집계가 준비되면 여기서 볼 수 있어요. 지금은 상품 관리와 스토어 설정을 쓸 수 있어요."
        action={{ label: '상품 관리로', onClick: () => void navigate({ to: '/products' }) }}
      />
    )
  }
  return <DashboardPage />
}

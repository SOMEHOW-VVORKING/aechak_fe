import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/')({
  component: DashboardRoute,
})

// 로그인 복귀 지점(`/login/complete`가 여기로 redirect)이라 라우트를 비울 수 없다. admin 모듈에
// 운영 지표 집계 API가 없어(컨트롤러는 관리자 명부·입점 심사뿐) 숫자를 만들어 띄우지 않고,
// 지금 열려 있는 화면으로 바로 보낸다 — web-seller 대시보드 게이트와 같은 모양이다.
// 집계 API가 생기면 이 안내를 실제 대시보드로 교체한다.
function DashboardRoute() {
  const navigate = useNavigate()
  return (
    <UnavailableScreen
      title="대시보드"
      description="플랫폼 운영 지표를 한눈에 봐요."
      message="운영 지표 대시보드는 준비 중이에요"
      action={{
        label: '셀러 입점 심사로',
        onClick: () => void navigate({ to: '/sellers/applications' }),
      }}
    />
  )
}

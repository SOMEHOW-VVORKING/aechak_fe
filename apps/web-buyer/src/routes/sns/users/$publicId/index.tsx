import { createFileRoute } from '@tanstack/react-router'
import { SnsProfileScreen } from '@/features/sns'
import { restoreSessionOrGuest } from '@/shared/auth'

// 다른 사용자의 SNS 프로필(b7-st-4). 비로그인도 볼 수 있다(A9). 토큰이 있어야 관계 필드와 나를 차단한 404가
// 채워지므로 조회 전에 세션을 복원하고, 복원하지 못하면 비로그인으로 보여준다(로그인 안내 시트와 A26이 동작한다).
export const Route = createFileRoute('/sns/users/$publicId/')({
  beforeLoad: restoreSessionOrGuest,
  component: SnsProfileRoute,
})

function SnsProfileRoute() {
  const { publicId } = Route.useParams()
  // publicId가 바뀌면(목록 행에서 다른 프로필로 이동) 화면 상태(탭, 시트, Modal)를 새로 시작한다.
  return <SnsProfileScreen key={publicId} publicId={publicId} />
}

import { createFileRoute } from '@tanstack/react-router'
import { SnsProfileScreen } from '@/features/sns'

// 다른 사용자의 SNS 프로필(b7-st-4). 비로그인도 볼 수 있다(A9).
export const Route = createFileRoute('/sns/users/$publicId/')({
  component: SnsProfileRoute,
})

function SnsProfileRoute() {
  const { publicId } = Route.useParams()
  // publicId가 바뀌면(목록 행에서 다른 프로필로 이동) 화면 상태(탭, 시트, Modal)를 새로 시작한다.
  return <SnsProfileScreen key={publicId} publicId={publicId} />
}

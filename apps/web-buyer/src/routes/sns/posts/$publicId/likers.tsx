import { createFileRoute } from '@tanstack/react-router'
import { SnsLikersScreen } from '@/features/sns'

// 게시물 좋아요한 사람(b7-st-9). 로그인 전용이고 주소로 들어온 비로그인에게는 요청 없이 로그인 안내 시트를 연다.
// 세션 복원은 __root beforeLoad가 모든 라우트에 한 번 끝낸다.
export const Route = createFileRoute('/sns/posts/$publicId/likers')({
  component: SnsLikersRoute,
})

function SnsLikersRoute() {
  const { publicId } = Route.useParams()
  return <SnsLikersScreen key={publicId} publicId={publicId} />
}

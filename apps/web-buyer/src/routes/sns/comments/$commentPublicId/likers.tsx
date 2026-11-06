import { createFileRoute } from '@tanstack/react-router'
import { SnsLikersScreen } from '@/features/sns'

// 댓글 좋아요한 사람(b7-st-9 9-B). 로그인 전용이고 주소로 들어온 비로그인에게는 요청 없이 로그인 안내 시트를 연다.
export const Route = createFileRoute('/sns/comments/$commentPublicId/likers')({
  component: SnsCommentLikersRoute,
})

function SnsCommentLikersRoute() {
  const { commentPublicId } = Route.useParams()
  return <SnsLikersScreen key={commentPublicId} publicId={commentPublicId} target="comment" />
}

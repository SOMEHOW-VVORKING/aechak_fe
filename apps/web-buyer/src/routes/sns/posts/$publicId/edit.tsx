import { createFileRoute } from '@tanstack/react-router'
import { SnsPostEditScreen } from '@/features/sns'

// 게시물 수정. 세션 복원(design 6절 11번의 restoreSessionOrGuest)은 __root beforeLoad가 모든 라우트에 한 번 끝낸다.
export const Route = createFileRoute('/sns/posts/$publicId/edit')({
  component: SnsPostEditRoute,
})

function SnsPostEditRoute() {
  const { publicId } = Route.useParams()
  return <SnsPostEditScreen key={publicId} publicId={publicId} />
}

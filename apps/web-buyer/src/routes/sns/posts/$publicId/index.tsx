import { createFileRoute } from '@tanstack/react-router'
import { SnsPostDetailScreen } from '@/features/sns'

// 게시물 상세(b7-st-2). 공유 링크로 비로그인도 연다(A9). 세션 복원(design 6절 11번의 restoreSessionOrGuest)은
// __root beforeLoad가 모든 라우트에 한 번 끝낸다. 여기서 다시 부르면 refresh 쿠키를 한 번 더 회전시킨다.
// author는 카드나 프로필에서 들어와 작성자를 알 때만 붙는다(내가 차단한 작성자 안내의 프로필 이동, G4).
export interface SnsPostSearch {
  author?: string
}

export const Route = createFileRoute('/sns/posts/$publicId/')({
  validateSearch: (search: Record<string, unknown>): SnsPostSearch =>
    typeof search['author'] === 'string' && search['author'] !== '' ? { author: search['author'] } : {},
  component: SnsPostRoute,
})

function SnsPostRoute() {
  const { publicId } = Route.useParams()
  const { author } = Route.useSearch()
  // 다른 게시물로 이동하면 화면 상태(시트, Modal)를 새로 시작한다.
  return <SnsPostDetailScreen key={publicId} publicId={publicId} author={author} />
}

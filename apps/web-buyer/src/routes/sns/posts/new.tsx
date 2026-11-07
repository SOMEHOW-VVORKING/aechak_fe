import { createFileRoute } from '@tanstack/react-router'
import { SnsComposeScreen } from '@/features/sns'

// 게시물 작성(b7-st-3). 세션 복원(design 6절 11번의 restoreSessionOrGuest)은 __root beforeLoad가 모든 라우트에
// 한 번 끝낸다. 새로고침한 로그인 사용자도 복원된 뒤에 그려져 비로그인으로 판단하지 않는다.
export const Route = createFileRoute('/sns/posts/new')({
  component: SnsComposeScreen,
})

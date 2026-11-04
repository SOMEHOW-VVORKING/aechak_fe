import { createFileRoute } from '@tanstack/react-router'
import { NoticeDetailScreen } from '@/features/notices'
import { AuthRequiredScreen, useSessionState } from '@/shared/auth'

// 공지 전문. 목록 응답에 content가 없어(앞 100자 미리보기뿐) 상세는 별도 경로로 조회한다.
export const Route = createFileRoute('/settings/notices/$noticeId')({
  component: NoticeDetailRoute,
})

// 목록과 같은 회원 전용 경로다(`GET /notices/{noticeId}`도 permitAll 목록에 없다).
function NoticeDetailRoute() {
  const { noticeId } = Route.useParams()
  if (useSessionState() === 'guest') return <AuthRequiredScreen feature="notice" />
  return <NoticeDetailScreen noticeId={noticeId} />
}

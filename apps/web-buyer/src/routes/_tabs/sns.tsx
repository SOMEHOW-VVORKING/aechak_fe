import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { SnsWriteFab } from '@/features/sns'
import { ComingSoon } from '@/shared/components/ComingSoon'
import { SNS_SERVER_AVAILABLE } from '@/shared/sns-availability'

export const Route = createFileRoute('/_tabs/sns')({
  component: SnsScreen,
})

// 피드(SNS-03) 전까지는 준비 중 안내 위에 글쓰기 버튼만 둔다. 글쓰기 진입점은 SNS 공개 전까지 숨기고
// 작성 라우트(/sns/posts/new)는 상수와 관계없이 동작한다(SNS-01 F1과 같다).
function SnsScreen() {
  return (
    <div className="relative h-full">
      <ComingSoon icon={<Users className="size-6" />} />
      {SNS_SERVER_AVAILABLE && <SnsWriteFab />}
    </div>
  )
}

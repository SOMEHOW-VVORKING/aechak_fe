import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/audit-log')({
  component: AuditLogRoute,
})

// 어드민 액션 로그 조회 API가 없다. 감사 로그는 "비어 있다"와 "조회가 안 된다"를 운영자가
// 구별해야 하는 화면이라, 빈 표를 그려 보여주면 안 된다 — 준비 중임을 글자로 밝힌다.
function AuditLogRoute() {
  return (
    <UnavailableScreen
      title="어드민 액션 로그"
      description="관리자가 수행한 운영 액션 이력을 조회합니다."
      message="어드민 액션 로그는 준비 중이에요"
    />
  )
}

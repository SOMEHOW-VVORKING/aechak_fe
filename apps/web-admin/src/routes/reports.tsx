import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/reports')({
  component: ReportsRoute,
})

// admin 모듈에 신고 조회·제재 처리 API가 없다. 신고 **접수**(구매자가 신고를 넣는 쪽)는 열린
// BE PR #100(SCRUM-231)에 있고, 운영자가 접수 건을 들여다보고 제재하는 경로는 그 PR에도 없다.
// nav에는 "준비 중" 꼬리표로 올려 두고(__root.tsx) 여기서는 안내만 보여준다 — 가짜 목록을
// 그리면 운영자가 처리된 줄 안다.
function ReportsRoute() {
  return (
    <UnavailableScreen
      title="신고 제재 관리"
      description="접수된 신고를 확인하고 제재를 처리해요."
      message="신고 제재 관리는 준비 중이에요"
    />
  )
}

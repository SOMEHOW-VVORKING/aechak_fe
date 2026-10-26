import { Card, EmptyState, PageHeader, StatusPill } from '@aechak/design-system/web'

export interface UpcomingItem {
  label: string
  description: string
}

interface UnavailableScreenProps {
  title: string
  message: string
  description?: string
  action?: { label: string; onClick: () => void }
  /**
   * 화면이 나중에 무엇을 보여줄지 적는 목록. 라우트 파일이 처음부터 없던 화면(문의/리뷰/쿠폰/
   * 공지/계정)은 목업조차 없어 안내 한 줄만 두면 운영자가 "뭘 준비 중인지" 알 수 없다 —
   * 들어올 항목을 글로 적어 둔다. **표 머리글 같은 빈 자료 틀은 쓰지 않는다**: 행 없는 표는
   * "준비 중"이 아니라 "데이터가 없다"로 읽혀 규약 10의 취지를 거꾸로 깨뜨린다.
   */
  upcoming?: UpcomingItem[]
}

// BE 엔드포인트가 아직 없는 화면의 운영 진입 차단 안내 — 헤더 + "준비 중" EmptyState.
// 목업으로 동작하던 화면이 저장되는 것처럼 보이지 않게, 주소로 직접 들어와도 이 안내만 보여준다.
export function UnavailableScreen({
  title,
  message,
  description,
  action,
  upcoming,
}: UnavailableScreenProps) {
  return (
    <div className="p-6">
      <PageHeader
        title={title}
        // 스크롤하지 않아도 화면 상태가 먼저 읽히게 제목 옆에 표시한다(비활성 상태라 muted).
        actions={<StatusPill variant="muted">준비 중</StatusPill>}
      />
      <EmptyState title={message} description={description} action={action} />

      {upcoming && upcoming.length > 0 && (
        <Card padding="md" className="mx-auto max-w-xl">
          <p className="mb-3 text-body-sm font-semibold text-text-primary">이 화면에 들어올 것</p>
          <ul>
            {upcoming.map(item => (
              <li
                key={item.label}
                className="border-b border-border-subtle py-2.5 first:pt-0 last:border-b-0 last:pb-0"
              >
                <p className="text-body-sm font-medium text-text-secondary">{item.label}</p>
                <p className="mt-0.5 text-caption text-text-tertiary">{item.description}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

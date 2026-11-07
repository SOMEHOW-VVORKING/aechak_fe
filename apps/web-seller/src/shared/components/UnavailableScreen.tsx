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
   * 화면이 나중에 무엇을 보여줄지 적는 목록. 안내 한 줄만 두면 운영자가 "뭘 준비 중인지" 알 수
   * 없을 때 들어올 항목을 글로 적는다.
   *
   * **지금은 쓰는 자리가 없다**: 문의·리뷰·공지는 서버가 붙어 실연동이 됐고(SCRUM-315·316·332),
   * 쿠폰·계정은 2026-11-07 데모 정리에서 화면째 걷어냈다. 프롭은 남겨 둔다 — 서버가 내려가
   * 게이트가 닫히는 화면(주문·클레임·문의)에서 다시 쓸 자리다.
   */
  upcoming?: UpcomingItem[]
}

// 화면의 운영 진입 차단 안내 — 헤더 + "준비 중" EmptyState. 저장되지 않는 화면이 멀쩡해 보이지
// 않게, 주소로 직접 들어와도 이 안내만 보여준다.
//
// 지금 남은 쓰임은 **서버가 내려갔을 때 진입점을 닫는 게이트**다(`serverAvailability` 분기 —
// 주문·클레임·문의). BE가 처음부터 없어 예시 데이터로 열어 두던 쿠폰·계정 화면은 2026-11-07
// 데모 정리에서 nav 항목과 함께 지웠다(예시 띠 컴포넌트도 그때 사라졌다).
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

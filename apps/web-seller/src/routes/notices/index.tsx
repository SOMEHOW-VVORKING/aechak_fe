import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Button, FilterBar, PageHeader, Select, StatusPill, Tabs } from '@aechak/design-system/web'
import {
  NOTICE_CATEGORY_LABEL,
  NoticeDetailDrawer,
  NoticesTable,
  NotificationChannelCard,
  SAMPLE_NOTICES,
  type NoticeCategory,
} from '@/features/notices'
import { SAMPLE_ACTION_TOAST, SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/notices/')({
  component: NoticesRoute,
})

/**
 * 알림/공지 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307에서 **안내만 있던 화면을 예시 데이터로 채웠다**(`UnavailableScreen` → 공지 목록 +
 * 수신 설정). 지운 것은 없고, 저장되지 않는다는 사실은 상단 `SampleDataNotice` 띠가 말한다.
 *
 * 예시 데이터와 BE가 생겼을 때의 교체 방법은 `features/notices/notices.mock.ts` 머리에 있다.
 */

type ReadTab = 'ALL' | 'UNREAD'

const CATEGORY_OPTIONS = [
  { value: '', label: '전체 분류' },
  ...(Object.entries(NOTICE_CATEGORY_LABEL) as [NoticeCategory, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
]

function NoticesRoute() {
  const [tab, setTab] = useState<ReadTab>('ALL')
  const [category, setCategory] = useState<NoticeCategory | ''>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const toast = useToast()

  const unreadCount = SAMPLE_NOTICES.filter(notice => !notice.read).length

  // 탭·필터는 예시 배열에 실제로 적용한다 — 눌러도 아무 일 없는 컨트롤은 장식 UI다(AGENTS.md 2절).
  const rows = useMemo(
    () =>
      SAMPLE_NOTICES.filter(notice => {
        if (tab === 'UNREAD' && notice.read) return false
        if (category !== '' && notice.category !== category) return false
        return true
      }),
    [tab, category],
  )

  const openNotice = SAMPLE_NOTICES.find(notice => notice.noticePublicId === openId) ?? null

  return (
    <div className="p-6">
      <PageHeader title="알림/공지" actions={<StatusPill variant="muted">준비 중</StatusPill>} />

      <SampleDataNotice
        replaceWhen={
          <>
            seller 호스트에 <strong>GET /sellers/me/notices</strong>와 수신 설정 경로가 생기면 운영자가
            보낸 실제 공지로 바뀌어요.
          </>
        }
      />

      <Tabs
        tabs={[
          { key: 'ALL', label: '전체', badge: SAMPLE_NOTICES.length },
          { key: 'UNREAD', label: '안 읽음', badge: unreadCount },
        ]}
        activeKey={tab}
        onSelect={key => setTab(key as ReadTab)}
        className="mb-4"
      />

      <FilterBar>
        <Select
          aria-label="공지 분류"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={value => setCategory(value as NoticeCategory | '')}
        />
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setTab('ALL')
            setCategory('')
          }}
        >
          초기화
        </Button>
      </FilterBar>

      <p className="mt-4 text-caption text-text-tertiary">총 {rows.length}건</p>

      <div className="mt-2">
        <NoticesTable notices={rows} onOpen={setOpenId} />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        행을 누르면 공지 전문을 볼 수 있어요. 중요 공지는 정책이 바뀌는 날짜를 함께 알려 줘요.
      </p>

      <div className="mt-5">
        <NotificationChannelCard onSave={() => toast.show(SAMPLE_ACTION_TOAST, 'info')} />
      </div>

      <NoticeDetailDrawer notice={openNotice} onClose={() => setOpenId(null)} />

      {toast.element}
    </div>
  )
}

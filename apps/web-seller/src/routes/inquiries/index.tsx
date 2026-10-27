import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Button,
  FilterBar,
  MetricCard,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  Tabs,
} from '@aechak/design-system/web'
import {
  INQUIRY_CATEGORY_LABEL,
  InquiriesTable,
  InquiryAnswerDrawer,
  SAMPLE_INQUIRIES,
  isOverdue,
  type InquiryCategory,
} from '@/features/inquiries'
import { SAMPLE_ACTION_TOAST, SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/inquiries/')({
  component: InquiriesRoute,
})

/**
 * 고객 문의 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307에서 **안내만 있던 화면을 예시 데이터로 채웠다**(`UnavailableScreen` → 문의 목록 + 답변
 * 폼). 지운 것은 없고, 화면이 저장되지 않는다는 사실은 상단 `SampleDataNotice` 띠가 글자로 말한다.
 * nav의 "준비 중" 꼬리표도 그대로 둔다 — 서버가 없다는 사실은 그대로이기 때문이다.
 *
 * 예시 데이터와 BE가 생겼을 때의 교체 방법은 `features/inquiries/inquiries.mock.ts` 머리에 있다.
 */

type StatusTab = 'ALL' | 'PENDING' | 'ANSWERED'

const CATEGORY_OPTIONS = [
  { value: '', label: '전체 유형' },
  ...(Object.entries(INQUIRY_CATEGORY_LABEL) as [InquiryCategory, string][]).map(
    ([value, label]) => ({ value, label }),
  ),
]

function InquiriesRoute() {
  const [tab, setTab] = useState<StatusTab>('ALL')
  const [category, setCategory] = useState<InquiryCategory | ''>('')
  const [keyword, setKeyword] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const toast = useToast()

  const pendingCount = SAMPLE_INQUIRIES.filter(row => row.status === 'PENDING').length
  const overdueCount = SAMPLE_INQUIRIES.filter(isOverdue).length

  // 필터·탭·검색은 예시 배열에 실제로 적용한다 — 눌러도 아무 일 없는 컨트롤은 장식 UI다(AGENTS.md 2절).
  const rows = useMemo(() => {
    const needle = keyword.trim()
    return SAMPLE_INQUIRIES.filter(row => {
      if (tab !== 'ALL' && row.status !== tab) return false
      if (category !== '' && row.category !== category) return false
      if (needle !== '' && !row.title.includes(needle) && !row.productName.includes(needle)) {
        return false
      }
      return true
    })
  }, [tab, category, keyword])

  const openInquiry = SAMPLE_INQUIRIES.find(row => row.inquiryPublicId === openId) ?? null

  return (
    <div className="p-6">
      <PageHeader title="고객 문의" actions={<StatusPill variant="muted">준비 중</StatusPill>} />

      <SampleDataNotice
        replaceWhen={
          <>
            seller 호스트에 <strong>GET /sellers/me/inquiries</strong>와 답변 전송 경로가 생기면 실제
            문의로 바뀌어요.
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MetricCard label="답변 대기" value={`${pendingCount}건`} variant={pendingCount > 0 ? 'urgent' : 'default'} />
        <MetricCard label="답변 기한 지남" value={`${overdueCount}건`} variant={overdueCount > 0 ? 'urgent' : 'default'} />
        <MetricCard label="전체 문의" value={`${SAMPLE_INQUIRIES.length}건`} variant="quiet" />
      </div>

      <Tabs
        tabs={[
          { key: 'ALL', label: '전체', badge: SAMPLE_INQUIRIES.length },
          { key: 'PENDING', label: '답변 대기', badge: pendingCount },
          { key: 'ANSWERED', label: '답변 완료', badge: SAMPLE_INQUIRIES.length - pendingCount },
        ]}
        activeKey={tab}
        onSelect={key => setTab(key as StatusTab)}
        className="mb-4"
      />

      <FilterBar>
        <Select
          aria-label="문의 유형"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={value => setCategory(value as InquiryCategory | '')}
        />
        <SearchInput
          aria-label="문의 검색"
          placeholder="문의 제목이나 상품명으로 찾기"
          value={keyword}
          onChange={setKeyword}
        />
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            setTab('ALL')
            setCategory('')
            setKeyword('')
          }}
        >
          초기화
        </Button>
      </FilterBar>

      <p className="mt-4 text-caption text-text-tertiary">총 {rows.length}건</p>

      <div className="mt-2">
        <InquiriesTable inquiries={rows} onOpen={setOpenId} />
      </div>

      <p className="mt-3.5 text-caption text-text-tertiary">
        행을 누르면 문의 전문과 답변 폼을 볼 수 있어요. 비밀글은 구매자와 셀러만 볼 수 있어요.
      </p>

      <InquiryAnswerDrawer
        inquiry={openInquiry}
        onClose={() => setOpenId(null)}
        onSend={() => {
          setOpenId(null)
          toast.show(SAMPLE_ACTION_TOAST, 'info')
        }}
      />

      {toast.element}
    </div>
  )
}

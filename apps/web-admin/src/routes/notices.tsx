import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle,
  FileEdit,
  Megaphone,
  Pin,
  Send,
  Wrench,
} from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Input,
  Modal,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
  Toggle,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminNotices } from '@/features/notices'
import type {
  AdminNotice,
  AdminNoticeAudience,
  AdminNoticeCategory,
  AdminNoticeStatus,
} from '@/features/notices'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

// 공지·알림 발송 API가 admin 모듈에 없다. 안내 화면으로 돌려보내는 대신 예시 데이터로 모양을
// 보여주되, 발송은 되돌릴 수 없는 액션이라 상단 띠로 특히 분명히 밝힌다(SCRUM-308).
export const Route = createFileRoute('/notices')({
  component: NoticesPage,
})

const categoryMeta: Record<AdminNoticeCategory, StatusMeta> = {
  service: { label: '서비스', variant: 'neutral', icon: Megaphone },
  maintenance: { label: '점검', variant: 'warning', icon: Wrench },
  event: { label: '이벤트', variant: 'accent', icon: Bell },
  policy: { label: '정책', variant: 'info', icon: FileEdit },
}

const statusMeta: Record<AdminNoticeStatus, StatusMeta> = {
  draft: { label: '작성 중', variant: 'muted', icon: FileEdit },
  scheduled: { label: '게시 예약', variant: 'info', icon: CalendarClock },
  published: { label: '게시 중', variant: 'success', icon: CheckCircle },
  ended: { label: '종료', variant: 'muted', icon: CheckCircle },
}

const audienceLabel: Record<AdminNoticeAudience, string> = {
  all: '전체',
  buyer: '구매자',
  seller: '셀러',
}

const statusFilterOptions = [
  { value: 'all', label: '게시 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

/**
 * 대상 필터의 "미선택" 센티넬. 다른 어드민 화면은 `'all'`을 쓰지만 **이 축에는 `'all'`이 실제
 * 값으로 있다**(전체 회원 대상 공지) — 그대로 쓰면 같은 `value`가 옵션에 두 번 들어가 React가
 * `Encountered two children with the same key, 'all'`을 띄우고, 더 나쁜 건 "전체 대상"을 골라도
 * 아래 조건이 미선택으로 읽어 전체가 그대로 보이는 것이다(동작 안 하는 필터 = 2절 금지).
 */
const AUDIENCE_ANY = 'any'

const audienceFilterOptions = [
  { value: AUDIENCE_ANY, label: '대상 전체' },
  ...Object.entries(audienceLabel).map(([value, label]) => ({ value, label: `${label} 대상` })),
]

const audienceSelectOptions = Object.entries(audienceLabel).map(([value, label]) => ({
  value,
  label,
}))

function makeNoticeColumns(onOpenDetail: (row: AdminNotice) => void): Column<AdminNotice>[] {
  return [
    {
      key: 'title',
      label: '제목',
      render: row => (
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5">
            {row.pinned && <Pin className="size-3.5 flex-none text-brand" />}
            <RowLinkButton onClick={() => onOpenDetail(row)}>{row.title}</RowLinkButton>
          </span>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {audienceLabel[row.audience]} 대상 / {row.pushEnabled ? '푸시 포함' : '푸시 없음'}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      label: '분류',
      align: 'center',
      render: row => <StatusMetaPill meta={categoryMeta[row.category]} />,
    },
    {
      key: 'publishAt',
      label: '게시 시각',
      align: 'right',
      render: row => <span className="tabular-nums">{row.publishAt}</span>,
    },
    {
      key: 'pushReach',
      label: '푸시 도달',
      align: 'right',
      render: row =>
        row.pushReach == null ? (
          <span className="text-text-tertiary">—</span>
        ) : (
          <span className="tabular-nums">{row.pushReach.toLocaleString('ko-KR')}명</span>
        ),
    },
    {
      key: 'status',
      label: '게시 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
  ]
}

function NoticesPage() {
  const { data, isLoading } = useAdminNotices()
  const {
    items,
    patchRow,
    selected,
    select,
    closeDrawer,
    confirmOpen,
    setConfirmOpen,
    toast,
    setToast,
  } = useDetailList(data)

  const [statusFilter, setStatusFilter] = useState('all')
  const [audienceFilter, setAudienceFilter] = useState(AUDIENCE_ANY)
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (audienceFilter !== AUDIENCE_ANY && row.audience !== audienceFilter) return false
        if (search && !row.title.includes(search)) return false
        return true
      }),
    [items, statusFilter, audienceFilter, search],
  )

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AdminNoticeAudience>('all')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AdminNotice) {
    select(row.id)
    setTitle(row.title)
    setBody(row.body)
    setAudience(row.audience)
    setPushEnabled(row.pushEnabled)
    setPinned(row.pinned)
    setInternalMemo(row.internalMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 편집 결과를 화면에만 겹쳐 보여준다(useDetailList의 edits).
  // 실제 발송은 되돌릴 수 없으므로, 실연동될 때 이 자리가 유일한 mutation 지점이 된다.
  function publishNotice(target: AdminNotice) {
    patchRow(target.id, {
      title,
      body,
      audience,
      pushEnabled,
      pinned,
      internalMemo,
      status: 'published',
    })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const noticeColumns = useMemo(() => makeNoticeColumns(openDrawer), [])

  return (
    <div className="p-6">
      <PageIntro title="알림/공지 관리" description="서비스 공지를 등록하고 알림을 발송해요." />

      <MockDataNotice>
        발송은 되돌릴 수 없는 액션이라 예시 화면에서는 아무것도 나가지 않아요. 발송 경로가 생기면
        이 화면이 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect
          options={audienceFilterOptions}
          value={audienceFilter}
          onChange={setAudienceFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="공지 제목 검색"
          className="w-64"
        />
      </FilterBar>

      <DataTable
        columns={noticeColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 공지가 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="공지 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} / ${selected.publishAt}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<Send className="size-4" />}
                onClick={() => setConfirmOpen(true)}
                disabled={title.trim().length === 0 || body.trim().length === 0}
              >
                게시하기
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  <StatusMetaPill meta={categoryMeta[selected.category]} />
                  <StatusPill variant={pushEnabled ? 'brand' : 'muted'}>
                    {pushEnabled ? <Bell className="size-3" /> : <BellOff className="size-3" />}
                    {pushEnabled ? '푸시 발송' : '푸시 없음'}
                  </StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '분류', value: categoryMeta[selected.category].label },
                  { label: '게시 시각', value: selected.publishAt },
                  {
                    label: '푸시 도달',
                    value:
                      selected.pushReach == null
                        ? '미발송'
                        : `${selected.pushReach.toLocaleString('ko-KR')}명`,
                  },
                  { label: '공지 ID', value: selected.id },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="제목" visibility="visible-to-user">
              <Input value={title} onChange={event => setTitle(event.target.value)} />
            </DetailField>

            <DetailField label="내용" visibility="visible-to-user">
              <Textarea value={body} onChange={setBody} maxLength={2000} rows={6} />
            </DetailField>

            <DetailField label="노출 대상">
              <Select
                options={audienceSelectOptions}
                value={audience}
                onChange={value => setAudience(value as AdminNoticeAudience)}
              />
            </DetailField>

            <DetailField label="발송 옵션">
              <div className="space-y-2.5">
                <Toggle label="푸시 알림 함께 보내기" checked={pushEnabled} onChange={setPushEnabled} />
                <Toggle label="목록 상단에 고정" checked={pinned} onChange={setPinned} />
              </div>
            </DetailField>

            <DetailField label="내부 메모" visibility="internal-only">
              <Textarea
                value={internalMemo}
                onChange={setInternalMemo}
                maxLength={300}
                rows={3}
                placeholder="내부 공유용 메모를 입력하세요."
              />
            </DetailField>
          </DetailDrawerBody>
        )}
      </Drawer>

      {selected && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={pushEnabled ? '공지를 게시하고 푸시를 보낼까요?' : '공지를 게시할까요?'}
          description={
            pushEnabled
              ? '푸시는 한 번 나가면 회수할 수 없어요. 대상과 문구를 다시 확인하세요.'
              : '게시하면 바로 공지 목록에 노출돼요.'
          }
          confirmLabel="게시하기"
          confirmVariant={pushEnabled ? 'danger' : 'primary'}
          onConfirm={() => publishNotice(selected)}
        >
          <SummaryGrid
            items={[
              { label: '제목', value: title },
              { label: '대상', value: audienceLabel[audience] },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}

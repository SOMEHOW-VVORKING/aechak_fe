import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  Flag,
  HelpCircle,
  Store,
  Truck,
  UserCog,
} from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminInquiries } from '@/features/inquiries'
import type { AdminInquiry, AdminInquiryCategory, AdminInquiryStatus } from '@/features/inquiries'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { MockDataNotice, MOCK_WRITE_TOAST } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

// api 호스트의 `/inquiries`는 구매자 본인 접수 경로다 — 운영자 전체 조회·답변 경로가 admin 모듈에
// 없어 목록·답변이 예시다. 안내 화면으로 돌려보내는 대신 상단 띠로 밝히고 쓰기를 막는다(SCRUM-308).
export const Route = createFileRoute('/inquiries')({
  component: InquiriesPage,
})

const categoryMeta: Record<AdminInquiryCategory, StatusMeta> = {
  account: { label: '계정', variant: 'neutral', icon: UserCog },
  payment: { label: '결제', variant: 'neutral', icon: CreditCard },
  delivery: { label: '배송', variant: 'neutral', icon: Truck },
  seller: { label: '셀러', variant: 'neutral', icon: Store },
  report: { label: '신고', variant: 'neutral', icon: Flag },
  etc: { label: '기타', variant: 'neutral', icon: HelpCircle },
}

const statusMeta: Record<AdminInquiryStatus, StatusMeta> = {
  waiting: { label: '답변 대기', variant: 'warning', icon: Clock },
  'in-progress': { label: '확인 중', variant: 'info', icon: AlertTriangle },
  answered: { label: '답변 완료', variant: 'success', icon: CheckCircle },
  closed: { label: '종결', variant: 'muted', icon: CheckCircle },
}

const statusFilterOptions = [
  { value: 'all', label: '답변 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const categoryFilterOptions = [
  { value: 'all', label: '문의 유형 전체' },
  ...Object.entries(categoryMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

/** 접수 24시간이 지나도록 답변이 안 나간 문의는 운영자가 먼저 봐야 한다. */
const isDelayed = (row: AdminInquiry) =>
  row.elapsedHours >= 24 && (row.status === 'waiting' || row.status === 'in-progress')

function makeInquiryColumns(onOpenDetail: (row: AdminInquiry) => void): Column<AdminInquiry>[] {
  return [
    {
      key: 'title',
      label: '문의 제목',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)}>{row.title}</RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.writerMasked} / {row.channel}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={categoryMeta[row.category]} />,
    },
    {
      key: 'receivedAt',
      label: '접수',
      align: 'right',
      render: row => <span className="tabular-nums">{row.receivedAt}</span>,
    },
    {
      key: 'elapsedHours',
      label: '경과',
      align: 'right',
      render: row => (
        <span
          className={`tabular-nums ${isDelayed(row) ? 'font-semibold text-warning-fg' : ''}`}
        >
          {row.elapsedHours}시간
        </span>
      ),
    },
    {
      key: 'status',
      label: '답변 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
  ]
}

function InquiriesPage() {
  const { data, isLoading } = useAdminInquiries()
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
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
        if (search && !row.title.includes(search) && !row.writerMasked.includes(search)) return false
        return true
      }),
    [items, statusFilter, categoryFilter, search],
  )

  const [answer, setAnswer] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AdminInquiry) {
    select(row.id)
    setAnswer(row.answer ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 답변 내용을 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function submitAnswer(target: AdminInquiry) {
    patchRow(target.id, { status: 'answered', answer, internalMemo })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const inquiryColumns = useMemo(() => makeInquiryColumns(openDrawer), [])
  const delayedCount = items.filter(isDelayed).length

  return (
    <div className="p-6">
      <PageIntro title="서비스 문의 관리" description="접수된 서비스 문의를 확인하고 답변해요." />

      <MockDataNotice>
        운영자용 문의 조회/답변 경로가 admin 모듈에 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect
          options={categoryFilterOptions}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="제목 / 문의자 검색"
          className="w-64"
        />
        {delayedCount > 0 && (
          <StatusPill variant="warning">
            <Clock className="size-3" />
            24시간 초과 {delayedCount}건
          </StatusPill>
        )}
      </FilterBar>

      <DataTable
        columns={inquiryColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 문의가 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="문의 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} / ${selected.writerMasked}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<Check className="size-4" />}
                onClick={() => setConfirmOpen(true)}
                disabled={answer.trim().length === 0}
              >
                답변 등록
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  <StatusMetaPill meta={categoryMeta[selected.category]} />
                  {isDelayed(selected) && (
                    <StatusPill variant="warning">
                      <Clock className="size-3" />
                      답변 지연
                    </StatusPill>
                  )}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '접수 경로', value: selected.channel },
                  { label: '접수 시각', value: selected.receivedAt },
                  { label: '경과', value: `${selected.elapsedHours}시간` },
                  { label: '문의 ID', value: selected.id },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="문의 내용">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.body}
              </p>
            </DetailField>

            <DetailField label={`이전 문의 / ${selected.previousInquiries.length}건`}>
              <HistoryList
                items={selected.previousInquiries}
                emptyLabel="이전 문의 이력이 없어요."
              />
            </DetailField>

            <DetailField label="답변 내용" visibility="visible-to-user">
              <Textarea
                value={answer}
                onChange={setAnswer}
                maxLength={1000}
                rows={5}
                placeholder="문의자에게 전달할 답변을 입력하세요."
              />
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
          title="답변을 등록할까요?"
          description="등록하면 문의자에게 알림이 가고 답변 내용이 문의 내역에 남아요."
          confirmLabel="답변 등록"
          onConfirm={() => submitAnswer(selected)}
        >
          <SummaryGrid
            items={[
              { label: '문의', value: selected.title },
              { label: '문의자', value: selected.writerMasked },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Ban,
  Check,
  CheckCircle,
  Clock,
  FileText,
  Image,
  MessageSquare,
  MessagesSquare,
  Search,
  User,
} from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminReports } from '@/features/reports'
import type { AdminReport, AdminReportStatus, AdminReportTargetType } from '@/features/reports'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
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

// admin 모듈에 신고 조회·제재 처리 API가 없다. 2026-10-26에는 안내 화면만 보여줬는데, 그러면
// 운영자가 신고 처리가 어떤 모양인지 알 수 없어 예시 데이터로 되돌렸다(SCRUM-308) — 상단 띠로
// 예시임을 밝히고 제재 결정은 서버로 내보내지 않는다.
export const Route = createFileRoute('/reports')({
  component: ReportsPage,
})

const targetTypeMeta: Record<AdminReportTargetType, StatusMeta> = {
  product: { label: '상품', variant: 'neutral', icon: Image },
  review: { label: '리뷰', variant: 'neutral', icon: MessageSquare },
  'sns-post': { label: 'SNS 게시물', variant: 'neutral', icon: FileText },
  chat: { label: '채팅', variant: 'neutral', icon: MessagesSquare },
  member: { label: '회원', variant: 'neutral', icon: User },
}

const statusMeta: Record<AdminReportStatus, StatusMeta> = {
  received: { label: '접수', variant: 'warning', icon: Clock },
  reviewing: { label: '확인 중', variant: 'info', icon: Search },
  sanctioned: { label: '제재 완료', variant: 'danger', icon: Ban },
  dismissed: { label: '제재 없음', variant: 'muted', icon: CheckCircle },
}

const statusFilterOptions = [
  { value: 'all', label: '처리 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const targetFilterOptions = [
  { value: 'all', label: '신고 대상 전체' },
  ...Object.entries(targetTypeMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

type ReportDecision = 'dismiss' | 'hide' | 'sanction'

const processReasonOptions = [
  { value: 'false-ad', label: '허위·과장 광고' },
  { value: 'abuse', label: '욕설·비방' },
  { value: 'external-trade', label: '외부 거래 유도' },
  { value: 'illegal', label: '불법·미취급 상품' },
  { value: 'false-report', label: '허위 신고 반복' },
  { value: 'not-confirmed', label: '신고 내용 확인 불가' },
]

const decisionModalMeta: Record<
  ReportDecision,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    nextStatus: AdminReportStatus
  }
> = {
  dismiss: {
    title: '제재 없이 종결할까요?',
    description: '신고자에게 처리 결과가 통보되고 대상은 그대로 노출돼요.',
    confirmLabel: '제재 없이 종결',
    confirmVariant: 'primary',
    nextStatus: 'dismissed',
  },
  hide: {
    title: '대상을 비공개로 전환할까요?',
    description: '대상이 즉시 비노출되고 작성자에게 사유가 통보돼요. 되돌릴 수 있어요.',
    confirmLabel: '비공개 전환',
    confirmVariant: 'primary',
    nextStatus: 'sanctioned',
  },
  sanction: {
    title: '계정 제재까지 적용할까요?',
    description:
      '대상이 비노출되고 작성자 계정에 이용 제한이 걸려요. 되돌리기 어려우니 신고 이력을 먼저 확인하세요.',
    confirmLabel: '계정 제재',
    confirmVariant: 'danger',
    nextStatus: 'sanctioned',
  },
}

function makeReportColumns(onOpenDetail: (row: AdminReport) => void): Column<AdminReport>[] {
  return [
    {
      key: 'targetName',
      label: '신고 대상',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)}>{row.targetName}</RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">{row.targetOwner}</p>
        </div>
      ),
    },
    {
      key: 'targetType',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={targetTypeMeta[row.targetType]} />,
    },
    { key: 'reason', label: '신고 사유' },
    {
      key: 'reportCount',
      label: '누적 신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}건</span>,
    },
    {
      key: 'receivedAt',
      label: '최근 접수',
      align: 'right',
      render: row => <span className="tabular-nums">{row.receivedAt}</span>,
    },
    {
      key: 'status',
      label: '처리 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
  ]
}

function ReportsPage() {
  const { data, isLoading } = useAdminReports()
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
  const [targetFilter, setTargetFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (targetFilter !== 'all' && row.targetType !== targetFilter) return false
        if (search && !row.targetName.includes(search) && !row.targetOwner.includes(search))
          return false
        return true
      }),
    [items, statusFilter, targetFilter, search],
  )

  const [decision, setDecision] = useState<ReportDecision>('dismiss')
  const [processReason, setProcessReason] = useState('')
  const [sanctionNotice, setSanctionNotice] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AdminReport) {
    select(row.id)
    setDecision(row.status === 'sanctioned' ? 'hide' : 'dismiss')
    setProcessReason(row.processReason ?? '')
    setSanctionNotice(row.sanctionNotice ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 결정 결과를 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function applyDecision(target: AdminReport, nextStatus: AdminReportStatus) {
    patchRow(target.id, { status: nextStatus, processReason, sanctionNotice, internalMemo })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const reportColumns = useMemo(() => makeReportColumns(openDrawer), [])
  const decisionMeta = decisionModalMeta[decision]
  const processReasonLabel =
    processReasonOptions.find(opt => opt.value === processReason)?.label ?? processReason

  return (
    <div className="p-6">
      <PageIntro title="신고 제재 관리" description="접수된 신고를 확인하고 제재를 처리해요." />

      <MockDataNotice>
        신고 접수는 열린 BE PR에 있고, 운영자용 조회·제재 경로가 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterSelect
          options={targetFilterOptions}
          value={targetFilter}
          onChange={setTargetFilter}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="대상 · 작성자 검색"
          className="w-64"
        />
      </FilterBar>

      <DataTable
        columns={reportColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 신고가 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="신고 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${selected.targetName}`}
            actions={
              <Button
                variant="primary"
                leftIcon={<Check className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                제출
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                  <StatusMetaPill meta={targetTypeMeta[selected.targetType]} />
                  <StatusPill variant="neutral">{selected.reason}</StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '작성자', value: selected.targetOwner },
                  { label: '누적 신고', value: `${selected.reportCount}건` },
                  { label: '최근 접수', value: selected.receivedAt },
                  { label: '신고 ID', value: selected.id },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="최근 신고 내용">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.detail}
              </p>
            </DetailField>

            <DetailField label={`신고 이력 · ${selected.reportHistory.length}건`}>
              <HistoryList items={selected.reportHistory} emptyLabel="신고 이력이 없어요." />
            </DetailField>

            <DetailField label="제재 결정">
              <DecisionRadioGroup
                name="report-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'dismiss', label: '제재 없음', caption: '신고 내용 확인 불가' },
                  { value: 'hide', label: '비공개 전환', caption: '대상만 비노출' },
                  { value: 'sanction', label: '계정 제재', caption: '비노출 + 이용 제한' },
                ]}
              />
            </DetailField>

            <DetailField label="처리 사유">
              <Select
                options={processReasonOptions}
                value={processReason}
                onChange={setProcessReason}
                placeholder="사유 선택"
              />
            </DetailField>

            <DetailField label="작성자 안내 문구" visibility="visible-to-user">
              <Textarea
                value={sanctionNotice}
                onChange={setSanctionNotice}
                maxLength={300}
                rows={3}
                placeholder="작성자에게 전달할 안내를 입력하세요."
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
          title={decisionMeta.title}
          description={decisionMeta.description}
          confirmLabel={decisionMeta.confirmLabel}
          confirmVariant={decisionMeta.confirmVariant}
          onConfirm={() => applyDecision(selected, decisionMeta.nextStatus)}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: selected.targetName },
              { label: '사유', value: processReasonLabel },
            ]}
          />
        </Modal>
      )}

      {toast && (
        <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />
      )}
    </div>
  )
}

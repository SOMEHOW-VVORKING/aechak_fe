import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Briefcase,
  Building2,
  Check,
  Clock,
  Contact,
  FileEdit,
  FileText,
  Loader,
  RotateCw,
  User,
  XCircle,
} from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { SellerApplication, SellerApplicationStatus } from '@aechak/domain'
import { useSellerApplications } from '@/features/seller-applications'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

export const Route = createFileRoute('/sellers/applications')({
  component: SellerApplicationsPage,
})

const statusMeta: Record<
  SellerApplicationStatus,
  { label: string; variant: 'neutral' | 'info' | 'success' | 'error' | 'warning'; icon: typeof Clock }
> = {
  pending: { label: '심사 대기', variant: 'neutral', icon: Clock },
  reviewing: { label: '심사 중', variant: 'info', icon: Loader },
  approved: { label: '승인', variant: 'success', icon: Check },
  rejected: { label: '반려', variant: 'error', icon: XCircle },
  'revision-requested': { label: '보완 요청', variant: 'warning', icon: FileEdit },
  resubmitted: { label: '재제출', variant: 'warning', icon: RotateCw },
}

const decisionModalMeta: Record<
  string,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    nextStatus: SellerApplicationStatus
    message: string
  }
> = {
  approve: {
    title: '입점을 승인할까요?',
    description: '승인 즉시 셀러 어드민이 활성화되고 신청자에게 통보돼요.',
    confirmLabel: '승인',
    confirmVariant: 'primary',
    nextStatus: 'approved',
    message: '입점을 승인했어요.',
  },
  reject: {
    title: '신청을 반려할까요?',
    description: '반려 사유가 신청자에게 통보돼요.',
    confirmLabel: '반려',
    confirmVariant: 'danger',
    nextStatus: 'rejected',
    message: '신청을 반려했어요.',
  },
  revision: {
    title: '보완을 요청할까요?',
    description: '보완 요청 내용이 신청자에게 전달돼요.',
    confirmLabel: '보완 요청',
    confirmVariant: 'primary',
    nextStatus: 'revision-requested',
    message: '보완을 요청했어요.',
  },
}

const documentIcon: Record<string, typeof FileText> = {
  'business-reg': FileText,
  'mail-order': FileText,
  bankbook: Building2,
  'id-card': Contact,
}

const statusFilterOptions = [
  { value: 'all', label: '전체 상태' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const typeFilterOptions = [
  { value: 'all', label: '판매자 유형' },
  { value: 'business', label: '사업자' },
  { value: 'individual', label: '개인' },
]

function makeApplicationColumns(onOpenDetail: (row: SellerApplication) => void): Column<SellerApplication>[] { return [
  {
    key: 'applicantName',
    label: '신청자',
    render: row => (
      <button
        type="button"
        onClick={() => onOpenDetail(row)}
        className="font-medium text-text-primary hover:text-brand hover:underline"
      >
        {row.applicantName}
      </button>
    ),
  },
  {
    key: 'sellerType',
    label: '판매자 유형',
    align: 'center',
    render: row =>
      row.sellerType === 'business' ? (
        <StatusPill variant="neutral">
          <Briefcase className="size-3" />
          사업자
        </StatusPill>
      ) : (
        <StatusPill variant="info">
          <User className="size-3" />
          개인
        </StatusPill>
      ),
  },
  {
    key: 'businessNumberMasked',
    label: '사업자번호',
    render: row => (
      <span className="tabular-nums">
        {row.businessNumberMasked ? `보유 · ${row.businessNumberMasked}` : '미보유'}
      </span>
    ),
  },
  {
    key: 'status',
    label: '심사 상태',
    align: 'center',
    render: row => {
      const meta = statusMeta[row.status]
      const Icon = meta.icon
      return (
        <StatusPill variant={meta.variant}>
          <Icon className="size-3" />
          {meta.label}
        </StatusPill>
      )
    },
  },
  {
    key: 'appliedAt',
    label: '신청일',
    align: 'right',
    render: row => <span className="tabular-nums">{row.appliedAt}</span>,
  },
] }

function SellerApplicationsPage() {
  const { data, isLoading } = useSellerApplications()
  const [rows, setRows] = useState<SellerApplication[] | null>(null)
  useEffect(() => {
    if (data && rows === null) setRows(data)
  }, [data, rows])
  const items = rows ?? []

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (typeFilter !== 'all' && row.sellerType !== typeFilter) return false
        if (search && !row.applicantName.includes(search) && !row.businessNumberMasked?.includes(search))
          return false
        return true
      }),
    [items, statusFilter, typeFilter, search],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = items.find(row => row.id === selectedId) ?? null
  const SelectedStatusIcon = selected ? statusMeta[selected.status].icon : null

  const [decision, setDecision] = useState('approve')
  const [rejectionReason, setRejectionReason] = useState('')
  const [revisionNote, setRevisionNote] = useState('')
  const [internalMemo, setInternalMemo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'info' } | null>(null)

  function openDrawer(row: SellerApplication) {
    setSelectedId(row.id)
    setDecision(
      row.status === 'rejected' ? 'reject' : row.status === 'revision-requested' ? 'revision' : 'approve',
    )
    setRejectionReason(row.rejectionReason ?? '')
    setRevisionNote(row.revisionNote ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function closeDrawer() {
    setSelectedId(null)
    setConfirmOpen(false)
  }

  function applyDecision(nextStatus: SellerApplicationStatus, message: string) {
    if (!selected) return
    setRows(prev =>
      (prev ?? []).map(row =>
        row.id === selected.id
          ? {
              ...row,
              status: nextStatus,
              rejectionReason: nextStatus === 'rejected' ? rejectionReason : row.rejectionReason,
              revisionNote: nextStatus === 'revision-requested' ? revisionNote : row.revisionNote,
              internalMemo,
            }
          : row,
      ),
    )
    setToast({ message, variant: 'success' })
    closeDrawer()
  }

  const pendingCount = useMemo(
    () => items.filter(row => row.status === 'pending' || row.status === 'reviewing').length,
    [items],
  )
  const applicationColumns = useMemo(() => makeApplicationColumns(openDrawer), [])

  return (
    <div className="p-6">
      <PageHeader title="셀러 입점 심사" />
      <p className="-mt-4 mb-5 text-body-sm text-text-tertiary">
        입점 신청을 확인하고 승인 · 반려 · 보완 요청을 처리합니다.
      </p>

      <div className="mb-3.5 flex items-center justify-between gap-4">
        <FilterBar>
          <div className="w-40">
            <Select options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div className="w-36">
            <Select options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} />
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="상호 · 사업자번호 검색"
            className="w-64"
          />
        </FilterBar>
        <span className="flex-none text-body-sm text-text-tertiary">
          심사 대기 <span className="font-semibold tabular-nums text-text-primary">{pendingCount}</span>
        </span>
      </div>

      <DataTable
        columns={applicationColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 입점 신청이 없습니다."
      />

      <Drawer
        open={selected !== null}
        onClose={closeDrawer}
        title="입점 신청 상세"
        width="lg"
      >
        {selected && (
          <div className="space-y-5">
            <p className="-mt-2 text-body-sm text-text-tertiary">
              {selected.applicantName} · {selected.sellerType === 'business' ? '사업자 셀러' : '개인 셀러'}
            </p>

            <DrawerSummaryCard
              pills={
                <>
                  <StatusPill variant={selected.sellerType === 'business' ? 'neutral' : 'info'}>
                    {selected.sellerType === 'business' ? (
                      <Briefcase className="size-3" />
                    ) : (
                      <User className="size-3" />
                    )}
                    {selected.sellerType === 'business' ? '사업자 셀러' : '개인 셀러'}
                  </StatusPill>
                  <StatusPill variant={statusMeta[selected.status].variant}>
                    {SelectedStatusIcon && <SelectedStatusIcon className="size-3" />}
                    {statusMeta[selected.status].label}
                  </StatusPill>
                  {!!selected.resubmissionCount && (
                    <StatusPill variant="warning">
                      <RotateCw className="size-3" />
                      재제출 {selected.resubmissionCount}회
                    </StatusPill>
                  )}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '대표자', value: selected.representativeNameMasked },
                  { label: '사업자번호', value: selected.businessNumberMasked ?? '미보유' },
                  { label: '연락처', value: selected.phoneMasked },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="제출 서류">
              <div className="flex flex-wrap gap-2">
                {selected.documents.map(doc => {
                  const Icon = documentIcon[doc.key] ?? FileText
                  return (
                    <div
                      key={doc.key}
                      className="flex size-[62px] flex-col items-center justify-center gap-1 rounded-md border border-border-subtle bg-surface-sunken"
                    >
                      <Icon className="size-4 text-icon-muted" />
                      <span className="text-caption text-text-tertiary">{doc.label}</span>
                    </div>
                  )
                })}
              </div>
            </DetailField>

            <DetailField label="심사 결과">
              <DecisionRadioGroup
                name="application-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'approve', label: '승인', caption: '입점 승인 후 셀러 어드민 활성화' },
                  { value: 'reject', label: '반려', caption: '신청 반려 · 사유 통보' },
                  { value: 'revision', label: '보완 요청', caption: '서류 보완 후 재제출 요청' },
                ]}
              />
            </DetailField>

            {decision === 'reject' && (
              <DetailField label="반려 사유">
                <Select
                  options={[
                    { value: 'doc-mismatch', label: '통신판매업 신고증 불일치' },
                    { value: 'invalid-business', label: '사업자 정보 확인 불가' },
                    { value: 'incomplete-docs', label: '서류 누락' },
                  ]}
                  value={rejectionReason}
                  onChange={setRejectionReason}
                  placeholder="사유 선택"
                />
              </DetailField>
            )}

            {decision === 'revision' && (
              <DetailField label="보완 요청 내용" visibility="visible-to-user">
                <Textarea
                  value={revisionNote}
                  onChange={setRevisionNote}
                  maxLength={300}
                  rows={3}
                  placeholder="보완이 필요한 내용을 입력하세요."
                />
              </DetailField>
            )}

            <DetailField label="내부 메모" visibility="internal-only">
              <Textarea
                value={internalMemo}
                onChange={setInternalMemo}
                maxLength={300}
                rows={3}
                placeholder="내부 공유용 메모를 입력하세요."
              />
            </DetailField>

            <div className="flex gap-2 border-t border-border-subtle pt-4">
              <Button
                variant="primary"
                leftIcon={<Check className="size-4" />}
                onClick={() => setConfirmOpen(true)}
              >
                제출
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={decisionModalMeta[decision]!.title}
        description={decisionModalMeta[decision]!.description}
        confirmLabel={decisionModalMeta[decision]!.confirmLabel}
        confirmVariant={decisionModalMeta[decision]!.confirmVariant}
        onConfirm={() => {
          const meta = decisionModalMeta[decision]!
          applyDecision(meta.nextStatus, meta.message)
        }}
      />

      {toast && (
        <Toast
          open
          onClose={() => setToast(null)}
          message={toast.message}
          variant={toast.variant}
        />
      )}
    </div>
  )
}

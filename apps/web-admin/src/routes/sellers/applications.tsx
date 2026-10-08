import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Building2, Check, Clock, Contact, FileEdit, FileText, Loader, XCircle } from 'lucide-react'
import {
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Select,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { SellerApplication, SellerApplicationStatus, SellerDocumentKey } from '@aechak/domain'
import { useSellerApplications } from '@/features/seller-applications'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MediaPlaceholder } from '@/shared/components/MediaPlaceholder'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { SellerTypePill, sellerTypeLabel } from '@/shared/components/SellerTypePill'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

export const Route = createFileRoute('/sellers/applications')({
  component: SellerApplicationsPage,
})

// BE ApplicationStatus 1:1. draft/cancelled는 어드민 목록에 실릴 일이 없는 값이지만(작성 중은
// 셀러 로컬 단계, cancelled는 할당 경로 없음) Record라 전 키를 채운다 — 필터 옵션에도 그대로 파생.
const statusMeta: Record<SellerApplicationStatus, StatusMeta> = {
  draft: { label: '작성 중', variant: 'muted', icon: FileEdit },
  submitted: { label: '심사 대기', variant: 'neutral', icon: Clock },
  reviewing: { label: '심사 중', variant: 'info', icon: Loader },
  approved: { label: '승인', variant: 'success', icon: Check },
  rejected: { label: '반려', variant: 'error', icon: XCircle },
  cancelled: { label: '신청 취소', variant: 'muted', icon: Ban },
}

type ApplicationDecision = 'approve' | 'reject'

const decisionModalMeta: Record<
  ApplicationDecision,
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
    description: '반려 사유가 신청자에게 통보돼요. 신청자는 보완 후 다시 제출할 수 있어요.',
    confirmLabel: '반려',
    confirmVariant: 'danger',
    nextStatus: 'rejected',
    message: '신청을 반려했어요.',
  },
}

const documentIcon: Partial<Record<SellerDocumentKey, typeof FileText>> = {
  BUSINESS_REGISTRATION: FileText,
  TELESALES_REPORT: FileText,
  BANKBOOK_COPY: Building2,
  ID_CARD: Contact,
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

function makeApplicationColumns(onOpenDetail: (row: SellerApplication) => void): Column<SellerApplication>[] {
  return [
    {
      key: 'applicantName',
      label: '신청자',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.applicantName}</RowLinkButton>,
    },
    {
      key: 'sellerType',
      label: '판매자 유형',
      align: 'center',
      render: row => <SellerTypePill sellerType={row.sellerType} />,
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
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
    {
      key: 'appliedAt',
      label: '신청일',
      align: 'right',
      render: row => <span className="tabular-nums">{row.appliedAt}</span>,
    },
  ]
}

function SellerApplicationsPage() {
  const { data, isLoading } = useSellerApplications()
  const { items, patchRow, selected, select, closeDrawer, confirmOpen, setConfirmOpen, toast, setToast } =
    useDetailList(data)

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (typeFilter !== 'all' && row.sellerType !== typeFilter) return false
        if (
          search &&
          !(row.applicantName ?? '').includes(search) &&
          !row.businessNumberMasked?.includes(search)
        )
          return false
        return true
      }),
    [items, statusFilter, typeFilter, search],
  )

  const [decision, setDecision] = useState<ApplicationDecision>('approve')
  const [rejectionReason, setRejectionReason] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: SellerApplication) {
    select(row.id)
    setDecision(row.status === 'rejected' ? 'reject' : 'approve')
    setRejectionReason(row.rejectionReason ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  function applyDecision(target: SellerApplication, nextStatus: SellerApplicationStatus, message: string) {
    patchRow(target.id, {
      status: nextStatus,
      // BE 계약: rejectionReason은 REJECTED일 때만 값이 있다(승인 시 null로 비워짐).
      rejectionReason: nextStatus === 'rejected' ? rejectionReason : undefined,
      internalMemo,
    })
    setToast(message)
    closeDrawer()
  }

  const pendingCount = useMemo(
    () => items.filter(row => row.status === 'submitted' || row.status === 'reviewing').length,
    [items],
  )
  const applicationColumns = useMemo(() => makeApplicationColumns(openDrawer), [])
  const decisionMeta = decisionModalMeta[decision]

  return (
    <div className="p-6">
      <PageIntro title="셀러 입점 심사" description="입점 신청을 확인하고 승인 · 반려를 처리합니다." />

      <div className="mb-3.5 flex items-center justify-between gap-4">
        <FilterBar>
          <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
          <FilterSelect narrow options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} />
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

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="입점 신청 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.applicantName} · ${sellerTypeLabel(selected.sellerType)}`}
            actions={
              <Button variant="primary" leftIcon={<Check className="size-4" />} onClick={() => setConfirmOpen(true)}>
                제출
              </Button>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <SellerTypePill sellerType={selected.sellerType} long />
                  <StatusMetaPill meta={statusMeta[selected.status]} />
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '대표자', value: selected.representativeNameMasked ?? '—' },
                  { label: '사업자번호', value: selected.businessNumberMasked ?? '미보유' },
                  { label: '연락처', value: selected.phoneMasked ?? '—' },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="제출 서류">
              <div className="flex flex-wrap gap-2">
                {selected.documents.map(doc => {
                  const Icon = documentIcon[doc.key] ?? FileText
                  return (
                    <MediaPlaceholder
                      key={doc.key}
                      className="size-[62px] flex-col gap-1 border border-border-subtle"
                    >
                      <Icon className="size-4" />
                      <span className="text-caption text-text-tertiary">{doc.label}</span>
                    </MediaPlaceholder>
                  )
                })}
              </div>
            </DetailField>

            {/* BE 심사 결정은 승인/반려 2종이다 — 보완 요청은 별도 상태가 아니라 반려(사유 통보)
                후 신청자가 재제출하는 플로우로 흡수됐다(ApplicationStatus 1:1 정리). */}
            <DetailField label="심사 결과">
              <DecisionRadioGroup
                name="application-decision"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'approve', label: '승인', caption: '입점 승인 후 셀러 어드민 활성화' },
                  { value: 'reject', label: '반려', caption: '신청 반려 · 사유 통보 후 재제출 유도' },
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
          onConfirm={() => applyDecision(selected, decisionMeta.nextStatus, decisionMeta.message)}
        />
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

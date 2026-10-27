import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Ban,
  Check,
  CheckCircle,
  Clock,
  RefreshCcw,
  RotateCcw,
  Scale,
  XCircle,
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
import { useAdminClaims } from '@/features/claims'
import type {
  AdminClaim,
  AdminClaimParty,
  AdminClaimShippingBearer,
  AdminClaimStatus,
  AdminClaimType,
} from '@/features/claims'
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

// 운영자가 끼어들어 중재하는 admin 경로가 없다(셀러·구매자 본인 스코프 경로만 있다). 안내 화면으로
// 돌려보내는 대신 예시 데이터로 모양을 보여주고 상단 띠로 밝힌다(SCRUM-308).
export const Route = createFileRoute('/claims')({
  component: ClaimsPage,
})

const claimTypeMeta: Record<AdminClaimType, StatusMeta> = {
  cancel: { label: '취소', variant: 'neutral', icon: XCircle },
  return: { label: '반품', variant: 'neutral', icon: RotateCcw },
  exchange: { label: '교환', variant: 'neutral', icon: RefreshCcw },
}

const statusMeta: Record<AdminClaimStatus, StatusMeta> = {
  requested: { label: '요청 접수', variant: 'warning', icon: Clock },
  'seller-rejected': { label: '셀러 거부', variant: 'error', icon: Ban },
  arbitrating: { label: '운영 중재', variant: 'info', icon: Scale },
  approved: { label: '승인', variant: 'success', icon: CheckCircle },
  rejected: { label: '불가', variant: 'muted', icon: XCircle },
}

const partyLabel: Record<AdminClaimParty, string> = {
  buyer: '구매자 귀책',
  seller: '셀러 귀책',
  undecided: '판정 전',
}

const statusFilterOptions = [
  { value: 'all', label: '처리 상태 전체' },
  ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

const typeFilterOptions = [
  { value: 'all', label: '클레임 유형 전체' },
  ...Object.entries(claimTypeMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

// 값이 타입에서 벗어나면(철자 오류·옵션 추가) 여기서 바로 걸린다 — Select의 value는 string이라
// 느슨하게 두면 patchRow에 저장되지 않는 값이 들어간다.
const shippingBearerOptions: { value: AdminClaimShippingBearer; label: string }[] = [
  { value: 'buyer', label: '구매자 부담' },
  { value: 'seller', label: '셀러 부담' },
  { value: 'platform', label: '플랫폼 부담' },
]

/**
 * DS `Select`의 `onChange`는 `(value: string) => void`라 상태 타입으로 바로 꽂을 수 없다.
 * `as`로 눌러 두면 옵션 목록과 타입이 어긋났을 때 조용히 저장되지 않는 값이 들어가므로,
 * **옵션 목록을 근거로** 좁힌다.
 */
const isShippingBearer = (value: string): value is AdminClaimShippingBearer =>
  shippingBearerOptions.some(option => option.value === value)

const decisionModalMeta: Record<
  AdminClaimParty,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    nextStatus: AdminClaimStatus
  }
> = {
  seller: {
    title: '셀러 귀책으로 승인할까요?',
    description: '환불이 진행되고 왕복 배송비가 셀러에게 청구돼요. 셀러에게 판정 사유가 통보돼요.',
    confirmLabel: '셀러 귀책 승인',
    confirmVariant: 'primary',
    nextStatus: 'approved',
  },
  buyer: {
    title: '구매자 귀책으로 처리할까요?',
    description: '반송비가 구매자에게 청구되고 환불 금액에서 차감돼요.',
    confirmLabel: '구매자 귀책 처리',
    confirmVariant: 'primary',
    nextStatus: 'approved',
  },
  undecided: {
    title: '클레임을 불가로 종결할까요?',
    description: '환불 없이 종결되고 구매자에게 사유가 통보돼요. 되돌리기 어려워요.',
    confirmLabel: '불가 종결',
    confirmVariant: 'danger',
    nextStatus: 'rejected',
  },
}

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`

function makeClaimColumns(onOpenDetail: (row: AdminClaim) => void): Column<AdminClaim>[] {
  return [
    {
      key: 'id',
      label: '클레임',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
            {row.id}
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">{row.orderId}</p>
        </div>
      ),
    },
    {
      key: 'claimType',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={claimTypeMeta[row.claimType]} />,
    },
    {
      key: 'productName',
      label: '상품',
      render: row => (
        <div className="min-w-0">
          <p className="truncate text-body-sm text-text-primary">{row.productName}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.sellerName} / {row.buyerMasked}
          </p>
        </div>
      ),
    },
    { key: 'reason', label: '사유' },
    {
      key: 'refundAmount',
      label: '환불 예정',
      align: 'right',
      render: row => <span className="tabular-nums">{won(row.refundAmount)}</span>,
    },
    {
      key: 'status',
      label: '처리 상태',
      render: row => (
        <div className="min-w-0">
          <StatusMetaPill meta={statusMeta[row.status]} />
          <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">
            {partyLabel[row.responsibleParty]}
          </p>
        </div>
      ),
    },
  ]
}

function ClaimsPage() {
  const { data, isLoading } = useAdminClaims()
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
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (typeFilter !== 'all' && row.claimType !== typeFilter) return false
        if (
          search &&
          !row.id.includes(search) &&
          !row.orderId.includes(search) &&
          !row.productName.includes(search)
        )
          return false
        return true
      }),
    [items, statusFilter, typeFilter, search],
  )

  const [decision, setDecision] = useState<AdminClaimParty>('undecided')
  const [shippingBearer, setShippingBearer] = useState<AdminClaimShippingBearer | ''>('')
  const [arbitrationNote, setArbitrationNote] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  function openDrawer(row: AdminClaim) {
    select(row.id)
    setDecision(row.responsibleParty)
    // 귀책에서 계산하지 않는다 — 플랫폼 부담은 귀책으로 표현할 수 없다(claims.mock.ts).
    setShippingBearer(row.shippingBearer ?? '')
    setArbitrationNote(row.arbitrationNote ?? '')
    setInternalMemo(row.internalMemo ?? '')
  }

  // 서버로 나가는 요청이 없다 — 중재 결과를 화면에만 겹쳐 보여준다(useDetailList의 edits).
  function applyDecision(target: AdminClaim, nextStatus: AdminClaimStatus) {
    patchRow(target.id, {
      status: nextStatus,
      responsibleParty: decision,
      // 배송비 부담을 빼면 운영자가 고른 값이 조용히 버려진다 — 드로어를 다시 열면 사라지고,
      // 확인 Modal은 그 값을 보여주고 있어 "정한 대로 들어갔다"고 읽힌다(동작 안 하는 입력).
      shippingBearer: shippingBearer === '' ? undefined : shippingBearer,
      arbitrationNote,
      internalMemo,
    })
    setToast(MOCK_WRITE_TOAST)
    closeDrawer()
  }

  const claimColumns = useMemo(() => makeClaimColumns(openDrawer), [])
  const decisionMeta = decisionModalMeta[decision]
  const shippingBearerLabel =
    shippingBearerOptions.find(opt => opt.value === shippingBearer)?.label ?? '미지정'

  return (
    <div className="p-6">
      <PageIntro
        title="취소/반품/교환"
        description="셀러와 구매자 사이의 클레임을 확인하고 중재해요."
      />

      <MockDataNotice>
        운영 중재 경로가 admin 모듈에 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={statusFilterOptions} value={statusFilter} onChange={setStatusFilter} />
        <FilterSelect options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="클레임 · 주문번호 · 상품 검색"
          className="w-72"
        />
      </FilterBar>

      <DataTable
        columns={claimColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 클레임이 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="클레임 상세" width="lg">
        {selected && (
          <DetailDrawerBody
            subtitle={`${selected.id} · ${selected.orderId}`}
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
                  <StatusMetaPill meta={claimTypeMeta[selected.claimType]} />
                  <StatusPill variant="neutral">{selected.reason}</StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '상품', value: selected.productName },
                  { label: '요청 시각', value: selected.requestedAt },
                  { label: '환불 예정', value: won(selected.refundAmount) },
                  { label: '배송비', value: won(selected.shippingFee) },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="구매자 주장">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.buyerClaim}
              </p>
            </DetailField>

            <DetailField label="셀러 답변">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.sellerReply}
              </p>
            </DetailField>

            <DetailField label={`처리 이력 · ${selected.history.length}건`}>
              <HistoryList items={selected.history} emptyLabel="처리 이력이 없어요." />
            </DetailField>

            <DetailField label="귀책 판정">
              <DecisionRadioGroup
                name="claim-party"
                value={decision}
                onChange={setDecision}
                options={[
                  { value: 'seller', label: '셀러 귀책', caption: '왕복 배송비 셀러 부담' },
                  { value: 'buyer', label: '구매자 귀책', caption: '반송비 구매자 부담' },
                  { value: 'undecided', label: '클레임 불가', caption: '환불 없이 종결' },
                ]}
              />
            </DetailField>

            <DetailField label="배송비 부담 주체">
              <Select
                options={shippingBearerOptions}
                value={shippingBearer}
                onChange={value => setShippingBearer(isShippingBearer(value) ? value : '')}
                placeholder="부담 주체 선택"
              />
            </DetailField>

            <DetailField label="판정 사유" visibility="visible-to-user">
              <Textarea
                value={arbitrationNote}
                onChange={setArbitrationNote}
                maxLength={500}
                rows={3}
                placeholder="양쪽에 전달할 판정 사유를 입력하세요."
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
              { label: '클레임', value: selected.id },
              { label: '배송비 부담', value: shippingBearerLabel },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="warning" />}
    </div>
  )
}

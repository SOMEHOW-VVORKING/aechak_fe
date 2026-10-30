import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, RefreshCcw, RotateCcw, XCircle } from 'lucide-react'
import {
  Alert,
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
import {
  CLAIM_HISTORY_EVENT_LABEL,
  CLAIM_STATUS_LABEL,
  CLAIM_TYPE_LABEL,
  CLAIM_TYPE_VARIANT,
  FAULT_DECISION_LABEL,
  INTERVENTION_MEMO_MAX,
  INTERVENTION_REASON_DETAIL_MAX,
  ORDER_ITEM_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  REFUND_STATUS_LABEL,
  RETURN_COST_BEARER_LABEL,
  SELLER_APPROVAL_LABEL,
  canChooseCostBearer,
  claimDisplayStatus,
  claimReasonText,
  detailErrorMessage,
  formatClaimDateTime,
  interveneErrorMessage,
  listErrorMessage,
  productSummary,
  reasonCatalogErrorMessage,
  useAdminClaimDetail,
  useAdminClaims,
  useInterveneClaim,
  useInterventionReasons,
  won,
  type AdminClaimDetailData,
  type AdminClaimFaultDecision,
  type AdminClaimFaultDecisionReasons,
  type AdminClaimInterventionReason,
  type AdminClaimSummary,
  type ClaimStatus,
  type ClaimType,
  type ReturnCostBearer,
} from '@/features/claims'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

// `/admin/claims` 넷(목록·사유 카탈로그·상세·개입)이 dev에 올라와 실연동이다
// (SCRUM-320 / SCRUM-331). 셀러·구매자 본인 스코프 경로(`/sellers/me/claims`·`/orders/.../claims`)는
// 여기서 부르지 않는다 — 운영자는 전 셀러의 분쟁을 본다.
export const Route = createFileRoute('/claims')({
  component: ClaimsPage,
})

const statusFilterOptions = [
  { value: 'all', label: '처리 상태 전체' },
  ...(Object.keys(CLAIM_STATUS_LABEL) as ClaimStatus[]).map(value => ({
    value,
    label: CLAIM_STATUS_LABEL[value],
  })),
]

const typeFilterOptions = [
  { value: 'all', label: '클레임 유형 전체' },
  ...(Object.keys(CLAIM_TYPE_LABEL) as ClaimType[]).map(value => ({
    value,
    label: CLAIM_TYPE_LABEL[value],
  })),
]

/**
 * 작업 범위. 서버는 `openOnly`를 주지 않으면 **상태 필터가 빈 요청에서만** 개입 가능한 건으로
 * 좁히므로, 그 암묵 동작을 운영자가 보고 바꿀 수 있게 축을 화면에 꺼내 둔다(기본은 작업 목록).
 */
const scopeFilterOptions = [
  { value: 'open', label: '개입 가능한 건' },
  { value: 'all', label: '종결까지 전체' },
]

/** 서버 검색축이 셋이고 각각 매칭 방식이 다르다 — 한 입력으로 합치면 어느 방식인지 말할 수 없다. */
const searchFieldOptions = [
  { value: 'orderPublicId', label: '주문번호' },
  { value: 'sellerKeyword', label: '셀러명' },
  { value: 'buyerKeyword', label: '구매자' },
]

/** 검색축. 주문번호는 완전일치이고 셀러·구매자는 부분일치라 축마다 안내 문구가 다르다. */
type SearchField = 'orderPublicId' | 'sellerKeyword' | 'buyerKeyword'

const searchPlaceholder: Record<SearchField, string> = {
  orderPublicId: '주문번호 전체를 입력',
  sellerKeyword: '셀러명 일부',
  buyerKeyword: '구매자 닉네임 일부',
}

const isSearchField = (value: string): value is SearchField =>
  searchFieldOptions.some(option => option.value === value)

const claimTypeMetaIcon = { CANCEL: XCircle, RETURN: RotateCcw, EXCHANGE: RefreshCcw } as const

const decisionModalMeta: Record<
  AdminClaimFaultDecision,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  SELLER_FAULT: {
    title: '셀러 귀책으로 종결할까요?',
    description:
      '셀러 처리를 덮고 분쟁을 종결해요. 환불 집행과 결제 취소는 이 처리가 하지 않아요. 개입은 한 건에 한 번만 할 수 있어요.',
    confirmLabel: '셀러 귀책 종결',
    confirmVariant: 'primary',
  },
  BUYER_FAULT: {
    title: '구매자 귀책으로 종결할까요?',
    description:
      '셀러 처리를 덮고 분쟁을 종결해요. 환불 집행과 결제 취소는 이 처리가 하지 않아요. 개입은 한 건에 한 번만 할 수 있어요.',
    confirmLabel: '구매자 귀책 종결',
    confirmVariant: 'primary',
  },
  CLAIM_DISMISSED: {
    title: '클레임을 불가로 종결할까요?',
    description:
      '요청이 성립하지 않는다고 판정해 분쟁을 종결해요. 반품비 부담 주체는 남지 않고, 되돌릴 수 없어요.',
    confirmLabel: '불가 종결',
    confirmVariant: 'danger',
  },
}

const costBearerOptions = (Object.keys(RETURN_COST_BEARER_LABEL) as ReturnCostBearer[]).map(
  value => ({ value, label: RETURN_COST_BEARER_LABEL[value] }),
)

const isCostBearer = (value: string): value is ReturnCostBearer =>
  costBearerOptions.some(option => option.value === value)

function makeClaimColumns(
  onOpenDetail: (row: AdminClaimSummary) => void,
): Column<AdminClaimSummary>[] {
  return [
    {
      key: 'claimPublicId',
      label: '클레임',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
            <span className="line-clamp-1">{row.claimPublicId}</span>
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary tabular-nums">{row.orderPublicId}</p>
        </div>
      ),
    },
    {
      key: 'claimType',
      label: '유형',
      align: 'center',
      render: row => (
        <StatusMetaPill
          meta={{
            label: CLAIM_TYPE_LABEL[row.claimType],
            variant: CLAIM_TYPE_VARIANT[row.claimType],
            icon: claimTypeMetaIcon[row.claimType],
          }}
        />
      ),
    },
    {
      key: 'productNames',
      label: '상품',
      render: row => (
        <div className="min-w-0">
          <p className="truncate text-body-sm text-text-primary">
            {productSummary(row.productNames)}
          </p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.sellerName ?? '셀러 미기재'} / {row.buyerNickname ?? '구매자 미기재'}
          </p>
        </div>
      ),
    },
    { key: 'reason', label: '사유', render: row => claimReasonText(row) },
    {
      key: 'refundAmount',
      label: '환불 예정',
      align: 'right',
      render: row => <span className="tabular-nums">{won(row.refundAmount)}</span>,
    },
    {
      key: 'disputeElapsedDays',
      label: '경과',
      align: 'right',
      render: row => (
        <span className="tabular-nums">
          {row.disputeElapsedDays == null ? '-' : `${row.disputeElapsedDays}일`}
        </span>
      ),
    },
    {
      key: 'status',
      label: '처리 상태',
      // pill 아래 보조 문구가 붙는 컬럼은 center 금지(pill과 좌측이 어긋난다).
      render: row => {
        const display = claimDisplayStatus(row)
        return (
          <div className="min-w-0">
            <StatusPill variant={display.variant}>{display.label}</StatusPill>
            {display.note && (
              <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">{display.note}</p>
            )}
          </div>
        )
      },
    },
  ]
}

function ClaimsPage() {
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('open')
  const [searchField, setSearchField] = useState<SearchField>('orderPublicId')
  const [search, setSearch] = useState('')

  const list = useAdminClaims({
    ...(statusFilter === 'all' ? {} : { status: [statusFilter as ClaimStatus] }),
    ...(typeFilter === 'all' ? {} : { claimType: [typeFilter as ClaimType] }),
    // false도 보낸다 — 빼면 서버가 상태 필터 유무로 범위를 정해 "전체"가 작업 목록으로 좁혀진다.
    openOnly: scopeFilter === 'open',
    // 축 셋을 한 번에 조립한다 — 계산된 키로 넣으면 타입이 넓어져 오타가 조용히 통과한다.
    orderPublicId: searchField === 'orderPublicId' ? search : '',
    sellerKeyword: searchField === 'sellerKeyword' ? search : '',
    buyerKeyword: searchField === 'buyerKeyword' ? search : '',
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detail = useAdminClaimDetail(selectedId)
  const catalog = useInterventionReasons()
  const intervene = useInterveneClaim()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [decision, setDecision] = useState<AdminClaimFaultDecision>('SELLER_FAULT')
  const [reason, setReason] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [costBearer, setCostBearer] = useState('')
  const [internalMemo, setInternalMemo] = useState('')

  const claim = detail.detail?.claim ?? null
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 고른 판정이 되돌아간다.
  useEffect(() => {
    if (!claim) return
    setDecision(claim.faultDecision ?? 'SELLER_FAULT')
    setReason('')
    setReasonDetail('')
    setCostBearer('')
    setInternalMemo('')
  }, [claim?.claimPublicId])

  const decisionEntry: AdminClaimFaultDecisionReasons | undefined = catalog.byDecision[decision]
  const reasonOptions = (decisionEntry?.reasons ?? []).map(option => ({
    value: option.code,
    label: option.label,
  }))
  const selectedReason = decisionEntry?.reasons.find(option => option.code === reason)
  const needsDetail = selectedReason?.detailRequired === true
  const showCostBearer =
    claim != null &&
    decisionEntry != null &&
    canChooseCostBearer(claim.claimType, decisionEntry.claimAccepted)

  // 목록·상세·카탈로그 조회가 실패한 동안에는 처리를 잠근다(AGENTS 6-7). **상세와 카탈로그도
  // 함께 봐야 한다** — react-query는 재조회가 실패해도 캐시된 값을 돌려주므로, 둘 중 하나만
  // 403이 된 화면에서 낡은 판정 근거로 되돌릴 수 없는 종결을 지시하게 된다.
  const canSubmit =
    claim != null &&
    claim.interventionAllowed &&
    !intervene.isPending &&
    !list.isError &&
    !detail.isError &&
    !catalog.isError &&
    selectedReason != null &&
    (!needsDetail || reasonDetail.trim() !== '')

  function resetSelection() {
    setSelectedId(null)
    setConfirmOpen(false)
  }

  /**
   * 요청이 떠 있는 동안에는 **드로어도 확인 Modal도 닫지 않는다.**
   *
   * DS `Drawer`와 `Modal`은 ESC·스크림·취소를 모두 `onClose` 하나로 보낸다. 확인 버튼만
   * `loading`으로 잠그면 ESC 한 번에 드로어가 닫히고 그 과정에서 확인 Modal까지 함께 사라져,
   * 되돌릴 수 없는 처리가 날아가는 중에 화면이 비어 버린다 — 운영자는 그 처리가 들어갔는지 알 수
   * 없다. 그래서 닫기 제스처 전부를 이 가드로 모은다(성공·실패 뒤의 닫기는 아래 reset이 한다).
   */
  function closeDrawer() {
    if (intervene.isPending) return
    resetSelection()
  }

  function closeConfirm() {
    if (intervene.isPending) return
    setConfirmOpen(false)
  }

  function submit() {
    // 같은 버튼을 두 번 눌러도 요청은 한 번만 나간다.
    if (!claim || !selectedReason || intervene.isPending || !canSubmit) return
    intervene.mutate(
      {
        claimPublicId: claim.claimPublicId,
        faultDecision: decision,
        reason: selectedReason.code as AdminClaimInterventionReason,
        // 화면이 숨긴 값은 요청에도 없어야 한다 — 상세가 필요 없는 사유로 바꾸면 입력란이
        // 사라지는데, 거기 남아 있던 문장을 그대로 보내면 운영자가 보지 못한 설명이 개입
        // 기록에 박힌다(계약상 일반 사유에도 상세를 실을 수 있어 서버가 막아 주지 않는다).
        reasonDetail: needsDetail ? reasonDetail : '',
        returnCostBearer: showCostBearer && isCostBearer(costBearer) ? costBearer : null,
        internalMemo,
      },
      {
        onSuccess: () => {
          setToast(`${decisionModalMeta[decision].confirmLabel} 처리했어요. 환불은 따로 집행돼요.`)
          resetSelection()
        },
        onError: error => {
          setToast(interveneErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro
        title="취소/반품/교환"
        description="셀러와 구매자 사이의 클레임을 확인하고 귀책을 판정해요."
      />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "클레임 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect options={scopeFilterOptions} value={scopeFilter} onChange={setScopeFilter} />
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterSelect options={typeFilterOptions} value={typeFilter} onChange={setTypeFilter} />
        <FilterSelect
          options={searchFieldOptions}
          value={searchField}
          onChange={value => {
            if (!isSearchField(value)) return
            setSearchField(value)
            // 축이 바뀌면 검색어를 비운다 — 주문번호는 완전일치라 셀러명을 그대로 보내면 0건이 된다.
            setSearch('')
          }}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={searchPlaceholder[searchField]}
          className="w-64"
        />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 클레임 {list.totalCount}건
          </span>
        )}
      </FilterBar>

      <DataTable
        columns={makeClaimColumns(row => setSelectedId(row.claimPublicId))}
        rows={list.rows}
        rowKey={row => row.claimPublicId}
        onRowClick={row => setSelectedId(row.claimPublicId)}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 클레임이 없어요.'}
      />

      {list.hasNext && (
        <div className="mt-3.5 flex justify-center">
          <Button
            variant="secondary"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="클레임 상세" width="lg">
        {detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">클레임 정보를 불러오고 있어요.</p>
        )}
        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {detail.detail && (
          <ClaimDetailBody
            data={detail.detail}
            catalogError={catalog.isError ? reasonCatalogErrorMessage(catalog.error) : null}
            decision={decision}
            onDecisionChange={value => {
              setDecision(value)
              // 판정이 바뀌면 사유를 비운다 — 판정별로 고를 수 있는 사유가 달라(400/50415)
              // 그대로 두면 이전 판정의 사유가 남아 서버가 거절한다.
              setReason('')
              setReasonDetail('')
            }}
            reasonOptions={reasonOptions}
            reason={reason}
            onReasonChange={value => {
              setReason(value)
              // 사유가 바뀌면 상세도 비운다 — 보이는 상태와 보낼 값이 갈리지 않게.
              setReasonDetail('')
            }}
            needsDetail={needsDetail}
            reasonDetail={reasonDetail}
            onReasonDetailChange={setReasonDetail}
            showCostBearer={showCostBearer}
            costBearer={costBearer}
            onCostBearerChange={setCostBearer}
            internalMemo={internalMemo}
            onInternalMemoChange={setInternalMemo}
            canSubmit={canSubmit}
            onSubmitClick={() => setConfirmOpen(true)}
          />
        )}
      </Drawer>

      {claim && (
        <Modal
          open={confirmOpen}
          onClose={closeConfirm}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          confirmVariant={decisionModalMeta[decision].confirmVariant}
          onConfirm={submit}
          loading={intervene.isPending}
        >
          <SummaryGrid
            items={[
              { label: '클레임', value: claim.claimPublicId },
              { label: '사유', value: selectedReason?.label ?? '-' },
              {
                label: '반품비 부담',
                value: showCostBearer
                  ? isCostBearer(costBearer)
                    ? RETURN_COST_BEARER_LABEL[costBearer]
                    : '판정 기본값'
                  : '해당 없음',
              },
              { label: '환불', value: '이 처리로 집행되지 않아요' },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}

interface ClaimDetailBodyProps {
  data: AdminClaimDetailData
  catalogError: string | null
  decision: AdminClaimFaultDecision
  onDecisionChange: (value: AdminClaimFaultDecision) => void
  reasonOptions: { value: string; label: string }[]
  reason: string
  onReasonChange: (value: string) => void
  needsDetail: boolean
  reasonDetail: string
  onReasonDetailChange: (value: string) => void
  showCostBearer: boolean
  costBearer: string
  onCostBearerChange: (value: string) => void
  internalMemo: string
  onInternalMemoChange: (value: string) => void
  canSubmit: boolean
  onSubmitClick: () => void
}

function ClaimDetailBody({
  data,
  catalogError,
  decision,
  onDecisionChange,
  reasonOptions,
  reason,
  onReasonChange,
  needsDetail,
  reasonDetail,
  onReasonDetailChange,
  showCostBearer,
  costBearer,
  onCostBearerChange,
  internalMemo,
  onInternalMemoChange,
  canSubmit,
  onSubmitClick,
}: ClaimDetailBodyProps) {
  const { claim, order, buyerStatement, sellerHandling, items, history, intervention } = data
  const display = claimDisplayStatus(claim)
  return (
    <DetailDrawerBody
      subtitle={`${claim.claimPublicId} / ${claim.orderPublicId}`}
      actions={
        <Button
          variant="primary"
          leftIcon={<Check className="size-4" />}
          onClick={onSubmitClick}
          disabled={!canSubmit}
        >
          제출
        </Button>
      }
    >
      <DrawerSummaryCard
        pills={
          <>
            <StatusPill variant={display.variant}>{display.label}</StatusPill>
            <StatusMetaPill
              meta={{
                label: CLAIM_TYPE_LABEL[claim.claimType],
                variant: CLAIM_TYPE_VARIANT[claim.claimType],
                icon: claimTypeMetaIcon[claim.claimType],
              }}
            />
            <StatusPill variant="neutral">{claimReasonText(claim)}</StatusPill>
          </>
        }
      >
        <SummaryGrid
          items={[
            { label: '상품', value: productSummary(claim.productNames) },
            { label: '주문 상태', value: ORDER_STATUS_LABEL[order.orderStatus] },
            { label: '환불 예정', value: won(claim.refundAmount) },
            {
              label: '반품 배송비',
              value: claim.returnShippingFee == null ? '-' : won(claim.returnShippingFee),
            },
            {
              label: '환불 상태',
              value: claim.refundStatus ? REFUND_STATUS_LABEL[claim.refundStatus] : '-',
            },
            {
              label: '반품비 부담',
              value: claim.returnCostBearer
                ? RETURN_COST_BEARER_LABEL[claim.returnCostBearer]
                : '미정',
            },
          ]}
        />
      </DrawerSummaryCard>

      <DetailField label="구매자 주장">
        <div className="space-y-1.5 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
          <p className="text-body-sm font-medium text-text-primary">
            {claimReasonText(buyerStatement)}
            {buyerStatement.requestedAt && (
              <span className="ml-1.5 text-caption font-normal text-text-tertiary tabular-nums">
                {formatClaimDateTime(buyerStatement.requestedAt)} 요청
              </span>
            )}
          </p>
          <p className="break-keep whitespace-pre-wrap text-body-sm text-text-secondary">
            {buyerStatement.reasonDetail ?? '상세 내용이 없어요.'}
          </p>
        </div>
      </DetailField>

      <DetailField label="셀러 처리">
        <div className="space-y-1.5 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
          <p className="text-body-sm font-medium text-text-primary">
            {sellerHandling.sellerApprovalStatus
              ? SELLER_APPROVAL_LABEL[sellerHandling.sellerApprovalStatus]
              : '셀러 판단 기록 없음'}
          </p>
          {sellerHandling.rejectionReason && (
            <p className="break-keep text-body-sm text-text-secondary">
              거부 사유: {sellerHandling.rejectionReason}
            </p>
          )}
          {/* 셀러 운영 메모는 구매자에게 나가지 않지만 분쟁 판정에서는 셀러측 근거다. */}
          {sellerHandling.sellerMemo && (
            <p className="break-keep text-caption text-text-tertiary">
              셀러 메모: {sellerHandling.sellerMemo}
            </p>
          )}
          {sellerHandling.autoApproveDueAt && sellerHandling.approvedAt == null && (
            <p className="text-caption text-text-tertiary tabular-nums">
              {formatClaimDateTime(sellerHandling.autoApproveDueAt)} 자동 승인 예정
            </p>
          )}
        </div>
      </DetailField>

      <DetailField label={`대상 품목 / ${items.length}건`}>
        <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface-sunken">
          {items.map(item => (
            <li key={item.orderItemId} className="px-3 py-2 text-body-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 text-text-primary">
                  <span className="line-clamp-1">{item.productName}</span>
                  <span className="text-caption text-text-tertiary">
                    {item.optionName} / {item.quantity}개 / {ORDER_ITEM_STATUS_LABEL[item.itemStatus]}
                  </span>
                </span>
                <span className="flex-none text-caption text-text-secondary tabular-nums">
                  {won(item.refundAmount)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </DetailField>

      <DetailField label="배송 정보" visibility="internal-only">
        <SummaryGrid
          items={[
            { label: '수령인', value: order.recipientName },
            { label: '연락처', value: order.contactNumber },
            {
              label: '주소',
              value: `(${order.zipCode}) ${order.baseAddress} ${order.detailAddress ?? ''}`.trim(),
            },
            { label: '배송 메모', value: order.deliveryMemo ?? '-' },
          ]}
        />
      </DetailField>

      <DetailField label={`처리 이력 / ${history.length}건`}>
        <HistoryList
          items={history.map(entry => ({
            label: CLAIM_HISTORY_EVENT_LABEL[entry.event],
            date: formatClaimDateTime(entry.occurredAt),
          }))}
          emptyLabel="처리 이력이 없어요."
        />
      </DetailField>

      {/* 개입 기록은 한 건에 한 행뿐이다 — 있으면 이 건은 이미 종결됐다. */}
      {intervention && (
        <DetailField label="운영자 개입 기록">
          <div className="space-y-1 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5">
            <p className="text-body-sm font-medium text-text-primary">
              {FAULT_DECISION_LABEL[intervention.faultDecision]} / {intervention.reasonLabel}
            </p>
            {intervention.reasonDetail && (
              <p className="break-keep text-body-sm text-text-secondary">
                {intervention.reasonDetail}
              </p>
            )}
            {intervention.internalMemo && (
              <p className="break-keep text-caption text-text-tertiary">
                메모: {intervention.internalMemo}
              </p>
            )}
            <p className="text-caption text-text-tertiary tabular-nums">
              {formatClaimDateTime(intervention.intervenedAt)} / 처리 전{' '}
              {CLAIM_STATUS_LABEL[intervention.previousStatus]}
            </p>
          </div>
        </DetailField>
      )}

      <DetailField label="귀책 판정">
        {!claim.interventionAllowed && (
          <Alert variant="info" title="지금 개입할 수 없는 클레임이에요" className="mb-2.5">
            <p>
              이미 개입했거나 환불이 움직였거나 교환이 재발송으로 끝난 건이에요. 개입은 한 건에 한
              번만 할 수 있어요.
            </p>
          </Alert>
        )}
        {catalogError && (
          <Alert variant="error" title="개입 사유를 불러오지 못했어요" className="mb-2.5">
            <p>{catalogError}</p>
          </Alert>
        )}
        <DecisionRadioGroup<AdminClaimFaultDecision>
          name="claim-fault-decision"
          value={decision}
          onChange={onDecisionChange}
          options={[
            {
              value: 'SELLER_FAULT',
              label: FAULT_DECISION_LABEL.SELLER_FAULT,
              caption: '기본 반품비 부담은 셀러',
            },
            {
              value: 'BUYER_FAULT',
              label: FAULT_DECISION_LABEL.BUYER_FAULT,
              caption: '기본 반품비 부담은 구매자',
            },
            {
              value: 'CLAIM_DISMISSED',
              label: FAULT_DECISION_LABEL.CLAIM_DISMISSED,
              caption: '요청 불성립으로 종결, 부담 주체 없음',
            },
          ]}
        />
      </DetailField>

      <DetailField label="개입 사유">
        <Select
          options={reasonOptions}
          value={reason}
          onChange={onReasonChange}
          placeholder={reasonOptions.length === 0 ? '선택지를 불러오지 못했어요' : '사유 선택'}
          disabled={reasonOptions.length === 0}
        />
      </DetailField>

      {needsDetail && (
        <DetailField label="상세 사유" visibility="visible-to-user">
          <Textarea
            value={reasonDetail}
            onChange={onReasonDetailChange}
            maxLength={INTERVENTION_REASON_DETAIL_MAX}
            rows={3}
            placeholder="양쪽에 전달할 판정 사유를 입력하세요."
          />
        </DetailField>
      )}

      {/* 취소 유형·클레임 불가 판정에서는 서버가 부담 주체를 비우므로 입력 자체를 그리지 않는다. */}
      {showCostBearer && (
        <DetailField label="반품비 부담 주체">
          <Select
            options={costBearerOptions}
            value={costBearer}
            onChange={onCostBearerChange}
            placeholder="판정 기본값 사용"
          />
        </DetailField>
      )}

      <DetailField label="내부 메모" visibility="internal-only">
        <Textarea
          value={internalMemo}
          onChange={onInternalMemoChange}
          maxLength={INTERVENTION_MEMO_MAX}
          rows={3}
          placeholder="내부 공유용 메모를 입력하세요."
        />
      </DetailField>
    </DetailDrawerBody>
  )
}

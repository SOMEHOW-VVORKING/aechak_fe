import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Ban,
  Briefcase,
  Building2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Hourglass,
  LogOut,
  Minus,
  Pause,
  Save,
  Undo2,
  User,
  Wallet,
} from 'lucide-react'
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
import type { Column, ToastVariant } from '@aechak/design-system/web'
import type { SellerAccount, SellerOperatingStatus } from '@aechak/domain'
import type { SellerSanctionReasonCode } from '@aechak/api'
import {
  DEFAULT_PAGE_SIZE,
  LEGAL_TYPE_UNKNOWN,
  SELLER_TEXT_MAX_LENGTH,
  SUSPENSION_DURATION_INDEFINITE,
  SUSPENSION_DURATION_OPTIONS,
  SUSPENSION_REASON_LABELS,
  actionErrorMessage,
  allowedAction,
  detailErrorMessage,
  listErrorMessage,
  memoErrorMessage,
  toDateLabel,
  useSaveSellerMemo,
  useSellerAccounts,
  useSellerAction,
  useSellerDetail,
  type SellerAction,
  type SellerLegalTypeValue,
  type SellerStatusFilterValue,
  type SellerTypeFilterValue,
} from '@/features/sellers'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { usePendingWriteExitGuard } from '@/shared/hooks/usePendingWriteExitGuard'

// `/admin/sellers` 다섯(목록·상세·판매정지·해제·메모)에 실연동됐다(SCRUM-362) — 예시 데이터 띠와
// nav 꼬리표를 함께 걷었다. 입점 심사와 다른 층이다: 여기서 막는 것은 **판매**이고 계정 로그인
// 차단은 `/members`가 users.status로 다룬다.
export const Route = createFileRoute('/sellers/')({
  component: SellersPage,
})

// BE SellerStatus 5값 1:1. PAUSED·WITHDRAWN으로 가는 전이 코드가 서버에 없어 그 상태의 셀러는
// 지금 생기지 않지만 응답에는 실릴 수 있어 다섯 값을 다 채운다 — 비면 어떤 셀러인지 읽을 수 없다.
const operatingStatusMeta: Record<SellerOperatingStatus, StatusMeta> = {
  active: { label: '영업중', variant: 'success', icon: CheckCircle },
  paused: { label: '휴업', variant: 'muted', icon: Pause },
  suspended: { label: '판매정지', variant: 'danger', icon: Ban },
  'withdrawal-requested': { label: '퇴점 신청', variant: 'warning', icon: Hourglass },
  withdrawn: { label: '퇴점', variant: 'muted', icon: LogOut },
}

/**
 * 입점 신청서의 세 유형 + 유형 미확인.
 *
 * 공용 `SellerTypePill`을 쓰지 않는 이유: 그 pill의 축은 사업자/개인 둘이고, 여기는 **네 값**을
 * 보여줘야 한다 — 서버가 개인 사업자와 법인 사업자를 가려 주고, 신청서가 없는 셀러는 유형을
 * 모른다(businessType=null). 네 값을 두 값 축에 끼우면 운영자가 못 보는 구별이 생긴다.
 */
const legalTypeMeta: Record<SellerLegalTypeValue, StatusMeta> = {
  individual: { label: '개인 일반', variant: 'info', icon: User },
  'individual-business': { label: '개인 사업자', variant: 'neutral', icon: Briefcase },
  'corporate-business': { label: '법인 사업자', variant: 'neutral', icon: Building2 },
  [LEGAL_TYPE_UNKNOWN]: { label: '유형 미확인', variant: 'muted', icon: HelpCircle },
}

const legalTypeOf = (seller: SellerAccount): SellerLegalTypeValue =>
  seller.legalType ?? LEGAL_TYPE_UNKNOWN

const statusFilterOptions: { value: SellerStatusFilterValue; label: string }[] = [
  { value: 'all', label: '영업 상태 전체' },
  { value: 'active', label: operatingStatusMeta.active.label },
  { value: 'paused', label: operatingStatusMeta.paused.label },
  { value: 'suspended', label: operatingStatusMeta.suspended.label },
  { value: 'withdrawal-requested', label: operatingStatusMeta['withdrawal-requested'].label },
  { value: 'withdrawn', label: operatingStatusMeta.withdrawn.label },
]

// 서버 필터 축은 "사업자인가" 둘뿐이다 — 개인 사업자와 법인 사업자를 따로 거를 수 없다.
const typeFilterOptions: { value: SellerTypeFilterValue; label: string }[] = [
  { value: 'all', label: '판매자 유형' },
  { value: 'business', label: '사업자' },
  { value: 'individual', label: '개인' },
]

const suspensionReasonOptions = (
  Object.keys(SUSPENSION_REASON_LABELS) as SellerSanctionReasonCode[]
).map(value => ({ value, label: SUSPENSION_REASON_LABELS[value] }))

const actionModalMeta: Record<
  SellerAction,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
> = {
  suspend: {
    title: '판매를 정지할까요?',
    // "기간이 지나면 자동으로 풀려요"는 거짓이다 — 서버에 만료 처리가 없어 해제는 운영자 조치뿐이다.
    description:
      '셀러의 신규 판매가 막히고 제재 이력에 기록돼요. 정지 기간이 지나도 자동으로 풀리지 않아 해제는 직접 처리해야 해요.',
    confirmLabel: '판매정지',
    confirmVariant: 'danger',
  },
  release: {
    title: '판매정지를 해제할까요?',
    description: '정지 직전 상태로 되돌아가고 해제 기록이 제재 이력에 남아요.',
    confirmLabel: '정지 해제',
    confirmVariant: 'primary',
  },
}

/** 정지 중인 셀러의 해제 예정 시각 표기. 무기한이면 날짜가 없다. */
function suspensionUntilLabel(seller: SellerAccount): string | null {
  if (seller.operatingStatus !== 'suspended') return null
  return seller.suspensionUntil ? `${toDateLabel(seller.suspensionUntil)}까지` : '무기한'
}

function makeSellerColumns(onOpenDetail: (row: SellerAccount) => void): Column<SellerAccount>[] {
  return [
    {
      key: 'shopName',
      label: '셀러명',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.shopName}</RowLinkButton>,
    },
    {
      key: 'representativeNameMasked',
      // 서버가 가려서 내려준 값이다 — 화면에서 또 가리지 않는다. 신청서가 없으면 값 자체가 없다.
      label: '대표자',
      render: row => row.representativeNameMasked ?? '—',
    },
    {
      key: 'legalType',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={legalTypeMeta[legalTypeOf(row)]} />,
    },
    {
      key: 'operatingStatus',
      label: '영업 상태',
      // pill 아래 보조 텍스트가 붙는 컬럼은 center 금지(pill과 좌측이 어긋난다).
      render: row => {
        const until = suspensionUntilLabel(row)
        return (
          <div className="min-w-0">
            <StatusMetaPill meta={operatingStatusMeta[row.operatingStatus]} />
            {until && <p className="mt-1.5 pl-2.5 text-caption text-text-tertiary">{until}</p>}
          </div>
        )
      },
    },
    {
      key: 'productCount',
      // 판매 상태로 거르지 않은 상품 행 수라 '판매 상품'이라고 쓰면 거짓이 된다.
      label: '등록 상품',
      align: 'right',
      render: row => <span className="tabular-nums">{row.productCount.toLocaleString('ko-KR')}</span>,
    },
    {
      key: 'cumulativeOrders',
      // sellers.confirmed_order_count — 주문 접수가 아니라 구매확정 누적이다.
      label: '누적 구매확정',
      align: 'right',
      render: row => (
        <span className="tabular-nums">{row.cumulativeOrders.toLocaleString('ko-KR')}</span>
      ),
    },
    {
      key: 'hasUnsettledAmount',
      // 금액이 아니라 지급 대기 정산 원장 보유 여부다.
      label: '미정산',
      align: 'center',
      render: row =>
        row.hasUnsettledAmount ? (
          <StatusPill variant="warning">
            <Wallet className="size-3" />
            미정산
          </StatusPill>
        ) : (
          <StatusPill variant="neutral">
            <Minus className="size-3" />
            없음
          </StatusPill>
        ),
    },
    {
      key: 'statusChangedAt',
      label: '상태 변경',
      align: 'right',
      render: row => <span className="tabular-nums">{toDateLabel(row.statusChangedAt)}</span>,
    },
  ]
}

function SellersPage() {
  const [statusFilter, setStatusFilter] = useState<SellerStatusFilterValue>('all')
  const [typeFilter, setTypeFilter] = useState<SellerTypeFilterValue>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const list = useSellerAccounts({
    status: statusFilter,
    sellerType: typeFilter,
    keyword: search,
    page,
  })

  const totalPages = Math.max(1, Math.ceil(list.totalCount / DEFAULT_PAGE_SIZE))
  const lastPage = totalPages - 1
  // 조회가 실패하면 totalCount가 0으로 와 totalPages가 1이 된다. 그 값으로 페이저를 그리면
  // 2페이지에서 실패한 운영자의 '이전' 버튼까지 사라져 되돌아올 수단이 없어진다 — 아래 보정
  // useEffect가 isError를 제외하므로(실패를 근거로 페이지를 접지 않는다) 그 상태가 유지된다.
  const pageCount = Math.max(totalPages, page + 1)

  // 마지막 페이지의 유일한 셀러가 필터에서 빠지면 재조회 결과에 그 페이지가 없어져 빈 목록에
  // 갇힌다 — 페이지 이동 버튼은 totalPages > 1일 때만 그려지므로 되돌아올 수단까지 사라진다.
  // 조회 중에는 totalCount가 0이라 페이지가 잘못 접히므로 응답이 온 뒤에만 보정한다.
  useEffect(() => {
    if (!list.isLoading && !list.isError && page > lastPage) setPage(lastPage)
  }, [list.isLoading, list.isError, page, lastPage])

  // 공용 `useDetailList`를 쓰지 않는 이유: 그 훅은 `selected`를 목록 행에서 id로 찾고 결과를
  // 로컬 edits로 덮어쓴다(처리 API가 없던 시절의 패턴). 조치가 204 + 무효화로 반영되는 지금은
  // 재조회로 행이 현재 페이지·필터에서 빠지는 순간 `selected`가 undefined가 되어 Drawer가
  // 닫힌다 — 409 안내를 띄운 채 바뀐 상태를 보여 주는 동작이 바로 그 경로에서 깨진다
  // (입점 심사 화면이 같은 이유로 같은 선택을 했다).
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRow, setSelectedRow] = useState<SellerAccount | null>(null)
  const detail = useSellerDetail(selectedId)
  const seller = detail.detail?.seller ?? null

  const action = useSellerAction()
  const memo = useSaveSellerMemo()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  // 기본값을 비워 둔다. 되돌리기 어려운 제재의 기본값으로 가장 센 값(무기한)을 두면 사유만
  // 고른 운영자가 의도하지 않은 무기한 정지를 넣게 된다. 무기한 자체는 선택지에 남는다.
  const [durationDays, setDurationDays] = useState('')
  const [internalMemo, setInternalMemo] = useState('')
  const [seededId, setSeededId] = useState<number | null>(null)

  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 조치 직후 무효화로 상세가 다시 올 때
  // 운영자가 고른 값이 되돌아간다.
  const view = detail.detail
  useEffect(() => {
    if (!view || seededId === view.seller.sellerId) return
    setReasonCode(view.suspensionReasonCode ?? '')
    setReasonDetail('')
    setDurationDays('')
    setInternalMemo(view.internalMemo ?? '')
    setSeededId(view.seller.sellerId)
  }, [view, seededId])

  const openDrawer = useCallback((row: SellerAccount) => {
    setSelectedId(row.sellerId)
    setSelectedRow(row)
    setSeededId(null)
  }, [])

  const sellerColumns = useMemo(() => makeSellerColumns(openDrawer), [openDrawer])

  const nextAction = seller ? allowedAction(seller.operatingStatus) : null
  const isSuspend = nextAction === 'suspend'
  const needsReasonDetail = reasonCode === 'OTHER'
  const isPending = action.isPending || memo.isPending

  // 조회가 실패한 동안에는 그 데이터로 하는 처리를 잠근다(AGENTS 6-7). **상세도 함께 본다** —
  // react-query는 재조회가 실패해도 캐시된 값을 돌려주므로, 상세만 403이 된 화면에서 낡은 행으로
  // 되돌릴 수 없는 전이를 지시하게 된다. 상세를 **여는** 읽기 버튼은 이 잠금의 대상이 아니다.
  const canAct =
    seller != null &&
    nextAction != null &&
    !isPending &&
    !list.isError &&
    !detail.isError &&
    (!isSuspend ||
      (reasonCode !== '' &&
        durationDays !== '' &&
        (!needsReasonDetail || reasonDetail.trim() !== '') &&
        reasonDetail.length <= SELLER_TEXT_MAX_LENGTH))

  const canSaveMemo = seller != null && !isPending && !list.isError && !detail.isError

  function resetSelection() {
    setSelectedId(null)
    setSelectedRow(null)
    setSeededId(null)
    setConfirmOpen(false)
  }

  /**
   * 요청이 떠 있는 동안에는 **드로어도 확인 Modal도 닫지 않는다.** DS `Drawer`·`Modal`은
   * ESC·스크림·취소를 모두 `onClose` 하나로 보내므로, 확인 버튼만 `loading`으로 잠그면 ESC
   * 한 번에 드로어가 닫히고 확인 Modal까지 함께 사라져 처리 결과를 알릴 화면이 없어진다.
   */
  function closeDrawer() {
    if (isPending) return
    resetSelection()
  }

  function closeConfirm() {
    if (isPending) return
    setConfirmOpen(false)
  }

  // 닫기 가드는 `onClose`만 막는다 — 라우트 이탈·새로고침은 그 가드를 지나가지 않고, 나가면
  // 정지는 서버에 들어가는데 결과를 알릴 화면이 사라진다. 메모 저장은 같은 값을 다시 적으면
  // 되돌아오는 처리라 이탈까지 막지 않는다.
  usePendingWriteExitGuard(action.isPending)

  function submitAction() {
    // 같은 버튼을 두 번 눌러도 요청은 한 번만 나간다.
    if (!seller || !nextAction || !canAct) return
    const meta = actionModalMeta[nextAction]
    action.mutate(
      {
        sellerId: seller.sellerId,
        action: nextAction,
        reasonCode: isSuspend ? (reasonCode as SellerSanctionReasonCode) : null,
        reasonDetail,
        durationDays:
          isSuspend && durationDays !== SUSPENSION_DURATION_INDEFINITE ? Number(durationDays) : null,
        memo: internalMemo,
      },
      {
        onSuccess: () => {
          setToast({ message: `${meta.confirmLabel} 처리했어요.`, variant: 'success' })
          resetSelection()
        },
        onError: error => {
          // 409는 무효화로 최신 상태가 되돌아오므로 Drawer를 열어 둔 채 안내만 띄운다 —
          // 운영자가 바뀐 상태를 그 자리에서 본다.
          setToast({ message: actionErrorMessage(error), variant: 'error' })
          setConfirmOpen(false)
        },
      },
    )
  }

  function submitMemo() {
    if (!seller || !canSaveMemo) return
    memo.mutate(
      { sellerId: seller.sellerId, memo: internalMemo },
      {
        onSuccess: () =>
          setToast({
            message: internalMemo.trim() === '' ? '메모를 지웠어요.' : '메모를 저장했어요.',
            variant: 'success',
          }),
        onError: error => setToast({ message: memoErrorMessage(error), variant: 'error' }),
      },
    )
  }

  function changeFilter(apply: () => void) {
    apply()
    setPage(0)
  }

  const confirmMeta = nextAction ? actionModalMeta[nextAction] : null

  return (
    <div className="p-6">
      <PageIntro
        title="셀러 관리"
        description="승인된 셀러의 운영 상태를 확인하고 필요 시 판매정지를 처리해요."
      />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "셀러 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          aria-label="영업 상태 필터"
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value =>
            changeFilter(() => setStatusFilter(value as SellerStatusFilterValue))
          }
        />
        <FilterSelect
          narrow
          aria-label="판매자 유형 필터"
          options={typeFilterOptions}
          value={typeFilter}
          onChange={value => changeFilter(() => setTypeFilter(value as SellerTypeFilterValue))}
        />
        <SearchInput
          value={search}
          onChange={value => changeFilter(() => setSearch(value))}
          placeholder="셀러명 검색"
          className="w-64"
        />
        {/* 조회 실패·조회 중에는 0이 아니라 줄표다 — 0을 그리면 "조건에 맞는 셀러가 없다"로 읽힌다. */}
        <span className="text-body-sm text-text-tertiary tabular-nums">
          조건에 맞는 셀러 {list.isLoading || list.isError ? '—' : `${list.totalCount}곳`}
        </span>
      </FilterBar>

      <DataTable
        columns={sellerColumns}
        rows={list.rows}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 셀러가 없어요.'}
      />

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-body-sm text-text-tertiary">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ChevronLeft className="size-4" />}
            disabled={page === 0}
            onClick={() => setPage(current => Math.max(0, current - 1))}
          >
            이전
          </Button>
          <span className="tabular-nums">
            {page + 1} / {pageCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ChevronRight className="size-4" />}
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(current => current + 1)}
          >
            다음
          </Button>
        </div>
      )}

      {/* 유형 필터는 신청서가 없는 셀러를 어느 쪽으로도 세지 않는다 — 빠진 행을 운영자가 알아야 한다. */}
      {typeFilter !== 'all' && (
        <p className="mt-1.5 text-caption text-text-tertiary">
          입점 신청서가 없어 유형을 모르는 셀러는 유형을 고르면 목록에서 빠져요.
        </p>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="셀러 상세" width="lg">
        {detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">
            {selectedRow
              ? `${selectedRow.shopName} 상세를 불러오는 중이에요.`
              : '상세를 불러오는 중이에요.'}
          </p>
        )}

        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}

        {view && seller && (
          <DetailDrawerBody
            subtitle={`${seller.shopName} / ${legalTypeMeta[legalTypeOf(seller)].label}`}
            actions={
              <>
                {nextAction && (
                  <Button
                    variant={actionModalMeta[nextAction].confirmVariant}
                    leftIcon={
                      nextAction === 'suspend' ? (
                        <Ban className="size-4" />
                      ) : (
                        <Undo2 className="size-4" />
                      )
                    }
                    disabled={!canAct}
                    onClick={() => setConfirmOpen(true)}
                  >
                    {actionModalMeta[nextAction].confirmLabel}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  leftIcon={<Save className="size-4" />}
                  disabled={!canSaveMemo}
                  onClick={submitMemo}
                >
                  메모 저장
                </Button>
              </>
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={operatingStatusMeta[seller.operatingStatus]} />
                  <StatusMetaPill meta={legalTypeMeta[legalTypeOf(seller)]} />
                </>
              }
            >
              {/* 최근 접속·누적 신고 칸이 없는 이유: 응답에 없다. users에 접속 칼럼이 없고 신고
                  대상 종류에 셀러가 없어 서버가 셀 수 없는 값이라, 어느 화면에서도 만들어 낼 수 없다. */}
              <SummaryGrid
                items={[
                  { label: '셀러 ID', value: seller.sellerId },
                  { label: '대표자', value: seller.representativeNameMasked ?? '—' },
                  { label: '등록 상품', value: `${seller.productCount.toLocaleString('ko-KR')}개` },
                  {
                    label: '누적 구매확정',
                    value: `${seller.cumulativeOrders.toLocaleString('ko-KR')}건`,
                  },
                  { label: '미정산', value: seller.hasUnsettledAmount ? '있음' : '없음' },
                  { label: '상태 변경', value: toDateLabel(seller.statusChangedAt) },
                  { label: '해제 예정', value: suspensionUntilLabel(seller) ?? '—' },
                ]}
              />
            </DrawerSummaryCard>

            {view.suspensionReason && (
              <DetailField label="현재 판매정지 사유">
                <p className="text-body-sm text-text-primary">{view.suspensionReason}</p>
              </DetailField>
            )}

            <DetailField label={`제재 이력 / ${view.sanctions.length}건`}>
              <HistoryList
                items={view.sanctions}
                renderDescription={item =>
                  [
                    item.reason,
                    item.effectiveUntil ? `${item.effectiveUntil}까지` : null,
                    item.memo ? `메모: ${item.memo}` : null,
                  ]
                    .filter(Boolean)
                    .join(' / ') || null
                }
                emptyLabel="제재 이력이 없어요."
              />
              {view.sanctions.length >= 50 && (
                <p className="text-caption text-text-tertiary">최신 50건만 보여 줘요.</p>
              )}
            </DetailField>

            {nextAction == null && (
              <Alert variant="info" title="상태를 바꿀 수 없는 셀러예요">
                <p>
                  퇴점 신청 / 퇴점 셀러는 정지를 걸어도 되돌릴 자리가 없어 판매정지와 해제를 모두
                  처리할 수 없어요.
                </p>
              </Alert>
            )}

            {isSuspend && (
              <>
                <DetailField label="판매정지 사유">
                  <Select
                    aria-label="판매정지 사유"
                    options={suspensionReasonOptions}
                    value={reasonCode}
                    onChange={setReasonCode}
                    placeholder="사유 선택"
                  />
                </DetailField>

                <DetailField label="정지 기간">
                  <Select
                    aria-label="정지 기간"
                    options={SUSPENSION_DURATION_OPTIONS}
                    value={durationDays}
                    onChange={setDurationDays}
                    placeholder="기간 선택"
                  />
                  <p className="text-caption text-text-tertiary">
                    기간이 지나도 자동으로 풀리지 않아요. 해제는 이 화면에서 직접 처리해요.
                  </p>
                </DetailField>
              </>
            )}

            {(isSuspend && needsReasonDetail) || nextAction === 'release' ? (
              <DetailField label={isSuspend ? '상세 사유' : '해제 사유'}>
                <Textarea
                  aria-label={isSuspend ? '상세 사유' : '해제 사유'}
                  value={reasonDetail}
                  onChange={setReasonDetail}
                  maxLength={SELLER_TEXT_MAX_LENGTH}
                  rows={3}
                  placeholder={
                    isSuspend ? '상세 사유를 입력하세요.' : '해제 사유를 입력하세요.'
                  }
                />
              </DetailField>
            ) : null}

            <DetailField label="내부 메모" visibility="internal-only">
              <Textarea
                aria-label="내부 메모"
                value={internalMemo}
                onChange={setInternalMemo}
                maxLength={SELLER_TEXT_MAX_LENGTH}
                rows={3}
                placeholder="내부 공유용 메모를 입력하세요."
              />
              {/* 제재 요청에 딸린 memo는 비어 있으면 기존 메모를 지우지 않는다 — 지우는 경로는
                  메모 저장뿐이라 그 차이를 적어 둔다. */}
              <p className="text-caption text-text-tertiary">
                제재를 처리하면 적어 둔 메모가 함께 저장돼요. 메모를 비우려면 메모 저장을 눌러 주세요.
              </p>
            </DetailField>

            <Alert variant="warning">
              판매정지는 신규 판매만 막아요. 셀러 로그인은 끊기지 않고 이미 등록된 상품의 판매 상태와
              정산 지급도 이 처리로 바뀌지 않아요.
            </Alert>
          </DetailDrawerBody>
        )}
      </Drawer>

      {seller && confirmMeta && (
        <Modal
          open={confirmOpen}
          onClose={closeConfirm}
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.confirmLabel}
          confirmVariant={confirmMeta.confirmVariant}
          loading={action.isPending}
          onConfirm={submitAction}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: `${seller.shopName} (${seller.sellerId})` },
              {
                label: '사유',
                value: isSuspend
                  ? SUSPENSION_REASON_LABELS[reasonCode as SellerSanctionReasonCode] ?? '—'
                  : reasonDetail.trim() || '—',
              },
              ...(isSuspend
                ? [
                    {
                      label: '기간',
                      value:
                        SUSPENSION_DURATION_OPTIONS.find(option => option.value === durationDays)
                          ?.label ?? '',
                    },
                  ]
                : []),
            ]}
          />
        </Modal>
      )}

      {toast && (
        <Toast open onClose={() => setToast(null)} message={toast.message} variant={toast.variant} />
      )}
    </div>
  )
}

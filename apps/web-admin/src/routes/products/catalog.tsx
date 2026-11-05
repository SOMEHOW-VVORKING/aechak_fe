import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type {
  ProductCatalogInspectionStatus,
  ProductCatalogItem,
  ProductCatalogSaleStatus,
} from '@aechak/domain'
import {
  ADMIN_BLOCK_META,
  ALL,
  DEFAULT_PAGE_SIZE,
  INSPECTION_STATUS_FILTER_VALUES,
  INSPECTION_STATUS_META,
  REASON_MAX_LENGTH,
  SALE_STATUS_FILTER_VALUES,
  SALE_STATUS_META,
  formatWireDate,
  formatWireDateTime,
  isStaleWrite,
  listErrorMessage,
  priceLabel,
  sellerLabel,
  useProductCatalog,
  useWriteProductCatalog,
  writeErrorMessage,
  type ProductCatalogAction,
} from '@/features/product-catalog'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { usePendingWriteExitGuard } from '@/shared/hooks/usePendingWriteExitGuard'

// `/admin/products` 셋(목록·판매중지·재개)과 검토 큐의 승인·반려에 붙은 실연동 화면(SCRUM-363).
// 검수 큐(`/products/ai-queue`)와 **모수가 다르다** — 큐에는 관리자 확인이 남은 행만 쌓이고
// 여기는 큐에 올라온 적 없는 상품까지 전수로 보여 준다. 그래서 이름도 '상품 카탈로그 관리'다
// (이름이 닮아 운영자가 목데이터 쪽을 먼저 누른 사고가 SCRUM-313이었다).
export const Route = createFileRoute('/products/catalog')({
  component: ProductCatalogPage,
})

const inspectionFilterOptions = [
  { value: ALL, label: '검수 상태 전체' },
  ...INSPECTION_STATUS_FILTER_VALUES.map(value => ({
    value,
    label: INSPECTION_STATUS_META[value].label,
  })),
]

const saleFilterOptions = [
  { value: ALL, label: '판매 상태 전체' },
  ...SALE_STATUS_FILTER_VALUES.map(value => ({ value, label: SALE_STATUS_META[value].label })),
]

/**
 * 카테고리 필터가 없는 이유: 서버 조건은 `categoryId`(노드와 하위 전부)인데 어드민 모듈에
 * 카테고리 목록 경로가 없다 — 이름만으로는 id를 만들 수 없고, 목록 응답의 `categoryName`은
 * 상위 경로 없는 노드 이름 하나뿐이라 현재 페이지 안에서 거르는 수준밖에 안 된다. 상품명과
 * 상호명은 서버 `keyword`가 함께 받는다.
 */
const actionMeta: Record<
  ProductCatalogAction,
  {
    label: string
    caption: string
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    message: string
  }
> = {
  approve: {
    label: '검수 승인',
    caption: '검수 반려를 풀어 구매자에게 다시 노출해요. 운영자 막음은 풀리지 않아요.',
    title: '검수를 승인할까요?',
    description:
      '반려가 풀려 구매자에게 다시 노출돼요. 운영자가 막아 둔 판매는 이 처리로 풀리지 않아요.',
    confirmLabel: '승인',
    confirmVariant: 'primary',
    message: '검수를 승인했어요.',
  },
  reject: {
    label: '검수 반려',
    caption: '구매자에게서 가리고 사유를 셀러에게 그대로 보여요.',
    title: '검수를 반려할까요?',
    description:
      '구매자에게서 가려지고 사유가 셀러에게 그대로 보여요. 셀러가 고쳐도 관리자가 다시 확인해야 노출돼요.',
    confirmLabel: '반려',
    confirmVariant: 'danger',
    message: '검수를 반려했어요.',
  },
  suspend: {
    label: '판매 중지',
    caption: '판매를 잠가요. 셀러는 되돌릴 수 없고 검수 상태는 그대로예요.',
    title: '판매를 중지할까요?',
    description:
      '목록 / 검색 / 상세 / 주문이 즉시 끊기고, 막아 둔 동안 셀러는 판매 상태를 되돌릴 수 없어요. 검수 상태는 그대로예요.',
    confirmLabel: '판매 중지',
    confirmVariant: 'danger',
    message: '판매를 중지했어요.',
  },
  resume: {
    label: '판매 재개',
    caption: '운영자 막음을 풀고 막기 직전 상태로 되돌려요.',
    title: '판매를 다시 열까요?',
    description:
      '막음을 풀고 막기 직전 상태로 되돌려요. 재고가 없거나 셀러가 스스로 내려 둔 상품이면 판매중이 되지 않으니 결과는 목록에서 확인해 주세요.',
    confirmLabel: '판매 재개',
    confirmVariant: 'primary',
    message: '판매 막음을 풀었어요. 바뀐 판매 상태는 목록에서 확인해 주세요.',
  },
}

/** 막음 없는 행에는 재개가, 막힌 행에는 중지가 서지 않는다 — 서버가 409로 거절하는 조합이다. */
function actionsFor(item: ProductCatalogItem): ProductCatalogAction[] {
  return item.adminSaleSuspended ? ['resume', 'approve', 'reject'] : ['suspend', 'approve', 'reject']
}

function makeColumns(
  onOpenDetail: (row: ProductCatalogItem) => void,
): Column<ProductCatalogItem>[] {
  return [
    {
      key: 'productName',
      label: '상품명',
      render: row => <RowLinkButton onClick={() => onOpenDetail(row)}>{row.productName}</RowLinkButton>,
    },
    { key: 'storeName', label: '셀러', render: row => sellerLabel(row) },
    { key: 'categoryName', label: '카테고리' },
    {
      key: 'saleStatus',
      label: '판매 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={SALE_STATUS_META[row.saleStatus]} />,
    },
    {
      key: 'inspectionStatus',
      label: '검수 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={INSPECTION_STATUS_META[row.inspectionStatus]} />,
    },
    {
      // 판매 상태와 따로 세우는 이유: 셀러가 스스로 내린 판매중지도 `suspended`라, 운영자 조치를
      // 가리는 신호는 이 칸뿐이다(서버에 그 필터도 없다).
      key: 'adminSaleSuspended',
      label: '운영자 막음',
      align: 'center',
      render: row => (row.adminSaleSuspended ? <StatusMetaPill meta={ADMIN_BLOCK_META} /> : <span>—</span>),
    },
    {
      key: 'reportCount',
      label: '신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}</span>,
    },
    {
      key: 'createdAt',
      label: '등록일',
      align: 'right',
      render: row => <span className="tabular-nums">{formatWireDate(row.createdAt)}</span>,
    },
  ]
}

function ProductCatalogPage() {
  const [inspectionFilter, setInspectionFilter] = useState<
    ProductCatalogInspectionStatus | typeof ALL
  >(ALL)
  const [saleFilter, setSaleFilter] = useState<ProductCatalogSaleStatus | typeof ALL>(ALL)
  const [search, setSearch] = useState('')
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [page, setPage] = useState(0)

  const list = useProductCatalog({
    inspectionStatus: inspectionFilter,
    saleStatus: saleFilter,
    keyword: search,
    page,
  })

  // 운영자 막음 필터는 서버 조건이 없다(스펙에 명시) — 현재 페이지 안에서만 거르고 그 사실을
  // 표 아래에서 밝힌다(입점 심사의 판매자 유형 필터와 같은 처리).
  const rows = useMemo(
    () => (blockedOnly ? list.items.filter(item => item.adminSaleSuspended) : list.items),
    [list.items, blockedOnly],
  )

  const totalPages = Math.max(1, Math.ceil(list.totalCount / DEFAULT_PAGE_SIZE))
  const lastPage = totalPages - 1
  // 마지막 페이지의 유일한 행이 필터에서 빠지면 빈 목록에 갇힌다 — 응답이 온 뒤에만 보정한다
  // (조회 중에는 totalCount가 0이라 페이지가 잘못 접힌다).
  useEffect(() => {
    if (!list.isLoading && !list.isError && page > lastPage) setPage(lastPage)
  }, [list.isLoading, list.isError, page, lastPage])

  /**
   * 선택은 목록 행이 아니라 여기서 들고 있다. 공용 `useDetailList`는 `selected`를 목록에서 id로
   * 찾으므로, 처리 뒤 무효화 재조회로 그 행이 현재 필터·페이지에서 빠지는 순간 상세 창이 닫힌다 —
   * 409 안내를 띄운 채 바뀐 상태를 보여 주는 경로가 바로 거기서 무너진다(입점 심사와 같은 판단).
   *
   * 상세 조회 경로가 없으므로 마지막으로 본 행을 스냅샷으로 들고, 재조회 결과에 같은 상품이
   * 있으면 그 값을 그린다. 결과에서 사라졌다면 스냅샷을 계속 보여 주되 **처리는 잠근다**.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ProductCatalogItem | null>(null)
  const liveRow = list.items.find(item => item.productId === selectedId) ?? null
  const shownRow = liveRow ?? snapshot
  const rowMissing = selectedId !== null && liveRow === null

  const [action, setAction] = useState<ProductCatalogAction>('approve')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [writeError, setWriteError] = useState<{
    message: string
    variant: 'warning' | 'error'
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const write = useWriteProductCatalog()

  const openDrawer = useCallback((row: ProductCatalogItem) => {
    setSelectedId(row.productId)
    setSnapshot(row)
    // 막힌 행을 여는 이유는 대개 재개다. 막음이 없으면 되돌릴 수 없는 중지를 미리 고르지 않는다.
    setAction(row.adminSaleSuspended ? 'resume' : 'approve')
    setReason('')
    setWriteError(null)
  }, [])

  function resetSelection() {
    setSelectedId(null)
    setSnapshot(null)
    setConfirmOpen(false)
    setWriteError(null)
  }

  // 요청이 떠 있는 동안에는 드로어도 확인 Modal도 닫지 않는다 — DS는 ESC·스크림·취소를 모두
  // `onClose` 하나로 보내므로, 확인 버튼만 잠그면 ESC 한 번에 화면이 비고 되돌릴 수 없는 처리의
  // 결과를 알릴 자리가 사라진다.
  function closeDrawer() {
    if (write.isPending) return
    resetSelection()
  }

  function closeConfirm() {
    if (write.isPending) return
    setConfirmOpen(false)
  }

  // 닫기 가드는 `onClose`만 막는다 — 라우트 이탈·새로고침은 그 가드를 지나가지 않는다.
  usePendingWriteExitGuard(write.isPending)

  /** 사유를 처리마다 비운다 — 셀러에게 보이는 반려 사유와 내부 기록용 중지 사유가 섞이면 안 된다. */
  function changeAction(next: ProductCatalogAction) {
    setAction(next)
    setReason('')
  }

  const reasonRequired = action === 'reject' || action === 'suspend'
  // 조회가 실패한 동안에는 처리를 잠근다(AGENTS 6-7) — 재조회 실패에도 직전 데이터가 남아 있어
  // 낡은 행으로 되돌릴 수 없는 전이를 지시하게 된다. 상세를 여는 읽기 버튼은 잠그지 않는다.
  const writeLocked = list.isError || rowMissing
  const canSubmit =
    shownRow !== null && !writeLocked && !write.isPending && (!reasonRequired || reason.trim() !== '')

  function submit() {
    if (!shownRow || !canSubmit) return
    const meta = actionMeta[action]
    setWriteError(null)
    write.mutate(
      { productId: shownRow.productId, action, reason },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          setReason('')
          // 창을 닫지 않는다 — 재개는 결과 상태가 재고·셀러 설정에 달려 있어 운영자가 바뀐 행을
          // 그 자리에서 봐야 한다(무효화 재조회가 같은 행을 새로 채운다).
          setToast(meta.message)
        },
        onError: requestError => {
          setConfirmOpen(false)
          // 낡은 화면(409·사라진 상품)은 경고다 — 돌아온 최신 행을 보고 다시 고르면 된다.
          // 그 밖의 실패는 오류다(요청이 서버에 닿지 못했거나 권한이 없다).
          setWriteError({
            message: writeErrorMessage(requestError, action),
            variant: isStaleWrite(requestError) ? 'warning' : 'error',
          })
        },
      },
    )
  }

  const columns = useMemo(() => makeColumns(openDrawer), [openDrawer])
  const actionOptions = shownRow
    ? actionsFor(shownRow).map(value => ({
        value,
        label: actionMeta[value].label,
        caption: actionMeta[value].caption,
      }))
    : []
  const confirmMeta = actionMeta[action]

  return (
    <div className="p-6">
      <PageIntro
        title="상품 카탈로그 관리"
        description="플랫폼 전체 상품을 보고 노출과 판매를 관리해요. 검수 판정 대기열은 AI 검수 큐에 있어요."
      />

      {/* 목록 실패를 빈 상태로 떨어뜨리지 않는다 — 상품 없음과 못 불러옴이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          aria-label="검수 상태 필터"
          options={inspectionFilterOptions}
          value={inspectionFilter}
          onChange={next => {
            setInspectionFilter(next as ProductCatalogInspectionStatus | typeof ALL)
            setPage(0)
          }}
        />
        <FilterSelect
          aria-label="판매 상태 필터"
          options={saleFilterOptions}
          value={saleFilter}
          onChange={next => {
            setSaleFilter(next as ProductCatalogSaleStatus | typeof ALL)
            setPage(0)
          }}
        />
        <SearchInput
          value={search}
          onChange={next => {
            setSearch(next)
            setPage(0)
          }}
          placeholder="상품명 / 셀러 상호 검색"
          className="w-64"
        />
        <Checkbox
          checked={blockedOnly}
          label="운영자가 막은 상품만 보기"
          onChange={setBlockedOnly}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={row => row.productId}
        onRowClick={openDrawer}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 상품이 없어요.'}
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-body-sm text-text-tertiary">
        {/* 조회 실패는 0이 아니라 줄표다 — 0건을 그리면 운영자가 상품이 없다고 읽는다. */}
        <span>
          전체{' '}
          <span className="font-semibold tabular-nums text-text-primary">
            {list.isError ? '—' : list.totalCount}
          </span>
          건
        </span>
        {totalPages > 1 && (
          <span className="flex items-center gap-2">
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
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              rightIcon={<ChevronRight className="size-4" />}
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(current => current + 1)}
            >
              다음
            </Button>
          </span>
        )}
      </div>

      {blockedOnly && (
        <p className="mt-1.5 text-caption text-text-tertiary">
          운영자 막음은 서버 조건이 없어 현재 페이지 안에서만 걸러져요.
        </p>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="상품 상세" width="lg">
        {shownRow && (
          <DetailDrawerBody
            subtitle={`${shownRow.productName} / ${sellerLabel(shownRow)}`}
            actions={
              writeLocked ? (
                <p className="text-body-sm text-text-tertiary">
                  {list.isError
                    ? '목록을 다시 불러오지 못해 처리를 잠가 뒀어요. 조회가 되살아나면 처리할 수 있어요.'
                    : '이 상품이 지금 조건의 결과에 없어 처리를 잠가 뒀어요. 필터를 지우고 목록에서 다시 열어 주세요.'}
                </p>
              ) : (
                <Button
                  variant="primary"
                  leftIcon={<Check className="size-4" />}
                  disabled={!canSubmit}
                  onClick={() => setConfirmOpen(true)}
                >
                  제출
                </Button>
              )
            }
          >
            {writeError && <Alert variant={writeError.variant}>{writeError.message}</Alert>}
            {rowMissing && !list.isError && (
              <Alert variant="warning">
                마지막으로 본 내용이에요. 이 상품은 지금 조건의 결과에 없어요.
              </Alert>
            )}

            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={SALE_STATUS_META[shownRow.saleStatus]} />
                  <StatusMetaPill meta={INSPECTION_STATUS_META[shownRow.inspectionStatus]} />
                  {shownRow.adminSaleSuspended && <StatusMetaPill meta={ADMIN_BLOCK_META} />}
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '카테고리', value: shownRow.categoryName },
                  { label: '신고', value: `${shownRow.reportCount}건` },
                  { label: '정가', value: priceLabel(shownRow.regularPrice) },
                  {
                    label: '할인가 설정값',
                    value:
                      shownRow.discountPrice == null ? '없음' : priceLabel(shownRow.discountPrice),
                  },
                  { label: '등록', value: formatWireDateTime(shownRow.createdAt) },
                ]}
              />
              {shownRow.discountPrice != null && (
                <p className="text-caption text-text-tertiary">
                  할인가는 기간 판정을 적용하지 않은 설정값이라 지금 판매가가 아니에요.
                </p>
              )}
            </DrawerSummaryCard>

            {shownRow.adminSaleSuspended && (
              <Alert variant="warning" title="운영자가 판매를 막아 둔 상품이에요">
                <div className="flex flex-col gap-1">
                  <span className="tabular-nums">
                    {formatWireDateTime(shownRow.adminSaleSuspendedAt)}
                  </span>
                  <span>{shownRow.adminSaleSuspendReason ?? '적어 둔 사유가 없어요.'}</span>
                  <span>막아 둔 동안 셀러는 이 상품의 판매 상태를 되돌릴 수 없어요.</span>
                </div>
              </Alert>
            )}

            <DetailField label="처리">
              <DecisionRadioGroup
                name="product-catalog-action"
                value={action}
                onChange={changeAction}
                options={actionOptions}
              />
              {/* 승인·반려는 이 화면이 아니라 검토 큐의 조작이다 — 열린 검토 행이 없으면 서버가
                  409로 거절하고, 그 사실을 미리 알 방법이 이 응답에는 없다. */}
              <p className="text-caption text-text-tertiary">
                검수 승인 / 반려는 관리자 확인을 기다리는 검수 건이 있을 때만 처리돼요. 판정
                대기열은 AI 검수 큐에 있어요.
              </p>
            </DetailField>

            {action === 'reject' && (
              <DetailField label="검수 반려 사유" visibility="visible-to-user">
                <Textarea
                  aria-label="검수 반려 사유"
                  value={reason}
                  onChange={setReason}
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  placeholder="셀러가 무엇을 고쳐야 하는지 적어 주세요."
                />
              </DetailField>
            )}

            {action === 'suspend' && (
              <DetailField label="판매 중지 사유" visibility="internal-only">
                <Textarea
                  aria-label="판매 중지 사유"
                  value={reason}
                  onChange={setReason}
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  placeholder="막는 근거를 적어 주세요."
                />
                <p className="text-caption text-text-tertiary">
                  셀러에게 보내는 문장이 아니라 운영 기록이에요. 판매를 다시 열면 사라져요.
                </p>
              </DetailField>
            )}

            {action === 'resume' && (
              <DetailField label="재개 사유" visibility="internal-only">
                <Textarea
                  aria-label="재개 사유"
                  value={reason}
                  onChange={setReason}
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  placeholder="적지 않아도 재개할 수 있어요."
                />
                <p className="text-caption text-text-tertiary">
                  재개 사유는 어드민 액션 로그에만 남아요.
                </p>
              </DetailField>
            )}
          </DetailDrawerBody>
        )}
      </Drawer>

      {shownRow && (
        <Modal
          open={confirmOpen}
          onClose={closeConfirm}
          title={confirmMeta.title}
          description={confirmMeta.description}
          confirmLabel={confirmMeta.confirmLabel}
          confirmVariant={confirmMeta.confirmVariant}
          loading={write.isPending}
          onConfirm={submit}
        >
          <SummaryGrid
            items={[
              { label: '대상 상품', value: shownRow.productName },
              { label: '셀러', value: sellerLabel(shownRow) },
              ...(reason.trim() === '' ? [] : [{ label: '사유', value: reason.trim() }]),
            ]}
          />
        </Modal>
      )}

      {/* 처리가 실제로 서버에 들어가므로 성공은 성공 토스트다(목업 시절의 경고 토스트를 되살리지
          말 것). 실패는 드로어 안 Alert가 맡는다 — 창을 닫지 않아 바뀐 행과 함께 읽힌다. */}
      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

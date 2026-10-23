import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  SearchInput,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { AdminReviewReason, type AdminReviewState } from '@aechak/api'
import {
  DECISION_NOTE_MAX_LENGTH,
  DEFAULT_PAGE_SIZE,
  PipelineFlow,
  REASON_FILTER_VALUES,
  STATE_FILTER_VALUES,
  ViolationList,
  adminDecisionMeta,
  appealMeta,
  decisionErrorMessage,
  detailErrorMessage,
  formatWaitingTime,
  formatWireDateTime,
  isDecidable,
  isDecisionReady,
  judgmentMeta,
  listErrorMessage,
  productStatusMeta,
  reasonMeta,
  stateMeta,
  useAiReviewQueue,
  useAiReviewQueueDetail,
  useDecideInspection,
  type InspectionDecision,
  type QueueRowView,
} from '@/features/ai-review-queue'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

export const Route = createFileRoute('/products/ai-queue')({
  component: AiReviewQueuePage,
})

const ALL = 'all'

const PAGE_DESCRIPTION =
  'AI 검수가 사람 판단을 요청한 건을 확인하고 노출 허용 / 차단을 결정해요.'

const stateFilterOptions = [
  { value: ALL, label: '처리 상태 전체' },
  ...STATE_FILTER_VALUES.map(value => ({ value, label: stateMeta(value).label })),
]

const reasonFilterOptions = [
  { value: ALL, label: '등재 사유 전체' },
  ...REASON_FILTER_VALUES.map(value => ({ value, label: reasonMeta(value).label })),
]

// 대상 종류 필터를 두지 않는 이유: 서버가 targetType을 받긴 하지만 큐에 쌓이는 것은 PRODUCT뿐이다
// (리뷰 검수에는 어드민 경로가 없다). REVIEW를 고르면 늘 0건이라 고를 수 있는 값이 하나인
// 셀렉트가 되고, 그건 AGENTS가 금지한 장식 UI다. 리뷰 큐가 생기면 여기에 더한다.

const decisionModalMeta: Record<
  InspectionDecision,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    message: string
  }
> = {
  allow: {
    title: '이 내용을 허용할까요?',
    description:
      '허용하면 상품이 다시 노출되고, 같은 내용에 대한 이후 AI 판정이 이 결정을 뒤집지 못해요.',
    confirmLabel: '허용',
    confirmVariant: 'primary',
    message: '검수를 허용했어요.',
  },
  block: {
    title: '이 내용을 차단할까요?',
    description:
      '차단하면 상품이 비노출로 굳고, 셀러가 내용을 고쳐 재검수가 통과해도 되살아나지 않아요.',
    confirmLabel: '차단',
    confirmVariant: 'danger',
    message: '검수를 차단했어요.',
  },
}

function makeQueueColumns(
  onOpenDetail: (row: QueueRowView) => void,
  now: number,
): Column<QueueRowView>[] {
  return [
    {
      key: 'inspectionId',
      label: '검수 ID',
      render: row => (
        <RowLinkButton numeric onClick={() => onOpenDetail(row)}>
          {row.inspectionId}
        </RowLinkButton>
      ),
    },
    {
      // 등재 사유 + 걸린 인용구를 한 칸에 둔다. pill 아래 보조 텍스트가 붙는 컬럼은
      // center를 쓰면 pill과 좌측이 어긋난다(AGENTS DataTable 규칙) — left로 둔다.
      key: 'reason',
      label: '등재 사유',
      render: row => (
        <div className="space-y-1">
          <StatusMetaPill meta={reasonMeta(row.reason)} />
          {row.reasonSummary && (
            <p className="line-clamp-1 pl-2.5 text-caption text-text-tertiary">
              {row.reasonSummary}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'judgment',
      label: 'AI 판정',
      align: 'center',
      render: row => <StatusMetaPill meta={judgmentMeta(row.judgment)} />,
    },
    {
      key: 'productName',
      label: '상품',
      render: row => (
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium text-text-primary">{row.productName ?? '—'}</p>
          <p className="truncate text-caption text-text-tertiary">
            {[row.storeName, row.productId].filter(Boolean).join(' / ') || '상품 정보 없음'}
          </p>
        </div>
      ),
    },
    {
      key: 'productInspectionStatus',
      label: '노출',
      align: 'center',
      render: row => <StatusMetaPill meta={productStatusMeta(row.productInspectionStatus)} />,
    },
    {
      key: 'waitingSince',
      label: '대기 시간',
      align: 'right',
      render: row => (
        <span className="tabular-nums">{formatWaitingTime(row.waitingSince, now)}</span>
      ),
    },
    {
      key: 'state',
      label: '처리 상태',
      render: row => (
        <div className="flex flex-wrap items-center gap-1">
          <StatusMetaPill meta={stateMeta(row.state)} />
          {row.appealState && <StatusMetaPill meta={appealMeta(row.appealState)} />}
        </div>
      ),
    },
  ]
}

function AiReviewQueuePage() {
  const [stateFilter, setStateFilter] = useState<AdminReviewState | typeof ALL>('OPEN')
  const [reasonFilter, setReasonFilter] = useState<AdminReviewReason | typeof ALL>(ALL)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { rows, totalCount, dataUpdatedAt, isLoading, isError, error } = useAiReviewQueue({
    state: stateFilter === ALL ? null : stateFilter,
    reason: reasonFilter === ALL ? null : reasonFilter,
    page,
  })

  // 대기 시간 기준 시각은 목록을 받은 시각이다. Date.now()를 렌더에서 읽으면 값이 매 렌더
  // 달라져 컬럼 정의가 계속 새로 만들어지고(rows도 매 렌더 새 배열이라 useMemo로 못 막는다),
  // 표가 통째로 다시 그려진다. 라벨이 분 단위라 재조회 간격만큼의 오차는 보이지 않는다.
  const now = dataUpdatedAt

  // 상품명·상품 id·검수 id 검색은 서버 파라미터가 없다(state·reason·targetType·page·size뿐) —
  // 현재 페이지 안에서만 거르고 그 사실을 표 아래 안내로 밝힌다.
  const filtered = useMemo(() => {
    const keyword = search.trim()
    if (keyword === '') return rows
    return rows.filter(row =>
      [row.productName, row.productId, String(row.inspectionId)]
        .filter((value): value is string => value != null)
        .some(value => value.includes(keyword)),
    )
  }, [rows, search])

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))
  const lastPage = totalPages - 1
  // 마지막 페이지의 유일한 건을 처리하면 재조회 결과에 그 페이지가 없어져 빈 목록에 갇힌다 —
  // 조회 중에는 totalCount가 0이라 페이지가 잘못 접히므로 응답이 온 뒤에만 보정한다.
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage)
  }, [isLoading, isError, page, lastPage])

  function changeStateFilter(next: string) {
    setStateFilter(next as AdminReviewState | typeof ALL)
    setPage(0)
  }

  function changeReasonFilter(next: string) {
    setReasonFilter(next as AdminReviewReason | typeof ALL)
    setPage(0)
  }

  // 선택 상태를 목록 행에서 찾지 않고 여기서 들고 있는 이유: 결정이 204 + 무효화로 반영되므로
  // 재조회로 행이 현재 페이지·필터에서 빠지는 순간 selected가 사라져 Drawer가 닫힌다 —
  // 409 안내를 띄운 채 바뀐 상태를 보여 주는 동작이 바로 그 경로에서 깨진다.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRow, setSelectedRow] = useState<QueueRowView | null>(null)
  const detailQuery = useAiReviewQueueDetail(selectedId)
  const detail = detailQuery.detail

  const [decision, setDecision] = useState<InspectionDecision>('allow')
  const [note, setNote] = useState('')
  const [seededId, setSeededId] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // 결정·메모는 상세가 도착한 뒤 1회만 시드한다. 재시딩하면 결정 직후 무효화로 상세가 다시
  // 올 때 운영자가 고른 값이 되돌아간다.
  useEffect(() => {
    if (!detail || seededId === detail.inspectionId) return
    setDecision('allow')
    setNote(detail.adminNote ?? '')
    setSeededId(detail.inspectionId)
  }, [detail, seededId])

  const openDrawer = useCallback((row: QueueRowView) => {
    setSelectedId(row.inspectionId)
    setSelectedRow(row)
    setSeededId(null)
    setDecisionError(null)
  }, [])

  function closeDrawer() {
    setSelectedId(null)
    setSelectedRow(null)
    setSeededId(null)
    setConfirmOpen(false)
    setDecisionError(null)
  }

  const decide = useDecideInspection()

  function submitDecision() {
    if (!detail) return
    setDecisionError(null)
    const meta = decisionModalMeta[decision]
    decide.mutate(
      { inspectionId: detail.inspectionId, decision, note },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          setToast(meta.message)
          closeDrawer()
        },
        onError: requestError => {
          // 409(이미 처리됨·내용이 바뀜)는 무효화로 최신 상태가 되돌아오므로 Drawer를 열어 둔
          // 채 안내만 띄운다 — 운영자가 바뀐 상태를 그 자리에서 본다.
          setConfirmOpen(false)
          setDecisionError(decisionErrorMessage(requestError))
        },
      },
    )
  }

  const queueColumns = useMemo(() => makeQueueColumns(openDrawer, now), [openDrawer, now])

  const decidable = detail ? isDecidable(detail.row.state) : false
  const noteReady = isDecisionReady(decision, note)
  const submitDisabled = !detail || !decidable || !noteReady || decide.isPending

  return (
    <div className="p-6">
      <PageIntro title="AI 검수 큐" description={PAGE_DESCRIPTION} />

      <div className="mb-3.5 flex items-center justify-between gap-4">
        <FilterBar>
          <FilterSelect
            narrow
            aria-label="처리 상태 필터"
            options={stateFilterOptions}
            value={stateFilter}
            onChange={changeStateFilter}
          />
          <FilterSelect
            aria-label="등재 사유 필터"
            options={reasonFilterOptions}
            value={reasonFilter}
            onChange={changeReasonFilter}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="상품명 / 상품 ID / 검수 ID 검색"
            className="w-64"
          />
        </FilterBar>
      </div>

      {isError && (
        <Alert variant="error" className="mb-3.5">
          {listErrorMessage(error)}
        </Alert>
      )}

      {/* 셀러 이의 필터는 서버가 이의 축으로 번역해 돌려준다 — 그 행의 등재 사유는
          최초 이유(과탐 의심 등)로 남아 있어 '셀러 이의'가 아닐 수 있다. 그 사실을 적지 않으면
          운영자가 필터가 고장 났다고 읽는다. */}
      {reasonFilter === AdminReviewReason.SELLER_APPEAL && (
        <Alert variant="info" className="mb-3.5">
          이의가 걸린 건 전부를 보여 줘요. 등재 사유는 처음 큐에 올라온 까닭이 남아 있어 셀러
          이의가 아닐 수 있어요.
        </Alert>
      )}

      <DataTable
        columns={queueColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 검수 건이 없어요."
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-body-sm text-text-tertiary">
        <span>
          전체 <span className="font-semibold tabular-nums text-text-primary">{totalCount}</span>건
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

      {search.trim() !== '' && (
        <p className="mt-1.5 text-caption text-text-tertiary">
          상품명 / 상품 ID / 검수 ID 검색은 서버 조건이 없어 현재 페이지 안에서만 걸러져요.
        </p>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="AI 검수 상세" width="lg">
        {detailQuery.isLoading && (
          <p className="text-body-sm text-text-tertiary">
            {selectedRow
              ? `검수 ${selectedRow.inspectionId} 상세를 불러오는 중이에요.`
              : '상세를 불러오는 중이에요.'}
          </p>
        )}

        {detailQuery.isError && <Alert variant="error">{detailErrorMessage(detailQuery.error)}</Alert>}

        {detail && (
          <DetailDrawerBody
            subtitle={`검수 ${detail.inspectionId} / ${detail.row.productName ?? '상품 정보 없음'}`}
            // DetailDrawerBody는 하단 액션 바를 늘 그린다 — 결정 불가 상태에서 actions를 비우면
            // 빈 구분선만 남으므로, 버튼이 섰을 자리에 왜 처리할 수 없는지를 대신 놓는다.
            actions={
              decidable ? (
                <Button
                  variant="primary"
                  leftIcon={<Check className="size-4" />}
                  disabled={submitDisabled}
                  onClick={() => setConfirmOpen(true)}
                >
                  제출
                </Button>
              ) : (
                <p className="text-body-sm text-text-tertiary">
                  이미 처리된 검수라 허용 / 차단을 다시 결정할 수 없어요. 셀러 이의가 들어오거나
                  새 판정이 큐에 올라오면 그때 다시 결정할 수 있어요.
                </p>
              )
            }
          >
            {decisionError && <Alert variant="warning">{decisionError}</Alert>}

            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={reasonMeta(detail.row.reason)} />
                  <StatusMetaPill meta={judgmentMeta(detail.row.judgment)} />
                  <StatusMetaPill meta={stateMeta(detail.row.state)} />
                  {detail.row.appealState && (
                    <StatusMetaPill meta={appealMeta(detail.row.appealState)} />
                  )}
                  {detail.row.adminDecision && (
                    <StatusMetaPill meta={adminDecisionMeta(detail.row.adminDecision)} />
                  )}
                </>
              }
            >
              <p className="break-keep text-body-sm text-text-secondary">
                {reasonMeta(detail.row.reason).hint ?? '등재 사유가 기록되지 않았어요.'}
              </p>
              <SummaryGrid
                items={[
                  { label: '스토어', value: detail.row.storeName ?? '—' },
                  { label: '상품 ID', value: detail.row.productId ?? '—' },
                  {
                    label: '상품 노출',
                    value: productStatusMeta(detail.row.productInspectionStatus).label,
                  },
                  { label: '대기 시작', value: formatWireDateTime(detail.row.waitingSince) },
                ]}
              />
            </DrawerSummaryCard>

            {/* 위반이 이 화면의 핵심이라 흐름보다 먼저 둔다 — 분류 / 원문 인용 / 수정 제안. */}
            <DetailField label="위반 상세">
              <ViolationList rows={detail.violationRows} />
            </DetailField>

            <DetailField label="파이프라인 흐름">
              <PipelineFlow stages={detail.stages} />
            </DetailField>

            {detail.appealReason && (
              <DetailField label="셀러 이의 사유" visibility="visible-to-user">
                <p className="whitespace-pre-wrap break-keep text-body-sm text-text-primary">
                  {detail.appealReason}
                </p>
              </DetailField>
            )}

            {detail.adminDecidedAt && (
              <DetailField label="앞선 사람 결정">
                <SummaryGrid
                  items={[
                    {
                      label: '결정',
                      value: adminDecisionMeta(detail.row.adminDecision).label,
                    },
                    { label: '결정 시각', value: formatWireDateTime(detail.adminDecidedAt) },
                    // 운영자 닉네임이 이 응답에 없어 내부 숫자 id를 그대로 적는다(지어내지 않는다).
                    { label: '결정한 운영자 ID', value: detail.adminDecidedBy ?? '—' },
                    { label: '남긴 메모', value: detail.adminNote ?? '—' },
                  ]}
                />
              </DetailField>
            )}

            {decidable && (
              <DetailField label="결정">
                <DecisionRadioGroup
                  name="ai-inspection-decision"
                  value={decision}
                  onChange={setDecision}
                  options={[
                    { value: 'allow', label: '허용', caption: '노출을 되돌리고 결정을 못 박아요' },
                    { value: 'block', label: '차단', caption: '비노출로 굳혀요 (사유 필수)' },
                  ]}
                />
              </DetailField>
            )}

            {decidable && (
              <DetailField
                label={decision === 'block' ? '차단 사유' : '허용 메모'}
                visibility="internal-only"
              >
                <Textarea
                  aria-label={decision === 'block' ? '차단 사유' : '허용 메모'}
                  value={note}
                  onChange={setNote}
                  maxLength={DECISION_NOTE_MAX_LENGTH}
                  rows={3}
                  placeholder={
                    decision === 'block'
                      ? '왜 차단하는지 적어 주세요. 비워 두면 서버가 거절해요.'
                      : '왜 허용하는지 적어 주세요. 비워 둬도 돼요.'
                  }
                />
              </DetailField>
            )}
          </DetailDrawerBody>
        )}
      </Drawer>

      {detail && (
        <Modal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          confirmVariant={decisionModalMeta[decision].confirmVariant}
          loading={decide.isPending}
          onConfirm={submitDecision}
        >
          <SummaryGrid
            items={[
              { label: '검수', value: detail.inspectionId },
              { label: '상품', value: detail.row.productName ?? '—' },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="success" />}
    </div>
  )
}

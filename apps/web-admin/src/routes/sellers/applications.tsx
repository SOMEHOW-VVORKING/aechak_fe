import { useCallback, useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, Check, ChevronLeft, ChevronRight, Clock, FileEdit, Loader, XCircle } from 'lucide-react'
import {
  Alert,
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
import type { SellerApplicationStatus } from '@aechak/domain'
import {
  DEFAULT_PAGE_SIZE,
  REJECTION_REASON_DIRECT,
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_OPTIONS,
  STATUS_FILTER_VALUES,
  decisionErrorMessage,
  detailErrorMessage,
  formatWireDate,
  isDecidable,
  isRejectionReasonReady,
  listErrorMessage,
  toRejectionReasonDraft,
  toRejectionReasonText,
  useDecideApplication,
  usePendingApplicationCount,
  useSellerApplicationDetail,
  useSellerApplications,
  type ApplicationDecision,
  type ApplicationRowView,
  type RejectionReasonDraft,
} from '@/features/seller-applications'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { HistoryList } from '@/shared/components/HistoryList'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { SellerTypePill, sellerTypeLabel } from '@/shared/components/SellerTypePill'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

export const Route = createFileRoute('/sellers/applications')({
  component: SellerApplicationsPage,
})

// BE ApplicationStatus 1:1. reviewing/cancelled는 서버에 전이 코드가 없어 생기지 않는 값이지만
// 응답에 실릴 수 있으니 표시용으로는 6값을 다 채운다 — 필터 탭은 STATUS_FILTER_VALUES만 쓴다
// (draft는 셀러가 작성 중인 신청서로 실제 목록에 실리므로 필터에 남는다).
const statusMeta: Record<SellerApplicationStatus, StatusMeta> = {
  draft: { label: '작성 중', variant: 'muted', icon: FileEdit },
  submitted: { label: '심사 대기', variant: 'neutral', icon: Clock },
  reviewing: { label: '심사 중', variant: 'info', icon: Loader },
  approved: { label: '승인', variant: 'success', icon: Check },
  rejected: { label: '반려', variant: 'error', icon: XCircle },
  cancelled: { label: '신청 취소', variant: 'muted', icon: Ban },
}

const decisionModalMeta: Record<
  ApplicationDecision,
  {
    title: string
    description: string
    confirmLabel: string
    confirmVariant: 'primary' | 'danger'
    message: string
  }
> = {
  approve: {
    title: '입점을 승인할까요?',
    description: '승인 즉시 셀러 어드민이 활성화되고 신청자에게 통보돼요.',
    confirmLabel: '승인',
    confirmVariant: 'primary',
    message: '입점을 승인했어요.',
  },
  reject: {
    title: '신청을 반려할까요?',
    description: '반려 사유가 신청자에게 통보돼요. 신청자는 보완 후 다시 제출할 수 있어요.',
    confirmLabel: '반려',
    confirmVariant: 'danger',
    message: '신청을 반려했어요.',
  },
}

const ALL = 'all'

const statusFilterOptions = [
  { value: ALL, label: '전체 상태' },
  ...STATUS_FILTER_VALUES.map(value => ({ value, label: statusMeta[value].label })),
]

const typeFilterOptions = [
  { value: ALL, label: '판매자 유형' },
  { value: 'business', label: '사업자' },
  { value: 'individual', label: '개인' },
]

// 목록에 사업자번호 컬럼이 없는 이유: 목록 응답(AdminApplicationSummary)에 사업자등록번호가
// 아예 없다. 행마다 상세를 부르지 않으면 채울 수 없는 값이라 컬럼과 번호 검색 조건을 뺐고,
// 사업자등록번호는 상세 Drawer에서 평문을 마스킹해 보여 준다.
function makeApplicationColumns(
  onOpenDetail: (row: ApplicationRowView) => void,
): Column<ApplicationRowView>[] {
  return [
    {
      key: 'applicantName',
      label: '신청자',
      render: row => (
        <RowLinkButton onClick={() => onOpenDetail(row)}>{row.applicantName}</RowLinkButton>
      ),
    },
    {
      key: 'sellerType',
      label: '판매자 유형',
      align: 'center',
      render: row => <SellerTypePill sellerType={row.sellerType} />,
    },
    {
      key: 'status',
      label: '심사 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={statusMeta[row.status]} />,
    },
    {
      // 값이 submittedAt이므로 라벨도 '제출일'이다 — 상세 Drawer가 appliedAt을 '신청일'로
      // 보여 주므로, 여기서 같은 라벨을 쓰면 한 신청의 '신청일'이 화면마다 달라진다.
      key: 'submittedAt',
      label: '제출일',
      align: 'right',
      render: row => <span className="tabular-nums">{formatWireDate(row.submittedAt)}</span>,
    },
  ]
}

function SellerApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState<SellerApplicationStatus | typeof ALL>(ALL)
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const { rows, totalCount, isLoading, isError, error } = useSellerApplications({
    status: statusFilter === ALL ? null : statusFilter,
    page,
  })
  const pendingCount = usePendingApplicationCount()

  // 판매자 유형과 신청자 검색은 서버 파라미터가 없다(status·page·size뿐) — 현재 페이지 안에서만
  // 거르고, 그 사실을 표 아래 안내로 밝힌다.
  const filtered = useMemo(
    () =>
      rows.filter(row => {
        if (typeFilter !== ALL && row.sellerType !== typeFilter) return false
        if (search && !row.applicantName.includes(search)) return false
        return true
      }),
    [rows, typeFilter, search],
  )

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))

  // 마지막 페이지의 유일한 신청을 처리하면 재조회 결과에 그 페이지가 없어져 빈 목록에 갇힌다 —
  // 페이지 이동 버튼은 `totalPages > 1`일 때만 그려지므로 되돌아올 수단까지 사라진다.
  // 조회 중에는 totalCount가 0이라 페이지가 잘못 접히므로 응답이 온 뒤에만 보정한다
  // (web-seller 상품 목록이 같은 결함을 같은 방식으로 막는다).
  const lastPage = totalPages - 1
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage)
  }, [isLoading, isError, page, lastPage])

  function changeStatusFilter(next: string) {
    setStatusFilter(next as SellerApplicationStatus | typeof ALL)
    setPage(0)
  }

  // 공용 useDetailList를 쓰지 않는 이유: 그 훅은 `selected`를 목록 행에서 id로 찾고 결정 결과를
  // 로컬 edits로 덮어쓴다(처리 API가 없던 시절의 패턴, 훅 주석에도 "실제 mutation이 붙으면
  // invalidateQueries로 바꾼다"고 적혀 있다). 이 화면은 결정이 204 + 무효화로 반영되므로,
  // 재조회로 행이 현재 페이지·필터에서 빠지는 순간 `selected`가 undefined가 되어 Drawer가
  // 닫힌다 — 409 안내를 띄운 채 바뀐 상태를 보여 주는 동작이 바로 그 경로에서 깨진다.
  // 그래서 선택 상태는 목록과 무관하게 여기서 들고, 상세는 별도 쿼리로 받는다.
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRow, setSelectedRow] = useState<ApplicationRowView | null>(null)
  const detailQuery = useSellerApplicationDetail(selectedId)
  const detail = detailQuery.detail

  const [decision, setDecision] = useState<ApplicationDecision>('approve')
  const [reasonDraft, setReasonDraft] = useState<RejectionReasonDraft>({ value: '', text: '' })
  const [seededId, setSeededId] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'info' } | null>(null)

  // 결정/사유는 상세가 도착한 뒤 1회만 시드한다. 재시딩하면 결정 직후 무효화로 상세가 다시
  // 올 때 운영자가 고른 값이 되돌아간다.
  useEffect(() => {
    if (!detail || seededId === detail.applicationId) return
    setDecision(detail.status === 'rejected' ? 'reject' : 'approve')
    setReasonDraft(toRejectionReasonDraft(detail.lastRejectionReason))
    setSeededId(detail.applicationId)
  }, [detail, seededId])

  const openDrawer = useCallback((row: ApplicationRowView) => {
    setSelectedId(row.applicationId)
    setSelectedRow(row)
    setSeededId(null)
    setDecisionError(null)
    setDocumentError(null)
  }, [])

  function closeDrawer() {
    setSelectedId(null)
    setSelectedRow(null)
    setSeededId(null)
    setConfirmOpen(false)
    setDecisionError(null)
    setDocumentError(null)
  }

  const decide = useDecideApplication()

  function submitDecision() {
    if (!detail) return
    setDecisionError(null)
    const meta = decisionModalMeta[decision]
    decide.mutate(
      {
        applicationId: detail.applicationId,
        decision,
        ...(decision === 'reject' ? { reason: toRejectionReasonText(reasonDraft) } : {}),
      },
      {
        onSuccess: () => {
          setConfirmOpen(false)
          setToast({ message: meta.message, variant: 'success' })
          closeDrawer()
        },
        onError: requestError => {
          // 409(이미 처리됨·다른 운영자 선점)는 무효화로 최신 상태가 되돌아오므로 Drawer를
          // 열어 둔 채 안내만 띄운다 — 운영자가 바뀐 상태를 그 자리에서 본다.
          setConfirmOpen(false)
          setDecisionError(decisionErrorMessage(requestError))
        },
      },
    )
  }

  // 빈 탭을 클릭 제스처 안에서 먼저 확보한다. window.open을 await 뒤로 밀면 클릭의 transient
  // activation이 끊겨 브라우저가 팝업으로 보고 차단하고, 반환값을 버리면 운영자에게는 아무
  // 일도 일어나지 않는다. 'noopener'를 세 번째 인자로 주면 핸들이 null로 와서 URL을 채울 수
  // 없으므로(명세), 핸들을 받은 뒤 opener를 직접 끊는다.
  function openDocument(documentType: string) {
    setDocumentError(null)
    const tab = window.open('', '_blank')
    if (!tab) {
      setDocumentError('팝업이 차단돼 서류를 열지 못했어요. 브라우저에서 팝업을 허용하고 다시 눌러 주세요.')
      return
    }
    tab.opener = null
    void fillDocumentTab(tab, documentType)
  }

  async function fillDocumentTab(tab: Window, documentType: string) {
    // downloadUrl은 유효기간 5분짜리 presigned GET이다 — 캐시된 상세의 URL을 열면 403이라
    // 열기 직전에 상세를 다시 조회해 새 URL을 받는다. 재조회가 실패하면 refetch가 isError로
    // 알려 주므로(캐시된 직전 값이 data에 남아 있어도) 만료된 URL을 열지 않고 닫는다.
    try {
      const { detail: fresh, isError } = await detailQuery.refetch()
      if (isError) {
        tab.close()
        setDocumentError('서류 링크를 새로 받지 못했어요. 잠시 후 다시 시도해 주세요.')
        return
      }
      const target = fresh?.documents.find(item => item.documentType === documentType)
      if (!target) {
        tab.close()
        setDocumentError('서류를 찾을 수 없어요. 목록을 다시 불러와 주세요.')
        return
      }
      tab.location.href = target.downloadUrl
    } catch {
      tab.close()
      setDocumentError('서류 링크를 새로 받지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  const applicationColumns = useMemo(() => makeApplicationColumns(openDrawer), [openDrawer])

  const decidable = detail ? isDecidable(detail.status) : false
  const reasonReady = decision === 'approve' || isRejectionReasonReady(reasonDraft)
  const submitDisabled = !detail || !decidable || !reasonReady || decide.isPending

  return (
    <div className="p-6">
      <PageIntro
        title="셀러 입점 심사"
        description="입점 신청을 확인하고 승인 / 반려를 처리해요."
      />

      <div className="mb-3.5 flex items-center justify-between gap-4">
        <FilterBar>
          <FilterSelect
            aria-label="심사 상태 필터"
            options={statusFilterOptions}
            value={statusFilter}
            onChange={changeStatusFilter}
          />
          <FilterSelect
            narrow
            aria-label="판매자 유형 필터"
            options={typeFilterOptions}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="신청자 검색"
            className="w-64"
          />
        </FilterBar>
        <span className="flex-none text-body-sm text-text-tertiary">
          심사 대기{' '}
          <span className="font-semibold tabular-nums text-text-primary">
            {pendingCount ?? '—'}
          </span>
        </span>
      </div>

      {isError && (
        <Alert variant="error" className="mb-3.5">
          {listErrorMessage(error)}
        </Alert>
      )}

      <DataTable
        columns={applicationColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 입점 신청이 없어요."
      />

      <div className="mt-3 flex items-center justify-between gap-3 text-body-sm text-text-tertiary">
        <span>
          전체 <span className="font-semibold tabular-nums text-text-primary">{totalCount}</span>건
          {statusFilter === ALL && ' (작성 중 / 신청 취소 포함)'}
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

      {(typeFilter !== ALL || search !== '') && (
        <p className="mt-1.5 text-caption text-text-tertiary">
          판매자 유형과 신청자 검색은 서버 조건이 없어 현재 페이지 안에서만 걸러져요.
        </p>
      )}

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="입점 신청 상세" width="lg">
        {detailQuery.isLoading && (
          <p className="text-body-sm text-text-tertiary">
            {selectedRow
              ? `${selectedRow.applicantName} 상세를 불러오는 중이에요.`
              : '상세를 불러오는 중이에요.'}
          </p>
        )}

        {detailQuery.isError && (
          <Alert variant="error">{detailErrorMessage(detailQuery.error)}</Alert>
        )}

        {detail && (
          <DetailDrawerBody
            subtitle={`${detail.applicantName} / ${sellerTypeLabel(detail.sellerType)}`}
            // DetailDrawerBody는 하단 액션 바를 늘 그린다 — 결정 불가 상태에서 actions를 비우면
            // 빈 구분선만 남으므로, 버튼이 섰을 자리에 '왜 처리할 수 없는지'를 대신 놓는다.
            // (AC-SELLER-APP-010: 결정 불가 상태에서 '제출' 버튼은 아예 없어야 한다.)
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
                  {statusMeta[detail.status].label} 상태라 승인 / 반려를 처리할 수 없어요. 심사는
                  심사 대기 상태에서만 할 수 있어요.
                </p>
              )
            }
          >
            {decisionError && <Alert variant="warning">{decisionError}</Alert>}
            {documentError && <Alert variant="error">{documentError}</Alert>}

            <DrawerSummaryCard
              pills={
                <>
                  <SellerTypePill sellerType={detail.sellerType} long />
                  <StatusMetaPill meta={statusMeta[detail.status]} />
                </>
              }
            >
              {/* 연락처 칸이 없는 이유: 상세 응답(AdminApplicationDetailResponse)에 전화번호가
                  없다. 목록에도 없어 어느 화면에서도 만들어 낼 수 없는 값이라 칸째로 뺐다. */}
              <SummaryGrid
                items={[
                  { label: '대표자', value: detail.representativeNameMasked ?? '—' },
                  { label: '사업자번호', value: detail.businessRegNoMasked ?? '미보유' },
                  { label: '신청일', value: formatWireDate(detail.appliedAt) },
                  { label: '제출일', value: formatWireDate(detail.submittedAt) },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="제출 서류">
              {detail.documents.length === 0 ? (
                <p className="text-body-sm text-text-tertiary">제출된 서류가 없어요.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* 서류 타일은 공용 MediaPlaceholder를 쓰지 않는다 — 저쪽은 비대화형 <div>
                      자리표시자이고, 이 타일은 presigned URL을 여는 실제 버튼이라 역할(button)과
                      접근 가능한 이름이 필요하다. 색·모서리 토큰은 같은 값으로 맞춰 둔다. */}
                  {/* 콜백 파라미터를 document로 지으면 전역 document를 가린다 — doc으로 쓴다. */}
                  {detail.documents.map(doc => {
                    const Icon = doc.icon
                    // 72px 정사각 타일에서는 '사업자등록'+'증'처럼 한국어 라벨이 글자 단위로
                    // 쪼개진다. Drawer가 480px이라 여유가 있으니 폭을 넓히고 break-keep으로
                    // 단어 안에서 끊기지 않게 묶는다.
                    return (
                      <button
                        key={doc.documentType}
                        type="button"
                        onClick={() => openDocument(doc.documentType)}
                        aria-label={`${doc.label} 열기`}
                        className="flex h-[72px] w-[104px] flex-col items-center justify-center gap-1 rounded-md border border-border-subtle bg-surface-sunken px-2 text-center text-icon-muted hover:bg-surface-hover"
                      >
                        <Icon className="size-4" />
                        <span className="break-keep text-caption leading-tight text-text-tertiary">
                          {doc.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-caption text-text-tertiary">
                서류 링크는 5분 뒤 만료돼요. 열 때마다 새 링크를 받아 와요.
              </p>
            </DetailField>

            {/* BE 심사 결정은 승인/반려 2종이다 — 보완 요청은 별도 상태가 아니라 반려(사유 통보)
                후 신청자가 재제출하는 플로우로 흡수됐다(ApplicationStatus 1:1 정리). */}
            {decidable && (
              <DetailField label="심사 결과">
                <DecisionRadioGroup
                  name="application-decision"
                  value={decision}
                  onChange={setDecision}
                  options={[
                    { value: 'approve', label: '승인', caption: '입점 승인 후 셀러 어드민 활성화' },
                    { value: 'reject', label: '반려', caption: '신청 반려 / 사유 통보 후 재제출 유도' },
                  ]}
                />
              </DetailField>
            )}

            {decision === 'reject' && decidable && (
              <DetailField label="반려 사유">
                <Select
                  aria-label="반려 사유"
                  options={REJECTION_REASON_OPTIONS}
                  value={reasonDraft.value}
                  onChange={value => setReasonDraft(current => ({ ...current, value }))}
                  placeholder="사유 선택"
                />
                {reasonDraft.value === REJECTION_REASON_DIRECT && (
                  <Textarea
                    aria-label="반려 사유 직접 입력"
                    value={reasonDraft.text}
                    onChange={text => setReasonDraft(current => ({ ...current, text }))}
                    maxLength={REJECTION_REASON_MAX_LENGTH}
                    rows={3}
                    placeholder="신청자에게 통보할 반려 사유를 입력하세요."
                  />
                )}
              </DetailField>
            )}

            {detail.status === 'rejected' && detail.rejectionReason && (
              <DetailField label="통보된 반려 사유" visibility="visible-to-user">
                <p className="text-body-sm text-text-primary">{detail.rejectionReason}</p>
              </DetailField>
            )}

            {/* 내부 메모 칸이 없는 이유: 어드민 심사 API에 내부 메모를 읽을 필드도 저장할
                엔드포인트도 없다. 입력만 받아 두면 새로고침에 조용히 사라지는 칸이 되므로,
                계약이 생길 때 되살린다. */}

            <DetailField label="심사 이력">
              {/* 서버는 status가 REJECTED가 아니면 rejectionReason을 null로 내리므로, 승인으로
                  끝난 신청의 과거 반려 사유는 reviews[]가 유일한 보관처다 — 이력 줄에 함께 보여
                  주지 않으면 화면에서 영구히 사라진다. */}
              <HistoryList
                items={detail.reviews}
                renderDescription={review => review.rejectionReason}
                emptyLabel="아직 심사 이력이 없어요."
              />
            </DetailField>
          </DetailDrawerBody>
        )}
      </Drawer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={decisionModalMeta[decision].title}
        description={decisionModalMeta[decision].description}
        confirmLabel={decisionModalMeta[decision].confirmLabel}
        confirmVariant={decisionModalMeta[decision].confirmVariant}
        loading={decide.isPending}
        onConfirm={submitDecision}
      />

      {toast && (
        <Toast open onClose={() => setToast(null)} message={toast.message} variant={toast.variant} />
      )}
    </div>
  )
}

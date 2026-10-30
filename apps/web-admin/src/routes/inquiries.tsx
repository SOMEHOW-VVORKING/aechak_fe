import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  AlertTriangle,
  Check,
  CheckCircle,
  Clock,
  CreditCard,
  HelpCircle,
  PauseCircle,
  Store,
  Truck,
  UserCog,
} from 'lucide-react'
import {
  Alert,
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
import {
  INQUIRY_STATUS_LABELS,
  INQUIRY_TYPE_LABELS,
  detailErrorMessage,
  elapsedHoursSince,
  isDelayed,
  listErrorMessage,
  toDateTimeLabel,
  useAdminInquiries,
  useAdminInquiryDetail,
  useWriteInquiry,
  writeErrorMessage,
  type AdminInquiryDetailView,
  type AdminInquiryRow,
  type InquiryStatusValue,
  type InquiryTypeValue,
} from '@/features/inquiries'
import { DecisionRadioGroup } from '@/shared/components/DecisionRadioGroup'
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

// `/admin/inquiries` 넷(목록·상세·답변·상태 전이)이 dev에 올라와 실연동이다(SCRUM-314 / SCRUM-331).
// api 호스트의 `/inquiries`는 구매자 본인 접수 경로라 여기서 부르지 않는다.
export const Route = createFileRoute('/inquiries')({
  component: InquiriesPage,
})

const typeMeta: Record<InquiryTypeValue, StatusMeta> = {
  account: { label: INQUIRY_TYPE_LABELS.account, variant: 'neutral', icon: UserCog },
  'order-payment': {
    label: INQUIRY_TYPE_LABELS['order-payment'],
    variant: 'neutral',
    icon: CreditCard,
  },
  'delivery-claim': {
    label: INQUIRY_TYPE_LABELS['delivery-claim'],
    variant: 'neutral',
    icon: Truck,
  },
  'seller-product': {
    label: INQUIRY_TYPE_LABELS['seller-product'],
    variant: 'neutral',
    icon: Store,
  },
  etc: { label: INQUIRY_TYPE_LABELS.etc, variant: 'neutral', icon: HelpCircle },
}

const statusMeta: Record<InquiryStatusValue, StatusMeta> = {
  received: { label: INQUIRY_STATUS_LABELS.received, variant: 'warning', icon: Clock },
  'in-progress': {
    label: INQUIRY_STATUS_LABELS['in-progress'],
    variant: 'info',
    icon: AlertTriangle,
  },
  done: { label: INQUIRY_STATUS_LABELS.done, variant: 'success', icon: CheckCircle },
  'on-hold': { label: INQUIRY_STATUS_LABELS['on-hold'], variant: 'muted', icon: PauseCircle },
}

const statusFilterOptions: { value: InquiryStatusValue | 'all'; label: string }[] = [
  { value: 'all', label: '답변 상태 전체' },
  { value: 'received', label: statusMeta.received.label },
  { value: 'in-progress', label: statusMeta['in-progress'].label },
  { value: 'done', label: statusMeta.done.label },
  { value: 'on-hold', label: statusMeta['on-hold'].label },
]

const typeFilterOptions: { value: InquiryTypeValue | 'all'; label: string }[] = [
  { value: 'all', label: '문의 유형 전체' },
  ...(Object.keys(typeMeta) as InquiryTypeValue[]).map(value => ({
    value,
    label: typeMeta[value].label,
  })),
]

/** 제출 가능한 결정. 'answer'만 답변 본문을 요구하고 나머지 둘은 상태 전이 경로로 나간다. */
type InquiryDecision = 'answer' | 'in-progress' | 'on-hold'

const decisionModalMeta: Record<
  InquiryDecision,
  { title: string; description: string; confirmLabel: string }
> = {
  answer: {
    title: '답변을 등록할까요?',
    description:
      '등록하면 답변 수신 이메일로 답변이 가고 문의가 답변 완료로 바뀌어요. 답변은 한 번만 등록할 수 있어요.',
    confirmLabel: '답변 등록',
  },
  'in-progress': {
    title: '확인 중으로 옮길까요?',
    description: '답변 없이 상태만 바뀌고 담당 운영자로 기록돼요.',
    confirmLabel: '확인 중',
  },
  'on-hold': {
    title: '보류로 옮길까요?',
    description: '답변 없이 상태만 바뀌고 담당 운영자로 기록돼요.',
    confirmLabel: '보류',
  },
}

/**
 * 서버가 받아 주는 결정만 남긴다 — 나머지는 누르는 즉시 409(120009)로 돌아오므로 고를 수 있게
 * 두지 않는다. **지금과 같은 상태로의 전이도 거절된다**(담당자만 바꿔치기하는 경로를 열지 않는다).
 */
function allowedDecisions(status: InquiryStatusValue): InquiryDecision[] {
  if (status === 'done') return []
  const transitions: InquiryDecision[] = (['in-progress', 'on-hold'] as const).filter(
    target => target !== status,
  )
  return ['answer', ...transitions]
}

function makeInquiryColumns(
  onOpenDetail: (row: AdminInquiryRow) => void,
  now: number,
): Column<AdminInquiryRow>[] {
  return [
    {
      key: 'contentPreview',
      // 문의에 제목 필드가 없다 — 서버가 주는 내용 앞머리가 제목 자리를 쓴다.
      label: '문의 내용',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)}>
            <span className="line-clamp-1">{row.contentPreview}</span>
          </RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.authorNickname}
            {row.authorWithdrawn && ' / 탈퇴'}
          </p>
        </div>
      ),
    },
    {
      key: 'type',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={typeMeta[row.type]} />,
    },
    {
      key: 'receivedAt',
      label: '접수',
      align: 'right',
      render: row => <span className="tabular-nums">{toDateTimeLabel(row.receivedAt)}</span>,
    },
    {
      key: 'elapsed',
      label: '경과',
      align: 'right',
      render: row => (
        <span className={`tabular-nums ${isDelayed(row, now) ? 'font-semibold text-warning-fg' : ''}`}>
          {elapsedHoursSince(row.receivedAt, now)}시간
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
  const [statusFilter, setStatusFilter] = useState<InquiryStatusValue | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<InquiryTypeValue | 'all'>('all')
  const [search, setSearch] = useState('')
  const list = useAdminInquiries({ status: statusFilter, type: typeFilter, keyword: search })

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detail = useAdminInquiryDetail(selectedId)
  const write = useWriteInquiry()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [decision, setDecision] = useState<InquiryDecision>('answer')
  const [answer, setAnswer] = useState('')

  const inquiry = detail.inquiry
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 쓰던 답변이 되돌아간다.
  useEffect(() => {
    if (!inquiry) return
    setDecision('answer')
    setAnswer(inquiry.answer ?? '')
  }, [inquiry?.inquiryId])

  // 경과 시간은 렌더 시각으로 센다 — 한 번 고정하면 화면을 열어 둔 채로 지연 표시가 멈춘다.
  const now = Date.now()
  const allowed = inquiry ? allowedDecisions(inquiry.status) : []
  const needsAnswer = decision === 'answer'
  // 목록·상세 조회가 실패한 동안에는 처리를 잠근다(AGENTS 6-7). **상세도 함께 봐야 한다** —
  // react-query는 재조회가 실패해도 캐시된 상세를 그대로 돌려주므로, 상세만 403이 된 화면은
  // 오류 안내와 살아 있는 제출 버튼을 함께 띄우고 그 낡은 값으로 전이를 지시하게 된다.
  const canSubmit =
    inquiry != null &&
    !write.isPending &&
    !list.isError &&
    !detail.isError &&
    allowed.includes(decision) &&
    (!needsAnswer || answer.trim() !== '')
  const delayedCount = list.rows.filter(row => isDelayed(row, now)).length

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
    if (write.isPending) return
    resetSelection()
  }

  function closeConfirm() {
    if (write.isPending) return
    setConfirmOpen(false)
  }

  function submit() {
    // 같은 버튼을 두 번 눌러도 요청은 한 번만 나간다 — 확인 버튼은 loading으로 잠기지만
    // 두 클릭이 같은 렌더에 겹치는 경로(엔터 연타 등)가 남는다.
    if (!inquiry || write.isPending || !canSubmit) return
    write.mutate(
      needsAnswer
        ? { kind: 'answer', inquiryId: inquiry.inquiryId, answer }
        : { kind: 'status', inquiryId: inquiry.inquiryId, target: decision },
      {
        onSuccess: () => {
          setToast(`${decisionModalMeta[decision].confirmLabel} 처리했어요.`)
          resetSelection()
        },
        onError: error => {
          setToast(writeErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro title="서비스 문의 관리" description="접수된 서비스 문의를 확인하고 답변해요." />

      {/* 목록 실패는 빈 상태로 떨어뜨리지 않는다 — "문의 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value => setStatusFilter(value as InquiryStatusValue | 'all')}
        />
        <FilterSelect
          options={typeFilterOptions}
          value={typeFilter}
          onChange={value => setTypeFilter(value as InquiryTypeValue | 'all')}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="문의 내용 / 이메일 검색"
          className="w-64"
        />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 문의 {list.totalCount}건
          </span>
        )}
        {delayedCount > 0 && (
          <StatusPill variant="warning">
            <Clock className="size-3" />
            24시간 초과 {delayedCount}건
          </StatusPill>
        )}
      </FilterBar>

      <DataTable
        columns={makeInquiryColumns(row => setSelectedId(row.inquiryId), now)}
        rows={list.rows}
        rowKey={row => String(row.inquiryId)}
        onRowClick={row => setSelectedId(row.inquiryId)}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 문의가 없어요.'}
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

      <Drawer open={selectedId !== null} onClose={closeDrawer} title="문의 상세" width="lg">
        {detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">문의 정보를 불러오고 있어요.</p>
        )}
        {detail.isError && (
          <Alert variant="error" title="상세를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {inquiry && (
          <InquiryDetailBody
            inquiry={inquiry}
            allowed={allowed}
            decision={decision}
            onDecisionChange={setDecision}
            answer={answer}
            onAnswerChange={setAnswer}
            canSubmit={canSubmit}
            onSubmitClick={() => setConfirmOpen(true)}
            now={now}
          />
        )}
      </Drawer>

      {inquiry && (
        <Modal
          open={confirmOpen}
          onClose={closeConfirm}
          title={decisionModalMeta[decision].title}
          description={decisionModalMeta[decision].description}
          confirmLabel={decisionModalMeta[decision].confirmLabel}
          onConfirm={submit}
          loading={write.isPending}
        >
          <SummaryGrid
            items={[
              { label: '문의', value: `#${inquiry.inquiryId}` },
              { label: '문의자', value: inquiry.authorNickname },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}

interface InquiryDetailBodyProps {
  inquiry: AdminInquiryDetailView
  allowed: InquiryDecision[]
  decision: InquiryDecision
  onDecisionChange: (value: InquiryDecision) => void
  answer: string
  onAnswerChange: (value: string) => void
  canSubmit: boolean
  onSubmitClick: () => void
  now: number
}

function InquiryDetailBody({
  inquiry,
  allowed,
  decision,
  onDecisionChange,
  answer,
  onAnswerChange,
  canSubmit,
  onSubmitClick,
  now,
}: InquiryDetailBodyProps) {
  const answered = inquiry.status === 'done'
  return (
    <DetailDrawerBody
      subtitle={`#${inquiry.inquiryId} / ${inquiry.authorNickname}`}
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
            <StatusMetaPill meta={statusMeta[inquiry.status]} />
            <StatusMetaPill meta={typeMeta[inquiry.type]} />
            {isDelayed(inquiry, now) && (
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
            { label: '접수 시각', value: toDateTimeLabel(inquiry.receivedAt) },
            { label: '경과', value: `${elapsedHoursSince(inquiry.receivedAt, now)}시간` },
            { label: '답변 수신 이메일', value: inquiry.replyEmail },
            {
              label: '완료 시각',
              value: inquiry.resolvedAt ? toDateTimeLabel(inquiry.resolvedAt) : '-',
            },
          ]}
        />
      </DrawerSummaryCard>

      <DetailField label="문의 내용">
        <p className="break-keep whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
          {inquiry.content}
        </p>
      </DetailField>

      <DetailField label={`이전 문의 / ${inquiry.previousInquiries.length}건`}>
        <HistoryList items={inquiry.previousInquiries} emptyLabel="이전 문의 이력이 없어요." />
      </DetailField>

      <DetailField label="처리 결정">
        {allowed.length === 0 && (
          <Alert variant="info" title="이미 답변이 끝난 문의예요" className="mb-2.5">
            <p>답변은 한 번만 등록되고 완료된 문의는 되돌리지 않아요.</p>
          </Alert>
        )}
        <DecisionRadioGroup<InquiryDecision>
          name="inquiry-decision"
          value={decision}
          onChange={onDecisionChange}
          options={[
            {
              value: 'answer',
              label: '답변 등록',
              caption: allowed.includes('answer')
                ? '답변을 보내고 완료로 바꿈'
                : '이미 답변이 등록됐어요',
              disabled: !allowed.includes('answer'),
            },
            {
              value: 'in-progress',
              label: '확인 중',
              caption: allowed.includes('in-progress')
                ? '답변 없이 담당만 기록'
                : '지금 그 상태예요',
              disabled: !allowed.includes('in-progress'),
            },
            {
              value: 'on-hold',
              label: '보류',
              caption: allowed.includes('on-hold') ? '답변 없이 담당만 기록' : '지금 그 상태예요',
              disabled: !allowed.includes('on-hold'),
            },
          ]}
        />
      </DetailField>

      {/* 답변이 이미 있으면 읽기로만 보여 준다 — 서버가 덮어쓰기를 받지 않는다(409/120008). */}
      {answered ? (
        <DetailField label="등록된 답변" visibility="visible-to-user">
          <p className="break-keep whitespace-pre-wrap rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
            {inquiry.answer ?? '-'}
          </p>
        </DetailField>
      ) : (
        <DetailField label="답변 내용" visibility="visible-to-user">
          <Textarea
            value={answer}
            onChange={onAnswerChange}
            maxLength={1000}
            rows={5}
            placeholder="문의자에게 전달할 답변을 입력하세요."
          />
        </DetailField>
      )}
    </DetailDrawerBody>
  )
}

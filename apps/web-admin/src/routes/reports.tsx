import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Ban,
  Check,
  CheckCircle,
  Clock,
  Image,
  MessageSquare,
  Newspaper,
  User,
} from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Modal,
  Select,
  StatusPill,
  Textarea,
  Toast,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import {
  canHideTarget,
  decideErrorMessage,
  decisionLabel,
  decisionReasonsFor,
  detailErrorMessage,
  listErrorMessage,
  targetTitle,
  toDateTimeLabel,
  useAdminReportDetail,
  useAdminReports,
  useDecideReport,
  REPORT_DECISION_LABELS,
  REPORT_DECISION_REASON_LABELS,
  REPORT_REASON_LABELS,
  REPORT_SANCTION_ACTIONS,
  REPORT_SANCTION_ACTION_LABELS,
  REPORT_SANCTION_REASONS,
  REPORT_SANCTION_REASON_LABELS,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  REPORT_TARGET_TYPES,
  REPORT_TARGET_TYPE_LABELS,
  type AdminReportDetailView,
  type AdminReportRow,
  type ReportDecisionReasonValue,
  type ReportDecisionValue,
  type ReportSanctionActionValue,
  type ReportSanctionReasonValue,
  type ReportStatusValue,
  type ReportTargetTypeValue,
} from '@/features/reports'
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
import { usePendingWriteExitGuard } from '@/shared/hooks/usePendingWriteExitGuard'

// `/admin/reports` 셋(목록·상세·처리)이 dev에 올라와 실연동이다(SCRUM-241).
//
// 목 시절 화면이 서버에 없는 것을 셋 말했고 전부 걷었다. ① "신고자에게 처리 결과가 통보되고" —
// 서버 요청에 있는 것은 `noticeToOwner`이고 그것은 **신고 대상자**에게 쓰는 안내다(신고자에게
// 가는 통보 경로가 없다). ② 그 안내조차 발송되지 않는다 — 플랫폼에 알림 발송 경로가 없어
// 저장되어 상세로 다시 읽히는 기록일 뿐이라, "안내를 보냅니다"로 적으면 거짓이 된다.
// ③ 대상/작성자 검색창 — 서버에 keyword 파라미터가 없다. 메모리 검색으로 남기면 불러온 페이지
// 안에서만 걸러지고 운영자는 걸러진 전체를 봤다고 읽는다(2절 금지의 동작 안 하는 필터).
// 대상 종류는 채팅이 빠져 넷이다(서버 열거가 PRODUCT, REVIEW, USER, SNS_POST다).
export const Route = createFileRoute('/reports')({
  component: ReportsPage,
})

const targetTypeMeta: Record<ReportTargetTypeValue, StatusMeta> = {
  PRODUCT: { label: REPORT_TARGET_TYPE_LABELS.PRODUCT, variant: 'neutral', icon: Image },
  REVIEW: { label: REPORT_TARGET_TYPE_LABELS.REVIEW, variant: 'neutral', icon: MessageSquare },
  USER: { label: REPORT_TARGET_TYPE_LABELS.USER, variant: 'neutral', icon: User },
  SNS_POST: { label: REPORT_TARGET_TYPE_LABELS.SNS_POST, variant: 'neutral', icon: Newspaper },
}

/**
 * 처리 상태 메타 3값.
 *
 * `RECEIVED`가 미처리 신고의 상태라 **대부분의 행이 그 값**이다 — 목 시절 표에는 소문자
 * `sanctioned`·`dismissed` 둘뿐이어서 그대로 실연동하면 거의 모든 행에서 아래 `metaOf`가
 * 떨어지고, 그 자리가 `StatusMetaPill`의 구조분해라 표가 통째로 사라진다.
 */
const statusMeta: Record<ReportStatusValue, StatusMeta> = {
  RECEIVED: { label: REPORT_STATUS_LABELS.RECEIVED, variant: 'warning', icon: Clock },
  DISMISSED: { label: REPORT_STATUS_LABELS.DISMISSED, variant: 'muted', icon: CheckCircle },
  SANCTIONED: { label: REPORT_STATUS_LABELS.SANCTIONED, variant: 'danger', icon: Ban },
}

/** 서버가 열거를 늘린 날 셀이 통째로 터지지 않게 원문으로 떨어진다(`metaOf` 관례). */
const metaOf = <T extends string>(table: Record<T, StatusMeta>, value: T): StatusMeta =>
  (table as Record<string, StatusMeta | undefined>)[value] ?? { label: value, variant: 'neutral' }

/** 모르는 코드는 원문을 그대로 그린다 — 빈 칸으로 두면 사유가 없는 신고로 읽힌다. */
const labelOf = (table: Record<string, string>, value: string): string => table[value] ?? value

const statusFilterOptions = [
  { value: 'all', label: '처리 상태 전체' },
  ...REPORT_STATUSES.map(value => ({ value, label: REPORT_STATUS_LABELS[value] })),
]

const targetFilterOptions = [
  { value: 'all', label: '신고 대상 전체' },
  ...REPORT_TARGET_TYPES.map(value => ({ value, label: REPORT_TARGET_TYPE_LABELS[value] })),
]

const sanctionActionOptions = REPORT_SANCTION_ACTIONS.map(value => ({
  value,
  label: REPORT_SANCTION_ACTION_LABELS[value],
}))

const sanctionReasonOptions = REPORT_SANCTION_REASONS.map(value => ({
  value,
  label: REPORT_SANCTION_REASON_LABELS[value],
}))

/** 서버는 1~365일을 받지만 운영 합의는 세 가지다(회원 관리와 같은 어휘). */
const sanctionPeriodOptions = [
  { value: '7', label: '7일' },
  { value: '14', label: '14일' },
  { value: '30', label: '30일' },
]

type DecisionModalMeta = Record<
  ReportDecisionValue,
  { title: string; description: string; confirmLabel: string; confirmVariant: 'primary' | 'danger' }
>

const decisionModalMeta: DecisionModalMeta = {
  DISMISS: {
    title: '제재 없이 종결할까요?',
    description: '대상과 작성자 계정은 그대로예요. 신고자에게 가는 통보는 없어요.',
    confirmLabel: '제재 없이 종결',
    confirmVariant: 'primary',
  },
  HIDE_TARGET: {
    title: '대상을 비공개로 전환할까요?',
    description: '리뷰가 바로 비노출돼요. 작성자 계정에는 제재가 걸리지 않아요.',
    confirmLabel: '비공개 전환',
    confirmVariant: 'primary',
  },
  SANCTION_ACCOUNT: {
    title: '계정 제재까지 적용할까요?',
    description:
      '대상자 계정에 고른 제재가 걸려요. 대상 글은 그대로 노출되고, 영구 정지와 탈퇴 처리는 되돌릴 수 없어요.',
    confirmLabel: '계정 제재',
    confirmVariant: 'danger',
  },
}

// SNS 게시물은 비공개 전환과 계정 제재가 둘 다 게시물을 운영자 삭제로 지운다. 지운 게시물은 되돌릴 수 없다.
const snsPostDecisionModalMeta: DecisionModalMeta = {
  ...decisionModalMeta,
  HIDE_TARGET: {
    title: '게시물을 삭제할까요?',
    description:
      '작성자가 지운 것과 같이 모두에게서 사라지고 되돌릴 수 없어요. 작성자 계정에는 제재가 걸리지 않아요.',
    confirmLabel: '게시물 삭제',
    confirmVariant: 'danger',
  },
  SANCTION_ACCOUNT: {
    ...decisionModalMeta.SANCTION_ACCOUNT,
    description:
      '대상자 계정에 고른 제재가 걸리고 게시물도 삭제돼요. 삭제한 게시물과 영구 정지, 탈퇴 처리는 되돌릴 수 없어요.',
  },
}

const decisionModalMetaFor = (targetType: ReportTargetTypeValue) =>
  targetType === 'SNS_POST' ? snsPostDecisionModalMeta : decisionModalMeta

function makeReportColumns(
  onOpenDetail: (row: AdminReportRow) => void,
): Column<AdminReportRow>[] {
  return [
    {
      key: 'targetName',
      label: '신고 대상',
      render: row => (
        <div className="min-w-0">
          <RowLinkButton onClick={() => onOpenDetail(row)}>{targetTitle(row)}</RowLinkButton>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.targetOwnerNickname ?? `회원 ${row.targetOwnerUserId}`}
          </p>
        </div>
      ),
    },
    {
      key: 'targetType',
      label: '유형',
      align: 'center',
      render: row => <StatusMetaPill meta={metaOf(targetTypeMeta, row.targetType)} />,
    },
    {
      // **접수** 사유다. 운영자가 고른 처리 사유를 여기 찍으면 신고자가 고른 값으로 읽힌다.
      key: 'reasonCode',
      label: '신고 사유',
      render: row => labelOf(REPORT_REASON_LABELS, row.reasonCode),
    },
    {
      key: 'reportCount',
      label: '누적 신고',
      align: 'right',
      render: row => <span className="tabular-nums">{row.reportCount}건</span>,
    },
    {
      key: 'reportedAt',
      label: '최근 접수',
      align: 'right',
      render: row => <span className="tabular-nums">{toDateTimeLabel(row.reportedAt)}</span>,
    },
    {
      key: 'status',
      label: '처리 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={metaOf(statusMeta, row.status)} />,
    },
  ]
}

function ReportsPage() {
  // 필터는 둘 다 서버 파라미터다 — 메모리 필터를 남기면 불러온 페이지 안에서만 걸러지고 운영자는
  // 걸러진 전체를 봤다고 읽는다. 접수 사유 축은 두지 않는다: 서버에 `reasonCode` 파라미터가 없고,
  // 여덟 값은 대상 종류별 어휘의 합집합이라 옵션으로 깔면 그 종류에 없는 값을 고를 수 있다.
  const [statusFilter, setStatusFilter] = useState<ReportStatusValue | 'all'>('all')
  const [targetFilter, setTargetFilter] = useState<ReportTargetTypeValue | 'all'>('all')
  const list = useAdminReports({ status: statusFilter, targetType: targetFilter })

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedRow = list.rows.find(row => row.rowKey === selectedKey) ?? null
  const detail = useAdminReportDetail(
    selectedRow == null
      ? null
      : { targetType: selectedRow.targetType, reportId: selectedRow.reportId },
  )
  const decide = useDecideReport()
  // 계정 제재는 되돌리기 어려운 처리다 — 요청이 떠 있는 동안 라우트 이탈까지 막아야 결과를
  // 알릴 사람이 남는다(react-query가 언마운트된 관찰자의 호출별 콜백을 실행하지 않는다).
  usePendingWriteExitGuard(decide.isPending)

  const [decision, setDecision] = useState<ReportDecisionValue>('DISMISS')
  const [reasonCode, setReasonCode] = useState('')
  const [sanctionAction, setSanctionAction] = useState('')
  const [sanctionReason, setSanctionReason] = useState('')
  const [sanctionReasonDetail, setSanctionReasonDetail] = useState('')
  const [sanctionPeriod, setSanctionPeriod] = useState('')
  const [noticeToOwner, setNoticeToOwner] = useState('')
  const [internalMemo, setInternalMemo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const report = detail.report
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 고른 값이 되돌아간다.
  useEffect(() => {
    if (!report) return
    setDecision('DISMISS')
    setReasonCode('')
    setSanctionAction('')
    setSanctionReason('')
    setSanctionReasonDetail('')
    setSanctionPeriod('')
    setNoticeToOwner('')
    setInternalMemo('')
    setConfirmOpen(false)
  }, [report?.report.rowKey])

  const reportColumns = useMemo(
    () => makeReportColumns(row => setSelectedKey(row.rowKey)),
    [],
  )

  function closeDrawer() {
    // 요청이 떠 있는 동안에는 드로어도 확인 Modal도 닫지 않는다 — DS는 ESC·스크림·취소를 전부
    // `onClose` 하나로 보내고, 닫히면 react-query가 호출별 콜백을 실행하지 않아 제재는 서버에
    // 들어가고 결과만 사라진다.
    if (decide.isPending) return
    setSelectedKey(null)
    setConfirmOpen(false)
  }

  const hidable = report != null && canHideTarget(report.report.targetType)
  const snsPost = report?.report.targetType === 'SNS_POST'
  const modalMeta = decisionModalMetaFor(report?.report.targetType ?? 'REVIEW')
  const decided = report?.decision ?? null
  const reasonOptions = decisionReasonsFor(decision).map(value => ({
    value,
    label: REPORT_DECISION_REASON_LABELS[value],
  }))
  const needsSanction = decision === 'SANCTION_ACCOUNT'
  const needsSanctionDetail = sanctionReason === 'OTHER'
  const needsPeriod = sanctionAction === 'SUSPEND'

  /**
   * 결정이 바뀌면 그 결정으로 보낼 수 없는 사유는 비운다.
   *
   * `NOT_CONFIRMED`·`FALSE_REPORT`를 고른 채 계정 제재로 옮기면 서버가 400(140003·140004)으로
   * 끊는다 — 고른 값을 들고 있다가 보내는 쪽이 아니라 그 자리에서 비우는 쪽이 맞다.
   */
  function changeDecision(next: ReportDecisionValue) {
    setDecision(next)
    if (!decisionReasonsFor(next).includes(reasonCode as ReportDecisionReasonValue)) {
      setReasonCode('')
    }
  }

  // 조회가 실패·대기 중인 상세로는 쓰기를 만들지 않는다(AGENTS 6-7) — 확인 Modal과 요청 본문이
  // 둘 다 상세 값으로 만들어지므로, 받지 못한 상태로 제출하면 서버에 없는 상태를 보고 처리한다.
  const formReady = report != null && !detail.isError && decided == null
  const canSubmit =
    formReady &&
    !decide.isPending &&
    reasonCode !== '' &&
    (decision !== 'HIDE_TARGET' || hidable) &&
    (!needsSanction ||
      (sanctionAction !== '' &&
        sanctionReason !== '' &&
        (!needsSanctionDetail || sanctionReasonDetail.trim() !== '') &&
        (!needsPeriod || sanctionPeriod !== '')))

  function submit() {
    if (!canSubmit || report == null) return
    const notice = noticeToOwner.trim()
    const memo = internalMemo.trim()
    const detailText = sanctionReasonDetail.trim()
    decide.mutate(
      {
        targetType: report.report.targetType,
        reportId: report.report.reportId,
        body: {
          decision,
          reasonCode: reasonCode as ReportDecisionReasonValue,
          ...(notice === '' ? {} : { noticeToOwner: notice }),
          ...(memo === '' ? {} : { internalMemo: memo }),
          // 제재는 `decision`이 SANCTION_ACCOUNT일 때만 싣는다 — 다른 결정에 실으면 서버가 끊는다.
          ...(needsSanction
            ? {
                sanction: {
                  action: sanctionAction as ReportSanctionActionValue,
                  reasonCode: sanctionReason as ReportSanctionReasonValue,
                  ...(detailText === '' ? {} : { reasonDetail: detailText }),
                  // 기간은 임시 정지에만 싣는다(회원 제재 경로가 400/30802로 끊는다).
                  ...(needsPeriod ? { durationDays: Number(sanctionPeriod) } : {}),
                },
              }
            : {}),
        },
      },
      {
        onSuccess: () => {
          setToast(`${modalMeta[decision].confirmLabel} 처리했어요.`)
          setSelectedKey(null)
          setConfirmOpen(false)
        },
        onError: error => {
          setToast(decideErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro title="신고 제재 관리" description="접수된 신고를 확인하고 제재를 처리해요." />

      {/* 목록 실패를 빈 상태로 떨어뜨리지 않는다 — "신고 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={statusFilterOptions}
          value={statusFilter}
          onChange={value => setStatusFilter(value as ReportStatusValue | 'all')}
        />
        <FilterSelect
          options={targetFilterOptions}
          value={targetFilter}
          onChange={value => setTargetFilter(value as ReportTargetTypeValue | 'all')}
        />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 신고 {list.totalCount}건
          </span>
        )}
      </FilterBar>

      <DataTable
        columns={reportColumns}
        rows={list.rows}
        rowKey={row => row.rowKey}
        onRowClick={row => setSelectedKey(row.rowKey)}
        loading={list.isLoading}
        emptyLabel={
          list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 신고가 없어요.'
        }
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

      <Drawer
        open={selectedRow !== null}
        onClose={closeDrawer}
        title="신고 상세"
        width="lg"
      >
        {selectedRow && detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">신고 내용을 불러오고 있어요.</p>
        )}
        {selectedRow && detail.isError && (
          <Alert variant="error" title="신고를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {report && (
          <DetailDrawerBody
            subtitle={`${report.report.rowKey} / ${toDateTimeLabel(report.report.reportedAt)} 접수`}
            actions={
              // 처리가 끝난 신고에는 제출 버튼을 두지 않는다 — 재처리는 409(140001)라 못 쓰는
              // 버튼이 되고, 운영자는 자기 결정이 반영된 줄 안다.
              decided == null ? (
                <Button
                  variant="primary"
                  leftIcon={<Check className="size-4" />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canSubmit}
                >
                  제출
                </Button>
              ) : null
            }
          >
            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={metaOf(statusMeta, report.report.status)} />
                  <StatusMetaPill meta={metaOf(targetTypeMeta, report.report.targetType)} />
                  <StatusPill variant="neutral">
                    {labelOf(REPORT_REASON_LABELS, report.report.reasonCode)}
                  </StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  {
                    label: '대상자',
                    value: `${report.report.targetOwnerNickname ?? '닉네임 없음'} (${report.report.targetOwnerUserId})`,
                  },
                  { label: '누적 신고', value: `${report.report.reportCount}건` },
                  { label: '신고자', value: `회원 ${report.reporterId}` },
                  // 종류마다 뜻이 다른 값이라(상품은 ULID, 리뷰·사용자는 내부 번호) 무엇인지를
                  // 글자로 앞세운다 — 눌러서 갈 어드민 라우트가 없어 링크로 만들지 않는다.
                  {
                    label: '대상 식별자',
                    // SNS 게시물은 라벨이 길어 publicId가 다음 줄에서 칸 밖으로 넘친다. 글자 단위로 줄을 바꾼다.
                    value: (
                      <span className="break-all">
                        {`${labelOf(REPORT_TARGET_TYPE_LABELS, report.report.targetType)} ${report.report.targetKey}`}
                      </span>
                    ),
                  },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="최근 신고 내용">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {report.reasonText ?? '신고자가 상세 내용을 적지 않았어요.'}
              </p>
            </DetailField>

            <DetailField label={`신고 이력 / ${report.history.length}건`}>
              <HistoryList
                items={report.history}
                renderDescription={item => item.reasonText}
                emptyLabel="신고 이력이 없어요."
              />
            </DetailField>

            {decided ? (
              <DecidedRecord decided={decided} targetType={report.report.targetType} />
            ) : (
              <>
                <DetailField label="제재 결정">
                  <DecisionRadioGroup
                    name="report-decision"
                    value={decision}
                    onChange={changeDecision}
                    options={[
                      {
                        value: 'DISMISS',
                        label: REPORT_DECISION_LABELS.DISMISS,
                        caption: '대상과 계정을 그대로 둠',
                      },
                      {
                        value: 'HIDE_TARGET',
                        label: decisionLabel(report.report.targetType, 'HIDE_TARGET'),
                        // 리뷰와 SNS 게시물이 아닌 대상에 보내면 400(140002)이다 — 고를 수 없게 두고 이유를 적는다.
                        caption: snsPost
                          ? '게시물만 운영자 삭제'
                          : hidable
                            ? '대상만 비노출'
                            : '리뷰와 SNS 게시물 신고에만 걸 수 있어요',
                        disabled: !hidable,
                      },
                      {
                        value: 'SANCTION_ACCOUNT',
                        label: REPORT_DECISION_LABELS.SANCTION_ACCOUNT,
                        caption: snsPost ? '대상자 계정에 제재하고 게시물 삭제' : '대상자 계정에 제재',
                      },
                    ]}
                  />
                </DetailField>

                {/* 계정 제재에서는 '확인 불가'·'허위 신고 반복'이 빠진다 — 대상에게 위반이
                    없었다는 판정이라 제재와 함께 보내면 서버가 끊는다. */}
                <DetailField label="처리 사유">
                  <Select
                    options={reasonOptions}
                    value={reasonCode}
                    onChange={setReasonCode}
                    placeholder="사유 선택"
                  />
                </DetailField>

                {needsSanction && (
                  <DetailField label="제재 조치">
                    <Select
                      options={sanctionActionOptions}
                      value={sanctionAction}
                      onChange={setSanctionAction}
                      placeholder="조치 선택"
                    />
                  </DetailField>
                )}

                {needsSanction && (
                  <DetailField label="제재 사유">
                    <Select
                      options={sanctionReasonOptions}
                      value={sanctionReason}
                      onChange={setSanctionReason}
                      placeholder="사유 선택"
                    />
                  </DetailField>
                )}

                {needsSanction && needsSanctionDetail && (
                  <DetailField label="제재 상세 사유">
                    <Textarea
                      value={sanctionReasonDetail}
                      onChange={setSanctionReasonDetail}
                      maxLength={500}
                      rows={3}
                      placeholder="상세 사유를 입력하세요."
                    />
                  </DetailField>
                )}

                {needsSanction && needsPeriod && (
                  <DetailField label="제재 기간">
                    <Select
                      options={sanctionPeriodOptions}
                      value={sanctionPeriod}
                      onChange={setSanctionPeriod}
                      placeholder="기간 선택"
                    />
                  </DetailField>
                )}

                {/* `visibility`를 달지 않는다 — '사용자 노출'도 '비공개'도 지금은 거짓이다.
                    서버는 이 값을 결정 기록에 저장하고 어드민 상세로 되돌려주기만 한다. */}
                <DetailField label="대상자 안내 문구">
                  <Textarea
                    value={noticeToOwner}
                    onChange={setNoticeToOwner}
                    maxLength={300}
                    rows={3}
                    placeholder="대상자에게 전달할 안내를 입력하세요."
                  />
                  <p className="text-caption text-text-tertiary">
                    처리 기록에 함께 남아요. 플랫폼에 알림 발송 경로가 없어 자동으로 전달되지는
                    않아요.
                  </p>
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
              </>
            )}
          </DetailDrawerBody>
        )}
      </Drawer>

      {report && decided == null && (
        <Modal
          open={confirmOpen}
          onClose={() => {
            if (decide.isPending) return
            setConfirmOpen(false)
          }}
          title={modalMeta[decision].title}
          description={modalMeta[decision].description}
          confirmLabel={modalMeta[decision].confirmLabel}
          confirmVariant={modalMeta[decision].confirmVariant}
          onConfirm={submit}
          loading={decide.isPending}
        >
          <SummaryGrid
            items={[
              { label: '대상', value: targetTitle(report.report) },
              {
                label: '처리 사유',
                value:
                  reasonCode === ''
                    ? '-'
                    : labelOf(REPORT_DECISION_REASON_LABELS, reasonCode),
              },
              ...(decision === 'SANCTION_ACCOUNT'
                ? [
                    {
                      label: '제재',
                      value:
                        sanctionAction === ''
                          ? '-'
                          : `${labelOf(REPORT_SANCTION_ACTION_LABELS, sanctionAction)}${
                              needsPeriod && sanctionPeriod !== '' ? ` / ${sanctionPeriod}일` : ''
                            }`,
                    },
                  ]
                : []),
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}

/**
 * 이미 내려진 결정.
 *
 * 처리가 끝난 신고도 서버가 기록과 함께 돌려주므로 폼 대신 그 기록을 그린다 — 입력을 다시
 * 내주면 운영자가 고친 값이 반영된 줄 알지만 재처리는 409(140001)다.
 */
function DecidedRecord({
  decided,
  targetType,
}: {
  decided: NonNullable<AdminReportDetailView['decision']>
  targetType: ReportTargetTypeValue
}) {
  return (
    <>
      <DetailField label="처리 결정">
        <SummaryGrid
          items={[
            { label: '결정', value: decisionLabel(targetType, decided.decision) },
            { label: '처리 사유', value: labelOf(REPORT_DECISION_REASON_LABELS, decided.reasonCode) },
            { label: '처리 시각', value: toDateTimeLabel(decided.decidedAt) },
          ]}
        />
      </DetailField>

      {decided.reasonDetail != null && (
        <DetailField label="처리 상세 사유">
          <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
            {decided.reasonDetail}
          </p>
        </DetailField>
      )}

      <DetailField label="대상자 안내 문구">
        <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
          {decided.noticeToOwner ?? '입력된 안내 문구가 없어요.'}
        </p>
      </DetailField>

      <DetailField label="내부 메모" visibility="internal-only">
        <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
          {decided.internalMemo ?? '입력된 메모가 없어요.'}
        </p>
      </DetailField>
    </>
  )
}

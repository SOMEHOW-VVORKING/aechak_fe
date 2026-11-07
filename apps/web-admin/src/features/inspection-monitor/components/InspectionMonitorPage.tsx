import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Alert, Button, DataTable, Drawer, FilterBar, StatusPill } from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import type { InspectionJudgment, InspectionProcessingState, InspectionTargetType } from '@aechak/api'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import {
  JUDGMENT_FILTER_VALUES,
  JUDGMENT_META,
  PERSPECTIVE_OUTCOME_META,
  PROCESSING_STATE_FILTER_VALUES,
  PROCESSING_STATE_META,
  TARGET_TYPE_FILTER_VALUES,
  TARGET_TYPE_META,
  detailErrorMessage,
  elapsedMs,
  formatElapsed,
  formatWireDateTime,
  isInProgress,
  isLeaseExpired,
  isUnsettledOutcome,
  listErrorMessage,
  targetLabel,
  type InspectionDetailView,
  type InspectionRowView,
  type PerspectiveCellView,
} from '../inspection-monitor.map'
import {
  ALL,
  DEFAULT_PAGE_SIZE,
  useInspectionDetail,
  useInspectionMonitorList,
} from '../inspection-monitor.queries'
import { useNowTick } from '../useNowTick'

const processingStateOptions = [
  { value: ALL, label: '전체 처리 상태' },
  ...PROCESSING_STATE_FILTER_VALUES.map(value => ({
    value,
    label: PROCESSING_STATE_META[value].label,
  })),
]

const targetTypeOptions = [
  { value: ALL, label: '전체 대상' },
  ...TARGET_TYPE_FILTER_VALUES.map(value => ({ value, label: TARGET_TYPE_META[value].label })),
]

// 판정 축에 "없음"을 넣지 않는다 — 서버 열거에 그 값이 없고, 끼워 넣으면 기한 초과(UNJUDGED)와
// 아직 안 끝난 건이 같은 칸에 섞인다. 판정 전인 건은 처리 상태 필터로 고른다.
const judgmentOptions = [
  { value: ALL, label: '전체 판정' },
  ...JUDGMENT_FILTER_VALUES.map(value => ({ value, label: JUDGMENT_META[value].label })),
]

/** 재시도 칸 — 0은 줄표로 가라앉히고 1회 이상만 눈에 띄게 세운다. */
function AttemptCell({ attempt }: { attempt: number }) {
  if (attempt === 0) return <span className="text-text-tertiary">—</span>
  return <StatusPill variant="warning">{attempt}회</StatusPill>
}

function makeColumns(
  now: number,
  onOpenDetail: (row: InspectionRowView) => void,
): Column<InspectionRowView>[] {
  return [
    {
      key: 'target',
      label: '대상',
      render: row => (
        <RowLinkButton onClick={() => onOpenDetail(row)}>{targetLabel(row)}</RowLinkButton>
      ),
    },
    { key: 'targetType', label: '종류', render: row => TARGET_TYPE_META[row.targetType].label },
    {
      key: 'processingState',
      label: '처리 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={PROCESSING_STATE_META[row.processingState]} />,
    },
    {
      // 처리 상태와 **다른 열**로 둔다. 한 칸에 합치면 종결된 기한 초과·판정 실패가 통과와 같아 보인다.
      key: 'judgment',
      label: '판정',
      align: 'center',
      render: row => <StatusMetaPill meta={JUDGMENT_META[row.judgment]} />,
    },
    {
      key: 'attempt',
      label: '재시도',
      align: 'center',
      render: row => <AttemptCell attempt={row.attempt} />,
    },
    {
      // 서버가 준 숫자가 아니라 화면이 센 값이다(요청 시각부터 지금까지, 종결된 건은 종결까지).
      key: 'elapsed',
      label: '경과',
      align: 'right',
      render: row => <span className="tabular-nums">{formatElapsed(elapsedMs(row, now))}</span>,
    },
    {
      key: 'requestedAt',
      label: '요청 시각',
      align: 'right',
      render: row => <span className="tabular-nums">{formatWireDateTime(row.requestedAt)}</span>,
    },
  ]
}

/**
 * 관점 한 줄. **통과·위반·미검사·기록 없음을 서로 다른 글자와 색으로** 그린다.
 *
 * 이 구분이 이 화면의 핵심이다. 미검사를 통과와 같은 모양으로 두면 운영자는 아무도 보지 않은
 * 내용을 검수가 끝난 것으로 읽고, 기록 없음까지 합치면 파이프라인이 어디서 멈췄는지가 사라진다.
 * 그래서 pill 옆에 뜻을 한 줄로 함께 적는다 — 색만으로 가르면 색을 못 보는 운영자에게는 같은 칸이다.
 */
function PerspectiveRow({ cell }: { cell: PerspectiveCellView }) {
  const meta = PERSPECTIVE_OUTCOME_META[cell.outcome]
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border-subtle p-3">
      <div className="min-w-0 space-y-1">
        <p className="text-body-sm font-medium text-text-primary">{cell.label}</p>
        <p className="text-caption text-text-tertiary">{meta.hint}</p>
        {cell.skipReason && (
          <p className="text-caption text-text-secondary">건너뛴 이유 / {cell.skipReason}</p>
        )}
        {cell.violations && (
          <div className="space-y-1">
            <p className="text-caption text-text-tertiary">위반 상세 원문</p>
            {/*
              서버가 DB의 JSON 칼럼 텍스트를 문자열로 그대로 내려보낸다. 모양은 AI 레포가 쥐고
              있어 파싱해 필드를 꺼내면 그쪽이 바뀌는 날 조용히 빈 칸이 된다 — 원문을 그대로 보여
              주고 판단은 운영자에게 맡긴다.
            */}
            <pre className="max-w-full overflow-x-auto rounded-sm bg-surface-sunken p-2 text-caption text-text-secondary">
              {cell.violations}
            </pre>
          </div>
        )}
      </div>
      <div className="flex-none">
        <StatusMetaPill meta={meta} />
      </div>
    </li>
  )
}

function InspectionDetailBody({ detail, now }: { detail: InspectionDetailView; now: number }) {
  const leaseExpired = isLeaseExpired(detail, now)
  return (
    <DetailDrawerBody
      subtitle={`${targetLabel(detail)} / 검수 ${detail.inspectionId}`}
      actions={
        <p className="text-body-sm text-text-tertiary">
          이 화면은 진행 현황만 봐요. 승인/반려는 AI 검수 큐에서 해요.
        </p>
      }
    >
      <DrawerSummaryCard
        pills={
          <>
            <StatusMetaPill meta={PROCESSING_STATE_META[detail.processingState]} />
            <StatusMetaPill meta={JUDGMENT_META[detail.judgment]} />
          </>
        }
      >
        {/* 판정 넷 가운데 통과가 아닌 것은 뜻을 글자로 덧붙인다 — pill 색만으로는 같은 칸으로 읽힌다. */}
        {JUDGMENT_META[detail.judgment].caption && (
          <p className="text-body-sm text-text-secondary">
            {JUDGMENT_META[detail.judgment].caption}
          </p>
        )}
        {detail.reasonSummary && (
          <p className="text-body-sm text-text-primary">
            <strong>{detail.reasonSummary}</strong>
          </p>
        )}
        {detail.sellerNotice && (
          <p className="text-body-sm text-text-secondary">{detail.sellerNotice}</p>
        )}
        <SummaryGrid
          items={[
            { label: '경과', value: formatElapsed(elapsedMs(detail, now)) },
            { label: '재시도', value: `${detail.attempt}회` },
            { label: '요청 시각', value: formatWireDateTime(detail.requestedAt) },
            { label: '종결 시각', value: formatWireDateTime(detail.settledAt) },
          ]}
        />
      </DrawerSummaryCard>

      {/*
        종결됐는데 통과가 아닌 건을 그 자리에서 한 번 더 말한다. pill 색과 짧은 라벨만으로는
        '종결'이 눈에 먼저 들어와 "끝났으니 됐다"로 읽히는 자리다 — 기한 초과·판정 실패는
        아무도 내용을 끝까지 보지 못한 건이라 통과와 같은 무게로 두면 안 된다.
      */}
      {detail.processingState === 'SETTLED' && isUnsettledOutcome(detail) && (
        <Alert variant="warning">
          종결됐지만 통과가 아니에요. 이 건은 내용이 끝까지 판정되지 않았어요.
        </Alert>
      )}

      <DetailField label="관점별 진행">
        <ul aria-label="관점별 진행" className="space-y-2">
          {detail.perspectives.map(cell => (
            <PerspectiveRow key={cell.perspective} cell={cell} />
          ))}
        </ul>
      </DetailField>

      <DetailField label="대상">
        <SummaryGrid
          items={[
            { label: '종류', value: TARGET_TYPE_META[detail.targetType].label },
            { label: '대상 식별자', value: detail.targetRef },
            { label: '상품 식별자', value: detail.productId ?? '—' },
            { label: '상품명', value: detail.productName ?? '—' },
          ]}
        />
      </DetailField>

      <DetailField label="판정 사유" visibility="visible-to-user">
        <SummaryGrid
          items={[
            { label: '사유 코드', value: detail.reasonCode ?? '—' },
            { label: '셀러 안내', value: detail.sellerNotice ?? '—' },
          ]}
        />
      </DetailField>

      <DetailField label="어느 정책으로 봤는지">
        <SummaryGrid
          items={[
            { label: '정책 버전', value: detail.policyVersion },
            { label: '프롬프트 버전', value: detail.promptVersion ?? '—' },
          ]}
        />
        <p className="mt-1.5 break-all text-caption text-text-tertiary">
          내용 해시 {detail.contentHash}
        </p>
      </DetailField>

      {/*
        멈춘 건을 진단하는 유일한 단서다. 담기는 값은 워커 인스턴스 표식이고 사람에 관한 정보가
        아니라 운영자 전용 경로인 이 자리에 그대로 보여 준다. 목록에는 서버가 싣지 않는다.
      */}
      <DetailField label="처리 중인 워커" visibility="internal-only">
        <SummaryGrid
          items={[
            { label: '워커', value: detail.leaseOwner ?? '—' },
            { label: '점유 만료', value: formatWireDateTime(detail.leaseExpiresAt) },
          ]}
        />
        {leaseExpired && (
          <Alert variant="warning" className="mt-2">
            점유가 이미 풀렸어요. 다음 주기에 다시 발행될 건이에요.
          </Alert>
        )}
      </DetailField>
    </DetailDrawerBody>
  )
}

/**
 * 검수 진행 현황 — **지금 돌고 있는 검수 건 자체**를 본다.
 *
 * 같은 검수 BC에 경로가 셋인데 묻는 것이 서로 다르다.
 *
 * - `/admin/inspections`(이 화면): 검수 건 하나하나의 진행. 판정 전·통과까지 전부 나온다.
 * - `/admin/product-inspections`('AI 검수 큐'): 관리자 확인이 남은 **작업 목록**. 위반 판정 건만
 *   올라오고 승인·반려 조치가 거기에 있다.
 * - `/admin/inspection-metrics`: **집계**. 창이 settled_at 기준이라 끝난 건만 센다(FE 화면 없음).
 *
 * 그래서 "방금 등록한 상품의 검수가 지금 어디까지 왔는지"는 큐로도 지표로도 답할 수 없다. 이
 * 화면에 쓰기가 없는 이유도 같다 — 조치의 자리는 큐이고 여기는 보는 자리다.
 */
export function InspectionMonitorPage() {
  const [processingState, setProcessingState] = useState<
    InspectionProcessingState | typeof ALL
  >(ALL)
  const [targetType, setTargetType] = useState<InspectionTargetType | typeof ALL>(ALL)
  const [judgment, setJudgment] = useState<InspectionJudgment | typeof ALL>(ALL)
  const [page, setPage] = useState(0)

  const { rows, totalCount, isLoading, isFetching, isError, error, pollMs } =
    useInspectionMonitorList({ processingState, targetType, judgment, page })

  const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE))
  const lastPage = totalPages - 1
  // 종결된 건이 늘어 모수가 줄면 열어 둔 페이지가 범위를 넘는다. 응답이 온 뒤에만 보정한다.
  useEffect(() => {
    if (!isLoading && !isError && page > lastPage) setPage(lastPage)
  }, [isLoading, isError, page, lastPage])

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const detailQuery = useInspectionDetail(selectedId)
  const detail = detailQuery.detail

  // 경과 시간을 1초마다 다시 센다. 폴링 주기(3초)에 맡기면 경과가 3초씩 뛰어 흐르지 않는다.
  const now = useNowTick()
  const columns = makeColumns(now, row => setSelectedId(row.inspectionId))
  const hasInProgressRow = rows.some(row => isInProgress(row.processingState))

  return (
    <div className="p-6">
      <PageIntro
        title="AI 검수 모니터링"
        description="지금 돌고 있는 검수 건을 봐요. 대기/처리 중인 건이 위에 오고, 관점별로 통과와 미검사를 가려서 보여줘요."
      />

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={processingStateOptions}
          value={processingState}
          onChange={next => {
            setProcessingState(next as InspectionProcessingState | typeof ALL)
            setPage(0)
          }}
        />
        <FilterSelect
          narrow
          options={targetTypeOptions}
          value={targetType}
          onChange={next => {
            setTargetType(next as InspectionTargetType | typeof ALL)
            setPage(0)
          }}
        />
        <FilterSelect
          options={judgmentOptions}
          value={judgment}
          onChange={next => {
            setJudgment(next as InspectionJudgment | typeof ALL)
            setPage(0)
          }}
        />
        {/*
          갱신 주기를 글자로 밝힌다. 숫자가 저절로 바뀌는 화면에서 "언제 받은 값인지"를 알 수
          없으면 운영자는 멈춘 화면과 조용한 서버를 구별하지 못한다. 표 자체는 직전 데이터를
          들고 있다가 바꾸므로(keepPreviousData) 이 줄만 바뀌고 숫자는 깜빡이지 않는다.
        */}
        <span className="ml-auto flex items-center gap-1.5 text-caption text-text-tertiary">
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching
            ? '갱신 중이에요'
            : hasInProgressRow
              ? `${pollMs / 1000}초마다 갱신해요`
              : `진행 중인 건이 없어 ${pollMs / 1000}초마다 갱신해요`}
        </span>
      </FilterBar>

      {isError && (
        <Alert variant="error" className="mb-3.5">
          {listErrorMessage(error)}
        </Alert>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={row => String(row.inspectionId)}
        onRowClick={row => setSelectedId(row.inspectionId)}
        loading={isLoading}
        emptyLabel="조건에 맞는 검수가 없어요."
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

      <Drawer
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title="검수 진행 상세"
        width="lg"
      >
        {detailQuery.isLoading && (
          <p className="text-body-sm text-text-tertiary">상세를 불러오는 중이에요.</p>
        )}
        {detailQuery.isError && <Alert variant="error">{detailErrorMessage(detailQuery.error)}</Alert>}
        {detail && <InspectionDetailBody detail={detail} now={now} />}
      </Drawer>
    </div>
  )
}

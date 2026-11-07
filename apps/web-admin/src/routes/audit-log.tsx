import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle, Fingerprint, XCircle } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  SearchInput,
  StatusPill,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import {
  listErrorMessage,
  toDateTimeLabel,
  useAdminAuditLogs,
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_RESULTS,
  AUDIT_RESULT_LABELS,
  AUDIT_TARGET_TYPES,
  AUDIT_TARGET_TYPE_LABELS,
  type AdminAuditRow,
  type AuditAction,
  type AuditResult,
  type AuditTargetType,
  type AuditTerm,
} from '@/features/audit-log'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

// `GET /admin/audit-logs`가 dev에 올라와 실연동이다(SCRUM-318). **이 화면은 읽기 전용**이라 쓰기
// 버튼 자체가 없다 — 감사 기록을 운영자가 고칠 수 있으면 기록의 의미가 없다. 상세 엔드포인트는
// 서버에 없고 목록 행이 16필드를 다 들고 오므로 Drawer는 손에 있는 행으로 그린다.
export const Route = createFileRoute('/audit-log')({
  component: AuditLogPage,
})

const resultMeta: Record<AuditResult, StatusMeta> = {
  SUCCESS: { label: AUDIT_RESULT_LABELS.SUCCESS, variant: 'success', icon: CheckCircle },
  FAILURE: { label: AUDIT_RESULT_LABELS.FAILURE, variant: 'error', icon: XCircle },
}

/** 서버가 결과 enum을 늘린 날 셀이 통째로 터지지 않게 원문으로 떨어진다(`metaOf` 관례). */
const resultMetaOf = (value: AuditResult): StatusMeta =>
  (resultMeta as Record<string, StatusMeta | undefined>)[value] ?? {
    label: value,
    variant: 'neutral',
  }

const targetTypeFilterOptions = [
  { value: 'all', label: '대상 종류 전체' },
  ...AUDIT_TARGET_TYPES.map(value => ({ value, label: AUDIT_TARGET_TYPE_LABELS[value] })),
]

const actionFilterOptions = [
  { value: 'all', label: '액션 전체' },
  ...AUDIT_ACTIONS.map(value => ({ value, label: AUDIT_ACTION_LABELS[value] })),
]

const resultFilterOptions = [
  { value: 'all', label: '처리 결과 전체' },
  ...AUDIT_RESULTS.map(value => ({ value, label: AUDIT_RESULT_LABELS[value] })),
]

/** 모르는 코드는 원문을 그리고 그 아래에 모른다고 적는다 — 빈 칸이면 액션이 없는 줄 읽힌다. */
function TermCell({ term, caption }: { term: AuditTerm; caption?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-body-sm text-text-primary">{term.label}</p>
      {term.unknownCode != null && (
        <p className="mt-0.5 text-caption text-warning-fg">화면이 모르는 코드예요</p>
      )}
      {caption != null && <p className="mt-0.5 text-caption text-text-tertiary">{caption}</p>}
    </div>
  )
}

function makeAuditColumns(onOpenDetail: (row: AdminAuditRow) => void): Column<AdminAuditRow>[] {
  return [
    {
      key: 'actedAt',
      label: '시각',
      render: row => (
        <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
          {toDateTimeLabel(row.actedAt)}
        </RowLinkButton>
      ),
    },
    {
      key: 'actorNickname',
      label: '관리자',
      render: row => (
        <div className="min-w-0">
          <p className="text-body-sm text-text-primary">{row.actorNickname ?? '탈퇴한 계정'}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{row.actorRoleLabel}</p>
        </div>
      ),
    },
    {
      key: 'action',
      label: '액션',
      render: row => <TermCell term={row.action} />,
    },
    {
      // 대상 이름이 비는 행(삭제된 대상)은 빈 칸이 아니라 종류+식별자로 읽게 한다. 식별자는 눌러서
      // 갈 어드민 라우트가 하나도 없어 링크로 만들지 않는다.
      key: 'targetLabel',
      label: '대상',
      render: row => (
        <TermCell
          term={{ label: row.targetLabel ?? row.targetIdText, unknownCode: null }}
          caption={row.targetType.label}
        />
      ),
    },
    {
      key: 'clientIp',
      label: '접속 IP',
      align: 'right',
      render: row =>
        row.clientIp == null ? (
          <span className="text-text-tertiary">기록 없음</span>
        ) : (
          <span className="tabular-nums">{row.clientIp}</span>
        ),
    },
    {
      key: 'result',
      label: '결과',
      align: 'center',
      render: row => <StatusMetaPill meta={resultMetaOf(row.result)} />,
    },
  ]
}

function AuditLogPage() {
  // 필터는 전부 서버 파라미터다 — 메모리 필터를 남기면 불러온 페이지 안에서만 걸러지고 운영자는
  // 걸러진 전체를 봤다고 읽는다. 관리자(actorPublicId) 축은 두지 않는다: 이름→publicId를 줄 API가
  // 없어(어드민 명부 응답에 publicId가 없다) 옵션을 만들면 '관리자 전체'가 거짓이 된다.
  const [targetTypeFilter, setTargetTypeFilter] = useState<AuditTargetType | 'all'>('all')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [resultFilter, setResultFilter] = useState<AuditResult | 'all'>('all')
  const [search, setSearch] = useState('')
  const list = useAdminAuditLogs({
    targetType: targetTypeFilter,
    action: actionFilter,
    result: resultFilter,
    keyword: search,
  })

  // 상세 엔드포인트가 없어 손에 있는 행으로 Drawer를 그린다 — 필터·더 보기로 행이 사라지면 닫힌다.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = list.rows.find(row => row.id === selectedId) ?? null

  const recordingSinceLabel =
    list.recordingSince == null ? null : toDateTimeLabel(list.recordingSince)

  /**
   * 빈 목록의 문구가 이 화면에서 가장 크게 거짓말할 자리다.
   *
   * '조건에 맞는 로그가 없어요'만 뜨면 운영자는 "그 관리자는 그 행위를 하지 않았다"로 읽는데,
   * 기록이 어제부터 쌓였다면 그것은 전혀 다른 사실이다. 기록 시작 시각을 못 받았을 때 'null 이후'를
   * 찍지 않고 모른다고 적는 것도 같은 이유다.
   */
  const emptyLabel = list.isError
    ? '목록을 불러오지 못했어요.'
    : recordingSinceLabel == null
      ? '조건에 맞는 로그가 없어요. 기록 시작 시각을 받지 못해 그 전 기간은 알 수 없어요.'
      : `조건에 맞는 로그가 없어요. ${recordingSinceLabel} 이전은 기록 자체가 없어요.`

  return (
    <div className="p-6">
      <PageIntro
        title="어드민 액션 로그"
        description="관리자가 수행한 운영 액션 이력을 조회해요."
      />

      {/* 403을 빈 표로 떨어뜨리면 '권한 없음'이 '기록 없음'으로 보인다 — 감사 화면에서 그 혼동은
          그 자체로 운영 사고다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <FilterBar className="mb-3.5">
        <FilterSelect
          options={targetTypeFilterOptions}
          value={targetTypeFilter}
          onChange={value => setTargetTypeFilter(value as AuditTargetType | 'all')}
        />
        <FilterSelect
          options={actionFilterOptions}
          value={actionFilter}
          onChange={value => setActionFilter(value as AuditAction | 'all')}
        />
        <FilterSelect
          options={resultFilterOptions}
          value={resultFilter}
          onChange={value => setResultFilter(value as AuditResult | 'all')}
          narrow
        />
        {/* 서버 `keyword`가 무엇을 매칭하는지 스펙에 없다 — 범위를 적으면 서버 동작에 대한 거짓
            주장이 되므로 확정 전에는 '검색어'로 둔다. */}
        <SearchInput value={search} onChange={setSearch} placeholder="검색어" className="w-56" />
        {list.totalCount != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            조건에 맞는 로그 {list.totalCount}건
          </span>
        )}
        {recordingSinceLabel != null && (
          <span className="text-body-sm text-text-tertiary tabular-nums">
            {recordingSinceLabel} 이후 기록
          </span>
        )}
      </FilterBar>

      <DataTable
        columns={makeAuditColumns(row => setSelectedId(row.id))}
        rows={list.rows}
        rowKey={row => row.id}
        onRowClick={row => setSelectedId(row.id)}
        loading={list.isLoading}
        emptyLabel={emptyLabel}
      />

      {/* 커서 페이징이라 `더 보기`가 없으면 21번째 이후의 기록은 화면에 존재하지 않는 것이 된다 —
          감사 로그에서 그것은 "그 일이 없었다"로 읽힌다. */}
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
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title="액션 로그 상세"
        width="lg"
      >
        {selected && (
          <div className="space-y-5">
            <p className="-mt-2 text-body-sm text-text-tertiary">
              {selected.id} / {toDateTimeLabel(selected.actedAt)}
            </p>

            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={resultMetaOf(selected.result)} />
                  <StatusPill variant="neutral">{selected.targetType.label}</StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  {
                    label: '관리자',
                    value: `${selected.actorNickname ?? '탈퇴한 계정'} / ${selected.actorRoleLabel}`,
                  },
                  { label: '액션', value: selected.action.label },
                  { label: '대상', value: selected.targetLabel ?? '이름이 남아 있지 않아요' },
                  { label: '접속 IP', value: selected.clientIp ?? '기록 없음' },
                ]}
              />
            </DrawerSummaryCard>

            {/* 실패 행이 왜 실패했는지가 남는 유일한 자리다 — 목 시절에는 산문 `detail`이 그 역할을
                했고 서버에는 그 산문이 없다. */}
            <DetailField label="응답 상태">
              <p className="text-body-sm text-text-primary tabular-nums">
                HTTP {selected.httpStatus} / {resultMetaOf(selected.result).label}
              </p>
            </DetailField>

            {/* 종류마다 뜻이 다른 값이라 무엇인지를 글자로 앞세운다 — 회원 내부 PK와 클레임 ULID가
                같은 종류의 값처럼 읽히면 운영자가 엉뚱한 곳에 붙여 넣는다. */}
            <DetailField label="대상 식별자">
              <p className="break-all text-body-sm text-text-primary tabular-nums">
                {selected.targetIdText}
              </p>
            </DetailField>

            <DetailField label="처리 사유 메모" visibility="internal-only">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.reason ?? '입력된 사유 메모가 없어요.'}
              </p>
            </DetailField>

            <DetailField label="요청 추적 ID" visibility="internal-only">
              <p className="inline-flex items-center gap-1.5 text-body-sm text-text-primary tabular-nums">
                <Fingerprint className="size-3.5 text-icon-muted" />
                {selected.requestId}
              </p>
            </DetailField>
          </div>
        )}
      </Drawer>
    </div>
  )
}

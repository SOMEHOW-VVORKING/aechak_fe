import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle, Fingerprint, XCircle } from 'lucide-react'
import { DataTable, Drawer, FilterBar, SearchInput, StatusPill } from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import { useAdminAuditEntries } from '@/features/audit-log'
import type { AdminAuditEntry, AdminAuditResult } from '@/features/audit-log'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { MockDataNotice } from '@/shared/components/MockDataNotice'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'
import { useDetailList } from '@/shared/hooks/useDetailList'

// 로그 조회 API가 admin 모듈에 없다. 감사 로그는 "비어 있다"와 "조회가 안 된다"를 운영자가
// 구별해야 하는 화면이라 빈 표를 그리면 특히 위험해, 예시 행을 그리고 상단 띠로 못박는다
// (SCRUM-308). **이 화면은 읽기 전용**이라 쓰기 버튼 자체가 없다.
export const Route = createFileRoute('/audit-log')({
  component: AuditLogPage,
})

const resultMeta: Record<AdminAuditResult, StatusMeta> = {
  success: { label: '성공', variant: 'success', icon: CheckCircle },
  failure: { label: '실패', variant: 'error', icon: XCircle },
}

const resultFilterOptions = [
  { value: 'all', label: '처리 결과 전체' },
  ...Object.entries(resultMeta).map(([value, meta]) => ({ value, label: meta.label })),
]

function makeAuditColumns(onOpenDetail: (row: AdminAuditEntry) => void): Column<AdminAuditEntry>[] {
  return [
    {
      key: 'actedAt',
      label: '시각',
      render: row => (
        <RowLinkButton onClick={() => onOpenDetail(row)} numeric>
          {row.actedAt}
        </RowLinkButton>
      ),
    },
    {
      key: 'adminName',
      label: '관리자',
      render: row => (
        <div className="min-w-0">
          <p className="text-body-sm text-text-primary">{row.adminName}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{row.adminRole}</p>
        </div>
      ),
    },
    { key: 'action', label: '액션' },
    {
      key: 'targetName',
      label: '대상',
      render: row => (
        <div className="min-w-0">
          <p className="truncate text-body-sm text-text-primary">{row.targetName}</p>
          <p className="mt-0.5 text-caption text-text-tertiary">{row.targetType}</p>
        </div>
      ),
    },
    {
      key: 'ip',
      label: '접속 IP',
      align: 'right',
      render: row => <span className="tabular-nums">{row.ip}</span>,
    },
    {
      key: 'result',
      label: '결과',
      align: 'center',
      render: row => <StatusMetaPill meta={resultMeta[row.result]} />,
    },
  ]
}

function AuditLogPage() {
  const { data, isLoading } = useAdminAuditEntries()
  // 읽기 전용 화면이라 patchRow·confirm·toast는 쓰지 않는다 — 목록/상세 선택 상태만 가져온다.
  const { items, selected, select, closeDrawer } = useDetailList(data)

  const [adminFilter, setAdminFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('all')
  const [search, setSearch] = useState('')

  const adminFilterOptions = useMemo(
    () => [
      { value: 'all', label: '관리자 전체' },
      ...Array.from(new Set(items.map(row => row.adminName))).map(name => ({
        value: name,
        label: name,
      })),
    ],
    [items],
  )

  const filtered = useMemo(
    () =>
      items.filter(row => {
        if (adminFilter !== 'all' && row.adminName !== adminFilter) return false
        if (resultFilter !== 'all' && row.result !== resultFilter) return false
        if (search && !row.action.includes(search) && !row.targetName.includes(search)) return false
        return true
      }),
    [items, adminFilter, resultFilter, search],
  )

  const openDrawer = (row: AdminAuditEntry) => select(row.id)
  const auditColumns = useMemo(() => makeAuditColumns(openDrawer), [])
  const failureCount = items.filter(row => row.result === 'failure').length

  return (
    <div className="p-6">
      <PageIntro
        title="어드민 액션 로그"
        description="관리자가 수행한 운영 액션 이력을 조회해요."
      />

      <MockDataNotice>
        읽기 전용 화면이에요. 로그 조회 경로가 admin 모듈에 생기면 그대로 실연동돼요.
      </MockDataNotice>

      <FilterBar className="mb-3.5">
        <FilterSelect options={adminFilterOptions} value={adminFilter} onChange={setAdminFilter} />
        <FilterSelect
          options={resultFilterOptions}
          value={resultFilter}
          onChange={setResultFilter}
          narrow
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="액션 / 대상 검색"
          className="w-64"
        />
        {failureCount > 0 && <StatusPill variant="error">실패 {failureCount}건</StatusPill>}
      </FilterBar>

      <DataTable
        columns={auditColumns}
        rows={filtered}
        rowKey={row => row.id}
        onRowClick={openDrawer}
        loading={isLoading}
        emptyLabel="조건에 맞는 로그가 없어요."
      />

      <Drawer open={selected !== undefined} onClose={closeDrawer} title="액션 로그 상세" width="lg">
        {selected && (
          <div className="space-y-5">
            <p className="-mt-2 text-body-sm text-text-tertiary">
              {selected.id} / {selected.actedAt}
            </p>

            <DrawerSummaryCard
              pills={
                <>
                  <StatusMetaPill meta={resultMeta[selected.result]} />
                  <StatusPill variant="neutral">{selected.targetType}</StatusPill>
                </>
              }
            >
              <SummaryGrid
                items={[
                  { label: '관리자', value: `${selected.adminName} (${selected.adminRole})` },
                  { label: '액션', value: selected.action },
                  { label: '대상', value: selected.targetName },
                  { label: '접속 IP', value: selected.ip },
                ]}
              />
            </DrawerSummaryCard>

            <DetailField label="처리 내용">
              <p className="break-keep rounded-md border border-border-subtle bg-surface-sunken px-3 py-2.5 text-body-sm text-text-secondary">
                {selected.detail}
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

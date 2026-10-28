import { DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import {
  LOGIN_RESULT_LABEL,
  LOGIN_RESULT_VARIANT,
  SAMPLE_LOGIN_RECORDS,
  type SampleLoginRecord,
} from '../account.mock'

export function LoginHistoryTable() {
  const columns: Column<SampleLoginRecord>[] = [
    {
      key: 'at',
      label: '접속 시각',
      // tabular-nums 날짜 컬럼은 right(AGENTS 4절 — align이 없으면 회귀 신호).
      align: 'right',
      render: record => <span className="tabular-nums">{record.at}</span>,
    },
    {
      key: 'device',
      label: '기기 / IP',
      render: record => <TwoLineCell primary={record.device} secondary={record.ip} />,
    },
    {
      key: 'location',
      label: '위치',
      render: record => (
        <span className="flex items-center gap-1.5 text-body-sm text-text-secondary">
          {record.location}
          {/* 낯선 접속은 색이 아니라 글자로 — 색만으로 상태를 말하지 않는다. */}
          {record.unfamiliar && (
            <StatusPill variant="warning" size="sm">
              낯선 접속
            </StatusPill>
          )}
        </span>
      ),
    },
    {
      key: 'result',
      label: '결과',
      // 보조텍스트 없는 StatusPill 단독 컬럼은 center(AGENTS 4절).
      align: 'center',
      render: record => (
        <StatusPill variant={LOGIN_RESULT_VARIANT[record.result]}>
          {LOGIN_RESULT_LABEL[record.result]}
        </StatusPill>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={SAMPLE_LOGIN_RECORDS}
      rowKey={record => record.recordId}
      emptyLabel="접속 기록이 없어요."
    />
  )
}

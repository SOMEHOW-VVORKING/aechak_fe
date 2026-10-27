import { DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import {
  NOTICE_CATEGORY_LABEL,
  NOTICE_CATEGORY_VARIANT,
  type SampleNotice,
} from '../notices.mock'

interface NoticesTableProps {
  notices: SampleNotice[]
  onOpen: (noticePublicId: string) => void
}

export function NoticesTable({ notices, onOpen }: NoticesTableProps) {
  const columns: Column<SampleNotice>[] = [
    {
      key: 'category',
      label: '분류',
      // 보조텍스트 없는 StatusPill 단독 컬럼은 center(AGENTS 4절).
      align: 'center',
      render: notice => (
        <StatusPill variant={NOTICE_CATEGORY_VARIANT[notice.category]}>
          {NOTICE_CATEGORY_LABEL[notice.category]}
        </StatusPill>
      ),
    },
    {
      key: 'title',
      label: '제목 / 보낸 곳',
      render: notice => (
        <TwoLineCell
          primary={
            <span className="flex items-center gap-1.5">
              {/* 안 읽음은 점이 아니라 글자로 — 색만으로 상태를 말하지 않는다(규약 10). */}
              {!notice.read && (
                <StatusPill variant="info" size="sm">
                  안 읽음
                </StatusPill>
              )}
              {notice.importance === 'IMPORTANT' && (
                <StatusPill variant="warning" size="sm">
                  중요
                </StatusPill>
              )}
              <span className="max-w-[360px] truncate" title={notice.title}>
                {notice.title}
              </span>
            </span>
          }
          secondary={notice.sender}
        />
      ),
    },
    {
      key: 'sentAt',
      label: '받은 날짜',
      align: 'right',
      render: notice => <span className="tabular-nums">{notice.sentAt}</span>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={notices}
      rowKey={notice => notice.noticePublicId}
      onRowClick={notice => onOpen(notice.noticePublicId)}
      emptyLabel="조건에 맞는 공지가 없어요."
    />
  )
}

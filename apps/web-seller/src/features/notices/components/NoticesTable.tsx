import { DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import { formatNoticeDateTime, noticeCategoryMeta, type NoticeSummary } from '../notices.contract'

interface NoticesTableProps {
  notices: NoticeSummary[]
  loading?: boolean
  emptyLabel?: string
  onOpen: (noticeId: string) => void
}

export function NoticesTable({ notices, loading, emptyLabel, onOpen }: NoticesTableProps) {
  const columns: Column<NoticeSummary>[] = [
    {
      key: 'category',
      label: '분류',
      // 보조텍스트 없는 StatusPill 단독 컬럼은 center(AGENTS 4절).
      align: 'center',
      render: notice => {
        // 구조분해라 표에 없는 분류가 오면 여기서 터진다 — `noticeCategoryMeta`가 그 자리를 막는다.
        const { label, variant } = noticeCategoryMeta(notice.category)
        return <StatusPill variant={variant}>{label}</StatusPill>
      },
    },
    {
      key: 'title',
      label: '제목 / 내용 미리보기',
      render: notice => (
        <TwoLineCell
          primary={
            <span className="flex items-center gap-1.5">
              {/* 서버 정렬의 첫 키가 pinned이라 고정 공지가 늘 맨 위다 — 게시 시각만 보여 주면
                  눈에 보이는 순서와 어긋난다. 색이 아니라 글자로 말한다(규약 10). */}
              {notice.pinned && (
                <StatusPill variant="warning" size="sm">
                  고정
                </StatusPill>
              )}
              <span className="max-w-[360px] truncate" title={notice.title}>
                {notice.title}
              </span>
            </span>
          }
          // 앞 100자뿐이라 전문이 아니다 — 행을 눌러 상세를 불러야 전문이 온다.
          secondary={<span className="line-clamp-1">{notice.contentPreview}</span>}
        />
      ),
    },
    {
      key: 'publishedAt',
      label: '게시 시각',
      align: 'right',
      render: notice => (
        <span className="tabular-nums">{formatNoticeDateTime(notice.publishedAt)}</span>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={notices}
      rowKey={notice => notice.noticeId}
      onRowClick={notice => onOpen(notice.noticeId)}
      loading={loading}
      emptyLabel={emptyLabel ?? '조건에 맞는 공지가 없어요.'}
    />
  )
}

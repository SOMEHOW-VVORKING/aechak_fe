import { DataTable, StatusPill, type Column } from '@aechak/design-system/web'
import { TwoLineCell } from '@/shared/components/TableCells'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
  isOverdue,
  type SampleInquiry,
} from '../inquiries.mock'

interface InquiriesTableProps {
  inquiries: SampleInquiry[]
  onOpen: (inquiryPublicId: string) => void
}

// 상품 관리·주문 관리와 같은 표 패턴(DataTable + TwoLineCell + StatusPill)을 그대로 따른다.
export function InquiriesTable({ inquiries, onOpen }: InquiriesTableProps) {
  const columns: Column<SampleInquiry>[] = [
    {
      key: 'title',
      label: '문의 / 상품',
      render: inquiry => (
        <TwoLineCell
          primary={
            <span className="flex items-center gap-1.5">
              <span className="max-w-[320px] truncate font-semibold" title={inquiry.title}>
                {inquiry.title}
              </span>
              {inquiry.secret && (
                <StatusPill variant="muted" size="sm">
                  비밀글
                </StatusPill>
              )}
            </span>
          }
          secondary={
            <>
              {inquiry.productName}
              {inquiry.orderPublicId != null && ` / ${inquiry.orderPublicId}`}
            </>
          }
        />
      ),
    },
    {
      key: 'category',
      label: '유형',
      render: inquiry => (
        <span className="text-body-sm text-text-secondary">
          {INQUIRY_CATEGORY_LABEL[inquiry.category]}
        </span>
      ),
    },
    {
      key: 'author',
      label: '작성자',
      render: inquiry => <span className="text-body-sm text-text-secondary">{inquiry.authorMasked}</span>,
    },
    {
      key: 'askedAt',
      label: '작성일',
      align: 'right',
      render: inquiry => <span className="tabular-nums">{inquiry.askedAt}</span>,
    },
    {
      key: 'status',
      label: '상태',
      render: inquiry => (
        <div>
          <StatusPill variant={INQUIRY_STATUS_VARIANT[inquiry.status]}>
            {INQUIRY_STATUS_LABEL[inquiry.status]}
          </StatusPill>
          {/* 기한 넘긴 미답변은 상태 아래 한 줄로 — pill 두 개를 겹쳐 쓰지 않는다(표 머리 정렬 규칙). */}
          {isOverdue(inquiry) && (
            <p className="mt-1.5 pl-2.5 text-caption text-warning-fg">답변 기한 지남</p>
          )}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={inquiries}
      rowKey={inquiry => inquiry.inquiryPublicId}
      onRowClick={inquiry => onOpen(inquiry.inquiryPublicId)}
      emptyLabel="조건에 맞는 문의가 없어요."
    />
  )
}

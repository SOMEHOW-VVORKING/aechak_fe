import { useEffect, useState } from 'react'
import { Button, Drawer, StatusPill, Textarea } from '@aechak/design-system/web'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
  type SampleInquiry,
} from '../inquiries.mock'

interface InquiryAnswerDrawerProps {
  inquiry: SampleInquiry | null
  onClose: () => void
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onSend: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-20 flex-none text-caption text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 text-body-sm text-text-primary">{value}</span>
    </div>
  )
}

// 행 클릭 → 상세 Drawer(web-admin 심사 화면·셀러 클레임 화면과 같은 패턴).
export function InquiryAnswerDrawer({ inquiry, onClose, onSend }: InquiryAnswerDrawerProps) {
  const [draft, setDraft] = useState('')

  // 다른 문의를 열면 앞 문의에 쓰던 초안이 남지 않게 비운다(답변 완료 건은 보낸 내용을 채운다).
  useEffect(() => {
    setDraft(inquiry?.answer?.content ?? '')
  }, [inquiry])

  if (inquiry == null) return null

  return (
    <Drawer open onClose={onClose} title="문의 상세" width="lg">
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2">
            <StatusPill variant={INQUIRY_STATUS_VARIANT[inquiry.status]}>
              {INQUIRY_STATUS_LABEL[inquiry.status]}
            </StatusPill>
            {inquiry.secret && <StatusPill variant="muted">비밀글</StatusPill>}
          </div>
          <p className="mt-2 text-subheading font-semibold text-text-primary">{inquiry.title}</p>
        </div>

        <div className="rounded-card border border-border-subtle bg-surface-sunken p-3.5">
          <Row label="문의번호" value={inquiry.inquiryPublicId} />
          <Row label="유형" value={INQUIRY_CATEGORY_LABEL[inquiry.category]} />
          <Row label="상품" value={inquiry.productName} />
          <Row label="주문번호" value={inquiry.orderPublicId ?? '주문과 연결되지 않은 문의예요'} />
          <Row label="작성자" value={inquiry.authorMasked} />
          <Row label="작성일" value={inquiry.askedAt} />
        </div>

        <div>
          <p className="mb-1.5 text-label font-medium text-text-secondary">문의 내용</p>
          <p className="whitespace-pre-wrap rounded-card border border-border-subtle p-3.5 text-body-sm text-text-primary">
            {inquiry.content}
          </p>
        </div>

        {inquiry.answer != null && (
          <p className="text-caption text-text-tertiary">
            {inquiry.answer.answeredAt}에 답변을 보냈어요. 내용을 고쳐 다시 보낼 수 있어요.
          </p>
        )}

        <Textarea
          label="답변"
          value={draft}
          maxLength={1000}
          rows={6}
          placeholder="구매자에게 보낼 답변을 적어 주세요."
          onChange={setDraft}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" size="md" disabled={draft.trim() === ''} onClick={onSend}>
            {inquiry.answer == null ? '답변 보내기' : '답변 수정'}
          </Button>
        </div>
      </div>
    </Drawer>
  )
}

import { useEffect, useState } from 'react'
import { Alert, Button, Drawer, StatusPill, Textarea } from '@aechak/design-system/web'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
  formatInquiryDateTime,
  type SellerInquirySummary,
} from '../inquiries.contract'

interface InquiryAnswerDrawerProps {
  inquiry: SellerInquirySummary | null
  onClose: () => void
  onSend: (content: string) => void
  sending: boolean
  /** 답변 전송이 실패했을 때 Drawer 안에 띄울 문구 — 닫지 않고 그 자리에서 알린다. */
  errorMessage?: string | null
  /**
   * 목록 재조회가 실패해 이 문의가 **마지막으로 본 값**일 때 true. 행은 지우지 않고(정보다)
   * 답변 전송만 잠근다 — 규약 7, `ReviewReplyList`의 `locked`와 같은 쓰임.
   */
  locked?: boolean
}

const ANSWER_MAX_LENGTH = 2000

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-20 flex-none text-caption text-text-tertiary">{label}</span>
      <span className="min-w-0 flex-1 text-body-sm text-text-primary">{value}</span>
    </div>
  )
}

// 행 클릭 → 상세 Drawer(web-admin 심사 화면·셀러 클레임 화면과 같은 패턴).
//
// **답변은 문의당 한 번뿐이다** — 서버가 두 번째 답변을 409로 거절하므로(구매자가 이미 읽은 답변이
// 조용히 바뀌지 않게 한 결정) 답변이 달린 문의에는 입력칸을 두지 않고 보낸 답변을 그대로 보여준다.
// 고칠 수 없는 자리에 "답변 수정" 버튼을 두면 누를 때마다 409를 받는 죽은 버튼이 된다.
export function InquiryAnswerDrawer({
  inquiry,
  onClose,
  onSend,
  sending,
  errorMessage,
  locked = false,
}: InquiryAnswerDrawerProps) {
  const [draft, setDraft] = useState('')

  // 다른 문의를 열면 앞 문의에 쓰던 초안이 남지 않게 비운다. **문의 객체가 아니라 id로 거른다** —
  // 열어 둔 행은 목록 재조회(창 복귀 등)마다 새 객체로 올 수 있고, 답변 기한이 지나는 순간
  // 같은 문의의 `overdue`가 false→true로 바뀐다. 객체를 의존으로 두면 그때 쓰던 답변이 사라진다.
  useEffect(() => {
    setDraft('')
  }, [inquiry?.inquiryId])

  if (inquiry == null) return null

  const answered = inquiry.answer != null

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
          <Row label="문의번호" value={inquiry.inquiryId} />
          <Row label="유형" value={INQUIRY_CATEGORY_LABEL[inquiry.category]} />
          <Row label="상품" value={inquiry.productName} />
          <Row label="작성자" value={inquiry.authorMasked} />
          <Row label="작성일" value={formatInquiryDateTime(inquiry.askedAt)} />
          <Row label="답변 기한" value={formatInquiryDateTime(inquiry.answerDueAt)} />
        </div>

        <div>
          <p className="mb-1.5 text-label font-medium text-text-secondary">문의 내용</p>
          <p className="whitespace-pre-wrap rounded-card border border-border-subtle p-3.5 text-body-sm text-text-primary">
            {inquiry.content}
          </p>
        </div>

        {inquiry.answer != null ? (
          <div>
            <p className="mb-1.5 text-label font-medium text-text-secondary">보낸 답변</p>
            <p className="whitespace-pre-wrap rounded-card border border-border-subtle p-3.5 text-body-sm text-text-primary">
              {inquiry.answer.content}
            </p>
            <p className="mt-1.5 text-caption text-text-tertiary">
              {formatInquiryDateTime(inquiry.answer.answeredAt)}에 보냈어요. 답변은 한 번만 보낼 수
              있어서 고칠 수 없어요.
            </p>
          </div>
        ) : (
          <Textarea
            label="답변"
            value={draft}
            maxLength={ANSWER_MAX_LENGTH}
            rows={6}
            placeholder="구매자에게 보낼 답변을 적어 주세요."
            onChange={setDraft}
          />
        )}

        {errorMessage != null && <Alert variant="error">{errorMessage}</Alert>}

        {/* 잠금 사유는 **Drawer 안에서** 말해야 한다 — 목록 쪽 Alert은 Drawer에 덮여 보이지 않고,
            답변을 적어 보내는 자리는 여기다. 버튼만 비활성이면 왜 눌리지 않는지 알 수 없다. */}
        {locked && !answered && (
          <Alert variant="warning">
            목록을 다시 불러오지 못해 이 문의는 마지막으로 본 내용이에요. 다시 시도해 최신 상태를
            확인한 뒤 답변을 보내 주세요.
          </Alert>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onClose}>
            닫기
          </Button>
          {!answered && (
            <Button
              variant="primary"
              size="md"
              disabled={draft.trim() === '' || sending || locked}
              onClick={() => onSend(draft.trim())}
            >
              답변 보내기
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}

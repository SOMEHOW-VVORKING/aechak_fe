import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { SubmitInquiryRequestInquiryType } from '@aechak/api'
import { BottomFixedAction, BottomSheet, Input, MobileScreen, Textarea } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { AppToast } from '@/shared/components/AppToast'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  INQUIRY_TYPE_OPTIONS,
  MAX_INQUIRY_CONTENT_LENGTH,
  isValidEmail,
  isValidInquiry,
} from '../inquiry.mock'
import { inquiryErrorMessage, useSubmitInquiry } from '../inquiry.queries'

type Feedback = { variant: 'success' | 'error'; message: string }

// 고객센터 문의(b6-st-3). 목업은 select-trigger + BottomSheet(유형)라 DS Select 대신 시트를 쓴다.
// 유형/이메일/내용을 채워 제출하면 POST /inquiries로 접수하고, 성공 시 목업(3-D)대로 success
// Toast를 띄운 뒤 설정 홈으로 돌아간다. 401은 axios 인터셉터+전역 리다이렉트가 처리하므로 화면은
// 비401 오류만 인라인(Toast)으로 안내한다.
export function InquiryScreen() {
  const submit = useSubmitInquiry()
  const [inquiryType, setInquiryType] = useState<SubmitInquiryRequestInquiryType | ''>('')
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const goBack = useSafeBack({ to: '/settings' })

  const selectedOption = INQUIRY_TYPE_OPTIONS.find(o => o.value === inquiryType)
  // 형식 오류는 무언가 입력했을 때만 — 초기 빈 값에는 안내 문구를 유지한다.
  const emailError = email.trim().length > 0 && !isValidEmail(email)
  const draft = { type: inquiryType, email, content }
  const canSubmit = isValidInquiry(draft)
  const successShown = feedback?.variant === 'success'

  const handleSubmit = () => {
    if (!isValidInquiry(draft)) return
    submit.mutate(
      { inquiryType: draft.type, replyEmail: draft.email, content: draft.content },
      {
        onSuccess: () => setFeedback({ variant: 'success', message: '문의가 접수됐어요' }),
        onError: error => setFeedback({ variant: 'error', message: inquiryErrorMessage(error) }),
      },
    )
  }

  // Toast가 닫히면(자동) — 접수 성공이었으면 설정 홈으로 돌아가고, 실패였으면 화면에 머문다.
  const handleToastClose = () => {
    const wasSuccess = feedback?.variant === 'success'
    setFeedback(null)
    if (wasSuccess) goBack()
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="고객센터 문의" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '문의 제출',
            onClick: handleSubmit,
            disabled: !canSubmit || successShown,
            loading: submit.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-[18px] p-4">
        {/* 문의 유형 (3-A · select-trigger → 3-B 시트) */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-primary">문의 유형</span>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex h-10 items-center justify-between gap-2 rounded-input border border-border bg-surface-raised px-4 text-body outline-none transition-colors focus-visible:shadow-focus-ring"
          >
            <span className={selectedOption ? 'text-text-primary' : 'text-text-placeholder'}>
              {selectedOption ? selectedOption.label : '문의 유형을 선택해주세요'}
            </span>
            <ChevronDown className="size-[18px] flex-none text-icon-muted" />
          </button>
        </div>

        {/* 답변 받을 이메일 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-primary">답변 받을 이메일</span>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="답변 받을 이메일 주소를 입력해주세요"
            state={emailError ? 'error' : 'default'}
            helperText={
              emailError
                ? '이메일 형식이 올바르지 않아요. 예: name@aechak.co.kr'
                : '입력하신 주소로만 답변을 보내드려요.'
            }
          />
        </div>

        {/* 문의 내용 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-primary">문의 내용</span>
          <Textarea
            value={content}
            onChange={setContent}
            rows={6}
            maxLength={MAX_INQUIRY_CONTENT_LENGTH}
            placeholder="상품 구매 전후 문의는 상품 상세의 1:1 채팅을 이용하면 더 빠르게 답변받을 수 있어요."
            helperText="서비스 오류/계정/결제 등 서비스 자체 문의를 남겨주세요."
          />
        </div>
      </div>

      {/* 문의 유형 선택 시트 (3-B) */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="문의 유형">
        <div className="flex flex-col">
          {INQUIRY_TYPE_OPTIONS.map((opt, i) => {
            const Icon = opt.icon
            const active = opt.value === inquiryType
            return (
              <div key={opt.value}>
                {i > 0 && <div className="h-px bg-border-subtle" />}
                <button
                  type="button"
                  onClick={() => {
                    setInquiryType(opt.value)
                    setSheetOpen(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-3.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <Icon className="size-5 flex-none text-icon" />
                  <span className="text-body text-text-primary">{opt.label}</span>
                  {active && <Check className="ml-auto size-[18px] flex-none text-brand" />}
                </button>
              </div>
            )
          })}
        </div>
      </BottomSheet>

      {/* 접수 완료/실패 피드백 (3-D) */}
      <AppToast
        open={feedback !== null}
        onClose={handleToastClose}
        message={feedback?.message ?? ''}
        variant={feedback?.variant ?? 'success'}
        aboveActionBar
        duration={2000}
      />
    </MobileScreen>
  )
}
